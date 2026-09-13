#!/usr/bin/env python3
"""Brief-to-code coupling and change-shape novelty over a v2 cache. Everything is computed from the repository
at T (history before the cutoff) and the landing itself; no label is read.

Brief = the landing's own commit message (subject + body). Content tokens are identifiers split on case and
underscores, lowercased, stopwords and short tokens dropped.
  b_log_words   log(1 + words in the message)
  b_issue_ref   1 if the message references an issue/PR number
  b_overlap     share of the brief's content tokens that occur in the added code   (brief covered by the code)
  b_code_cov    share of the added code's distinct identifier tokens that occur in the brief (code explained by the brief)
  b_explained   share of the added code's identifier INFORMATION (unigram bits at T, count-weighted) the brief pays for
  b_paths       share of changed file name stems the brief mentions
  b_zgain       byte-level share of the added code's compressed size the brief pays for: 1 − bits(code | brief)/bits(code),
                both under the repository dictionary at T, the brief prepended in the same compression window
  b_merge_inner for a merge landing, the brief also carries the messages of the commits it brought in (what the
                author wrote before landing); b_merge_inner is that inner commit count (0 for a plain commit)
Change shape, against the commits before T (non-merge, up to --max-commits most recent):
  a_nn_jac        1 − max Jaccard(file set of the landing, file set of any earlier commit)
  a_dir_nn_jac    the same over directory sets
  a_pair_unseen   share of the landing's file pairs that never co-changed before T (0 when the landing has one file)
  a_dirext_unseen share of the landing's files whose (directory, extension) never appeared in an earlier commit
Writes into row['f'] in place (atomically).
"""
import argparse, json, math, os, re, subprocess, sys, tempfile
from collections import Counter, defaultdict
from itertools import combinations
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import zstandard as zstd
from run import CODE_EXT, TEST_RE, train_dictionary  # noqa: E402

TOK_RE = re.compile(r'[A-Za-z_][A-Za-z0-9_]*')
CAMEL_RE = re.compile(r'[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+')
STOP = set('''the a an and or of to in for on with by from at as is are was were be been this that these those it its
into via not no yes if then else when while do does did done use used using make made makes add added adds adding
remove removed removes removing update updated updates updating fix fixed fixes fixing change changed changes changing
merge merged merges merging pull request branch commit commits master main dev develop release version bump revert
reverted new old also only just some more most all any each per which who what where why how than but so too very
can could should would will may might must need needs needed now here there out up down over under again same other
because before after during between without within about above below between into onto off see refs ref close closes
closed resolve resolves resolved issue issues pr prs feat chore docs doc test tests refactor style ci build perf
support supports supported allow allows allowed ensure ensures ensured avoid avoids avoided improve improves improved
minor small simple better proper correct correctly properly'''.split())


def subtokens(word):
    out = []
    for part in word.split('_'):
        for m in CAMEL_RE.findall(part):
            t = m.lower()
            if len(t) >= 3 and not t.isdigit():
                out.append(t)
    return out


def brief_tokens(msg):
    toks = []
    for w in re.findall(r'[A-Za-z_][A-Za-z0-9_]*', msg):
        toks += [t for t in subtokens(w) if t not in STOP]
    return toks


def code_tokens(text):
    c = Counter()
    for w in TOK_RE.findall(text):
        for t in subtokens(w):
            if t not in STOP:
                c[t] += 1
    return c


def git(cwd, *a, text=True):
    p = subprocess.run(['git', *a], cwd=cwd, capture_output=True)
    return p.stdout.decode('utf8', 'replace') if text else p.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--corpus', required=True)
    ap.add_argument('--repos', default='')
    ap.add_argument('--max-commits', type=int, default=4000)
    ap.add_argument('--unigram-files', type=int, default=3000)
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
        gdict, _, _ = train_dictionary(repo, t_sha, 1 << 20, 1500, 24_000_000)
        cg = zstd.ZstdCompressor(level=3, dict_data=gdict) if gdict else zstd.ZstdCompressor(level=3)
        # unigram identifier model at T
        uni = Counter()
        paths = [p for p in git(repo, 'ls-tree', '-r', '--name-only', t_sha).splitlines()
                 if os.path.splitext(p)[1] in CODE_EXT and not TEST_RE.search(p)]
        for p in paths[:args.unigram_files]:
            uni.update(code_tokens(git(repo, 'show', f'{t_sha}:{p}')))
        N = sum(uni.values()); V = len(uni) + 1

        def bits(t):
            return -math.log2((uni.get(t, 0) + 1) / (N + V))
        # shape index over commits before T
        raw = git(repo, 'log', '--no-merges', '--name-only', f'--max-count={args.max_commits}', '--format=%x01%H', t_sha)
        commits = []
        for block in raw.split('\x01')[1:]:
            lines = [l for l in block.split('\n') if l.strip()]
            files = frozenset(lines[1:])
            if files:
                commits.append(files)
        by_file = defaultdict(list); by_dir = defaultdict(list)
        dirsets = []
        pairs = set(); dirext = set()
        for i, fs in enumerate(commits):
            ds = frozenset(os.path.dirname(p) for p in fs)
            dirsets.append(ds)
            for p in fs:
                by_file[p].append(i)
                dirext.add((os.path.dirname(p), os.path.splitext(p)[1]))
            for d in ds:
                by_dir[d].append(i)
            if len(fs) <= 30:
                pairs.update(frozenset(pr) for pr in combinations(sorted(fs), 2))
        print(f"{name}: unigram tokens {N}, shape index {len(commits)} commits, {len(pairs)} pairs", file=sys.stderr)

        def nn(target, index, sets):
            cand = set()
            for k in target:
                cand.update(index.get(k, ()))
            best = 0.0
            for i in cand:
                s = sets[i]
                j = len(target & s) / len(target | s)
                if j > best:
                    best = j
            return 1.0 - best

        for r in cache['rows']:
            f = r['f']
            msg = git(repo, 'show', '-s', '--format=%B', r['sha'])
            parents = git(repo, 'rev-list', '--parents', '-n', '1', r['sha']).split()[1:]
            inner = 0
            if len(parents) > 1:
                inner_msgs = git(repo, 'log', '--format=%B%x00', f'{parents[0]}..{r["sha"]}')
                inner = inner_msgs.count('\x00')
                msg = msg + '\n' + inner_msgs.replace('\x00', '\n')
            f['b_merge_inner'] = inner
            words = re.findall(r'\S+', msg)
            code_all = b'\n'.join(v.encode('utf8') for v in (r.get('added') or {}).values())
            brief_b = msg.encode('utf8')[:1 << 16]
            if len(code_all) >= 64 and len(brief_b) >= 16:
                bits_code = 8.0 * len(cg.compress(code_all))
                bits_cond = 8.0 * (len(cg.compress(brief_b + b'\n' + code_all)) - len(cg.compress(brief_b)))
                f['b_zgain'] = max(-1.0, min(1.0, 1.0 - bits_cond / bits_code)) if bits_code > 0 else 0.0
            else:
                f['b_zgain'] = 0.0
            B = brief_tokens(msg)
            Bset = set(B)
            C = Counter()
            for text in (r.get('added') or {}).values():
                C.update(code_tokens(text))
            Cset = set(C)
            f['b_log_words'] = math.log1p(len(words))
            f['b_issue_ref'] = 1 if re.search(r'#\d+|issues?/\d+|pull/\d+', msg) else 0
            f['b_overlap'] = (len(Bset & Cset) / len(Bset)) if Bset else 0.0
            f['b_code_cov'] = (len(Cset & Bset) / len(Cset)) if Cset else 0.0
            tot = sum(bits(t) * n for t, n in C.items())
            f['b_explained'] = (sum(bits(t) * n for t, n in C.items() if t in Bset) / tot) if tot else 0.0
            stems = set()
            for fl in r['files']:
                stems.update(subtokens(os.path.splitext(os.path.basename(fl[0]))[0]))
            stems -= STOP
            f['b_paths'] = (len(stems & Bset) / len(stems)) if stems else 0.0
            files = frozenset(fl[0] for fl in r['files'])
            dset = frozenset(os.path.dirname(p) for p in files)
            f['a_nn_jac'] = nn(files, by_file, commits) if files else 0.0
            f['a_dir_nn_jac'] = nn(dset, by_dir, dirsets) if dset else 0.0
            if len(files) >= 2:
                fl = sorted(files)[:30]
                prs = [frozenset(pr) for pr in combinations(fl, 2)]
                f['a_pair_unseen'] = sum(1 for pr in prs if pr not in pairs) / len(prs)
            else:
                f['a_pair_unseen'] = 0.0
            f['a_dirext_unseen'] = (sum(1 for p in files if (os.path.dirname(p), os.path.splitext(p)[1]) not in dirext) / len(files)) if files else 0.0
        fd, tmp = tempfile.mkstemp(dir=cdir, prefix=f'.{name}.', suffix='.tmp')
        with os.fdopen(fd, 'w') as fh:
            json.dump(cache, fh)
        os.replace(tmp, path)
        print(f"{name}: augmented {len(cache['rows'])} landings", file=sys.stderr)


if __name__ == '__main__':
    main()
