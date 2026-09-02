// §075 (found by the fix-061 agent while fixing §061, deliberately left untouched there — see that ticket's own
// comment: "a separate, pre-existing double-counting fact this ticket does not touch, but real, and worth the
// director's attention"). §061 fixed how a catch/finally clause's BORROWED name is SPOKEN (never as though it
// were the clause's own declared name); it did not touch the underlying scope-walk that decides how many times a
// clause is counted at all. This ticket fixes that: `extractScopes`'s catch/finally collection ran
// `bodyN.descendantsOfType([...])` — a search of the WHOLE subtree below `bodyN`, not stopped at the boundary of
// any nested scope inside it. A method's body is itself inside its enclosing class's body, so the SAME physical
// catch_clause/finally_clause AST node was found once when the class was walked (bodyN = the class body) and
// again when the method was walked (bodyN = the method body) — one real clause in the source becoming TWO scope
// entries in the model, inflating any population count built from "how many catch blocks exist".
//
// Fix: a node is claimed by its NEAREST enclosing scope-bearing ancestor only. The walk visits an ancestor
// strictly before any of its descendants (a scope's own catch/finally collection runs before `pushKids` puts its
// children on the stack), so a clause's nearest enclosing scope is always the LAST one to claim it. Keying the
// claim by the clause's own AST node id and letting a later claim overwrite an earlier one (instead of pushing a
// second entry) yields exactly one scope per physical clause, independent of nesting depth or grammar — no
// per-language special case, purely a fact about which ancestor is nearest in the tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

test('extraction: a class > method > try/catch/finally clause is counted ONCE, not once per enclosing ancestor (Java)', async () => {
  const src = `package pkg;
public class PetController {
  public void findOwner() {
    try {
      doWork();
    } catch (Exception e) {
      handleSilently(e);
    } finally {
      cleanup();
    }
  }
  private void doWork() {}
  private void handleSilently(Exception e) {}
  private void cleanup() {}
}
`;
  const p = await getParser('.java');
  const b = bindingFor(p._g);
  const tree = p.parse(src);
  const scopes = extractScopes('PetController.java', tree, b, p._g);
  const catches = scopes.filter(s => s.kind === 'catch');
  const finallies = scopes.filter(s => s.kind === 'finally');
  assert.equal(catches.length, 1, 'one physical catch clause must produce exactly one scope entry, not one per enclosing ancestor (class AND method)');
  assert.equal(finallies.length, 1, 'one physical finally clause must produce exactly one scope entry, not one per enclosing ancestor (class AND method)');
  // the ONE entry that survives is claimed by the NEAREST enclosing scope — the method, not the outer class
  assert.equal(catches[0].name, 'findOwner', 'the surviving entry is claimed by the nearest enclosing scope (the method)');
  assert.equal(finallies[0].name, 'findOwner', 'the surviving entry is claimed by the nearest enclosing scope (the method)');
});

test('extraction: the same nearest-ancestor dedup holds for C# (a second grammar, no language-specific code involved)', async () => {
  const src = `namespace Pkg {
  public class PetController {
    public void FindOwner() {
      try {
        DoWork();
      } catch (Exception e) {
        HandleSilently(e);
      } finally {
        Cleanup();
      }
    }
    private void DoWork() {}
    private void HandleSilently(Exception e) {}
    private void Cleanup() {}
  }
}
`;
  const p = await getParser('.cs');
  const b = bindingFor(p._g);
  const tree = p.parse(src);
  const scopes = extractScopes('PetController.cs', tree, b, p._g);
  const catches = scopes.filter(s => s.kind === 'catch');
  const finallies = scopes.filter(s => s.kind === 'finally');
  assert.equal(catches.length, 1, 'C#: one physical catch clause, one scope entry — the fix is not Java-specific');
  assert.equal(finallies.length, 1, 'C#: one physical finally clause, one scope entry — the fix is not Java-specific');
  assert.equal(catches[0].name, 'FindOwner');
  assert.equal(finallies[0].name, 'FindOwner');
});

test('extraction: three levels of nesting (outer class > inner class > method > try/catch) still yields exactly one scope, claimed by the innermost (Java)', async () => {
  const src = `package pkg;
public class Outer {
  public static class Inner {
    public void run() {
      try {
        doWork();
      } catch (Exception e) {
        handleSilently(e);
      }
    }
    private void doWork() {}
    private void handleSilently(Exception e) {}
  }
}
`;
  const p = await getParser('.java');
  const b = bindingFor(p._g);
  const tree = p.parse(src);
  const scopes = extractScopes('Outer.java', tree, b, p._g);
  const catches = scopes.filter(s => s.kind === 'catch');
  assert.equal(catches.length, 1, 'three nested body-bearing ancestors (outer class, inner class, method) must still yield exactly one scope');
  assert.equal(catches[0].name, 'run', 'claimed by the innermost (nearest) enclosing scope, not either enclosing class');
});
