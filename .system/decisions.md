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
