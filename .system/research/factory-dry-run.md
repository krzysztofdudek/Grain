# Próba generalna fabryki: Grain → Yggdrasil → Horde na jednym repozytorium, od początku do końca

**Ticket 112.** Jedno repozytorium (`spring-petclinic`, pinned `818c413`, 132 śledzonych plików, 957 commitów,
Java/Spring), trzy warstwy rodziny zainstalowane po kolei, jedno wymaganie napisane tak, jak napisałby je
człowiek, i pomiar w każdym szwie. Wszystkie role Horde odegrane ręcznie, sekwencyjnie, według jego własnych
plików (`SKILL.md`, `reference/model.md`, `reference/topology.md`, `reference/roles/*.md`) — Agent Teams nie
było, więc każde „spawn" jest wpisem w `roster.json`, a każdy brief jest wyrenderowany przez `brief.mjs` i
przeczytany. **Żaden krok nie wymagał klucza API ani wywołania modelu**: wszystkie 18 aspektów, które Yggdrasil
wykonał, poszły przez ścieżkę deterministyczną (`0 reviewer calls` w każdym `--approve`), a 6 aspektów prozą
nigdy nie opuściło `draft`.

Scena: `/tmp/.../scratchpad/w112/petclinic` (kopia `cp -r` klonu). Yggdrasil 5.8.0 z
`/home/user/Yggdrasil/source/cli/dist/bin.js`. Java okazała się wystarczająca — nie było potrzeby schodzić do
`express`.

---

## 1. Grain: co propose napisał

```
YG_BIN=/home/user/Yggdrasil/source/cli/dist/bin.js \
  node <worktree>/plugins/grain/bin/grain.mjs propose
```

32 s wall. Raport (stdout, 25 linii, 4204 B) w całości:

```
proposed a graph for 132 tracked files, as of 818c413 — .yggdrasil-proposal/.yggdrasil/
architecture: 12 node types · 14 nodes · 0 relations · 0 dependency cycle(s) — .yggdrasil-proposal/.yggdrasil/yg-architecture.yaml
enforced: 0 of 18 aspects earned `status: enforced` from a real drill of 12 deterministic check(s) — a certified-convention origin required, not just a passing drill (…/bin.js)
candidates: 9 of 18 — 9 advisory (sub-gate origin, same drill bar as enforced but below grain's own certification bound) + 0 draft(s) a drill still caught a violation with, strongest evidence first within each
  grain/src-main-java/candidate-auto-filenameshape — files in `src/main/java` have auto.filenameshape
    caught 5 of 5 · 0 false alarm(s) · 83% of 25 site(s), 5 deviating · yg status `advisory`
  grain/src-main-java/candidate-auto-imp-jakarta-persistence-entity — files in `src/main/java` do not import `jakarta.persistence.Entity`
    caught 5 of 5 · 0 false alarm(s) · 80% of 24 site(s), 6 deviating · yg status `advisory`
  grain/src-main-java/candidate-auto-imp-jakarta-persistence-table — files in `src/main/java` do not import `jakarta.persistence.Table`
    caught 5 of 5 · 0 false alarm(s) · 80% of 24 site(s), 6 deviating · yg status `advisory`
  grain/src-test/candidate-auto-deco-springboottest — types in `src/test` do not carry `@@SpringBootTest`
    caught 5 of 5 · 0 false alarm(s) · 80% of 20 site(s), 5 deviating · yg status `advisory`
  grain/src-test/candidate-auto-deco-webmvctest — types in `src/test` do not carry `@@WebMvcTest`
    caught 5 of 5 · 0 false alarm(s) · 80% of 20 site(s), 5 deviating · yg status `advisory`
  grain/src-test/candidate-auto-imp-org-springframework-boot-restclient-resttemplatebuilder — files in `src/test` do not import `org.springframework.boot.restclient.RestTemplateBuilder`
    caught 4 of 4 · 0 false alarm(s) · 80% of 16 site(s), 4 deviating · yg status `advisory`
  grain/src-test/candidate-auto-imp-org-springframework-boot-test-context-springboottest-webenvironment — files in `src/test` do not import `…SpringBootTest.WebEnvironment`
    caught 4 of 4 · 0 false alarm(s) · 80% of 16 site(s), 4 deviating · yg status `advisory`
  grain/src-test/candidate-auto-imp-org-springframework-boot-test-web-server-localserverport — files in `src/test` do not import `…LocalServerPort`
    caught 4 of 4 · 0 false alarm(s) · 80% of 16 site(s), 4 deviating · yg status `advisory`
  grain/src-main-java/candidate-auto-nameshape — methods in `src/main/java` follow the name shape ``
    caught 2 of 5 · 0 false alarm(s) · 85% of 82 site(s), 15 deviating · yg status `advisory`
on disk, not above: 9 more draft(s) (3 no-catch, 6 prose-unenforceable-keyless) · 18 finer type alternative(s) · 0 convention(s) skipped as not a rule — .yggdrasil-proposal/PROPOSAL.md
next: read .yggdrasil-proposal/PROPOSAL.md …, then move .yggdrasil-proposal/.yggdrasil/ to the repository root as .yggdrasil/ and run `yg check`
as of 818c413
```

Liczby z `proposal.json` (`counts`), nie przepisane ręcznie:

| | wartość |
|---|---|
| typy / węzły / **relacje** / cykle | 12 / 14 / **0** / 0 |
| aspekty razem | 18 (12 jako `check.mjs`, 6 prozą) |
| **enforced** | **0** |
| advisory | 9 |
| draft | 9 — `prose-unenforceable-keyless` 6, `no-catch` 3 |
| zweryfikowane realnym `yg drill` | 12 |
| przypadki drill | 82, **bez hold-outu** |
| krata sub-gate | 270 wierszy, 62 w paśmie |
| charter.md | 14, średnio 54.4 linii |

**Pierwsza rzecz, którą to wymusza:** kolumna „enforced" jest pusta i będzie pusta na każdym repozytorium tego
kształtu. Każda reguła, która przeszła drill (0 fałszywych alarmów, ≥1 złapanie), pochodziła z kraty sub-gate,
a nie z certyfikowanej konwencji — a ruling `enforced-requires-certified-origin` mówi, że tylko certyfikowana
konwencja może zostać prawem. Sześć certyfikowanych konwencji, które tu są, wypadło inaczej: trzy jako proza
(brak szablonu dla klasy), trzy jako `no-catch` (repozytorium nie zawiera ani jednego pogwałcenia, więc drill
nie ma czego złapać). Adopter dostaje zatem graf **bez jednej reguły blokującej**.

**Druga:** `0 relations`. Cała obietnica z `ecosystem-design` §R0 — „wbudowany relation-conformance check jest
darmowym testem akceptacyjnym zaproponowanych relacji" — nie jest tu w ogóle uruchomiona. Architektura to
wyłącznie kształt katalogów; `yg-architecture.yaml` nie zawiera ani jednej listy `relations:` ani `deny`.
Grain sam to ujawnia w preambule („`relations:` come from resolved imports"), export zaraportował `10 resolved
imports` na 30 plikach Javy — po zmapowaniu na węzły wszystkie były wewnątrz jednego węzła i zniknęły.

---

## 2. Adopcja: co człowiek musiał rozstrzygnąć sam

Odegrane jako maintainer czytający `PROPOSAL.md` (94 linie), `alternatives.md`, `REFACTOR-BACKLOG.md`.

```
mv .yggdrasil-proposal/.yggdrasil .yggdrasil
node $YG check
```
```
yg check: PASS (227 warnings)  14 nodes · 131/134 files (98%) · 18 aspects · 0 flows · 9 draft
Warnings (227) in 2 groups:  unverified (not yet reviewed)  225 pairs  3 nodes
  rules-digest-stale  … Fix: yg init --upgrade
  uncovered (3)  .grain/.gitignore  .grain/propose-export.json  .mvn/wrapper/maven-wrapper.properties
```
```
node $YG check --approve --only-deterministic
```
```
Filling 225 unverified pairs across 3 nodes — 225 deterministic (no cost), 0 reviewer calls (consensus included)
… 224/225 filled (180 ok, 44 refused)
yg check: PASS (46 warnings)  14 nodes · 131/134 files (98%) · 18 aspects · 0 flows · 181 verified (181 deterministic, 0 LLM) · 9 draft
```

**Zabaselinowane: 181 werdyktów deterministycznych, 0 LLM, 0 zł. Odmów: 44 — i wszystkie 44 to ostrzeżenia
`advisory` na NIETKNIĘTYM kodzie.** To jest stała podłoga szumu, z którą repozytorium już żyje w chwili
adopcji. Rozkład (z `yg check`):

| aspekt (advisory) | odmów na HEAD |
|---|---|
| `src-main-java/candidate-auto-imp-jakarta-persistence-entity` | 6 |
| `src-main-java/candidate-auto-imp-jakarta-persistence-table` | 6 |
| `src-main-java/candidate-auto-filenameshape` | 5 |
| `src-test/candidate-auto-deco-springboottest` | 5 |
| `src-test/candidate-auto-deco-webmvctest` | 5 |
| `src-test/candidate-auto-imp-…-springboottest-webenvironment` | 5 |
| `src-main-java/candidate-auto-nameshape` | 4 |
| `src-test/candidate-auto-imp-…-resttemplatebuilder` | 4 |
| `src-test/candidate-auto-imp-…-localserverport` | 4 |

Dwie z nich mówią, że **plik w `src/main/java` nie importuje `jakarta.persistence.Entity`** — bo 24 z 30 plików
tego nie robią. Wynikiem jest reguła, która na wieczność ostrzega o każdej encji JPA w aplikacji JPA.
`filenameshape` odmawia pięciu `package-info.java`. To nie jest szum losowy: to większość praktyki podniesiona
do prawa, dokładnie tam, gdzie oba memoranda ostrzegały („majority as virtue").

Potem, za wskazaniem samego CLI (`Next: yg init --upgrade`):

```
node $YG init --upgrade   →  Agent rules installed/updated: AGENTS.md, CLAUDE.md, .clinerules/yggdrasil.md
node $YG check            →  yg check: PASS (45 warnings)  14 nodes · 131/137 files (96%) · … · 9 draft
```

### Osądy, których żadne narzędzie nie zaproponowało (9)

1. **Przyjęcie 12 typów i 14 węzłów.** Nie ma polecenia „akceptuję" — jest `mv`. Podpis, który
   `ecosystem-design` §1.2 rezerwuje dla człowieka („the initial graph acceptance"), fizycznie nie istnieje.
2. **Co zrobić z 9 draftami.** `docs/reference.md` mówi wyraźnie: „Adopting a proposal means reviewing the
   drafts (and the advisory rules), not merely running `yg check --approve` on the enforced set" — ale nie mówi
   **co z nimi zrobić**: usunąć, zostawić, promować. Zostawiłem je; są bezczynne (`9 draft`, zero par), więc
   koszt jest zerowy, ale to była moja decyzja, nie instrukcja.
3. **Czy 44 stałe ostrzeżenia advisory są do zaakceptowania**, czy pięć oczywiście złych reguł należy skasować.
   Zostawiłem wszystkie zgodnie z protokołem tego ticketu; jako maintainer skasowałbym cztery importowe i
   `filenameshape`.
4. **Resztki `.yggdrasil-proposal/`** (PROPOSAL.md, sizing.json, alternatives.md, REFACTOR-BACKLOG.md) —
   nic nie mówi, czy je zatrzymać, wersjonować czy usunąć.
5. **`.grain/` staje się `uncovered`** w grafie sąsiada. Nikt nie mówi, żeby dodać go do `.gitignore`.
6. **`coverage.required: []`** — pozostaje puste, więc `uncovered` nigdy nie stanie się błędem. Żaden ekran nie
   mówi adopterowi, że to jest suwak, który sam musi ustawić.
7. **`review_by: "2027-01-15"`** na każdym aspekcie — data odziedziczona, nie wybrana.
8. **Zero relacji** jest jedną linią raportu; nic nie mówi „twój graf nie zawiera żadnego prawa o zależnościach".
9. **Sizing** (`sizing.json`) istnieje, ale nic go nie konsumuje przy cięciu — `node.mjs map` Horde go nie czyta.

---

## 3. Horde na tym grafie

Instalacja dokładnie tak, jak każe README (wariant „manual drop-in, project level"):

```
mkdir -p .claude/skills && cp -r $HORDE/skills/horde .claude/skills/horde
node .claude/skills/horde/scripts/status.mjs        →  no horde
node .claude/skills/horde/scripts/handoff.mjs read  →  error: no horde exists — run horde.mjs init <name> --base <branch>
```

**Skutek uboczny, natychmiastowy i mierzalny:** instalacja Horde dokłada 52 śledzone pliki. Po commicie:

```
uncovered (56)
          .claude/skills/horde/SKILL.md
          .claude/skills/horde/reference/model.md
          …
yg check: PASS (45 warnings)  14 nodes · 131/188 files (70%) …
```

Pokrycie grafu spada z **96 % na 70 %** przez zainstalowanie warstwy trzeciej. Ani Horde, ani Yggdrasil o tym
nie wspomina; nikt nie mówi „zmapuj to albo wyklucz".

### Framing — i pierwsza dziura

```
node .claude/skills/horde/scripts/horde.mjs init visitnotes --base main --title "Visit notes field"
```

`horde init` wykryło `nodeSource: yggdrasil` poprawnie i wycięło `visitnotes/trunk`. Ale `detectGates` czyta
`package.json`; na repozytorium mavenowym zwróciło `{commit: "", team: "", trunk: ""}` — **bramka jest pusta i
nikt nie protestuje**. Ustawiłem ją ręcznie (`config set gates.team "./mvnw -B test"`).

Charter: `horde.mjs init` renderuje szablon i **żaden skrypt nie zapisuje jego treści**. `SKILL.md` mówi „All
state mutates only through `scripts/`. No `cat >` into `.horde/`… Missing a tool → add it to the skill".
`grep` po wszystkich 16 skryptach: jedyne zapisy do `charter.md` to `horde.mjs init` (szablon) i
`wave.mjs`, które wypełnia wyłącznie kolumnę „reproduced by" istniejącego wiersza. **Cel, non-goals,
ograniczenia, katalog dowodów i lista węzłów — czyli miejsce, w którym ląduje wymaganie człowieka — pisze się
ręcznie, wbrew własnej zasadzie narzędzia.** Zapisałem go ręcznie i odnotowałem to w sekcji Amendments samego
charteru.

Wymaganie, słowami człowieka, przepisane do charteru dosłownie:

> Add a `Visit.notes` field with max length 255, shown on the owner details page, with validation and a test.

Katalog dowodów (mój, jako director — ekosystem nie ma czym go wyprowadzić): E1 test walidacji 255/256,
E2 `yg check` PASS bez nowej odmowy enforced, E3 kolumna Notes na stronie właściciela.

### Co Horde faktycznie czyta z trzech wyjść Graina

```
node .claude/skills/horde/scripts/node.mjs bind
→ graph readable (yggdrasil) — 14 node(s): dot-devcontainer, dot-github, dot-github/workflows, gradle,
  gradle/wrapper, k8s, repo-root, src, src/main, src/main/java, src/main/java/org, src/main/resources,
  src/test, src/test/java
```

| wyjście Graina | czyta? | czym |
|---|---|---|
| `yg-node.yaml` | **częściowo** | `parseYgNodeYaml` bierze `name`, `type`, `description`, `mapping`, `relations`. Rozpoznaje nagłówek sekcji `aspects:` i **nie zapisuje jej nigdzie** (`result` nie ma pola `aspects`) — a proposal i tak trzyma aspekty na TYPIE w `yg-architecture.yaml`, którego `node.mjs` nie otwiera w ogóle. |
| `charter.md` | **tak, dosłownie** | `node.mjs show` wypisuje go w całości; `brief.mjs` wkleja go do briefu ownera, workera i verifiera. |
| aspekty i ich statusy | **nie** | żadne narzędzie Horde ich nie dotyka. Jedyna ścieżka to zdanie prozą w briefie architekta: „with Yggdrasil, `yg prime` then `.yggdrasil/model/**` and the aspects" — instrukcja dla modelu, nie odczyt. |

Pomiar bok w bok, ten sam plik, ten sam graf:

```
node $YG context --file src/main/java/org/springframework/samples/petclinic/owner/Visit.java
```
→ 31 linii, 3568 B, **wszystkie 8 reguł ze statusem**:
```
  grain/src-main-java/set-returns-void [draft] — methods here declare a return type of `void`. …
  grain/src-main-java/partition-nameshape [draft] — types here are named PascalCase (`CrashController`, …). …
  grain/src-main-java/candidate-auto-nameshape [advisory] — methods in `src/main/java` follow the name shape ``. …
  grain/src-main-java/candidate-auto-filenameshape [advisory] — files in `src/main/java` have auto.filenameshape. …
  grain/src-main-java/candidate-auto-deco-getmapping [draft] — methods in `src/main/java` (role group r5) carry `@@GetMapping`. …
  grain/src-main-java/candidate-auto-mods [draft] — methods in `src/main/java` have auto.mods. …
  grain/src-main-java/candidate-auto-imp-jakarta-persistence-entity [advisory] — … do not import `jakarta.persistence.Entity`. …
  grain/src-main-java/candidate-auto-imp-jakarta-persistence-table [advisory] — … do not import `jakarta.persistence.Table`. …
```

```
node .claude/skills/horde/scripts/node.mjs show src/main/java/org
```
→ 72 linie, **zero reguł**:
```
## Certified conventions

- (none certified yet at this node)

## Sub-gate candidates — evidence, not yet law

- (none below the certification bound worth naming)
```

I tak we **wszystkich 14 charterach** — sprawdzone pętlą po `model/**/charter.md`. To była wada Graina, nie
Horde: `renderNodeCharter` filtrował `aspects.filter(a => a.host === n.id)`, gdzie `a.host` to id TYPU
(`src-main-java`), a `n.id` to ścieżka (`src/main/java`). Naprawione w tym ticketcie (§7, commit 1) —
ale pomiar poniżej dotyczy tego, co warstwa dostała w tym przebiegu, czyli nic.

Brief workera: **282 linie**, w środku trzy charter.md, każdy z „none certified yet at this node".
Jedyna reguła, która dotarła do workera, to zdanie, które **ja jako owner wpisałem ręcznie** w Notes ticketu,
po przeczytaniu `yg context` własnymi oczami.

### Przebieg wave 1

`tk new visit-notes --node src/main/java/org --node src/main/resources --node src/test/java --class sonnet`
— przyjęty bez słowa, choć `model.md` mówi: „a ticket names one node, or two when it carries a contract
between them". Trzy węzły przechodzą po cichu.

Worker (własny worktree `t-001`, `git merge visitnotes/trunk` → clean):
```
node $YG check --approve --only-deterministic
Filling 225 unverified pairs across 3 nodes — 225 deterministic (no cost), 0 reviewer calls
```
Świeży worktree musi odbudować cały cache (`topology.md` to zapowiada) — 225 par, darmowe.

Zmiana: `Visit.java` (`@Column(name="notes")` + `@Size(max = 255)` + akcesory), trzy `schema.sql`,
`templates/owners/ownerDetails.html` (nagłówek i komórka), 11 plików `messages*.properties`,
nowy `VisitValidationTests` (2 testy).

```
./mvnw -B -q test -Dtest=VisitValidationTests   →  Tests run: 2, Failures: 0, Errors: 0
node $YG check                                   →  yg check: PASS (52 warnings) … 179 verified · 9 draft
  unverified (not yet reviewed)  9 pairs  2 nodes   ← dokładnie dwa zmienione pliki × 9 aspektów
node $YG check --approve --only-deterministic    →  Filling 9 unverified pairs … (7 ok, 2 refused)
                                                    yg check: PASS (45 warnings) … 186 verified
```

**Suma odmów advisory po zmianie: 5+6+6+4+5+5+4+5+4 = 44 — identyczna jak przed zmianą.** Ani jeden aspekt nie
zareagował na to, co zrobił worker. Dwie odmowy, które dotyczą `Visit.java`, to te same dwie, które dotyczyły
go na HEAD: „ten plik nie powinien importować `jakarta.persistence.Entity`/`Table`".

### Verifier — i jedyna rzecz, która w tym przebiegu złapała prawdziwy błąd

```
./mvnw -B test    →  [ERROR] Tests run: 76, Failures: 0, Errors: 16, Skipped: 2 ; BUILD FAILURE
Caused by: org.h2.jdbc.JdbcSQLSyntaxErrorException: Column count does not match; SQL statement:
INSERT INTO visits VALUES (default, 7, '2013-01-01', 'rabies shot')
```

`db/h2/data.sql` wstawia do `visits` pozycyjnie; dodanie kolumny to psuje. **`yg check` był PASS przez cały
czas** — bo Grain nie wydobył ani jednej relacji, a już na pewno nie relacji „schema.sql ↔ data.sql".
Werdykt zapisany uczciwie:

```
verify.mjs record 001 --verdict not-reproduced --gate red --sha e14e405 --revert failed
  → verdict recorded for 001: not-reproduced
```

Test regresyjny wykonany naprawdę, na bazie: `cannot find symbol: method setNotes(java.lang.String)` —
czerwony, jak ma być. Worker poprawił (`INSERT INTO visits (pet_id, visit_date, description) VALUES …`),
drugi przebieg bramki:

```
Tests run: 76, Failures: 0, Errors: 0, Skipped: 2 ; BUILD SUCCESS
node $YG check --approve --only-deterministic  →  PASS · 186 verified · advisory refusals: 44
verify.mjs record 001 --verdict reproduced --gate green --sha fc61dd6 --revert failed
  → verdict recorded for 001: reproduced — verifier key set
```

### premerge — dwa ciche przejścia

```
node .claude/skills/horde/scripts/premerge.mjs visitnotes/t-001
✓ base freshness — rooted at visitnotes/trunk tip (bea9c57)
✓ keys — author=…, verifier=…, verdict=reproduced, approvals: 3/3
✓ scope — diff inside node boundary · no protected path touched
✓ revert test — no new test files in diff
✓ gate — accepted the verifier's recorded green gate at fc61dd6
✓ journal — log entry … ≥ last commit …
READY
```

**`✓ revert test — no new test files in diff`** — na ticketcie, którego cały dowód E1 JEST nowym testem.
`DEFAULT_TEST_GLOBS = ['**/*.test.*', '**/*.spec.*']` (premerge.mjs:28). Na repozytorium, które nazywa testy
`*Tests.java`, najmocniejsza gwarancja przeciw fabrykacji przechodzi pusta i nie mówi tego. Klucz naprawczy
istnieje (`config.testGlobs`), ale:

```
horde.mjs config set testGlobs '["**/*Tests.java","**/*Test.java"]'
→ testGlobs = "[\"**/*Tests.java\",\"**/*Test.java\"]"        ← zapisane jako STRING
node .claude/skills/horde/scripts/premerge.mjs visitnotes/t-001
TypeError: testGlobs.some is not a function
    at …/premerge.mjs:345:30
```

`config set` nie umie zapisać tablicy; po jego użyciu premerge się wywala. Po ręcznej edycji `config.json`:

```
✗ revert test — …/VisitValidationTests.java: gates.commit green — not load-bearing
```
i dopiero po `config set gates.commit "./mvnw -B test"`:
```
✓ revert test — …/VisitValidationTests.java: gates.commit red (whole command — no test-only isolation available)
READY
```

Merge, wave close:
```
queue.mjs set 001 merged --sha 63eec6d ; tk.mjs status 001 merged
wave.mjs close --gate green --sha 63eec6d   →  wave 1 closed — gate green, 0/3 evidence green
```
**0/3** — bo automatyczne wypełnianie katalogu czyta wyłącznie dziennik (`wave.mjs merged`), a merge zapisałem
tam, gdzie mieszka stan, czyli w kolejce. Po dopisaniu drugiego zapisu:
```
wave.mjs merged 001 63eec6d ; wave.mjs close --gate green --sha 63eec6d
→ wave 2 closed — gate green, 3/3 evidence green
charter.md: | E1 | … | src/test/java | visitnotes-verifier-trunk-1 |
```
Merge trzeba zapisać dwa razy albo katalog dowodów nigdy nie zzielenieje.

### Auditor

Własny worktree na commicie merge'a, pełna bramka od zera: `Tests run: 76, Failures: 0, Errors: 0 — BUILD
SUCCESS`. Werdykt `findings`, cztery ustalenia (zapisane przez `wave.mjs audit 001 findings`), dwie lekcje w
`decide.mjs` (`java-test-globs`, `yg-check-not-in-the-gate`). Koszt misji: `8 runs · weighted 38 · no limit`.

---

## 4. Pomiar łańcucha

**(a) Czy zmiana wylądowała we właściwym węźle?** Tak — `yg owner --file` i unieważnienie dokładnie 9 par w
2 węzłach potwierdzają, że mapowanie działa. Ale „właściwy węzeł" ma tu grubość całej aplikacji: wszystkie
30 plików Javy to jeden węzeł `src/main/java/org`. Cięcie nie niesie żadnej informacji domenowej.

**(b) Czy reguła enforced zablokowała legalny krok?** Nie mogła — było ich zero. Fałszywej blokady nie da się
w tym przebiegu wyprodukować, bo nie ma czym blokować.

**(c) Czy jakieś advisory ostrzegło pożytecznie?** Nie. 44 odmowy przed zmianą, 44 po. Dwie odmowy na
`Visit.java` mówią rzecz nieprawdziwą o pliku, który wymaganie dotyka.

**(d) Ile reguł było nieistotnych dla zadania?** **18 z 18.** Dziewięć draftów w ogóle się nie uruchamia;
dziewięć advisory produkuje stałą podłogę, której delta wobec zmiany wynosi zero. Aspekt, który zareagowałby
na cokolwiek w tym wymaganiu — długość pola, walidacja, spójność schematu z danymi, obecność kolumny w
szablonie — nie istnieje i nie mógł powstać z kopalni praktyki.

**(e) Drugie wymaganie, inna domena (vets).** Zmierzone, nie zgadnięte:
```
node $YG context --file src/main/java/org/springframework/samples/petclinic/vet/Vet.java
→ Owner: src/main/java/org (src-main-java-org)   … te same 8 reguł, co do jednej
node $YG owner --file src/main/resources/templates/vets/vetList.html
→ src/main/resources … File has no direct mapping. Context comes from ancestor directory 'src/main/resources'.
```
Wymaganie o weterynarzach trafiłoby w **ten sam węzeł, tę samą ósemkę reguł i tę samą podłogę 44 ostrzeżeń**.
Nie ma czego rozdzielić między dwóch ownerów, bo graf nie widzi domen. Ciekawe: Grain je ZNALAZŁ —
`alternatives.md` zawiera `…-petclinic-owner-list` (12 plików), `…-petclinic-vet-list` (6),
`…-petclinic-model-list` (4) — ale wyłącznie jako `any_of` z jawną listą ścieżek, z własnym opisem
„it will classify no file grain has not already seen". Cięcie domenowe jest w propozycji i jest bezużyteczne
jako węzeł, bo nie przyjmie nowego pliku.

**(f) Co Horde robi ze `status: advisory` i z sekcjami `charter.md`.** Ze statusem: **nic** — nie czyta go
żadnym narzędziem, nie rozróżnia advisory od enforced, a `premerge` nawet nie uruchamia `yg check`.
Z charteru wpłynęły na decyzję dokładnie dwie linie, obie w moim briefie ownera i workera, dosłownie:

> `- 30 tracked files mapped to `src/main/java/org/` (30 owned directly; the rest belong to a nested node)`

— na tej podstawie owner wiedział, że kod encji należy do tego węzła, a nie do `src/main/java` (który raportuje
„0 owned directly" i „0 files · 0 bytes · 0 lines · 0 scopes" w Sizing);

> `- `src/test/java` — 33 shared commits`

— jedyna linia charteru, która niosła wiedzę o systemie: powiedziała ownerowi, że zmiana w encji chodzi w parze
ze zmianą w testach, co jest prawdą i co ukształtowało zakres ticketu. Wszystkie pozostałe sekcje —
„Certified conventions", „Sub-gate candidates", „Depends on / used by" — były puste albo negatywne
(„no resolved outgoing import"), i nie wpłynęły na nic.

---

## 5. Zerwanie łańcucha, celowe

### Reguła enforced

Enforced nie było, więc najpierw **podpis człowieka**, odegrany ręcznie: promocja
`grain/src-main-java/partition-nameshape` (certyfikowana, share 1.000, 25/25, dziś `draft` z powodu
`no-catch`) na `status: enforced` przez edycję `yg-aspect.yaml`. Potem worker dodaje klasę
`visitNotesFormatter` (lower camel case):

```
node $YG check --approve --only-deterministic ; echo EXIT=$?
  [det] grain/src-main-java/partition-nameshape on file:…/owner/visitNotesFormatter.java — refused
yg check: FAIL  14 nodes · 133/189 files (70%) · 18 aspects · 0 flows · 218 verified · 8 draft
Errors (1):
  enforced  1 pairs  1 nodes  aspect 'grain/src-main-java/partition-nameshape'
            - src/main/java/org  Violations:
              …/visitNotesFormatter.java:6: name visitNotesFormatter does not follow the shape this rule proposes ((Ua)+) (proposed rule, not yet reviewed)
EXIT=1
```

**Blokuje. Wyjście 1, jedna sekcja Errors, dokładnie jedna para.** Yggdrasil robi swoje.

### Ale Horde tego nie zobaczył

Ten sam branch, ten sam moment:

```
node .claude/skills/horde/scripts/premerge.mjs visitnotes/t-002-break
✓ base freshness — rooted at visitnotes/trunk tip (63eec6d)
✗ keys — author=…, verifier=unset, verdict=none, approvals: src/main/java/org=missing
✗ scope — outside boundary: .yggdrasil/aspects/grain/src-main-java/partition-nameshape/yg-aspect.yaml
✓ revert test — no new test files in diff
✓ gate — green (./mvnw -B test)
✓ journal — …
NOT READY
```

**`✓ gate — green`, podczas gdy `yg check` na tym samym drzewie kończy się kodem 1 z błędem enforced.**
`premerge.mjs:417` uruchamia wyłącznie `cfg.gates[level]`; `yg check` nie pojawia się w nim ani razu. Na
repozytorium Yggdrasila to nie boli, bo tamtejsza bramka (`repo-check.sh`) sama go woła — na obcym repozytorium
`horde init` wykrywa bramkę z `package.json` i Yggdrasil wypada z bramki scalenia całkowicie. Zatrzymały ten
branch dwie inne rzeczy: brak kluczy i **kontrola zakresu, która słusznie złapała moją ręczną edycję aspektu
jako wyjście poza granicę węzła** — to akurat trzyma.

### Reguła advisory

Ten sam plik, ten sam kod, reguła cofnięta do `draft`, więc zostają tylko dwie advisory, które go odmawiają
(`filenameshape`, `nameshape`):

```
node $YG check --approve --only-deterministic
→ yg check: PASS (47 warnings)  14 nodes · 133/189 files (70%) · 18 aspects · 0 flows · 188 verified · 9 draft
node $YG check ; echo "exit=$?"   →  exit=0
```

**Ostrzega, nie blokuje.** Kontrakt advisory trzyma dokładnie tak, jak obiecuje ticket 107.

---

## 6. Tabela szwów

| szew | trzyma / pęka / nieuruchomiony | linia dowodu |
|---|---|---|
| Grain export → propozycja grafu | **trzyma** | `12 node types · 14 nodes` zapisane, `yg check` ładuje bez jednego błędu ładowania |
| Grain → relacje architektury | **nieuruchomiony** | `architecture: … 0 relations · 0 dependency cycle(s)`; żadnego `relations:`/`deny` w `yg-architecture.yaml` |
| Grain → reguły enforced | **pęka** | `enforced: 0 of 18` — każda reguła, która przeszła drill, była sub-gate; certyfikowane wypadły jako proza (3) i `no-catch` (3) |
| Grain → reguły advisory | **trzyma mechanicznie, pęka merytorycznie** | 9 advisory, 0 fałszywych alarmów w drillu; i 12 z 44 odmów mówi „ten plik nie powinien importować `jakarta.persistence.Entity`/`Table`" o encjach JPA |
| Grain → `charter.md` → Horde | **pękał, naprawiony w połowie** | przed: 14/14 charterów „(none certified yet at this node)" (`a.host` vs `n.id`); po naprawie 2/14 niosą reguły — i żaden z tych dwóch nie jest węzłem, który posiada pliki, bo aspekty wiszą na typie przodka |
| Grain → `sizing.json` → cięcie Horde | **nieuruchomiony** | `node.mjs map` drukuje owner/stamp/open-proposals; `sizing.json` nie pojawia się w żadnym skrypcie Horde |
| Grain `.family-candidates.json` → `yg advise` | **nieuruchomiony tutaj** | wymaga `--family-candidates`; przebieg produktowy `propose` go nie pisze |
| propozycja → `yg check` (ładowanie) | **trzyma** | `PASS (227 warnings) 14 nodes · 18 aspects`, zero kodów blokujących ładowanie |
| `yg check --approve --only-deterministic` bez klucza | **trzyma** | `225 deterministic (no cost), 0 reviewer calls`, `181 verified (181 deterministic, 0 LLM)` |
| aspekty prozą bez recenzenta | **trzyma (przez wstrzymanie)** | 6 × `draft/prose-unenforceable-keyless`, zero par, zero kosztu |
| `yg context --file` → agent | **trzyma** | 31 linii, 8 reguł ze statusem, dla dokładnie tego pliku |
| Horde `node.mjs` → aspekty grafu | **pęka** | `parseYgNodeYaml` rozpoznaje sekcję `aspects` i jej nie zapisuje; `node.mjs show` = 72 linie, 0 reguł |
| Horde brief → worker | **pęka** | brief 282 linie, trzy chartery, „none certified" ×3; reguła dotarła tylko zdaniem wpisanym ręcznie |
| Horde `premerge` → `yg check` | **pęka** | `✓ gate — green (./mvnw -B test)` przy `yg check: FAIL … Errors (1) enforced` |
| Horde `premerge` → test regresyjny | **pęka po cichu** | `✓ revert test — no new test files in diff` na ticketcie, którego dowodem JEST nowy test |
| Horde `premerge` → zakres i klucze | **trzyma** | `✗ scope — outside boundary: .yggdrasil/aspects/…/yg-aspect.yaml`; `✗ keys — verifier=unset` |
| Horde verifier → prawdziwa wada | **trzyma, i jako jedyny** | `Errors: 16 … Column count does not match` na zmianie, którą `yg check` przepuścił jako PASS |
| Horde charter ← wymaganie człowieka | **pęka** | żaden skrypt nie zapisuje treści charteru; `SKILL.md` zabrania pisania go ręcznie |
| Horde katalog dowodów → zielony | **pęka** | `0/3 evidence green` po scaleniu; `3/3` dopiero po drugim zapisie (`wave.mjs merged`) |
| Horde `config set` → tablica | **pęka** | `testGlobs = "[\"**/*Tests.java\"…]"` (string) → `TypeError: testGlobs.some is not a function` |
| Horde `horde init` → bramka | **pęka na nie-npm** | `gates: {commit: "", team: "", trunk: ""}` na repozytorium mavenowym, bez ostrzeżenia |
| Horde ticket ↔ liczba węzłów | **pęka po cichu** | `tk new … --node ×3` przyjęte; `model.md`: „one node, or two when it carries a contract" |
| enforced blokuje | **trzyma** | `yg check: FAIL … Errors (1): enforced 1 pairs`, `EXIT=1` |
| advisory ostrzega bez blokowania | **trzyma** | ten sam plik, `PASS (47 warnings)`, `exit=0` |
| instalacja Horde ↔ pokrycie Yggdrasila | **pęka** | `uncovered (56)`, `131/188 files (70%)` z 96 % |

---

## 7. Co każda warstwa musiałaby zmienić

### Grain — nasze tickety

Trzy naprawione w tym przebiegu (każda z testem czerwonym przed, jeden commit na każdą):

1. **`charter.md` nazywa reguły, które rządzą węzłem.** `renderNodeCharter` filtrował po `a.host === n.id`
   zamiast `a.host === n.type`. Skutek: na każdym repozytorium, którego katalogi nie są już swoimi slugami,
   wszystkie chartery mówiły „none certified yet at this node" — a charter jest jedynym plikiem, który czyta
   warstwa nad grafem.
2. **Wypromowany `check.mjs` przestaje twierdzić, że runner go nie wykonuje.** Promocja przepisywała
   `yg-aspect.yaml` i zostawiała nagłówek „DRAFT: … the runner never executes this check" na regule, którą
   Yggdrasil właśnie wykonuje. Nagłówek dostaje teraz akapit zgodny ze statusem, mówiący też, co kosztuje
   odmowa — blokadę czy ostrzeżenie.
3. **Zdanie, którym reguła opisuje samą siebie.** `describePid` produkowało `@@SpringBootTest` (identyfikator
   już nosi `@`), „follow the name shape ``" (kształt siedzi w `expected`, nie w pid) i „have
   auto.filenameshape" / „have auto.mods" (wewnętrzny pid Graina wprost do człowieka). Te zdania trafiają do
   `name:`/`description:` aspektu, a stamtąd do `yg context --file`, `yg aspects` i każdego ostrzeżenia
   `yg check` — czyli dokładnie tam, gdzie czyta je agent.

Po naprawach `propose` przebiegł drugi raz na czystej kopii tego samego repozytorium (`petclinic2`), z tym
samym wynikiem liczbowym (`enforced: 0 of 18`, 9 advisory) i z naprawionymi zdaniami:

```
grain/src-main-java/candidate-auto-filenameshape — files in `src/main/java` are named with the shape `(Ua)+`
grain/src-test/candidate-auto-deco-springboottest — types in `src/test` do not carry `@SpringBootTest`
grain/src-main-java/candidate-auto-nameshape — methods in `src/main/java` follow the name shape `a(Ua)+`
```

a charter `src/main/java` — czyli dokładnie to, co czyta `node.mjs show` — wypisuje teraz osiem reguł z
udziałami i egzemplarzami do skopiowania:

```
## Certified conventions
- methods here declare a return type of `void` — share 1.000 · n 5 conforming, 0 deviating (`grain/src-main-java/set-returns-void`)
  exemplars to copy: …/owner/Owner.java:97, …/owner/Owner.java:73, …/owner/Owner.java:81
- types here are named PascalCase (…) — share 1.000 · n 25 conforming, 0 deviating (`grain/src-main-java/partition-nameshape`)
## Sub-gate candidates — evidence, not yet law
- methods in `src/main/java` follow the name shape `a(Ua)+` — share 0.845 · practised in 82 · 15 sites do not
- files in `src/main/java` are named with the shape `(Ua)+` — share 0.833 · practised in 25 · 5 sites do not
- methods in `src/main/java` (role group r5) carry `@GetMapping` — share 0.833 · practised in 10 · 2 sites do not
- methods in `src/main/java` are declared `public` — share 0.814 · practised in 79 · 18 sites do not
- files in `src/main/java` do not import `jakarta.persistence.Entity` — share 0.800 · practised in 24 · 6 sites do not
- files in `src/main/java` do not import `jakarta.persistence.Table` — share 0.800 · practised in 24 · 6 sites do not
```

**Ale to jeszcze nie domyka szwu, i to jest osobne ustalenie.** Reguły wiszą na TYPIE partycji
(`src-main-java`), a 30 plików Javy należy do zagnieżdżonego węzła `src/main/java/org` — i to jemu przypisuje
się ownera, bo to on ma `30 owned directly`. Po naprawie **2 z 14** charterów niosą reguły, i żaden z nich nie
jest tym, który posiada pliki:

```
src/main/java/org/charter.md → ## Certified conventions
                               - (none certified yet at this node)
```

Yggdrasil rozwiązuje to poprawnie — `yg context --file …/owner/Visit.java` pokazuje wszystkie 8 reguł, bo
przechodzi łańcuch typu; charter Graina jest per-węzeł i nie ma dziedziczenia, a `node.mjs show` w Horde jest
płaskie. Stąd ticket 9 poniżej.

Do otwarcia jako tickety (nie robione tutaj):

4. **Cięcie domenowe jako predykat, nie jako lista plików.** Grain znajduje `owner`/`vet`/`model` i oddaje je
   jako `any_of` z jawnymi ścieżkami, które „nie sklasyfikują żadnego pliku, którego grain jeszcze nie widział".
   Dopóki alternatywa domenowa nie ma predykatu `path:`, ekosystem nie ma z czego zrobić drugiego węzła i
   drugiego ownera — a to jest warunek, żeby Horde miał w ogóle co równolegle prowadzić.
5. **Kierunek reguły importowej.** Reguła „pliki tutaj NIE importują X", wywiedziona z tego, że 24 z 30 plików
   nie importują `jakarta.persistence.Entity`, jest większością udającą cnotę na najbardziej widocznym miejscu
   propozycji. Potrzebna jest albo bramka na kierunek `false` dla klasy `imp` przy niskim udziale, albo jawne
   oznaczenie takiego wiersza jako „nieobecność, nie zakaz" i trzymanie go poza advisory.
6. **`filenameshape` i `package-info.java`.** Pięć z 44 odmów to plik, który w Javie z definicji nie jest
   PascalCase. Kształt nazwy pliku bez wyjątku dla plików-markerów języka to reguła, która na starcie kłóci się
   z językiem.
7. **Zerowe relacje na Javie** trzeba zaraportować jako brak, a nie jako liczbę: `0 relations` w jednej linii
   raportu nie mówi adopterowi, że jego graf nie zawiera żadnego prawa o zależnościach. (Osobna sprawa od tego,
   dlaczego 10 rozwiązanych importów nie przeżyło mapowania na węzły — to warto zmierzyć.)
8. **`.grain/` do listy ignorowanych przy `propose`** — dziś ląduje jako `uncovered` w grafie sąsiada.
9. **Charter musi nazywać także reguły ODZIEDZICZONE po typach przodków**, oznaczone jako odziedziczone.
   Węzeł, który posiada pliki (`src/main/java/org`, 30 plików), nie hostuje żadnego aspektu — hostuje je typ
   partycji piętro wyżej. Dopóki charter jest czysto per-węzeł, owner przypisany do węzła z plikami czyta
   „none certified yet at this node" o kodzie rządzonym ośmioma regułami. Yggdrasil już umie przejść ten
   łańcuch (`yg context --file`); charter musi zrobić to samo, bo to on jest jedynym wejściem warstwy wyżej.

### Yggdrasil — propozycje dla maintainera, nic tam nie ruszane

- **Statusy w wyjściu, które czyta narzędzie, nie tylko człowiek.** `yg context --file` jest jedynym miejscem w
  całym przebiegu, gdzie reguła dociera do wykonawcy z etykietą `[advisory]`/`[draft]`. Warto, by miał tryb
  maszynowy (`--json`), bo warstwa nad nim musi dziś parsować prozę albo nie wiedzieć nic.
- **Ostrzeżenie o podłodze szumu przy adopcji.** 44 stałe odmowy advisory na nietkniętym kodzie to stan, który
  `yg check` raportuje, ale nie nazywa. Jedna linia „44 advisory refusals stand on unchanged code — this is your
  baseline, not a result of your change" oszczędziłaby każdemu adopterowi tego wniosku.
- **`coverage.required` przy pierwszym `check`.** Puste znaczy „uncovered nigdy nie będzie błędem"; adopter
  tego nie wie.

### Horde — propozycje dla maintainera, nic tam nie ruszane

- **`yg check` w bramce, wprost.** Przy `nodeSource: yggdrasil` `premerge` powinien uruchamiać `yg check`
  niezależnie od `config.gates`, albo `horde init` powinien wstawić go do bramki i powiedzieć, że to zrobił.
  Dziś zielona bramka nad czerwonym grafem jest zachowaniem domyślnym na każdym repozytorium spoza npm.
- **Test regresyjny nie może przechodzić po cichu.** `no new test files in diff` musi być odróżnione od
  „nie potrafię rozpoznać testów w tym repozytorium" — a `horde init` powinien wykryć `testGlobs` albo
  zapytać.
- **`config set` musi umieć zapisać tablicę** (dziś zapisuje string i wywala `premerge`).
- **`detectGates` poza npm.** Maven, Gradle, Cargo, Make — albo wykrycie, albo twarde pytanie przy `init`;
  pusta bramka nie powinna być cichym stanem.
- **Narzędzie do charteru.** `horde.mjs charter edit` z stdin, dokładnie jak `node.mjs charter edit` dla węzła.
  Dziś jedyne miejsce, w którym ląduje wymaganie człowieka, jest jedynym miejscem bez narzędzia — wbrew
  „the one rule above all".
- **Jeden zapis scalenia.** `queue.mjs set <t> merged` powinien dopisywać bullet do dziennika (albo
  `computeEvidence` powinien czytać kolejkę), żeby katalog dowodów nie wymagał dwóch niezależnych zapisów.
- **`node.mjs show` powinien pokazywać reguły węzła.** Przy `nodeSource: yggdrasil` — `yg context --node`
  obok charteru; owner i worker dostają wtedy prawo grafu bez pośrednictwa człowieka.
- **Liczba węzłów na ticketcie.** `tk new` przyjmuje trzy; model dopuszcza dwa. Albo egzekwować, albo zmienić
  model.
- **Werdykt bez nowego testu.** `verify.mjs` odmawia `reproduced` bez `--revert failed`, więc ticket, który nie
  dodaje testu (refaktor, przemianowanie, zmiana konfiguracji), nie może zostać zweryfikowany w ogóle.
- **Instalacja jako 52 nieprzykryte pliki.** Skill wchodzi do repozytorium i psuje metrykę sąsiada; warto, by
  README mówił, co z tym zrobić.

---

## 8. Co ten przebieg mówi o samej tezie

Środek pętli działa i jest tańszy, niż się wydaje: 181 werdyktów, zero wywołań modelu, zero złotówek, graf
załadowany bez jednego błędu, kontrakt enforced/advisory dokładnie taki, jak obiecany. Oba końce są puste w
sposób, który ten przebieg pokazuje na twardo. Na wejściu: wymaganie człowieka nie ma gdzie wylądować —
plik, który jest jego domem, nie ma narzędzia, a katalog dowodów napisałem sam, bo nie ma czego go wyprowadzić.
Na wyjściu: jedyną rzeczą, która w całym przebiegu złapała prawdziwą wadę, była bramka testowa uruchomiona
przez verifiera — a wada (schemat rozjechany z danymi) jest dokładnie klasy, której kopalnia praktyki nie
widzi, i dokładnie tą, którą incident ledger miałby zapamiętać. Ledger nadal ma zero wpisów, bo nic go tu nie
karmi: verifier zapisał `not-reproduced`, worker poprawił, i wiedza o tym, że dodanie kolumny psuje pozycyjny
INSERT, umarła razem z ticketem.
