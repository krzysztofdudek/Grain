#!/usr/bin/env bash
# A/B trial of grain. `--setting-sources project` keeps the user's own plugins/hooks out of the worker (a global SessionStart hook hijacked a run).
#'s usefulness for a coding agent: the same task, in two fresh copies of a repository, once with
# the grain plugin loaded and once without. Records the full stream-json transcript, the resulting diff, and a
# metrics line (cost, turns, reads before the first write, grain calls) per arm.
#
#   tests/stress/agent-trial.sh <repoDir> <outDir> <model> "<task prompt>"
set -euo pipefail
REPO=$1; OUT=$2; MODEL=$3; TASK=$4
HERE=$(cd "$(dirname "$0")" && pwd)
[ -f "$HERE/../../.env" ] && . "$HERE/../../.env"                       # optional local overrides — see .env.example
PLUGIN=${GRAIN_PLUGIN_DIR:-$HERE/../../plugins/grain}                   # the plugin under test (point at a frozen snapshot for a trial)
mkdir -p "$OUT"
for ARM in with without; do
  COPY="$OUT/$ARM-repo"; rm -rf "$COPY"; cp -R "$REPO" "$COPY"
  if [ "$ARM" = with ]; then node "$PLUGIN/bin/grain.mjs" status --repo "$COPY" >/dev/null 2>&1 || true; PD=(--plugin-dir "$PLUGIN"); else rm -rf "$COPY/.grain"; PD=(); fi
  ( cd "$COPY" && git -c user.name=t -c user.email=t@x checkout -q -b trial-$ARM )
  START=$(date +%s)
  ( cd "$COPY" && claude -p "$TASK" --model "$MODEL" --setting-sources project ${PD[@]+"${PD[@]}"} ${GRAIN_TRIAL_SETTINGS:+--settings "$GRAIN_TRIAL_SETTINGS"} --output-format stream-json --verbose --max-turns 30 \
      --permission-mode acceptEdits \
      --allowedTools "Bash(node:*) Bash(ls:*) Bash(cat:*) Bash(find:*) Bash(grep:*) Bash(git diff:*) Bash(git status:*) Bash(git log:*) Read Write Edit Glob Grep" \
      > "$OUT/$ARM.jsonl" 2> "$OUT/$ARM.err" < /dev/null ) || true
  END=$(date +%s)
  ( cd "$COPY" && git add -A >/dev/null 2>&1 && git diff --cached -- . ':!.grain' > "$OUT/$ARM.diff" && git diff --cached --stat -- . ':!.grain' > "$OUT/$ARM.stat" )
  python3 - "$OUT/$ARM.jsonl" "$ARM" "$((END-START))" <<'EOF' > "$OUT/$ARM.metrics.json"
import json, sys
path, arm, secs = sys.argv[1], sys.argv[2], int(sys.argv[3])
reads_before_write = 0; writes = []; grain_calls = []; tools = {}; first_write = False; cost = None; turns = None; text_tail = ''
for line in open(path):
    try: d = json.loads(line)
    except Exception: continue
    if d.get('type') == 'assistant':
        for c in d['message'].get('content', []):
            if c.get('type') == 'tool_use':
                n = c['name']; tools[n] = tools.get(n, 0) + 1
                inp = c.get('input', {})
                if n in ('Write', 'Edit'):
                    first_write = True; writes.append(inp.get('file_path', ''))
                elif n in ('Read', 'Glob', 'Grep') and not first_write:
                    reads_before_write += 1
                elif n == 'Bash':
                    cmd = inp.get('command', '')
                    if 'grain.mjs' in cmd: grain_calls.append(cmd[cmd.index('grain.mjs') + 10:][:80])
                    elif not first_write and any(k in cmd for k in ('cat ', 'ls ', 'find ', 'grep ')): reads_before_write += 1
            elif c.get('type') == 'text': text_tail = c['text'][-400:]
    elif d.get('type') == 'result':
        cost = d.get('total_cost_usd'); turns = d.get('num_turns')
print(json.dumps({'arm': arm, 'seconds': secs, 'cost_usd': cost, 'turns': turns, 'reads_before_first_write': reads_before_write, 'tools': tools, 'grain_calls': grain_calls, 'files_written': sorted(set(writes)), 'final_text_tail': text_tail}, indent=1))
EOF
  echo "== $ARM: $(python3 -c "import json;d=json.load(open('$OUT/$ARM.metrics.json'));print('cost',d['cost_usd'],'turns',d['turns'],'reads-before-write',d['reads_before_first_write'],'grain calls',len(d['grain_calls']),'files',d['files_written'])")"
done
