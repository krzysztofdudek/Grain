#!/usr/bin/env python3
"""Locator test: inside a defective landing, does surprise point at the file the later fix blamed?

Size-free by construction: every ranking is among the files of ONE landing. For each labeled landing L with at
least two code files carrying added lines, and each labeling fix F, re-run the blame (deleted lines of F, blamed
at F's parent, mapped to their landing) to find which files of L the fix touched — the blamed set. Then rank L's
files by several scores and ask whether a blamed file comes first.
  surprise   bits/byte of the file's added lines under the repository dictionary at T (highest first)
  self       bits/byte under a dictionary made of the file's own previous version (highest first)
  size       added bytes (largest first)
  hot        how often the file changed before T (most first)
  chance     expected hit@1 = blamed / files, averaged
Reports hit@1, mean reciprocal rank of the first blamed file, and the within-landing AUC (blamed vs not),
per repository and pooled.
"""
import argparse, json, os, sys
from collections import Counter, defaultdict
import numpy as np
import zstandard as zstd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import (CODE_EXT, first_parent_history, landing_map, numstat, deleted_lines_old_numbers, blame_lines,  # noqa: E402
                 added_lines_by_file, train_dictionary, git, auc)


def blamed_files(repo, fix_sha, lmap, target):
    """paths (as of the fix's parent) whose deleted lines blame back to landing `target`."""
    parent = f'{fix_sha}~1'
    out = set()
    files = numstat(repo, parent, fix_sha)
    if len(files) > 40:
        return out
    for path, la, ld in files:
        if ld == 0 or os.path.splitext(path)[1] not in CODE_EXT:
            continue
        nums = deleted_lines_old_numbers(repo, parent, fix_sha, path)
        if not nums:
            continue
        bl = blame_lines(repo, parent, path, nums[:400])
        for n, sha in bl.items():
            if lmap.get(sha) == target:
                out.add(path)
                break
    return out


def rank_metrics(scores, blamed_mask):
    """scores: higher = ranked first. Returns hit@1, reciprocal rank of first blamed, within-landing AUC."""
    order = np.argsort(-scores, kind='stable')
    hit = 1.0 if blamed_mask[order[0]] else 0.0
    rr = 0.0
    for k, i in enumerate(order):
        if blamed_mask[i]:
            rr = 1.0 / (k + 1); break
    a = auc(blamed_mask.astype(int), scores) if 0 < blamed_mask.sum() < len(blamed_mask) else float('nan')
    return hit, rr, a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--corpus', required=True)
    ap.add_argument('--repos', default='')
    ap.add_argument('--min-bytes', type=int, default=64)
    ap.add_argument('--save', default='')
    args = ap.parse_args()
    cdir = os.path.join(args.out, 'cache')
    only = [r for r in args.repos.split(',') if r]
    methods = ['surprise', 'self', 'size', 'hot', 'inv_surprise']
    pooled = defaultdict(list); chance_all = []
    report = {}
    for fn in sorted(os.listdir(cdir)):
        if not fn.endswith('.json') or fn.endswith('.vocab.json'):
            continue
        name = fn[:-5]
        if only and name not in only:
            continue
        cache = json.load(open(os.path.join(cdir, fn)))
        repo = os.path.join(args.corpus, name)
        t_sha = cache['t_sha']
        hist = first_parent_history(repo)
        lmap = landing_map(repo, hist)
        # prior change counts at T (for `hot`)
        prior = Counter(git(repo, 'log', '--name-only', '--format=', t_sha).split())
        gdict, _, _ = train_dictionary(repo, t_sha, 1 << 20, 1500, 24_000_000)
        cg = zstd.ZstdCompressor(level=3, dict_data=gdict) if gdict else zstd.ZstdCompressor(level=3)
        per = defaultdict(list); chance = []
        n_land = 0
        for r in cache['rows']:
            if not r.get('labels') or r.get('code_bytes_added', 0) <= 0:
                continue
            added = {p: v.encode('utf8') for p, v in (r.get('added') or {}).items() if len(v.encode('utf8')) >= args.min_bytes}
            if len(added) < 2:
                continue
            blamed = set()
            for p in r['labels']:
                blamed |= blamed_files(repo, p['fix'], lmap, r['sha'])
            blamed &= set(added)
            if not blamed or len(blamed) == len(added):
                continue
            n_land += 1
            paths = sorted(added)
            mask = np.array([p in blamed for p in paths])
            sc = {}
            sc['surprise'] = np.array([8.0 * len(cg.compress(added[p])) / len(added[p]) for p in paths])
            sc['inv_surprise'] = -sc['surprise']
            sc['size'] = np.array([float(len(added[p])) for p in paths])
            sc['hot'] = np.array([float(prior.get(p, 0)) for p in paths])
            selfs = []
            for p in paths:
                prev = git(repo, 'show', f"{r['sha']}~1:{p}", text=False, check=False)
                if len(prev) >= 256:
                    cs = zstd.ZstdCompressor(level=3, dict_data=zstd.ZstdCompressionDict(prev[:1 << 20]))
                    selfs.append(8.0 * len(cs.compress(added[p])) / len(added[p]))
                else:
                    selfs.append(8.0 * len(cg.compress(added[p])) / len(added[p]))
            sc['self'] = np.array(selfs)
            chance.append(mask.mean())
            for m in methods:
                per[m].append(rank_metrics(sc[m], mask))
        rep = {'landings': n_land, 'chance_hit1': float(np.mean(chance)) if chance else float('nan')}
        for m in methods:
            if per[m]:
                arr = np.array(per[m])
                rep[m] = {'hit1': float(np.nanmean(arr[:, 0])), 'mrr': float(np.nanmean(arr[:, 1])), 'auc': float(np.nanmean(arr[:, 2]))}
                pooled[m] += per[m]
        chance_all += chance
        report[name] = rep
        line = f"{name}\t{n_land}\tchance {rep['chance_hit1']:.2f}\t" + '\t'.join(
            f"{m} hit1 {rep[m]['hit1']:.2f} mrr {rep[m]['mrr']:.2f} auc {rep[m]['auc']:.2f}" for m in methods if m in rep)
        print(line, flush=True)
    if chance_all:
        print(f"ALL\t{len(chance_all)}\tchance {np.mean(chance_all):.2f}\t" + '\t'.join(
            f"{m} hit1 {np.nanmean(np.array(pooled[m])[:, 0]):.2f} mrr {np.nanmean(np.array(pooled[m])[:, 1]):.2f} auc {np.nanmean(np.array(pooled[m])[:, 2]):.2f}"
            for m in methods if pooled[m]))
        report['ALL'] = {m: {'hit1': float(np.nanmean(np.array(pooled[m])[:, 0])), 'mrr': float(np.nanmean(np.array(pooled[m])[:, 1])),
                             'auc': float(np.nanmean(np.array(pooled[m])[:, 2]))} for m in methods if pooled[m]}
        report['ALL']['landings'] = len(chance_all); report['ALL']['chance_hit1'] = float(np.mean(chance_all))
    if args.save:
        json.dump(report, open(args.save, 'w'), indent=1)


if __name__ == '__main__':
    main()
