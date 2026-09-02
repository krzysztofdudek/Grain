#!/usr/bin/env node
// Scale ladder (director/system.md §2.F, §3, instrument F) — runs the fixed, versioned corpus.json against a
// small, explicit list of commands, with a MANDATORY per-command timeout, so a command that hangs (§055:
// `report`/`map` on Symfony's full history never finished and the process vanished after 17+ minutes with no
// stderr) becomes one row that says `completed: false, reason: '…'`, not an anecdote. §055 is fixed (history.mjs
// now streams state persistence and a read/save failure logs a `[history]` diagnostic instead of dying silently);
// this harness is how that stays true — it is a retest, forever, not a one-time repro.
//
//   node plugins/grain/tests/stress/run-corpus.mjs --ladder --corpus-dir <dir> --timeout <ms>
//       [--corpus <corpus.json>] [--only id,id,…] [--out-dir <dir>] [--checkout]
//   node plugins/grain/tests/stress/run-corpus.mjs --table [--in <results.json>] [--results-dir <dir>]
//
// <corpus.json> (default: this directory's corpus.json) is the fixed, versioned repo list: url + sha + lang +
// axes + size, so numbers are comparable across engine versions regardless of which machine ran them. <corpus-dir>
// is local and NOT recorded in corpus.json (machine paths do not belong in a committed file): it must contain one
// subdirectory (or symlink to one) per corpus entry's `id`, holding a real git clone reachable at (or near) that
// entry's `sha`. The ladder never force-checks-out a pinned sha on someone else's clone by default — it records
// whatever HEAD actually is and flags a mismatch; pass --checkout to opt in (refused if the worktree is dirty).
//
// Scope: this is the ladder only (director/system.md §2.F). It does not replace or extend the older ad hoc trial
// harness some of docs/validation.md's "12-repo corpus" table cites at the pre-restructure path `tests/stress/
// run-corpus.mjs` (still present, untouched, at the repo root — dead since the plugin restructure, not this file).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(here, '..', '..', 'bin', 'grain.mjs');

const t = () => Date.now();
// Runs one grain invocation and resolves with timing/RSS/exit info. Uses `spawn` with `detached: true` (its own
// process group) plus a manual timeout that signals the WHOLE GROUP, not the built-in `timeout` option a sync
// spawn would use, which only signals the ONE process it directly spawned. That distinction is not cosmetic:
// grain runs under `/usr/bin/time -l` for RSS on macOS, so the direct child is `/usr/bin/time` and its OWN child
// is the real `node bin/grain.mjs …` doing the work — a signal that reaches only `/usr/bin/time` leaves the actual
// grain process an ORPHAN that keeps running (and, for a cold build, keeps writing `.grain/cache/`) long after
// this harness has already recorded `completed: false, reason: 'timeout'` and moved on to the next repo. Caught
// in the field: the first symfony-full ladder attempt's cold build was still alive and burning CPU/RSS more than
// a minute after this harness declared it timed out and launched a SECOND attempt against the very same
// directory — two processes racing to write the same cache. `detached: true` makes the spawned process
// (`/usr/bin/time`, or `node` directly when unavailable) the leader of a new process group; `process.kill(-pid,
// sig)` (negative pid) signals every process in that group, including whatever `/usr/bin/time` itself spawned, as
// long as none of them call `setsid` (grain's own internal V8-liftoff re-exec in bin/grain.mjs does not, and is
// skipped entirely for `refresh` — see that file's comment). SIGTERM first, SIGKILL five seconds later if the
// group is still alive.
function run(args, cwd, { timeoutMs } = {}) {
  const t0 = t();
  const useTime = existsSync('/usr/bin/time') && process.platform === 'darwin'; // /usr/bin/time -l (BSD) prints peak RSS on stderr
  const cmd = useTime ? '/usr/bin/time' : 'node';
  const spawnArgs = useTime ? ['-l', 'node', BIN, ...args] : [BIN, ...args];
  return new Promise(done => {
    let child;
    try {
      child = spawn(cmd, spawnArgs, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      done({ args: args.join(' '), ms: t() - t0, rssMb: null, code: null, signal: null, out: '', err: String(e?.message || e) });
      return;
    }
    const CAP = 1 << 28; // 256 MB, same ceiling the old spawnSync maxBuffer enforced
    let out = '',
      err = '',
      timedOut = false,
      settled = false;
    child.stdout.on('data', d => {
      if (out.length < CAP) out += d;
    });
    child.stderr.on('data', d => {
      if (err.length < CAP) err += d;
    });
    let termTimer = null,
      killTimer = null;
    if (timeoutMs) {
      termTimer = setTimeout(() => {
        timedOut = true;
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {}
        killTimer = setTimeout(() => {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {}
        }, 5000);
      }, timeoutMs);
    }
    const finish = (code, signal) => {
      if (settled) return; // 'close' can race 'error' on spawn failure; only resolve once
      settled = true;
      if (termTimer) clearTimeout(termTimer);
      if (killTimer) clearTimeout(killTimer);
      const ms = t() - t0;
      let rss = null;
      const m = err.match(/(\d+)\s+maximum resident set size/);
      if (m) rss = Math.round(+m[1] / 1048576);
      const cleanErr = err
        .split('\n')
        .filter(
          l =>
            !/^\s*\d+(\.\d+)?\s+(real|user|sys|maximum|average|page|voluntary|involuntary|signals|swaps|block|socket|messages|instructions|cycles|peak)/.test(
              l
            ) && !/^\s*\d+\s+\w/.test(l)
        )
        .join('\n')
        .trim();
      done({
        args: args.join(' '),
        ms,
        rssMb: rss,
        code: timedOut ? null : code,
        signal: timedOut ? signal || 'SIGTERM' : signal,
        out: out.trimEnd(),
        err: cleanErr,
      });
    };
    child.on('close', finish);
    child.on('error', e => {
      err += '\n' + String(e?.message || e);
      finish(null, null);
    });
  });
}
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8' }).trim();

// ---------------------------------------------------------------------------------------------------------------
// the eleven command shapes director/system.md §2.F names, in the shipped CLI's actual argument shape
// (grep `case '` in engine/grain.mjs for the authoritative dispatch table). `check`/`explain`/`obligation` each
// need one representative file/path, filled in per repo from its own model once the cold build has run.
// ---------------------------------------------------------------------------------------------------------------
function ladderCommands({ intentWords, checkFile }) {
  return [
    { label: 'report', args: ['report', '--top', '40'] },
    { label: 'map', args: ['map'] },
    { label: 'where', args: ['where', ...intentWords] },
    { label: 'what', args: ['what', ...intentWords] },
    { label: 'how', args: ['how', ...intentWords] },
    // `check <file>` is mandatory (cmdCheck throws its own usage error with none) — there is no "check
    // everything" flag on this verb (that is `review`); skip cleanly rather than send a call known malformed.
    { label: 'check', args: checkFile ? ['check', checkFile] : null },
    { label: 'explain', args: checkFile ? ['explain', checkFile] : null }, // alias of `spectrum <file>`
    { label: 'selftest --how', args: ['selftest', '--how'] },
    { label: 'selftest --where', args: ['selftest', '--where'] },
    { label: 'selftest --extract', args: ['selftest', '--extract'] },
    { label: 'obligation', args: checkFile ? ['obligation', checkFile] : null },
  ];
}

// realistic agent intent words per corpus id, for where/what/how — a repo not listed here (any not yet run
// through the ladder) falls back to a generic word rather than the harness refusing to run at all.
const INTENTS = {
  leveldb: ['comparator'],
  'kotlin-datetime': ['instant'],
  CleanArchitecture: ['command handler'],
  'spring-petclinic': ['controller'],
  'telescope.nvim': ['picker'],
  'tsx-zustand': ['store'],
  'axum-full': ['extractor'],
  gin: ['middleware'],
  'zig-zls': ['handler'],
  'groovy-spock': ['specification'],
  'openzeppelin-contracts': ['modifier'],
  'serde-full': ['deserialize'],
  'bash-it': ['plugin'],
  Slim: ['middleware'],
  'cpp-json': ['parser'],
  sinatra: ['route'],
  flask: ['blueprint'],
  express: ['router middleware'],
  okhttp: ['interceptor'],
  playframework: ['controller'],
  nest: ['guard'],
  curl: ['handler'],
  'symfony-shallow': ['controller'],
  'symfony-mid': ['controller'],
  'symfony-full': ['controller'],
};
const pickIntentWords = id => INTENTS[id] || ['handler'];

function classifyFailure(r) {
  if (r.code === 0 && !r.signal) return null;
  // node's spawnSync sends the killSignal (default SIGTERM) when its own `timeout` elapses — that is OUR harness
  // giving up, not the process dying on its own. Any other signal (SIGKILL, SIGSEGV, …) with no matching stderr is
  // the §055 shape: something outside node — the OS OOM killer, most likely on a multi-GB history walk — reaped it
  // silently. Keeping the two apart is the whole point of the ladder: one is "still hasn't finished," the other is
  // "died mid-flight."
  if (r.signal === 'SIGTERM' && r.code === null) return 'timeout';
  if (r.signal) return 'signal:' + r.signal;
  if (/unknown command/.test(r.err || '') || /unknown command/.test(r.out || '')) return 'unknown-command';
  if (r.code === null) return 'timeout';
  return 'nonzero-exit';
}

function parseFlags(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// ladder mode: fixed corpus.json, fixed command list, mandatory timeout, completed:true/false per (repo, command)
// ---------------------------------------------------------------------------------------------------------------
async function ladderMain(flags) {
  const corpusPath = resolve(flags.corpus || join(here, 'corpus.json'));
  const corpusDir = flags['corpus-dir'] ? resolve(flags['corpus-dir']) : null;
  if (!corpusDir) {
    console.error(
      'usage: run-corpus.mjs --ladder --corpus-dir <dir> --timeout <ms> [--corpus <corpus.json>] [--only id,id] [--out-dir <dir>] [--checkout]'
    );
    process.exit(2);
  }
  if (!flags.timeout) {
    console.error(
      '--timeout <ms> is required (no baked-in default — pick one appropriate to the bucket you are running, e.g. 60000 for the 1k bucket, 20*60000 to reproduce the §055 window on the 100k bucket)'
    );
    process.exit(2);
  }
  const timeoutMs = +flags.timeout;
  const only = flags.only ? String(flags.only).split(',') : null;
  const outDir = resolve(flags['out-dir'] || join(here, 'results'));
  mkdirSync(outDir, { recursive: true });

  const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
  const entries = corpus.repos.filter(e => !only || only.includes(e.id));
  const engineSha = (() => {
    try {
      return execFileSync('git', ['-C', here, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  })();
  const engineVersionLine = (() => {
    try {
      return execFileSync('node', [BIN, 'version'], { encoding: 'utf8' }).trim();
    } catch (e) {
      return 'unknown: ' + (e.message || e);
    }
  })();
  const date = new Date().toISOString().slice(0, 10);
  const outFile = join(outDir, `${date}-${engineSha}.json`);

  // Same day + same engine sha => same filename. Two separate invocations against it (e.g. one `--only` call per
  // bucket, or a resumed run after a crash) must accumulate, not clobber each other — load and upsert by repo id
  // rather than starting from an empty repos: [] every time.
  let runRecord;
  if (existsSync(outFile)) {
    try {
      runRecord = JSON.parse(readFileSync(outFile, 'utf8'));
      runRecord.timeoutMs = timeoutMs; // this invocation's timeout is what governs the rows it (re)writes below
      runRecord.engineVersion = engineVersionLine;
    } catch {
      runRecord = null;
    }
  }
  if (!runRecord) runRecord = { date, engineSha, engineVersion: engineVersionLine, timeoutMs, corpusPath: 'plugins/grain/tests/stress/corpus.json', repos: [] };
  const upsertRepo = repoRes => {
    const i = runRecord.repos.findIndex(r => r.id === repoRes.id);
    if (i >= 0) runRecord.repos[i] = repoRes;
    else runRecord.repos.push(repoRes);
  };

  for (const entry of entries) {
    const dir = join(corpusDir, entry.id);
    const log = s => console.error(`[${entry.id}] ${s}`);
    if (!existsSync(join(dir, '.git'))) {
      log('SKIP: not present under --corpus-dir');
      upsertRepo({ id: entry.id, lang: entry.lang, bucket: entry.bucket, sizePinned: entry.size, skipped: true, reason: 'not present locally' });
      writeFileSync(outFile, JSON.stringify(runRecord, null, 1));
      continue;
    }

    let actualSha = null;
    try {
      actualSha = git(dir, 'rev-parse', 'HEAD');
    } catch {}
    const shaMismatch = actualSha !== entry.sha;
    if (shaMismatch && flags.checkout) {
      try {
        const dirty = git(dir, 'status', '--porcelain');
        if (dirty) log(`WARN: --checkout requested but worktree is dirty, leaving HEAD at ${actualSha}`);
        else {
          git(dir, 'checkout', '-q', entry.sha);
          actualSha = entry.sha;
          log(`checked out pinned sha ${entry.sha}`);
        }
      } catch (e) {
        log(`WARN: checkout of pinned sha failed: ${e.message || e}`);
      }
    } else if (shaMismatch) {
      log(`NOTE: HEAD ${actualSha} != pinned ${entry.sha} (pass --checkout to force; recording actual HEAD)`);
    }

    const repoRes = {
      id: entry.id,
      lang: entry.lang,
      axes: entry.axes,
      bucket: entry.bucket,
      sizePinned: entry.size,
      shaPinned: entry.sha,
      shaActual: actualSha,
      shaMismatch,
      steps: [],
    };
    rmSync(join(dir, '.grain'), { recursive: true, force: true }); // force a genuinely cold build every run

    log(`cold build (refresh, timeout ${timeoutMs} ms)...`);
    const cold = await run(['refresh'], dir, { timeoutMs });
    const coldFail = classifyFailure(cold);
    repoRes.coldBuild = {
      ms: cold.ms,
      rssMb: cold.rssMb,
      code: cold.code,
      signal: cold.signal,
      completed: !coldFail,
      reason: coldFail,
      errTail: (cold.err || '').split('\n').slice(-10).join('\n'),
    };
    log(`cold build: ${cold.ms} ms${cold.rssMb ? `, ${cold.rssMb} MB` : ''}, completed=${!coldFail}${coldFail ? ` (${coldFail})` : ''}`);

    if (coldFail) {
      // §055 shape: don't re-attempt an already-doomed cold build ten more times. One row is the finding.
      for (const c of ladderCommands({ intentWords: [], checkFile: null })) repoRes.steps.push({ label: c.label, skipped: true, reason: 'cold build did not complete' });
      upsertRepo(repoRes);
      writeFileSync(outFile, JSON.stringify(runRecord, null, 1));
      continue;
    }

    let model = null;
    try {
      model = JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));
    } catch {}
    const files = model ? [...new Set((model.partitions || []).flatMap(p => p.files || []))].sort() : [];
    const checkFile = files[Math.floor(files.length / 2)] || null;
    const intentWords = pickIntentWords(entry.id);

    for (const c of ladderCommands({ intentWords, checkFile })) {
      if (!c.args) {
        repoRes.steps.push({ label: c.label, skipped: true, reason: 'no representative file found in model' });
        log(`${c.label}: skipped (no representative file)`);
        continue;
      }
      const r = await run(c.args, dir, { timeoutMs });
      const fail = classifyFailure(r);
      repoRes.steps.push({
        label: c.label,
        ms: r.ms,
        rssMb: r.rssMb,
        code: r.code,
        signal: r.signal,
        completed: !fail,
        reason: fail,
        errTail: fail ? (r.err || '').split('\n').slice(-5).join('\n') : undefined,
      });
      log(`${c.label}: ${r.ms} ms${r.rssMb ? `, ${r.rssMb} MB` : ''}, completed=${!fail}${fail ? ` (${fail})` : ''}`);
    }
    upsertRepo(repoRes);
    writeFileSync(outFile, JSON.stringify(runRecord, null, 1)); // flush after every repo — a hang on repo N must not lose repos 1..N-1
  }

  console.log(JSON.stringify({ outFile, repos: runRecord.repos.map(r => r.id) }));
}

// ---------------------------------------------------------------------------------------------------------------
// --table: render the most recent (or a named) ladder run as the markdown table docs/validation.md's corpus
// section can be regenerated from.
// ---------------------------------------------------------------------------------------------------------------
function latestResultFile(resultsDir) {
  const files = readdirSync(resultsDir).filter(f => /^\d{4}-\d{2}-\d{2}-.+\.json$/.test(f)).sort();
  return files.length ? join(resultsDir, files[files.length - 1]) : null;
}

function fmtMs(ms) {
  return ms == null ? '—' : ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${(ms / 60_000).toFixed(1)} min`;
}
function fmtCommits(n) {
  return n == null ? '—' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function tableMain(flags) {
  const resultsDir = resolve(flags['results-dir'] || join(here, 'results'));
  const inFile = flags.in ? resolve(flags.in) : latestResultFile(resultsDir);
  if (!inFile || !existsSync(inFile)) {
    console.error(`no results file found (looked in ${resultsDir}; pass --in <file.json>)`);
    process.exit(2);
  }
  const runData = JSON.parse(readFileSync(inFile, 'utf8'));
  const COMMANDS = ['report', 'map', 'where', 'what', 'how', 'check', 'explain', 'selftest --how', 'selftest --where', 'selftest --extract', 'obligation'];

  const lines = [];
  lines.push(`Ladder run: ${runData.date}, engine ${runData.engineSha} (${runData.engineVersion}), timeout ${fmtMs(runData.timeoutMs)} per command.`, '');
  lines.push('| repo | bucket | commits | files | cold build | peak RSS | completed |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const r of runData.repos) {
    if (r.skipped && !r.coldBuild) {
      lines.push(`| ${r.id} | ${r.bucket || '—'} | ${fmtCommits(r.sizePinned?.commits)} | ${fmtCommits(r.sizePinned?.files)} | — | — | skipped: ${r.reason} |`);
      continue;
    }
    const cb = r.coldBuild || {};
    lines.push(
      `| ${r.id}${r.shaMismatch ? ' *(sha drift)*' : ''} | ${r.bucket || '—'} | ${fmtCommits(r.sizePinned?.commits)} | ${fmtCommits(r.sizePinned?.files)} | ${fmtMs(cb.ms)} | ${cb.rssMb ? cb.rssMb + ' MB' : '—'} | ${cb.completed ? 'yes' : `**no** (${cb.reason})`} |`
    );
  }
  lines.push('', '| repo \\ command | ' + COMMANDS.join(' | ') + ' |');
  lines.push('| --- |' + COMMANDS.map(() => ' --- |').join(''));
  for (const r of runData.repos) {
    if (r.skipped) {
      lines.push(`| ${r.id} |` + COMMANDS.map(() => ' n/a (cold build failed) |').join(''));
      continue;
    }
    const byLabel = Object.fromEntries((r.steps || []).map(s => [s.label, s]));
    lines.push(
      `| ${r.id} |` +
        COMMANDS.map(c => {
          const s = byLabel[c];
          if (!s) return ' — |';
          if (s.skipped) return ` — (${s.reason}) |`;
          if (!s.completed) return ` **DNF** (${s.reason}) |`;
          return ` ${fmtMs(s.ms)} |`;
        }).join('')
    );
  }
  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
if (argv.includes('--table')) tableMain(parseFlags(argv));
else if (argv.includes('--ladder')) await ladderMain(parseFlags(argv));
else {
  console.error(
    'usage: run-corpus.mjs --ladder --corpus-dir <dir> --timeout <ms> [--corpus <corpus.json>] [--only id,id] [--out-dir <dir>] [--checkout]\n   or: run-corpus.mjs --table [--in <results.json>] [--results-dir <dir>]'
  );
  process.exit(2);
}
