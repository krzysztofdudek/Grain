// grain engine · query surface · `export` and `propose`
// Split out of grain.mjs: the statements below are the ones that stood there, unchanged.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute, sep } from 'node:path';
import { loadHistory } from './history.mjs';
import { exportModel } from './export.mjs';
import { atomicWrite, canonicalize, loadScopes, log } from './grain-context.mjs';

// the whole model as data — see export.mjs
export async function cmdExport({ model, meta, head, root, isGit, args, opts, stamp, store }) {
  if (args.length)
    throw new Error(
      'usage: grain export [--out <file>] [--max-sites N] [--compact] [--no-anchors] — takes no arguments'
    );
  const scopesAll = await loadScopes({ root, isGit, store, opts });
  let H = null;
  if (isGit && !opts['no-history']) {
    try {
      H = (await loadHistory({ gitdir: root, store, log })).H;
    } catch (e) {
      log('history unavailable for export: ' + e.message);
    }
  }
  const dump = exportModel({
    model,
    root,
    scopesAll,
    H,
    meta,
    head,
    maxSites: opts['max-sites'] !== undefined ? +opts['max-sites'] : 300,
    anchors: !opts['no-anchors'],
  });
  const text = JSON.stringify(dump, null, opts.compact ? 0 : 1);
  if (opts.out) {
    const p = isAbsolute(opts.out) ? opts.out : resolve(process.cwd(), opts.out);
    atomicWrite(p, text);
    return [
      `export ${p} — ${dump.summary.conventions} conventions · ${dump.summary.groups} groups · ${dump.summary.deviations} deviating sites · ${dump.cochange.length} co-change pairs · ${(text.length / 1048576).toFixed(1)} MB`,
      stamp(),
    ];
  }
  console.error('[grain] ' + stamp());
  return [text];
}
// ----- propose: one command from `git clone` to a loadable `.yggdrasil/` architecture graph -----
//
// The staging tree is written to `<repo>/.yggdrasil-proposal/` by default and NEVER to `<repo>/.yggdrasil/`: a
// proposal is read, edited and moved in by a human, not installed by a script. The out-dir gets its own
// `.gitignore` (`*`, ignoring everything in it including itself) the first time it is written, so a staging tree
// can never be committed by accident while the maintainer reads it. `.grain/.gitignore` is deliberately NOT that:
// it ignores only `cache/`, so the maintainer's seeds and decisions under `.grain/` stay committable.
//
// Everything the command prints comes from `proposeReport` (engine/propose.mjs), which builds the text lines and
// the `--json` document in one pass so the two cannot disagree. The default is deliberately quiet — see that
// function's header for what is in it and why.
export async function cmdPropose({ root, args, opts, stamp }) {
  if (args.length > 1)
    throw new Error('usage: grain propose [<out-dir>] [--full] [--json <path>] [--holdout <YYYY-MM-DD>] [--family-candidates <path> | --no-family-candidates] — at most one out-dir');
  if (opts.json === true)
    throw new Error('usage: grain propose --json <path> — `--json` names the file to write the report to; the text report always goes to stdout');
  if (opts.holdout !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(opts.holdout)))
    throw new Error('usage: grain propose --holdout <YYYY-MM-DD> — a calendar date, so drill corpora keep only sites first seen after it');
  if (opts['family-candidates'] === true)
    throw new Error('usage: grain propose --family-candidates <path> — the file to write the family candidates to (a directory gets `.family-candidates.json` inside it); by default it goes to <out-dir>/.yggdrasil/.family-candidates.json, beside the graph `yg adopt` installs');
  if (opts['no-family-candidates'] && opts['family-candidates'] !== undefined)
    throw new Error('usage: grain propose takes --family-candidates <path> or --no-family-candidates, not both');
  const outDir = args[0]
    ? isAbsolute(args[0]) ? args[0] : resolve(process.cwd(), args[0])
    : join(root, '.yggdrasil-proposal');
  // CANONICAL PATHS, NOT RESOLVED STRINGS. `resolve()` folds `.` and `..` and never touches the filesystem, so
  // an out-dir that is a SYMLINK to the repository compares unequal to it, walks past this guard, and the
  // renderer's `rmSync(<out-dir>/.yggdrasil)` then deletes the hand-written graph the guard exists to protect —
  // measured, exit code 0, no warning. `canonicalize` (above) resolves symlinks through the deepest existing
  // ancestor, so it works on an out-dir that does not exist yet, which is the ordinary case.
  const outReal = canonicalize(outDir), rootReal = canonicalize(root), yggReal = canonicalize(join(root, '.yggdrasil'));
  if (outReal === rootReal || outReal === yggReal || outReal.startsWith(yggReal + sep))
    throw new Error(
      `refusing to write a proposal into ${outReal}: that is the repository itself or its own .yggdrasil/.\n` +
        'A proposal is a staging tree a human reads and accepts with `yg adopt` — writing it over a live graph destroys the graph already there.\n' +
        `Run \`grain propose\` with no argument (it writes ${join(root, '.yggdrasil-proposal')}), or name a directory outside .yggdrasil/.`
    );
  const { propose, proposeReport, resolveYg, buildFamilyCandidates } = await import('./propose.mjs');
  const r = await propose(root, outDir, { noHistory: !!opts['no-history'], holdout: opts.holdout });
  // The family-without-law signal `yg advise` reads (`.yggdrasil/.family-candidates.json`). It goes INTO the
  // proposal, beside the graph, so `yg adopt` installs both in one move and an adopter never copies a file by
  // hand; `--family-candidates <path>` writes it somewhere else instead (a repository that adopted earlier
  // points it at its own `.yggdrasil/`), and `--no-family-candidates` writes none. Only this one file is ever
  // written outside the staging tree, and only when the caller named where.
  let familyCandidates = null;
  if (!opts['no-family-candidates']) {
    let fcPath = join(outDir, '.yggdrasil', '.family-candidates.json');
    if (opts['family-candidates'] !== undefined) {
      fcPath = isAbsolute(opts['family-candidates']) ? opts['family-candidates'] : resolve(process.cwd(), opts['family-candidates']);
      if (existsSync(fcPath) && statSync(fcPath).isDirectory()) fcPath = join(fcPath, '.family-candidates.json');
    }
    // `_fit` is bookkeeping about the predicate-fit gate, not part of the contract `yg advise` reads.
    const { _fit, ...onDisk } = buildFamilyCandidates(r.alternatives, r.exp, {}, { active: r.active, groups: r.loc.groups, repo: root });
    mkdirSync(dirname(fcPath), { recursive: true });
    atomicWrite(fcPath, JSON.stringify(onDisk, null, 1) + '\n');
    familyCandidates = { path: fcPath, families: onDisk.families.length, droppedByFit: _fit || { members: 0, families: 0 } };
  }
  // `*` ignores the staging tree including this file — unlike `.grain/.gitignore`, which ignores only `cache/` —
  // so an adopter reading a proposal for a week never has it show up in `git status`.
  const gi = join(outDir, '.gitignore');
  if (!existsSync(gi))
    writeFileSync(gi, '# generated by grain — a proposal is a staging tree you read, then accept with `yg adopt`; never a commit\n*\n');
  const { lines, json } = proposeReport(r, { outDir, root, full: !!opts.full, familyCandidates });
  // the `next:` line names the transaction (`yg adopt`); when a Yggdrasil CLI actually resolves,
  // run its own `--dry-run` on the proposal this run just wrote and print its summary VERBATIM right under
  // that line — the adopter sees "Already broken N sites" (and everything else `yg adopt` would tell them)
  // before deciding, instead of a promise that the command exists. Never `yg adopt` for real: a dry run
  // writes nothing, and deciding to accept a proposal is the maintainer's call, not this command's.
  // A repository that already has a graph: `yg adopt` refuses to merge over it before it ever reaches its
  // dry run, so the preview asks with `--replace`, which a dry run still never acts on.
  const yg = resolveYg(opts.ygBin);
  if (yg.have) {
    const adoptArgs = ['adopt', outDir, ...(existsSync(join(root, '.yggdrasil')) ? ['--replace'] : []), '--dry-run'];
    const res = spawnSync(yg.cmd, [...yg.pre, ...adoptArgs], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 5 * 60_000 });
    const block = `${res.stdout || ''}${res.stderr || ''}`.trim();
    lines.push('', block || `\`yg ${adoptArgs.join(' ')}\` produced no output (exit ${res.status ?? 'unknown'}, ${res.error?.message || 'no error recorded'})`);
  } else {
    lines.push(
      '',
      `yg adopt is not available to preview this run (no Yggdrasil CLI resolved — set YG_BIN to a built bin.js, or put \`yg\` on PATH). Once it is, \`yg adopt ${outDir} --dry-run\` reports the components and rules it would install, how many sites in this repository the new rules already refuse today, whether the acceptance would block on the whole repository or only on what a change reaches, and where the acceptance would be recorded — without changing anything.`
    );
  }
  if (opts.json) {
    const p = isAbsolute(opts.json) ? opts.json : resolve(process.cwd(), opts.json);
    atomicWrite(p, JSON.stringify(json, null, 1) + '\n');
    lines.push(`report as JSON: ${p}`);
  }
  return [...lines, stamp()];
}
