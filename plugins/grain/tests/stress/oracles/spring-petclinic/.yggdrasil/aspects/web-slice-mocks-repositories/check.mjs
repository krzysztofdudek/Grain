import { walk, report } from '@chrisdudek/yg/ast';

// In a @WebMvcTest, a field whose type ends in Repository must be a mock
// (@MockitoBean / @MockBean / @Mock), never @Autowired.
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      if (node.type !== 'field_declaration') return;
      const type = node.childForFieldName('type');
      if (!type || !/Repository(<.*>)?$/.test(type.text.trim())) return;
      const modifiers = node.namedChildren.find((c) => c.type === 'modifiers');
      const text = modifiers ? modifiers.text : '';
      if (/@(MockitoBean|MockBean|Mock)\b/.test(text)) return;
      violations.push(
        report(
          file,
          node,
          `slice test holds a real ${type.text.trim()} — a @WebMvcTest answers whether the controller maps, binds, validates and picks the right view, and a real repository turns that into a database test wearing the wrong annotation`,
        ),
      );
    });
  }
  return violations;
}
