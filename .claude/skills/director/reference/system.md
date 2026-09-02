# System pracy nad Grainem — pełny model

Jedno źródło prawdy o **jak** pracujemy. Dyrektor zmienia ten dokument świadomie i commituje. Stan operacyjny
(tickety, kolejka, handoff, eskalacje, decyzje, dziennik fal) jest w **commitowanym** `.system/` (mapa: `.system/README.md`); `.temp/` to wyłącznie scratch. Cały stan mutuje się narzędziami `scripts/`, nigdy ręcznie.

---

## 0. Cel i kryterium

**Gwiazda polarna:** Grain rozumie codebase lepiej niż jakikolwiek człowiek czy agent bez Graina; daje
odpowiedzi na wszelkie pytania, jakie ktoś może mieć pracując z danym codebase; jest ostatecznym narzędziem
dla agentów kodujących.

Dwa cele, w tej kolejności:
1. **Uczciwość.** To, co grain mówi, jest prawdą; czego nie widzi — mówi, że nie widzi. Pewna siebie zła
   odpowiedź jest gorsza niż milczenie; pewne siebie milczenie gorsze niż przyznanie się do ślepoty.
2. **Zasięg.** Grain odpowiada na pytania drogie, nieosiągalne inaczej, albo dające agentowi przyspieszenie,
   niższy koszt, spójność lub jakość.

Kryterium każdej decyzji: **zmierzona użyteczność**. Reguła „zero nowych strojonych progów" jest decyzją
projektową (strojone progi produkowały zapisane wypadki, które po zwinięciu w jedną stałą straty `λ` nie
wróciły) — nie mandatem. Zmierzony zysk użyteczności może ją przeważyć. Wolimy wyprowadzone od strojonych;
granicę raportujemy uczciwie jako pełnoprawny wynik.

**Reguła zdolności (decyzja `measure-on-tasks-agents-fail-counterfactual-first`, po 25 przebiegach z 0 zmienionych
diffów):** żadna nowa zdolność bez (1) zadań, na których agent **bez** graina udokumentowanie zawodzi (twarde,
~99-krokowe przebiegi, nie łatwe replaye), i (2) tabeli kontrfaktycznej per przebieg — *w którym wywołaniu agent
poszedł źle i jakie jedno zdanie w tym momencie by go zawróciło* — z dowolnego źródła, nie tylko graina. Dopiero z
tej listy wynika, co grain ma umieć powiedzieć. Naprawianie mechanizmu wskazanego przez próbę bez tego rozbioru
to dryf. Gdy taka próba jest w toku, tor 1 pracuje w trybie minimalnym (tylko HIGH); pusta lista kontrfaktyczna
obala hipotezę „wyrocznia" i dyrektor idzie do użytkownika z inną formą produktu (strażnik działający w hooku).

Ograniczenia użytkownika: klasa kosztowa agentów (Fable = tylko opinie); push — nigdy bez instrukcji.

---

## 1. Czego szukamy: siedem klas

System jest zorganizowany wokół **klas awarii**, nie języków ani komend — klasa ma instrument, język ma anegdotę.

| klasa | definicja | instrument |
|---|---|---|
| **A. Fabrykacja** | grain twierdzi coś, czego nie ma (makro jako nazwa zakresu; `assert_eq` jako supertyp; argument konstruktora jako supertyp; nota pokrycia certyfikująca nieobecność; „nigdzie nie zadeklarowane" o treści w plikach bez gramatyki) | audytor twierdzeń |
| **B. Milczenie** | grain nie widzi tego, co jest (ciała makr; klasy za makrem eksportu; modyfikatory Solidity; `object` Scali; 89k zakresów i 0 konwencji) | pokrycie deklaracji |
| **C. Rozjazd powierzchni** | dwa wyjścia nad jednym modelem się różnią (`report`/`rules`; `map`/`map --json`; `check`/`review`) | cross-check par |
| **D. Nieujawnione granice** | grain wie, że nie widzi, i nie mówi (nota kłamie; `selftest 0/0/0/0`; zastrzeżenie ginie w agregacie; cicha śmierć) | fixture'y ujawnień |
| **E. Ranking/selekcja** | właściwa rzecz jest, zła na górze (patologia IDF w `where`; bramka bliźniaków na medianie populacji; odstępca wypada z grupy przez cechę, na której odstaje) | uprzęże z automatyczną prawdą |
| **F. Skala** | grain pada na rozmiarze (proces znika po 17 min bez słowa) | drabina skali |
| **G. Zasięg pytań** | pytanie, którego grain nie umie odpowiedzieć, a odpowiedź ma wartość | katalog pytań |

A, B, D — najgroźniejsze i najbardziej mechanicznie sprawdzalne. E wymaga osądu. C czysto mechaniczna.
**G wyznacza kierunek produktu**; reszta — czy produkt mówi prawdę.

Dlaczego klasy: cztery języki testowane po raz pierwszy dały cztery defekty wysokiej wagi przy pierwszym
kontakcie (C++, Solidity, Scala, PHP w skali). Zwiadowcy próbkowali przestrzeń losowo; trzy sfabrykowane
supertypy znaleziono trzy razy osobno. Instrument zamienia szczęśliwe znalezisko w liczbę.

---

## 2. Jak testujemy: instrument na klasę

Instrument mierzy klasę na całym korpusie i daje liczbę per (repo, klasa). Triaż jest **po liczbie**.
Instrument **jest** retestem — w CI, na zawsze.

- **A. Audytor twierdzeń** — `plugins/grain/tests/stress/audit-claims.mjs`. Bierze `--json` komend i sprawdza
  każde weryfikowalne twierdzenie względem źródła: „zadeklarowane w `plik:linia`" → czy linia deklaruje nazwę;
  „extends Y" → czy `Y` jest typem istniejącym gdziekolwiek; „używane przez N plików" → ograniczenie z grepa;
  „nie pokrywa N plików (ext)" → pliki per rozszerzenie faktycznie bez krawędzi; „nie ma deklaracji nigdzie"
  → grep po **wszystkich** plikach, w tym bez gramatyki. Wynik: wskaźnik fabrykacji per repo, per typ.
  **Cel produktowy:** fabrykacja mierzona **per poziom pewności** twierdzenia; najwyższy poziom bliski zeru.
- **B. Pokrycie deklaracji** — `grain selftest --extract`. Per gramatyka: ułamek deklaracji widocznych dla
  wyroczni z `node-types.json` (węzeł z polem `name`/`declarator` i ciałem), które grain zapisał; plus
  odwrotność (zakresy, których wyrocznia nie uważa za deklarację). Granica wyroczni: Lua (`function M.foo()`)
  daje precyzję 0.23 mimo pełnego pokrycia — to ograniczenie wyroczni, nie graina.
- **C. Cross-check par powierzchni** — rozszerzenie suity `cross-check-*.test.mjs`: tekst ⇔ JSON per komenda;
  `report` ⇔ `rules`; `check` ⇔ `review` (w tym zastrzeżenia); `map` ⇔ `report`.
- **D. Fixture'y ujawnień** — `plugins/grain/tests/disclosure-fixtures.test.mjs`: test parametryzowany nad
  syntetycznymi repo ze ślepymi plamami; każdy przypadek asertuje, że ujawnienie **odpala i mówi prawdę**.
  Przypadki jeszcze czerwone są `test.todo` — kontrakt widoczny, suita zielona.
- **E. Uprzęże rankingowe** — `selftest --where` jest wzorcem: prawda z historii (commit dodający plik =
  zapisana decyzja, gdzie takie rzeczy mieszkają), zero etykietowania, model zerowy jako baseline, ocena **na
  warstwie bez wycieku** (zapytanie nie nazywa pliku), nigdy na medianie zbiorczej. To samo dla każdej
  powierzchni rankingowej.
- **F. Drabina skali** — `plugins/grain/tests/stress/run-corpus.mjs` + `corpus.json`: kubełki 1k/10k/100k
  commitów; per komenda czas, pamięć, **czy skończyła**.
- **G. Katalog pytań** — `.system/research/question-catalog.md`: pytania, które agent kodujący zadaje
  naprawdę (z transkryptów `.temp/stress/trials/*/without.jsonl` — każdy grep i otwarcie pliku to pytanie),
  ocenione per typ: grain odpowiada / gorzej niż grep / nie umie; luki po częstość × cena × wyprowadzalność.
  Wynik G to lista **funkcji**, nie błędów.

---

## 3. Korpus: mapowanie, nie próbkowanie

`plugins/grain/tests/stress/corpus.json` — stały, przypięte SHA. ~24 repozytoria po **osiach**: 23 gramatyki
(każda ≥1); idiomy wrogie założeniom (typ jako wiązanie stałej — Zig; makra generujące deklaracje — Rust; typy
w nagłówkach — C++; dziedziczenie z argumentami — Scala/Kotlin; moduł-tabela — Lua; metaprogramowanie —
Ruby/Python; modyfikatory bez sigla — Solidity; atrybuty — PHP 8/C#); kształty repo (monorepo, mieszane zestawy
źródeł, workspace, config-heavy, czyste C); drabina rozmiaru.

**Wsparcie języka udowadnia się instrumentami A–F na korpusie**, nie obecnością `.wasm`. Dokumentacja rozróżnia
„zwalidowane" od „parsowane, niezwalidowane". Nowe repo dające defekt wysokiej wagi przy pierwszym kontakcie
**nie** jest wspierane, dopóki instrumenty nie przejdą.

---

## 4. Kto: dwa tory

| rola | model | robi | nie robi |
|---|---|---|---|
| **Dyrektor** | Fable (sesja) | tor 2; decyzje z listy eskalacji; projekt instrumentów; audyt próbkowany; podbicia wersji; utrzymanie tego skilla | scalanie, suity, tickety z macierzy, potwierdzenia, rozdawanie kolejki |
| **Lead** | Sonnet, długowieczny | tor 1: kolejka, rozdawanie właściwej klasie, merge, instrumenty na korpusie, tickety z macierzy, weryfikacja **mechaniczna** (`premerge.mjs`) | osądu — §6 idzie do dyrektora |
| **Pracownik** | Sonnet (naprawy ze specyfikacją, instrumenty, zwiad ukierunkowany) / Opus (pomiary, projekty) | jedno zadanie, własny worktree, commit na gałęzi, raport ≤200 słów **do leada** | main, wersje, granice |
| **Fable-podagent** | Fable | wyłącznie opinia na pytanie dyrektora | implementacja, zwiad, pomiar |

| tor | prowadzi | co to jest | odpowiedzialność za wynik |
|---|---|---|---|
| **1 · Utrzymanie** | lead | pętla §5 | *main zielony, instrumenty nie regresują, macierz maleje między falami* |
| **2 · Kierunek** | dyrektor | **sekwencja decyzji**: katalog G → projekt+pomiar (Opus) → decyzja → ticket ze specyfikacją do toru 1 → własny instrument dla nowej zdolności | *grain odpowiada na więcej pytań niż miesiąc temu i lepiej niż grep* |

Ścieżki: pracownik → lead (wszystko). Lead → dyrektor (§6, „kolejka pusta", macierz). Projektant Opus →
dyrektor **bezpośrednio**. Dyrektor → użytkownik: klasa kosztowa, kierunek, push.

Rozmiar na teraz: 2–3 projekty kierunkowe + 6–8 pracowników leada; **trzech raportuje do dyrektora**.
Dziesięciu bezpośrednio było krawędzią.

**Dlaczego hub nie może być słabszy od tego, co weryfikuje:** dyrektor łapał raporty, których nagłówek dotyczył
połowy zmiany, naprawy częściowe przedstawiane jako pełne, i sam był poprawiany przez agentów — każda korekta
wymagała czytania kodu i liczb. Sonnet oceniający raport Opusa zatwierdzi to, czego nie umie podważyć. Stąd
lead weryfikuje **checklistą**, a osąd eskaluje.

---

## 5. Cykl toru 1

```
[1] PRZEBIEG      lead: instrumenty A–F na korpusie → macierz (repo × klasa)
[2] TRIAŻ         lead: komórki powyżej progu → tickety (tk new) z JUŻ zlokalizowaną przyczyną; HIGH → escalate add
[3] KOLEJKA       lead: queue add; Sonnet do naprawy ze specyfikacją, Opus do pomiaru; worktree z main, gałąź fix/NNN | instr/x
[4] PRACA         pracownik: FIRST ACTION git merge main → przygotuj → udowodnij czerwono-zielono → pełna suita w worktree → commit → raport
[5] WERYFIKACJA   lead: premerge.mjs <branch>; ✗ → eskalacja, nie interpretacja
[6] MERGE         lead: git merge na main; konflikt → autor albo eskalacja, nigdy ręcznie
[7] FALA          kolejka pusta → dyrektor podbija wersje raz, wave close --versions → lead: wave start → [1]
[8] ZWIAD         równolegle, cały czas: dyrektor zleca zwiadowców z HIPOTEZĄ na E i G
```
Fazy się nakładają (pipeline). Nic nie czeka na nic poza merge'em, który czeka na checklistę.

### Checklista przed scaleniem (`premerge.mjs` automatyzuje; ręcznie gdy trzeba)

- [ ] gałąź zakorzeniona w tipie main (nie STALE BASE)
- [ ] pełna suita zielona **w worktree pracownika** (`cd plugins/grain && npm test`; goły `node --test tests/*` pomija pod-suity)
- [ ] dowód czerwono-zielony: nowe testy padają na bazie, przechodzą po zmianie; strażnicy „nie wolno stracić" przechodzą w **obu** wariantach
- [ ] test-cofnięcia: nowe testy na main **przed** scaleniem = czerwone; po = zielone
- [ ] diff tylko w zakresie ticketu; `config.mjs` nietknięty poza autoryzowanymi
- [ ] delta instrumentu w dobrą stronę
- [ ] `EXTR_V`/`MODEL_V`/`HIST_V` nietknięte (batch dyrektora)
- [ ] `tk log` uzupełniony, `tk status` zaktualizowany

### Zasady pracownika (w każdym briefie)

- **PIERWSZA AKCJA: `git merge main`** i `git merge-base --is-ancestor main HEAD`, a potem **`git status`
  musi być czysty** — izolacja worktree tworzy gałąź z nieaktualnego refu i (fala 2, dwa razy) przepuściła
  cudzy niezacommitowany diff do świeżego worktree; brudne drzewo po merge = stop i raport.
  **Liczba suity niezgodna z briefem = zła baza, stop.**
- **Pod `.system/` pracownik commituje WYŁĄCZNIE `issues/NNN-slug/{issue.md,log.md}` swojego ticketu** —
  nigdy `queue.*`, `handoff.*`, `escalations.*`, `plan.md` (to pliki leada; gałąź pracownika niosąca
  `queue.json` dała konflikt strukturalnego JSON-a — rozwiązanie: `git checkout --ours` dla tych ścieżek,
  potem `queue add` na main, jeśli czegoś brakuje).
- **Raport końcowy zawiera `git log -1 --oneline`** wylądowanego commita — pracownicy zgłaszali „done" z pracą
  wciąż niezacommitowaną; lead commituje cudzy diff tylko po `premerge` i z wpisem `tk log NNN "lead committed"`.
- własny worktree, gałąź nazwana, commit tam; **nigdy** `git stash`/checkout innych gałęzi/push; **nigdy**
  przywracanie pliku z kopii całościowej (zniszczyło pracę dwóch agentów)
- skrypty wdrożeniowe na **kotwicach treści**, nie numerach linii; odmawiają przy dryfie; idempotentne
- podmiana cudzego pliku testowego w całości: przypiąć md5 bazy, odmówić zamiast nadpisać
- **nie** dopisywać nazw języków/makr/frameworków — predykaty z `node-types.json`
- **pomiar z `catch { continue }` po błędzie parsera nie jest pomiarem** — licz odrzucone; ładuj tylko gramatyki
  badanych rozszerzeń; liczby plików w ramionach muszą się zgadzać
- raport ≤200 słów, liczby; „nie mogę" jednolinijkowe jest dobrą odpowiedzią
- granica to pełnoprawny wynik

---

## 6. Lista eskalacji — do dyrektora, zawsze

1. nowa stała lub zmiana akceptacji (MDL/λ, `idxCost`, `neff`, `featW`, progi grup)
2. wniosek „to granica, nie naprawiamy"
3. konflikt przy scalaniu
4. ticket wysokiej wagi (nowy lub zmieniający status)
5. pomiar sprzeczny z wcześniejszym rozstrzygnięciem
6. zmiana tego, co grain **twierdzi użytkownikowi**
7. raport niesprawdzalny checklistą
8. podbicia wersji, przeformatowanie, zmiany skilla

Poza listą lead działa sam i **nie pyta**. Dyrektor raz na falę: **audyt próbkowany** (losowo jedno scalone,
pełna weryfikacja jak hub; wynik przez `wave audit`).

---

## 7. Stan trwały

| plik | co | pisze |
|---|---|---|
| `.claude/skills/director/` | ten skill: tożsamość, model, narzędzia | dyrektor (commitowane) |
| `.system/decisions.md` | rozstrzygnięcia i lekcje — czytane przed decyzją o silniku | `decide.mjs`, `escalate rule` |
| `.system/handoff.json` (+ `.md`) | stan intencji między sesjami | `handoff.mjs` |
| `.system/escalations.json` (+ `.md`) | kanał lead → dyrektor | `escalate.mjs` |
| `.system/issues/NNN-slug/issue.md` | ticket; status w linii 3 `**Status:**` | pracownik (log), lead (status) |
| `.system/issues/NNN-slug/log.md` | dziennik pracy | pracownik |
| `.system/queue.json` (+ `queue.md` renderowane) | kolejka | lead przez `queue.mjs` |
| `.system/plan.md` | dziennik fal, audyty, zamknięcia z wersjami | `wave.mjs` |
| `.system/research/` | dokumenty toru 2 | projektanci Opus |
| `.system/cache/last-suite.json` | ostatnia suita (pisze `premerge.mjs`) | narzędzia |
| `plugins/grain/tests/stress/results/` | macierze z przebiegów | instrument F |

Nazewnictwo gałęzi: `fix/NNN`, `instr/<nazwa>`, `research/<nazwa>`, `explore/<repo>`, `skill/<nazwa>`.
Pracownicy raportują **do leada po nazwie** podanej w briefie; lead do dyrektora po nazwie. Nazwy sesji muszą
być jednoznaczne — agenci wysyłali raporty do obcej sesji.

Format ticketu: `# NNN · tytuł`; `**Status:**` (linia 3); `**Found by:**`; `**Severity:**`; opcjonalnie
`**Class:**`; Symptom z **dokładną komendą i wyjściem**; przyczyna z `plik:symbol` (nie linia); czego NIE
obejmuje; Acceptance. `tk new` generuje szkielet.

---

## 8. Czego nie robimy

- „Uruchom każdą komendę na jednym repo" — losowe pokrycie za O(komendy × repo).
- Weryfikować przez ponowne wyprowadzanie — delta instrumentu + diff + cofnięcie.
- Traktować każdą fabrykację jako osobny ticket — klasa.
- Retest przez zwiadowcę — instrument jest retestem.
- Długie potwierdzenia — pięć linii; uzasadnienie do ticketu.
- Szeregowe lądowanie — commit bazy + worktree.
- Odpytywać drzewo — ukończenia budzą same.
- Kotwice liniowe.
- Odrzucać zmianę wyłącznie na gruncie konstytucji — kryterium jest zmierzona użyteczność.

## 9. Co zostaje, bo działa

MDL/λ i „kod to kod" jako **domyślne**; druga opinia Opusa przy trudnych decyzjach; niezależna weryfikacja
(tańsza, nie oddana); przygotuj-w-izolacji → czerwono-zielono → mały krok; tickety z przyczyną; granica jako
wynik; podbicia wersji batchowane przez dyrektora.

---

## 10. Między falami (dyrektor)

1. Jedno podbicie `EXTR_V` (i `MODEL_V`/`HIST_V` jeśli trzeba) pokrywające wszystkie zmiany fali. Klucze:
   `ENGINE_VERSION`, `EXTR_V` (trzy miejsca w store: `meta.json` extractor, `blobs/VERSION`, `history.json` x),
   `HIST_V` (`history.json` h), `MODEL_V` (`meta.json` model) — komentarz w `config.mjs` opisuje, co każde
   podbicie zmienia.
2. **Przeformatowanie silnika** (zatwierdzone): jedna instrukcja na linię, ~100–120 kolumn, komentarze
   nietknięte, Prettier, jeden atomowy commit „tylko format, zero logiki", suita udowadnia tożsamość. Dopiero gdy
   żadna gałąź nie wisi — `core.mjs` ma setki wieloinstrukcyjnych linii, a git scala po liniach.
3. `docs/validation.md`: liczba testów zakotwiczona w wersji silnika (test pilnuje kotwicy, nie liczby); tabela
   korpusu regenerowana z instrumentu F.
4. Aktualizacja tego skilla, jeśli model się zmienił.

**Kryterium sukcesu:** macierz maleje między falami; nowe repo w korpusie nie daje defektu wysokiej wagi przy
pierwszym kontakcie; lista z instrumentu G rośnie w funkcje, nie w błędy.

---

## 11. Kierunek: co katalog G powiedział i co z tego wynika (2026-09-01)

`.system/research/question-catalog.md` — 19 sparowanych przebiegów agentów, 5 repozytoriów, 1277 wywołań
narzędzi, 19 typów pytań. **Rynek:** agent wydaje średnio 39 wywołań przed pierwszym zapisem (99 na
realistycznych przebiegach = 61% pracy). **Ocena graina:** 5 typów dobrze / 3 częściowo / 1 gorzej niż grep /
5 wcale. Z 16 komend agenci użyli **dwóch** (`where`, `check`).

**Luka produktu w jednym zdaniu:** grain jest doskonały w „jak wygląda istniejący kod" (**precedensy**) i
nieobecny w „czego to repo ode mnie wymaga" (**zobowiązania**: co musi towarzyszyć zmianie, co się zepsuje,
jaka reguła mnie dotyczy, jaki kontrakt to przypina). Adopcja jest **odwrotnie** skorelowana z potrzebą.

Pięć z sześciu rekomendacji to **ekspozycja i ranking nad danymi, które model już ma** — zero nowej ekstrakcji:

| # | co | dane już w modelu | klasa | fala |
|---|---|---|---|---|
| 1 | `completeness`: rankuj partnera po **max z obu kierunkowych pewności**, drukuj liczbę; nigdy „(complete)" — mów „brak partnera powyżej n". Dziś 44 z 45 najgorętszych plików dostaje fałszywą nieobecność | `model.cochange` (`confidenceAB/BA`) | A+D+G | **3** |
| 3 | `used by: N files` → `used by: <nazwy>` (jedyny przypadek gorszy niż grep, pytany 19×) | `model.edges` | G | **3** |
| 4 | `what <symbol>` → linia `tested by:` | same-stem + `model.cochange` + `model.edges` | G | **3** |
| 5 | `how`: filtruj miejsca do plików żywych w HEAD (zbiór liveness już liczony w `cochangeData`, nieużyty tu); `map --json` + `changes`/`concepts` (= 051) | `model.pathsAll ∪ filesAll`, `model.changeArchetypes` | A+C | **3** |
| 6a | **adopcja** (nie silnik): nie reklamować jako `node <ścieżka>` (agent uogólnił odmowę `pnpm` na „node zablokowany"); reklama z SessionStart **nie dociera do pod-agentów Explore** (83 wywołania szukania na ślepo); mówić jednoznacznie plik vs katalog | hooki, SKILL produktu, shim `grain` na PATH | G | **3** |
| 2 | `where`: ścieżka symbol-first, normalizacja po liczbie zakresów (duży plik testowy wygrywa objętością) | indeks zakresów | E | po `research/where-lever` |

Kolejność fali 3 po dźwigni: 1 (fałszywa nieobecność na najgorętszych plikach) → 6a (bez adopcji nic powyżej
nie ma znaczenia) → 3 → 4 → 5. Każda pozycja to ticket ze specyfikacją z katalogu + własny test; 1 i 3 razem
dają odpowiedź „blast radius", której nikt na rynku nie daje.

Poza zasięgiem fali 3, zapisane: Q15 (obowiązek migracji) i N1 (przepływ danych) wymagają nowej ekstrakcji —
7. i 8. w rankingu. Nie zaobserwowano w korpusie przypadku, w którym dane współzmian graina zmieniły diff —
to jest **hipoteza do udowodnienia** po fali 3, nie fakt.
