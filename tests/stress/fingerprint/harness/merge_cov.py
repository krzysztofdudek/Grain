#!/usr/bin/env python3
"""Merge <out>/gocov/<repo>.json (from gocov.py / pycov.py) into the cache rows as cov_* fields, atomically."""
import argparse, json, os, sys, tempfile


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--repos', required=True)
    args = ap.parse_args()
    for name in args.repos.split(','):
        cpath = os.path.join(args.out, 'cache', f'{name}.json'); gpath = os.path.join(args.out, 'gocov', f'{name}.json')
        if not (os.path.exists(cpath) and os.path.exists(gpath)):
            print(f'{name}: missing cache or coverage', file=sys.stderr); continue
        cache = json.load(open(cpath)); cov = json.load(open(gpath))
        n = 0
        for r in cache['rows']:
            rec = cov.get(r['sha'])
            f = r['f']
            if rec:
                n += 1
                f['cov_ok'] = rec['cov_ok']; f['suite_ok'] = rec['suite_ok']; f['cov_stmts'] = rec['cov_stmts']
                f['cov_covered'] = rec['cov_covered']; f['cov_diff'] = rec['cov_diff']; f['cov_unobs'] = rec['cov_unobs']
                f['cov_gap'] = (1.0 - rec['cov_diff']) if rec['cov_diff'] >= 0 else 0.0
                f['cov_has_unobs'] = 1 if (rec['cov_stmts'] - rec['cov_covered']) > 0 else 0
            else:
                for k in ('cov_ok', 'suite_ok', 'cov_stmts', 'cov_covered', 'cov_unobs', 'cov_has_unobs'):
                    f[k] = 0
                f['cov_diff'] = -1.0; f['cov_gap'] = 0.0
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(cpath), prefix=f'.{name}.', suffix='.tmp')
        with os.fdopen(fd, 'w') as fh:
            json.dump(cache, fh)
        os.replace(tmp, cpath)
        ok = sum(1 for v in cov.values() if v['cov_ok']); st = sum(1 for v in cov.values() if v['cov_stmts'] > 0); so = sum(1 for v in cov.values() if v['suite_ok'])
        print(f'{name}: merged {n} landings; profile ok {ok}, with statement lines {st}, suite green {so}', file=sys.stderr)


if __name__ == '__main__':
    main()
