#!/usr/bin/env python3
"""Delivery label: a landing that references an issue or PR number is followed, within --window landings, by
another landing referencing the SAME number (the work came back). Not a defect label — a "not done the first
time" label. Reports the rate, and the AUC of single features and small models for predicting it, within
repositories (5-fold) and across (leave-one-repository-out)."""
import argparse, json, os, re, subprocess, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import auc, cv_scores, logreg_fit  # noqa: E402
from analyze import load, matrix  # noqa: E402

REF_RE = re.compile(r'(?:#|issues/|pull/|GH-)(\d{2,6})')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--corpus', required=True)
    ap.add_argument('--window', type=int, default=200)
    ap.add_argument('--l2', type=float, default=1.0)
    args = ap.parse_args()
    caches = load(args.out)
    singles = ['log_la', 'log_nf', 'b_overlap', 'b_code_cov', 'b_explained', 'b_zgain', 'b_log_words', 'c_excess', 'z_bpb_dict']
    sets = {'size': ['log_la'], 'brief': ['b_overlap', 'b_code_cov', 'b_explained', 'b_zgain', 'b_log_words'],
            'size+brief': ['log_la', 'b_overlap', 'b_code_cov', 'b_explained', 'b_zgain', 'b_log_words'],
            'size+bcc': ['log_la', 'b_code_cov', 'b_explained', 'b_zgain']}
    print('repo\tn_ref\tfollowed\trate\t' + '\t'.join(singles) + '\t' + '\t'.join(sets))
    data = {}
    for name, cache in caches.items():
        repo = os.path.join(args.corpus, name)
        hist = cache['hist']
        refs = {}
        for h in hist:
            msg = subprocess.run(['git', 'show', '-s', '--format=%B', h['sha']], cwd=repo, capture_output=True, text=True).stdout
            refs[h['idx']] = set(REF_RE.findall(msg))
        rows = [r for r in cache['rows'] if r.get('code_bytes_added', 0) > 0 and refs.get(r['idx'])]
        y = []
        for r in rows:
            mine = refs[r['idx']]
            later = [refs.get(i, set()) for i in range(r['idx'] + 1, r['idx'] + 1 + args.window)]
            y.append(1 if any(mine & s for s in later) else 0)
        y = np.array(y)
        if len(y) < 30 or y.sum() < 8 or y.sum() > len(y) - 8:
            print(f'{name}\t{len(y)}\t{int(y.sum())}\tskipped'); continue
        data[name] = (rows, y)
        s_auc = [auc(y, np.array([float(r['f'].get(c, 0.0)) for r in rows])) for c in singles]
        m_auc = []
        for k, cols in sets.items():
            X = matrix(rows, cols)
            m_auc.append(np.mean([auc(y, cv_scores(X, y, seed=sd, l2=args.l2)) for sd in (13, 29, 47)]))
        print(f'{name}\t{len(y)}\t{int(y.sum())}\t{y.mean():.2f}\t' + '\t'.join(f'{a:.3f}' for a in s_auc) + '\t' + '\t'.join(f'{a:.3f}' for a in m_auc))
    if len(data) >= 3:
        print('transfer (leave-one-repo-out)')
        print('repo\t' + '\t'.join(sets))
        Xs = {}
        for k, cols in sets.items():
            Xs[k] = {}
            for n, (rows, y) in data.items():
                X = matrix(rows, cols); mu = X.mean(axis=0); sd = X.std(axis=0); sd[sd == 0] = 1
                Xs[k][n] = (X - mu) / sd
        means = {k: [] for k in sets}
        for held in data:
            line = []
            for k in sets:
                Xtr = np.vstack([Xs[k][n] for n in data if n != held]); ytr = np.concatenate([data[n][1] for n in data if n != held])
                w = logreg_fit(Xtr, ytr, l2=args.l2)
                z = np.hstack([np.ones((Xs[k][held].shape[0], 1)), Xs[k][held]]) @ w
                a = auc(data[held][1], z); means[k].append(a); line.append(f'{a:.3f}')
            print(f'{held}\t' + '\t'.join(line))
        print('mean\t' + '\t'.join(f'{np.mean(means[k]):.3f}' for k in sets))


if __name__ == '__main__':
    main()
