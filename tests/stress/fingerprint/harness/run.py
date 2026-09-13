#!/usr/bin/env python3
"""Fingerprint harness: does a change's deviation from its repository predict later defects?

Per repository:
  1. first-parent history; cutoff T at --cutoff of the history; candidates = landings after T within --eval-frac
     of the remaining history (so every candidate has time to be fixed)
  2. labels: SZZ-lite. A fix commit is any commit after T whose message matches FIX_RE or is a git revert.
     For each fix, blame the lines it deleted at the fix's parent; the landing that introduced them is
     defect-inducing. Reverts label the reverted landing directly.
  3. features per landing: JIT baseline (size, diffusion, entropy, experience, hotness), zstd surprise of the
     added lines under a dictionary trained on the repository at T (bits under the repository's own model),
     and Grain's change-level instruments run in a worktree at T (model frozen at T).
  4. evaluation: 5-fold CV logistic regression, AUC and precision@10%, bootstrap CI on the AUC delta.

Everything expensive is cached per repository under --out/cache so modeling experiments are cheap.
"""
import argparse, json, math, os, re, subprocess, sys, time, random, hashlib
from collections import defaultdict, Counter

import numpy as np
try:
    import zstandard as zstd
except ImportError:
    zstd = None

FIX_RE = re.compile(r'\b(fix(es|ed|ing)?|bug(s|fix)?|hotfix|regression|crash(es|ed)?)\b', re.I)
REVERT_RE = re.compile(r'This reverts commit ([0-9a-f]{7,40})', re.I)
CODE_EXT = {'.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.rb', '.php', '.java', '.kt', '.cs',
            '.c', '.h', '.cpp', '.hpp', '.scala', '.groovy', '.lua', '.swift', '.m'}
TEST_RE = re.compile(r'(^|/)(tests?|spec|specs|__tests__)(/|$)|_test\.|\.test\.|\.spec\.|Test\.java$|Tests\.cs$|test_.*\.py$')


def sh(args, cwd, check=True, text=True):
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=text)
    if check and r.returncode != 0:
        raise RuntimeError(f"{' '.join(args)} failed in {cwd}: {r.stderr[:500]}")
    return r.stdout


def git(cwd, *args, check=True, text=True):
    return sh(['git', *args], cwd, check=check, text=text)


# ---------------------------------------------------------------- history

def first_parent_history(repo):
    """Landings on the main line, oldest first: [(sha, parent1 or None, author, epoch, subject)]."""
    out = git(repo, 'log', '--first-parent', '--reverse', '--format=%H%x01%P%x01%ae%x01%at%x01%s', 'HEAD')
    hist = []
    for line in out.splitlines():
        sha, parents, author, at, subject = line.split('\x01', 4)
        p = parents.split()
        hist.append({'sha': sha, 'parent': p[0] if p else None, 'merge': len(p) > 1, 'author': author,
                     'at': int(at), 'subject': subject})
    return hist


def landing_map(repo, hist):
    """inner commit sha -> landing sha (the first-parent commit that brought it to the main line)."""
    m = {}
    for h in hist:
        m[h['sha']] = h['sha']
        if h['merge'] and h['parent']:
            inner = git(repo, 'rev-list', f"{h['parent']}..{h['sha']}").split()
            for s in inner:
                m.setdefault(s, h['sha'])
    return m


# ---------------------------------------------------------------- diffs

def numstat(repo, a, b):
    out = git(repo, 'diff', '--numstat', '-M', a, b)
    files = []
    for line in out.splitlines():
        parts = line.split('\t')
        if len(parts) < 3:
            continue
        la, ld, path = parts[0], parts[1], parts[2]
        la = 0 if la == '-' else int(la)
        ld = 0 if ld == '-' else int(ld)
        files.append((path, la, ld))
    return files


def added_lines_by_file(repo, a, b, max_bytes=2_000_000):
    """{path: bytes of '+' lines} from git diff -U0, code files only, capped."""
    out = git(repo, 'diff', '-U0', '-M', '--no-color', a, b, text=False)
    res = {}
    cur = None
    total = 0
    for raw in out.split(b'\n'):
        if raw.startswith(b'diff --git'):
            cur = None
            m = re.match(rb'diff --git a/(.*?) b/(.*)$', raw)
            if m:
                path = m.group(2).decode('utf8', 'replace')
                cur = path if os.path.splitext(path)[1] in CODE_EXT else None
        elif cur and raw.startswith(b'+') and not raw.startswith(b'+++'):
            line = raw[1:]
            if line.strip():
                res.setdefault(cur, []).append(line)
                total += len(line)
                if total > max_bytes:
                    break
    return {k: b'\n'.join(v) for k, v in res.items()}


def deleted_lines_old_numbers(repo, a, b, path):
    """Old-side line numbers deleted by a..b in path, from git diff -U0."""
    out = git(repo, 'diff', '-U0', '--no-color', a, b, '--', path)
    nums = []
    old = None
    for line in out.splitlines():
        if line.startswith('@@'):
            m = re.match(r'@@ -(\d+)(?:,(\d+))? \+', line)
            old = int(m.group(1))
        elif old is not None:
            if line.startswith('-') and not line.startswith('---'):
                if line[1:].strip():
                    nums.append(old)
                old += 1
            elif line.startswith('+'):
                pass
            else:
                old += 1
    return nums


def blame_lines(repo, rev, path, lines):
    """{old line number: introducing sha} via git blame --line-porcelain at rev."""
    if not lines:
        return {}
    out = git(repo, 'blame', '-w', '--line-porcelain', rev, '--', path, check=False)
    res = {}
    cur_sha = None
    for line in out.splitlines():
        m = re.match(r'^([0-9a-f]{40}) (\d+) (\d+)(?: (\d+))?$', line)
        if m:
            cur_sha = m.group(1)
            final = int(m.group(3))
            res[final] = cur_sha
    return {n: res[n] for n in lines if n in res}


# ---------------------------------------------------------------- labels

ISSUE_RE = re.compile(r'(#\d+|\bGH-\d+|issues?/\d+)', re.I)


def label_defects(repo, hist, t_index, landing_of, log):
    """{landing sha: [provenance]} for landings (after T) that a later fix blamed. Provenance per labeling fix:
    {'fix': sha, 'idx': first-parent index of the fix, 'revert': bool, 'issue': bool, 'files': n, 'lines': n}."""
    after = hist[t_index + 1:]
    idx_of = {h['sha']: i for i, h in enumerate(hist)}
    fixes = [h for h in after if FIX_RE.search(h['subject']) or REVERT_RE.search(h['subject'])]
    labeled = defaultdict(list)
    blamed_pairs = 0
    for h in fixes:
        body = git(repo, 'log', '-1', '--format=%B', h['sha'])
        issue = bool(ISSUE_RE.search(body))
        for m in REVERT_RE.finditer(body):
            sha = m.group(1)
            full = git(repo, 'rev-parse', '--verify', '-q', sha + '^{commit}', check=False).strip()
            if full and full in landing_of:
                labeled[landing_of[full]].append({'fix': h['sha'], 'idx': idx_of[h['sha']], 'revert': True,
                                                  'issue': issue, 'files': 0, 'lines': 0})
        parent = h['parent']
        if not parent:
            continue
        files = numstat(repo, parent, h['sha'])
        if len(files) > 40:
            continue  # sweeping change, not a fix in the SZZ sense
        hits = Counter()
        for path, la, ld in files:
            if ld == 0 or os.path.splitext(path)[1] not in CODE_EXT:
                continue
            nums = deleted_lines_old_numbers(repo, parent, h['sha'], path)
            if not nums:
                continue
            bl = blame_lines(repo, parent, path, nums[:400])
            for n, sha in bl.items():
                land = landing_of.get(sha)
                if land:
                    hits[land] += 1
                    blamed_pairs += 1
        for land, cnt in hits.items():
            labeled[land].append({'fix': h['sha'], 'idx': idx_of[h['sha']], 'revert': False, 'issue': issue,
                                  'files': len(files), 'lines': cnt})
    log(f"fix commits after T: {len(fixes)}, blamed (line->landing) pairs: {blamed_pairs}, labeled landings: {len(labeled)}")
    return dict(labeled), len(fixes)


# ---------------------------------------------------------------- JIT features

def jit_features(repo, hist, idx, prior_changes, author_count):
    h = hist[idx]
    parent = h['parent']
    files = numstat(repo, parent, h['sha']) if parent else []
    la = sum(f[1] for f in files)
    ld = sum(f[2] for f in files)
    nf = len(files)
    dirs = {os.path.dirname(f[0]).split('/')[0] for f in files}
    tot = sum(f[1] + f[2] for f in files) or 1
    ent = -sum(((f[1] + f[2]) / tot) * math.log2((f[1] + f[2]) / tot) for f in files if f[1] + f[2] > 0)
    hot = sum(prior_changes.get(f[0], 0) for f in files)
    code_files = [f for f in files if os.path.splitext(f[0])[1] in CODE_EXT]
    tests = sum(1 for f in files if TEST_RE.search(f[0]))
    return {
        'la': la, 'ld': ld, 'nf': nf, 'ndir': len(dirs), 'entropy': ent, 'hot': hot,
        'exp': author_count.get(h['author'], 0), 'is_fix_msg': 1 if FIX_RE.search(h['subject']) else 0,
        'tests': tests, 'code_files': len(code_files), 'merge': 1 if h['merge'] else 0,
        'log_la': math.log1p(la), 'log_ld': math.log1p(ld), 'log_nf': math.log1p(nf), 'log_hot': math.log1p(hot),
        'log_exp': math.log1p(author_count.get(h['author'], 0)),
    }, files


# ---------------------------------------------------------------- zstd surprise

def train_dictionary(repo, t_sha, dict_size, max_files, max_bytes, seed=7):
    paths = [p for p in git(repo, 'ls-tree', '-r', '--name-only', t_sha).splitlines()
             if os.path.splitext(p)[1] in CODE_EXT and not TEST_RE.search(p)]
    rnd = random.Random(seed)
    rnd.shuffle(paths)
    samples, total = [], 0
    for p in paths:
        if len(samples) >= max_files or total >= max_bytes:
            break
        blob = git(repo, 'show', f'{t_sha}:{p}', text=False, check=False)
        if not blob or len(blob) < 64:
            continue
        samples.append(blob)
        total += len(blob)
    if len(samples) < 8:
        return None, len(samples), total
    d = zstd.train_dictionary(dict_size, samples)
    return d, len(samples), total


def zstd_features(added, dict_obj, level=3):
    if not added:
        return {'z_bytes': 0, 'z_bpb_dict': 0.0, 'z_bpb_raw': 0.0, 'z_ratio': 1.0, 'z_bits_dict': 0.0,
                'z_max_bpb_dict': 0.0, 'z_files': 0}
    cd = zstd.ZstdCompressor(level=level, dict_data=dict_obj) if dict_obj else None
    cr = zstd.ZstdCompressor(level=level)
    tot_bytes = 0
    tot_d = 0
    tot_r = 0
    max_bpb = 0.0
    for path, blob in added.items():
        n = len(blob)
        if n == 0:
            continue
        sd = len(cd.compress(blob)) if cd else None
        sr = len(cr.compress(blob))
        tot_bytes += n
        tot_r += sr
        if sd is not None:
            tot_d += sd
            max_bpb = max(max_bpb, 8.0 * sd / n)
    bpb_d = 8.0 * tot_d / tot_bytes if (cd and tot_bytes) else 0.0
    bpb_r = 8.0 * tot_r / tot_bytes if tot_bytes else 0.0
    return {'z_bytes': tot_bytes, 'z_bpb_dict': bpb_d, 'z_bpb_raw': bpb_r,
            'z_ratio': (tot_d / tot_r) if (cd and tot_r) else 1.0, 'z_bits_dict': 8.0 * tot_d,
            'z_max_bpb_dict': max_bpb, 'z_files': len(added)}


# ---------------------------------------------------------------- vocabulary and import novelty at T

IDENT_RE = re.compile(rb'[A-Za-z_][A-Za-z0-9_]{2,}')
IMPORT_RES = [
    re.compile(rb'^\s*(?:import|from)\s+([\w./@\-]+)', re.M),                       # py, js/ts, java, go, kt, scala
    re.compile(rb'require\(\s*[\'"]([^\'"]+)[\'"]\s*\)'),                            # node
    re.compile(rb'^\s*use\s+([\w:\\]+)', re.M),                                       # rust, php
    re.compile(rb'^\s*#include\s*[<"]([^>"]+)[>"]', re.M),                            # c/c++
    re.compile(rb'^\s*(?:require|require_relative)\s+[\'"]([^\'"]+)[\'"]', re.M),     # ruby
    re.compile(rb'^\s*using\s+([\w.]+)\s*;', re.M),                                   # c#
]
STOP_IDENTS = {b'the', b'and', b'for', b'not', b'this', b'that', b'with', b'from', b'return', b'import', b'function',
               b'const', b'let', b'var', b'def', b'class', b'self', b'true', b'false', b'null', b'none', b'nil'}


def imports_in(text):
    out = set()
    for rx in IMPORT_RES:
        for m in rx.finditer(text):
            out.add(m.group(1).strip().lower())
    return out


def vocab_at(repo, t_sha, max_files=4000, max_bytes=60_000_000):
    paths = [p for p in git(repo, 'ls-tree', '-r', '--name-only', t_sha).splitlines()
             if os.path.splitext(p)[1] in CODE_EXT]
    idents = Counter(); imports = set(); total = 0
    for p in paths[:max_files]:
        blob = git(repo, 'show', f'{t_sha}:{p}', text=False, check=False)
        if not blob:
            continue
        total += len(blob)
        for m in IDENT_RE.finditer(blob):
            idents[m.group(0).lower()] += 1
        imports |= imports_in(blob)
        if total > max_bytes:
            break
    return idents, imports


def novelty_features(added, idents, imports):
    """Identifier and import novelty of the added lines relative to the repository at T."""
    ids_all = 0; ids_new = 0; ids_rare = 0; new_set = set()
    imp_all = 0; imp_new = 0
    for path, blob in added.items():
        for m in IDENT_RE.finditer(blob):
            w = m.group(0).lower()
            if w in STOP_IDENTS:
                continue
            ids_all += 1
            c = idents.get(w, 0)
            if c == 0:
                ids_new += 1; new_set.add(w)
            elif c <= 2:
                ids_rare += 1
        for imp in imports_in(blob):
            imp_all += 1
            if imp not in imports:
                imp_new += 1
    return {'v_ids': ids_all, 'v_new_frac': (ids_new / ids_all) if ids_all else 0.0,
            'v_new_distinct': len(new_set), 'v_rare_frac': (ids_rare / ids_all) if ids_all else 0.0,
            'v_imp': imp_all, 'v_imp_new': imp_new, 'v_log_new_distinct': math.log1p(len(new_set))}


# ---------------------------------------------------------------- Grain features (worktree at T)

def grain_setup(repo, t_sha, worktree, grain_bin, log):
    if not os.path.isdir(worktree):
        git(repo, 'worktree', 'add', '--detach', worktree, t_sha)
    t0 = time.time()
    r = subprocess.run(['node', grain_bin, 'status', '--json'], cwd=worktree, capture_output=True, text=True)
    log(f"grain model at T built in {time.time() - t0:.1f}s (exit {r.returncode})")
    return r.returncode == 0


GRAIN_ENV = dict(os.environ, GRAIN_NO_REFRESH='1')


def grain_features(worktree, grain_bin, parent, sha, changed_paths):
    """Change-level instruments from `grain review --range parent..sha --json` (grain-check/1) plus the
    birth-obligation table for files the landing created. Model frozen at the worktree's HEAD (T)."""
    feat = {'g_ok': 0, 'g_dev': 0, 'g_files_dev': 0, 'g_bits': 0.0, 'g_governed': 0, 'g_files_governed': 0,
            'g_pre': 0, 'g_cochange': 0, 'g_kin': 0, 'g_kin_bits': 0.0, 'g_placement': 0,
            'g_obl_rules': 0, 'g_obl_unmet': 0, 'g_obl_bits_unmet': 0.0, 'g_new_files': 0,
            'g_dev_rate': 0.0, 'g_silent': 1}
    r = subprocess.run(['node', grain_bin, 'review', '--range', f'{parent}..{sha}', '--json'],
                       cwd=worktree, capture_output=True, text=True, env=GRAIN_ENV)
    err = ''
    if r.returncode != 0 or not r.stdout.strip():
        err = (r.stderr or 'empty')[:200]
    else:
        txt = r.stdout
        if txt.startswith('STALE'):
            txt = txt[txt.index('{'):]
        try:
            doc = json.loads(txt)
            feat['g_ok'] = 1
        except json.JSONDecodeError:
            doc = None
            err = 'json'
        if doc:
            for fnd in doc.get('findings', []) or []:
                gov = fnd.get('governed') or []
                dev = fnd.get('deviationsInChange') or []
                pre = fnd.get('deviationsPreExisting') or []
                feat['g_governed'] += len(gov)
                if gov:
                    feat['g_files_governed'] += 1
                feat['g_dev'] += len(dev)
                feat['g_pre'] += len(pre)
                if dev:
                    feat['g_files_dev'] += 1
                for d in dev:
                    gb = d.get('gapBits')
                    if isinstance(gb, (int, float)):
                        feat['g_bits'] += float(gb)
                if fnd.get('placement'):
                    feat['g_placement'] += 1
            partners = doc.get('cochangePartners') or []
            feat['g_cochange'] = len(partners)
            feat['g_cochange_files'] = [m.group(1) for s in partners if isinstance(s, str)
                                        for m in [re.search(r'co-change:\s*(\S+)', s)] if m]
            kin = (doc.get('missing') or {}).get('kin') or []
            feat['g_kin'] = len(kin)
            feat['g_kin_bits'] = float(sum(k.get('bits', 0) or 0 for k in kin if isinstance(k, dict)))
    # birth obligations for created files: what a new file under this path historically comes with
    changed = set(changed_paths)
    for p in changed_paths:
        if os.path.splitext(p)[1] not in CODE_EXT:
            continue
        exists_before = subprocess.run(['git', 'cat-file', '-e', f'{parent}:{p}'], cwd=worktree,
                                       capture_output=True).returncode == 0
        if exists_before:
            continue
        feat['g_new_files'] += 1
        ro = subprocess.run(['node', grain_bin, 'obligation', p, '--json'], cwd=worktree,
                            capture_output=True, text=True, env=GRAIN_ENV)
        if ro.returncode != 0 or not ro.stdout.strip():
            continue
        try:
            txt = ro.stdout
            if txt.startswith('STALE'):
                txt = txt[txt.index('{'):]
            od = json.loads(txt)
        except json.JSONDecodeError:
            continue
        for rule in od.get('rules') or []:
            feat['g_obl_rules'] += 1
            if rule.get('file') not in changed:
                feat['g_obl_unmet'] += 1
                feat['g_obl_bits_unmet'] += float(rule.get('bits', 0) or 0)
    feat['g_dev_rate'] = feat['g_dev'] / feat['g_governed'] if feat['g_governed'] else 0.0
    feat['g_silent'] = 0 if (feat['g_dev'] or feat['g_cochange'] or feat['g_kin'] or feat['g_obl_unmet'] or feat['g_placement']) else 1
    return feat, err


# ---------------------------------------------------------------- modeling

def auc(y, s):
    y = np.asarray(y); s = np.asarray(s, dtype=float)
    pos = s[y == 1]; neg = s[y == 0]
    if len(pos) == 0 or len(neg) == 0:
        return float('nan')
    # rank-based with ties
    order = np.argsort(s)
    ranks = np.empty(len(s), dtype=float)
    sorted_s = s[order]
    i = 0
    while i < len(s):
        j = i
        while j + 1 < len(s) and sorted_s[j + 1] == sorted_s[i]:
            j += 1
        ranks[order[i:j + 1]] = (i + j) / 2.0 + 1.0
        i = j + 1
    rs = ranks[y == 1].sum()
    n1, n0 = len(pos), len(neg)
    return float((rs - n1 * (n1 + 1) / 2.0) / (n1 * n0))


def precision_at(y, s, frac=0.10):
    y = np.asarray(y); s = np.asarray(s, dtype=float)
    k = max(1, int(round(len(y) * frac)))
    top = np.argsort(-s)[:k]
    return float(y[top].mean())


def logreg_fit(X, y, l2=1.0, iters=50):
    n, d = X.shape
    Xb = np.hstack([np.ones((n, 1)), X])
    w = np.zeros(d + 1)
    reg = np.full(d + 1, l2); reg[0] = 0.0
    for _ in range(iters):
        z = Xb @ w
        p = 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))
        g = Xb.T @ (p - y) + reg * w
        W = p * (1 - p)
        H = (Xb * W[:, None]).T @ Xb + np.diag(reg)
        try:
            step = np.linalg.solve(H, g)
        except np.linalg.LinAlgError:
            step = np.linalg.lstsq(H, g, rcond=None)[0]
        w -= step
        if np.abs(step).max() < 1e-8:
            break
    return w


def cv_scores(X, y, folds=5, seed=13, l2=1.0):
    n = len(y)
    rnd = np.random.RandomState(seed)
    idx_pos = np.where(y == 1)[0]; idx_neg = np.where(y == 0)[0]
    rnd.shuffle(idx_pos); rnd.shuffle(idx_neg)
    fold_of = np.zeros(n, dtype=int)
    for k, i in enumerate(idx_pos): fold_of[i] = k % folds
    for k, i in enumerate(idx_neg): fold_of[i] = k % folds
    scores = np.zeros(n)
    for f in range(folds):
        tr = fold_of != f; te = fold_of == f
        mu = X[tr].mean(axis=0); sd = X[tr].std(axis=0); sd[sd == 0] = 1.0
        Xtr = (X[tr] - mu) / sd; Xte = (X[te] - mu) / sd
        if y[tr].sum() == 0 or y[tr].sum() == tr.sum():
            scores[te] = 0.0
            continue
        w = logreg_fit(Xtr, y[tr], l2=l2)
        z = np.hstack([np.ones((Xte.shape[0], 1)), Xte]) @ w
        scores[te] = z
    return scores


def bootstrap_delta(y, s_a, s_b, n_boot=1000, seed=5):
    rnd = np.random.RandomState(seed)
    y = np.asarray(y); n = len(y)
    deltas = []
    for _ in range(n_boot):
        idx = rnd.randint(0, n, n)
        if y[idx].sum() == 0 or y[idx].sum() == n:
            continue
        deltas.append(auc(y[idx], s_b[idx]) - auc(y[idx], s_a[idx]))
    deltas = np.array(deltas)
    return float(np.mean(deltas)), float(np.percentile(deltas, 2.5)), float(np.percentile(deltas, 97.5))


FEATURE_SETS = {
    'jit': ['log_la', 'log_ld', 'log_nf', 'ndir', 'entropy', 'log_hot', 'log_exp', 'is_fix_msg', 'tests', 'merge'],
    'zstd': ['z_bpb_dict', 'z_bpb_raw', 'z_ratio', 'z_max_bpb_dict'],
    'grain': ['g_dev', 'g_files_dev', 'g_bits', 'g_dev_rate', 'g_governed', 'g_pre', 'g_cochange', 'g_kin',
              'g_kin_bits', 'g_placement', 'g_obl_unmet', 'g_obl_bits_unmet', 'g_new_files', 'g_silent'],
    'vocab': ['v_new_frac', 'v_log_new_distinct', 'v_rare_frac', 'v_imp_new'],
}


def evaluate(rows, sets, l2=1.0):
    y = np.array([1 if r['label'] else 0 for r in rows])
    out = {'n': int(len(y)), 'positives': int(y.sum())}
    if y.sum() < 5 or y.sum() > len(y) - 5:
        out['skipped'] = 'too few positives or negatives'
        return out
    scores = {}
    for name, cols in sets.items():
        X = np.array([[float(r['f'].get(c, 0.0)) for c in cols] for r in rows])
        s = cv_scores(X, y, l2=l2)
        scores[name] = s
        out[name] = {'auc': auc(y, s), 'p_at_10': precision_at(y, s, 0.10), 'p_at_20': precision_at(y, s, 0.20)}
    # single-feature AUCs
    singles = {}
    allcols = sorted({c for cols in sets.values() for c in cols})
    for c in allcols:
        v = np.array([float(r['f'].get(c, 0.0)) for r in rows])
        singles[c] = auc(y, v)
    out['single_auc'] = singles
    out['base_rate'] = float(y.mean())
    if 'jit' in scores:
        for name in scores:
            if name == 'jit':
                continue
            m, lo, hi = bootstrap_delta(y, scores['jit'], scores[name])
            out[name]['delta_vs_jit'] = {'mean': m, 'lo': lo, 'hi': hi}
    return out


# ---------------------------------------------------------------- main per repo

def process_repo(name, corpus, args, log):
    repo = os.path.join(corpus, name)
    cache_path = os.path.join(args.out, 'cache', f'{name}.json')
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    if os.path.exists(cache_path) and not args.recompute:
        with open(cache_path) as fh:
            return json.load(fh)
    t0 = time.time()
    hist = first_parent_history(repo)
    n = len(hist)
    ti = int(n * args.cutoff)
    t_sha = hist[ti]['sha']
    n_after = n - ti - 1
    n_eval = int(n_after * args.eval_frac)
    cand_idx = list(range(ti + 1, ti + 1 + n_eval))
    if args.max_candidates and len(cand_idx) > args.max_candidates:
        cand_idx = cand_idx[:args.max_candidates]
    log(f"{name}: {n} landings, T={t_sha[:10]} at index {ti}, candidates {len(cand_idx)} of {n_after} after T")
    landing_of = landing_map(repo, hist)
    labeled, n_fix = label_defects(repo, hist, ti, landing_of, log)

    # prior changes per file and author counts, built incrementally along the first-parent line
    prior = Counter(); author_count = Counter()
    per_idx_prior = {}
    files_cache = {}
    for i, h in enumerate(hist):
        if i in cand_idx:
            per_idx_prior[i] = (dict(prior), dict(author_count))
        if h['parent']:
            fl = numstat(repo, h['parent'], h['sha']) if i >= ti - 400 else None
            if fl is not None:
                files_cache[i] = fl
                for p, la, ld in fl:
                    prior[p] += 1
        author_count[h['author']] += 1
    # dictionary at T
    dict_obj = None
    if zstd and 'zstd' in args.features:
        dict_obj, nfiles, nbytes = train_dictionary(repo, t_sha, args.dict_size, args.dict_files, args.dict_bytes)
        log(f"zstd dictionary: {args.dict_size} bytes from {nfiles} files / {nbytes} bytes")
    # vocabulary and imports at T
    idents, imports = Counter(), set()
    if 'vocab' in args.features:
        idents, imports = vocab_at(repo, t_sha)
        log(f"vocabulary at T: {len(idents)} identifiers, {len(imports)} imports")
        with open(os.path.join(args.out, 'cache', f'{name}.vocab.json'), 'w') as fh:
            json.dump({'idents': {k.decode('utf8', 'replace'): v for k, v in idents.items()},
                       'imports': sorted(i.decode('utf8', 'replace') for i in imports)}, fh)
    # grain worktree
    worktree = os.path.join(args.out, 'worktrees', name)
    grain_ok = False
    if 'grain' in args.features:
        os.makedirs(os.path.dirname(worktree), exist_ok=True)
        grain_ok = grain_setup(repo, t_sha, worktree, args.grain, log)
    rows = []
    g_err = Counter()
    for k, i in enumerate(cand_idx):
        h = hist[i]
        if not h['parent']:
            continue
        pr, ac = per_idx_prior[i]
        f, files = jit_features(repo, hist, i, pr, ac)
        added = added_lines_by_file(repo, h['parent'], h['sha'])
        if 'zstd' in args.features and zstd:
            f.update(zstd_features(added, dict_obj))
        if 'vocab' in args.features:
            f.update(novelty_features(added, idents, imports))
        if grain_ok:
            gf, err = grain_features(worktree, args.grain, h['parent'], h['sha'], [f[0] for f in files])
            f.update(gf)
            if err:
                g_err[err[:60]] += 1
        raw_added = {p: v[:65536].decode('utf8', 'replace') for p, v in added.items()}
        rows.append({'sha': h['sha'], 'idx': i, 'label': h['sha'] in labeled, 'labels': labeled.get(h['sha'], []),
                     'subject': h['subject'][:80], 'f': f, 'files': [list(x) for x in files], 'added': raw_added,
                     'code_bytes_added': sum(len(v) for v in added.values())})
        if (k + 1) % 100 == 0:
            log(f"  {k + 1}/{len(cand_idx)} landings featurized ({time.time() - t0:.0f}s)")
    if g_err:
        log(f"grain errors: {dict(g_err)}")
    res = {'repo': name, 'landings': n, 't_index': ti, 't_sha': t_sha, 'candidates': len(rows), 'fixes_after_t': n_fix,
           'labeled': int(sum(1 for r in rows if r['label'])), 'seconds': round(time.time() - t0, 1),
           'hist': [{'sha': h['sha'], 'idx': i, 'subject': h['subject'][:80], 'at': h['at']} for i, h in enumerate(hist) if i > ti],
           'rows': rows}
    with open(cache_path, 'w') as fh:
        json.dump(res, fh)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--corpus', required=True)
    ap.add_argument('--repos', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--grain', default=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', 'plugins', 'grain', 'bin', 'grain.mjs')))
    ap.add_argument('--cutoff', type=float, default=0.7)
    ap.add_argument('--eval-frac', type=float, default=0.8)
    ap.add_argument('--max-candidates', type=int, default=0)
    ap.add_argument('--features', default='jit,zstd,grain')
    ap.add_argument('--dict-size', type=int, default=1 << 20)
    ap.add_argument('--dict-files', type=int, default=1500)
    ap.add_argument('--dict-bytes', type=int, default=24_000_000)
    ap.add_argument('--l2', type=float, default=1.0)
    ap.add_argument('--code-only', action='store_true', help='evaluate only landings that add code lines')
    ap.add_argument('--recompute', action='store_true')
    ap.add_argument('--sets', default='jit,jit+zstd,jit+grain,jit+zstd+grain,zstd,grain')
    args = ap.parse_args()
    args.features = set(args.features.split(','))
    args.out = os.path.abspath(args.out)
    args.corpus = os.path.abspath(args.corpus)
    args.grain = os.path.abspath(args.grain)
    os.makedirs(args.out, exist_ok=True)
    logf = open(os.path.join(args.out, 'run.log'), 'a')

    def log(s):
        print(s, file=sys.stderr, flush=True)
        logf.write(s + '\n'); logf.flush()

    sets = {}
    for spec in args.sets.split(','):
        cols = []
        for part in spec.split('+'):
            cols += FEATURE_SETS[part]
        sets[spec] = cols
    summary = {}
    for name in args.repos.split(','):
        res = process_repo(name, args.corpus, args, log)
        rows = res['rows']
        if args.code_only:
            rows = [r for r in rows if r['code_bytes_added'] > 0]
        ev = evaluate(rows, sets, l2=args.l2)
        ev.update({'landings': res['landings'], 'candidates': res['candidates'], 'fixes_after_t': res['fixes_after_t']})
        summary[name] = ev
        line = f"{name}: n={ev['n']} pos={ev['positives']} " + ' '.join(
            f"{k}={ev[k]['auc']:.3f}" for k in sets if k in ev and isinstance(ev[k], dict))
        log(line)
    with open(os.path.join(args.out, 'summary.json'), 'w') as fh:
        json.dump(summary, fh, indent=1)
    # compact table
    names = list(summary)
    print('\nrepo\tn\tpos\t' + '\t'.join(sets))
    for nm in names:
        ev = summary[nm]
        if 'skipped' in ev:
            print(f"{nm}\t{ev['n']}\t{ev['positives']}\tskipped: {ev['skipped']}")
            continue
        print(f"{nm}\t{ev['n']}\t{ev['positives']}\t" + '\t'.join(f"{ev[k]['auc']:.3f}" for k in sets))
    # mean deltas
    for k in sets:
        if k == 'jit':
            continue
        ds = [summary[nm][k]['delta_vs_jit']['mean'] for nm in names if 'skipped' not in summary[nm] and 'delta_vs_jit' in summary[nm][k]]
        if ds:
            wins = sum(1 for d in ds if d > 0)
            print(f"delta {k} vs jit: mean {np.mean(ds):+.4f}, wins {wins}/{len(ds)}")


if __name__ == '__main__':
    main()
