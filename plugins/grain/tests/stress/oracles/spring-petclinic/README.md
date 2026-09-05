# Hand-written Yggdrasil oracle — spring-petclinic

This directory holds a `.yggdrasil/` architecture graph for
[spring-petclinic](https://github.com/spring-projects/spring-petclinic), written
**by hand** from a reading of the source, to serve as ground truth against which
an automated architecture miner can be measured (precision and recall of types,
components, relations, cycles and rules).

Its whole value is that it was written **blind**. Nothing produced by a miner was
consulted, at any point, in any form.

- **Target repository:** `spring-projects/spring-petclinic`
- **Pinned commit:** `818c4136ea971c21674525f9053de0d9c7ad8cfe`
  (`docs: Fix formatting in Docker container instructions`)
- **Tracked files at that commit:** 132
- **Graph authored against:** Yggdrasil CLI 5.8.0, graph schema 5.2.0

## Method

### What was read

The target repository, and only the target repository:

- Every one of the 46 Java files under `src/`, in full — 26 in `src/main/java`,
  20 in `src/test/java`. Not a sample.
- Every Thymeleaf template (12), every message bundle (12, key counts compared),
  every properties file, every SQL schema and seed script (9).
- `pom.xml`, `build.gradle`, `settings.gradle`, `docker-compose.yml`, both
  Kubernetes manifests, all three GitHub Actions workflows, the Checkstyle
  configuration, `.gitignore`, `.editorconfig`, and the README.
- Git history: `git log` over the full history and `git show` on the commits
  whose subjects suggested a rule (`Be more careful with allowed fields in
  binders`, `Enforce unique pet names per owner`, the PostgreSQL constraint fix,
  `Remove unnecessary @Autowired annotation…`). Several rules below exist
  *because* of a commit that fixed the thing they now forbid.

Yggdrasil's own format was learned from the installed CLI only — `yg prime`,
every `yg schemas read`, the relevant `yg knowledge read` topics — plus
Yggdrasil's own hand-written `.yggdrasil/` graph, read as a worked example.

### What was deliberately not read

- No miner was run against this repository, at all.
- No miner output, proposal, memo, stress result or generator source was opened.
- No pre-existing architecture description of petclinic beyond the target
  repository's own README.

## The graph

| | |
|---|---|
| Node types | **30** — 2 organizational (`module`, `feature-area`) + 28 file-classifying |
| Types with `enforce: strict` | 6 (`application-bootstrap`, `mapped-superclass`, `entity`, `repository`, `controller`, `configuration`) |
| Types with `log_required: true` | 4 (`entity`, `repository`, `controller`, `db-script`) |
| Components (nodes) | **27** — 7 organizational, 20 owning files |
| Files owned by a component | 77 |
| Files covered by their type alone (no component) | 54 |
| Files excluded from coverage | 4 (agent-rules plumbing + `.gitattributes`) |
| Coverage | **135/135**, `required: ["/"]`, `type_level: true` |
| Relations | **35** — 29 `uses`, 4 `calls`, 2 `extends`; 0 `implements`, 0 `emits`/`listens` |
| Relation policy | `default: deny` on every type; each allowed edge is one the code has |
| Flows | 2 (`BookAVisit`, `BrowseVeterinarians`) |
| Aspects | **28** — 23 deterministic (`check.mjs`), 5 judgment (`content.md`) |
| Aspect status | 21 declared `enforced`, 7 declared `advisory`, 0 `draft` |
| Drill corpora | 17 aspects, 34 cases — **34 pass, 0 MISS, 0 FALSE-ALARM** |
| Import cycles | **0** (see below) |

### Components

```
app                    module          —  (organizational)
  app/bootstrap        application-bootstrap   2 files
  app/model            mapped-superclass       3 files
  app/owner            feature-area    —  (organizational)
    app/owner/entities        entity          4 files
    app/owner/repositories    repository      2 files
    app/owner/web             controller      3 files
    app/owner/web-support     web-support     2 files
  app/vet              feature-area    —  (organizational)
    app/vet/entities          entity          2 files
    app/vet/repository        repository      1 file
    app/vet/web               controller      1 file
    app/vet/marshalling       marshalling-dto 1 file
  app/system           feature-area    —  (organizational)
    app/system/config         configuration   2 files
    app/system/web            controller      2 files
ui                     module          —  (organizational)
  ui/templates         template               12 files
resources              module          —  (organizational)
  resources/i18n       message-bundle         12 files
  resources/db-scripts db-script               9 files
tests                  module          —  (organizational)
  tests/unit           unit-test               7 files
  tests/web-slice      web-slice-test          5 files
  tests/data-slice     data-slice-test         1 file
  tests/integration    integration-test        5 files
  tests/support        test-support            2 files
```

The component cut is **forced, not chosen**: a component carries exactly one
type, and a type classifies files, so `owner` cannot be one component holding
entities, repositories and controllers together. The fineness therefore lives
where the ruling says it should — in the types and the rules — while the
components stay ownership-sized (1–12 files each). Everything with nothing to
say beyond its type (templates aside, build files, wrappers, workflows, static
assets, docs, dev-environment files, package-info files) has **no component at
all** and is covered by `coverage.type_level`.

### Two things a generic "Spring layered app" model gets wrong here

1. **`model/` contains no entities.** It holds three `@MappedSuperclass` bases —
   `BaseEntity`, `NamedEntity`, `Person`. Every real `@Entity` lives in its
   feature package (`owner/`, `vet/`). A rule saying "entities live in `model/`"
   would be false for all six entities. The rule that is true, and is the one
   written, is "every entity **extends** one of the `model/` bases".
2. **There is no service layer, deliberately.** Controllers call Spring Data
   repositories directly; the behaviour a service would hold sits on the
   aggregate root (`Owner.addPet`, `Owner.addVisit`). There is no
   `PetRepository` and no `VisitRepository` — pets and visits are written
   through `Owner`'s cascade. No `service` node type is defined, because
   defining one would invite exactly the code the design refuses. The one class
   still *named* after a service is a test (`ClinicServiceTests`).

## Cycles

**There are none.** A dependency graph built over all 46 Java files (imports,
plus same-package references by simple name, with comments and string literals
stripped) has **91 edges and zero cycles** — at file level, at package level
with source roots separated, and at package level with `src/main` and `src/test`
merged into one package space. `yg check`'s own structural-cycle validator
likewise reports nothing across the 35 declared relations.

One near-miss is worth recording because it is exactly the shape a miner is
likely to get wrong: `Vet` ↔ `Specialty` **looks** like a cycle. `Vet` really
does reference `Specialty`; `Specialty`'s body is empty and references nothing —
its only mention of `Vet` is inside a javadoc `{@link Vet Vet's}`. A miner that
resolves type references without excluding comments reports a two-node cycle
here. That is a false positive, and it is the single one this repository offers.

## Aspects

23 rules are deterministic scripts; 5 are prose judged by a reviewer, because
prose is the only honest form for them.

### Enforced — the code satisfies these today, and CI should block on them

| Aspect | Kind | Attached to | What it holds |
|---|---|---|---|
| `entity-extends-shared-base` | det | `entity` | every `@Entity` extends `BaseEntity`/`NamedEntity`/`Person` (6/6) |
| `entity-declares-table-name` | det | `entity` | every `@Entity` declares `@Table(name = …)` (6/6) |
| `domain-free-of-web` | det | `entity`, `mapped-superclass` | no servlet / Spring MVC / UI import in the domain |
| `repository-is-spring-data-interface` | det | `repository` | a repository is an interface extending a Spring Data base, never a class |
| `repository-free-of-web` | det | `repository` | no web import, and never an import of a `*Controller` |
| `no-native-queries` | det | `repository` | `@Query` is JPQL — three dialects run the same code |
| `controller-is-package-private` | det | `controller` | all 6 controllers are package-private |
| `binder-disallows-nested-ids` | det | `controller` | every `@InitBinder` disallows **both** `id` and `*.id` (4/4) |
| `view-name-resolves-to-template` | det | `controller` | every literal view name has a template (8 distinct names, all present) |
| `no-rest-controller` | det | `app` (whole source set) | `@RestController` appears nowhere; the one JSON endpoint uses `@ResponseBody` |
| `constructor-injection-only` | det | all production types | no `@Autowired`/`@Inject`/`@Resource` field or setter in `src/main` (0 occurrences) |
| `no-stdout-in-production-code` | det | production types (raised) | no `System.out`/`System.err`/`printStackTrace` in `src/main` |
| `page-extends-layout-fragment` | det | `template` | all 9 pages compose the shared layout with a menu id |
| `menu-id-is-known` | det | `ui/templates` | the menu id matches an entry the layout actually defines (set derived from the layout) |
| `message-bundles-are-in-sync` | det | `resources/i18n` | 10 translated bundles each carry all 52 base keys; `messages_en` exempt |
| `schema-covers-every-entity-table` | det | `resources/db-scripts` | every `@Table`/`@JoinTable` name is created in all three dialects (7/7 × 3) |
| `dialect-schemas-declare-the-same-tables` | det | `resources/db-scripts` | h2 / mysql / postgres create the same 7 tables |
| `credentials-come-from-the-environment` | det | `app-config` | datasource url/user/password are `${VAR:default}`, never literals |
| `web-slice-mocks-repositories` | det | `web-slice-test` | a `@WebMvcTest` mocks its repositories, never autowires a real one (5/5) |
| `every-controller-has-a-test` | det | `tests/web-slice` | all 6 controllers have a `*ControllerTests` (5 slice, 1 unit) |
| `owner-is-the-aggregate-root` | llm | `app/owner` (cascades) | pets and visits are created, attached and saved through their owner |
| `pet-name-unique-per-owner-in-every-dialect` | llm | `db-script` | the *database*, in all three dialects, makes a case-insensitive duplicate impossible |

### Advisory — intended, but the code violates them today (the refactor backlog)

Every one of these was set to `advisory` on purpose, and each names its
violation. `yg check --approve --only-deterministic` reproduces the first four
exactly:

| Aspect | Kind | Violations at 818c4136 |
|---|---|---|
| `apache-license-header` | det | 3 files carry no header at all: `system/WebConfiguration.java`, `PetClinicConcurrencyTests.java`, `system/I18nPropertiesSyncTest.java`. A 4th, `owner/PetValidatorTests.java`, still says `Copyright 2012-2024` where the other 45 say `2012-2025` — the check deliberately accepts any `YYYY-YYYY` shape rather than reading the clock, so this one is recorded here rather than caught. |
| `test-class-name-ends-with-tests` | det | `system/I18nPropertiesSyncTest.java` — singular, and the only one of the 18 test classes that is. Test selection is by name pattern. |
| `fragment-labels-use-message-keys` | det | 5 literal field labels: `pets/createOrUpdatePetForm.html` lines 20–22 (`'Name'`, `'Birth Date'`, `'Type'`) and `pets/createOrUpdateVisitForm.html` lines 32–33 (`'Date'`, `'Description'`). All 11 locales render them in English. The repository's own `I18nPropertiesSyncTest` cannot see them: it scans text between tags, and these are fragment arguments. |
| `no-stdout-in-production-code` (advisory on test types) | det | `PetClinicConcurrencyTests.java` lines 117–121 print progress to the console. |
| `controllers-stay-thin` | llm | `PetController.updatePetDetails` copies name, birth date and type from the submitted pet onto the stored one inside the controller — the mutation belongs on the entity. |
| `no-hardcoded-user-visible-text` | llm | the same two pet/visit forms, plus their `'Add Pet'` / `'Update Pet'` and `'Add Visit'` button text computed in a ternary rather than looked up. |
| `validation-lives-with-the-model` | llm | `PetValidator` re-states a 30-character name limit in code that the entity's name column could declare as a constraint. |

### Deliberately absent rules

- **No `nohttp` rule.** The Checkstyle `nohttp` module already enforces it in
  both builds; duplicating it in the graph would add a second place to maintain
  and no enforcement.
- **No formatting rule.** `spring-javaformat` validates at build time.
- **No rule on the Compose file's plaintext passwords.** Those are development
  fixtures; the Kubernetes deployment reads a bound secret. Encoding a
  "no plaintext credential anywhere" rule would be wrong for both.

## Validation against the real CLI

A copy of the pinned clone was staged and this `.yggdrasil/` placed at its root.
`yg init --upgrade` was run once in the stage to install the agent-rules digest
(`AGENTS.md`, `CLAUDE.md`, `.clinerules/yggdrasil.md`); those artifacts belong to
an adopting repository, not to this oracle, and are the four paths listed under
`coverage.excluded`. The committed graph files were byte-unchanged by that run.

Final `yg check` (read-only), after `yg check --approve --only-deterministic`:

```
yg check: FAIL  27 nodes · 135/135 files (77 node-owned, 54 type-covered, 4 excluded)
                · 28 aspects · 2 flows · 228 verified (228 deterministic, 0 LLM)

Errors (12):
  unverified (not yet reviewed)  12 pairs  5 nodes

Warnings (33) in 5 groups:
  unverified (not yet reviewed)  26 pairs  7 nodes
  advisory  3 pairs  3 nodes  aspect 'apache-license-header'
  advisory  2 pairs  1 nodes  aspect 'fragment-labels-use-message-keys'
  advisory  1 pairs  1 nodes  aspect 'no-stdout-in-production-code'
  advisory  1 pairs  1 nodes  aspect 'test-class-name-ends-with-tests'

Next: yg check --approve
```

Read that as: the graph **loads clean** — no load-blocking code, no
`architecture-*` error, no `relation-undeclared-dependency`, no
`structural-cycle`, no `unmapped-files`, no `type-strict-orphan`, no
`log-entry-missing`, no `orphaned-aspect`, no `aspect-status-downgrade`. All
**228 deterministic verdicts** were recorded, of which **221 pass**; the 7
refusals are the advisory backlog above, on exactly the files named. The 38
remaining unverified pairs are the 5 judgment rules, which need a reviewer this
keyless run does not call — 12 of them belong to the two `enforced` judgment
rules and are therefore errors, which is the correct and expected state for a
free CI gate.

### `yg drill` — per deterministic aspect

17 of the 23 deterministic aspects ship a `violates-*` / `satisfies-*` corpus;
all 34 cases pass, with 0 MISS and 0 FALSE-ALARM:

`controller-is-package-private`, `no-rest-controller`,
`binder-disallows-nested-ids`, `repository-is-spring-data-interface`,
`entity-extends-shared-base`, `entity-declares-table-name`, `no-native-queries`,
`domain-free-of-web`, `repository-free-of-web`, `no-stdout-in-production-code`,
`apache-license-header`, `constructor-injection-only`,
`test-class-name-ends-with-tests`, `web-slice-mocks-repositories`,
`page-extends-layout-fragment`, `fragment-labels-use-message-keys`,
`credentials-come-from-the-environment` — **2 pass each**.

The other 6 carry no corpus because they cannot have one: they read the file
system or the graph (`view-name-resolves-to-template`,
`every-controller-has-a-test`, `schema-covers-every-entity-table`,
`dialect-schemas-declare-the-same-tables`) or judge a whole component's files
together (`message-bundles-are-in-sync`, `menu-id-is-known`). This was verified,
not assumed: a probe corpus added to `view-name-resolves-to-template` reports

```
unsupported  satisfies-known-view/case
  unsupported: check reads graph context (node/subject/graph/fs/parseAst/…);
  drill v1 runs check.mjs over case files only. Recorded, not scored.
```

and the probe was removed again. `yg drill` writes only a gitignored results log
and never touches the lock.

## What the schema could not express

Four things a maintainer of this repository would want to state, and could not:

1. **"There must be no repository for a pet or a visit."** The absence of a
   component is the architectural decision here, and the graph has no way to
   forbid a *type* from ever gaining a new instance. `relations: default: deny`
   stops a controller reaching a new repository, but only after someone writes
   it; the rule as written is prose judged by a reviewer.
2. **A cross-artifact rule with no natural home.** "Every table an entity maps
   to exists in all three dialect schemas" is genuinely a relationship between
   Java files and SQL files. It had to be hung on the SQL component with a
   declared `uses` relation to the entity components — an edge that exists to
   widen a read boundary, not because the SQL depends on the Java. The same
   trick was needed to let the slice-test component see the controllers. Both
   are honest but they put edges in the graph that a miner reading only code
   will (correctly) not find.
3. **A relation type for "is tested by".** The six relation types are all
   dependency-shaped, so the test → controller edge is `uses`, which says
   nothing about it being a test. And the direction is forced: a controller must
   never depend on its test, so a "has a sibling test" rule has to be written
   from the test side, backwards from how it reads.
4. **A rule that needs the current date.** "The copyright year should be
   current" is what a maintainer means; a deterministic check must be
   machine-independent, so the shipped rule only checks the header's shape and
   the stale `2012-2024` file is recorded in this README instead of being
   caught.

A fifth, smaller one: `status` cannot be relaxed at an attach site, only raised.
`no-stdout-in-production-code` is genuinely enforced for production code and
genuinely advisory for tests, and the only way to say that is to declare the
aspect `advisory` and raise it on the eight production types — which reads
backwards from the intent.
