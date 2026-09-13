#!/usr/bin/env python3
"""Offline feature augmentation over a v2 cache (raw added lines stored per landing).

Adds, per landing, using only the repository at T and the landing's own parent:
  l_bpb_local   bits/byte of added lines under a dictionary trained on the top-level directory of the file at T
  l_delta_local local minus global bits/byte (negative: the module explains the change better than the repo)
  s_bpb_self    bits/byte of added lines under a dictionary made of the file's own previous version
  s_delta_self  self minus global
  n_bpb_ngram   bits/token of added lines under a token trigram model with simple backoff trained on the repo at T
Writes the augmented cache in place (fields under row['f']).
"""
import argparse, json, math, os, re, subprocess, sys
from collections import Counter, defaultdict
import zstandard as zstd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import CODE_EXT, TEST_RE, train_dictionary  # noqa: E402

TOK_RE = re.compile(rb'[A-Za-z_][A-Za-z0-9_]*|\d+|[^\sA-Za-z0-9_]')


def git_bytes(cwd, *a):
    return subprocess.run(['git', *a], cwd=cwd, capture_output=True).stdout


def top_dir(path):
    parts = path.split('/')
    return parts[0] if len(parts) > 1 else ''


class Trigram:
    """Token trigram with stupid backoff (Brants et al.), bits per token."""
    def __init__(self):
        self.uni = Counter(); self.bi = Counter(); self.tri = Counter(); self.bi_ctx = Counter(); self.tri_ctx = Counter(); self.n = 0

    def train(self, toks):
        prev2 = prev1 = b'<s>'
        for t in toks:
            self.uni[t] += 1; self.n += 1
            self.bi[(prev1, t)] += 1; self.bi_ctx[prev1] += 1
            self.tri[(prev2, prev1, t)] += 1; self.tri_ctx[(prev2, prev1)] += 1
            prev2, prev1 = prev1, t

    def bits(self, toks):
        if not toks:
            return 0.0, 0
        V = len(self.uni) + 1
        total = 0.0
        prev2 = prev1 = b'<s>'
        for t in toks:
            c3 = self.tri.get((prev2, prev1, t), 0)
            if c3:
                p = c3 / self.tri_ctx[(prev2, prev1)]
            else:
                c2 = self.bi.get((prev1, t), 0)
                if c2:
                    p = 0.4 * c2 / self.bi_ctx[prev1]
                else:
                    p = 0.16 * (self.uni.get(t, 0) + 1) / (self.n + V)
            total += -math.log2(p)
            prev2, prev1 = prev1, t
        return total, len(toks)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--corpus', required=True)
    ap.add_argument('--repos', default='')
    ap.add_argument('--dict-size', type=int, default=1 << 18)
    ap.add_argument('--ngram-files', type=int, default=3000)
    args = ap.parse_args()
    cdir = os.path.join(args.out, 'cache')
    only = [r for r in args.repos.split(',') if r]
    for fn in sorted(os.listdir(cdir)):
        if not fn.endswith('.json') or fn.endswith('.vocab.json'):
            continue
        name = fn[:-5]
        if only and name not in only:
            continue
        path = os.path.join(cdir, fn)
        cache = json.load(open(path))
        repo = os.path.join(args.corpus, name)
        t_sha = cache['t_sha']
        # global dictionary (same recipe as run.py)
        gdict, _, _ = train_dictionary(repo, t_sha, 1 << 20, 1500, 24_000_000)
        cg = zstd.ZstdCompressor(level=3, dict_data=gdict) if gdict else None
        # per top-level directory dictionaries
        paths = [p for p in git_bytes(repo, 'ls-tree', '-r', '--name-only', t_sha).decode().splitlines()
                 if os.path.splitext(p)[1] in CODE_EXT and not TEST_RE.search(p)]
        groups = defaultdict(list)
        for p in paths:
            groups[top_dir(p)].append(p)
        ldict = {}
        for d, ps in groups.items():
            samples = []
            tot = 0
            for p in ps[:800]:
                b = git_bytes(repo, 'show', f'{t_sha}:{p}')
                if len(b) >= 64:
                    samples.append(b); tot += len(b)
                if tot > 12_000_000:
                    break
            if len(samples) >= 8:
                try:
                    ldict[d] = zstd.ZstdCompressor(level=3, dict_data=zstd.train_dictionary(args.dict_size, samples))
                except Exception:
                    pass
        # trigram model
        tg = Trigram()
        for p in paths[:args.ngram_files]:
            b = git_bytes(repo, 'show', f'{t_sha}:{p}')
            tg.train(TOK_RE.findall(b))
        print(f"{name}: global dict {'yes' if cg else 'no'}, local dicts {len(ldict)}, trigram tokens {tg.n}", file=sys.stderr)
        cr = zstd.ZstdCompressor(level=3)
        for r in cache['rows']:
            added = {p: v.encode('utf8') for p, v in (r.get('added') or {}).items()}
            f = r['f']
            tot = 0; loc = 0; glob = 0; selfb = 0; nb = 0; nt = 0; have_local = 0; have_self = 0
            for p, blob in added.items():
                if not blob:
                    continue
                n = len(blob); tot += n
                g = len(cg.compress(blob)) if cg else len(cr.compress(blob))
                glob += g
                d = top_dir(p)
                if d in ldict:
                    loc += len(ldict[d].compress(blob)); have_local += n
                else:
                    loc += g
                # self: dictionary from the file's own previous version
                prev = git_bytes(repo, 'show', f"{r['sha']}~1:{p}") if r['idx'] else b''
                if len(prev) >= 256:
                    try:
                        cs = zstd.ZstdCompressor(level=3, dict_data=zstd.ZstdCompressionDict(prev[:1 << 20]))
                        selfb += len(cs.compress(blob)); have_self += n
                    except Exception:
                        selfb += g
                else:
                    selfb += g
                bits, toks = tg.bits(TOK_RE.findall(blob))
                nb += bits; nt += toks
            f['l_bpb_local'] = 8.0 * loc / tot if tot else 0.0
            f['l_delta_local'] = (8.0 * (loc - glob) / tot) if tot else 0.0
            f['l_local_cov'] = (have_local / tot) if tot else 0.0
            f['s_bpb_self'] = 8.0 * selfb / tot if tot else 0.0
            f['s_delta_self'] = (8.0 * (selfb - glob) / tot) if tot else 0.0
            f['s_self_cov'] = (have_self / tot) if tot else 0.0
            f['n_bpb_ngram'] = (nb / nt) if nt else 0.0
            f['n_tokens'] = nt
        with open(path, 'w') as fh:
            json.dump(cache, fh)
        print(f"{name}: augmented {len(cache['rows'])} landings", file=sys.stderr)


if __name__ == '__main__':
    main()
