# Misja: jeden zgrany system — Yggdrasil, Grain, Horda

**Status:** w toku od 2026-09-06. Dyrektor działa z pełnej autoryzacji użytkownika: rozstrzyga sam, operuje na
gałęziach `claude/grain-agent-tool-b89y0x` w trzech repozytoriach (Grain, Yggdrasil, Horde), wypycha te
gałęzie, nigdy main. Rozstrzygnięcia są w `.system/decisions.md` (slugi niżej); ten plik jest kartą misji.
Analiza, z której misja wynika: `one-system-design.md` (mechanika Hordy i Superpowers, pomiar patch-id).
Poprzednik: `superpowers-vs-horde.md`.

---

## 1. Cel

Jeden system, trzy warstwy, każda buduje na niższej i żadna nie zna wyższej:

| warstwa | repo | rola | samodzielnie |
|---|---|---|---|
| 1 | Yggdrasil | graf i prawo: węzły, porty, relacje, reguły z drabiną statusów, werdykty związane z hashem, log, incydenty, advise | człowiek plus jeden agent |
| 2 | Grain | prawda o kodzie: propozycja grafu z dowodów, dryf praktyki od deklaracji, sprzężenia bez portu, kandydaci na podział; pisze wyłącznie obiekty warstwy 1 | z Yggdrasilem, bez Hordy |
| 3 | Horda | praca wielu rąk: bilety na węzłach, plan wyprowadzony z portów i plików, klucze związane z diffem, prawo procesu; czyta graf tylko przez `yg`, pisze do niego tylko przez `yg` | na czubku obu |

Rurociąg jest pętlą: klon → `grain propose` → `yg adopt` → karta → bilety na węzłach → plan z portów →
praca pod `yg context` → `premerge` z `yg check` → merge → Grain mierzy dryf → `yg advise` → architekt
zmienia graf → weryfikatorzy zgłaszają incydenty → incydent staje się regułą i przypadkiem drilla.

Mandat jakości (ruling `quality-always-authorised`): horda podnosi jakość wszędzie, gdzie pracuje, bez
pytania. Co podnosi lub utrzymuje egzekucję, jest autonomiczne; co ją obniża, wymaga człowieka.

## 2. Inwarianty zgrania

1. Jedna tożsamość węzła: ścieżka pod `.yggdrasil/model/`, używana przez wszystkie trzy warstwy.
2. Jeden format werdyktu: twierdzenie, hash przedmiotu (plik, patch-id diffu, sha drzewa), kto, kiedy, status.
3. Jedna drabina statusów: draft → advisory → enforced, dla reguł, portów i dyscyplin; podnoszenie autonomiczne na
   dowodzie, obniżanie przez człowieka.
4. Jeden log przyczyn: `yg log`; Horda i Grain nie trzymają własnych trwałych decyzji.
5. Jeden kanał incydentów: `yg incident`; weryfikatorzy i audytor są czujnikami.
6. Jeden język do człowieka: produktowy, bez nazw mechanizmów.
7. Powierzchnie maszynowe są wersjonowanymi dokumentami (§3).
8. Niższa warstwa nigdy nie importuje pojęć wyższej: Yggdrasil nie zna biletu, Grain nie zna stewarda.
9. Port = kontrakt = interfejs: jeden obiekt w grafie, z wersją i testem.
10. Plan jest widokiem; karta i jej katalog dowodów są źródłem „gotowe".

## 3. Kontrakty między warstwami

Każdy dokument ma pole `schema`. Pola wymienione niżej są stałe; producent może dodawać pola, nigdy zmieniać
ani usuwać wymienionych. Konsument czyta tylko wymienione.

**`yg-impact/1`** — `yg impact --node <path> --json` (Yggdrasil, bilet 130):

```json
{
  "schema": "yg-impact/1",
  "subject": { "kind": "node", "path": "orders/order-service" },
  "ports": [
    { "name": "place-order", "version": 1, "test": "tests/contracts/place-order.test.ts",
      "consumers": [ { "node": "web/checkout", "relation": "uses" } ] }
  ],
  "dependents": [
    { "node": "web/checkout", "direct": true,
      "relations": [ { "type": "uses", "ports": ["place-order"] } ] }
  ],
  "transitive": [ { "node": "mobile/app", "via": ["web/checkout"] } ]
}
```

`version` i `test` są `null`, gdy port ich nie deklaruje (przed biletem 132). `ports[].consumers` pochodzi z
relacji, których `consumes` nazywa port; `dependents[].relations[].ports` jest pustą listą, gdy relacja nie
nazywa portu.

**`yg-node/1`** — `yg node <path> --json` (Yggdrasil, bilet 130): struktura jednego węzła, bez reguł
(reguły daje `yg-context/1`, który istnieje):

```json
{
  "schema": "yg-node/1",
  "path": "orders/order-service", "name": "Order Service", "type": "service", "description": "…",
  "mapping": ["src/orders/**"],
  "relations": [ { "target": "billing/invoices", "type": "uses", "consumes": ["issue-invoice"] } ],
  "ports": { "place-order": { "description": "…", "version": 1, "test": "…", "aspects": ["…"] } },
  "children": ["orders/order-service/pricing"], "parent": "orders"
}
```

**Port z wersją i testem** (Yggdrasil, bilet 132): w `yg-node.yaml` port może nieść `version: <int>` i
`test: <ścieżka>`; `yg check` odmawia, gdy test portu zmienił zawartość, a wersja nie wzrosła (werdykt
deterministyczny, w locku). Pola są opcjonalne i addytywne; wersja schematu grafu rośnie tylko, jeśli stare grafy
przestałyby się ładować.

**Kanał zewnętrznego recenzenta** (Yggdrasil, bilet 133): sędzia spoza CLI pobiera dokładny pakiet recenzji dla
pary aspekt/plik i zapisuje werdykt pod swoją nazwą, związany z tymi samymi hashami; CI odtwarza go jak każdy
werdykt; `yg check` pokazuje, kto sądził. Kształt komend do wywiedzenia z konwencji `yg` przez pracownika.

**`grain-advice/1`** — wynik `grain advise` (Grain, bilet 131):

```json
{
  "schema": "grain-advice/1", "repo": ".", "at": "<sha>",
  "items": [
    { "kind": "relation", "nodes": ["a", "b"], "confidence": 0.41,
      "evidence": { "coChanged": 31, "ofA": 0.31, "ofB": 0.40, "declared": false },
      "text": "…" },
    { "kind": "split", "nodes": ["a"], "candidates": ["a/x", "a/y"], "evidence": { "…": "…" }, "text": "…" }
  ]
}
```

`kind` ∈ `relation | port | split | rule`. Wpięcie do `yg advise` to bilet 144 po stronie Yggdrasila; do tego
czasu Horda czyta dokument bezpośrednio.

**Bilet Hordy** (bilet 127): pola strukturalne w szablonie:

```
**Files:** src/auth/policy.ts, src/auth/policy.test.ts
**Consumes:** auth/policy@1
**Produces:** auth/policy@2
**Evidence:** E2, E5
```

`Files` w granicy węzła; `Consumes`/`Produces` w formacie `węzeł/port@wersja`; `Evidence` to identyfikatory wierszy
katalogu dowodów karty.

## 4. Rozstrzygnięcia (slugi w `.system/decisions.md`)

`layered-family`, `horde-requires-yggdrasil`, `port-is-contract`, `keys-bind-to-patch-id`,
`evidence-is-the-plan`, `disciplines-are-rules`, `production-is-the-corpus`, `escalations-become-rules`,
`audit-is-spc`, `stacked-tickets`, `horde-blame`, `node-lease-across-hordes`,
`verifier-is-yggdrasil-reviewer`, `horde-of-one-deferred`, `flake-is-an-incident`,
`quality-always-authorised`. Wcześniejsze rulingi Graina obowiązują nadal.

## 5. Prawa decyzyjne w tej misji

- **Dyrektor (ta sesja) rozstrzyga wszystko** w granicach rulingów wyżej; pytania rozstrzyga sam i zapisuje
  ruling.
- **Do użytkownika wracają tylko:** push do `main`, PR-y, podbicie wersji pakietu lub schematu, publikacja, i
  wszystko, co obniża egzekucję lub jakość (ruling `quality-always-authorised`).
- **Klasy:** Fable wyłącznie dyrektor; projekty trudne, pomiary, Yggdrasil i zmiany semantyki → Opus; wykonanie
  mechaniczne → Sonnet. Subagenci nie spawnują subagentów.
- **Zasady repo obowiązują pracowników bez wyjątku:** Yggdrasil (`yg prime`, graf przed kodem, docs, CHANGELOG
  Unreleased dla adoptera, `scripts/repo-check.sh` zielony poza dwoma znanymi błędami środowiska: pack-smoke
  i siedem testów pod rootem; żadnych ręcznych edycji locka i digestu; żadnego podbijania wersji), Horda
  (wszystko pod `skills/horde/`, stan tylko przez skrypty, testy na prawdziwych tymczasowych repozytoriach,
  CHANGELOG dla adoptera, bez podbijania wersji), Grain (budżet 50k na moduł silnika, 0 cykli, testy na
  prawdziwych fixturach i wyroczniach, `docs/validation.md` z liczbą testów).
- **Commity:** trailer `Co-Authored-By` i `Claude-Session` jak dotąd; żadnych identyfikatorów modeli w
  artefaktach.

## 6. Katalog dowodów misji

Każdy wiersz odtwarza weryfikator bez rozmowy z autorem. Misja jest gotowa, gdy wszystkie są zielone.

| id | dowód | bilet |
|---|---|---|
| E1 | `yg impact --node cli/io/atomic-write --json` w repo Yggdrasil zwraca `yg-impact/1` z portem `write-atomic` i jego konsumentami; `yg node cli/io/atomic-write --json` zwraca `yg-node/1` | 130 |
| E2 | Port z `version` i `test`: zmiana pliku testu bez podbicia wersji daje czerwony `yg check` z komunikatem what/why/next; podbicie wersji zieleni | 132 |
| E3 | Zewnętrzny sędzia zapisuje werdykt reguły prozą pod swoją nazwą; `yg check` w CI odtwarza go bez klucza i pokazuje nazwę | 133 |
| E4 | `grain advise` na czterech wyroczniach zwraca `grain-advice/1`; notatka pomiarowa mówi liczbą, czy sprzężenie węzłowe wskazuje interakcje czy gorące katalogi, i werdykt: advisory albo nic | 131 |
| E5 | W suicie Hordy: klucze zapisane z patch-id; doganianie bazy w innym pliku przenosi klucze bez re-recenzji; zmiana w kontekście hunka daje re-recenzję zakresową z plikiem range-diff; konflikt wraca do autora | 126 |
| E6 | `queue plan` na fixturze z sześcioma biletami z §6 `one-system-design.md` drukuje warstwy L0 {101,106}, L1 {102,103,104}, L2 {105}, ścieżkę krytyczną 3, jedną składową, blokadę 103/106 jako rozłączną, i wiersz dowodu bez biletu | 127 |
| E7 | `premerge` odmawia diffu poza zadeklarowanymi `Files` z notą „declared …, touched …" | 127 |
| E8 | Czwarta runda `changes` na bilecie spawnia świeżego workera klasę wyżej; szósta daje eskalację `adjudicate`; test flake: dwa różne wyniki weryfikatora zapisują incydent i cofają bilet | 128 |
| E9 | Brief workera zawiera prawo TDD i debugowania z tabelą racjonalizacji; brief weryfikatora prawo weryfikacji; `drill.mjs check` na fixturze zgodnej jest zielony, na niezgodnej czerwony; `drill.mjs record` z `.horde/` tworzy drill roli | 129 |
| E10 | `horde init` na repo bez `.yggdrasil/` tworzy graf przez `yg`; z Grainem przez `grain propose` + `yg adopt`; `node.mjs show` czyta wyłącznie z `yg node --json` i `yg context --json`; tryb ręczny nie istnieje | 135 |
| E11 | Bilet zależny startuje od czubka niescalonej zależności; po jej lądowaniu klucze zależnego zostają | 134 |
| E12 | `queue next` nie wydaje biletu z plikami przecinającymi bilet w toku; przy równej wadze wydaje bilet o dłuższej pozostałej ścieżce krytycznej; bilet jakości ma najniższy priorytet | 136 |
| E13 | `status` pokazuje pokrycie dowodów w pięciu stanach; `horde done` odmawia przy czerwonym wierszu i wypisuje, co stoi na przeszkodzie; usunięcie wiersza po pierwszej fali daje eskalację | 137 |
| E14 | Zamknięcie fali drukuje: równoległość planowaną i osiągniętą, klucze przeniesione, odsetek odrzuceń audytu z przedziałem, decyzje człowieka na scalony bilet, indeks jakości | 138 |
| E15 | `horde blame plik:linia` drukuje łańcuch: commit, bilet, autor, weryfikator, klasa, wiersze dowodu, werdykty reguł przy tym hashu | 139 |
| E16 | Druga horda na tym samym repo nie może związać węzła dzierżawionego przez żywą pierwszą | 140 |
| E17 | Reguła w drafcie z zielonym drillem i zerem nowych naruszeń przez dwie fale zostaje podniesiona bez człowieka; podniesienie jest w logu grafu; obniżenie statusu przez skrypt jest odmawiane bez `--by user` | 141 |
| E18 | Test całości w suicie Hordy: gołe repo → `grain propose` → `yg adopt` → `horde init` → bilet → dwa klucze → merge, na prawdziwych buildach Graina i Yggdrasila | 142 |
| E19 | Grain zapisuje korektę adoptera (propozycja kontra przyjęty graf) jako wyrocznię i raportuje precision/recall względem niej | 143 |
| E20 | `yg advise` przyjmuje `grain-advice/1`; `yg drill add --violates <plik>@<sha>` dodaje przypadek do korpusu reguły | 144, 145 |

## 7. Fale i bilety

| id | repo | klasa | zależy od | fala | treść |
|---|---|---|---|---|---|
| 130 | Yggdrasil | opus | — | A | `yg impact --json`, `yg node --json` |
| 132 | Yggdrasil | opus | 130 | A | port: version, test; odmowa zmiany testu bez wersji |
| 133 | Yggdrasil | opus | 132 | A | kanał zewnętrznego recenzenta |
| 131 | Grain | opus | — | A | `grain advise`: sprzężenie węzłowe i kandydaci na podział, pomiar na wyroczniach |
| 126 | Horde | opus | — | A | klucze na patch-id, range-diff, re-recenzja zakresowa |
| 127 | Horde | opus | — | A | pola biletu, `queue plan`, ścisły zakres, koszt planu, pliki-huby, wiersze bez biletu |
| 128 | Horde | sonnet | — | A | bezpiecznik pętli poprawek, flake jako incydent, siedzenie aprobaty |
| 129 | Horde | opus | — | A | dyscypliny jako prawo ról, drille, `drill.mjs record` |
| 135 | Horde | opus | 130, 132, 133, 127 | B | Horda wymaga Yggdrasila; porty jako kontrakty; graf tylko przez `yg` |
| 134 | Horde | opus | 126, 127 | B | stos biletów |
| 136 | Horde | sonnet | 127 | B | `queue next`: blokady, ścieżka krytyczna, priorytet jakości |
| 137 | Horde | sonnet | 126, 127 | B | pokrycie dowodów, `horde done`, eskalacja usunięcia wiersza |
| 138 | Horde | opus | 137 | B | audyt SPC, eskalacje → reguły, KPI decyzji, indeks jakości |
| 139 | Horde | sonnet | 126 | B | `horde blame` |
| 140 | Horde | sonnet | — | B | dzierżawa węzła między hordami |
| 141 | Horde | opus | 131, 135 | C | autonomiczna jakość: polityka karty, drabina statusów, bilety jakości |
| 142 | Horde | opus | 135 | C | test całości |
| 143 | Grain | opus | — | C | korekta adoptera jako wyrocznia |
| 144 | Yggdrasil | opus | 133 | B | `yg advise` przyjmuje `grain-advice/1` |
| 145 | Yggdrasil | opus | 144 | B | `yg drill add --violates` z produkcji |

Odłożone poza misję: horda jednego (po pomiarze), przeniesienie rozwoju Graina na Hordę (po 142).

## 8. Polityka kosztu

Yggdrasil: jeden pracownik Opus, bilety po kolei (repo-check jest drogi i szeregowy). Horda: worktree na bilet,
równolegle tam, gdzie pliki są rozłączne; dyrektor scala po testach. Grain: worktree. Limit: brak jawnego;
raport klas na zamknięciu fali. Pracownicy nie wypychają; wypycha dyrektor po scaleniu.

## 9. Co z symulacji weszło do biletów

Pusta linia bazowa naruszeń (2 → 135: adopt z linią bazową); ceremonia hordy jednego (3 → odłożone, siedzenie
aprobaty w 128); kolejka scaleń stewarda i czas bramki (4 → 137 raportuje); pliki-huby (5 → 127); wersja portu
wymuszona (6 → 132); popularne porty (7 → 127 aprobaty konsumentów); wiersz bez biletu i ciche usunięcie (8 →
127, 137); flake (9 → 128); utrata sesji (10 → 129 log postępu w briefie); dwie hordy (11 → 140); reguły
prozą w premerge (12 → 133, 135); zmiana przekrojowa (13 → bez zmian, plan układa rozszerz-zwiń); test-first
(14 → 129 nie jest regułą); przeniesienie klucza a suita (15 → 126 mówi to wprost w docs); złe cięcie (16 → 138
statystyka węzłów na bilet).

---

## 10. Wynik — 2026-09-06, zamknięcie fali 11

Wszystkie 23 bilety misji (126–148) wylądowały na gałęziach `claude/grain-agent-tool-b89y0x` trzech repozytoriów.
Nic nie poszło na `main`.

| repo | bilety | czubek | suita | zakres |
|---|---|---|---|---|
| Horde | 126–129, 134–142, 148 (13) | 744689c | 580/580 (z 328) | 181 plików, 34 wpisy changelogu |
| Grain | 131, 143, 146 (3) | 1856d72 | 2446/2446 (z 2415) | `grain advise`, `grain oracle`, cięcie budżetu współzmian (m27) |
| Yggdrasil | 130, 132, 133, 144, 145, 147 (6) | 8b7e4e3b | repo-check zielony poza pack-smoke i 7 testami pod rootem | 144 plików; `impact/node/check/aspects/advise --json`, port z wersją i testem, `yg verdict`, `yg drill add` |

Katalog dowodów (§6): **20/20 zielone.** Każdy wiersz ma test w suicie repozytorium, które go realizuje; dyrektor
odtworzył sam E1 (`yg impact --node cli/io/atomic-write --json` na buildzie) i E18 (przebieg całości, 12 kroków,
12,7 s). E20 zamykają 144 i 145.

Zmierzone po drodze, nie założone:
- współzmiana węzłowa nie jest poradą (dwie pary na czterech grafach, obie zadeklarowane) → `--json` z ujawnieniem;
  podział węzła jest poradą (131, potwierdzone po 146);
- budżet 5000 par współzmian był w całości pochłaniany przez pary wewnątrzplikowe na repozytoriach z dużymi plikami
  → cięcie na dwie populacje, zero spadku precyzji konsumentów (146);
- wyrocznia piąta (Yggdrasil): typy recall .639 / precision .234, relacje .744 / .707 na 44 wspólnych węzłach →
  kalibracja instrumentu, nie dowód o piątym repozytorium (143);
- `horde done` nie widział audytu zapisanego po zamknięciu fali → naprawione przez test całości (142);
- `yg check --json` nie istniało → 147, a indeks jakości Hordy przestał czytać tekst (148).

Otwarte po misji: horda jednego (po pomiarze kosztu weryfikatora), przeniesienie rozwoju Graina na Hordę, drille
dyscyplin przepuszczone przez prawdziwych agentów pod presją (harness jest, przebiegi należą do maintainera),
eskalacja 22 (dolny próg wsparcia par międzyplikowych) czeka na pomiar po 146. Decyzje użytkownika: PR-y z trzech
gałęzi, wersje pakietów, publikacja.
