# Mining report — plugin plan, increments 1 / 1b / 2, roots docs

Source: Yggdrasil, branch `claude/document-review-13yoty` — `planning/plugin/2026-08-17-plugin-marketplace-plan.md`,
`planning/plugin/sp-plans/2026-08-17-increment-1-context-disclosure.md`, `…/2026-08-18-increment-1b-cleanup.md`,
`…/2026-08-18-increment-2-roots-core.md`, `planning/roots/2026-08-18-increment-2-grounding.md`, `planning/roots/README.md`,
`docs/roots.md`. Citations are `file › heading`. Scoping note: **none of these documents record an executed plugin
increment.** The plugin packages (P1–P4) exist only as plan text; increments 1, 1b, 2 are the `yg context` layering and
the roots mining core. Part 4 is "what the plan prescribed for packaging/testing", not "what was run".

---

## Part 1 — Plugin/marketplace plan decisions that carry to a standalone plugin

### 1.1 Plugin shape

- **One shared core, thin per-host adapters, no "grades of integration"** (`› PART B` preamble): "The design therefore ships one shared core and four thin adapters — no 'grades of integration': each host gets a real plugin." All four hosts carry skills (shared SKILL.md format), hooks, and MCP registration (`› Appendix A`).
- **Core = `plugin/core/` with `scripts/` + `skills/`** (`› P1`): `session-start.sh`, `post-edit.sh`, `stop-sweep.sh`, `lib.sh` — "POSIX sh, shellcheck-clean, host-agnostic". Adapters reference core scripts "repo-relative for path-source plugins; the per-host plugin root variable — e.g. `${CLAUDE_PLUGIN_ROOT}` — where the host provides one" (`› P2`).
- **Runtime every host shares = a read-only stdio MCP server** (`› P3`): tools are all reads; "No write tools". "Starts only where `.yggdrasil/` exists." For grain: `where`/`check`/`spectrum`/`status` are exactly the read-only tool set the plan listed as `roots_where`, `roots_spectrum`, `roots_check_file`.
- **Dormant repo ⇒ tools report dormancy, not error** (`› P3`).
- **Hooks whisper; they never veto** (`› §6` decision 6, `› P1`).

### 1.2 Context disclosure — what the agent is told, when, how much

- **Session-start budget: ≤ 40 lines, live output, three first-commands** (`› P1 › Behaviors`). The direct ancestor of grain's SessionStart hook: tell the agent the tool exists and give it concrete invocations.
- **Post-edit: only the delta, once per file per session** (`› P1`).
- **Budgets and dedup are day-one, and annoyance blocks shipping** (`› §7 Risks` 2).
- **Speech vs inquiry law** (`› §6` decision 2): "Speech is gated/budgeted/deduplicated; inquiry is unbounded — no surface blurs the line."
- **Two-regime law: brief by default, depth one explicit command away** (`› PART C › C1`).
- **Cost before touching** (`› C2`): tell the agent, before it scans, what a query costs vs. what scanning costs.
- **Absent feature = absent section, zero cost** (`› C3`).
- **No static digest, ever** (`› P1`, `› §6` decision 4): "A bundled copy is a staleness bug by construction." Applies to the SessionStart hook: print live status, not a baked string.

### 1.3 Install / bootstrap

- **Two guards open every script** (`› P1`): no CLI on PATH → one-sentence install note once per session, exit 0; no project dir → silent exit 0.
- **Version handshake** (`› P1`): older CLI ⇒ one notice, never a failure.
- **`hooks install` prints before writing; local file by default** (`› R8`).
- **Dogfood via committed host config** (`› P2`).
- **Roots-side scaffolding precedent** (Increment 2 `› Task 8`; `docs/roots.md › Turning it on`): first run bootstraps with defaults, printed first, then proceeds — never refuses.

### 1.4 Hook choices

- Claude Code events used (`› P2`): `SessionStart` / `PostToolUse` `Write|Edit` / `Stop` / `PreToolUse`. Cursor: `sessionStart` / `afterFileEdit` / `stop` / `preToolUse`. Copilot: hooks.json + `.mcp.json`. Codex: hooks best-effort.
- **Stop hook must honor the host's stop-loop guard** (`› P1`, `› R10`).
- **Fail-open on the hook path, with harness rethrow** (`› §6` decision 5).
- **DENY only via hook JSON, never exit code, never in CI** (`› R6`).
- **Session identity precedence** (`› R9`): host-provided id first, spec fallback last.

### 1.5 Skill wording principles

- SKILL.md generated from one template and freshness-gated (`› P1`).
- **Domain-neutral protocol: task start `where`, post-edit `check`, stop sweep** (`› R9`) — the three-moment loop a skill should teach.
- Message shape: three-beat deviation → evidence+scope → exemplar (`› R5`).
- **Honesty in status text is a named requirement** (`› R6`).
- **Informational lines are never warnings** (`› R9`).
- Docs: the compact form enters the manual with its consumer (Increment 1 `› D1`).

### 1.6 "How to make the agent actually use the tool"

1. Live bootstrap at session start with ready-to-run commands.
2. Push the delta after every edit so the tool is present without being asked.
3. A sweep at stop.
4. Skill + rules digest teaching a three-moment loop, not a feature list.
5. Every compact output ends in `next:` lines the agent can act on.
6. Show cost before action.
7. Dogfood in the tool's own repo; annoyance is a ship blocker.
8. Where host hooks are unreliable (Codex), "skill + MCP carry the protocol there regardless".

---

## Part 2 — Numbered decisions / lessons touching query surface, freshness, stores, determinism, status honesty, output, wording

### 2.1 Plugin plan `› §6 Decisions binding this plan`

1. Roots never gates CI; the only exit-code gate is opt-in `status --exit-code`.
2. Speech is gated/budgeted/deduplicated; inquiry is unbounded.
3. MCP is read-only. Writes stay in the shell.
4. No static digest in any plugin. Live CLI or one-sentence note.
5. Fail-closed survived-raw without history; fail-open only on the hook execution path, with harness rethrow.
6. Hooks whisper.
7. Every installed-artifact name goes through one source; every generated artifact joins the freshness gate.
8. Nothing may be descoped without the owner's explicit written decision.

`› R7` (query surface): `where` = lexical over repo-native tokens, cards with placement histogram + norms + exemplars + co-change, compact-map fallback; `spectrum` = deep vocabulary, no acceptance cut, NORM/obs marking; `report` = field, coverage/debt, distributional, trends, role table, health; `status` = the only gate-capable surface, opt-in; `explain` = where internals may legitimately surface (internals stay OUT of `where`/`check`).
`› R4`: resume from `lastIndexedSha` (full walk only on `--full` or unreachable SHA); clock = HEAD committer timestamp.
`› R1`: committed `model.json` + `seeds.jsonl` + `decisions.jsonl`/`ledger.jsonl` (`merge=union`); gitignored `.cache/` + `.state/`; absent block ⇒ dormant.

### 2.2 Increment 1 — context disclosure (decisions D1–D13)

- D1 manual teaches the plain command; the brief form is documented with its consumer.
- D2 scope marking appears in both brief and full view ("hiding it in one view invites contradiction").
- D3 when the change scope cannot be measured, never guess and never re-word; notices go to **stderr** to keep stdout's line budget intact.
- D4 "a pair is not a bill" — name the priced command rather than fake a price.
- D5 unreadable subject: silence plus a debug line, never a number that is quietly short.
- D6 vocabulary only from the product's own words.
- D7 the third trail pointer is the actionable one.
- D8 advisory remarks suppressed under the brief (line budget).
- D9 a resolver's hard-coded WHAT must be true on every branch it reaches.
- D10–D13 draft rules carry no status suffix; `--flag ""` is not "flag absent"; help text must describe the real rendering.
- Global: default output byte-identical when no new flag is passed (pinned by a committed baseline captured from a real run); "Formatters render already-decided text; business decisions live in the caller"; honest truncation tail ("… and N more — run X for all"); POSIX paths on stdout; no zero-information lines.

### 2.3 Increment 1b — cleanup

One producer per invariant ("stated five ways" → one); byte-identity is the increment's soul (output drift is BLOCKED, not adapted); build before every spawned suite (a stale build passes vacuously); a `skipIf` skip is not a pass; scratch git repos go outside the repository tree; commit identity via `-c user.name=…` so measurements don't depend on host identity; CHANGELOG must not over-claim (no unbacked magnitude adjectives).

### 2.4 Increment 2 — roots core

- Dormant without config: zero runtime change, pinned by a spawned dormancy test against a pre-captured golden.
- **Fail-closed survived-raw**: "Without history, an instance is NOT survived (the prototype inverts this … must NOT be ported as-is). A historyless repo mines a field and speaks nothing."
- Determinism: canonical JSON + atomic writes; sorted iteration; own-property guards (`constructor` is a real method name); double-build byte-identity control.
- Non-git: HEAD sha/clock fail SOFT to null; header carries null git fields as a recorded fact.
- `dirtyHash` excludes the tool's own state dir (else the header churns on every run).
- Honest degenerate values: absent while uncomputable, never fabricated; `noLifecycleWeight` is 0.3 — "uniform is not unity".
- Goldens: bundles + builder spec (a `.git` directory cannot be committed); deterministic dates (`GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE`, `TZ=UTC`, `-c init.defaultBranch=main`); size against the real floors (300 scopes; `minInstancesEff: 3` at w=0.3 needs ≥10 raw); generated files must dodge the built-in exclusion globs.
- CLI: verb is `index` (not the prototype's `learn`); no accepted-but-ignored flags; a read command exits non-zero on a dormant repo is exactly the CI-gating surface not to ship; blockless repo ⇒ scaffold with defaults printed first.
- Genericity lint must be proven to fire (red-case test).

### 2.5 Grounding — what the prototype proves vs gets wrong

Proves: 65/0/0 mutation, 130/130 silence, zero language-specific code, byte-identical determinism across cache states, incremental relearn 0-cost. Gets wrong: survived-raw fails OPEN; `role_lift` proxy; simple stable_id; no sharded cache/resume; ledger cap post-hoc; monolithic `mine()`.

### 2.6 `docs/roots.md` — shipped wording worth copying

"Every run of `index` against the same code and configuration produces the exact same file, byte for byte"; "nothing is claimed as backed by history the run does not have"; "When nothing has changed since the last run, `index` says so — 'already current' — and writes nothing at all"; `status` "never fails your build"; `.cache/` "Gitignored, safe to delete at any time"; a "What's not here yet" section listing what the release does not do.

---

## Part 3 — Anti-patterns the reviews caught

Surface/UX: static digests; flags that parse but do nothing; zero-information lines; guessing when a measurement is unavailable; status words on things nothing judged; invented vocabulary; help text describing a rendering that isn't real; read-only commands exiting non-zero on a dormant repo; refusing instead of scaffolding; `Source:` lines for fields with no producer; notices on stdout eating the budget; docs claiming stderr when code writes stdout.

Freshness/stores/determinism: folding the tool's own outputs into the dirty hash; `null` where the value is knowable, or a fabricated value where the input doesn't exist; coverage over accepted facts when the definition is over eligible ones; porting the prototype's fail-OPEN survived-raw; committing a golden repo as a directory; assuming git fixtures are deterministic without pinning dates/TZ/default branch; reading mined-value maps without own-property guards; claiming cache-state independence before anything writes a cache; `|cell| − n_true` as `n_false` (undecidable ≠ false); reading "uniform weight" as 1.0.

Tests/evidence: baselines captured after the edit; running in-place against a fixture; skip counted as pass; stale `dist/`; timing measurements that prove nothing; vacuous tests; constructing dead branches; lint rules that silently no-op; goldens below the 300-scope floor or named like tests; hand-typed doc examples; placeholder pointers never opened; API claims never verified.

Code hygiene: the same invariant stated five ways; import/local name collisions that typecheck; one of two render sites left dead; engine code calling the formatter; enforcement advertised that never runs; comments naming plan artifacts; empty stub files; silent descoping; adapting to output drift instead of blocking on it.

---

## Part 4 — How plugins/hooks/skills were to be packaged and tested (prescribed)

- Claude Code: repo-root `.claude-plugin/marketplace.json` → plugin dir with `.claude-plugin/plugin.json`, `hooks/hooks.json`, skills, `mcpServers` inline. Install: `/plugin marketplace add owner/repo` → `/plugin install name@marketplace`.
- Copilot: `.github/plugin/marketplace.json` → root `plugin.json`, hooks.json, SKILL.md, `.mcp.json`.
- Cursor: `.cursor-plugin/marketplace.json` → `.cursor-plugin/plugin.json`, `hooks/hooks.json` (sessionStart / afterFileEdit / stop / preToolUse), a rules `.mdc`, `mcp.json`; import via Dashboard.
- Codex: `.codex-plugin/plugin.json` (+`interface` block; skills + mcpServers + hooks pointers); hooks best-effort; "Codex prose docs were secondary-sourced — its adapter's first task re-verifies against a live `codex` install".
- Testing prescribed: freeze the JSON against a live install of each host; shellcheck; hook-channel stdin/stdout fixtures; one integration test per MCP tool over real stdio incl. dormant repo; SKILL.md freshness assertion; dogfood with all plugins enabled.
- Script contract: POSIX sh; guards; `minCliVersion` notice never failure; session-start ≤ 40 lines; post-edit once per file per session; stop-sweep honors the stop-loop guard; fail-open with harness rethrow.
- Test conventions that transfer: two test shapes only (in-process over a real fixture; spawned binary over a fixture copied to a temp dir); real git fixtures for anything that shells to git; byte-identity baselines from real pre-change runs; scratch repos outside the tree.

## Short list carried into grain verbatim

- SessionStart hook: live status + ready-to-run commands, ≤ 40 lines, guards, never a baked string.
- Skill: the three moments (task start `where`, post-edit `check`, stop sweep); queries are unbounded while hook output is budgeted.
- `status`: always exit 0; "nothing indexed yet" plainly; the `as of <sha>[+dirty]` gap; never guess a number.
- Index: atomic writes, exclude `.grain/**` from mining, double-run byte-identity test, no accepted-but-ignored flags.
- Output: no zero-information lines, honest truncation tails, diagnostics to stderr, POSIX paths.
- Docs: a "What's not here yet" section; examples copied from real runs; no unbacked adjectives.
