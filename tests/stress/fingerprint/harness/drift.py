#!/usr/bin/env python3
"""Aggregate drift: is a period's mean surprise a leading indicator of that period's fix rate?
Per repository, code-only landings after T in order, cut into windows of --window landings. Per window: mean of a
surprise feature, mean log lines added, share of landings later fixed (labels), share of fix-message landings.
Reports the within-repository Spearman correlation between the window's surprise and its fix share (raw and after
removing the window's size), and the pooled correlation over standardized windows."""
import argparse, json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze import load, relabel  # noqa: E402


def spearman(a, b):
    if len(a) < 4 or np.std(a) == 0 or np.std(b) == 0:
        return float('nan')
    ra = np.argsort(np.argsort(a)); rb = np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def partial(x, y, z):
    """Spearman of residuals of x and y on z (z: one covariate or a matrix of covariates, one column each)."""
    z = np.asarray(z)
    if z.ndim == 1:
        z = z[:, None]
    if len(x) < 5 or np.all(z.std(axis=0) == 0):
        return float('nan')
    A = np.hstack([np.ones((len(x), 1)), z])
    rx = x - A @ np.linalg.lstsq(A, x, rcond=None)[0]
    ry = y - A @ np.linalg.lstsq(A, y, rcond=None)[0]
    return spearman(rx, ry)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--window', type=int, default=40)
    ap.add_argument('--feature', default='c_excess')
    args = ap.parse_args()
    caches = load(args.out)
    print(f"feature={args.feature} window={args.window}")
    print('repo\twindows\trho(surprise,fix)\trho|size\trho|size,bigshare\trho(size,fix)\trho(fixmsg,fix)')
    P = []
    for name, cache in caches.items():
        rows = [r for r in cache['rows'] if r.get('code_bytes_added', 0) > 0]
        rows.sort(key=lambda r: r['idx'])
        W = []
        for i in range(0, len(rows) - args.window + 1, args.window):
            w = rows[i:i + args.window]
            s = np.mean([float(r['f'].get(args.feature, 0.0)) for r in w])
            la = np.mean([float(r['f'].get('log_la', 0.0)) for r in w])
            fx = np.mean([1.0 if relabel(r, 'all', 0, 0) else 0.0 for r in w])
            fm = np.mean([float(r['f'].get('is_fix_msg', 0.0)) for r in w])
            big = np.mean([1.0 if float(r['f'].get('c_chunks', 0)) > 0 else 0.0 for r in w])
            W.append((s, la, fx, fm, big))
        if len(W) < 4:
            print(f'{name}\t{len(W)}\t-'); continue
        W = np.array(W)
        r1 = spearman(W[:, 0], W[:, 2]); r2 = partial(W[:, 0], W[:, 2], W[:, 1]); r2b = partial(W[:, 0], W[:, 2], W[:, [1, 4]])
        r3 = spearman(W[:, 1], W[:, 2]); r4 = spearman(W[:, 3], W[:, 2])
        print(f'{name}\t{len(W)}\t{r1:+.2f}\t{r2:+.2f}\t{r2b:+.2f}\t{r3:+.2f}\t{r4:+.2f}')
        Z = (W - W.mean(axis=0)) / (W.std(axis=0) + 1e-9)
        P.append(Z)
    if P:
        Z = np.vstack(P)
        print(f"POOLED\t{len(Z)}\t{spearman(Z[:, 0], Z[:, 2]):+.2f}\t{partial(Z[:, 0], Z[:, 2], Z[:, 1]):+.2f}\t{partial(Z[:, 0], Z[:, 2], Z[:, [1, 4]]):+.2f}\t{spearman(Z[:, 1], Z[:, 2]):+.2f}\t{spearman(Z[:, 3], Z[:, 2]):+.2f}")


if __name__ == '__main__':
    main()
