#!/usr/bin/env python3
"""Recover the NAMES of Grain's co-change partners for landings whose cached count is > 0.

run.py v2 parsed `cochangePartners` with the wrong pattern (the strings read
`<file>[ (deleted)] (co-changed in <sup>/<commits> commits)`), so the counts are right and the names are empty.
Re-runs `grain review --range parent..sha --json` in the frozen worktree at T for exactly those landings and
stores `g_cochange_files` (names) and `g_cochange_meta` ([file, sup, commits, dead]) in the cache, atomically.
"""
import argparse, json, os, re, subprocess, sys, tempfile, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import GRAIN_ENV  # noqa: E402

PARTNER_RE = re.compile(r'^(.+?)( \(deleted\))? \(co-changed in (\d+)/(\d+) commits\)$')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--worktrees', required=True, help='directory holding <repo>/ worktrees frozen at T')
    ap.add_argument('--grain', required=True)
    ap.add_argument('--repos', default='')
    args = ap.parse_args()
    cdir = os.path.join(args.out, 'cache')
    only = [r for r in args.repos.split(',') if r] or sorted(os.listdir(args.worktrees))
    for name in only:
        path = os.path.join(cdir, f'{name}.json')
        wt = os.path.join(args.worktrees, name)
        if not os.path.isfile(path) or not os.path.isdir(wt):
            print(f'{name}: skipped (no cache or worktree)', file=sys.stderr); continue
        cache = json.load(open(path))
        todo = [r for r in cache['rows'] if r['f'].get('g_cochange', 0) > 0]
        t0 = time.time(); n_ok = 0
        for r in todo:
            parent = r.get('parent') or f"{r['sha']}~1"
            p = subprocess.run(['node', args.grain, 'review', '--range', f"{parent}..{r['sha']}", '--json'],
                               cwd=wt, capture_output=True, text=True, env=GRAIN_ENV)
            txt = p.stdout
            if not txt.strip():
                continue
            if txt.startswith('STALE'):
                txt = txt[txt.index('{'):]
            try:
                doc = json.loads(txt)
            except json.JSONDecodeError:
                continue
            meta = []
            for s in doc.get('cochangePartners') or []:
                m = PARTNER_RE.match(s) if isinstance(s, str) else None
                if m:
                    meta.append([m.group(1), int(m.group(3)), int(m.group(4)), bool(m.group(2))])
            r['f']['g_cochange_files'] = [m[0] for m in meta]
            r['f']['g_cochange_meta'] = meta
            n_ok += 1
        fd, tmp = tempfile.mkstemp(dir=cdir, prefix=f'.{name}.', suffix='.tmp')
        with os.fdopen(fd, 'w') as fh:
            json.dump(cache, fh)
        os.replace(tmp, path)
        print(f'{name}: {n_ok}/{len(todo)} landings re-reviewed in {time.time() - t0:.0f}s', file=sys.stderr)


if __name__ == '__main__':
    main()
