// engine/file-size-budget (advisory, errs: exact)
//
// A module must fit in the DEFAULT reviewer budget, 50 000 characters. The number is derived, not
// chosen: it is the ceiling one assembled reviewer prompt is checked against, so a module above it
// cannot be judged as a whole by anything. Measuring the character count of the file is exactly the
// question — no approximation in either direction.

const BUDGET = 50000;

export function check(ctx) {
  const violations = [];

  for (const file of ctx.files) {
    const size = file.content.length;
    if (size <= BUDGET) continue;
    const over = Math.round((size / BUDGET) * 10) / 10;
    violations.push({
      file: file.path,
      line: 1,
      column: 0,
      message:
        `Module is ${size} characters — ${over}x the 50 000-character reviewer budget.\n` +
        `A module larger than one reviewer prompt cannot be judged as a whole: no rule stated about it ` +
        `can be verified, and in practice no reader holds it either.\n` +
        `Split it along a seam the file already has (its own section headings are the usual one) rather ` +
        `than raising the ceiling — a raised ceiling moves the number, not the problem.`,
    });
  }

  return violations;
}
