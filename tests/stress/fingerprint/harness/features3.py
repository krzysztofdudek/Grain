#!/usr/bin/env python3
"""Size-controlled surprise features over a v2 cache (raw added lines stored per landing).

  c_bpb_head   bits/byte of the FIRST 1024 bytes of added code under the global dictionary at T
  c_bpb_chunk  mean bits/byte over 512-byte chunks of added code (every chunk equally long)
  c_bpb_ref    the same chunk statistic for a size-matched REFERENCE: 512-byte chunks sampled from the repository's
               own files at T (what "normal" code costs under the dictionary); stored once per repo as c_ref
  c_excess     c_bpb_chunk − c_ref  (bits per byte the change costs beyond normal code of the same length)
Writes into row['f'] in place.
"""
import argparse, json, os, random, sys
import zstandard as zstd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import CODE_EXT, TEST_RE, train_dictionary, git  # noqa: E402

CHUNK = 512


def chunks(b, size=CHUNK):
    return [b[i:i + size] for i in range(0, len(b) - size + 1, size)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--corpus', required=True)
    ap.add_argument('--repos', default='')
    args = ap.parse_args()
    cdir = os.path.join(args.out, 'cache')
    only = [r for r in args.repos.split(',') if r]
    rnd = random.Random(11)
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
        gdict, _, _ = train_dictionary(repo, t_sha, 1 << 20, 1500, 24_000_000)
        cg = zstd.ZstdCompressor(level=3, dict_data=gdict) if gdict else zstd.ZstdCompressor(level=3)
        # reference: chunks of normal code at T (held-out from dictionary training by using a different sample seed)
        paths = [p for p in git(repo, 'ls-tree', '-r', '--name-only', t_sha).splitlines()
                 if os.path.splitext(p)[1] in CODE_EXT and not TEST_RE.search(p)]
        rnd.shuffle(paths)
        ref_bits = 0; ref_bytes = 0; n_chunks = 0
        for p in paths[:400]:
            blob = git(repo, 'show', f'{t_sha}:{p}', text=False, check=False)
            for ch in chunks(blob)[:20]:
                ref_bits += 8 * len(cg.compress(ch)); ref_bytes += len(ch); n_chunks += 1
            if n_chunks >= 3000:
                break
        c_ref = ref_bits / ref_bytes if ref_bytes else 0.0
        for r in cache['rows']:
            added = b'\n'.join(v.encode('utf8') for v in (r.get('added') or {}).values())
            f = r['f']
            head = added[:1024]
            f['c_bpb_head'] = 8.0 * len(cg.compress(head)) / len(head) if len(head) >= 64 else 0.0
            chs = chunks(added)
            if chs:
                bits = sum(8 * len(cg.compress(ch)) for ch in chs)
                f['c_bpb_chunk'] = bits / (CHUNK * len(chs))
                f['c_chunks'] = len(chs)
            else:
                f['c_bpb_chunk'] = 0.0; f['c_chunks'] = 0
            f['c_ref'] = c_ref
            f['c_excess'] = (f['c_bpb_chunk'] - c_ref) if chs else 0.0
            f['c_excess_head'] = (f['c_bpb_head'] - c_ref) if len(head) >= 64 else 0.0
        with open(path, 'w') as fh:
            json.dump(cache, fh)
        print(f"{name}: c_ref {c_ref:.3f} bits/byte over {n_chunks} reference chunks; augmented {len(cache['rows'])}", file=sys.stderr)


if __name__ == '__main__':
    main()
