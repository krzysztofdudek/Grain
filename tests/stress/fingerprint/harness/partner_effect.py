#!/usr/bin/env python3
"""Does a NAMED-BUT-UNTOUCHED co-change partner mark a landing that later needs a fix?
Per repository (code-only landings): defect rate with vs without a partner Grain named, and the size-adjusted
odds ratio from a logistic regression on [log lines added, has_partner]. Pooled with per-repo standardization."""
import argparse, json, os, sys, math
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import logreg_fit  # noqa: E402
from analyze import load, relabel  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--labels', default='all')
    args = ap.parse_args()
    caches = load(args.out)
    print('repo\tn\twith_partner\trate_with\trate_without\tOR_adj(size)\tOR_raw')
    Xp, yp = [], []
    for name, cache in caches.items():
        rows = [r for r in cache['rows'] if r.get('code_bytes_added', 0) > 0]
        y = np.array([1 if relabel(r, args.labels, 0, 0) else 0 for r in rows])
        hp = np.array([1.0 if r['f'].get('g_cochange', 0) > 0 else 0.0 for r in rows])
        la = np.array([float(r['f'].get('log_la', 0.0)) for r in rows])
        if hp.sum() < 5 or y.sum() < 5:
            print(f'{name}\t{len(rows)}\t{int(hp.sum())}\t-\t-\t-\t-'); continue
        rw = y[hp == 1].mean(); ro = y[hp == 0].mean()
        X = np.vstack([(la - la.mean()) / (la.std() or 1), hp]).T
        w = logreg_fit(X, y, l2=0.1)
        raw = (rw / (1 - rw + 1e-9)) / (ro / (1 - ro + 1e-9) + 1e-9)
        print(f'{name}\t{len(rows)}\t{int(hp.sum())}\t{rw:.3f}\t{ro:.3f}\t{math.exp(w[2]):.2f}\t{raw:.2f}')
        Xp.append(X); yp.append(y)
    X = np.vstack(Xp); y = np.concatenate(yp)
    w = logreg_fit(X, y, l2=0.1)
    rw = y[X[:, 1] == 1].mean(); ro = y[X[:, 1] == 0].mean()
    print(f'POOLED\t{len(y)}\t{int(X[:, 1].sum())}\t{rw:.3f}\t{ro:.3f}\t{math.exp(w[2]):.2f}\t{(rw / (1 - rw)) / (ro / (1 - ro)):.2f}')


if __name__ == '__main__':
    main()
