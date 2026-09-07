// A Java file must begin with the project's Apache 2.0 header block. The year
// range is matched as a shape, not against the current year: a check that read
// the clock would give a different answer on a different day, and a verdict
// has to mean the same thing whenever it is replayed.
const COPYRIGHT_LINE = /^\s*\*\s*Copyright \d{4}-\d{4} the original author or authors\.\s*$/m;
const LICENCE_LINE = /Licensed under the Apache License, Version 2\.0/;

export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    const head = file.content.slice(0, 1200);
    if (!head.startsWith('/*')) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message: 'file does not open with the Apache 2.0 licence header block',
      });
      continue;
    }
    if (!COPYRIGHT_LINE.test(head)) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message: 'opening comment is not the project licence header — expected a "Copyright <from>-<to> the original author or authors." line',
      });
      continue;
    }
    if (!LICENCE_LINE.test(head)) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message: 'header names a copyright but not the Apache License, Version 2.0 this project is published under',
      });
    }
  }
  return violations;
}
