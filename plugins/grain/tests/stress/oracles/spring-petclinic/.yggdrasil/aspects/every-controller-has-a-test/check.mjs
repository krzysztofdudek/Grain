const CONTROLLER_NODES = ['app/owner/web', 'app/vet/web', 'app/system/web'];
const TEST_NODES = ['tests/web-slice', 'tests/unit'];

// Runs on the slice-test component and looks the other way round from the
// usual sibling-test rule: it walks the controller components this component
// declares a relation to, and asserts each controller file has a test class
// named after it, in either test component. The direction matters — a
// controller must never depend on its test, so the rule lives on the test
// side, where the dependency already legitimately points.
export function check(ctx) {
  const violations = [];

  const tests = [];
  for (const id of TEST_NODES) {
    const node = reach(ctx, id);
    if (node) tests.push(...node.files);
  }
  tests.push(...ctx.files);
  const testNames = new Set(tests.map((f) => basename(f.path)));

  for (const id of CONTROLLER_NODES) {
    const node = reach(ctx, id);
    if (!node) {
      violations.push({
        message: `cannot reach controller component '${id}' — add a 'uses' relation to it in this component's yg-node.yaml so this rule can see the controllers it is checking`,
      });
      continue;
    }
    for (const file of node.files) {
      const name = basename(file.path);
      if (!name.endsWith('Controller.java')) continue;
      const expected = `${name.replace(/\.java$/, '')}Tests.java`;
      if (testNames.has(expected)) continue;
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message: `controller '${name}' has no test class — expected ${expected} in the slice or unit test component; a wrong view name or a missing model attribute compiles cleanly and fails only in a browser`,
      });
    }
  }

  return violations;
}

function reach(ctx, id) {
  try {
    return ctx.graph.node(id) ?? null;
  }
  catch {
    return null;
  }
}

function basename(path) {
  return path.split('/').pop() ?? path;
}
