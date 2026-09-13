#!/usr/bin/env python3
"""Evidence features: does the landing carry, strengthen or weaken its own evidence (tests)?
From the cached per-file numstat and a diff of the landing's test files:
  t_la, t_ld        test lines added / deleted
  t_share           share of the landing's added lines that are test lines (0 when nothing added)
  t_weaken          1 when the landing deletes more test lines than it adds (and deletes any)
  t_assert_added    added test lines that look like assertions (log1p)
  t_assert_removed  deleted test lines that look like assertions (log1p)
  ev_untested       1 when code lines were added and no test line was added
Writes into row['f'] in place (atomically)."""
import argparse, json, math, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import CODE_EXT, TEST_RE  # noqa: E402

ASSERT_RE = re.compile(rb'\bassert\w*\b|\bexpect\s*\(|\.should\b|\bt\.(Error|Fatal|Fail)\w*\(|\brequire\.\w+\(|\bassertThat\b|\bok\s*\(|\.to(Be|Equal|Have|Throw)\w*\(|\bassertRaises\b|\bself\.assert\w+\(|\bAssert\.\w+\(|\bexpect_\w+\(|\bShould\(|\$this->assert\w+\(|\bmust_equal\b|\bmust\b|\bexpect\(', re.I)


def git_bytes(cwd, *a):
    return subprocess.run(['git', *a], cwd=cwd, capture_output=True).stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--corpus', required=True)
    ap.add_argument('--repos', default='')
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
        for r in cache['rows']:
            f = r['f']
            t_la = t_ld = c_la = 0
            test_paths = []
            for p, la, ld in r['files']:
                if TEST_RE.search(p):
                    t_la += la; t_ld += ld; test_paths.append(p)
                elif os.path.splitext(p)[1] in CODE_EXT:
                    c_la += la
            aa = ar = 0
            if test_paths:
                out = git_bytes(repo, 'diff', '-U0', '-M', '--no-color', f"{r['sha']}~1", r['sha'], '--', *test_paths)
                for line in out.split(b'\n'):
                    if line.startswith(b'+++') or line.startswith(b'---'):
                        continue
                    if line.startswith(b'+') and ASSERT_RE.search(line):
                        aa += 1
                    elif line.startswith(b'-') and ASSERT_RE.search(line):
                        ar += 1
            f['t_la'] = t_la; f['t_ld'] = t_ld
            f['t_share'] = t_la / (t_la + c_la) if (t_la + c_la) else 0.0
            f['t_weaken'] = 1 if (t_ld > t_la and t_ld > 0) else 0
            f['t_assert_added'] = math.log1p(aa); f['t_assert_removed'] = math.log1p(ar)
            f['t_assert_net'] = aa - ar
            f['ev_untested'] = 1 if (c_la > 0 and t_la == 0) else 0
        fd, tmp = tempfile.mkstemp(dir=cdir, prefix=f'.{name}.', suffix='.tmp')
        with os.fdopen(fd, 'w') as fh:
            json.dump(cache, fh)
        os.replace(tmp, path)
        n_un = sum(1 for r in cache['rows'] if r['f']['ev_untested'])
        n_w = sum(1 for r in cache['rows'] if r['f']['t_weaken'])
        print(f"{name}: {len(cache['rows'])} landings, untested {n_un}, test-weakening {n_w}", file=sys.stderr)


if __name__ == '__main__':
    main()
