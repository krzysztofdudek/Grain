// stress/every-instrument-has-a-guardian-test (advisory, errs: under)
//
// Each instrument file must be named by at least one file in the conformance suite. Nothing runs an
// instrument on a push, so nothing notices when one rots — and instruments are the only reason this
// project's measured claims are believed. A guardian test holds the contract, not the runtime.
//
// Matching is by filename appearing anywhere in a suite file's text: a guardian may spawn the
// instrument, import it, or assert on its shape, and all three mention it by name. The instrument set
// comes from the declared relation to the instrument component, not from a directory listing.

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
        `This rule pairs each instrument with the guardian test that keeps its contract honest, so it ` +
        `has to see which instruments exist.\n` +
        `Declare a relation from this component to '${INSTRUMENTS}' in its yg-node.yaml.`,
      line: 1,
      column: 0,
    });
    return violations;
  }
  if (!instruments) return violations;

  const suiteText = ctx.files.map((f) => f.content).join('\n');

  for (const file of instruments.files) {
    if (!file.path.endsWith('.mjs')) continue;
    const name = file.path.split('/').pop();
    if (suiteText.includes(name)) continue;
    // Reported without a file anchor: the offending file belongs to the instrument component, not to
    // this one, and a check may only anchor a violation on a file it was actually given.
    violations.push({
      line: 1,
      column: 0,
      message:
        `Instrument '${file.path}' is named by no test in the suite.\n` +
        `Nothing runs it on a push, so nothing notices when it stops importing, stops parsing, or ` +
        `quietly starts measuring something else — and the record it produced then becomes ` +
        `unfalsifiable rather than merely wrong.\n` +
        `Add a small guardian test that holds this instrument's contract (that it loads, and that its ` +
        `output keeps the shape the record depends on), the way the other instruments here already have.`,
    });
  }

  return violations;
}
