#!/usr/bin/env python3
"""Diff coverage for Python landings (same output as gocov.py): coverage.py around pytest at every code landing."""
import argparse, json, math, os, re, subprocess, sys, time, random
HUNK_RE = re.compile(r'^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@')


def sh(cmd, cwd, timeout=None, env=None):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)


def added_lines(repo, parent, sha):
    out = sh(['git', 'diff', '-U0', '-M', '--no-color', parent, sha], repo).stdout
    res = {}; cur = None; ln = None
    for line in out.split('\n'):
        if line.startswith('diff --git'):
            m = re.match(r'diff --git a/(.*?) b/(.*)$', line)
            p = m.group(2) if m else None
            cur = p if (p and p.endswith('.py') and not re.search(r'(^|/)(tests?|testing)(/|$)|test_|_test\.py|conftest', p)) else None
            ln = None
        elif cur and line.startswith('@@'):
            m = HUNK_RE.match(line); ln = int(m.group(1)) if m else None
        elif cur and ln is not None:
            if line.startswith('+') and not line.startswith('+++'):
                res.setdefault(cur, set()).add(ln); ln += 1
            elif line.startswith('-') or line.startswith('\\'):
                pass
            else:
                ln += 1
    return res


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
    t_start = time.time()
    for i, r in enumerate(rows):
        if r['sha'] in done:
            continue
        t0 = time.time()
        sh(['git', 'checkout', '-q', '-f', '--detach', r['sha']], wt); sh(['git', 'clean', '-fdq'], wt)
        rec = {'cov_ok': 0, 'suite_ok': 0, 'cov_stmts': 0, 'cov_covered': 0, 'cov_diff': -1.0, 'cov_unobs': 0.0, 'err': ''}
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', COVERAGE_FILE=os.path.join(wt, '.covdata'))
        if os.path.isdir(os.path.join(wt, 'src')):
            env['PYTHONPATH'] = os.path.join(wt, 'src')
        covjson = os.path.join(wt, 'cov.json')
        try:
            p = sh([sys.executable, '-m', 'coverage', 'run', '--source=.', '-m', 'pytest', '-q', '-p', 'no:cacheprovider'], wt, timeout=args.timeout, env=env)
            rec['suite_ok'] = 1 if p.returncode == 0 else 0
            if p.returncode != 0:
                rec['err'] = (p.stdout + p.stderr)[-300:]
            q = sh([sys.executable, '-m', 'coverage', 'json', '-o', covjson, '--ignore-errors'], wt, timeout=120, env=env)
            if q.returncode == 0 and os.path.exists(covjson):
                data = json.load(open(covjson)).get('files', {})
                added = added_lines(repo, f"{r['sha']}~1", r['sha'])
                st = cv = 0
                for path, lines in added.items():
                    f = data.get(path) or data.get('./' + path)
                    if not f:
                        continue
                    ex = set(f.get('executed_lines', [])); ms = set(f.get('missing_lines', []))
                    for n in lines:
                        if n in ex:
                            st += 1; cv += 1
                        elif n in ms:
                            st += 1
                rec.update(cov_ok=1, cov_stmts=st, cov_covered=cv, cov_diff=(cv / st) if st else -1.0, cov_unobs=math.log1p(st - cv))
        except subprocess.TimeoutExpired:
            rec['err'] = 'timeout'
        done[r['sha']] = rec
        with open(opath + '.tmp', 'w') as fh:
            json.dump(done, fh)
        os.replace(opath + '.tmp', opath)
        print(f"{args.repo} {i + 1}/{len(rows)} {r['sha'][:8]} suite_ok={rec['suite_ok']} cov_ok={rec['cov_ok']} diff={rec['cov_diff']:.2f} stmts={rec['cov_stmts']} {time.time() - t0:.0f}s {rec['err'][:60]!r}", flush=True)
    print(f"{args.repo}: done {len(done)} landings in {time.time() - t_start:.0f}s", flush=True)


if __name__ == '__main__':
    main()
