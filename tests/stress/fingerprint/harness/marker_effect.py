#!/usr/bin/env python3
"""Defect rate with vs without a binary marker feature, and its size-adjusted odds ratio, per repository and pooled
(per-repository standardized size). Code-only landings."""
import argparse, math, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import logreg_fit  # noqa: E402
from analyze import load, relabel  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--feature', required=True)
    ap.add_argument('--labels', default='all')
    ap.add_argument('--l2', type=float, default=0.1)
    ap.add_argument('--within', default='', help='restrict to landings where this feature is > 0')
    args = ap.parse_args()
    caches = load(args.out)
    print(f'marker={args.feature} labels={args.labels} within={args.within or "-"}')
    print('repo\tn\twith\trate_with\trate_without\tOR_adj(size)\tOR_raw')
    Xp, yp = [], []
    for name, cache in caches.items():
        rows = [r for r in cache['rows'] if r.get('code_bytes_added', 0) > 0 and (not args.within or float(r['f'].get(args.within, 0)) > 0)]
        y = np.array([1 if relabel(r, args.labels, 0, 0) else 0 for r in rows])
        m = np.array([1.0 if float(r['f'].get(args.feature, 0)) > 0 else 0.0 for r in rows])
        la = np.array([float(r['f'].get('log_la', 0.0)) for r in rows])
        if m.sum() < 5 or (len(m) - m.sum()) < 5 or y.sum() < 5:
            print(f'{name}\t{len(rows)}\t{int(m.sum())}\t-\t-\t-\t-'); continue
        rw = y[m == 1].mean(); ro = y[m == 0].mean()
        X = np.vstack([(la - la.mean()) / (la.std() or 1), m]).T
        w = logreg_fit(X, y, l2=args.l2)
        raw = ((rw + 1e-9) / (1 - rw + 1e-9)) / ((ro + 1e-9) / (1 - ro + 1e-9))
        print(f'{name}\t{len(rows)}\t{int(m.sum())}\t{rw:.3f}\t{ro:.3f}\t{math.exp(w[2]):.2f}\t{raw:.2f}')
        Xp.append(X); yp.append(y)
    if Xp:
        X = np.vstack(Xp); y = np.concatenate(yp)
        w = logreg_fit(X, y, l2=args.l2)
        rw = y[X[:, 1] == 1].mean(); ro = y[X[:, 1] == 0].mean()
        print(f'POOLED\t{len(y)}\t{int(X[:, 1].sum())}\t{rw:.3f}\t{ro:.3f}\t{math.exp(w[2]):.2f}\t{((rw) / (1 - rw)) / ((ro) / (1 - ro)):.2f}')


if __name__ == '__main__':
    main()
