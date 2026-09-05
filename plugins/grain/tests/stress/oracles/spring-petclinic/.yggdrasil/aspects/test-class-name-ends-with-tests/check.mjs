// The file holding tests must be named *Tests.java. Checked on the file name
// rather than the class name so a nested @Nested class inside a correctly
// named file is not reported.
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    const base = file.path.split('/').pop() ?? file.path;
    if (base.endsWith('Tests.java')) continue;
    violations.push({
      file: file.path,
      line: 1,
      column: 0,
      message: `test class file '${base}' does not end in Tests.java — test selection is by name pattern, so the singular form can drop out of a run without anyone noticing`,
    });
  }
  return violations;
}
