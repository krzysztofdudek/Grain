// stress/instruments-are-not-tests (enforced, errs: under)
//
// The gate globs the test directories for the test-name suffix, so a file in the instrument directory
// carrying that suffix is swept into every push. Instruments run a fixed corpus of real clones, take
// minutes to hours, and report a number rather than a verdict.
//
// The instrument set is read through the declared relation to the instrument component rather than by
// listing a directory: the component already says which files are instruments, and reading it folds
// only that component's identity into the verdict.

const INSTRUMENTS = 'plugin/tests/stress';

export function check(ctx) {
  const violations = [];

  let instruments;
  try {
    instruments = ctx.graph.node(INSTRUMENTS);
  } catch {
    violations.push({
      message:
        `Cannot reach the instrument component '${INSTRUMENTS}'.\n` +
        `This rule keeps a long-running corpus instrument from being swept into the push gate by its ` +
        `filename, so it has to see which files are instruments.\n` +
        `Declare a relation from this component to '${INSTRUMENTS}' in its yg-node.yaml.`,
      line: 1,
      column: 0,
    });
    return violations;
  }
  if (!instruments) return violations;

  for (const file of instruments.files) {
    if (!/\.test\.[cm]?js$/.test(file.path)) continue;
    // Reported without a file anchor: the offending file belongs to the instrument component, not to
    // this one, and a check may only anchor a violation on a file it was actually given.
    violations.push({
      line: 1,
      column: 0,
      message:
        `Instrument '${file.path}' is named like a test.\n` +
        `The gate globs for that suffix, so this file now runs on every push: a fixed corpus of real ` +
        `clones that this repository does not contain, taking minutes to hours, reporting a ` +
        `machine-specific number as a build result.\n` +
        `Rename it without the test suffix. If part of it should run on every push, put that part in a ` +
        `small guardian test in the suite, the way every other instrument here already has one.`,
    });
  }

  return violations;
}
