# Kolejka — pisze lead, czyta lead na początku każdej tury. Format: ticket · klasa agenta · gałąź · stan

## Fala 1 (dyrektor jako tymczasowy hub) — zamykanie
045 · Sonnet · fix/045 · merged (9064c23 → main)
044 · Sonnet · fix/044 · merged (423119e → main)
016 · Sonnet · fix/016 · merged (8d9a1a7 → main)
049 · Opus   · fix/049 · merged (17f5e08 → main; 567 fabricated supertypes dropped, 0 added)
A audytor twierdzeń      · Sonnet · instr/claim-auditor       · running
B pokrycie deklaracji    · Sonnet · instr/decl-recall         · merged (35f054b → main; `selftest --extract`; leveldb 0.94/1.00, petclinic 1.00/0.97, Lua 1.00/0.23 oracle-bound)
D fixture'y ujawnień     · Sonnet · instr/disclosure-fixtures · merged (5470fe4 → main; 6 green pins, 4 todo contracts: 041/057/053/046)
F korpus + drabina skali · Sonnet · instr/corpus-ladder       · running
054 pomiar · Opus · (read-only) · done → split into 054a/054b, 055 root cause
047 pomiar · Opus · (read-only) · done → disclosure APPROVED, queued as fix/047 in wave 2

## Między falami (dyrektor)
- EXTR_V g30→g31 (jedno podbicie: 018/040/043/045/016/049)
- przeformatowanie silnika (Prettier, jeden commit, zero logiki) — dopiero gdy żadna gałąź nie wisi
- uruchomienie leada z tym plikiem
- **przebudować store `petclinic` w scratchpadzie** (`rm -rf <scratchpad>/petclinic/.grain` + reindex) — odbudowany
  przez agenta na złej bazie silnikiem 0.2.1/g24/m15; każdy pomiar na nim przed przebudową jest niewiarygodny

## Fala 2 — queued (kolejność po wadze i dźwigni)
047  · Sonnet · fix/047  · queued · HIGH — below-floor disclosure naming nearest certifying group's requirement; gated on fire rate (spec in ticket)
054a · Sonnet · fix/054a · queued · HIGH — shallow-clone gate kills 14,674 already-accepted cells; key on need, not on shallow flag
054b · Sonnet · fix/054b · queued · HIGH — PHP `#[` sigil in extractScopes deco regex; 0 → 37 attribute facts; EXTR_V
055  · Sonnet · fix/055  · queued · HIGH — chunked history serialisation + loud failure; history.mjs:270
041  · Sonnet · fix/041  · queued · HIGH — coverage note must not certify absence (C/C++ counted as covered with 0 edges); floor = truthful note
057  · Sonnet · fix/057  · queued · HIGH — `what` honest-negative must consult no-grammar files; `explain` "no grammar" ≠ "no scopes"
059  · Sonnet · fix/059  · queued · HIGH — PHP PSR-4 `use` edges unresolved (Symfony 2 bogus edges, 44 real missed)
050  · Sonnet · fix/050  · queued · Scala `object_definition` not type-like; derive, plus all-23-grammar type-node test
051  · Sonnet · fix/051  · queued · `map --json` omits concepts/changes/edges; cross-check parity test
053  · Sonnet · fix/053  · queued · `review` drops `check`'s parse-degraded caveat; + Scala parse coverage note
046  · Sonnet · fix/046  · queued · `selftest 0/0/0/0` must say why (after D fixture pins the contract)
042  · Opus   · measure  · queued · style convention file-vs-literal granularity — establish before fixing
052  · Opus   · measure  · queued · `what` siblings precision, §044 method
056  · Sonnet · measure  · queued · data-grammar keys as declarations? decide, document
058  · Sonnet · fix/058  · queued · JSON scored against PHP-shaped cells; grammar-scoped populations
048  · Sonnet · fix/048  · queued · low — `@` sigil rendered for sigil-less languages; derive or bare name
C cross-check par powierzchni · Sonnet · instr/cross-check · queued
040-rest · (verify after 049+reformat) · trailing-attribute-macro-with-body boundary stays recorded
043-rest · covered by 047 (deviant exclusion) — not a separate fix

## Projekty dyrektora (klasa E i G) — uruchomione równolegle z falą 1, tylko do odczytu
G katalog pytań     · Opus · research/G-catalog   · running — mines .temp/stress/trials/*/without.jsonl for implicit questions; grades grain per type; gap list ranked by frequency × price × derivability
E dźwignia `where`  · Opus · research/where-lever · running — leak-free failure attribution by evidence source; ≤3 lever experiments judged on selftest --where; recommendation, nothing lands
