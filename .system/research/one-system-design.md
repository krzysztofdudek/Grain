# Jeden system: plan jako graf nad węzłami — analiza i projekt

Odpowiedź na pytanie: *czy mechanika hordy pozwala na sensowne zrównoleglanie planu, i jak z Hordy,
Superpowers, Yggdrasila i Graina zrobić jeden spójny system, a nie dwa posznurkowane.*

Materiał: cała Horda (`<horde>`, gałąź `claude/grain-agent-tool-b89y0x`: SKILL.md, `reference/**`,
`templates/**`, wszystkie skrypty i ich testy) oraz całe Superpowers v6.3.0 (klon `obra/superpowers` w
scratchpadzie: README, CLAUDE/AGENTS, hook, wszystkie SKILL.md, prompty implementera/recenzenta/re-recenzji,
`writing-skills` z metodą testowania, `systematic-debugging` z testami presji, `writing-good-tests`, specyfikacje
projektowe: fix-loop, plan-scoped workspace + wyniki ewaluacji, worktree rototill, strict-cost). Każde twierdzenie
o zachowaniu niżej ma źródło w przeczytanym pliku lub w pomiarze wykonanym na potrzeby tej notatki (§3.3).

---

## 0. Werdykt w trzech zdaniach

1. **Horda zrównolegla wykonanie, ale nie ma planu jako grafu.** Ma kolejkę z krawędziami wpisywanymi ręcznie przez
   stewarda, dyspozycję bez żadnej wiedzy o tym, które bilety mogą kolidować, i protokół lądowania, w którym każdy
   merge na gałąź zespołu unieważnia recenzje wszystkich pozostałych biletów w locie. Zrównoleglenie kupuje czas
   ścienny, płacąc ponownymi weryfikacjami — koszt rośnie z pokrętłem `parallelism`.
2. **Superpowers nie ma grafu wcale, ale ma jego składniki.** Sekcja `Interfaces: consumes/produces` w zadaniu planu
   *jest* zależnością; `Files:` *jest* blokadą. Superpowers wyrzuca obie informacje, linearyzując plan w chwili
   pisania i wykonując zadania jedno po drugim. Jedyna równoległość to „podziel na osobne plany per podsystem" —
   czyli dokładnie podzespół Hordy, odkryty niezależnie.
3. **Jeden system = sześć faz Hordy, z planem jako grafem wyprowadzanym z węzłów, kontraktów i deklarowanych plików,
   z kluczami związanymi z treścią diffu zamiast z sha gałęzi, i z dyscyplinami Superpowers wpisanymi w prawo ról
   (briefy), nie w osobne skille.** Yggdrasil dostarcza krawędzie między węzłami i regułę, Grain ukryte sprzężenia
   i kandydatów na podział. Nic nie jest szyte: te same pliki obowiązują hordę dwunastu agentów i hordę jednego.

---

## 1. Co Horda robi dziś — mechanika równoległości, linia po linii

### 1.1 Jednostka równoległości: bilet w worktree

- Bilet nazywa jeden węzeł, dwa gdy niesie kontrakt (`tk.mjs new` odmawia trzech; `model.md` inwarianty).
- `queue.mjs set NNN running` tworzy gałąź `<horde>/t-NNN` **od bieżącego czubka gałęzi zespołu** i worktree pod
  `.horde/worktrees/<horde>/t-NNN` (`queue.mjs:210-…`). Worker pracuje tylko tam (`worker.md`, „First action":
  `git merge {{teamBranch}}`, czysty status albo stop).
- Steward bierze z kolejki „by DAG readiness, high severity first, up to `{{parallelism}}` workers at once"
  (`steward.md:53-54`); domyślnie `parallelism: 6` (`horde.mjs defaultConfig`).

### 1.2 Skąd biorą się krawędzie

- `queue.mjs cmdNext` (`queue.mjs:332-345`): kandydat = `state === 'queued'` ∧ każde `dependsOn` w stanie `merged`
  (`dependencySatisfied`, także między zespołami przez świeży odczyt cudzego `queue.json`); sortowanie: severity,
  potem FIFO. Zwraca **jednego** kandydata; steward woła wielokrotnie.
- Krawędzie wpisuje **człowiek-steward ręcznie**: „read the proposals, add them to the queue in dependency order
  (`queue.mjs add NNN [--depends …]`)" (`steward.md:47-49`). Nic ich nie wyprowadza — ani z `relations:` węzłów
  (które `node.mjs parseYgNodeYaml` już czyta), ani z kontraktów, ani z historii zmian.
- Wpis w szablonie biletu `**Depends on:**` jest tekstem; `Scope` mówi „Paths this may touch" prozą
  (`templates/ticket.md`).

### 1.3 Czego dyspozytor nie wie

- **Brak rozłączności węzłów i plików.** Dwa bilety tego samego węzła mogą biec równolegle; `premerge` item 3
  (`checkScope`) sprawdza tylko, że diff leży w granicy węzła — oba przejdą. Kolizja ujawnia się dopiero przy
  merge (`steward.md:74-76`: konflikt → „back to the author"), czyli po zapłaceniu za workera i weryfikatora.
- **Brak ścieżki krytycznej.** Priorytet = severity, potem kolejność zgłoszenia. Bilet, który blokuje pięć innych,
  nie jest traktowany inaczej niż bilet-liść.
- **Fala to nie warstwa DAG.** `wave.mjs` to dziennik: `start` otwiera przedział, `close` go zamyka, „merged:"
  w przedziale liczą się do fali (`waveMergedTickets`). Fala = jedno opróżnienie kolejki (`steward.md:87`: „Queue
  empty → … wave close"). To jest w porządku jako księgowość; nie jest planem.

### 1.4 Serializator: lądowanie, które unieważnia sąsiadów

To najważniejsze zdanie tej analizy. `premerge.mjs`:

- item 1 `checkBaseFreshness` (`premerge.mjs:143-154`): `merge-base(branch, parent) === parentTip`. **Każdy** merge
  na gałąź zespołu czyni **każdą** inną gałąź w locie STALE.
- item 2 `checkKeysForTicket` (`premerge.mjs:181-…`): aprobata właściciela jest zapisana jako `name@sha`
  (`tk.mjs:478`), werdykt weryfikatora jako `green at sha <sha>` (`verify.mjs:172`); oba są **stale, gdy sha ≠
  czubek gałęzi** (`staleApprovals`, `verdictStale`) — komunikat „approval/verdict predates … — re-review".
- Rutyna stewarda (`steward.md:70-79`): STALE → `git merge <team>` w worktree biletu → **nowy czubek** → klucze
  stale → „review-request the owner again and spawn a fresh verifier".

Skutek dla k biletów gotowych w tej samej chwili (weryfikator nigdy poniżej klasy biletu, `roster.mjs cmdSpawn`):

| strategia stewarda | weryfikacje | latencja lądowania |
|---|---|---|
| dziś, sekwencyjne doganianie (każdy bilet dogania raz, po poprzednim) | 2k − 1 | k pełnych cykli re-recenzji, szeregowo |
| dziś, doganianie zbiorcze (wszyscy doganiają po każdym merge) | k(k+1)/2 | k cykli, równolegle |
| po zmianie z §3.3 (klucze związane z patch-id) | k + (liczba biletów, których diff naprawdę zmienił się przez bazę) | doganianie i bramka darmowe; re-recenzja tylko tam, gdzie baza dotknęła diffu |

Dla warstwy 12 biletów: 23 albo 78 weryfikacji dziś, 12 + kilka po zmianie. To nie jest szczegół strojenia —
to jest odpowiedź na pytanie „czy równoległość w Hordzie jest sensowna": **mechanicznie tak, ekonomicznie nie,
dopóki lądowanie unieważnia to, co zostało już udowodnione o niezmienionym diffie.**

Uwaga: reguła „każdy werdykt związany z hashem" jest słuszna i zostaje. Zmienia się tylko **z czym** jest związany
(§3.3). Yggdrasil robi to samo od zawsze na poziomie reguł: werdykt deterministyczny jest adresowany treścią i
`yg check` odtwarza go bez klucza, gdy treść się nie zmieniła. Horda ma tę samą zasadę zastosować do biletów.

### 1.5 Co Horda ma dobrze i co zostaje

- Trzy siedzenia SDD (implementer / recenzent spec / recenzent jakości) to worker / weryfikator / właściciel — w
  świeżym kontekście, nigdy nie weryfikujący własnej pracy, z kluczami w plikach. Mocniejsze niż SDD.
- Test rewersji (`premerge` item 4, `checkRevertTest`): „testy czerwone na rodzicu" — to jest **RED z TDD
  uczyniony mechanicznym**. Superpowers wymusza RED prozą i tabelą racjonalizacji; Horda odmawia merge.
- Steward Sonnet + lista eskalacji (`SKILL.md:121-133`): dokładnie kształt, do którego eksperyment kosztowy
  Superpowers doszedł jako jedyna przeżywająca forma taniego kontrolera („judgment moved up front, mechanics
  cheapened, explicit escalation rules" — `strict-cost` L2 primary form; L2 sonnet bez eskalacji przepuścił
  podłożony defekt 4/5, L3 tanie recenzenty „DEAD"). Horda ma weryfikatora ≥ klasy biletu — zgodne z tym wynikiem.
- Podzespoły po węzłach z własną gałęzią i jednym merge-up (`roster.mjs cmdSpawn`, `premerge --level team`) —
  właściwa struktura na k(k+1)/2; dziś proponowana eskalacją „gdy dzielą się czysto po węźle", bez dowodu
  z grafu (§3.5 to wyprowadza).
- Tożsamość stanu w plikach per horda (`.horde/<horde>/…`) — Superpowers doszło do tego dopiero w
  `plan-scoped-workspace` (ledger z linią tożsamości; 25/25 kontrolerów w RED i tak nie przejmowało cudzego
  ledgera, ale płaciło ~9 wywołań narzędzi na dezambiguację). Horda nie ma tego problemu strukturalnie.

---

## 2. Czym jest plan w Superpowers — i dlaczego jest liniowy z wyboru, nie z konieczności

- `writing-plans`: zadania numerowane, każde z `Files:`, `Interfaces: Consumes/Produces` (dokładne sygnatury),
  krokami 2–5 min, `Global Constraints` w nagłówku; „If the spec covers multiple independent subsystems … separate
  plans — one per subsystem" (`SKILL.md:23`).
- `subagent-driven-development`: „Never dispatch multiple implementation subagents in parallel (conflicts)"
  (`SKILL.md:282`); jeden kontroler, świeży implementer per zadanie, recenzja spec + jakość, pętla poprawek z
  bezpiecznikiem (3 wznowienia + 2 świeże na mocniejszym modelu, potem adjudykacja — spec fix-loop), re-recenzja
  **zakresowa** (tylko ustalenia + diff poprawki), ledger, końcowa recenzja całej gałęzi.
- `executing-plans`: sekwencyjnie, stop na blokerze. `dispatching-parallel-agents`: tylko niezależne domeny
  (śledztwa, nie zadania planu).
- `brainstorming`: HARD-GATE na zatwierdzenie, jedno pytanie na raz, spec do `docs/superpowers/specs/`, recenzent
  speca z kalibracją „flag only what would break planning" (kompletność, spójność, jasność, zakres, YAGNI).

Kluczowa obserwacja: **`Consumes/Produces` to relacja porządku** (zadanie N konsumuje to, co produkuje M ⇒ N po
M), a **`Files:` to zbiór blokad**. Superpowers ma więc w każdym planie graf i jego blokady — i nigdy ich nie
materializuje, bo jego wykonawca jest jednosesyjny. Horda ma wykonawcę wielogałęziowego — i nie ma tych dwóch pól.
Jeden system powstaje przez włożenie tych pól do biletu Hordy i policzenie z nich grafu.

Drugie: Superpowers zmierzyło, że **liczba pętli recenzji to największa wariancja kosztu**, a jej źródłem jest
**niejednoznaczność planu** (`strict-cost`: „loops are mostly caused by plan ambiguity the implementer resolved
wrongly"; L1: nagłówek ograniczeń i `Interfaces` elicytują deterministycznie 0→5/5). Przełożenie na Hordę: bilet
z ustrukturyzowanymi `Files` i `Interfaces` pisany przez **właściciela węzła** (który ten węzeł zna) jest tańszy
w wykonaniu niż bilet-proza, niezależnie od równoległości.

---

## 3. Projekt: jeden system

Sześć faz Hordy zostaje (`model.md` „Flows"). Zmiany są w czterech miejscach: bilet, dyspozytor, lądowanie, prawo
ról. Poniżej każda zmiana ma: co, dlaczego, jaki skrypt, jaki test.

### 3.1 Bilet: `Files` i `Interfaces` jako pola, nie proza

Szablon `templates/ticket.md` dostaje dwa pola strukturalne (reszta bez zmian):

```
**Files:** src/auth/policy.ts, src/auth/policy.test.ts        # musi leżeć w granicy węzła
**Consumes:** auth/policy@1                                     # kontrakt lub port, którego bilet używa
**Produces:** auth/policy@2                                     # kontrakt lub port, który bilet dostarcza
```

- Właściciel wypełnia je przy propozycji (`owner.md` §Proposals) — to jest miejsce Superpowers `writing-plans`
  w jednym systemie: **plan pisze ten, kto zna węzeł, po jednym bilecie, w kontekście węzła**, a nie jeden planista
  dla całości. Kontrakty są już w Hordzie testami (`node.mjs contract propose`); `Produces/Consumes` nazywają je.
- `tk.mjs new` waliduje: każda ścieżka z `Files` wewnątrz `nodeBoundary` (ta sama funkcja co `premerge`
  `checkScope`); `Consumes` bez `Produces` w żadnym bilecie zespołu (ani w grafie jako istniejący kontrakt) → odmowa
  z nazwą brakującego kontraktu.
- `premerge` item 3 zaostrza się: diff poza `Files` → ✗ „declared A, touched B" (dziś: tylko poza granicą węzła).
  Zmiana `Files` w trakcie pracy to `tk.mjs edit` z wpisem w logu, nie cicha rozbieżność.

### 3.2 Plan: graf wyprowadzony, nie wpisany

Nowe `queue.mjs plan [--team t] [--json]`:

1. **Krawędzie z kontraktów:** bilet konsumujący `X@n` zależy od biletu produkującego `X@n`. Bilet dwuwęzłowy
   (kontrakt) poprzedza bilety obu stron, które go konsumują.
2. **Krawędzie z grafu:** z Yggdrasilem `relations:` węzła (już parsowane w `node.mjs`) i `yg impact --node`
   (kto zależy od węzła); bez Yggdrasila `node.json.dependsOn`. Bilet zmieniający port węzła A poprzedza bilety
   węzłów zależnych od A, które ten port konsumują; właściciele węzłów zależnych są dopisywani do listy aprobat
   biletu (dziś aprobują tylko właściciele węzłów **nazwanych** w bilecie).
3. **Krawędzie ręczne** (`queue add --depends`, `queue dep`) zostają jako suma, nigdy jako nadpisanie.
4. **Blokady z `Files`:** dwa bilety bez relacji porządku z przecinającymi się `Files` → konflikt blokady; `plan`
   go wypisuje i proponuje kolejność (mniejszy bilet pierwszy) — steward zatwierdza jedną komendą, nie zgaduje.
5. **Ukryte sprzężenia z Graina:** `scopeCochange` (model Graina, `learn.mjs` §J5.7b, poziom katalogów/węzłów, nie
   plików) z **obustronną** ufnością ≥ 1/3 dla par węzłów bez zadeklarowanej relacji → linia advisory: „węzły A i
   B zmieniały się razem w 31% commitów A i 40% commitów B; nie ma między nimi kontraktu — rozważ kontrakt albo
   kolejność". Zastrzeżenie z `where-cochange-promotion.md`: co-change **plikowe** z ufnością jednokierunkową
   wskazywało najgorętszy plik i zostało odrzucone. Tu pytanie jest inne (ryzyko interakcji dwóch **konkretnych**
   biletów, nie „gdzie zacząć") i poziom inny (węzeł); ale to jest **hipoteza do zmierzenia** na czterech
   wyroczniach, nie fakt — dlatego advisory, nigdy krawędź.
6. **Wynik:** warstwy (antyłańcuchy topologiczne), ścieżka krytyczna (najdłuższy łańcuch, w biletach i w
   klasach), składowe spójne grafu, konflikty blokad, cykle (odmowa z cyklem wypisanym), konsumpcje bez
   producenta. `--json` dla `brief.mjs` i `wave.mjs`.

„Planning as negotiation" (`model.md` flow 3, trzy rundy) zostaje dla sporów o kontrakty. Lista kontrolna
recenzenta planu z Superpowers (kompletność, zgodność ze spec, dekompozycja, wykonalność) wchodzi do briefu
**architekta**, który już rządzi zmianami grafu — bez nowej roli.

### 3.3 Lądowanie: klucze związane z treścią diffu (patch-id), nie z sha gałęzi

Zasada: **werdykt jest związany z tym, co osądził.** Weryfikator odtworzył dowód dla **diffu** biletu i
przeprowadził bramkę na **drzewie**; właściciel przeczytał **diff**. Dziś oba klucze zapisują sha czubka gałęzi,
który zmienia się przy każdym doganianiu bazy — także gdy diff jest bajt w bajt ten sam.

Zmiana:

- `verify.mjs record` i `tk.mjs review` zapisują obok sha **patch-id** diffu biletu względem rodzica:
  `git diff <parent>...<branch> | git patch-id --stable`. Sha zostaje jako pochodzenie; patch-id jest wiązaniem.
- `premerge` item 2: klucz ważny, gdy bieżący patch-id równa się zapisanemu. Item 5 (bramka) zostaje związany z
  sha drzewa i **przelicza się za darmo** (już dziś: „re-runs the gate when the verifier's recorded sha does not
  match"). Item 1 (świeżość bazy) zostaje: merge musi być czysty i zakorzeniony w czubku.
- Gdy patch-id **się zmienił** (rozwiązany konflikt, zmiana treści przez bazę): `premerge` wypisuje
  `git range-diff <old-parent>...<old-tip> <parent>...<tip>` do pliku, a `brief.mjs verifier NNN --delta` /
  `review-request --delta` renderują **re-recenzję zakresową**: „osądź różnicę między tym, co już zatwierdzono, a
  tym, co jest teraz" — to jest `re-review-prompt.md` z Superpowers (per-finding verdict, tylko diff poprawki)
  uczynione mechanicznym przez git. Pełna re-recenzja tylko na żądanie właściciela.

Pomiar wykonany na potrzeby tej notatki (git 2.43, repozytorium syntetyczne, plik 40 linii, bilet zmienia linię
20):

| co wylądowało na bazie po recenzji | merge | patch-id `-U3` | patch-id `-U0` |
|---|---|---|---|
| inny plik | czysty | **niezmieniony** | niezmieniony |
| ten sam plik, linia 35 (poza kontekstem 3 linii) | czysty | **niezmieniony** | niezmieniony |
| ten sam plik, linia 17 (w kontekście, nie sąsiednia) | czysty | **zmieniony** | niezmieniony |
| ten sam plik, linia sąsiednia | **konflikt** | — (wraca do autora, jak dziś) | — |

Semantyka jest więc dokładnie ta, której chcemy: zmiana bazy poza otoczeniem hunka → klucz przenosi się; zmiana w
otoczeniu → re-recenzja zakresowa; zmiana nachodząca → konflikt, do autora. Promień kontekstu (`-U3` domyślnie) jest
pokrętłem czułości i wchodzi do `config` jako `keyContext` (większy = ostrożniej, więcej re-recenzji). `-U0` jest
za luźny (ignoruje zmianę tuż obok) i **nie** jest proponowany.

Inwariant Hordy „every verdict is tied by hash" pozostaje prawdziwy; hash wskazuje treść, nie pozycję w historii.

### 3.4 Dyspozytor: blokady, rozłączność, ścieżka krytyczna

`queue.mjs next` (bez zmiany interfejsu; nowe `--why` wypisuje, czemu każdy gotowy bilet został pominięty):

1. twardo: `Files` biletu nie przecinają `Files` żadnego biletu `running` w zespole;
2. twardo (już jest): wszystkie `dependsOn` `merged`;
3. porządek: severity → **długość pozostałej ścieżki krytycznej przez ten bilet** (dłuższa pierwsza) → preferencja
   biletu, którego węzły nie są zajęte przez bilet `running` → FIFO.

Dwa bilety tego samego węzła z rozłącznymi `Files` mogą biec razem (właściciel i tak recenzuje oba). Bez
zadeklarowanych `Files` (stary bilet) blokadą jest cały węzeł — bezpieczna degradacja.

### 3.5 Fale i podzespoły: z grafu, nie z wyczucia

- `wave.mjs start` drukuje warstwę, którą otwiera, i ścieżkę krytyczną; `wave.mjs close` raportuje planowaną vs
  osiągniętą równoległość i **ile weryfikacji przeniósł patch-id** (mierzalny zysk §3.3, do dziennika i kosztu).
- `queue.mjs plan` drukuje składowe spójne grafu z liczbą biletów; gdy dwie składowe mają po > `parallelism/2`
  biletów, steward eskaluje podzespół **z tym dowodem** (`escalate.mjs add … --kind structure`, jak dziś). Reguła
  Graina „drobniejszy katalog staje się typem tylko tam, gdzie na własnym dowodzie bije rodzica" jest tą samą
  regułą dla podziału węzła: `grain propose` już liczy kandydatów poziomów typów — wystawić je jako „split
  candidates for node X", gdy jeden węzeł zbiera większość biletów fali.

### 3.6 Pętla poprawek z bezpiecznikiem

Horda ma stan `changes` (`tk.mjs status NNN changes "<why>"`) i **żadnego limitu rund** — ta sama patologia, którą
Superpowers opisało jako „literally repeat until approved". Wprowadzić to, co ich spec fix-loop ustalił i co pasuje
do klas Hordy:

- `config.fixRounds: { resume: 3, fresh: 2 }`; `tk.mjs status … changes` zlicza rundę w logu;
- rundy 1–3: **ten sam** worker wznowiony z ustaleniami (`SendMessage` po `agentId` z rostera — Horda już go
  zapisuje); rundy 4–5: świeży worker **klasę wyżej** z ramą przejęcia („poprzedni próbował N razy; bilet jest
  twój"); po 5: `escalate.mjs add --kind adjudicate` — dyrektor rozstrzyga, nigdy pętla („rulings not stalls");
- re-recenzja po poprawce jest **zakresowa** (§3.3: range-diff), nie pełna;
- ustalenia sprzeczne z kartą/kontraktem idą do dyrektora natychmiast (u nich: „plan authority, not loop churn").

### 3.7 Dyscypliny Superpowers jako prawo ról, nie skille

Dyscypliny, które są warte przeniesienia, i ich miejsce w jednym systemie:

| dyscyplina Superpowers | gdzie w Hordzie | jak jest egzekwowana |
|---|---|---|
| TDD (żelazne prawo, tabela racjonalizacji, `writing-good-tests`) | `worker.md` | test rewersji w `premerge` (RED mechaniczny); tabela racjonalizacji w briefie |
| systematic-debugging (4 fazy; 3 nieudane poprawki → kwestionuj architekturę) | `worker.md` | „3 nieudane → `dissent.mjs add`", nie czwarta poprawka; bezpiecznik §3.6 |
| verification-before-completion | `worker.md`, `verifier.md` | `verify.mjs record --ran/--saw` już wymaga dowodu; brief mówi „bez wyniku komendy nie ma klucza" |
| requesting/receiving-code-review (kalibracja severity, „verify before agreeing", `code-reviewer.md`) | `owner.md`, `verifier.md` | format ustaleń Critical/Important/Minor w `tk.mjs review … changes`; Minor nie wraca do workera, idzie do logu |
| brainstorming (jedno pytanie, 2–3 podejścia, HARD-GATE, recenzent speca) | framing w `SKILL.md`; `counsel.md` dostaje listę kontrolną speca | karta z sekcją dowodów istnieje; rada opiniuje kartę pytaniami z listy (kompletność, sprzeczności, zakres, YAGNI) |
| writing-skills (RED/GREEN na briefach, presja, „match the form to the failure", mikro-testy z kontrolą) | `scripts/tests/drills/` | drill = brief + scenariusz presji + **asercje na plikach `.horde/`** (czy gałąź workera ma commit z czerwonym testem przed poprawką; czy weryfikator zapisał `--ran/--saw`), nie na prozie agenta |

Teksty żyją **raz**, w `skills/horde/reference/discipline/*.md`; `brief.mjs` wkleja je do briefu roli (worker
dostaje TDD i debugging, weryfikator verification i receiving-review, właściciel kalibrację, dyrektor pytania
framingu). Nie ma hooka `SessionStart`, który „każe używać skilli" — brief jest kanałem dostarczenia, a
`premerge` egzekutorem. To rozwiązuje konflikt „dwa systemy roszczą sobie pierwszy ruch" z poprzedniej notatki.

Odrzucone, świadomie: `executing-plans`, `subagent-driven-development` jako całość (jednosesyjny kontroler —
zastępuje go steward + role), `dispatching-parallel-agents` (to jest `queue next`), `using-git-worktrees`
(Horda tworzy worktree sama, `steward.md:57`), `finishing-a-development-branch` (menu z `git push -u origin` —
sprzeczne z „push never"; Horda kończy „the user pushes"), `visual-companion`, hook.

Uznanie: MIT, `obra/superpowers`, w README i w każdym pliku `discipline/*.md` zdanie „wzorowane na …".

### 3.8 Horda jednego — degenerat, nie drugi system

Dziś README mówi: „For anything smaller, a single agent with Urd's ask-don't-guess discipline is the right tool,
not this one". Jeden system oznacza, że mała misja to **horda o jednym bilecie**, nie osobny skill: dyrektor jest
workerem, framing daje jedną kartę i jeden bilet z `Files`, weryfikator jest świeżym subagentem (dalej: nigdy
własna weryfikacja), test rewersji i bramka jak zawsze, dwa klucze, jeden merge. Koszt: jeden spawn weryfikatora.
Zysk: ta sama dyscyplina, te same pliki, ten sam dowód dla zadania na godzinę i na tydzień; nie ma drugiego zestawu
skilli „solo" do utrzymania i testowania. To jest decyzja maintainera (§5), bo przesuwa granicę między Urdem a
Hordą.

---

## 4. Co muszą wystawić Yggdrasil i Grain

**Yggdrasil**

- `yg impact --node <p> --json`: zależności odwrotne jako dokument maszynowy (dziś tylko tekst), z rozróżnieniem
  „zależy od węzła" / „konsumuje port X" — potrzebne do krawędzi §3.2 pkt 2 i do listy dodatkowych aprobat.
- `yg context --json` (jest, ta sesja) — briefy już go czytają (`node.mjs show`, Horda 122).
- Wykrycie zmiany portu w diffie: `yg check` w `premerge` (jest) + jedna linia w wyniku maszynowym „ta zmiana
  dotyka portu X węzła A używanego przez B, C" — wtedy `plan` dopisuje krawędzie i aprobaty automatycznie, także
  dla biletu, który portu nie zadeklarował w `Produces`.

**Grain**

- `grain couple --nodes <a> <b>` (albo sekcja w `grain export`): `scopeCochange` z obustronną ufnością dla par
  węzłów z mapowań grafu — źródło linii advisory §3.2 pkt 5; **najpierw pomiar** na czterech wyroczniach, czy
  wskazuje interakcje, a nie gorące katalogi.
- „split candidates for node X": kandydaci poziomów typów z `propose-levels.mjs` wystawieni per węzeł — dowód
  do §3.5.
- Pętla incydentów (wave 11 z handoffu): rozwiązany konflikt merge między biletami dwóch węzłów **bez kontraktu**
  to incydent do grafu (`yg incident`), a nie tylko wpis w dzienniku fali — to jest to „puste zakończenie"
  z suchej próby fabryki, incydent → graf.

---

## 5. Decyzje do podjęcia przez maintainera

1. **Patch-id jako wiązanie kluczy (§3.3)** — zmiana zasady, nie tylko skryptu. Rekomendacja: tak, z `-U3`
   i pokrętłem w konfiguracji.
2. **`Files`/`Consumes`/`Produces` jako pola biletu z walidacją (§3.1)** — zaostrza `premerge` item 3
   (diff poza zadeklarowanymi plikami odmawia). Rekomendacja: tak; stary bilet bez pól degraduje do granicy węzła.
3. **Horda jednego (§3.8)** — przesuwa granicę z Urdem. Rekomendacja: tak, ale po tym, jak 1–2 przejdą i
   będzie zmierzone, ile kosztuje weryfikator na małych biletach.
4. **Co-change węzłowe z Graina jako advisory (§3.2 pkt 5)** — tylko po pomiarze na wyroczniach.
5. **Sekwencja wdrożenia** (jedna gałąź Hordy, każdy krok z testami na prawdziwych repozytoriach, jak dotąd):
   (a) §3.3 patch-id + range-diff (największy zysk, najmniejsza zmiana powierzchni), (b) §3.1 + §3.2 bilet i
   `plan`, (c) §3.4 `next` z blokadami i ścieżką krytyczną, (d) §3.6 bezpiecznik, (e) §3.7 dyscypliny + drille,
   (f) §3.5 fale/podzespoły z grafu, (g) §4 zmiany w Yggdrasilu i Grainie równolegle do (b).

---

## 6. Przykład przepracowany

Misja: migracja uprawnień z ról na silnik polityk (z README Hordy). Węzły: `auth` (rdzeń), `api`, `web`, `cli`.
Propozycje właścicieli:

| bilet | węzeł | Files | Consumes | Produces |
|---|---|---|---|---|
| 101 | auth | `src/auth/policy*.ts` | — | `auth/policy@2` |
| 102 | api | `src/api/guard.ts`, test | `auth/policy@2` | — |
| 103 | web | `src/web/session.ts`, test | `auth/policy@2` | — |
| 104 | cli | `src/cli/auth.ts`, test | `auth/policy@2` | — |
| 105 | auth | `src/auth/roles*.ts` | — | — (usuwa tabele ról; ręczne `--depends 102,103,104`) |
| 106 | web | `src/web/theme.ts` | — | — |

`queue plan`: warstwy L0 {101, 106}, L1 {102, 103, 104}, L2 {105}; ścieżka krytyczna 101→10x→105 (3 bilety);
blokady: 103 i 106 dzielą węzeł `web`, `Files` rozłączne → mogą biec razem; składowe: jedna (106 wisi luźno) —
bez podzespołu.

Dziś: L1 to trzy bilety gotowe naraz → 3 weryfikacje + 2 (sekwencyjnie) albo + 3 (zbiorczo) re-recenzje z
świeżymi weryfikatorami Sonnet/Opus, a 105 czeka na ostatnią. Po zmianie: 102 ląduje; 103 i 104 doganiają
(inne pliki, patch-id bez zmian) → klucze przeniesione, bramka przeliczona, dwa merge bez re-recenzji; 105
startuje od czubka z trzema kontraktami zielonymi. Weryfikacji: 6 zamiast 8–9 w tej małej misji; w warstwie
dwunastu biletów 12 zamiast 23–78.

---

## 7. Czego ta analiza nie twierdzi

- Że patch-id wyłapie **semantyczną** interakcję poza kontekstem hunka (np. zmiana kontraktu w innym pliku, na
  którym diff biletu polega). Na to jest bramka (testy, `yg check`) i kontrakty-testy; jeśli kontrakt zmienił się
  w bazie, jego test jest czerwony na drzewie po doganianiu i bramka odmawia — klucz nie pomaga, i nie ma.
- Że co-change węzłowe niesie informację — do zmierzenia.
- Że horda jednego jest tańsza niż pojedynczy agent bez weryfikatora — jest droższa o jeden spawn i to jest cena
  drugiego klucza.
