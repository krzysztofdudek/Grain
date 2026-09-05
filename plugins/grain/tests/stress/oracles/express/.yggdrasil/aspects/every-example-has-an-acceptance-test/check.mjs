// A whole-suite rule, so it runs once over the acceptance node rather than
// once per file: no single acceptance suite can know whether an example is
// missing one.
//
// WHAT   for every directory under examples/ that has an index.js, there is an
//        acceptance suite of the same name.
// WHY    an example is the code people copy. Without a suite mounting it, an
//        example keeps compiling against a version of express that no longer
//        exists and nobody finds out until someone follows it. This is the
//        rule that would have caught the seven uncovered examples in this
//        repository, and it is advisory precisely because those seven exist
//        today - it is a backlog, stated once, in the place that can prove it.
// NEXT   add `test/acceptance/<name>.js` that requires `examples/<name>` and
//        drives it through supertest; that also forces the example to export
//        its app and guard its listen call, which is what makes it safe to
//        require.
//
// This check reads the examples directory through the acceptance node's
// declared `uses` relation. That relation is what makes the read legal - it is
// the same edge the suites themselves take.

export function check (ctx) {
  const violations = [];

  const entries = ctx.fs.list('examples');
  const directories = entries
    .filter(e => e.kind === 'dir')
    .map(e => e.name)
    .sort();

  const covered = new Set(
    ctx.files
      .filter(f => f.path.endsWith('.js'))
      .map(f => f.path.split('/').pop().replace(/\.js$/, ''))
  );

  for (const name of directories) {
    if (ctx.fs.exists(`examples/${name}/index.js`) !== 'file') continue;
    if (covered.has(name)) continue;
    violations.push({
      file: `examples/${name}/index.js`,
      line: 1,
      column: 0,
      message: `No acceptance suite mounts this example. Add test/acceptance/${name}.js so the example is executed on every run instead of being prose that compiles against an express nobody ships any more.`,
    });
  }

  return violations;
}
