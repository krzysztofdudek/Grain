// End-to-end tests over the CLI against the deterministic fixture repository (tests/fixtures/build-fixture.mjs).
//   node --test plugins/grain/tests/      (from the repo root)      or      npm test   (inside plugins/grain)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, appendFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');
let tmp, repo;
const grain = (args, opts = {}) => { const r = spawnSync('node', [BIN, ...args], { cwd: opts.cwd || repo, encoding: 'utf8', input: opts.input, env: { ...process.env, ...(opts.env || {}) } });
  return { out: (r.stdout || "").replace(/\n$/, ""), err: r.stderr, code: r.status }; };
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();

before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-test-')); repo = join(tmp, 'fixture'); execFileSync('node', [BUILDER, repo], { stdio: 'pipe' }); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('first query builds the index from the full history and stamps the answer', () => {
  const { out, err, code } = grain(['status']);
  assert.equal(code, 0, err);
  assert.match(err, /walking full history/);
  assert.match(out, /history: 16 non-merge commits, 172 blobs/); // §J7.2: the fixture's package.json is now a code blob too (json grammar); §034a: qualified — merges never enter this count
  assert.match(out, /up to date · history full/);
  assert.match(out, /\nas of [0-9a-f]{7}$/);
  assert.ok(existsSync(join(repo, '.grain', 'cache', 'model.json')));
  assert.equal(readFileSync(join(repo, '.grain', '.gitignore'), 'utf8').includes('cache/'), true);
  assert.equal(git('status', '--porcelain').split('\n').filter(l => l.includes('.grain')).join(), '?? .grain/'); // only .grain/.gitignore is visible to git
});

test('§034a: the reported commit count excludes merges and says so, and the excluded merge really is one fewer than plain `git log`', () => {
  const tmp2 = mkdtempSync(join(tmpdir(), 'grain-merge-count-'));
  const repo2 = join(tmp2, 'r');
  try {
    execFileSync('git', ['init', '-q', '-b', 'main', repo2]);
    const g2 = (...args) => execFileSync('git', ['-C', repo2, ...args], { encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();
    g2('config', 'commit.gpgsign', 'false');
    writeFileSync(join(repo2, 'a.ts'), 'export const a = 1;\n');
    g2('add', '-A'); g2('commit', '-qm', 'base');
    g2('checkout', '-qb', 'feature');
    writeFileSync(join(repo2, 'b.ts'), 'export const b = 2;\n');
    g2('add', '-A'); g2('commit', '-qm', 'feature work');
    g2('checkout', '-q', 'main');
    writeFileSync(join(repo2, 'c.ts'), 'export const c = 3;\n');
    g2('add', '-A'); g2('commit', '-qm', 'main work');
    g2('merge', '--no-ff', '-q', '-m', 'merge feature', 'feature');
    // base, "feature work", "main work", and the merge itself — 4 commits reachable from HEAD, one of them a merge
    const totalOneline = g2('log', '--oneline').split('\n').filter(Boolean).length;
    assert.equal(totalOneline, 4, 'fixture sanity: 4 commits including the merge');
    const r = spawnSync('node', [BIN, 'status'], { cwd: repo2, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const m = (r.stdout || '').match(/history: (\d+) non-merge commits/);
    assert.ok(m, `status must qualify the commit count as non-merge:\n${r.stdout}`);
    assert.equal(+m[1], 3, 'the merge commit itself must not be in the count');
    assert.ok(+m[1] < totalOneline, 'sanity: the qualified count really is smaller than what plain `git log` reports — that gap is exactly the point of the qualifier');
  } finally { rmSync(tmp2, { recursive: true, force: true }); }
});

test('report finds the planted conventions', () => {
  const { out } = grain(['report', '--top', '40']);
  // `CanActivate` is a TS interface (`.../guard.ts`'s `${cap(n)}Guard implements CanActivate`, never `extends`) — §033
  // fixed the label to say so; `BaseDto`/`BaseService` are genuine classes (`extends`) and keep the old wording
  for (const phrase of ['types here are annotated with `@Handler`', 'types here implement `CanActivate`', 'types here extend `BaseDto`', 'files here import `~/src/core/handler`'])
    assert.ok(out.includes(phrase), `missing convention: ${phrase}\n${out}`);
  assert.ok(!out.includes('import `Command`'), 'an imported identifier is not a module: the import node\'s children must not be re-matched as imports');
  assert.doesNotMatch(out, /_root|_repo|\[_all|\[d\[|\[r\d/, 'no internal cell ids in the report');
  // `extends BaseService` and `@Injectable` share one conform set, so correlation dedup (§9.4e) folds them into ONE fact: the lead speaks, the other is counted in nSurfaces
  assert.ok(out.includes('types here extend `BaseService`') || out.includes('types here are annotated with `@Injectable`'));
  // §030: a template line (mineTemplates/profileOf, unclustered residue) has no cell in part.facts — check/review/
  // hooks cannot fail a member for breaking it — so it must say so; a genuine, ENFORCED part.facts convention
  // (the @Handler line already asserted above) must not carry the same disclaimer.
  const templateLines = out.split('\n').filter(l => l.includes('template (unclustered'));
  assert.ok(templateLines.length >= 1, 'no template line found — fixture regressed:\n' + out);
  for (const l of templateLines) assert.match(l, /descriptive only — check has no cell for a template's shape, so a member breaking it is never flagged/, `template line must be marked descriptive: ${l}`);
  const handlerLine = out.split('\n').find(l => l.includes('types here are annotated with `@Handler`'));
  assert.doesNotMatch(handlerLine, /descriptive only/, `a genuine, enforced convention must not carry the template disclaimer: ${handlerLine}`);
});

test('where: intent → directory card with expectations and exemplars; no match → compact map', () => {
  const { out } = grain(['where', 'handler']);
  assert.match(out, /«handler» → directory src\/handlers\//);
  assert.match(out, /types here are annotated with `@Handler` — 100% of \d+/);
  assert.match(out, /pattern to copy: src\/handlers\/[a-z]+\.handler\.ts:\d+(?:–\d+)? `\w+`/);
  const map = grain(['where', 'kafka', 'consumer']).out;
  assert.match(map, /no lexical match for "kafka consumer" — compact map/);
  assert.match(map, /\[directory\] src\/handlers\//);
  assert.match(map, /\[group\] .* → src\/guards\//);
});

test('check: the planted deviant is reported with evidence, the locality line and exemplars; a conforming file is not', () => {
  // the deviant is committed, so its deviation is "pre-existing" — folded into a count by default, listed in full with --all
  const folded = grain(['check', 'src/handlers/dispute.handler.ts']).out;
  assert.match(folded, /0 deviation\(s\) in your change, \d+ pre-existing/);
  assert.match(folded, /pre-existing .*@Handler/);
  const dev = grain(['check', 'src/handlers/dispute.handler.ts', '--all']).out;
  assert.match(dev, /(local \(src\/handlers\/\)|package src\/handlers) convention: types here are annotated with `@Handler`/); // MDL cuts made src/handlers its own partition — the norm speaks partition-wide
  assert.match(dev, /\d+\/\d+ established types conform\. Pre-existing: 1 type not touched by your change \(`CreateDisputeHandler` \(line \d+\)\) is not annotated with `@Handler`\./);
  // (pre-MDL-cuts the @Handler norm was directory-local and drew a locality-contrast line; as a partition norm it draws none)
  assert.match(dev, /See: src\/handlers\/\w+\.handler\.ts:\d+(?:–\d+)? `\w+Handler`/);
  assert.match(dev, /\(preference gap \d+\.\d+ bits\)/);
  const ok = grain(['check', 'src/handlers/order.handler.ts']).out;
  assert.doesNotMatch(ok, /is not annotated with `@Handler`/);
  assert.match(ok, /conforms to: .*@Handler/);
});

test('check reads the worktree version and marks it +dirty; worktree edits never trigger a rebuild', () => {
  const f = join(repo, 'src', 'guards', 'order.guard.ts'); const orig = readFileSync(f, 'utf8');
  writeFileSync(f, orig.replace('return true;', 'return false;'));
  try { const { out, err } = grain(['check', 'src/guards/order.guard.ts']);
    assert.match(out, /as of [0-9a-f]{7}\+dirty$/);
    assert.doesNotMatch(err, /indexing/);
    // two, not one: the edited `return false;` departs from the group's `auto.stshape:` convention AND from the
    // group's structural shape (§J5.8) — the template of all 30 `canActivate` bodies carries the `true` literal
    assert.match(out, /2 deviation\(s\) in your change/);
    assert.match(out, /activate\+can shape: methods here all carry `true`/);
    assert.match(out, /Your method `canActivate` \(line \d+\)/, 'the dirty content is what gets checked, and the edited scope is reported as part of the change'); }
  finally { writeFileSync(f, orig); }
});

test('spectrum lists NORM and obs rows for the file contexts and is identical with and without the scope cache', () => {
  const a = grain(['spectrum', 'src/dto/order.dto.ts']).out;
  assert.match(a, /^spectrum src\/dto\/order\.dto\.ts — repo-wide( \(small packages merged\))? · \d+ scopes · \d+ cells computed/);
  assert.match(a, /\[NORM\] d\[src\/dto\]:type auto\.extends:BaseDto = true/);
  rmSync(join(repo, '.grain', 'cache', 'tree.json'));
  const b = grain(['spectrum', 'src/dto/order.dto.ts']).out;
  assert.equal(a, b);
});

test('spectrum on a new untracked file agrees with check, not "no scopes extracted" (G20)', () => {
  const dtoBody = readFileSync(join(repo, 'src', 'dto', 'dispute.dto.ts'), 'utf8').replace(/Dispute/g, 'Zz');
  const f = join(repo, 'src', 'dto', 'zz.dto.ts');
  writeFileSync(f, dtoBody);
  try {
    const c = grain(['check', 'src/dto/zz.dto.ts']).out;
    assert.match(c, /· \d+ scopes \+ file ·/, 'check parses the untracked file live and reports real scopes');
    const s = grain(['spectrum', 'src/dto/zz.dto.ts']).out;
    assert.doesNotMatch(s, /no scopes extracted/, 'spectrum must not contradict check for the same untracked file');
    assert.match(s, /^spectrum src\/dto\/zz\.dto\.ts — repo-wide( \(small packages merged\))? · \d+ scopes · \d+ cells computed/);
    assert.match(s, /\[NORM\] d\[src\/dto\]:type auto\.extends:BaseDto = true/);

    // regression control: an untracked file with no minable declarations (unsupported extension, so the fallback
    // parse in the fix can't run either) still gets an honest zero — the message isn't permanently silenced
    const notCode = join(repo, 'src', 'dto', 'notes.md');
    writeFileSync(notCode, 'just some prose, not a declaration\n');
    try { assert.match(grain(['spectrum', 'src/dto/notes.md']).out, /^\(no scopes extracted for src\/dto\/notes\.md\)/); }
    finally { rmSync(notCode); }
  } finally { rmSync(f); }
});

test('explain is a byte-identical alias for spectrum (J1.4), including its flags', () => {
  const a = grain(['spectrum', 'src/dto/order.dto.ts']).out;
  const b = grain(['explain', 'src/dto/order.dto.ts']).out;
  assert.equal(b, a, 'explain must produce exactly the same output as spectrum for the same file');
  const aFlags = grain(['spectrum', 'src/dto/order.dto.ts', '--minbits', '1', '--top', '3']).out;
  const bFlags = grain(['explain', 'src/dto/order.dto.ts', '--minbits', '1', '--top', '3']).out;
  assert.equal(bFlags, aFlags, 'explain must honor --minbits/--top identically to spectrum');
});

test('export: every convention with its sites, anchors and nearest exemplar; check --json mirrors the verdict', () => {
  const { out, code, err } = grain(['export', '--compact']); assert.equal(code, 0, err);
  const d = JSON.parse(out.split('\n').find(l => l.startsWith('{')));
  assert.equal(d.schema, 'grain-export/1'); assert.ok(d.summary.conventions > 10, 'conventions exported'); assert.ok(d.summary.groups > 3);
  const handler = d.conventions.find(c => c.feature.enumerator === 'deco' && c.feature.argument === '@Handler' && c.expected === 'true' && (c.context.type === 'directory' || c.context.type === 'partition'));
  assert.ok(handler, 'the @Handler convention is exported (dir- or partition-level after MDL cuts)'); assert.ok(handler.conformingSites.length >= 20);
  const dev = handler.deviatingSites.find(x => x.rel === 'src/handlers/dispute.handler.ts');
  assert.ok(dev, 'the planted deviant is a deviating site'); assert.equal(dev.observed, 'false'); assert.ok(dev.fires); assert.match(dev.nearest.rel, /^src\/handlers\//);
  assert.ok(Array.isArray(dev.focus) && dev.focus.length === 1, 'a decorator site anchors one focus line');
  assert.ok(handler.check.enumerator === 'deco' && handler.lifecycle && handler.lifecycle.firstConforming, 'machine check and lifecycle present');
  const part = d.partitions.find(p => p.kind === 'source'); assert.ok(part.groups.some(g => g.members.every(m => typeof m.line === 'number')), 'group members carry lines');
  assert.ok(part.markers.some(m => m.marker === '@Handler' && m.carriers.every(c => typeof c.line === 'number')), 'marker carriers carry lines');
  assert.ok(d.cochange.every(p => p.a.includes('/') && p.b.includes('/')), 'co-change pairs are real file pairs (the fixture has none above the support floor)');
  const cj = JSON.parse(grain(['check', 'src/handlers/dispute.handler.ts', '--json']).out.split('\n').find(l => l.startsWith('{')));
  assert.equal(cj.file, 'src/handlers/dispute.handler.ts'); assert.ok(cj.deviationsPreExisting.some(x => x.pid.startsWith('auto.deco:@Handler')));
  assert.ok(cj.governed.length > 0 && cj.deviationsInChange.length === 0);
  assert.equal(cj.hasError, false, 'a cleanly-parsed file carries hasError:false alongside the rest of the verdict, unchanged');
});

test('steering: a committed seed promotes a pattern — the retired rule mutes, where/check/report carry the decision, and rm withdraws it', () => {
  // before: the planted handler without validate() deviates from "methods here call `validate`"
  assert.match(grain(['check', 'src/handlers/dispute.handler.ts', '--all']).out, /call `validate`/);
  // a seed without surfaces is refused with the menu of the scope's surfaces
  const menu = grain(['seed', 'add', 'src/handlers/dispute.handler.ts#handle']).out;
  assert.match(menu, /choose which to promote/); assert.match(menu, /auto\.call:this\.service\.apply = true/);
  const add = grain(['seed', 'add', 'src/handlers/dispute.handler.ts#handle', '--surfaces', 'auto.call:validate', '--note', 'validate() moves into the framework — ADR-7', '--topic', 'handler validation', '--author', 'kd']);
  assert.equal(add.code, 0, add.err); assert.match(add.out, /recorded seed [0-9a-f]{8}/); assert.match(add.out, /never call `validate`/);
  const id = add.out.match(/recorded seed ([0-9a-f]{8})/)[1];
  assert.ok(existsSync(join(repo, '.grain', 'seeds.jsonl')) && existsSync(join(repo, '.grain', 'decisions.jsonl')) && existsSync(join(repo, '.grain', '.gitattributes')));
  assert.match(readFileSync(join(repo, '.grain', '.gitattributes'), 'utf8'), /seeds\.jsonl merge=union/);
  // the next query re-mines with the seed (same HEAD): the validate rule and its correlated statement shape stop firing
  const after = grain(['check', 'src/handlers/dispute.handler.ts', '--all']); assert.match(after.err, /indexing/);
  assert.doesNotMatch(after.out, /call `validate`/); assert.doesNotMatch(after.out, /sibling surface/); assert.match(after.out, /@Handler/);
  // where: the decision renders on the directory and group cards, beside what is practiced
  const w = grain(['where', 'handler', 'validation']).out;
  assert.match(w, /decision steer \(kd \d{4}-\d{2}-\d{2}\): methods here never call `validate` — practiced by \d+% of \d+ in group «handle» today · validate\(\) moves into the framework — ADR-7 · copy src\/handlers\/dispute\.handler\.ts:\d+ `handle`/);
  // check: a new file written the old way is told about the decision (not as a deviation), one written the new way is clean
  const old = readFileSync(join(repo, 'src', 'handlers', 'order.handler.ts'), 'utf8');
  writeFileSync(join(repo, 'src', 'handlers', 'zz.handler.ts'), old);
  try { const c = grain(['check', 'src/handlers/zz.handler.ts']).out;
    // zz.handler.ts is itself a brand-new file, so its own 3 top-level scopes (§010) are ALSO disclosed as new to
    // the index — the headline's own "known deviation(s)" + "unclassified scope(s)" wording reflects that pending
    // disclosure, in the same clause as the deviation count (§010-c), ahead of the (unrelated) steer clause
    assert.match(c, /0 known deviation\(s\) in your change, 0 pre-existing, 3 unclassified scope\(s\) · 1 maintainer decision\(s\) your change departs from/);
    assert.match(c, /\[grain\] decision steer \(kd [\d-]+\): methods here never call `validate`[^\n]*Your method `handle` \(line \d+\) calls `validate`\.\n  validate\(\) moves into the framework — ADR-7\n  Copy: src\/handlers\/dispute\.handler\.ts:\d+ `handle`/);
    writeFileSync(join(repo, 'src', 'handlers', 'zz.handler.ts'), old.replace(/^\s*validate\(cmd\);\n/m, ''));
    const c2 = grain(['check', 'src/handlers/zz.handler.ts']).out;
    // the validate() removal drops the steer violation, not the file's own new-scope disclosures (same 3 scopes,
    // unaffected by an inner statement edit) — so the headline still carries them, just without the steer clause
    assert.match(c2, /0 known deviation\(s\) in your change, 0 pre-existing, 3 unclassified scope\(s\)\n/); assert.doesNotMatch(c2, /decision steer \(/);
  } finally { rmSync(join(repo, 'src', 'handlers', 'zz.handler.ts')); }
  const rep = grain(['report']).out; assert.match(rep, /== steers — 1 maintainer decision\(s\)/); assert.match(rep, new RegExp('decision steer \\(id ' + id + ', kd [\\d-]+\\): methods here never call `validate` — practiced by'));
  assert.match(grain(['status']).out, /steers: 1 active/);
  assert.match(grain(['seed', 'list']).out, new RegExp('^' + id + '  src/handlers/dispute.handler.ts#handle  auto.call:validate  weight 8'));
  // the export carries the decision and marks the contested rule
  const d = JSON.parse(grain(['export', '--compact']).out.split('\n').find(l => l.startsWith('{')));
  assert.equal(d.steers.length, 1); assert.ok(d.conventions.some(c => c.contested === id) || d.conventions.every(c => !(c.feature.argument === 'validate')), 'the contested rule is marked or muted');
  // withdraw: the rule speaks again
  assert.match(grain(['seed', 'rm', id]).out, /removed seed/);
  assert.match(grain(['check', 'src/handlers/dispute.handler.ts', '--all']).out, /call `validate`/);
  assert.match(grain(['seed', 'list']).out, /no seeds/);
});

test('a new commit refreshes incrementally and the model equals a full rebuild byte for byte', () => {
  const modelA = readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8');
  const f = join(repo, 'src', 'handlers', 'dispute.handler.ts');
  writeFileSync(f, readFileSync(f, 'utf8').replace('export class CreateDisputeHandler', '@Handler()\nexport class CreateDisputeHandler'));
  git('commit', '-qam', 'fix: decorate dispute handler');
  const { out, err } = grain(['check', 'src/handlers/dispute.handler.ts']);
  assert.match(err, /walking [0-9a-f]{40}\.\.HEAD/);
  assert.match(err, /1 commits, 1 blobs \(0 cached, 1 parsed\)/);
  assert.match(err, /indexing .* \(incremental\)/);
  assert.doesNotMatch(out, /is not annotated with `@Handler`/);
  assert.match(out, new RegExp(`as of ${git('rev-parse', '--short=7', 'HEAD')}$`));
  const incr = readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8');
  assert.notEqual(incr, modelA);
  rmSync(join(repo, '.grain', 'cache'), { recursive: true });
  grain(['status']);
  assert.equal(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'), incr);
});

test('a divergent branch rebuilds from the warm blob cache; --no-refresh answers with a STALE banner', () => {
  const main = git('rev-parse', '--short=7', 'HEAD');
  git('checkout', '-q', '-b', 'side', 'HEAD~3');
  writeFileSync(join(repo, 'src', 'core', 'side.ts'), 'export const side = 1;\n');
  git('add', '-A'); git('commit', '-qm', 'side');
  const side = git('rev-parse', '--short=7', 'HEAD');
  const stale = grain(['where', 'guard', '--no-refresh']);
  assert.match(stale.out, new RegExp(`^STALE: indexed at ${main}, HEAD is ${side} — run \`grain refresh\``));
  assert.match(stale.out, new RegExp(`as of ${main} \\(STALE\\)$`));
  const fresh = grain(['status']);
  assert.match(fresh.err, /walking full history/);
  assert.match(fresh.err, /\(\d+ cached, 1 parsed\)/);
  assert.match(fresh.out, new RegExp(`as of ${side}$`));
  git('checkout', '-q', 'main');
});

test('session-context prints one JSON envelope per runtime and never rebuilds', () => {
  const claude = JSON.parse(grain(['session-context', '--mode', 'claude'], { input: JSON.stringify({ cwd: repo, hook_event_name: 'SessionStart' }) }).out);
  assert.equal(claude.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(claude.hookSpecificOutput.additionalContext, /grain is available here/);
  assert.match(claude.hookSpecificOutput.additionalContext, /Index: built at [0-9a-f]{7}, HEAD moved to [0-9a-f]{7}/);
  assert.ok(JSON.parse(grain(['session-context', '--mode', 'copilot']).out).additionalContext);
  assert.ok(JSON.parse(grain(['session-context', '--mode', 'cursor']).out).additional_context);
  assert.equal(JSON.parse(grain(['session-context', '--mode', 'codex']).out).hookSpecificOutput.hookEventName, 'SessionStart');
  const elsewhere = grain(['session-context'], { cwd: tmp });
  assert.equal(elsewhere.code, 0); assert.match(elsewhere.out, /not built yet/);
});

test('mutation harness: planted deviations are detected, conforming exemplars stay silent', () => {
  grain(['status']);
  const res = JSON.parse(grain(['mutate-test']).out.replace(/\nas of .*$/, ''));
  assert.equal(res.falseFire, 0, JSON.stringify(res));
  assert.equal(res.missed, 0, JSON.stringify(res));
  assert.ok(res.detected >= 4, JSON.stringify(res));
});

test('a repository without git is indexed on file signatures', () => {
  const plain = join(tmp, 'plain'); cpSync(repo, plain, { recursive: true }); rmSync(join(plain, '.git'), { recursive: true }); rmSync(join(plain, '.grain'), { recursive: true });
  const a = grain(['status'], { cwd: plain });
  assert.match(a.out, /as of no-git$/); assert.match(a.out, /no git repository/);
  assert.match(a.out, / 0 conventions .* no git history: nothing counts as established/, 'fail-closed: without history nothing is established, so nothing is spoken');
  assert.match(grain(['where', 'guard'], { cwd: plain }).out, /→ (group|directory) .*guard/i, 'groups and placement still answer where');
  appendFileSync(join(plain, 'src', 'core', 'dto.ts'), '\nexport class Extra {}\n');
  const b = grain(['status'], { cwd: plain });
  assert.match(b.err, /indexing/);
});
