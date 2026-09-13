#!/bin/sh
# After the replication runs finish: augment the six new caches, build the 15-repository view, run every analysis.
set -u
G=$(cd "$(dirname "$0")/../../../../plugins/grain/bin" && pwd)/grain.mjs
W=.lab/workspace
while pgrep -f "harness/run.py" >/dev/null; do sleep 20; done
mkdir -p $W/exp5/cache $W/all/cache
cp $W/exp5/a/cache/* $W/exp5/b/cache/* $W/exp5/cache/
python3 harness/features3.py --out $W/exp5 --corpus corpus2 > $W/exp5/f3.out 2>&1
python3 harness/features4.py --out $W/exp5 --corpus corpus2 > $W/exp5/f4.out 2>&1
python3 harness/partners.py --out $W/exp5 --worktrees $W/exp5/a/worktrees --grain $G > $W/exp5/partners_a.out 2>&1 &
python3 harness/partners.py --out $W/exp5 --worktrees $W/exp5/b/worktrees --grain $G > $W/exp5/partners_b.out 2>&1 &
wait
for f in $W/exp2/cache/*.json $W/exp5/cache/*.json; do ln -sfn "$(pwd)/$f" $W/all/cache/; done
for d in corpus2/*/; do n=$(basename "$d"); [ -e "corpus/$n" ] || ln -sfn "../corpus2/$n" "corpus/$n"; done
python3 harness/analyze.py --out $W/exp5 --code-only --sets size,jit,size+cx,jit+chunk,size+brief,jit+brief,brief,shape --transfer --save $W/exp5/an_rep.json > $W/exp5/an_rep.out 2>&1
python3 harness/analyze.py --out $W/all --code-only --sets size,jit,size+cx,size+chunk,jit+chunk,size+brief,jit+brief,brief,size+bcc,shape,size+brief+shape --transfer --save $W/all/an_all15.json > $W/all/an_all15.out 2>&1
python3 harness/analyze.py --out $W/all --code-only --labels issue --sets size,jit,size+brief,jit+brief,size+cx --transfer --save $W/all/an_all15_issue.json > $W/all/an_all15_issue.out 2>&1
python3 harness/locate.py --out $W/exp5 --corpus corpus2 --save $W/exp5/locate.json > $W/exp5/locate.out 2>&1
python3 harness/missing.py --out $W/all --corpus corpus --window 50 > $W/all/missing50.out 2>&1
python3 harness/partner_effect.py --out $W/all > $W/all/partner_effect.out 2>&1
python3 harness/drift.py --out $W/all --window 40 > $W/all/drift40.out 2>&1
python3 harness/drift.py --out $W/all --window 30 > $W/all/drift30.out 2>&1
python3 harness/followup.py --out $W/all --corpus corpus --window 200 > $W/all/followup.out 2>&1
echo DONE > $W/all/DONE
