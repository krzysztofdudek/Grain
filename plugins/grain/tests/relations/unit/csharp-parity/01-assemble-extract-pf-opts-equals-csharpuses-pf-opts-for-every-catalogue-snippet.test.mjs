import { test } from 'node:test';
import { expect, withParsedFiles, csharp } from '../_unit-harness.mjs';
const { csharpUses, collectGlobalUsings, collectGlobalUsingAliases, extractCsharpRefs, assembleCsharpCandidates } = csharp;

/**
 * Parity oracle for the C# extract/assemble split.
 *
 * The C# catalogue under reference/relations/csharp/*.md is a READ-ONLY oracle. This test
 * loads every ```csharp path=…``` snippet from those files (mirroring reference-case-runner's
 * `## Files` parsing — never edited to fit the split), parses each into a ParsedFile, and
 * asserts that the two-phase pipeline
 *     assembleCsharpCandidates(extractCsharpRefs(pf), options)
 * deep-equals the single-phase public entry
 *     csharpUses(pf, options)
 * byte-identically — for representative `options` INCLUDING the cross-file project-global
 * usings + aliases that the C# pre-pass aggregates (the exact seam the split must preserve).
 *
 * // grain adaptation: Yggdrasil's version reads reference/relations/csharp/*.md from disk at
 * // test time via loadCsharpSnippets(); grain has no such reference catalogue on disk, so the
 * // same 118 ```csharp path=…``` snippets (54 cases) are embedded inline below, extracted
 * // once from that catalogue with the identical parsing logic (frontmatter strip, "## Files"
 * // section, ```csharp path=<repo-rel>\n<code>``` fence regex). No filesystem read happens
 * // at test run time. // grain adaptation: no ensureLoaderRegistered() — grain's parser needs
 * // no loader-hook registration (getParser is used directly by the harness).
 */

// Every ```csharp path=…``` snippet from every reference/relations/csharp/*.md catalogue file,
// grouped implicitly by caseId (grouped explicitly below via groupByCase).
const SNIPPETS = [
  {
    "caseId": "csharp-alias-anytype-embedded",
    "filePath": "src/c/Use.cs",
    "code": "using Pair = (int Id, Mod.Customer Cust);\nusing Arr = Mod.Order[];\nclass C { Pair p; Arr a; }\n"
  },
  {
    "caseId": "csharp-alias-anytype-embedded",
    "filePath": "src/m/Customer.cs",
    "code": "namespace Mod;\npublic class Customer { }\n"
  },
  {
    "caseId": "csharp-alias-anytype-embedded",
    "filePath": "src/o/Order.cs",
    "code": "namespace Mod;\npublic class Order { }\n"
  },
  {
    "caseId": "csharp-alias-closed-generic",
    "filePath": "src/c/Use.cs",
    "code": "using L = System.Collections.Generic.List<MyApp.Models.Customer>;\nnamespace App;\nclass C { L _x; }\n"
  },
  {
    "caseId": "csharp-alias-closed-generic",
    "filePath": "src/m/Customer.cs",
    "code": "namespace MyApp.Models;\npublic class Customer {}\n"
  },
  {
    "caseId": "csharp-alias-member-codefinition-silence",
    "filePath": "src/c/Use.cs",
    "code": "using I = N.Thing;\nnamespace App;\nclass C : I { }\n"
  },
  {
    "caseId": "csharp-alias-member-codefinition-silence",
    "filePath": "src/n/Thing.cs",
    "code": "namespace N;\npublic class Thing {}\n"
  },
  {
    "caseId": "csharp-alias-member-codefinition-silence",
    "filePath": "src/app/I.cs",
    "code": "namespace App;\npublic class I {}\n"
  },
  {
    "caseId": "csharp-attribute-usage",
    "filePath": "src/c/Use.cs",
    "code": "using N;\n[Foo]\nclass C { }\n"
  },
  {
    "caseId": "csharp-attribute-usage",
    "filePath": "src/n/Foo.cs",
    "code": "namespace N;\npublic class FooAttribute : System.Attribute {}\n"
  },
  {
    "caseId": "csharp-bare-member-type",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C { Foo _f; }\n"
  },
  {
    "caseId": "csharp-bare-member-type",
    "filePath": "src/n/Foo.cs",
    "code": "namespace N;\npublic class Foo {}\n"
  },
  {
    "caseId": "csharp-base-interface-list",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C : Base, IFoo { }\n"
  },
  {
    "caseId": "csharp-base-interface-list",
    "filePath": "src/n/Types.cs",
    "code": "namespace N;\npublic class Base {}\npublic interface IFoo {}\n"
  },
  {
    "caseId": "csharp-block-namespace-nested-fqn",
    "filePath": "src/t/T.cs",
    "code": "namespace A.B { namespace C { class T { } } }\n"
  },
  {
    "caseId": "csharp-block-namespace-nested-fqn",
    "filePath": "src/c/Use.cs",
    "code": "namespace Other;\nclass D { void M() { var o = new A.B.C.T(); } }\n"
  },
  {
    "caseId": "csharp-catch-exception-type",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C { void M() { try { } catch (AppError e) { } } }\n"
  },
  {
    "caseId": "csharp-catch-exception-type",
    "filePath": "src/n/AppError.cs",
    "code": "namespace N;\npublic class AppError : System.Exception { }\n"
  },
  {
    "caseId": "csharp-collection-expression-no-site-edge",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nusing System.Collections.Generic;\nclass C { void M(Foo a, Foo b) { List<Foo> xs = [a, b]; } }\n"
  },
  {
    "caseId": "csharp-collection-expression-no-site-edge",
    "filePath": "src/n/Foo.cs",
    "code": "namespace N;\npublic class Foo {}\n"
  },
  {
    "caseId": "csharp-deep-enclosing-chain-walk",
    "filePath": "src/c/Use.cs",
    "code": "namespace App.Services.Sub;\nclass C { void M() { var o = new Models.Order(); } }\n"
  },
  {
    "caseId": "csharp-deep-enclosing-chain-walk",
    "filePath": "src/m/Order.cs",
    "code": "namespace App.Services.Models;\npublic class Order {}\n"
  },
  {
    "caseId": "csharp-default-sizeof-operand",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C { void M() { var d = default(X); var s = sizeof(Y); } }\n"
  },
  {
    "caseId": "csharp-default-sizeof-operand",
    "filePath": "src/n/Types.cs",
    "code": "namespace N;\npublic struct X {}\npublic struct Y {}\n"
  },
  {
    "caseId": "csharp-di-reflection-extension-silence",
    "filePath": "src/c/Use.cs",
    "code": "using Microsoft.Extensions.DependencyInjection;\nclass Startup {\n  void Configure(IServiceCollection services) { services.AddScoped<IFoo, Foo>(); }\n  void R() { var t = System.Type.GetType(\"MyApp.Pay.Gateway\"); }\n  void E(object order) { order.Validate(); }\n}\n"
  },
  {
    "caseId": "csharp-di-reflection-extension-silence",
    "filePath": "src/pay/Gateway.cs",
    "code": "namespace MyApp.Pay;\npublic class Gateway {}\n"
  },
  {
    "caseId": "csharp-extension-receiver-type",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nstatic class Ext { extension(Widget source) { public void Ping() {} } }\n"
  },
  {
    "caseId": "csharp-extension-receiver-type",
    "filePath": "src/n/Widget.cs",
    "code": "namespace N;\npublic class Widget {}\n"
  },
  {
    "caseId": "csharp-extern-alias-no-bind",
    "filePath": "src/c/Use.cs",
    "code": "extern alias Lib;\nclass C : Lib::A.B.Base { }\n"
  },
  {
    "caseId": "csharp-extern-alias-no-bind",
    "filePath": "src/x/Base.cs",
    "code": "namespace A.B;\npublic class Base {}\n"
  },
  {
    "caseId": "csharp-file-local-type-no-cross-file",
    "filePath": "src/h/Helper.cs",
    "code": "namespace App;\nfile class Helper { }\n"
  },
  {
    "caseId": "csharp-file-local-type-no-cross-file",
    "filePath": "src/c/Use.cs",
    "code": "namespace App;\nclass C { Helper h; }\n"
  },
  {
    "caseId": "csharp-file-scoped-namespace-fqn",
    "filePath": "src/x/T.cs",
    "code": "namespace X;\nclass C { }\n"
  },
  {
    "caseId": "csharp-file-scoped-namespace-fqn",
    "filePath": "src/c/Use.cs",
    "code": "namespace Other;\nclass D { void M() { var o = new X.C(); } }\n"
  },
  {
    "caseId": "csharp-fully-qualified-base-list",
    "filePath": "src/c/Use.cs",
    "code": "class C : A.B.C.Type { }\n"
  },
  {
    "caseId": "csharp-fully-qualified-base-list",
    "filePath": "src/t/Type.cs",
    "code": "namespace A.B.C;\npublic class Type {}\n"
  },
  {
    "caseId": "csharp-generic-attribute",
    "filePath": "src/c/Use.cs",
    "code": "using N;\n[Cache<Bar>]\nclass C { }\n"
  },
  {
    "caseId": "csharp-generic-attribute",
    "filePath": "src/n/Bar.cs",
    "code": "namespace N;\npublic class Bar { }\n"
  },
  {
    "caseId": "csharp-generic-attribute",
    "filePath": "src/a/CacheAttribute.cs",
    "code": "namespace N;\npublic class CacheAttribute<T> : System.Attribute { }\n"
  },
  {
    "caseId": "csharp-generic-constraint",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C<T> where T : Constraint { }\n"
  },
  {
    "caseId": "csharp-generic-constraint",
    "filePath": "src/n/Constraint.cs",
    "code": "namespace N;\npublic class Constraint {}\n"
  },
  {
    "caseId": "csharp-generic-type-argument",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C { List<Foo> _x; }\n"
  },
  {
    "caseId": "csharp-generic-type-argument",
    "filePath": "src/n/Foo.cs",
    "code": "namespace N;\npublic class Foo {}\n"
  },
  {
    "caseId": "csharp-global-qualifier-strip",
    "filePath": "src/c/Use.cs",
    "code": "namespace App;\nclass C : global::A.B.Base { }\n"
  },
  {
    "caseId": "csharp-global-qualifier-strip",
    "filePath": "src/g/Base.cs",
    "code": "namespace A.B;\npublic class Base {}\n"
  },
  {
    "caseId": "csharp-global-using-alias",
    "filePath": "src/g/Globals.cs",
    "code": "global using Cust = MyApp.Models.Customer;\n"
  },
  {
    "caseId": "csharp-global-using-alias",
    "filePath": "src/c/Use.cs",
    "code": "class C { Cust c; }\n"
  },
  {
    "caseId": "csharp-global-using-alias",
    "filePath": "src/m/Customer.cs",
    "code": "namespace MyApp.Models;\npublic class Customer { }\n"
  },
  {
    "caseId": "csharp-global-using-same-file",
    "filePath": "src/c/Use.cs",
    "code": "global using N;\nclass C : Type { }\n"
  },
  {
    "caseId": "csharp-global-using-same-file",
    "filePath": "src/n/Type.cs",
    "code": "namespace N;\npublic class Type {}\n"
  },
  {
    "caseId": "csharp-global-using-sibling-file",
    "filePath": "src/g/Globals.cs",
    "code": "global using N;\n"
  },
  {
    "caseId": "csharp-global-using-sibling-file",
    "filePath": "src/c/Use.cs",
    "code": "class C : Type { }\n"
  },
  {
    "caseId": "csharp-global-using-sibling-file",
    "filePath": "src/n/Type.cs",
    "code": "namespace N;\npublic class Type {}\n"
  },
  {
    "caseId": "csharp-global-using-static-target-edge",
    "filePath": "src/g/Globals.cs",
    "code": "global using static N.MathHelpers;\n"
  },
  {
    "caseId": "csharp-global-using-static-target-edge",
    "filePath": "src/n/MathHelpers.cs",
    "code": "namespace N;\npublic static class MathHelpers { }\n"
  },
  {
    "caseId": "csharp-is-as-cast-operand",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C { void M(object o) { var a = o as X; var b = (Y)o; if (o is Z) {} } }\n"
  },
  {
    "caseId": "csharp-is-as-cast-operand",
    "filePath": "src/n/Types.cs",
    "code": "namespace N;\npublic class X {}\npublic class Y {}\npublic class Z {}\n"
  },
  {
    "caseId": "csharp-localfn-lambda-param-type",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C { void M() { Account Build(int id) { return null; } } }\n"
  },
  {
    "caseId": "csharp-localfn-lambda-param-type",
    "filePath": "src/n/Account.cs",
    "code": "namespace N;\npublic class Account { }\n"
  },
  {
    "caseId": "csharp-nameof-no-edge-silence",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C { void M() { var n = nameof(X); } }\n"
  },
  {
    "caseId": "csharp-nameof-no-edge-silence",
    "filePath": "src/n/X.cs",
    "code": "namespace N;\npublic class X {}\n"
  },
  {
    "caseId": "csharp-nearer-scope-hiding",
    "filePath": "src/c/Use.cs",
    "code": "using Ext;\nnamespace App;\nclass C : Repo { }\n"
  },
  {
    "caseId": "csharp-nearer-scope-hiding",
    "filePath": "src/local/Repo.cs",
    "code": "namespace App;\npublic class Repo {}\n"
  },
  {
    "caseId": "csharp-nearer-scope-hiding",
    "filePath": "src/ext/Repo.cs",
    "code": "namespace Ext;\npublic class Repo {}\n"
  },
  {
    "caseId": "csharp-nested-type-deep-generic",
    "filePath": "src/c/Use.cs",
    "code": "namespace App;\nclass C { Outer.Mid.Inner f; }\n"
  },
  {
    "caseId": "csharp-nested-type-deep-generic",
    "filePath": "src/o/Outer.cs",
    "code": "namespace App;\npublic class Outer { public class Mid { public class Inner {} } }\n"
  },
  {
    "caseId": "csharp-nested-type-keying",
    "filePath": "src/a/Nested.cs",
    "code": "namespace App;\nclass Outer { class Inner { } }\n"
  },
  {
    "caseId": "csharp-nested-type-keying",
    "filePath": "src/c/Use.cs",
    "code": "namespace Other;\nclass C { void M() { var x = new App.Outer.Inner(); } }\n"
  },
  {
    "caseId": "csharp-object-creation",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C { void M() { var x = new Bare(); } }\n"
  },
  {
    "caseId": "csharp-object-creation",
    "filePath": "src/n/Bare.cs",
    "code": "namespace N;\npublic class Bare {}\n"
  },
  {
    "caseId": "csharp-partial-name-enclosing-ns",
    "filePath": "src/c/Use.cs",
    "code": "namespace A;\nclass C : B.Type { }\n"
  },
  {
    "caseId": "csharp-partial-name-enclosing-ns",
    "filePath": "src/n/Type.cs",
    "code": "namespace A.B;\npublic class Type {}\n"
  },
  {
    "caseId": "csharp-partial-name-enclosing-ns",
    "filePath": "src/x/Type.cs",
    "code": "namespace B;\npublic class Type {}\n"
  },
  {
    "caseId": "csharp-per-file-using-no-leak",
    "filePath": "src/b/B.cs",
    "code": "class C : Base { }\n"
  },
  {
    "caseId": "csharp-per-file-using-no-leak",
    "filePath": "src/base/Base.cs",
    "code": "namespace A;\npublic class Base {}\n"
  },
  {
    "caseId": "csharp-plain-using-simple-name",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C : Type { }\n"
  },
  {
    "caseId": "csharp-plain-using-simple-name",
    "filePath": "src/n/Type.cs",
    "code": "namespace N;\npublic class Type {}\n"
  },
  {
    "caseId": "csharp-plain-using-simple-name",
    "filePath": "src/x/Type.cs",
    "code": "public class Type {}\n"
  },
  {
    "caseId": "csharp-pointer-stackalloc-element",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C { unsafe void M() { Foo* p = null; var s = stackalloc Foo[4]; } }\n"
  },
  {
    "caseId": "csharp-pointer-stackalloc-element",
    "filePath": "src/n/Foo.cs",
    "code": "namespace N;\npublic struct Foo {}\n"
  },
  {
    "caseId": "csharp-primary-constructor-param-type",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nnamespace App;\nclass C(IDep dep) {}\n"
  },
  {
    "caseId": "csharp-primary-constructor-param-type",
    "filePath": "src/n/IDep.cs",
    "code": "namespace N;\npublic interface IDep {}\n"
  },
  {
    "caseId": "csharp-qualified-field-type",
    "filePath": "src/c/Use.cs",
    "code": "namespace App;\nclass C { Foo.Bar.Dep _d; }\n"
  },
  {
    "caseId": "csharp-qualified-field-type",
    "filePath": "src/d/Dep.cs",
    "code": "namespace Foo.Bar;\npublic class Dep {}\n"
  },
  {
    "caseId": "csharp-record-positional-param-type",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nnamespace App;\nrecord R(Foo A, Bar B);\n"
  },
  {
    "caseId": "csharp-record-positional-param-type",
    "filePath": "src/n/Types.cs",
    "code": "namespace N;\npublic class Foo {}\npublic class Bar {}\n"
  },
  {
    "caseId": "csharp-sdk-simple-name-silence",
    "filePath": "src/c/Use.cs",
    "code": "class C : RepositoryBase { }\n"
  },
  {
    "caseId": "csharp-target-typed-new-no-site-edge",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C { void M() { Foo f = new(); } }\n"
  },
  {
    "caseId": "csharp-target-typed-new-no-site-edge",
    "filePath": "src/n/Foo.cs",
    "code": "namespace N;\npublic class Foo {}\n"
  },
  {
    "caseId": "csharp-tuple-array-nullable-element",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C { (Foo, Bar) _t; Baz[] _a; Qux? _n; }\n"
  },
  {
    "caseId": "csharp-tuple-array-nullable-element",
    "filePath": "src/n/Types.cs",
    "code": "namespace N;\npublic class Foo {}\npublic class Bar {}\npublic class Baz {}\npublic struct Qux {}\n"
  },
  {
    "caseId": "csharp-type-pattern-binding",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C { void M(object o) { if (o is X x) {} } }\n"
  },
  {
    "caseId": "csharp-type-pattern-binding",
    "filePath": "src/n/X.cs",
    "code": "namespace N;\npublic class X {}\n"
  },
  {
    "caseId": "csharp-typeof-operand",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C { void M() { var t = typeof(X); } }\n"
  },
  {
    "caseId": "csharp-typeof-operand",
    "filePath": "src/n/X.cs",
    "code": "namespace N;\npublic class X {}\n"
  },
  {
    "caseId": "csharp-using-alias-colon-colon",
    "filePath": "src/c/Use.cs",
    "code": "using S = N.Sub;\nclass C { S::Tail t; }\n"
  },
  {
    "caseId": "csharp-using-alias-colon-colon",
    "filePath": "src/n/Tail.cs",
    "code": "namespace N.Sub;\npublic class Tail { }\n"
  },
  {
    "caseId": "csharp-using-alias-to-namespace",
    "filePath": "src/c/Use.cs",
    "code": "using Al = N.Sub;\nnamespace App;\nclass C : Al.Type { }\n"
  },
  {
    "caseId": "csharp-using-alias-to-namespace",
    "filePath": "src/n/Type.cs",
    "code": "namespace N.Sub;\npublic class Type {}\n"
  },
  {
    "caseId": "csharp-using-alias",
    "filePath": "src/c/Use.cs",
    "code": "using Gw = Foo.Bar.IGateway;\nnamespace App;\nclass C { void M() { var x = new Gw(); } }\n"
  },
  {
    "caseId": "csharp-using-alias",
    "filePath": "src/g/IGateway.cs",
    "code": "namespace Foo.Bar;\npublic class IGateway { }\n"
  },
  {
    "caseId": "csharp-using-import-cs0104-silence",
    "filePath": "src/c/Use.cs",
    "code": "using A;\nusing B;\nclass C : Foo { }\n"
  },
  {
    "caseId": "csharp-using-import-cs0104-silence",
    "filePath": "src/a/Foo.cs",
    "code": "namespace A;\npublic class Foo {}\n"
  },
  {
    "caseId": "csharp-using-import-cs0104-silence",
    "filePath": "src/b/Foo.cs",
    "code": "namespace B;\npublic class Foo {}\n"
  },
  {
    "caseId": "csharp-using-statement-not-import",
    "filePath": "src/c/Use.cs",
    "code": "using N;\nclass C { void M() { using Resource r = Acquire(); } Resource Acquire() => null; }\n"
  },
  {
    "caseId": "csharp-using-statement-not-import",
    "filePath": "src/n/Resource.cs",
    "code": "namespace N;\npublic class Resource : System.IDisposable { public void Dispose() {} }\n"
  },
  {
    "caseId": "csharp-using-static-no-namespace-prefix",
    "filePath": "src/c/Use.cs",
    "code": "using static Ext.Calc;\nclass D : Baz { }\n"
  },
  {
    "caseId": "csharp-using-static-no-namespace-prefix",
    "filePath": "src/n/Baz.cs",
    "code": "namespace Ext;\npublic class Baz { }\n"
  },
  {
    "caseId": "csharp-using-static-target-edge",
    "filePath": "src/c/Use.cs",
    "code": "using static N.MathHelpers;\nclass C { }\n"
  },
  {
    "caseId": "csharp-using-static-target-edge",
    "filePath": "src/n/MathHelpers.cs",
    "code": "namespace N;\npublic static class MathHelpers { }\n"
  },
  {
    "caseId": "csharp-using-subns-binds-top-level",
    "filePath": "src/c/Use.cs",
    "code": "using A;\nnamespace App;\nclass C : B.Type { }\n"
  },
  {
    "caseId": "csharp-using-subns-binds-top-level",
    "filePath": "src/b/Type.cs",
    "code": "namespace B;\npublic class Type {}\n"
  },
  {
    "caseId": "csharp-using-subns-no-misbind",
    "filePath": "src/c/Use.cs",
    "code": "using A;\nnamespace App;\nclass C : B.Type { }\n"
  },
  {
    "caseId": "csharp-using-subns-no-misbind",
    "filePath": "src/aB/Type.cs",
    "code": "namespace A.B;\npublic class Type {}\n"
  },
  {
    "caseId": "csharp-using-subns-no-misbind",
    "filePath": "src/b/Type.cs",
    "code": "namespace B;\npublic class Type {}\n"
  },
  {
    "caseId": "csharp-verbatim-fqn-ambiguous-silence",
    "filePath": "src/z/Use.cs",
    "code": "namespace MyApp.Z;\nclass Use { void M() { var t = new MyApp.Dup.Thing(); } }\n"
  },
  {
    "caseId": "csharp-verbatim-fqn-ambiguous-silence",
    "filePath": "src/x/Thing.cs",
    "code": "namespace MyApp.Dup;\npublic class Thing {}\n"
  },
  {
    "caseId": "csharp-verbatim-fqn-ambiguous-silence",
    "filePath": "src/y/Thing.cs",
    "code": "namespace MyApp.Dup;\npublic class Thing {}\n"
  }
];


/** Group snippets by case so the cross-file global-using pre-pass runs per case, exactly as
 *  reference-case-runner aggregates `collectGlobalUsings` / `collectGlobalUsingAliases`. */
function groupByCase(snippets) {
  const byCase = new Map();
  for (const s of snippets) {
    const list = byCase.get(s.caseId) ?? [];
    list.push(s);
    byCase.set(s.caseId, list);
  }
  return byCase;
}

test('assemble(extract(pf), opts) equals csharpUses(pf, opts) for every catalogue snippet', async () => {
  const snippets = SNIPPETS;
  expect(snippets.length).toBeGreaterThan(0);

  const byCase = groupByCase(snippets);
  let assertions = 0;

  for (const [, caseSnippets] of byCase) {
    // Parse every file in the case — all trees kept alive simultaneously for the
    // duration of this case (cross-file resolution needs them together), and every
    // one guaranteed deleted (LIFO) once the case's assertions below finish.
    await withParsedFiles(
      caseSnippets.map((s) => ({ path: s.filePath, code: s.code, language: 'csharp' })),
      (files) => {
        const parsed = new Map();
        caseSnippets.forEach((s, i) => parsed.set(s.filePath, files[i]));

        // Build the cross-file project-global using scope exactly as the pre-pass does.
        const globalUsings = new Set();
        const globalAliasMap = new Map();
        for (const s of caseSnippets) {
          const pf = parsed.get(s.filePath);
          for (const prefix of collectGlobalUsings(pf)) globalUsings.add(prefix);
          for (const [name, fqn] of collectGlobalUsingAliases(pf)) globalAliasMap.set(name, fqn);
        }
        const projectGlobalUsings = [...globalUsings];
        const projectGlobalUsingAliases = [...globalAliasMap.entries()];

        // Representative option sets: the empty default AND the cross-file aggregated scope.
        const optionVariants = [
          {},
          { projectGlobalUsings, projectGlobalUsingAliases },
          { projectGlobalUsings },
          { projectGlobalUsingAliases },
        ];

        for (const s of caseSnippets) {
          const pf = parsed.get(s.filePath);
          for (const options of optionVariants) {
            const viaSplit = assembleCsharpCandidates(extractCsharpRefs(pf), options);
            const viaDirect = csharpUses(pf, options);
            expect(viaSplit).toEqual(viaDirect);
            assertions++;
          }
        }
      },
    );
  }

  expect(assertions).toBeGreaterThan(0);
});
