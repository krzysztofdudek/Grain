# Superpowers a Horde — przegląd i werdykt

Materiał: klon `obra/superpowers` v6.3.0 w `<scratchpad>/superpowers`
(ścieżki niżej są względem tego katalogu) oraz `<horde>` na gałęzi `claude/grain-agent-tool-b89y0x`
(ścieżki względem `<horde>`). Wszystko poniżej pochodzi z przeczytanych plików; nic nie jest domysłem o zachowaniu.

---

## 1. Czym Superpowers JEST, mechanicznie

**To wtyczka-biblioteka skilli plus jeden hook, który wymusza ich użycie.** Zero zależności
(`CLAUDE.md:36-38`: „Superpowers is a zero-dependency plugin by design"). Czternaście skilli, żadnego demona,
żadnego stanu poza dwoma miejscami wymienionymi niżej.

### Inwentarz skilli (wyzwalacz → co każe zrobić → co i gdzie zapisuje)

| skill | wyzwalacz | co robi | artefakty |
|---|---|---|---|
| `using-superpowers` | każda sesja (wstrzykiwany hookiem) | „Invoke relevant or requested skills BEFORE any response or action" (`SKILL.md:20`), tabela Red Flags przeciw racjonalizacjom | brak |
| `brainstorming` | „przed każdą pracą twórczą" | klasyfikuje: spike / bounded / architectural; pytania po jednym; 2-3 podejścia; sekcje projektu do zatwierdzenia | ścieżka architectural: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, commitowany (`SKILL.md:100,206`) |
| `writing-plans` | jest spec | rozbija na zadania 2-5 min, każde z pełnym kodem i komendą weryfikacji, bez placeholderów | `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md` (`SKILL.md:18`) |
| `subagent-driven-development` | jest plan | pętla: brief → implementer → paczka review → recenzent → pętla poprawek (5 rund) → review całej gałęzi | `.superpowers/sdd/<plan-basename>/` — ledger, briefy, raporty, diffy (`scripts/sdd-workspace:36-39`) |
| `executing-plans` | jest plan, brak subagentów | wykonanie wsadowe w bieżącej sesji z checkpointami | brak |
| `dispatching-parallel-agents` | 2+ niezależnych problemów | N zleceń w jednej odpowiedzi = równolegle (`SKILL.md:68-74`) | brak |
| `test-driven-development` | każda implementacja | „NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST"; kod napisany przed testem — skasować (`SKILL.md:32-42`) | brak |
| `systematic-debugging` | każdy błąd | „NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST" (`SKILL.md:17`), 4 fazy, instrumentacja granic komponentów | brak |
| `verification-before-completion` | przed każdą deklaracją „gotowe" | „NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE" (`SKILL.md:17`) | brak |
| `requesting-code-review` | po zadaniu, przed merge | zleca recenzenta-subagenta z szablonu `code-reviewer.md` | brak |
| `receiving-code-review` | przyszła recenzja | zakaz „You're absolutely right!"; zweryfikuj zanim wdrożysz (`SKILL.md:33-40`) | brak |
| `using-git-worktrees` | przed wykonaniem planu | wykryj istniejącą izolację → narzędzie natywne harnessa → dopiero `git worktree add` | `.worktrees/<branch>` (`SKILL.md:76,96`) |
| `finishing-a-development-branch` | zadania skończone | uruchom testy, pokaż menu 3 opcji, wykonaj wybór, posprzątaj worktree | merge lokalny / `git push -u origin` + PR (`SKILL.md:88-119`) |
| `writing-skills` | tworzenie skilla | metodyka pisania i testowania skilli | nowy katalog skilla |

### Mechanika hooka, routing, stan

`hooks/hooks.json:3-15` rejestruje **jeden** hook `SessionStart` z matcherem `"startup|clear|compact"`.
`hooks/session-start:11,27` wczytuje całą treść `skills/using-superpowers/SKILL.md` i wstrzykuje ją jako
`additionalContext` opakowaną w `<EXTREMELY_IMPORTANT>\nYou have superpowers.\n\n…`. To wszystko — hook nie
czyta repozytorium, nie pisze nic na dysk, nie odpala się przy dispatchu subagenta.

Routing ma dwa poziomy. **Meta-skill** `using-superpowers` ustala priorytet — „process skills come first"
(`SKILL.md:26-31`) — plus dwanaście wierszy Red Flags typu „«This is just a simple question» → Questions are
tasks." **Trójdrożny router** siedzi w `brainstorming/SKILL.md:22-52`: *spike* (odpowiedź, nie kod), *bounded*
(krótki projekt w czacie, bez dokumentów), *architectural* (pytania → podejścia → sekcje → spec →
`writing-plans`). Ratchet jednokierunkowy (`:50-52`), stany końcowe związane ze ścieżką: „Architectural: the
ONLY skill you invoke after brainstorming is writing-plans" (`:149-151`).

Stan trzyma prawie nigdzie. Dwa wyjątki: **commitowane** `docs/superpowers/specs/` i `docs/superpowers/plans/`,
oraz **gitignorowany** `.superpowers/sdd/<plan-basename>/` z ledgerem `progress.md`, kasowany po czystym
finalnym review (`subagent-driven-development/SKILL.md:482-485`). Ledger istnieje wyłącznie dlatego, że
„Conversation memory does not survive compaction" (`SKILL.md:131-134`).

### Subagenty

SDD: świeży implementer na zadanie, brief jako plik (`scripts/task-brief`), paczka diffu jako plik
(`scripts/review-package`), potem recenzent zadania, potem opcjonalna pętla poprawek. Twarde reguły:
„Always specify the model explicitly when dispatching a subagent" (`:204-206`), „Never dispatch multiple
implementation subagents in parallel (conflicts)" (`:282`), „the implementer never dispatches subagents"
(`:275-278`), „Never fix findings yourself in the controller session" (`:409`). Bezpiecznik: pięć rund
poprawek, potem kontroler **adjudykuje** każde otwarte znalezisko i zapisuje `Ruling:` (`:412-429`).
`dispatching-parallel-agents` to osobny, prostszy wzorzec: N niezależnych zleceń w jednej odpowiedzi.

### Git, oraz opinia vs maszyneria

Zakłada gałąź w izolowanym worktree, decyzję o integracji po stronie człowieka i to, że wtyczka może sama
wykonać merge albo push: `finishing-a-development-branch/SKILL.md:55-65` pokazuje trzy opcje (merge lokalny /
push + PR / zostaw), a `:86-119` je wykonuje.

**Maszyneria** to naprawdę cztery rzeczy: hook, trzy skrypty bashowe SDD, ledger i serwer wizualny
brainstormingu (`skills/brainstorming/scripts/server.cjs:102`, stan w `/tmp/brainstorm`). Cała reszta — TDD,
root cause przed fixem, dowody przed deklaracją, zakaz „You're absolutely right!" — to **dyscyplina procesu
zapisana prozą**, tuningowana ewaluacjami. `RELEASE-NOTES.md` (v6.2.0) podaje twardą liczbę: usunięcie sekcji
kontrargumentów TDD pogorszyło zachowanie z 8/10 na 5/10 pod presją „just write it, tests after". To nie jest
ozdoba — to jest ich produkt.

---

## 2. Czym Horde JEST, w tych samych kategoriach

**Skill wykonawczy, który zamienia sesję w dyrektora i buduje pod nim organizację.** Role
(`skills/horde/reference/model.md:47-56`): director (sesja użytkownika) → steward (Sonnet, długowieczny, jeden
na gałąź zespołu) → owner (per węzeł), architect (Opus, weto na graf), worker (najtańszy zdolny), verifier
(nigdy autor), auditor (Opus, raz na falę), counsel (jedna opinia).

**Jedna reguła nad wszystkimi** (`skills/horde/SKILL.md:31-36`): „All state mutates only through `scripts/`.
No `cat >` into `.horde/`, no hand edits of tickets, queues, rosters or journals. […] Missing a tool → add it
to the skill, do not work around it." Szesnaście narzędzi ES-modułowych bez zależności, kontrakt w
`skills/horde/scripts/README.md`, 327 testów w `scripts/tests/`.

**Stan.** `.horde/` — niecommitowany, jeden na repozytorium, `.gitignore` = `*`, odnajdywany przez
`git rev-parse --git-common-dir`, więc każdy worktree widzi ten sam stan (`reference/topology.md:36-64`):
charter, roster, plan, decisions, escalations, dissents, handoff, cost, oraz per zespół queue + katalogi
ticketów. **Wiedza trwała** idzie gdzie indziej: do `.yggdrasil/` gdy repozytorium ma graf, inaczej do
commitowanego katalogu z `horde init --graph-dir` (`reference/topology.md:66-89`).

**Ticket / queue / wave / premerge / verify.** Ticket ma węzeł, klasę modelu, spec, listę dowodów i pole
`**Keys:**`. Kolejka to DAG (`scripts/README.md:112-143`); `queue.mjs set NNN running` zakłada gałąź
`<horde>/t-NNN` i worktree, `set NNN merged` odmawia bez klucza autora, klucza weryfikatora i zgody
właściciela każdego nazwanego węzła. `verify.mjs record` (`scripts/README.md:238-251`) wymaga jednego
`--item` na każdą linię listy dowodów, odmawia gdy `--by` równa się autorowi, i odmawia `--gate red` przy
werdykcie `reproduced`. `premerge.mjs` (`scripts/README.md:283-309`) to siedem pozycji: świeżość bazy, klucze
związane z sha, zakres wewnątrz granic węzła, **test rewersyjny** (nowe testy muszą paść na rodzicu), bramka,
`yg check` na własnym drzewie gałęzi, wpis w dzienniku nowszy niż ostatni commit. „Two keys and one approval
on every merge" (`SKILL.md:148-150`), a zgoda jest związana z sha — nowy commit ją unieważnia
(`reference/roles/steward.md:27-30`).

**Graf.** `nodeSource: yggdrasil` → węzły, granice i reguły czytane z `.yggdrasil/model/**/yg-node.yaml`;
`node.mjs show <node>` drukuje **reguły w mocy** ze słowem mówiącym, ile kosztuje złamanie: `enforced` blokuje
merge, `advisory` ostrzega, `draft` jest bezwładny (`scripts/README.md:217-227`). `yg-architecture.yaml` i
suppression zawsze wracają do użytkownika (`reference/roles/architect.md:24-32`).

**Żywotność po plikach.** „A ticket branch with a commit beyond your tip and a clean worktree **is** a report"
(`reference/roles/steward.md:31-34`); steward jest martwy, gdy jego gałąź nie ma commita, a kolejka zmiany
stanu dłużej niż `liveness.stewardMinutes` (`reference/topology.md:117-120`). Zimny rozruch odtwarza wszystko
z plików (`SKILL.md:112-119`). **Koszt:** jedyny pisarz `cost.json` to `roster.mjs spawn --class`
(`scripts/README.md:151-153`), wagi haiku 1 / sonnet 3 / opus 10 / fable 30, limit z chartera zatrzymuje
hordę. **Push — nigdy** bez polecenia użytkownika (`SKILL.md:20-22`, `reference/topology.md:20-21`); merge
trunk→base jest użytkownika (`reference/topology.md:100`).

---

## 3. Mapa nakładania — skill po skillu

| skill Superpowers | wobec Horde | ocena |
|---|---|---|
| `using-superpowers` (bootstrap) | walczy o pierwszy ruch z `SKILL.md:38-51` (boot = pięć wywołań skryptów) | **kolizja** |
| `brainstorming` | Horde ma tylko „Framing — the only linear phase, done with the user" (`SKILL.md:56-68`) bez metody prowadzenia rozmowy | **komplement, najcenniejszy** |
| `writing-plans` | dubluje łańcuch director → owner proposals → `tk.mjs new` → `queue.mjs add` | **kolizja** |
| `executing-plans` | dubluje falę stewarda | **kolizja** |
| `subagent-driven-development` | dubluje cały łańcuch ról i łamie „Nobody else spawns" (`SKILL.md:83-86`) | **kolizja twarda** |
| `dispatching-parallel-agents` | to samo, plus brak izolacji worktree | **kolizja twarda** |
| `test-driven-development` | Horde żąda red-green (`roles/worker.md:50-51`), nie daje metody | **komplement czysty** |
| `systematic-debugging` | Horde ma stan `not-reproduced` i nic o tym, jak dojść do przyczyny | **komplement czysty** |
| `verification-before-completion` | dyscyplina w głowie agenta; `verify.mjs` to zapis innego agenta z testem rewersyjnym | **komplement, zbieżny** |
| `requesting-code-review` | rola verifiera i auditora robi to strukturalnie i z kluczem | **redundantny wewnątrz misji** |
| `receiving-code-review` | Horde ma kanał `dissent.mjs`, nie ma etykiety odbioru krytyki | **komplement** |
| `using-git-worktrees` | Horde sam robi worktree (`scripts/README.md:133-135`) i każe spawnować „**without** the harness's own worktree isolation" (`roles/steward.md:59`) | **kolizja miękka** |
| `finishing-a-development-branch` | proponuje merge i push; Horde: bramka premerge i push nigdy | **kolizja twarda** |
| `writing-skills` | ortogonalny — narzędzie do pisania samych briefów Horde | **komplement** |

**Dwa puste końce rodziny wobec tej mapy.** Wejście: `brainstorming` jest dokładnie brakującym kompilatorem
intencji — ale jego produktem końcowym jest spec + plan, nie charter z katalogiem dowodów, a jego self-review
sprawdza placeholdery, sprzeczności, zakres i wieloznaczność (`SKILL.md:211-219`), nie sprawdza tego, czego
żąda `skills/horde/templates/charter.md:21-22` — „Each item is something a verifier can reproduce […] Never an
adjective." Różnica jest mała i to jest cała robota do wykonania. Wyjście: **Superpowers nie zamyka drugiego
końca**. Jego ledger ginie razem z workspace'em (`SDD:482-485`), a `systematic-debugging` nie pisze nigdzie
niczego. Incydent → graf pozostaje niezaadresowany po obu stronach.

---

## 4. Konflikty, które naprawdę zabolą

**K1. Dwa systemy chcą być pierwszym ruchem. Waga: wysoka.**
Hook wstrzykuje `<EXTREMELY_IMPORTANT>` z regułą „Invoke relevant or requested skills BEFORE any response or
action — including clarifying questions" (`skills/using-superpowers/SKILL.md:20`, `hooks/session-start:27`).
Horde żąda: „Boot — every session, every wake-up, in this order" i pięciu wywołań skryptów
(`skills/horde/SKILL.md:38-46`). Gorzej: router brainstormingu ma związany stan końcowy — „the ONLY skill you
invoke after brainstorming is writing-plans" (`brainstorming/SKILL.md:149-151`), więc misja, która nie mieści
się w jednym kontekście, trafi do `writing-plans`, nie do hordy. **Furtka istnieje i jest jawna:** „User
instructions (CLAUDE.md, AGENTS.md, …) take precedence over skills" (`using-superpowers/SKILL.md:61-63`).

**K2. Spawn poza rolami omija klucze, koszt i roster. Waga: krytyczna.**
SDD zleca implementerów i recenzentów bezpośrednio (`subagent-driven-development/SKILL.md:246-284`), a
`dispatching-parallel-agents` N naraz (`SKILL.md:68-74`). Horde: „You spawn the trunk steward, the architect,
the auditor and counsel. A steward spawns its owners, workers, verifiers and sub-stewards. **Nobody else
spawns**" (`skills/horde/SKILL.md:83-86`), a każdy spawn jest księgowany wyłącznie przez `roster.mjs spawn`
(`scripts/README.md:151-153`). Agent zlecony przez SDD nie ma wpisu w rosterze, nie ma klasy na tickecie, nie
ma pozycji w `cost.json` i nie ma klucza autora. `queue.mjs set NNN merged` go odrzuci
(`scripts/README.md:142-143`) — ale commit już leży na gałęzi, a limit kosztu przestał być prawdziwy.

**K3. `finishing-a-development-branch` przeciw bramce premerge. Waga: krytyczna.**
Menu wykonuje merge do gałęzi bazowej i `git push -u origin <feature-branch>`
(`finishing-a-development-branch/SKILL.md:88-119`). Horde: push nigdy bez polecenia użytkownika
(`skills/horde/SKILL.md:20-22`), merge wyłącznie w górę i wyłącznie przez stewarda po siedmiopunktowym
`premerge.mjs`, a trunk→base jest decyzją użytkownika (`reference/topology.md:15-21,100`). To jedyny konflikt
z tej listy, który sam z siebie wysyła coś na zdalne repozytorium.

**K4. Plany i ledgery w dwóch miejscach. Waga: wysoka.**
Superpowers: commitowane `docs/superpowers/specs/` i `docs/superpowers/plans/` plus gitignorowany
`.superpowers/sdd/<plan>/progress.md`. Horde: `.horde/` (niecommitowane) plus graf (commitowany). Cztery
niezależne rejestry „co jest do zrobienia" i „co jest zrobione". Inwariant Horde „Nothing lives in an agent's
head" (`skills/horde/SKILL.md:153`) przestaje obowiązywać w momencie, gdy plan mieszka w pliku, którego żaden
ticket nie cytuje. Kolizji ścieżek nie ma — `.superpowers/` i `.horde/` się nie przecinają — kolizja jest
semantyczna, nie plikowa.

**K5. Worktree. Waga: średnia, degraduje się łagodnie.**
`using-git-worktrees` tworzy `.worktrees/<branch>` (`SKILL.md:76,96`), Horde tworzy
`<hordeRoot>/worktrees/<horde>/t-NNN` i każe spawnować workerów „**without** the harness's own worktree
isolation" (`reference/roles/steward.md:59`). Ratuje to Step 0: „If `GIT_DIR != GIT_COMMON` […] You are already
in a linked worktree. Skip to Step 2" (`using-git-worktrees/SKILL.md:33`) — worker Horde jest już w worktree.
Sprzątanie też jest bezpieczne: usuwa tylko katalogi pod `.worktrees/` lub `worktrees/`
(`finishing-a-development-branch/SKILL.md:50-56`), a Horde ma swoje gdzie indziej.

**K6. Interferencja hooka: mniejsza, niż wygląda. Waga: niska.**
Hook odpala się tylko na `startup|clear|compact` (`hooks/hooks.json:5`), więc na sesji dyrektora, nie na
spawnowanych agentach; dodatkowo bootstrap otwiera się `<SUBAGENT-STOP>` — „If you were dispatched as a
subagent to execute a specific task, ignore this skill" (`using-superpowers/SKILL.md:6-8`). Kanał wtórny
istnieje: brief workera mówi „The repository's own instructions (its CLAUDE.md and AGENTS.md) apply to you in
full" (`reference/roles/worker.md:56-57`) — i to jest właśnie kontrolowany kanał, przez który podaje się TDD i
systematic-debugging, a nie SDD.

---

## 5. Werdykt

**(a) Oba bez zmian — nie.** K2 i K3 są krytyczne i nie znoszą się same. Dyrektor z wstrzykniętym bootstrapem,
który dostaje dużą misję, pójdzie ścieżką architectural do `writing-plans`, potem do SDD — i zbuduje drugą,
niewidzialną hordę bez kluczy, bez rosteru i bez księgowania.

**(c) Nie łączyć, ukraść idee — za mało.** Trzy rzeczy z §6 są warte kradzieży niezależnie od decyzji, ale
`brainstorming` to nie idea do przepisania, tylko dopracowany ewaluacjami artefakt, który zamyka dokładnie ten
pusty koniec, który `factory-dry-run.md` §8 nazywa: „wymaganie człowieka nie ma gdzie wylądować". Przepisywanie
go od zera to praca na tygodnie, którą ktoś już wykonał i wypuścił na MIT.

**(b) Superpowers jako front dla człowieka, Horde jako egzekucja, Yggdrasil jako prawo — REKOMENDACJA.**

**Zostawić:** `brainstorming` (przepięty), `test-driven-development`, `systematic-debugging`,
`verification-before-completion`, `receiving-code-review`, `writing-skills`. Pierwsze pięć trafia do workerów
kanałem CLAUDE.md z K6 i podnosi jakość każdego ticketu; ostatni służy do pisania samych briefów Horde.

**Wyłączyć podczas żywej hordy:** `subagent-driven-development`, `executing-plans`,
`dispatching-parallel-agents`, `finishing-a-development-branch`, `using-git-worktrees`, `writing-plans`.
Pierwsze trzy dublują role i łamią monopol na spawn; czwarty pcha do pusha; piąty jest zbędny; szósty
produkuje drugi plan obok kolejki.

**Klej — dwa miejsca, żadne z nich to repo Superpowers** (`CLAUDE.md:44-46`: „Skills, hooks, or configuration
that only benefit a specific project […] do not belong in core"; `:36-38` zakaz zależności zewnętrznych):

1. **Repo Horde**, sekcja *Framing* w `skills/horde/SKILL.md:56-68`: przyjąć istniejący dokument projektowy
   jako wejście chartera i nazwać konwersję. Charter żąda dowodów odtwarzalnych, spec brainstormingu nie —
   ta różnica jest całą treścią kleju. Realizacja istniejącym narzędziem: `horde.mjs charter edit` czyta ze
   stdin i raportuje, ile wierszy dowodów niesie nowy tekst (`scripts/README.md:47-53`).
2. **CLAUDE.md / AGENTS.md repozytorium adoptującego** — klauzula routingu, która wygrywa z bootstrapem na
   mocy `using-superpowers/SKILL.md:61-63`: misja niemieszcząca się w jednym kontekście idzie do hordy, nie do
   `writing-plans`; podczas żywej hordy nikt poza stewardem nie spawnuje; `finishing-a-development-branch` nie
   jest uruchamiany, dopóki `status.mjs` pokazuje hordę.

---

## 6. Co Superpowers robi LEPIEJ (do ukradzenia) i czego Horde ma, a Superpowers nie

### Do ukradzenia — uczciwie

1. **Tabele racjonalizacji „Excuse / Reality".** Każdy skill kończy się listą myśli, które agent sobie
   podsuwa, obok zdania, które je łamie. To nie jest styl — `RELEASE-NOTES.md` (v6.2.0) podaje pomiar:
   usunięcie kontrargumentów TDD zepsuło zachowanie z 8/10 na 5/10 pod presją, więc je przywrócono w formie
   tabeli. Briefy Horde (`reference/roles/*.md`) mówią, czego nie wolno; nie mówią, jaką wymówką agent po to
   sięgnie. Najtańsza z trzech poprawek.
2. **Ewaluacje zachowania jako dyscyplina.** `docs/testing.md` rozdziela dwa rodzaje testów: „does the
   plugin's non-LLM code work?" i „do agents behave correctly on real LLM sessions?" — te drugie prowadzą
   prawdziwe sesje tmux i sędziują zgodność. Horde ma 327 testów w `scripts/tests/`, wszystkie dowodzą
   narzędzi; ani jeden nie dowodzi, że agent z briefem stewarda zachowa się jak steward. To jest największa
   asymetria między tymi dwoma projektami.
3. **Bezpiecznik pętli poprawek z adjudykacją.** SDD: pięć rund maksimum, rundy 1-3 wznawiają tego samego
   implementera, 4-5 biorą świeżego o klasę wyżej, po piątej kontroler rozstrzyga każde otwarte znalezisko i
   zapisuje `Ruling:`, a „a silent discard is forbidden" (`subagent-driven-development/SKILL.md:372-429`).
   Horde ma `tk.mjs status NNN changes` bez licznika rund i bez drabiny klasy modelu — ticket może krążyć
   między workerem a verifierem dowolnie długo i nic tego nie liczy.
4. *(bonus)* **„Turn count beats token price"** (`SDD:207-214`) i **batchowanie drobnych zmian tego samego
   kształtu w jedno zlecenie** (`SDD:221-229`). Wagi Horde księgują run, nie liczbę tur, więc Haiku biorący 3×
   więcej tur wygląda w `cost.json` identycznie jak ten biorący jedną — a każdy drobiazg dostaje pełny cykl
   dwóch kluczy.

### Czego Superpowers nie ma i mieć nie może

- **Graf jako prawo.** `node.mjs show` drukuje reguły ze statusem `enforced` / `advisory` / `draft`
  (`scripts/README.md:217-227`), a `premerge.mjs` pozycja 6 uruchamia `yg check` na drzewie gałęzi „whatever
  `config.gates` holds" (`scripts/README.md:298-302`). Superpowers ma recenzenta-LLM z szablonu i nic, co
  przetrwa sesję.
- **Klucze związane z sha, weryfikator strukturalnie różny od autora, test rewersyjny.** `queue.mjs` i
  `verify.mjs` odmawiają zapisu; `reference/roles/verifier.md:32-35` żąda „**Run it**; reading the old source
  and concluding it would fail is not a revert test". SDD ma to jako zalecenie, nie jako narzędzie odmawiające.
- **Zimny rozruch z plików.** Superpowers po kompakcji ma jeden `progress.md` i `git log` (`SDD:148-154`).
  Horde odtwarza roster, kolejkę, worktree i gałęzie (`SKILL.md:112-119`), bo „nothing was in anyone's head".
- **Księgowanie kosztu z limitem** i **kanały escalation/dissent** z obowiązkiem jednej odpowiedzi.
- **Głębokość i prawdziwa równoległość.** SDD jest z założenia szeregowy: „Never dispatch multiple
  implementation subagents in parallel (conflicts)" (`SDD:282`) — bo nie ma izolacji na workera. Horde daje
  każdemu workerowi własny worktree i gałąź, i dlatego może zrównoleglać, a przy nadmiarze pracy schodzi
  poziom niżej sub-zespołem. To jest strukturalny powód, dla którego te dwa narzędzia nie są substytutami.

---

## Streszczenie dla maintainera (10 linii)

1. Superpowers to biblioteka 14 skilli + jeden hook wstrzykujący bootstrap; prawie cały jej ciężar to
   dyscyplina prozą, tuningowana ewaluacjami, a nie maszyneria.
2. Horde to organizacja z rolami, kolejką, kluczami, grafem i księgowaniem — cały stan przez `scripts/`.
3. Nakładają się dokładnie w środku: `writing-plans` + `subagent-driven-development` + `executing-plans` to
   druga, słabsza wersja łańcucha director → ticket → worker.
4. Trzy konflikty realne: spawn poza rolami omija klucze i koszt; `finishing-a-development-branch` sam pushuje
   wbrew „push nigdy"; dwa systemy walczą o pierwszy ruch w sesji.
5. Furtka jest jawna i wystarczająca: instrukcje repozytorium wygrywają ze skillami.
6. Rekomendacja: wariant (b). Superpowers jako front dla człowieka, Horde jako egzekucja, Yggdrasil jako prawo.
7. Zostawić: `brainstorming`, TDD, `systematic-debugging`, `verification-before-completion`,
   `receiving-code-review`, `writing-skills`. Wyłączyć sześć pozostałych podczas żywej misji.
8. Klej w dwóch miejscach: sekcja *Framing* w `skills/horde/SKILL.md` (spec → charter z katalogiem dowodów)
   i klauzula routingu w CLAUDE.md repozytorium adoptującego. Nigdy w repo Superpowers.
9. `brainstorming` zamyka pusty koniec wejściowy z memo dry-run §8. Pustego końca wyjściowego — incydent do
   grafu — nie zamyka żaden z dwóch systemów.
10. Do ukradzenia niezależnie od decyzji: tabele racjonalizacji, ewaluacje zachowania briefów, bezpiecznik
    pętli poprawek z adjudykacją.
