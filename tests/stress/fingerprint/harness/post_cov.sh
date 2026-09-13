#!/bin/sh
# wait for the fast Go runs, start gin, wait for everything, merge and analyse
W=.lab/workspace
until grep -q "logrus: done" $W/cov/logrus.out 2>/dev/null && grep -q "mux: done" $W/cov/mux2.out 2>/dev/null; do sleep 20; done
python3 harness/gocov.py --out $W/exp2 --corpus corpus --repo gin --limit 100 > $W/cov/gin.out 2>&1
until grep -q "chi: done" $W/cov/chi.out 2>/dev/null && grep -q "click: done" $W/cov/click.out 2>/dev/null; do sleep 20; done
python3 harness/merge_cov.py --out $W/exp2 --repos chi,gin > $W/cov/merge.out 2>&1
python3 harness/merge_cov.py --out $W/exp5 --repos mux,logrus,click >> $W/cov/merge.out 2>&1
python3 harness/analyze.py --out $W/all --repos chi,gin,mux,logrus,click --code-only --nonzero cov_stmts --sets size,jit,cov,covgap,cov1,size+cov,size+covgap,size+cov1,jit+cov --transfer --top 14 --save $W/all/an_cov.json > $W/all/an_cov.out 2>&1
python3 harness/marker_effect.py --out $W/all --feature cov_has_unobs --within cov_stmts > $W/all/marker_cov_unobs.out 2>&1
python3 harness/marker_effect.py --out $W/all --feature cov_has_unobs --within cov_stmts --labels issue >> $W/all/marker_cov_unobs.out 2>&1
echo COVDONE > $W/all/COVDONE
