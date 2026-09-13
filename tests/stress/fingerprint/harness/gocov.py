#!/usr/bin/env python3
"""Diff coverage for Go landings: how much of the code a landing adds is executed by the test suite at that landing.

For each code landing (cached rows), check the landing out in a worktree, run `go test ./... -coverprofile`, map
the profile's statement blocks back to repository paths and ask, for every added non-test line, whether it sits in
a statement block and whether that block ran.
  cov_stmts    added lines that are statement lines
  cov_covered  of those, lines a test executed
  cov_diff     cov_covered / cov_stmts   (−1 when the landing adds no statement line, or the run failed)
  cov_unobs    log1p(cov_stmts − cov_covered)   — added statements no test observes
  suite_ok     1 when `go test` exited 0 at the landing
  cov_ok       1 when a profile was produced and parsed
Results accumulate in <out>/gocov/<repo>.json after every landing (safe to stop and resume)."""
import argparse, json, os, re, subprocess, sys, time, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

HUNK_RE = re.compile(r'^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@')
PROF_RE = re.compile(r'^(.*?):(\d+)\.\d+,(\d+)\.\d+ (\d+) (\d+)$')


def sh(cmd, cwd, timeout=None, env=None):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)


def added_lines(repo, parent, sha):
    out = sh(['git', 'diff', '-U0', '-M', '--no-color', parent, sha], repo).stdout
    res = {}
    cur = None; ln = None
    for line in out.split('\n'):
        if line.startswith('diff --git'):
            m = re.match(r'diff --git a/(.*?) b/(.*)$', line)
            p = m.group(2) if m else None
            cur = p if (p and p.endswith('.go') and not p.endswith('_test.go')) else None
            ln = None
        elif cur and line.startswith('@@'):
            m = HUNK_RE.match(line)
            ln = int(m.group(1)) if m else None
        elif cur and ln is not None:
            if line.startswith('+') and not line.startswith('+++'):
                res.setdefault(cur, set()).add(ln); ln += 1
            elif line.startswith('-') or line.startswith('\\'):
                pass
            else:
                ln += 1
    return res


def modules(wt):
    mods = {}
    for root, dirs, files in os.walk(wt):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('vendor', 'testdata')]
        if 'go.mod' in files:
            try:
                for line in open(os.path.join(root, 'go.mod')):
                    if line.startswith('module '):
                        mods[line.split()[1].strip()] = os.path.relpath(root, wt)
                        break
            except OSError:
                pass
    return mods


def parse_profile(path, mods):
    blocks = {}
    for line in open(path):
        m = PROF_RE.match(line.strip())
        if not m:
            continue
        ip, sl, el, _, cnt = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4), int(m.group(5))
        best = None
        for mp in mods:
            if ip == mp or ip.startswith(mp + '/'):
                if best is None or len(mp) > len(best):
                    best = mp
        if best is None:
            continue
        rel = ip[len(best) + 1:]
        d = mods[best]
        rel = rel if d == '.' else f'{d}/{rel}'
        b = blocks.setdefault(rel, {})
        for n in range(sl, el + 1):
            b[n] = max(b.get(n, 0), 1 if cnt > 0 else 0)
    return blocks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--corpus', required=True)
    ap.add_argument('--repo', required=True)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--timeout', type=int, default=300)
    ap.add_argument('--seed', type=int, default=5)
    args = ap.parse_args()
    cache = json.load(open(os.path.join(args.out, 'cache', f'{args.repo}.json')))
    repo = os.path.abspath(os.path.join(args.corpus, args.repo))
    rows = [r for r in cache['rows'] if r.get('code_bytes_added', 0) > 0]
    if args.limit and len(rows) > args.limit:
        random.Random(args.seed).shuffle(rows); rows = sorted(rows[:args.limit], key=lambda r: r['idx'])
    odir = os.path.join(args.out, 'gocov'); os.makedirs(odir, exist_ok=True)
    opath = os.path.join(odir, f'{args.repo}.json')
    done = json.load(open(opath)) if os.path.exists(opath) else {}
    wt = os.path.abspath(os.path.join(args.out, 'covwt', args.repo))
    if not os.path.isdir(wt):
        os.makedirs(os.path.dirname(wt), exist_ok=True)
        sh(['git', 'worktree', 'add', '--detach', wt, rows[0]['sha']], repo)
    env = dict(os.environ, GOFLAGS='-mod=mod', GOTOOLCHAIN='local', CGO_ENABLED='0')
    gocache = os.path.abspath(os.path.join(args.out, 'gocache')); os.makedirs(gocache, exist_ok=True)
    env['GOCACHE'] = gocache
    t_start = time.time()
    for i, r in enumerate(rows):
        if r['sha'] in done:
            continue
        t0 = time.time()
        sh(['git', 'checkout', '-q', '-f', '--detach', r['sha']], wt); sh(['git', 'clean', '-fdq'], wt)
        rec = {'cov_ok': 0, 'suite_ok': 0, 'cov_stmts': 0, 'cov_covered': 0, 'cov_diff': -1.0, 'cov_unobs': 0.0, 'err': ''}
        prof = os.path.join(wt, 'cov.out')
        if os.path.exists(prof):
            os.remove(prof)
        if not os.path.exists(os.path.join(wt, 'go.mod')):
            rec['err'] = 'no go.mod'
        else:
            try:
                p = sh(['go', 'test', './...', '-count=1', '-covermode=set', f'-coverprofile={prof}', '-timeout', '240s'], wt, timeout=args.timeout, env=env)
                rec['suite_ok'] = 1 if p.returncode == 0 else 0
                if p.returncode != 0:
                    rec['err'] = (p.stderr or p.stdout)[-300:]
            except subprocess.TimeoutExpired:
                rec['err'] = 'timeout'
            if os.path.exists(prof) and os.path.getsize(prof) > 10:
                blocks = parse_profile(prof, modules(wt))
                added = added_lines(repo, f"{r['sha']}~1", r['sha'])
                st = cv = 0
                for path, lines in added.items():
                    b = blocks.get(path, {})
                    for n in lines:
                        if n in b:
                            st += 1; cv += b[n]
                rec.update(cov_ok=1, cov_stmts=st, cov_covered=cv, cov_diff=(cv / st) if st else -1.0)
                import math
                rec['cov_unobs'] = math.log1p(st - cv)
        done[r['sha']] = rec
        with open(opath + '.tmp', 'w') as fh:
            json.dump(done, fh)
        os.replace(opath + '.tmp', opath)
        print(f"{args.repo} {i + 1}/{len(rows)} {r['sha'][:8]} suite_ok={rec['suite_ok']} cov_ok={rec['cov_ok']} diff={rec['cov_diff']:.2f} stmts={rec['cov_stmts']} {time.time() - t0:.0f}s {rec['err'][:60]!r}", flush=True)
    print(f"{args.repo}: done {len(done)} landings in {time.time() - t_start:.0f}s", flush=True)


if __name__ == '__main__':
    main()
