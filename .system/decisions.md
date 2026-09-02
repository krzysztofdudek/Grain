# Rozstrzygnięcia i lekcje

Rejestr decyzji dyrektora, których **nie wyprowadza się od nowa**, oraz lekcji, za które już zapłacono.
Wpisy datowane dopisuje `scripts/decide.mjs add` (i `escalate.mjs rule`); sekcja „Lekcje" jest utrzymywana
ręcznie przez dyrektora. Format wpisu: `## YYYY-MM-DD · slug [· ticket NNN] [· class X]` + treść.

Zanim zaproponujesz zmianę w silniku, `decide list --grep <temat>`. Jeśli jest wpis — obowiązuje, chyba że
masz **nowy pomiar**, który go obala; wtedy dopisz nowy wpis z odniesieniem do starego, nie edytuj starego.

## Lekcje (za które już zapłacono)

- **Izolacja worktree tworzy gałąź z nieaktualnego refu.** Pięciu agentów dostało bazę sprzed wydania; jeden
  tego nie zauważył, jego gałąź usuwała 18k linii, merge trzeba było przerwać. Pierwsza akcja pracownika:
  `git merge main`. Liczba suity niezgodna z briefem = zła baza.
- **`catch { continue }` po błędzie parsera czyta się jak czysta próbka i nią nie jest.** Sonda ładująca
  gramatyki danych obok Scali/Javy wyczerpała WASM, `parse` rzucał `Aborted()`, pliki wypadały z obu ramion —
  fałszywe „22% mniej typów". Licz odrzucone; ładuj tylko gramatyki badanych rozszerzeń.
- **Przywracanie pliku z kopii całościowej we współdzielonym drzewie kasuje cudzą pracę.** Zdarzyło się, dwóch
  agentów straciło zmiany. Cofaj po fragmencie, nigdy `cp` z backupu. Commit bazy + worktree usunęły przyczynę.
- **`idleReason: "failed"` znaczy, że padła tura, nie agent.** Ogłoszenie śmierci agenta bez sprawdzenia diffu
  źródeł doprowadziło do duplikatu dyspozycji i fałszywej narracji w logu.
- **Kotwice liniowe dryfują w minuty.** `core.mjs:3153` przestało wskazywać to samo w ciągu jednej tury.
  Skrypty wdrożeniowe na kotwicach treści; w ticketach `plik:symbol`.
- **BSD `find -newermt '-40 minutes'` po cichu nie dopasowuje** — dyrektor zgłosił artefakt narzędzia jako fakt
  o drzewie. Sprawdzaj `stat`, nie ufaj pustemu wynikowi.
- **Prawdziwe wejście CLI to `plugins/grain/bin/grain.mjs`**; `engine/grain.mjs` to moduł i uruchomiony
  bezpośrednio drukuje nic z kodem 0.
- **Nazwy sesji muszą być jednoznaczne i podane w briefie** — agenci wysyłali raporty do obcej sesji.
- **Liczba testów w dokumentacji starzeje się przy każdym tickecie.** Test pilnuje, że liczba jest zakotwiczona
  w **bieżącej** wersji silnika (dryf w obrębie wersji jest jawny; przeniesienie przez podbicie wersji — nie).
- **„Zmiana nie traci żadnej informacji" to zdanie, które robi decyzję darmową, a darmowej nikt nie sprawdza.**
  Dyrektor przeinaczył tak dwa razy jednego dnia; agenci poprawili. Uczciwa wersja z kosztem jest mocniejszym
  argumentem, bo da się z nią nie zgodzić.
- **Nota pokrycia, która nazywa 1 plik przy 133 niepokrytych, jest gorsza niż brak noty** — certyfikuje
  nieobecność. Ujawnienie musi mówić prawdę, nie tylko odpalać.
- **Hub nie może być słabszy od tego, co weryfikuje.** Sonnet oceniający raport Opusa zatwierdzi to, czego nie
  umie podważyć. Lead weryfikuje checklistą, osąd eskaluje.
- **Odstępstwo jest łapane w 95% na kodzie zaindeksowanym i 21% na kodzie właśnie napisanym** — `check` zawodzi
  w swoim głównym przypadku, bo nowy kod jest umieszczany przez podobieństwo, które odstępstwo zniszczyło.
- **`where` przegrywa z grepem po ścieżkach na każdym zmierzonym języku** i to jest luka projektowa, nie ticket:
  rankuje tokenami, a silnik ma współzmiany, afiniczność z historii i klastry ról, których nie używa.

## 2026-09-01 · commits-local-push-never
Commity lokalne — tak (baza `509e786` zatwierdzona przez użytkownika, żeby umożliwić worktree per agent).
Push — nigdy bez wyraźnej instrukcji. Pracownicy commitują na `fix/*`, `instr/*`, `research/*`; dyrektor (lub
lead) scala do main.

## 2026-09-01 · fable-opinion-only
Fable jako podagent wyłącznie do opinii i decyzji; nigdy implementacja, zwiad ani pomiar (koszt). Opus do
pomiarów i projektów trudnych; Sonnet do wykonania.

## 2026-09-01 · usefulness-over-constitution
„Zero nowych strojonych progów" jest decyzją projektową, nie mandatem użytkownika. Kryterium jest **zmierzona
użyteczność**. Zmierzony zysk może przeważyć regułę; wolimy wyprowadzone od strojonych; granica raportowana
uczciwie. Nie odrzuca się zmiany wyłącznie na gruncie konstytucji.

## 2026-09-01 · language-support-by-instruments
„23 gramatyki" nie jest deklaracją wsparcia. Wsparcie języka udowadnia się instrumentami A–F na korpusie.
Repo dające defekt wysokiej wagi przy pierwszym kontakcie nie jest wspierane, dopóki instrumenty nie przejdą.
Dokumentacja rozróżnia „zwalidowane" od „parsowane, niezwalidowane".

## 2026-09-01 · h-grammar-tie-break · ticket 040 · class B
`.h` parsowane obiema gramatykami (C, C++); użyj alternatywy tylko gdy parsuje **ściśle** czyściej (mniej
ERROR+MISSING); **remis zachowuje zadeklarowane mapowanie (C)**, bo błędna migracja pliku C na węzły C++
zmienia mu wszystkie predykaty po cichu, a nagłówek C++ pozostawiony na C traci tylko część typów (widocznie).
`EXT_ALT` deklaruje rodzeństwo, nie przeszukuje wszystkich gramatyk (PHP „wygrywał" z C na 20/56 nagłówkach).
Zmierzony koszt: 8–13% nagłówków C++ zostaje na C; +21% zimnego indeksu na abseil. Zaakceptowane.
Nie rozluźniać remisu bez pomiaru, ilu plików C migrowałoby.

## 2026-09-01 · argument-list-stays-in-heritage · ticket 049 · class A
`argument_list` **zostaje** w `heritageRe`: Python `class_definition.superclasses` *jest* `argument_list` —
jedyna taka para w 23 gramatykach. Prawdziwa przyczyna 049 to schodzenie `descendantsOfType` do argumentów
wywołania wewnątrz prawdziwej klauzuli (Scala, Kotlin, C#, Solidity, C++, JS). Naprawa: predykat `argRe`
(klauzula w polu o nazwie argumentowej = wywołanie, pomijana; przejście po przodkach zatrzymuje się na węźle
argumentowym). Play: 567 sfabrykowanych supertypów usuniętych, 0 dodanych.

## 2026-09-01 · macrodefs-sup-deleted-doc-kept · ticket 045 · class A
Połowa `sup` heurystyki `macroDefs` usunięta (85,5% fantomów na 5656 nazwach; `what assert_eq` → „implements
w 230 plikach"); połowa `doc` (`macroDoc`) **zachowana** — mierzona jako sygnał wzmianki (`where
deserialize_bool` znajduje plik tylko dzięki niej). Koszt: 4 karty plików z 53, świadomie zaakceptowany.
Po zmianie `weakName` odpala **rzadziej** (fantomowe `referenced` przestaje czynić odpowiedź niepustą).

## 2026-09-01 · macro-body-reparse · ticket 018 · class B
Ciało makra to nieparsowany region tokenów; parsuj je ponownie tym samym parserem i przyjmij **tylko gdy cały
region parsuje czysto** (`hasError` false) — gramatyka decyduje, co jest deklaracją. Jeden bool, zero progów,
żadna nazwa makra. 0 fantomów w 866 nazwach na 19 371 wywołaniach. `b.tokenRegion`/`b.macroCall` wyprowadzone
z `node-types.json`; niepuste dla dokładnie jednej gramatyki.

## 2026-09-01 · receiver-only-not-impl-not-nesting · ticket 016 · class E
Wiązanie metody do typu odbiornika (Go `receiver`, przez slot `b.paramLike.type`) — **tylko to**. Warianty
odrzucone pomiarem: bloki `impl` Rusta (axum −20 konwencji, `where "extractor"` degeneruje do kart
katalogowych), zagnieżdżenie (pomaga Pythonowi, szkodzi Javie), waga 3× (najgorsza wszędzie). `featW` zostaje
3× — spłaszczenie pogarsza gin (6/9→7/10) i kosztuje axum 70→47. Na Lua klastrowanie działa bez żadnego z
trzech sygnałów — zagłodzenie wag nie wyjaśnia Go.

## 2026-09-01 · twins-health-row-deleted · ticket 044 · class E
Precyzja sugestii „duplikat" 0,24 (górna granica; Go 0,04). Bramka `shared > remainders` wpuszcza pary **na
medianie populacji** (10 = 10) — nie selekcjonuje. Próg wielkości szkieletu odrzucony: każdy próg czyszczący gin
kasuje prawdziwe trafienia flaska. 33 z 83 wierszy OZ to jeden plik sparowany sam ze sobą; wszystkie 83 szły do
commitowanego `CONVENTIONS.md`. Decyzja: usunąć wiersz zdrowia (**push**), zachować linię `twin:` na karcie
grupy (**pull**), `model.twins` i eksport (interfejs opublikowany). Bez podbicia wersji (render-only, dowiedzione).

## 2026-09-01 · deviant-exclusion-disclosure-not-lofo · ticket 047 · class E
Odstępca wypada z grupy przez cechę, na której odstaje — ogólne (5 języków), ograniczone do faktów o zasięgu
roli (katalog/partycja odporne), 29,7% faktów roli dotkniętych. Trzy tryby wykluczenia, więc żadna korekta progu
nie naprawia 2/3. Leave-one-feature-out zbudowany i zmierzony: +4 prawdziwe, +42 fałszywe (0 prawdziwych po
lekturze źródeł) — **odrzucony**. Decyzja: ujawnienie w gałęzi poniżej progu `checkFile`, nazywające najbliższą
certyfikującą grupę i jej wymaganie; **bramka: zmierzony wskaźnik odpaleń na czystych nowych plikach**
(standard 018/037: 18,6% odrzucone, 1,58% wdrożone).

## 2026-09-01 · weak-answer-disclosure-two-tokens · ticket 037 · class D
Ujawnienie słabej odpowiedzi w `what`: (1) brak dokładnego dopasowania nazwy, (2) zapytanie ≥2 tokenów — to
**cięcie z 002**, nie nowy próg (dla 1 tokenu `coversQt` degeneruje do „zawiera"), (3) zapytanie w pliku ślepym
**anomalnym wśród rówieśników**. 1,58% odpaleń; hipoteza dyrektora bez (2)–(3) odpalała 18,6% i została
odrzucona. Bramka „ograniczenia" odrzucona jako odwrotna: prawdziwa deklaracja jest używana, więc jej nazwa
występuje w plikach, które grain widzi. Asymetria: odpowiedzi „nic nie znaleziono" nie da się uczynić
nadmiernie pewną zastrzeżeniem — inny próg dowodowy niż dla odpowiedzi niepustej.

## 2026-09-01 · ambiguous-half-weight-stays · ticket 008 · class E
Waga 0,5 członka niejednoznacznego jest **wyprowadzalna**: średnia odpowiedzialność rangi 1 = 0,557 na 4350
zakresach, zaokrąglona konserwatywnie w dół. Wykluczenie to churn +110/−31 i mniej informatywne fakty. Zostaje.

## 2026-09-01 · metaprogramming-unreachable · ticket 031 · class D
Identyfikatory tworzone metaprogramowaniem są nieosiągalne dla żadnej reguły opartej na dowodach; proponowany
fallback odpalał na 26% plików („wzruszenie ramion, nie ujawnienie"). Granica zapisana w `docs/validation.md`.
Ortogonalne do 018 (tam nazwy są dosłownie w tekście źródła).

## 2026-09-01 · where-judged-on-leak-free-stratum · ticket 012 · class E
Każda zmiana rankingu `where` oceniana na warstwie „zapytanie nie nazywa pliku" z `selftest --where`, nigdy na
medianie zbiorczej. Dźwignia „tokeny nazw składowych → waga faktu" daje +0,10 na warstwie nazwanej i **+0,00**
na bez wycieku — naprawia złą połowę; nie wdrażać samej. Warstwa nazwana jest **najgorsza** (0,388 vs 0,875),
nie nasycona: dłuższe zapytanie = więcej szans dla IDF na przypadkowy token.

## 2026-09-01 · zero-conventions-is-three-diseases-not-lambda · ticket 054 · class B
Symfony 0 konwencji na 89k zakresów: (1) bramka fail-closed historii odpala na **każdym** płytkim klonie
niezależnie od głębokości i zabija 14 674 komórki, które już przeszły akceptację (0 → 1446 po wymuszeniu);
(2) atrybuty PHP `#[Attr]` nie są wydobywane — sigil-regex zna `@` i `[`, nie `#[` (0 → 37 faktów);
(3) pełny klon **pada** na `JSON.stringify` ponad limit stringa V8 w `history.mjs`, wyjątek połykany (= 055).
`idxCost` i `neff` zmierzone jako niewinne. Nie dotykać λ.

## 2026-09-01 · reformat-after-wave
Przeformatowanie silnika zatwierdzone (jedna instrukcja na linię, ~100–120 kolumn, komentarze nietknięte,
Prettier, jeden commit „tylko format, zero logiki"). **Dopiero gdy żadna gałąź nie wisi** — `core.mjs` ma setki
wieloinstrukcyjnych linii (najdłuższa 542 znaki), git scala po liniach, więc każda żywa gałąź konfliktowałaby na
każdej dotkniętej linii.

## 2026-09-01 · state-through-tools-only
Cały stan operacyjny (tickety, kolejka, handoff, decyzje, eskalacje, dziennik fal) mutuje się **wyłącznie
narzędziami skilla** (`scripts/*.mjs`), nigdy ręcznym zapisem do `.temp/`. Ręczny zapis omija normalizację,
rendering i dziennik — i psuje handoff między sesjami.

## 2026-09-01 · wave-3-is-reach-not-honesty · class G
Katalog G (.system/research/question-catalog.md) wyznacza falę 3: (1) completeness rankuje po max kierunkowej pewności i drukuje liczbę, nigdy '(complete)'; (6a) adopcja — shim grain na PATH, reklama do pod-agentów, plik vs katalog; (3) used by: nazwy z model.edges; (4) tested by: na what; (5) how filtruje do plików żywych, map --json dostaje changes/concepts. Rekomendacja 2 (where symbol-first) po research/where-lever. Wszystko to ekspozycja nad danymi, które model już ma — zero nowej ekstrakcji. Luka produktu: precedensy tak, zobowiązania nie.

## 2026-09-01 · where-leak-free-is-a-coverage-boundary · ticket 012 · class E
Leak-free where (zapytanie nie nazywa pliku) NIE jest problemem dźwigni rankingowej: 73% porażek nieosiągalnych dla ŻADNEGO z 7 źródeł dowodu w modelu (unia pokrywa 30/111); 36% prawdziwych odpowiedzi ma zerowy wynik leksykalny — na tej warstwie to ślepota, nie ranking (odwraca 012). Trzy dźwignie bez stałych (afiniczność komunikatów, propagacja współzmian, prior miejsca urodzenia): −0,008 / +0,000 / +0,045 leak-free, każda kosztem pooled. Decyzja: (a) nie budować kolejnych dźwigni rankingowych dla leak-free; (b) where DYSKLARUJE brak leksykalnego zaczepienia (klasa D); (c) rekomendacja G #2 (symbol-first, normalizacja po liczbie zakresów) idzie dalej — dotyczy warstwy NAZWANEJ, gdzie where przegrywa najbardziej (0,388 vs 0,875); (d) poprawa leak-free wymaga NOWEGO dowodu w modelu (ekstrakcja), nie rankingu — kandydat po fali 3. Dokument: .system/research/where-ranking-design.md

## 2026-09-01 · worker-report-commit-must-be-verified
A worker's text report ('committed as X') is not proof a commit happened. In wave 2's first batch, 2 of 8 workers (fix/063, fix/054b) did all the work correctly (suite green, tests added) but the branch tip was byte-identical to main — no commit ref update at all, reflog showed create+merge-main+rename only. Both omitted an explicit commit SHA in their own summary text; the 6 that quoted a SHA were all real. Lead now checks 'git log -1 <branch>' differs from main and matches the claimed SHA before running premerge; if not, the diff is usually still sitting uncommitted in the worktree (verified, not lost) — run the suite once more and commit it directly rather than re-dispatching the worker.

## 2026-09-01 · history-levers-must-hide-own-commit · ticket 069 · class E
Każdy sygnał rankingowy where czytający historię (współzmiany, afiniczność komunikatów, miejsce urodzenia) musi UKRYĆ commit tworzący kandydata przed punktacją, inaczej 'przewiduje' plik z commita, który go stworzył (zmierzone do 2× zawyżenia w prototypie). Dziś wdrożony whereCmd jest czysto leksykalny, więc wycieku nie ma — reguła obowiązuje prospektywnie i jest pilnowana testem-strażnikiem w whereEval (069). Pełny leave-one-out = learn() per kandydat, dlatego uprząż jest retrieval-not-prediction.

## 2026-09-01 · worktree-can-inherit-foreign-uncommitted-diff
fix/059's worker found its 'isolated' worktree already carried fix/068's uncommitted whereEval diff in the working tree (not a branch/commit — just dirty files) even though fix/068 has its own separate worktree with its own real commits. The worker correctly used git-index blob staging to commit ONLY its intended files, leaving the foreign diff untouched and uncommitted; verified via 'git show --stat <sha>' that the landed commit contains zero unrelated hunks. Lesson: worktree isolation between concurrently-dispatched agents is not guaranteed clean at the working-tree level — always diff-inspect a worker's actual commit (not just trust the summary) when its report mentions 'found unrelated changes in my worktree', and never assume a fresh worktree starts with a clean working tree.

## 2026-09-02 · where-named-volume-normalisation · ticket 012 · class E
APPROVED (fix/where-named 94a8bc9, Opus design, .system/research/where-named-design.md): normalise ONLY the volume channel of where's lexical score — a scope-name token is worth the share of the file it names; a directory matching a minority of the query is worth the coverage it earned (tuned +0.25 DELETED); same rule extended to group cards (forced by evidence: groups floated into the space file cards vacated). Named-stratum hit@3 0.459→0.643 (+0.184, up in all 12 repos, n=733); leak-free guard 0.226→0.253 (also up). No constant added. Dividing the WHOLE score by scope count was measured and rejected: it punishes name/path evidence, which the leak-free stratum has least of. Symbol-first (G rec 2 lever 1) NOT implemented: ceiling exactly 0 on the harness — see ticket 071.

## 2026-09-02 · review-omits-new-scope-caveat-by-design · class D
review NIE przenosi zastrzeżenia checkFile 'scopes new to the index' dla pliku bez innych znalezisk — i ma tak zostać. Próba naprawy na wzór 053 (instr/C) złamała dwa ustalone testy (review-command, missing-renderer), bo to zastrzeżenie odpala na praktycznie KAŻDYM nowym pliku niezależnie od jakości dopasowania — w agregacie review byłoby klasy 018 (mówi o wszystkim, więc o niczym). 053 dotyczyło rzadkiego sygnału hasError; ten jest powszechny. Asymetria celowa, udokumentowana w nagłówku cross-check-check-review-parity.test.mjs. Nie otwierać ponownie bez zmierzonego wskaźnika odpaleń na czystych nowych plikach.

## 2026-09-02 · obligation-birth-rule-approved · ticket 073 · class G
APPROVED as wave-4 #1 (ticket 073): grain obligation <path> — the birth obligation 'adding a file under (module, suffix) also touches O', mined from git status alone, gated by the engine's existing KT+BIC/λ/minRaw/liveness. 94.2% pooled / 81.1% repo-macro precision vs 0.143 null, zero new constants; acceptance against the macro figure. Corrects the G catalog: Q15 was NOT 'undeliverable without ORM config'. Two labelled sets (specific / ambient), never one ranking; honest negative names the class and its birth count. Needs HIST_V + MODEL_V (director applies at wave close).

## 2026-09-02 · skipped-then-fixed-ground-truth-is-false · ticket 073 · class G
LEKCJA (hipoteza dyrektora obalona pomiarem): 'zmiana X bez Y, po której następuje fix dotykający Y' NIE jest prawdą referencyjną dla zobowiązań. Na 36 771 kandydatach w 20 repozytoriach: wskaźnik follow-up 0,246 po pominięciu vs 0,452 po zgodności — odwrotnie, w 20/20 repo bez wyjątku. Instrument zbudowany na tym stałby na piasku. Działa projekt prospektywny held-out (obligations-design.md §4). Zapisane, żeby nikt nie wyprowadził tego drugi raz.

## 2026-09-02 · capture-tk-new-id · class D
LEKCJA (dyrektor, 2026-09-02): tk new DRUKUJE przydzielony id — nigdy nie zakładaj następnego numeru i nie tłum wyjścia. Lead założył 075 chwilę przed moim tk new; moje dostało 076; zalogowałem i zakolejkowałem 075. Reguła: id = wyjście tk new, zawsze przechwycone do zmiennej, nigdy zgadywane.

## 2026-09-02 · esc-2 · ticket 052
052: deletion of the siblings: PUSH line stands (precision 0.364 vs 0.70 bar on 165 blind verdicts / 7 languages; 044 precedent — push surface at low precision goes, pull surface kin: stays). Follow-up (a) valueNorms gate: NOT now — 3 of 2393 containers (0.13%) is not a surface worth a code path; revisit only if the valueNorms population grows and precision on that subset is measured ≥0.70. Follow-up (b) rendered cap on value-line length: NO — a new tunable constant for a surface that no longer exists. JSON: if what --json documented 'siblings' in reference.md, keep the key as an empty array with a schemaNotes entry (additive-compatible); if it was undocumented, dropping it is fine. Merge as measured.

## 2026-09-02 · esc-1 · ticket 042
042: APPROVED — implement the per-literal check-side flag. It is the per-literal APPLICATION of a convention already certified at file level, not a new acceptance gate; the exemption (delimiter-forced literals excluded) is structural/derivable, not tuned; measured 22 (express) + 12 (flask) genuine violations and 0 false positives on telescope.nvim. Conditions: (1) measure the fire rate on clean, conforming files across ≥3 repos and report it (037 standard); (2) no new constant — the file-level convention's own acceptance decides whether the flag can exist; (3) the flag renders under the existing convention line, not as a new fact class; (4) tests: the original 042 repro (7 single-quoted literals in a 100% double-quote file) flags; a delimiter-forced literal does not; a file with no certified quote convention flags nothing.

## 2026-09-02 · grep-checkmark-count-is-not-authoritative
grep -c '✔'/'✖' over npm test output overcounts (test names/descriptions can themselves contain a ✔/✖ character as sample text, and node's own end-of-run 'failing tests' recap reprints each failure a second time) — verified by direct comparison: the same run showed grep -c '✔' = 2089 while node's own 'ℹ pass' summary line said 2079, a 10-count gap. The exit code and the '✖ ... # TODO' distinction stayed reliable throughout this session (every merge decision was correctly gated on exit 0 + real-failure-vs-todo inspection), but raw counts quoted in commit messages and ticket logs this wave are inflated by the grep proxy, not exact. Going forward: read node's own 'ℹ tests'/'ℹ pass'/'ℹ fail'/'ℹ todo'/'ℹ cancelled' lines for the authoritative count, never grep -c on the checkmark glyphs.

## 2026-09-02 · obligation-merge-on-precision-disclose-coverage · ticket 073 · class G
073 obligation merges on the PRECISION bars (macro p@1 0.958, non-obvious 1.000 vs 0.80) even though COVERAGE 0.048 misses the design's 0.08: a rule that speaks on 4.8% of births and never lies beats silence and makes no false claim (the failure class this project treats as worst). Coverage is disclosed as measured in the command doc and validation.md; its two testable causes are ticket 078. Principle: a reach bar missed with honesty bars cleared is a disclosed limitation, not a merge blocker — the reverse (precision missed) always blocks.

## 2026-09-02 · wave-close-versions-0-4-0 · class D
Przy zamknięciu fali 2/3 (po scaleniu 073) dyrektor podbija RAZ: EXTR_V g31→g32 (060 walk into ERROR children, 050 object type-like, 075 catch/finally double-walk, 076 type-like gaps, 042 per-literal flag — extraction/classification output changes), HIST_V h10→h11 (073: footprints carry the A/M/D/R status byte; fresh walk backfills), MODEL_V m23→m24 (073: model.obligations derived table; 063/074 completeness scoring), ENGINE_VERSION 0.3.0→0.4.0 (a new capability class — obligations — and a new command surface; docs/validation.md test-count anchor must be re-stated against 0.4.0 or docs-audit goes red by design). Lead reports which merged tickets touched extraction / history / model in the close escalation; director verifies before bumping.

## 2026-09-02 · no-blind-version-sed · class D
LEKCJA (dyrektor, 2026-09-02): ślepy sed '"version": "0.3.0"' → 0.4.0 po WSZYSTKICH plikach JSON podbił też wersję ZALEŻNOŚCI tree-sitter-properties w package-lock.json i w grammars/manifest.json — korupcja złapana przez inspekcję diffu przed budowaniem na tym commicie, cofnięta amendem. Reguła: podbijaj wersję tylko w plikach, gdzie klucz jest wersją WŁASNĄ pakietu (plugin.json x3, config.mjs, validation.md); lockfile i manifest gramatyk NIGDY sed-em; zawsze git show --stat + diff podbicia przed commitem. package.json pluginu stoi na 0.2.0 — nieaktualne, do świadomego podbicia z npm install, nie ręcznie.

## 2026-09-02 · esc-3
Wave 2 close acknowledged: 36 merged, 2122/2122, 0 todo. Three audits zgodny. WAVE 3 OPENS with items independent of the paired-trial verdict: (a) corpus validation run — when instr/F-2 lands, run instruments A (audit-claims), B (selftest --extract), D, E (selftest --where, --obligation) across corpus.json and produce the validated-vs-parsed language table for docs/validation.md (the language-support claim, decision language-support-by-instruments); (b) package.json 0.2.0 → 0.4.0 via npm install (never sed), lockfile root only; (c) 074 follow-through if anything remains. The trial verdict (research/trial-0.4.0) decides the rest of wave 3: reach (next obligation types Q9/N5) vs adoption redesign. PROCESS CORRECTIONS, recorded: (1) merge conflicts were resolved by the lead by hand — §6 item 3 says escalate, never resolve; results were verified green so nothing is undone, but the rule stands and a hand-resolved conflict next time is a checklist failure; (2) committing a worker's uncommitted diff is acceptable ONLY after premerge on the resulting branch and a tk log entry saying the lead committed it; (3) worktree-diff leak between workers → add to every worker's first action: git status must be clean after git merge main, else stop and report. Handoff discipline: good now, keep it.

## 2026-09-02 · lead-process-corrections-wave-2 · class D
Z zamknięcia fali 2 (36 scaleń, wszystko zielone): (1) lead rozstrzygał konflikty scalania ręcznie — §6 pkt 3 mówi ESKALUJ, nigdy nie rozstrzygaj; wyniki zweryfikowane suitą, nic nie cofamy, ale następny ręcznie rozstrzygnięty konflikt to porażka checklisty; (2) commitowanie niezacommitowanej pracy pracownika: dopuszczalne tylko po premerge i z wpisem tk log 'lead committed'; (3) wyciek diffu między worktree (izolacja harnessu): pierwsza akcja pracownika to git merge main ORAZ git status czysty — inaczej stop i raport; (4) liczniki testów grep-em zawyżały — bramką jest wyłącznie premerge.mjs; (5) pracownicy zgłaszali 'done' z niezacommitowanym commitem — premerge łapie, ale brief pracownika ma wymagać git log -1 w raporcie.

## 2026-09-02 · esc-4 · ticket 012
Record-only escalation for a user-facing change already merged under a prior director ruling (director decisions: where-named-volume-normalisation / wave-3 reach recs / disclosure fixtures contract). Acknowledged; no change. Going forward escalate at merge time, one line, and merge without waiting — the record is the point.

## 2026-09-02 · esc-5 · ticket 065
Record-only escalation for a user-facing change already merged under a prior director ruling (director decisions: where-named-volume-normalisation / wave-3 reach recs / disclosure fixtures contract). Acknowledged; no change. Going forward escalate at merge time, one line, and merge without waiting — the record is the point.

## 2026-09-02 · esc-6 · ticket 046
Record-only escalation for a user-facing change already merged under a prior director ruling (director decisions: where-named-volume-normalisation / wave-3 reach recs / disclosure fixtures contract). Acknowledged; no change. Going forward escalate at merge time, one line, and merge without waiting — the record is the point.

## 2026-09-02 · esc-7 · ticket 053
Record-only escalation for a user-facing change already merged under a prior director ruling (director decisions: where-named-volume-normalisation / wave-3 reach recs / disclosure fixtures contract). Acknowledged; no change. Going forward escalate at merge time, one line, and merge without waiting — the record is the point.

## 2026-09-02 · esc-8 · ticket 057
Record-only escalation for a user-facing change already merged under a prior director ruling (director decisions: where-named-volume-normalisation / wave-3 reach recs / disclosure fixtures contract). Acknowledged; no change. Going forward escalate at merge time, one line, and merge without waiting — the record is the point.

## 2026-09-02 · esc-9 · ticket 067
Record-only escalation for a user-facing change already merged under a prior director ruling (director decisions: where-named-volume-normalisation / wave-3 reach recs / disclosure fixtures contract). Acknowledged; no change. Going forward escalate at merge time, one line, and merge without waiting — the record is the point.

## 2026-09-02 · esc-10
Record-only escalation for a user-facing change already merged under a prior director ruling (director decisions: where-named-volume-normalisation / wave-3 reach recs / disclosure fixtures contract). Acknowledged; no change. Going forward escalate at merge time, one line, and merge without waiting — the record is the point.

## 2026-09-02 · trial-0-4-0-verdict-wave-4-is-reach · class G
WERDYKT PRÓBY SPAROWANEJ NA 0.4.0 (.system/research/trial-0.4.0.md, 13 przebiegów, 6 par, $10.47): ADOPCJA NAPRAWIONA — wywołania graina 1→11, w każdym przebiegu, w dwóch jako pierwsze narzędzie; 067 uznane za zakończone, nie wydawać więcej na adopcję. ZASIĘG NIEZMIENIONY — wywołania przed pierwszym zapisem +0,7 (0,24 se od zera; próg szumu sd 47 z wcześniejszych prób unieważnia dawne '−21'), ZERO przypadków, w których odpowiedź graina wprowadziła plik do diffu pominięty przez ramię bez graina, umieszczanie identyczne w 5/6 par i gorsze w 6. Dwie wady pomiaru, które schlebiały grainowi, znalezione i usunięte (echo ścieżki liczone jako odpowiedź; zła baza porównania). FALA 4 = ZASIĘG, w trzech krokach wspartych dowodem: (1) where: współzmiany PONAD leksykalne karty plików — jedyna linia, która poruszyła agenta, siedzi jako podrzędna notatka; (2) where: odpowiedź dla katalogu, który jeszcze nie istnieje — strukturalna ślepa plama potwierdzona na drugim języku; (3) ZMIERZYĆ osiągalność komend — 11 z 16 nigdy nie wywołanych w 13 przebiegach, obligation 0× mimo że zbudowane pod te zadania — ZANIM powstanie 17. komenda. Uprząż próby (.temp/stress/h040/, untracked) jest instrumentem misji; powtarzać po każdej fali zasięgu.

## 2026-09-02 · harness-timeouts-kill-process-group · class F
LEKCJA (instr/F-2): spawnSync z timeoutem zabijał tylko wrapper /usr/bin/time; właściwy grain refresh biegł dalej jako sierota i pisał do .grain/cache/ po upływie deklarowanego limitu — druga próba omal nie wyścigała się z sierotą o ten sam katalog. Naprawa w 44e1f9c: spawn detached + kill całej grupy procesów. Reguła dla każdej uprzęży z limitem czasu: limit musi zabijać GRUPĘ, a wiersz 'completed:false' ma być zapisany dopiero po potwierdzeniu, że proces nie żyje.

## 2026-09-02 · lead-must-not-merge-in-progress-worktrees · class D
PROCES (fala 3): lead scalił zawartość worktree F-2 (44e1f9c) ZANIM pracownik zraportował — pobrał bajt-w-bajt pliki z trwającej pracy, z danymi z pierwszej (przeterminowanej) próby. Wynik łagodny (pliki identyczne, poprawka harnessu weszła), ale to drugi raz (wcześniej fix/057 w trakcie). Reguła: merge WYŁĄCZNIE po raporcie pracownika z git log -1 i po premerge na tej gałęzi; 'widzę output w worktree' nie jest raportem.

## 2026-09-02 · esc-11
Acknowledged: F-2 completed loudly; the 30-min timeout on the 100k cold build is a recorded ladder row, and the 38-min report cost is ticket 087.

## 2026-09-02 · esc-12 · ticket 081
081 finding accepted as the reachability law: the advertisement text is the surface; unadvertised commands are unreachable (0/63). Fix ticket 088 queued at the top of wave 4 — advertisement names each command with its trigger moment; the pre-write hook volunteers obligation <path> for a new file (fire-rate gated, silent when nothing certifies); judged on the trial harness by invocations-per-command and answer-changed-diff. This gates any 17th command: it must be reachable by construction (named + a hook moment) or it is not built.

## 2026-09-02 · esc-13
Conflict resolution: .system/queue.json and queue.md are the LEAD's files — a worker branch must never carry them. Resolve by taking main's version of both (git checkout --ours -- .system/queue.json .system/queue.md during the merge, then git add), complete the merge, and re-add anything the worker's queue entry carried via queue add on main if it is missing (085 already exists — nothing lost). New worker rule recorded: workers commit only their ticket's issue.md/log.md under .system/, never queue.*, handoff.*, escalations.*, plan.md.

## 2026-09-02 · esc-14 · ticket 082
HIGH acknowledged, proceed. 082/083/084 are the 049/062 heritage family — same method: field-driven derivation from node-types.json (no language names), per-language supertype diff with zero real-heritage loss, guards that pass in both arms. All three touch the heritage walk in extractScopes: MERGE IN ORDER 082 → 083 → 084, each rebasing on the previous before premerge, so the same function is not resolved by hand. EXTR_V g33 at wave close (director).

## 2026-09-02 · esc-15 · ticket 083
HIGH acknowledged, proceed. 082/083/084 are the 049/062 heritage family — same method: field-driven derivation from node-types.json (no language names), per-language supertype diff with zero real-heritage loss, guards that pass in both arms. All three touch the heritage walk in extractScopes: MERGE IN ORDER 082 → 083 → 084, each rebasing on the previous before premerge, so the same function is not resolved by hand. EXTR_V g33 at wave close (director).

## 2026-09-02 · esc-16 · ticket 084
HIGH acknowledged, proceed. 082/083/084 are the 049/062 heritage family — same method: field-driven derivation from node-types.json (no language names), per-language supertype diff with zero real-heritage loss, guards that pass in both arms. All three touch the heritage walk in extractScopes: MERGE IN ORDER 082 → 083 → 084, each rebasing on the previous before premerge, so the same function is not resolved by hand. EXTR_V g33 at wave close (director).

## 2026-09-02 · esc-17 · ticket 086
HIGH acknowledged, proceed. 086 is the 041 family: the coverage note must NAME the secondary grammar whose files yield zero edges (not silently count it as covered), and the resolver gap itself is a separate question — floor is the truthful note (D fixture case), the resolver fix only if the grammar has a working resolver elsewhere. Disclosure fixtures (instrument D) must gain a mixed-source-set case so this cannot regress.

## 2026-09-02 · recovery-point-is-queue-plus-plan-not-lead-handoff · class D
Punkt odzysku toru 1 = .system/queue.json (stany, sha, agentId) + .system/plan.md (wave merged/audit) + tickety (status w linii 3) — wszystkie pisane narzędziami przy każdej operacji leada. handoff.json leada jest uzupełnieniem (intencja), nie warunkiem odzysku; dyrektor przestaje o niego przypominać (pięć przypomnień w jednej sesji to zły stosunek kosztu do zysku). Respawn leada z lead-brief.md czyta kolejkę i dziennik; to wystarcza.

## 2026-09-02 · esc-18 · ticket 083
Handled correctly: conflict in heritage-name extraction escalated, not hand-resolved; the 083 worker re-landed onto 082's heritageNamesOf refactor (2d1fc05) and it merged clean. This is the rule working. Ack.

## 2026-09-02 · esc-19 · ticket 084
Handled correctly: same shape as 18; the 084 worker re-landed onto 082/083 (f231b26), merged clean. Ack. Three heritage fixes in one function landed in order without a hand-resolved line — that is the process paying for itself.

## 2026-09-02 · esc-20 · ticket 085
Ruled: ticket 089 — every --json surface carries the text's disclosures as a structured, additive disclosures:[{kind,text}] field, done generically in the JSON renderer; instrument C gains a disclosure-parity test over the register; instrument A consumes disclosures[] so a disclosed weak answer is not counted as fabrication. Priority HIGH: an agent reading JSON currently gets the confident answer stripped of the honesty the text has — the exact failure class this project treats as worst. 085 merges as is; 089 follows.

## 2026-09-02 · lead-respawn-trigger · class D
PROCES (2026-09-02 12:05): lead grain-lead stanął — 088 i 080 miały gotowe commity od 70+ min bez premerge, 087 wisiał z niezacommitowaną pracą, 089 nie zostało wysłane po trzech szturchnięciach, żaden proces graina nie liczył, zero commitów leada od 10:30. Przyczyna najpewniej: 'oczekiwanie w tle' na monitory pracowników, które nigdy nie odpaliły. REGUŁA: sygnałem żywotności leada nie jest wiadomość ani handoff, tylko (a) gałęzie z commitem ponad main przy stanie kolejki 'running' > 60 min bez merge, lub (b) brak commitów leada > 60 min przy niepustej kolejce → dyrektor odstawia leada (stand down) i respawnuje z lead-brief.md pod NOWĄ nazwą (grain-lead-N). Stan jest w plikach; respawn kosztuje jeden brief.

## 2026-09-02 · ladder-rows-under-orphan-are-artifacts · ticket 087 · class F
LEKCJA (087, 2026-09-02): wiersz drabiny skali 'report 38.6 min / 5.2 GB' był ARTEFAKTEM — osierocony proces z pierwszej próby F-2 pisał do .grain/cache/ w trakcie pomiaru, więc report robił pełną odbudowę zepsutego cache. Profil (node --cpu-prof, świeży klon) pokazał report 0.46 s na ciepłym store; prawdziwe wąskie gardło to szerokość shardów BlobCache (zimna budowa 33.1→24.1 min, naprawione w 087). Reguła: pomiar wykonany, gdy jakikolwiek inny proces graina mógł pisać do store, jest nieważny; ladder ma sprawdzać przed każdym wierszem, że store nie jest w trakcie zapisu (lock/mtime), a dyrektor nie zakłada ticketu klasy F z pojedynczego wiersza bez powtórki na świeżym store.

## 2026-09-02 · lead-respawn-trigger-refined · class D
KOREKTA (2026-09-02 12:40) do lead-respawn-trigger: 087 NIE było zawieszone — profil pełnej historii Symfony (82 946 commitów) legalnie trwa ~2 h; stary lead miał rację co do tego pracownika. Wyzwalaczem respawnu były i pozostają: gałęzie z gotowym commitem (088 @10:50, 080 @10:55) niescalone >60 min, brak commitów leada >60 min, 089 niewysłane po 3 szturchnięciach. Doprecyzowanie reguły: 'running' pracownik bez commita NIE jest sygnałem zastoju (pomiary Opusa bywają wielogodzinne); sygnałem jest LANDED-bez-merge i pusta aktywność leada. Po respawnie stary lead dostaje 'stand down' i lead of record jest jeden: grain-lead-N (najwyższe N w handoff.json). Dwóch leadów na jednej kolejce = wyścig; wykryty tu na 080/088, main spójny (suita 2174).

## 2026-09-02 · trial-0-4-0-b-verdict-zero-in-25 · class G
WERDYKT DRUGIEJ PRÓBY (.system/research/trial-0.4.0-b.md, 12 przebiegów z 088, $7.08): 088 uczyniło obligation OSIĄGALNYM (0→4 wywołań CLI, completeness 0→2, 6 różnych komend vs 3) — i ujawniło, że obligation NIE MA NIC DO POWIEDZENIA na tych zadaniach: hook uruchomiony przy 14 zapisach, milczał 14×; sonda 14 nowych ścieżek w 6 repo = 0 certyfikacji; wszystkie 4 odpowiedzi CLI = 'nothing certifies'. Wywołania przed pierwszym zapisem bez zmian (−0,08, 0,04 se). answer-changed-diff = 0 — ŁĄCZNIE 0 NA 25 przebiegów z grainem w obu próbach. ROZSTRZYGNIĘCIE: (1) hipoteza 'osiągalna odpowiedź zmienia zachowanie' jest dobrze przetestowana i FAŁSZYWA dla obecnego zestawu odpowiedzi na tych zadaniach; (2) próby dotąd mierzyły zadania, na których ramię BEZ graina radzi sobie dobrze (umieszczanie identyczne w 5/6 par) — odpowiedź nie może zmienić diffu, który już jest dobry; NASTĘPNA PRÓBA dobiera zadania po PORAŻCE ramienia bez graina (złe umieszczenie, brakujący plik-partner), nie po wygodzie; (3) obligation: zmierzyć precyzję przy podłodze 4 (CFG.minRaw=5 → 4) na korpusie — wdrożyć TYLKO jeśli precyzja macro ≥0,80 z ujawnieniem; podłoga 3 była już zmierzona jako zła (078). NIE 'przesuwać podłogi' na ślepo. Szacunek na mierzalny efekt spada do ~25%.

## 2026-09-02 · measure-on-tasks-agents-fail-counterfactual-first · ticket 092 · class G
PROCES (dyrektor, po pytaniu użytkownika 'dlaczego nie poszliśmy dalej'): w 25 przebiegach grain ani razu nie powiedział czegoś, czego agent nie wiedział, a co było prawdą — odpowiedzi były nieistotne, puste albo potwierdzające. Mój błąd metody: po każdej próbie naprawiałem wskazany mechanizm (promocja współzmian → odrzucona; osiągalność obligation → pustka) zamiast zrobić kontrfaktyczny rozbiór per przebieg. I mierzyliśmy na łatwych zadaniach (~16 wywołań przed zapisem), gdy rynek to ~99. REGUŁA: żadna nowa zdolność bez (1) zadań, na których agent bez graina udokumentowanie zawodzi, i (2) tabeli kontrfaktycznej per przebieg ('jakie jedno zdanie w tym momencie by go zawróciło'). Tor utrzymania w trybie minimalnym (tylko HIGH), dopóki 092 nie odpowie.
