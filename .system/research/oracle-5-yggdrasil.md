# Piąta wyrocznia: korekta adoptera jako pomiar — Yggdrasil, `3a351e1`

**Bilet 143, dowód E19.** Cztery wyrocznie z `oracles-4-measurement.md` są pisane ręcznie przez sesje, którym
zabroniono patrzeć na wyjście Graina. Dlatego mierzą — i dlatego są cztery, a nie czterdzieści. Ruling
`production-is-the-corpus` mówi, gdzie leży piąta: **każdy adopter, który uruchomi `grain propose`, przeczyta
propozycję i przyjmie `yg adopt` inny graf, wyprodukował już oba artefakty**, a różnica między nimi jest grafem,
z którym maintainer tego repozytorium zgodził się żyć. Ruling `examples-are-not-oracles` zamknął drogę na skróty
(katalogi `examples/*` Yggdrasila nie nadają się na wyrocznie); ta droga jest odwrotna: nie szuka nowych ręcznych
grafów, tylko zbiera te, które i tak powstają w produkcji.

Bilet dał temu komendę (`grain oracle record` / `grain oracle score`, kontrakt w `docs/reference.md`, "The oracle
contract") i kazał zapisać pierwszą taką wyrocznię z repozytorium Yggdrasila. Ta notatka jest jej pomiarem.

---

## 0. Co zostało uruchomione

| co | polecenie |
|---|---|
| klon | `git clone --no-hardlinks <yggdrasil> <scratch>/clones/yggdrasil` (HEAD `3a351e16`, 1570 commitów, 3056 plików) |
| propozycja | `YG_BIN=<yggdrasil>/source/cli/dist/bin.js node plugins/grain/bin/grain.mjs propose <scratch>/ygg-proposal --repo <klon>` |
| zapis wyroczni | `node plugins/grain/bin/grain.mjs oracle record --repo <klon> --proposal <scratch>/ygg-proposal --name yggdrasil --out plugins/grain/tests/stress/oracles --yes` |
| pomiar | `node plugins/grain/bin/grain.mjs oracle score yggdrasil` |

Nic nie zostało zapisane do `<yggdrasil>`: klon jest w scratchu, propozycja w scratchu, rekord w tym
repozytorium. Propozycja biegła z prawdziwym binarium Yggdrasila, więc reguły przechodziły prawdziwy `yg drill`
(44 zweryfikowane, 7 `enforced`, 12 `advisory`, 791 przypadków drilla).

**Przyjęty graf to graf z HEAD klonu, nie z żywego worktree.** Żywy worktree Yggdrasila był w trakcie biletu 132
(porty z wersją i testem) i miał niescalone zmiany w kilkunastu `yg-node.yaml`. Rekord przypięty do konkretnego
sha jest odtwarzalny; rekord z brudnego drzewa nie jest. To jest różnica między „graf żywy" a „graf z tego
commita" i notatka nazywa ją wprost, bo bilet prosił o żywy.

## 1. Wynik

Propozycja: **107 typów węzłów · 85 węzłów · 216 relacji · 173 szkice reguł · 282 alternatywne cięcia**.
Graf przyjęty: **36 typów · 436 węzłów · 1298 relacji · 1 port · 70 reguł**.

| | recall | precision | średnie J |
|---|---|---|---|
| typy węzłów | **23/36 = 0.639** (z alternatywami 25/36 = 0.694) | **25/107 = 0.234** | 0.625 |
| węzły | **43/402 = 0.107** | **44/83 = 0.530** | 0.141 |
| relacje, między 44 węzłami, co do których oba grafy się zgadzają | **29/39 = 0.744** | **29/41 = 0.707** | — |
| reguły mechaniczne nazwane przez jakiś szkic | **8/37** | — | — |

Trafienie to J ≥ 0.5 na zbiorach ścieżek — ta sama miara, którą `tests/stress/propose.mjs` punktuje Graina
przeciw czterem ręcznym grafom. Przy J ≥ 0.8: 16 typów i 30 węzłów.

**Mianowniki są tu połową odpowiedzi.** Wiersz relacji obejmuje 39 z 1298 zadeklarowanych: graf przyjęty ma 436
węzłów wobec 85 propozycji, więc **1259 relacji ma koniec, którego żaden proponowany węzeł nie odwzorowuje, i nie
jest punktowane w żadną stronę** (po stronie propozycji: 174 z 216). Wiersz węzłów mówi to samo z drugiej strony —
graf cięty na rozmiar właściciela (436 węzłów, 34 z nich organizacyjne) nie jest odzyskiwalny z propozycji, która
rysuje 85. Komenda drukuje oba mianowniki w nawiasie pod każdym wierszem, żeby liczby nie dały się zacytować bez
nich.

## 2. To jest kalibracja, nie nowy dowód

Cel tej wyroczni to **to samo repozytorium**, które jest już jedną z czterech ręcznych wyroczni. Nie mówi więc nic
o piątym repozytorium — pokazuje, że nowa miara ląduje tam, gdzie ląduje istniejący instrument:

| | `oracles-4-measurement.md` (5cca6b1, starszy silnik) | ta wyrocznia (3a351e1) |
|---|---|---|
| recall typów | 21/36 | 23/36 |
| recall typów z alternatywami | 23/36 | 25/36 |
| precision typów | 23/82 | 25/107 |
| recall węzłów | 30/393 | 43/402 |
| precision węzłów | 31/70 | 44/83 |

Zgodność co do skali na wszystkich pięciu wierszach, przy różnicy commita (393 → 436 węzłów w grafie) i wersji
silnika. Zobowiązanie z `docs/reference.md` — że polityka poziomów typów ma być przemierzona, **gdy pojawi się
piąte repozytorium** — nie jest przez to spełnione i zostaje otwarte.

## 3. Co adopter zrobił z propozycją (korekta)

Węzły: **2 zostawione · 26 przemianowanych · 5 scalonych · 30 rozciętych · 8 przekrojonych · 7 wyrzuconych ·
4 dopisane** (plus 2 organizacyjne po stronie propozycji i 34 po stronie przyjętego grafu, nieklasyfikowane).

- **Rozcięcia są główną historią i mają jeden kierunek.** `source/cli/src/core` (81 plików, jeden proponowany
  węzeł) jest w przyjętym grafie **37 węzłami** wielkości właściciela; `source/cli/src/cli` — 39; `src/io` — 9;
  `src/model` — 5; `src/llm` — 4. To jest dokładnie ruling `two-granularities-rules-fine-nodes-ownership-sized`
  po stronie Yggdrasila: węzeł ma jednego właściciela i jedną kartę. Propozycja tnie na modułach i katalogach,
  bo tyle widzi w dowodach; maintainer tnie na własności. Żadne obniżenie progu tego nie naprawi — to nie jest
  próg, tylko inna definicja węzła.
- **Scalenia są drobne i wszystkie są tym samym ruchem**: `.github/workflows` + `.github` → `root/ci`,
  `.devcontainer` + korzeń repo → `root/project-config`, `tests/portal-e2e/support` + `tests/portal-e2e` →
  jeden węzeł. Adopter zwija rodzica z jedynym dzieckiem.
- **11 z 26 „przemianowań" to sam prefiks**: `reference/relations/java` → `cli/reference/relations/java`,
  identyczny zbiór plików (J = 1.0). Propozycja trafiła zbiór idealnie i pomyliła się tylko co do miejsca
  w hierarchii. Miara J tego nie karze i nie powinna, ale to warto wiedzieć, czytając „recall węzłów 0.107".
- **Wszystkie 7 wyrzuconych to węzły nad samym `.yggdrasil/`** (`dot-yggdrasil`, `dot-yggdrasil/model`,
  `dot-yggdrasil/aspects/...`): Grain modeluje katalog grafu jako część repozytorium, adopter nie modeluje go
  wcale poza jednym węzłem `graph-rules`. To jest znany artefakt z §7 notatki 094, tu policzony.
- **Relacje: 29 wspólnych, 10 dopisanych przez adoptera, 12 usuniętych.** Na 39 par w ogóle porównywalnych.

## 4. Reguły i porty

- **8 z 37 przyjętych reguł mechanicznych (z czytelnymi literałami; 57 ma `check.mjs` w ogóle) jest nazwane przez
  jakiś szkic** — m.in. `atomic-write-contract`, `no-direct-fs`, `no-shell-injection`,
  `portal/no-node-imports-in-frontend`, `prototype-safe-registry-lookup`. Rząd wielkości ten sam co 11/57
  z pomiaru czterech wyroczni.
- **Żaden ze 173 szkiców nie występuje w przyjętym grafie pod własną nazwą.** Komenda mówi to wprost w wyniku:
  ten graf nie wyrósł z tej propozycji (jest od niej starszy), więc wiersz reguł jest porównaniem dwóch
  niezależnych zbiorów, a nie recenzją szkiców. Wiersz „173 dropped" wolno czytać wyłącznie tak.
- **Porty: 1 przyjęty, 0 proponowanych.** Grain nie proponuje portów w ogóle. To jest luka strukturalna, nie
  próg: kontrakt (`port` z wersją i testem, bilet 132 Yggdrasila) jest twierdzeniem o interfejsie, a warstwa
  wydobywcza nie ma dziś dowodu, z którego mogłaby je wyprowadzić. Rekord to liczy i nazywa.

## 5. Co adopter robi, żeby dołożyć wyrocznię

Trzy kroki, żaden z nich nie wymaga oddania kodu. `grain propose` (propozycja zostaje na dysku), `yg adopt`
(przyjmuje graf, który adopter zredagował), a potem `grain oracle record --proposal <dir> --out <dir> --name <n>`.
Pierwsze uruchomienie **nic nie zapisuje**: drukuje repozytorium i sha, liczby obu grafów, listę tego, co zostanie
zapisane (struktura obu grafów, ścieżki plików, które każdy element wybiera, identyfikatory, których pilnują
reguły) i listę tego, co zapisane NIE będzie (treść plików, opisy, karty, ciała reguł prozą, korpusy drilli,
historia, nazwiska, locki), oraz katalog docelowy. Dopiero powtórzenie z `--yes` pisze. Poza własnymi fikstureami
tego repozytorium **nie ma domyślnego katalogu** — `--out` wskazuje adopter. Zbiory plików są rozwinięte raz,
przy zapisie, przeciw prawdziwemu repozytorium, więc `grain oracle score <n>` liczy się później bez żadnego
checkoutu; wyrocznia z prywatnego repozytorium jest przenośna i nie niesie kodu.

## 6. Artefakty

- Rekord: `plugins/grain/tests/stress/oracles/yggdrasil/` — `oracle.json` (`grain-oracle/1`), `files.json`
  (3056 ścieżek), `proposal.json`, `accepted.json`, `correction.json` (`grain-correction/1`), `README.md`.
  916 KB, bez treści plików.
- Komenda: `plugins/grain/engine/oracle.mjs`; kontrakt w `docs/reference.md` („The oracle contract");
  `plugins/grain/commands/oracle.md` i `skills/grain/SKILL.md` mówią agentowi, że zgoda należy do użytkownika.
- Testy: `plugins/grain/tests/oracle-command.test.mjs` (10 testów na prawdziwym repozytorium i prawdziwym
  `grain propose`: zgoda, co jest zapisywane i czego nie ma, wynik, scalenie i rozcięcie zasadzone w dwóch
  przyjętych grafach nad tą samą propozycją, wynik bez repozytorium na dysku);
  `plugins/grain/tests/reconstruct.test.mjs` punktuje tę wyrocznię przy każdym przebiegu suity — bez klonu, bo
  zbiory plików są w rekordzie.
- Wynik jako dokument: `grain oracle score yggdrasil --json` (`grain-oracle-score/1`, z korektą w środku).
