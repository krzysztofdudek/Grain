// grain engine · query surface · the usage text
// Split out of grain.mjs (ticket 124): the statements below are the ones that stood there, unchanged.

export const USAGE = `grain — ask a repository about its own conventions before writing code.
usage: grain <command> [args] [--repo <path>] [--no-refresh] [--no-history]
  where <intent words> [--top N] [--map-rows N] [--json]  intent → place + expectations + exemplars + co-change
  how <intent words> [--top N] [--json]   intent → the past commits that look like it, and which files such a change touched
  what <words> [--json]                   words → the concept card: declarations, values, spread, siblings, commit mentions, fan-in
  map [--json]                            a structural overview: dependency layers (leaves to top) and how many maintainer decisions are in force
  obligation <path> [--top N] [--json]    what a NEW file under this path (module + extension) has historically come with — <path> need not exist
  check [<file>] [--as <path>] [--content <file>] [--all] [--staged | --range <a>..<b> | --worktree] [--json]
                                          <file>: how its worktree version sits against the local norm; no <file>: one
                                          aggregated report over your whole uncommitted change (default: uncommitted + untracked)
  completeness <file…>                    other files this repo's own commits show reliably changing WITH these — the same line check-hook appends automatically after a matching edit
  explain <file> [--minbits N] [--top N]  the full local→global convention lattice for one file
  status | report [--top N] [--json]      model overview / top conventions, freshness
  rules [--out <file>] [--top N]          a generated Markdown document of established conventions, stamped with the commit — for a
                                          reader with no terminal or no grain plugin; \`grain rules > CONVENTIONS.md\` also works
  export [--out <file>] [--max-sites N] [--compact] [--no-anchors]  the whole model as JSON: every convention with all its sites, anchors, trends,
                                          groups, markers, directories, co-change (for training pipelines and audits)
  propose [<out-dir>] [--full] [--json <path>] [--holdout <YYYY-MM-DD>]   a PROPOSED Yggdrasil \`.yggdrasil/\` architecture graph for this repository —
                                          nodes, relations and mined rules with evidence attached — written to <out-dir> (default
                                          .yggdrasil-proposal/, never over your own .yggdrasil/) for you to read and move in. The report
                                          names the architecture, the rules a real \`yg drill\` proved, and the candidates; \`--full\` adds
                                          every draft it kept back
  decide steer <path>#<name> --surfaces <pid,…> [--instead-of <pid,…>] [--author <who>] --note "…"   promote a value repo-wide (.grain/seeds.jsonl, committed)
  decide boundary <from> --never-imports <to> --note "…"     an architecture decision: new imports crossing it are flagged
  decide waive <path>#<name> --on <pid> --note "…"           excuse ONE scope from ONE convention: check calls its departure deliberate, the counts still report it
  decide list | decide rm <id>            the decisions in force / withdraw one
  selftest [--json]                       plant synthetic deviations into conforming exemplars and report how many this repo's own model catches
  selftest --how [--last N] [--json]      leave-one-out: how's own precision/recall predicting a past commit's files, vs a grep baseline, over the last N commits
  selftest --where [--last N] [--json]    where's own ranking of the file a past commit ADDED, from that commit's message, vs a path-match baseline, over the last N such commits
  selftest --obligation [--last N] [--json]  leave-one-out: the birth-obligation table's own coverage/precision predicting what a past commit that ADDED a file also touched, over the last N such events
  selftest --extract [--json]             per grammar, what fraction of the declarations a node-types.json-derived oracle sees does extraction actually record as a scope
  refresh [--full]                        rebuild the index now (every query already auto-refreshes)
  version                                 engine, extractor and grammar versions
aliases:
  review                                  bare \`check\` (no file argument) — same command, same flags
  completeness <file…>                    the co-change: line of check's missing from your change: block, standalone — works on any file, parsed or not
  seed add | add-boundary | list | rm     \`decide\` under its original name — same command, same records (its own messages still say "seed")
  spectrum <file> [--minbits N] [--top N] \`explain\` under its original name — same command, same output
Index: <repo>/.grain/cache/ (gitignored, disposable). Every answer ends with \`as of <sha>\`; \`check\`/\`review\`/\`explain\`/\`spectrum\` append \`+dirty\` when they read uncommitted content — other commands never claim it, and note a dirty worktree separately instead.`;
