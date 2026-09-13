#!/usr/bin/env python3
"""Offline analysis over cached landings: label variants, filters, feature sets, size adjustment, transfer, dispersion."""
import argparse, json, os, sys, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import FEATURE_SETS, auc, precision_at, cv_scores, bootstrap_delta, logreg_fit  # noqa: E402


def load(out_dir, repos=None):
    caches = {}
    cdir = os.path.join(out_dir, 'cache')
    for fn in sorted(os.listdir(cdir)):
        if not fn.endswith('.json') or fn.endswith('.vocab.json'):
            continue
        name = fn[:-5]
        if repos and name not in repos:
            continue
        with open(os.path.join(cdir, fn)) as fh:
            caches[name] = json.load(fh)
    return caches


def relabel(row, mode, window, min_lines):
    provs = row.get('labels')
    if provs is None:  # v1 cache: only the boolean
        return bool(row['label'])
    keep = []
    for p in provs:
        if mode == 'revert' and not p.get('revert'):
            continue
        if mode == 'issue' and not (p.get('issue') or p.get('revert')):
            continue
        if min_lines and not p.get('revert') and p.get('lines', 0) < min_lines:
            continue
        if window and p.get('idx', 0) - row['idx'] > window:
            continue
        keep.append(p)
    return bool(keep)


def residualize(xs, ys, mask=None):
    """ys minus its least-squares line on xs (label-free), over mask; 0 outside."""
    if mask is None:
        mask = np.ones(len(xs), dtype=bool)
    out = np.zeros(len(xs))
    if mask.sum() >= 10 and xs[mask].std() > 0:
        A = np.vstack([np.ones(mask.sum()), xs[mask]]).T
        coef, *_ = np.linalg.lstsq(A, ys[mask], rcond=None)
        out[mask] = ys[mask] - (coef[0] + coef[1] * xs[mask])
    return out


def derive(rows):
    """Label-free derived features per repository: size residuals of surprise measures."""
    if not rows:
        return
    xs = np.array([math.log1p(float(r['f'].get('z_bytes', 0))) for r in rows])
    for src, dst in (('z_bpb_dict', 'd_res_dict'), ('z_bpb_raw', 'd_res_raw'), ('n_bpb_ngram', 'd_res_ngram'),
                     ('c_bpb_chunk', 'd_res_chunk')):
        ys = np.array([float(r['f'].get(src, 0.0)) for r in rows])
        res = residualize(xs, ys, ys > 0)
        for r, v in zip(rows, res):
            r['f'][dst] = float(v)
    for r in rows:
        r['f']['log_bytes'] = math.log1p(float(r['f'].get('z_bytes', 0)))


def select_rows(cache, args):
    rows = []
    for r in cache['rows']:
        if args.code_only and r.get('code_bytes_added', 0) <= 0:
            continue
        if args.min_added and r.get('code_bytes_added', 0) < args.min_added:
            continue
        if args.nonzero and not float(r['f'].get(args.nonzero, 0.0)) > 0:
            continue
        rr = dict(r); rr['f'] = dict(r['f'])
        rr['label'] = relabel(r, args.labels, args.window, args.min_lines)
        rows.append(rr)
    derive(rows)
    if args.stratum:
        la = np.array([float(r['f'].get('la', 0)) for r in rows])
        med = np.median(la) if len(la) else 0
        rows = [r for r in rows if (r['f'].get('la', 0) > med) == (args.stratum == 'large')]
    return rows


EXTRA_SETS = {
    'size': ['log_la'],
    'size2': ['log_la', 'log_nf'],
    'surp': ['d_res_dict', 'd_res_raw', 'd_res_ngram', 'l_delta_local', 's_delta_self', 'n_bpb_ngram'],
    'chunk': ['c_excess', 'c_excess_head', 'd_res_chunk'],
    'cx': ['c_excess'],
    'cxh': ['c_excess_head'],
    'ngram': ['n_bpb_ngram', 'd_res_ngram'],
    'local': ['l_delta_local', 's_delta_self'],
    'novel': ['v_new_frac', 'v_rare_frac', 'v_imp_new'],
    'brief': ['b_log_words', 'b_overlap', 'b_code_cov', 'b_explained', 'b_paths', 'b_issue_ref', 'b_zgain'],
    'bcc': ['b_code_cov', 'b_explained', 'b_zgain'],
    'shape': ['a_nn_jac', 'a_dir_nn_jac', 'a_pair_unseen', 'a_dirext_unseen'],
}


def build_sets(spec):
    sets = {}
    for s in spec.split(','):
        cols = []
        for part in s.split('+'):
            cols += FEATURE_SETS.get(part) or EXTRA_SETS[part]
        sets[s] = cols
    return sets


def matrix(rows, cols):
    return np.array([[float(r['f'].get(c, 0.0)) for c in cols] for r in rows]).reshape(len(rows), len(cols))


def evaluate(rows, sets, l2, seeds):
    y = np.array([1 if r['label'] else 0 for r in rows])
    out = {'n': int(len(y)), 'positives': int(y.sum()), 'base_rate': float(y.mean()) if len(y) else 0.0}
    if y.sum() < 8 or y.sum() > len(y) - 8:
        out['skipped'] = 'too few positives or negatives'
        return out
    scores = {}
    for name, cols in sets.items():
        X = matrix(rows, cols)
        ss = [cv_scores(X, y, seed=sd, l2=l2) for sd in seeds]
        aucs = [auc(y, s) for s in ss]
        p10 = [precision_at(y, s, 0.10) for s in ss]
        scores[name] = ss[0]
        out[name] = {'auc': float(np.mean(aucs)), 'auc_sd_seeds': float(np.std(aucs)), 'p_at_10': float(np.mean(p10))}
    for ref in ('jit', 'size'):
        if ref in scores:
            for name in scores:
                if name != ref:
                    m, lo, hi = bootstrap_delta(y, scores[ref], scores[name])
                    out[name][f'delta_vs_{ref}'] = {'mean': m, 'lo': lo, 'hi': hi}
    # single-feature AUC, raw and after removing the least-squares line on log_la (label-free size adjustment)
    singles, adj, rho = {}, {}, {}
    size = np.array([float(r['f'].get('log_la', 0.0)) for r in rows])
    rs = size.argsort().argsort().astype(float)
    for c in sorted({c for cols in sets.values() for c in cols}):
        v = np.array([float(r['f'].get(c, 0.0)) for r in rows])
        singles[c] = auc(y, v)
        adj[c] = auc(y, residualize(size, v))
        rv = v.argsort().argsort().astype(float)
        rho[c] = float(np.corrcoef(rs, rv)[0, 1]) if v.std() > 0 else 0.0
    out['single_auc'] = singles; out['single_auc_adj'] = adj; out['rho_size'] = rho
    for c in ('z_bpb_dict', 'c_excess', 'v_new_frac'):
        v = np.array([float(r['f'].get(c, 0.0)) for r in rows])
        vp, vn = v[y == 1], v[y == 0]
        if len(vp) > 2 and len(vn) > 2 and vn.std() > 0:
            out.setdefault('dispersion', {})[c] = {'sd_neg': float(vn.std()), 'sd_pos': float(vp.std()),
                                                   'mean_neg': float(vn.mean()), 'mean_pos': float(vp.mean())}
    return out


def transfer(selected, sets, l2):
    """Leave-one-repository-out: train on the other repositories (features standardized per repository, label-free),
    test on the held-out one. A signal that survives this is a law across repositories, not a per-repository fit."""
    res = {}
    std = {}
    for name, rows in selected.items():
        y = np.array([1 if r['label'] else 0 for r in rows])
        if y.sum() < 8 or y.sum() > len(y) - 8:
            continue
        std[name] = (rows, y)
    for name, cols in sets.items():
        per = {}
        Xs = {n: matrix(rows, cols) for n, (rows, _) in std.items()}
        for n in Xs:
            mu = Xs[n].mean(axis=0); sd = Xs[n].std(axis=0); sd[sd == 0] = 1.0
            Xs[n] = (Xs[n] - mu) / sd
        for held in std:
            Xtr = np.vstack([Xs[n] for n in std if n != held]); ytr = np.concatenate([std[n][1] for n in std if n != held])
            w = logreg_fit(Xtr, ytr, l2=l2)
            z = np.hstack([np.ones((Xs[held].shape[0], 1)), Xs[held]]) @ w
            per[held] = auc(std[held][1], z)
        res[name] = per
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--repos', default='')
    ap.add_argument('--sets', default='jit,jit+zstd,jit+grain,jit+vocab,jit+zstd+vocab,jit+zstd+grain+vocab,zstd,grain,vocab')
    ap.add_argument('--labels', default='all', choices=['all', 'revert', 'issue'])
    ap.add_argument('--window', type=int, default=0, help='max landings between candidate and its fix (0 = any)')
    ap.add_argument('--min-lines', type=int, default=0, help='min blamed lines per labeling fix')
    ap.add_argument('--code-only', action='store_true')
    ap.add_argument('--min-added', type=int, default=0)
    ap.add_argument('--nonzero', default='', help='keep only landings where this feature is > 0')
    ap.add_argument('--stratum', default='', choices=['', 'small', 'large'], help='keep landings below/above the median lines added')
    ap.add_argument('--l2', type=float, default=1.0)
    ap.add_argument('--seeds', default='13,29,47')
    ap.add_argument('--transfer', action='store_true', help='also run leave-one-repository-out')
    ap.add_argument('--top', type=int, default=16)
    ap.add_argument('--save', default='')
    args = ap.parse_args()
    repos = [r for r in args.repos.split(',') if r] or None
    seeds = [int(s) for s in args.seeds.split(',')]
    caches = load(args.out, repos)
    available = set()
    for c in caches.values():
        for r in c['rows'][:5]:
            available |= set(r['f'].keys())
    available |= {'d_res_dict', 'd_res_raw', 'd_res_ngram', 'd_res_chunk', 'log_bytes'}
    sets = build_sets(args.sets)
    dropped = [k for k, v in sets.items() if not all(col in available for col in v)]
    if dropped:
        print(f"(sets without features in this cache, skipped: {', '.join(dropped)})")
    sets = {k: v for k, v in sets.items() if all(col in available for col in v)}
    summary = {}
    selected = {}
    for name, cache in caches.items():
        rows = select_rows(cache, args)
        selected[name] = rows
        summary[name] = evaluate(rows, sets, args.l2, seeds)
    names = [n for n in summary if 'skipped' not in summary[n]]
    print(f"labels={args.labels} window={args.window} min_lines={args.min_lines} code_only={args.code_only} min_added={args.min_added} nonzero={args.nonzero or '-'} stratum={args.stratum or '-'} l2={args.l2}")
    hdr = 'repo\tn\tpos\trate\t' + '\t'.join(sets)
    print(hdr)
    for n in summary:
        ev = summary[n]
        if 'skipped' in ev:
            print(f"{n}\t{ev['n']}\t{ev['positives']}\t{ev['base_rate']:.2f}\tskipped")
            continue
        print(f"{n}\t{ev['n']}\t{ev['positives']}\t{ev['base_rate']:.2f}\t" + '\t'.join(f"{ev[k]['auc']:.3f}" for k in sets))
    if names:
        print('mean\t\t\t\t' + '\t'.join(f"{np.mean([summary[n][k]['auc'] for n in names]):.3f}" for k in sets))
        print('p@10%\t\t\t\t' + '\t'.join(f"{np.mean([summary[n][k]['p_at_10'] for n in names]):.3f}" for k in sets))
        for ref in ('jit', 'size'):
            for k in sets:
                if k == ref or f'delta_vs_{ref}' not in summary[names[0]][k]:
                    continue
                ds = [summary[n][k][f'delta_vs_{ref}']['mean'] for n in names]
                sig = sum(1 for n in names if summary[n][k][f'delta_vs_{ref}']['lo'] > 0)
                print(f"delta {k} vs {ref}: mean {np.mean(ds):+.4f} median {np.median(ds):+.4f} wins {sum(d > 0 for d in ds)}/{len(ds)} ci>0 {sig}/{len(ds)}")
        cols = sorted({c for cols in sets.values() for c in cols})
        rank = {c: np.mean([summary[n]['single_auc'][c] for n in names]) for c in cols}
        rank_adj = {c: np.mean([summary[n]['single_auc_adj'][c] for n in names]) for c in cols}
        rho = {c: np.mean([summary[n]['rho_size'][c] for n in names]) for c in cols}
        print('feature\tAUC\tAUC|size\trho(size)')
        for c, v in sorted(rank.items(), key=lambda kv: -abs(kv[1] - 0.5))[:args.top]:
            print(f"  {c}\t{v:.3f}\t{rank_adj[c]:.3f}\t{rho[c]:+.2f}")
        disp = [(n, summary[n].get('dispersion', {})) for n in names]
        for c in ('z_bpb_dict', 'c_excess', 'v_new_frac'):
            sn = [d[c]['sd_neg'] for _, d in disp if c in d]; sp = [d[c]['sd_pos'] for _, d in disp if c in d]
            mn = [d[c]['mean_neg'] for _, d in disp if c in d]; mp = [d[c]['mean_pos'] for _, d in disp if c in d]
            if sn:
                print(f"dispersion {c}: mean_neg {np.mean(mn):.3f} mean_pos {np.mean(mp):.3f} sd_neg {np.mean(sn):.3f} sd_pos {np.mean(sp):.3f}")
    if args.transfer and names:
        tr = transfer({n: selected[n] for n in names}, sets, args.l2)
        print('transfer (leave-one-repo-out AUC)')
        print('repo\t' + '\t'.join(sets))
        for n in names:
            print(f"{n}\t" + '\t'.join(f"{tr[k][n]:.3f}" for k in sets))
        print('mean\t' + '\t'.join(f"{np.mean([tr[k][n] for n in names]):.3f}" for k in sets))
        for n in names:
            summary[n]['transfer'] = {k: tr[k][n] for k in sets}
    if args.save:
        with open(args.save, 'w') as fh:
            json.dump({'args': vars(args), 'summary': summary}, fh, indent=1)


if __name__ == '__main__':
    main()
