# Cztery ręczne grafy zamiast jednego: co Grain naprawdę odzyskuje i gdzie leżą rozjazdy

**Ticket 108, połowa pomiarowa.** Ticket 093 zmierzył rekonstrukcję przeciw JEDNEJ wyroczni (Yggdrasil), 094
propozycję przeciw tej samej. Obie kończyły się tym samym zastrzeżeniem: `relation-undeclared-dependency` jest
w CI Yggdrasila wymuszony, więc jego ręczny graf jest kompletny z konstrukcji, a 0.998 precyzji może być sufitem
bramki, nie zdolnością minera. Trzy nowe wyrocznie — Grain na sobie samym, spring-petclinic, express — pisane
ślepo przez niezależne sesje, pozwalają to rozstrzygnąć.

**Odpowiedź w jednym zdaniu.** Precyzja 0.998 z Yggdrasila JEST reprezentatywna — na czterech repozytoriach
precyzja relacji wynosi 0.93–1.00 i Grain praktycznie nigdy nie wymyśla krawędzi. Pokrycie 0.894 NIE jest:
spada do 0.867 (express), 0.694 (Grain) i **0.114 (Java)**, a determinantą nie jest bramka CI — express nie ma
żadnej — tylko to, **ile grafu zależności jest w ogóle zapisane jako rozstrzygalny `import`**.

Wyrocznie są omylne (`oracle-is-fallible-report-disagreements-symmetrically`). Każdy rozjazd poniżej ma klasę
(a) chybienie minera / (b) dług grafu / (c) nierozstrzygalne, przypisaną **po przeczytaniu kodu za nim**, nie po
wyniku. W jedną stronę raport jest listą błędów Graina; w drugą — listą długu czterech ręcznych grafów.

---

## 0. Co zostało uruchomione

| co | polecenie |
|---|---|
| eksport | `node plugins/grain/bin/grain.mjs export --repo <target> --out export-<n>.json --compact --no-anchors` |
| rekonstrukcja | `node plugins/grain/tests/stress/reconstruct.mjs <target> recon-<n>.json --graph <oracle> --export export-<n>.json --advise advise-<n>.txt --md` |
| propozycja + wynik | `YG_BIN=… node plugins/grain/tests/stress/propose.mjs <target> prop-<n> --export export-<n>.json --score <oracle> --json prop-<n>.json` |
| cykle wyroczni | kopia repo + `.yggdrasil/` wyroczni w korzeniu, `git init`, `node $YG_BIN advise` |
| walidacja propozycji | kopia repo bez `.git/.grain/.yggdrasil` + `prop-<n>/.yggdrasil` w korzeniu, `git init`, `yg check --summary`, `yg check --approve --only-deterministic` |

`YG_BIN=/home/user/Yggdrasil/source/cli/dist/bin.js` (Yggdrasil 5.8.0). Żaden klon korpusu nie został zmieniony:
wszystko biegło na kopiach pod scratch. Grain na sobie samym mierzony jest na **klonie w scratch wymeldowanym na
`3d249bf`** — commicie, przeciw któremu pisano wyrocznię — a nie w worktree (worktree ma dziś 1888 plików, w tym
408 plików samych wyroczni, których żaden typ wyroczni nie klasyfikuje). Nic nie zostało zapisane do
`/home/user/Yggdrasil`.

Czasy: eksport petclinic 106 s, grain 235 s, express 242 s, Yggdrasil 63 s (z ciepłym cache);
instrument rekonstrukcji 0.2–2.7 s; `propose` 7 / 9 / 26 / 77 s.

### Dwie naprawy instrumentu (test czerwony przed, jeden commit na każdą)

1. **`reconstruct.mjs --graph <dir>`.** Instrument zakładał, że graf leży w `<repo>/.yggdrasil/`. Wyrocznia
   pisana PO TO, by mierzyć minera, leży obok kodu, który opisuje — trzy grafy pod
   `plugins/grain/tests/stress/oracles/` są w tym repozytorium, a repozytoria, które opisują, są klonami gdzie
   indziej. Bez tego nie da się ich w ogóle użyć. `--graph` przesuwa wyłącznie odczyt grafu; `git ls-files`,
   dopasowanie `content:` i każde ciało pliku dalej pochodzą z repozytorium docelowego.
2. **`propose --score`: `content:` liczone przeciw repozytorium.** `scoreProposal` czytał graf i ciała plików
   z tego samego katalogu. Punktowane przeciw wyroczni obok kodu, **każdy typ bramkowany `content:` rozwijał się
   do zbioru pustego i wypadał z mianownika recall bez żadnego błędu** — sama architektura petclinic ma 18
   predykatów `content:`.

Obie naprawy mają test, który był czerwony przed nimi. Żadna nie dotyka warstwy wydobywczej.

---

## 1. Tabela zbiorcza — co eksport JUŻ TRZYMA (rekonstrukcja)

| repo | plików | wyrocznia: typy / węzły / relacje / aspekty (det+proza) | Grain: part. / mod. / krawędzie / konwencje | typy J≥0.5 | węzły J≥0.5 | relacje recall | relacje precision | cykle | aspekty nazwane |
|---|---|---|---|---|---|---|---|---|---|
| **grain** (JS, 3d249bf) | 1470 | 33 / 35 / 49 / 30 (22+8) | 19 / 20 / 1106 / **0** | **18/33** (0.545) | **28/35** (0.800) | 34/49 = **0.694** | 34/34 = **1.000** | 0 vs 0 ✔ | 2/22 |
| **spring-petclinic** (Java, 818c413) | 131 | 28 / 20 / 35 / 28 (23+5) | 3 / 10 / 10 / 6 | **4/28** (0.143) | **3/20** (0.150) | 4/35 = **0.114** | 4/4 = **1.000** | 0 vs 0 ✔ | 1/23 |
| **express** (CJS, 023767f) | 213 | 13 / 15 / 15 / 23 (20+3) | 4 / 32 / 153 / 26 | **7/13** (0.538) | **9/15** (0.600) | 13/15 = **0.867** | 13/14 = **0.929** | 0 vs 0 ✔ | 4/20 |
| **Yggdrasil** (TS, 5cca6b1) | 3019 | 36 / 393 / 1261 / 70 (57+13) | 19 / 37 / 2161 / 149 | **19/36** (0.528) | **83/393** (0.211) | 1105/1236 = **0.894** | 1105/1107 = **0.998** | 2 mined vs 1 advise, 1 zgodny | 11/57 |

Wiersz Yggdrasila odtwarza 093 **co do jednej liczby** (19/36 typów, 83/393 węzłów, 61/68 par modułowych,
0.894/0.998, 11/57 aspektów) — czyli cztery wiersze są mierzone tym samym instrumentem w tym samym stanie.

Relacje są liczone na **granularności samej wyroczni** (plik należy do węzła, którego `mapping:` nazywa go
najprecyzyjniej; obie strony agregowane do para węzeł→węzeł). Agregacja modułowa nie jest tu raportowana jako
nagłówek, bo na express 15 zadeklarowanych relacji rozdmuchuje się do 57 par modułowych (węzeł organizacyjny
`examples` rozciąga się na kilkanaście modułów) — to mierzy graf modułów, nie graf relacji.

### Klasy rozjazdów, per repo

| repo | TYPY J<0.5 a/b/c | WĘZŁY J<0.5 a/b/c | RELACJE: wyrocznia ma, Grain nie ma a/b/c | RELACJE: Grain ma, wyrocznia nie ma a/b/c |
|---|---|---|---|---|
| grain | 8 / 1 / 6 | 0 / 1 / 6 | **1 / 8 / 6** | 0 / 0 / 0 |
| spring-petclinic | 3 / 2 / 19 | 0 / 0 / 17 | **25 / 3 / 3** | 0 / 0 / 0 |
| express | 2 / 0 / 4 | 0 / 0 / 6 | **0 / 0 / 2** | 0 / **1** / 0 |
| Yggdrasil | 7 / 2 / 8 | 0 / 1 / 309 | 0 / 0 / 131 | 0 / 0 / 2 |
| **suma** | **20 / 5 / 37** | **0 / 2 / 338** | **26 / 11 / 142** | **0 / 1 / 2** |

**Trzy rzeczy widać już tutaj.** Po pierwsze, kolumna (a) po stronie węzłów jest **zerowa na wszystkich
czterech** — z konstrukcji, bo porównanie węzłów przeszukuje każdy poziom, który Grain publikuje. Po drugie,
klasa (a) po stronie relacji to prawie w całości jedno repozytorium: **25 z 26 to petclinic**. Po trzecie,
w drugą stronę Grain wyprodukował w sumie **3 pary, których nie ma żadna wyrocznia** — na 1335 par
zadeklarowanych łącznie.

---

## 2. Tabela zbiorcza — co `propose` PISZE

| repo | typy | alternatywy | węzły | relacje | cykle | aspekty | enforced | advisory | draft | drill | krata / sub-gate | recall typów | + alt. | precision typów | recall węzłów | precision węzłów | reguły nazwane |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grain | 31 | 190 | 34 | 22 | 0 | 81 | **0** | 22 | 59 | 338 | 5453 / 430 | 15/33 | **21/33** | 18/31 | 15/35 | 18/31 | 0/15 |
| spring-petclinic | 12 | 18 | 14 | **0** | 0 | 18 | **0** | 9 | 9 | 82 | 270 / 62 | 2/28 | 6/28 | 3/12 | 0/20 | 0/12 | 0/15 |
| express | 22 | 175 | 22 | 31 | 0 | 40 | **1** | 4 | 35 | 151 | 1950 / 77 | 6/13 | 6/13 | 7/22 | 6/15 | 7/22 | 1/5 |
| Yggdrasil | 82 | 284 | 72 | 210 | 8 | 215 | **8** | 11 | 196 | 960 | 6552 / 587 | 21/36 | 23/36 | 23/82 | 30/393 | 31/70 | 6/37 |

`yg check` na propozycji, na skopiowanym repozytorium:

| repo | ładuje się | pokrycie | po `--approve --only-deterministic` | odmowy na NIETKNIĘTYM kodzie |
|---|---|---|---|---|
| grain | **PASS**, 34 węzły, 81 aspektów | 1466/1470 (100%) | 616/616 (216 ok, **400 odmów**) | **65%** — 396 z 400 na `plugins/grain/tests/relations/unit/**` |
| spring-petclinic | **PASS**, 14 węzłów, 18 aspektów | 131/132 (99%) | 224/225 (180 ok, 44 odmowy) | 20% |
| express | FAIL (6 błędów), 22 węzły, 40 aspektów, **0 kodów blokujących ładowanie** | 213/213 (100%) | 356/358 (245 ok, 111 odmów) | 31% |
| Yggdrasil | FAIL (1 `structural-cycle` + odmowy) | 1366/1615 (85%)¹ | 1152/1155 (909 ok, 243 odmowy) | 21% |

¹ artefakt wzorca opisany w 094 §7: Yggdrasil modeluje własny katalog `.yggdrasil/` i katalogi `examples/*/`
mają własne projekty; ten przebieg wystawił pełne drzewo, bez upuszczania 13 węzłów, które 094 upuszczało.

**Kolumna „enforced" jest pusta na dwóch z czterech i prawie pusta na trzecim.** `enforced-requires-certified-origin`
mówi, że tylko certyfikowana konwencja może zostać prawem — a certyfikowanych konwencji jest 149 (Yggdrasil),
26 (express), 6 (petclinic) i **0 (Grain na sobie)**.

**A ostatnia kolumna jest najważniejszą liczbą w całym raporcie.** Adopter, który przyjmie propozycję i uruchomi
darmową bramkę, dostaje od 20% do 65% odmów na kodzie, którego nie tknął. Rozłożone na reguły (§9, 115) okazuje
się to jedną populacją: **35 z 44 odmów petclinic, 102 ze 112 express i 398 z 400 Graina to reguły o kierunku
`false`** — „pliki tutaj NIE importują X", „przypadki tutaj NIE wołają `it`". Nie jest to kwestia progu.

---

## 3. Odkrycie, którego nie było w planie: Grain na własnym repozytorium certyfikuje ZERO konwencji

```
[grain] indexed in 230.9s: 0 conventions, 7346 scopes, learn 56967ms
export … — 0 conventions · 207 groups · 0 deviating sites · 25 co-change pairs
```

1159 sparsowanych plików, 7346 zakresów, 2032 pozycje w indeksie wartości, 207 grup ról — i ani jedna konwencja
nad bramką λ. Dla porównania: Yggdrasil 149, express 26, petclinic 6.

Konsekwencje są mechaniczne i wszystkie zmierzone: **wszystkie 22 wyrenderowane `check.mjs` pochodzą z kraty
sub-gate**, więc `enforced` = 0; **aspekty nazwane = 0/15**; a `--approve --only-deterministic` na propozycji
odmawia **400 z 616 par (65%)**, z czego **396 na 880-plikowym korpusie fikstur relacyjnych**. Na własnym
repozytorium dominującą praktyką, którą miner widzi, są jego własne fikstury testowe.

To nie jest wynik przeciw wyroczni — to wynik o Grainie, i należy do backlogu 117.

---

## 4. Księga rozjazdów relacyjnych — każdy wiersz przeczytany w kodzie

### 4.1 spring-petclinic: 31 brakujących par, 0 nadmiarowych

| klasa | n | mechanizm | dowód |
|---|---|---|---|
| **(a)** | **17** | referencja do klasy w TYM SAMYM pakiecie — Java nie wymaga importu, a `uses()` vendorowanego ekstraktora emituje kandydatów tylko dla `import_declaration` i `scoped_type_identifier` (`engine/vendor/relations/extractors/java.mjs:65-120`), więc gołe `Owner` nie jest kandydatem w ogóle | `owner/OwnerRepository.java:11` `extends JpaRepository<Owner, Integer>`; `owner/OwnerController.java:33` `private final OwnerRepository owners;`; `vet/VetController.java:19` `private final VetRepository vetRepository;`; `vet/Vets.java:14` `private List<Vet> vets;`; `owner/PetTypeFormatter.java:14,16`; `vet/VetRepository.java:14`; `owner/PetController.java:77` `new PetValidator()`; `owner/OwnerControllerTests.java:41` `@WebMvcTest(OwnerController.class)`; `vet/VetControllerTests.java:27`; `system/WelcomeControllerTests.java:16` |
| **(a)** | **8** | import test→main przez granicę korzeni źródeł. `resolveType` (`engine/vendor/relations/extractors/java-resolve.mjs:22-34`) próbuje `<przodek>/<fqn>.java` tylko po katalogach nadrzędnych pliku ŹRÓDŁOWEGO; z `src/test/java/…` nigdy nie sięga po siostrzany `src/main/java` | `service/ClinicServiceTests.java:20,21,26,27`; `PetClinicConcurrencyTests.java:22,23`; `PetClinicIntegrationTests.java:17`; `service/EntityUtils.java:6` |
| **(c)** | **3** | kontroler nazywa szablon Thymeleaf zwróconym łańcuchem znaków | `owner/OwnerController.java:51` `VIEWS_OWNER_CREATE_OR_UPDATE_FORM = "owners/createOrUpdateOwnerForm"`; `vet/VetController.java:56` `return "vets/vetList";`; `system/WelcomeController.java:26` `return "welcome"` |
| **(b)** | **3** | dług wyroczni. Dwie krawędzie `resources/db-scripts -> app/{owner,vet}/entities`, o których README wyroczni sam pisze: *„an edge that exists to widen a read boundary, not because the SQL depends on the Java"*; plus `tests/web-slice -> tests/unit` bez żadnego oparcia w kodzie | żaden plik `db/*/…sql` nie nazywa żadnego pliku encji; żaden plik `*ControllerTests.java` nie nazywa żadnego pliku `tests/unit` |

**Pułapka `Vet ↔ Specialty` nie została uruchomiona** — Grain nie emituje krawędzi między nimi. Ale to nie jest
wygrana: `Specialty.java:24` nazywa `Vet` wyłącznie w javadocu `{@link Vet Vet's}`, a `Vet.java:50,52,60,70`
nazywa `Specialty` czterokrotnie w kodzie — i Grain **nie widzi ani jednego z tych pięciu miejsc**, bo nie widzi
żadnej referencji wewnątrzpakietowej w Javie. Pułapka została ominięta ślepotą, nie ostrożnością, i uczciwy
zapis jest taki.

### 4.2 express: 2 brakujące pary, 1 nadmiarowa

| klasa | para | dlaczego |
|---|---|---|
| **(c)** | `package/http/request -> package/application` | `lib/request.js` **nie ma `require('./application')`** (jego 8 `require` to `accepts`, `node:net`, `type-is`, `node:http`, `fresh`, `range-parser`, `parseurl`, `proxy-addr`). Zależność to `this.app.get(…)` w `lib/request.js:231, 301, 341, 358, 388, 419` — własność podpięta w czasie działania |
| **(c)** | `package/http/response -> package/application` | to samo: `lib/response.js:132, 236, 264, 402` (`this.app`) i `:895` (`this.req.app`). README wyroczni opisuje dokładnie ten mechanizm i mówi wprost, że jej notacja go nie utrzyma |
| **(b)** | `examples -> package/factory` (Grain ma, wyrocznia nie ma) | `examples/route-map/index.js:8` i `examples/route-middleware/index.js:7`, oba `require('../../lib/express')`. To jest **umyślna czerwona linia wyroczni**: architektura zabrania `example-app -> library-entry`, więc wbudowany check ma to odmówić. **Grain odtworzył zasadzone naruszenie z samego dowodu.** |

### 4.3 grain: 15 brakujących par, 0 nadmiarowych

| klasa | n | co to jest |
|---|---|---|
| **(a)** | **1** | `plugin/engine/propose -> plugin/engine/core` — dynamiczny import składany z literału: `engine/propose.mjs:54` `const CORE = resolve(here, 'core.mjs')`, `:704` `await import(\`file://${CORE}\`)` |
| **(b)** | **8** | siedem, przy których pliki węzłów wyroczni same piszą *„No code dependency … declared so \<reguła\> may read \<cel\>"* (`commands→dispatch`, `hooks→dispatch`, `grammars→config`, `manifests→config`, `marketplace→manifests`, `readme→docs`, `readme→config`) — README wyroczni dodaje: *„A recovery scored on static imports alone will correctly not find any of these, and they should not count against it"* — plus **jeden prawdziwy błąd wyroczni**: `repo/fixture -> plugin/entry`, gdzie `tests/fixtures/build-fixture.mjs` nie wywołuje Graina ani razu (jedyne wystąpienie słowa „grain" jest w komentarzu w linii 2) |
| **(c)** | **6** | osiągane przez `spawn` zbudowanego binarium albo przez pośrednika: `tests/stress→entry` (`run-corpus.mjs:36`), `repo/instruments→entry` (`tests/stress/agent-trial.sh:16`), `tests/suite→engine/export` (test odpala `bin/grain.mjs export`), `tests/relations/unit→{engine/core, vendor-relations}` przez `_unit-harness.mjs`, który należy do węzła `harness`, `director/tools→director/state` (zapis do `.system/decisions.md` po ścieżce) |

### 4.4 Yggdrasil: 131 brakujących, 2 nadmiarowe

Klasyfikacja z 093 stoi, bo ten przebieg odtwarza jej liczby dokładnie: 131 to relacje zadeklarowane dla
zależności osiąganej **przez pośrednika** (`loadGraphOrAbort` w warstwie wsparcia komend), więc nie ma
bezpośredniego importu do rozstrzygnięcia — klasa (c), ta sama, co 4.3 wiersz trzeci.

---

## 5. Typy: gdzie leży cięcie, które wygrywa (materiał dla 110)

Klasa (a) po stronie typów ma jedno znaczenie: **Grain TRZYMA ten zbiór, tylko nie na poziomie, który jest
punktowany** (partycja albo moduł). Poziom, który go trzyma, jest zmierzony:

| repo | typy klasy (a) | poziom, który ma zbiór | najlepsze dopasowanie WĘZŁA przychodzi z |
|---|---|---|---|
| grain | 8 | karta katalogu 3, grupa ról 5 | moduł 17 · grupa 9 · katalog 6 · partycja 3 |
| spring-petclinic | 3 | karta katalogu 2, grupa ról 1 | **katalog 9** · grupa 4 · moduł 4 · partycja 3 |
| express | 2 | grupa ról 2 (`lib::r0 render+try` J=1.00, `lib::r1 accepts` J=0.50) | **moduł 12** · grupa 2 · partycja 1 |
| Yggdrasil | 7 | grupa ról 4, karta katalogu 3 | **grupa 182** · katalog 131 · moduł 72 · partycja 8 |

Nie ma jednego zwycięzcy. Na express wygrywa **moduł** (12 z 15 węzłów), bo repozytorium jest płaskie i jego
katalogi SĄ jego warstwami. Na petclinic wygrywa **karta katalogu** (9 z 20), bo pakiety Javy są katalogami,
a moduł je połyka. Na Yggdrasilu i Grainie wygrywa **grupa ról** (182 z 393; 9 z 35). Klasa (b) — zbiór, który
nie jest lokalizacją w układzie kodu — pojawia się 5 razy łącznie i to są zawsze kategorie, nie miejsca:
`repo-config` i `ci-config` (Yggdrasil), `plugin-manifest` (grain, rozproszony po 4 modułach),
`build-tooling` i `dev-environment` (petclinic).

Klasa (c) to 37 z 62 rozjazdów typowych i jest w całości granularnością: 19 z nich to petclinic, gdzie
**każdy** typ Javy jest wycinkiem jedynego modułu `src/main/java`.

---

## 6. Cykle

| repo | wyrocznia deklaruje | `yg advise` nominuje | Grain wydobywa | werdykt |
|---|---|---|---|---|
| grain | 0 (README: *„a recovered cycle here is a false positive, not a find"*) | 0 | 0 | zgoda |
| spring-petclinic | 0 (91 krawędzi, zero cykli na trzech granularnościach) | 0 | 0 | zgoda, ale patrz 4.1 |
| express | statyczny graf `require` acykliczny; 3 cykle **czasu działania**, których schemat nie utrzyma | 0 | 0 | zgoda co do grafu statycznego; 3 cykle runtime są poza obiema stronami |
| Yggdrasil | — | 1 (przy 5cca6b1; zrzut z 093 przy wcześniejszym commicie miał 2) | 2 | 1 zgodny |

Na trzech repozytoriach, na których prawidłowa odpowiedź brzmi „zero", Grain odpowiada zero. To jest wynik
negatywny i liczy się tak samo jak dwa trafione cykle Yggdrasila: **żadnego fałszywego alarmu na 4 repozytoriach**.

---

## 7. Aspekty: które klasy reguł NIGDY nie mają odpowiednika

| repo | deterministyczne | nazwane | (a) chybienie | (c) niewidoczne z konstrukcji | niemierzalne |
|---|---|---|---|---|---|
| grain | 22 | 2 | 4 | 8 | 8 |
| spring-petclinic | 23 | 1 | 7 | 7 | 8 |
| express | 20 | 4 | 1 | 0 | 15 |
| Yggdrasil | 57 | 11 | 20 | 6 | 20 |
| **suma** | **122** | **18** | **32** | **21** | **51** |

**Klasa (c) — reguła o NIEOBECNOŚCI — potwierdza się na drugiej i trzeciej wyroczni i jest liczniejsza, niż
sądziło 093.** 21 reguł ze 122 nazywa identyfikator, który **nie występuje nigdzie w ich zbiorze przyczepienia**.
Petclinic dostarcza najczystszych okazów: `domain-free-of-web` i `repository-free-of-web` zakazują
`org.springframework.web.`, `jakarta.servlet.` — czego domena nie importuje ani razu; `no-rest-controller`
zakazuje `RestController`, którego w repozytorium nie ma; `no-stdout-in-production-code` zakazuje
`printStackTrace`, którego nie ma. Miner tego, co się PRAKTYKUJE, nie zobaczy reguły, która istnieje dlatego, że
repozytorium czegoś nie robi — nie jako próg do dostrojenia, tylko jako kwestia tego, jaki dowód w ogóle
istnieje. Materiał dla 115.

**Kubeł „niemierzalne" jest w połowie artefaktem pomiaru i to trzeba powiedzieć.** `aspectLiterals` czyta
literały łańcuchowe (`new Set([…])`, tablice SHOUTY_CONST, specyfikatory modułów, ścieżki kropkowane), bo goły
wyraz z małej litery jest nieodróżnialny od nazwy węzła gramatyki. Autorzy wyroczni express i petclinic pisali
te same zakazy **w wyrażeniach regularnych**:

```
no-console-in-library/check.mjs:14
  const BANNED = /\bconsole\s*\.\s*(log|info|warn|debug|trace|dir|table|time|…)\s*\(/g;
strict-mode-pragma/check.mjs:45
  "Missing the `'use strict'` pragma. …"
```

Zliczone: z 51 wierszy „niemierzalnych" 50 jest takich, bo check nie zawiera żadnego literału (51. bo jego typ
rozwija się do zbioru pustego) — i **23 z tych 50 mają w regeksie prawdziwą nazwę** (express 11 z 15, petclinic
4 z 8, Yggdrasil 7 z 20, grain 1 z 7). Metryka aspektów mierzy więc po części styl domowy autora reguły.
Liczby w tabeli zostawiono bez zmian, żeby były porównywalne z 093/094 — ale 4/20 express czyta się uczciwie
jako „4 z 20, przy czym 11 z pozostałych 16 jest poza zasięgiem ekstraktora literałów, nie poza zasięgiem Graina".

---

## 8. Zdanie o reprezentatywności

**Precyzja z Yggdrasila jest reprezentatywna; pokrycie nie jest.**

Precyzja relacji wynosi 1.000 (grain), 1.000 (petclinic), 0.929 (express) i 0.998 (Yggdrasil). Express **nie ma
w CI żadnej bramki na niezadeklarowany import** — ma eslint i nic więcej — a mimo to Grain wyprodukował na nim
jedną jedyną parę, której wyrocznia nie ma, i była to zasadzona przez wyrocznię czerwona linia. Na czterech
repozytoriach łącznie: **3 pary nadmiarowe na 1335 zadeklarowanych**, i ani jedna z nich nie jest fałszywą
krawędzią. Obawa memorandów — że 0.998 to sufit bramki importowej, a nie zdolność — **nie potwierdziła się**.

Pokrycie to inna historia i determinanta jest jedna: **jaka część grafu zależności jest w ogóle zapisana jako
rozstrzygalna instrukcja importu.** 0.894 (TypeScript, ścieżki względne), 0.867 (CommonJS, `require` względny),
0.694 (JS, ale jedna trzecia relacji wyroczni to `spawn`, pośrednik albo świadoma granica odczytu) i **0.114
(Java)**, gdzie 17 z 35 zadeklarowanych par to referencje wewnątrzpakietowe bez żadnego importu, a 8 dalszych
przekracza granicę korzenia źródeł, po którą resolver nigdy nie sięga. Liczba z Yggdrasila była mierzona na
najlepszym możliwym przypadku tego mechanizmu i tak też ją trzeba cytować.

---

## 9. Rekomendacje z liczbami

**110 — alternatywy cięcia typów.** Nie ma jednego zwycięskiego cięcia i pomiar mówi, które wygrywa gdzie:
moduł na express (12 z 15 węzłów trafionych przez moduł, 0 przez katalog), karta katalogu na petclinic (9 z 20,
przy 4 przez moduł), grupa ról na Yggdrasilu i Grainie (182 z 393 oraz 9 z 35). Alternatywy już to potwierdzają
od strony propozycji: na Grainie podnoszą recall typów z 15/33 do **21/33** (+6), na petclinic z 2/28 do 6/28
(+4), na Yggdrasilu z 21/36 do 23/36 (+2), a na express z 6/13 do 6/13 (**+0** — 175 alternatyw i ani jedna nie
dokłada typu, bo na płaskim repozytorium aktywne cięcie modułowe już wygrało). Rekomendacja: nie wybierać
cięcia globalnie, tylko **wystawić maintainerowi ten sam zbiór opisany poziomem, z którego pochodzi**, i mierzyć
lift alternatyw jako osobną kolumnę — jest on od 0 do +6 typów i zależy wyłącznie od kształtu repozytorium.

**113 — zero relacji na Javie.** Strata jest trzystopniowa i każdy stopień ma liczbę: 24 wewnętrzne importy
w kodzie (plus 31 par referencji wewnątrzpakietowych, dla których import nie istnieje); **10 z 24 rozstrzygniętych**
(14 spada, wszystkie test→main, na `resolveType` w `java-resolve.mjs:22-34`, który nie próbuje siostrzanego
korzenia źródeł); **0 z 10 przeżywa cięcie modułowe**, bo `moduleOf` (`engine/relations.mjs:375`) bierze dwa
segmenty ścieżki, a `refineModOf` (`:386`) pogłębia moduł dominujący o JEDEN segment na rundę, maksymalnie dwie
rundy — z `src/main/java` dosięga najdalej `src/main/java/org`, podczas gdy pakiet `owner/` leży cztery segmenty
głębiej. To jest strukturalne, nie progowe: obniżenie progu niczego nie naprawi. Te same 10 krawędzi na
granularności pakietu Javy to 4 pary międzypakietowe. Rekomendacja: (i) wykrywać korzenie źródeł
(`src/*/java`, `src/*/kotlin`) i traktować je jak `pkgs`, tak by cięcie schodziło do pakietu, a resolver
próbował rodzeństwa; (ii) niezależnie od tego, raport ma mówić „ten graf nie zawiera żadnego prawa
o zależnościach — z 24 importów wewnętrznych rozstrzygnięto 10, żaden nie przeżył cięcia", a nie „0 relations".

**114 — charter musi dziedziczyć reguły łańcucha typów.** Pomiar potwierdza rozmiar problemu na trzech
repozytoriach: propozycja pisze 14 / 22 / 34 / 72 charterów, a reguły wiszą na typie partycji — na petclinic
wszystkie 30 plików Javy należy do węzła `src/main/java/org`, który **nie hostuje ani jednego aspektu**, choć
`yg context --file` pokazuje na nich osiem reguł. Rekomendacja bez zmiany schematu: `renderNodeCharter` ma
przejść łańcuch typów przodków tak, jak robi to `yg context --file`, i oznaczyć wiersz jako odziedziczony.

**115 — reguła o nieobecności nie jest regułą do wydobycia.** 21 ze 122 deterministycznych reguł czterech
wyroczni nazywa identyfikator, który **nie występuje nigdzie w ich zbiorze przyczepienia** — petclinic 7,
grain 8, Yggdrasil 6, express 0. Od drugiej strony ta sama klasa jest źródłem najgorszego szumu propozycji.
Pełny rozkład 44 odmów petclinic na NIETKNIĘTYM kodzie, policzony z przebiegu:

```
6  src-main-java/candidate-auto-imp-jakarta-persistence-table     ) klasa `imp`, kierunek false
6  src-main-java/candidate-auto-imp-jakarta-persistence-entity    )
5  src-test/candidate-auto-imp-…-springboottest-webenvironment    )  25 z 44
4  src-test/candidate-auto-imp-…-localserverport                  )
4  src-test/candidate-auto-imp-…-resttemplatebuilder              )
5  src-test/candidate-auto-deco-webmvctest                        ) klasa `deco`, kierunek false
5  src-test/candidate-auto-deco-springboottest                    )  +10  =  35 z 44
5  src-main-java/candidate-auto-filenameshape                     ) kształt nazwy: 5 × package-info.java
4  src-main-java/candidate-auto-nameshape                         )
```

**35 z 44 odmów (80%) to reguły o nieobecności** — „plik w `src/main/java` NIE importuje
`jakarta.persistence.Entity`", wywiedzione z tego, że 24 z 30 plików tego nie robią, czyli reguła ostrzegająca
wiecznie o każdej encji JPA w aplikacji JPA. Express potwierdza to niezależnie i jeszcze dobitniej — jego 112
wierszy odmowy rozkłada się tak:

```
88  test/candidate-auto-call-it              "cases in `test` do not call `it`"        share 0.796
11  examples/candidate-auto-call-res-render  "methods in `examples` do not call …"     share 0.783
 3  lib/candidate-auto-call-this-get         "cases in `lib` do not call `this.get`"   share 0.786
 6  examples/partition-filenameshape  +  4  examples/candidate-auto-nameshape
```

**102 ze 112 (91%) to znowu kierunek `false`** — a najliczniejsza pojedyncza reguła ostrzega, ilekroć plik testowy
mocha deklaruje przypadek testowy. Rekomendacja: kierunek `false` — nie tylko klasy `imp`, ale również `deco`
i `call` — nie ma trafiać do `advisory`. Ma być etykietowany jako **nieobecność, nie zakaz**, i trzymany poza
wynikiem; a strona wyroczni tej klasy (21 ze 122 reguł) ma być raportowana jako poza zasięgiem z konstrukcji,
nie jako chybienie. Sam ten jeden ruch zdejmuje 35 z 44 stałych odmów na petclinic, 102 ze 112 na express
i **398 z 400 na Grainie** — tam **21 z 22** wyrenderowanych reguł advisory to kierunek `false`, a jedyna, która
nim nie jest (`plugins-grain-tests-stress/candidate-auto-lex-quote`), odpowiada za 2 odmowy. To nie jest korekta
progu: to jest cała populacja szumu adopcyjnego na trzech z czterech repozytoriów.

**116 — cięcie domenowe jako predykat.** Petclinic jest przypadkiem granicznym i teraz ma liczbę:
karta katalogu jest tam poziomem, który trafia najwięcej węzłów (9 z 20), a katalogi te to dokładnie
`owner/`, `vet/`, `model/`, `system/` — cięcie domenowe. Grain je znajduje, ale wystawia jako `any_of`
z jawną listą ścieżek, więc nowy plik w `owner/` nie zostanie sklasyfikowany. Rekomendacja: alternatywa
domenowa ma nieść predykat `path:` na katalogu, nie listę plików — dopiero wtedy 9 trafień poziomu
katalogowego zamienia się w 9 typów, które przeżyją następny commit, i dopiero wtedy warstwa nad grafem ma
z czego zrobić drugiego właściciela.

---

## 10. Artefakty

- Maszynowo: `plugins/grain/tests/stress/results/oracles-4-2026-09-05.json`. Schemat opisany w polu `schema`;
  `repos.<nazwa>` niesie `oracle` (mianowniki), `mined` (co wyprodukował eksport), `reconstruct`, `relationLedger`
  (klasy z §4, przypisane ręcznie po przeczytaniu kodu), `cycles`, `propose` i `proposalStagedCheck`.
  Pole `commands` powtarza polecenia z §0.
- Instrument: `plugins/grain/tests/stress/reconstruct.mjs` (`--graph`), `plugins/grain/tests/stress/propose.mjs`
  (`--score` z korzeniem treści), oba z testami czerwonymi przed naprawą.
- Strażnik: `plugins/grain/tests/reconstruct.test.mjs` uruchamia się przeciw wyroczniom express i
  spring-petclinic, gdy `GRAIN_CORPUS_CLONES` wskazuje katalog z klonami, i pomija z powodem, gdy nie wskazuje.
  Zadanie `seams` w CI wymeldowuje oba repozytoria na dokładnych commitach wyroczni i uruchamia ten plik.
