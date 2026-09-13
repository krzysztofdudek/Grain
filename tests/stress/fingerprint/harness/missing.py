#!/usr/bin/env python3
"""Missing-file test: when Grain names a co-change partner the landing did not touch, does the world agree?

For each landing L with named partners M (from the v2 cache), within the next W landings:
  realized(M): some later landing touches M              (the co-change was real, just late)
  fixed(M):    some later FIX landing touches M           (the omission cost a fix)
Two baselines for each partner M: (ctrl) a random code file from the directory of one of L's changed files, not
in L, existing at T; (hot) the file, anywhere in the repository and not in L or the partner list, whose number of
changes before T is closest to M's own — a popularity-matched control, so a partner that is merely a busy file
gets no credit for being busy. Reports per-repo rates and the lift of Grain's partner over both controls.
"""
import argparse, json, os, random, re, subprocess, sys
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import FIX_RE, CODE_EXT  # noqa: E402


def git(cwd, *a):
    return subprocess.run(['git', *a], cwd=cwd, capture_output=True, text=True).stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--corpus', required=True)
    ap.add_argument('--window', type=int, default=50)
    ap.add_argument('--seed', type=int, default=3)
    args = ap.parse_args()
    rnd = random.Random(args.seed)
    cdir = os.path.join(args.out, 'cache')
    total = Counter()
    print('repo\tlandings_with_partners\tpartners\trealized\tfixed\tctrl_realized\tctrl_fixed\thot_realized\thot_fixed')
    for fn in sorted(os.listdir(cdir)):
        if not fn.endswith('.json') or fn.endswith('.vocab.json'):
            continue
        name = fn[:-5]
        cache = json.load(open(os.path.join(cdir, fn)))
        repo = os.path.join(args.corpus, name)
        hist = cache['hist']  # landings after T with idx
        by_idx = {h['idx']: h for h in hist}
        files_at_t = set(git(repo, 'ls-tree', '-r', '--name-only', cache['t_sha']).splitlines())
        prior = Counter(git(repo, 'log', '--name-only', '--format=', cache['t_sha']).split())
        code_at_t = sorted(p for p in files_at_t if os.path.splitext(p)[1] in CODE_EXT)
        by_count = sorted(code_at_t, key=lambda p: prior.get(p, 0))
        counts = [prior.get(p, 0) for p in by_count]
        import bisect

        def hot_match(m, exclude):
            k = prior.get(m, 0)
            i = bisect.bisect_left(counts, k)
            for step in range(0, len(by_count)):
                for j in (i - step, i + step):
                    if 0 <= j < len(by_count) and by_count[j] not in exclude:
                        return by_count[j]
            return None
        by_dir = {}
        for p in files_at_t:
            if os.path.splitext(p)[1] in CODE_EXT:
                by_dir.setdefault(os.path.dirname(p), []).append(p)
        # file lists of later landings, cached lazily
        touched = {}

        def files_of(idx):
            if idx not in touched:
                h = by_idx[idx]
                touched[idx] = set(git(repo, 'diff', '--name-only', f"{h['sha']}~1", h['sha']).splitlines()) if idx in by_idx else set()
            return touched[idx]

        c = Counter()
        for r in cache['rows']:
            partners = r['f'].get('g_cochange_files') or []
            if not partners:
                continue
            changed = {f[0] for f in r['files']}
            partners = [p for p in partners if p not in changed]
            if not partners:
                continue
            c['landings'] += 1
            later = [i for i in range(r['idx'] + 1, r['idx'] + 1 + args.window) if i in by_idx]
            fixes = [i for i in later if FIX_RE.search(by_idx[i]['subject'])]
            # control: a code file from the directory of a changed file, not changed, existing at T
            ctrl = None
            dirs = [os.path.dirname(f[0]) for f in r['files']]
            rnd.shuffle(dirs)
            for d in dirs:
                cands = [p for p in by_dir.get(d, []) if p not in changed and p not in partners]
                if cands:
                    ctrl = rnd.choice(cands); break
            for m in partners:
                c['partners'] += 1
                if any(m in files_of(i) for i in later):
                    c['realized'] += 1
                if any(m in files_of(i) for i in fixes):
                    c['fixed'] += 1
                h = hot_match(m, changed | set(partners))
                if h:
                    c['hot_n'] += 1
                    if any(h in files_of(i) for i in later):
                        c['hot_realized'] += 1
                    if any(h in files_of(i) for i in fixes):
                        c['hot_fixed'] += 1
            if ctrl:
                c['ctrl_n'] += 1
                if any(ctrl in files_of(i) for i in later):
                    c['ctrl_realized'] += 1
                if any(ctrl in files_of(i) for i in fixes):
                    c['ctrl_fixed'] += 1
        if c['partners']:
            print(f"{name}\t{c['landings']}\t{c['partners']}\t{c['realized'] / c['partners']:.2f}\t{c['fixed'] / c['partners']:.2f}\t"
                  f"{(c['ctrl_realized'] / c['ctrl_n']) if c['ctrl_n'] else float('nan'):.2f}\t{(c['ctrl_fixed'] / c['ctrl_n']) if c['ctrl_n'] else float('nan'):.2f}\t"
                  f"{(c['hot_realized'] / c['hot_n']) if c['hot_n'] else float('nan'):.2f}\t{(c['hot_fixed'] / c['hot_n']) if c['hot_n'] else float('nan'):.2f}")
        total.update(c)
    if total['partners']:
        print(f"ALL\t{total['landings']}\t{total['partners']}\t{total['realized'] / total['partners']:.2f}\t{total['fixed'] / total['partners']:.2f}\t"
              f"{total['ctrl_realized'] / total['ctrl_n']:.2f}\t{total['ctrl_fixed'] / total['ctrl_n']:.2f}\t"
              f"{total['hot_realized'] / total['hot_n']:.2f}\t{total['hot_fixed'] / total['hot_n']:.2f}")


if __name__ == '__main__':
    main()
