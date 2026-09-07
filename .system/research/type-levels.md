# Poziom cięcia typów: publikować, nie wybierać — i wyprowadzić politykę z liczb, nie z gustu

**Ticket 110.** 108 zmierzył cztery ręczne wyrocznie i pokazał, że **żadne pojedyncze cięcie nie wygrywa**:
moduł na express (12 z 15 węzłów), karta katalogu na spring-petclinic (9 z 20), grupa ról na Yggdrasilu
i na Grainie. Rekomendacja z §9 brzmiała: nie wybierać cięcia globalnie, tylko **wystawić maintainerowi ten
sam zbiór opisany poziomem, z którego pochodzi**. Ten dokument to robi — i dokłada rzecz, której 108 nie
przewidział: mierzy, KTÓRY zbiór kandydatów ma być aktywny, przeciw tym samym czterem wyroczniom, politykami,
które nie znają wyroczni.

**Odpowiedź w jednym zdaniu.** Poziom, na którym leżały brakujące typy, nie jest mądrzejszym cięciem kodu —
to **katalog plików, których Grain w ogóle nie sparsował**. Karta katalogu jest publikowana tylko tam, gdzie
wydobyto deklaracje, więc `src/main/resources/templates`, `test/fixtures`, `docs/public` czy
`reference/relations/java` są niewidoczne dla KAŻDEGO poziomu, który Grain liczy. Tam mieszka 9 z 28 ręcznych
typów petclinic.

---

## 0. Co zostało uruchomione

| co | polecenie |
|---|---|
| eksport (ponownie użyty z 108, bez zmian) | `plugins/grain/bin/grain.mjs export --repo <target> --out export-<n>.json --compact --no-anchors` |
| przemiatanie polityk | `scratchpad/w110/sweep3.mjs` — `buildTypes`/`localities` z silnika, `expandWhen`/`jaccard` z instrumentu rekonstrukcji, punktowanie J≥0.5 identyczne jak `scoreProposal` |
| sufit | `scratchpad/w110/ceiling.mjs` |
| propozycja + wynik | `tests/stress/propose.mjs <target> prop-<n> --export … --score <oracle> --json …` |
| walidacja propozycji | kopia repo bez `.git/.grain/.yggdrasil` + `prop-<n>/.yggdrasil` w korzeniu, `git init`, `yg check --summary`, `yg check --approve --only-deterministic` |

Wyrocznie i commity dokładnie te z 108 (grain `3d249bf`, petclinic `818c413`, express `023767f`, Yggdrasil
`5cca6b1`). `YG_BIN=<yggdrasil>/source/cli/dist/bin.js`. Instrument przemiatania odtwarza bazowe
liczby 108 **co do jednej** (15/33, 2/28, 6/13, 21/36 recall; 18/31, 3/12, 7/22, 23/82 precision) w 2,5 s na
cztery repozytoria — dlatego dało się przemieść czternaście polityk zamiast jednej.

---

## 1. Poziomy, które Grain JUŻ liczy dla zbioru plików

| poziom | czym jest | kandydatów (grain / petclinic / express / Yggdrasil) |
|---|---|---|
| `partition` | własne cięcie MDL drzewa katalogów | 18 / 2 / 4 / 18 |
| `module` | węzeł wyrafinowanego grafu modułów | 11 / 8 / 20 / 36 |
| `directory` | karta katalogu — publikowana tylko dla katalogu NIOSĄCEGO deklaracje | 50 / 20 / 3 / 93 |
| `domain` | cięcie domenowe 116: grupa ról, której członkowie leżą pod jednym katalogiem | 26 / 4 / 2 / 34 |
| `role group` | strukturalnie jednorodny klaster wewnątrz partycji — NIE jest miejscem w układzie | (alternatywy) |
| `layout` | grupowanie, dla którego ścieżka jest jedynym dowodem | (reszta) |

**Tylko poziom o kształcie ścieżki może być aktywny.** Aktywne typy są prefiksami ścieżek, więc każde dwa są
zagnieżdżone albo rozłączne, a pierwszeństwo dziecka w Yggdrasilu daje każdemu plikowi dokładnie jednego
właściciela. Dwa typy nad TYM SAMYM katalogiem rozdzielone predykatem `content:` nie mają między sobą
porządku — plik pasujący do obu miałby dwóch właścicieli. Dlatego `role group` jest poziomem wyłącznie
alternatywnym z konstrukcji, nie z upodobania.

---

## 2. Sufit: gdzie recall NAPRAWDĘ leży

Dla każdego ręcznego typu, który dzisiejsze cięcie chybia — jakie jest najlepsze dopasowanie (a) wśród
kandydatów na poziomach, które Grain publikuje, (b) wśród WSZYSTKICH prefiksów katalogowych drzewa,
(c) wśród alternatyw, które Grain już oferuje. Trafienia przy J≥0.5:

| repo | ręcznych typów | aktywne (przed) | + wszystkie publikowane poziomy | + KAŻDY prefiks katalogowy | + alternatywy Graina | + wszystko |
|---|---|---|---|---|---|---|
| grain | 33 | 15 | 17 | **22** | 21 | 25 |
| spring-petclinic | 28 | 2 | 4 | **11** | 5 | 12 |
| express | 13 | 6 | 6 | **7** | 6 | 7 |
| Yggdrasil | 36 | 21 | 21 | **24** | 23 | 26 |

Kolumna „każdy prefiks katalogowy" jest o 5, 7, 1 i 3 typy wyżej niż wszystkie poziomy Graina razem wzięte.
Katalogi, które to robią, są za każdym razem tego samego rodzaju: `src/main/resources/{templates,static,db}`,
`src/main/scss`, `test/fixtures`, `plugins/grain/commands`, `source/cli/src/templates/{knowledge,schemas}`,
`docs/public`, `reference/relations/<język>`. **Grain publikuje kartę katalogu tylko tam, gdzie sparsował
deklaracje**, więc katalog zasobów, szablonów, fikstur albo dokumentacji nie istnieje na żadnym poziomie,
który liczy — mimo że każdy z nich jest dokładnie tym, co ręczna architektura nazywa typem.

Wniosek dla polityki: recall jest **monotoniczny** względem zbioru kandydatów (drobniejszy typ może tylko
dodać dopasowanie), więc „maksymalizuj recall" samo w sobie wybiera „każdy katalog" — 418 typów na
Yggdrasilu. Prawdziwym kosztem jest precyzja i to, ile maintainer musi przeczytać.

---

## 3. Tabela polityk: polityka × repo → recall@0.5 · precision · liczba aktywnych typów

Czternaście polityk, każda wyrażona jako PORÓWNANIE między liczbami zmierzonymi w tym przebiegu, żadna
z progiem liczbowym. Wszystkie punktowane przeciw czterem wyroczniom przy J≥0.5, w obie strony.

| polityka | grain | spring-petclinic | express | Yggdrasil |
|---|---|---|---|---|
| default (przed) | 15/33 · 18/31 · 31 | 2/28 · 3/12 · 12 | 6/13 · 7/22 · 22 | 21/36 · 23/82 · 82 |
| sama partycja | 10/33 · 11/24 · 24 | 2/28 · 2/8 · 8 | 5/13 · 5/6 · 6 | 14/36 · 14/26 · 26 |
| każdy publikowany poziom | 17/33 · 26/57 · 57 | 4/28 · 5/27 · 27 | 6/13 · 7/22 · 22 | 21/36 · 24/115 · 115 |
| każdy katalog (sufit) | 18/33 · 29/64 · 64 | 8/28 · 11/38 · 38 | 7/13 · 8/34 · 34 | 23/36 · 27/418 · 418 |
| default + domena (116) | 15/33 · 21/40 · 40 | 3/28 · 4/16 · 16 | 6/13 · 7/22 · 22 | 21/36 · 24/97 · 97 |
| hostuje regułę | 15/33 · 18/31 · 31 | 2/28 · 3/21 · 21 | 6/13 · 7/22 · 22 | 21/36 · 23/87 · 87 |
| czystsza granica niż rodzic | 15/33 · 19/32 · 32 | 2/28 · 3/12 · 12 | 6/13 · 7/22 · 22 | 23/36 · 25/94 · 94 |
| czystsza niż rodzic (tylko publikowane) | 15/33 · 19/32 · 32 | 2/28 · 3/12 · 12 | 6/13 · 7/22 · 22 | 21/36 · 23/82 · 82 |
| nieprzeczytana przez Graina | 16/33 · 20/34 · 34 | 6/28 · 7/16 · 16 | 7/13 · 8/29 · 29 | 21/36 · 23/94 · 94 |
| **nieprzeczytana LUB czystsza** | **16/33 · 21/35 · 35** | **6/28 · 7/16 · 16** | **7/13 · 8/29 · 29** | **23/36 · 25/106 · 106** |
| nieprzeczytana LUB czystsza (czystsza tylko publikowana) | 16/33 · 21/35 · 35 | 6/28 · 7/16 · 16 | 7/13 · 8/29 · 29 | 21/36 · 23/94 · 94 |
| nieprzeczytana LUB domena (116) | 16/33 · 23/43 · 43 | 7/28 · 8/20 · 20 | 7/13 · 8/29 · 29 | 21/36 · 24/106 · 106 |
| nieprzeczytana LUB czystsza LUB domena (116) | 16/33 · 23/43 · 43 | 7/28 · 8/20 · 20 | 7/13 · 8/29 · 29 | 23/36 · 26/118 · 118 |
| nieprzeczytana LUB więcej współzmian wewnątrz | 16/33 · 21/35 · 35 | 6/28 · 7/16 · 16 | 7/13 · 8/29 · 29 | 21/36 · 23/94 · 94 |

Pokrycie jest identyczne we WSZYSTKICH politykach (1466/1470, 131/132, 213/213, 3018/3019): każdy plik ma
dokładnie jednego właściciela, bo każdy kandydat jest prefiksem ścieżki.

### Wybrana polityka i dlaczego

> **Drobniejszy katalog staje się własnym typem tylko tam, gdzie POKONUJE POZIOM NAD SOBĄ NA JEGO WŁASNYM
> DOWODZIE** — ściśle więcej jego importów zostaje w środku niż w rodzicu, albo Grain nie przeczytał żadnego
> z jego plików, a rodzica przeczytał.

Wygrywa recall na **wszystkich czterech** i nie przegrywa na żadnym. Precyzja rośnie na dwóch (grain
0,581 → 0,600; petclinic 0,250 → 0,438) i spada na dwóch (express 0,318 → 0,276; Yggdrasil 0,280 → 0,236).
Łącznie na korpusie: **44/110 → 52/110 odzyskanych ręcznych typów** przy precyzji 51/147 = 0,347 →
61/186 = 0,328.

Cztery uwagi, które ta tabela wymusza, a nie ilustruje:

1. **Drugi człon niesie większość.** Sama „nieprzeczytana" daje +1/+4/+1/+0; sama „czystsza" +0/+0/+0/+2.
   Są komplementarne: pierwsza łapie katalogi zasobów, druga podkatalogi kodu (`templates/knowledge`,
   `templates/schemas` na Yggdrasilu, J=1,00 obie).
2. **Domena (116) daje +1 ręczny typ na petclinic za +24 aktywne typy na czterech repozytoriach** (43/20/29/118
   zamiast 35/16/29/106). Nie została włączona: 116 wystawia to cięcie jako alternatywę z generalizującym predykatem
   `path:`, którą maintainer aktywuje świadomie, i tabela mówi, ile to kosztuje, gdy aktywować ją hurtem.
3. **Kandydat musi coś UDROBNIAĆ.** Kandydat bez aktywnego poziomu nad sobą, którego wszystkie pliki jakiś
   aktywny typ już klasyfikuje, nie jest drobniejszym cięciem — jest OPAKOWANIEM. Wychodzi to na repozytorium,
   w którym Grain nie wydobył NICZEGO (zero partycji): każdy katalog czyta się wtedy jako nieprzeczytany, człon
   „nieprzeczytana" nie ma z czym kontrastować i strzelał na szczycie drzewa, produkując węzeł, który po
   zabraniu plików przez dzieci nie posiada żadnego (żadna reguła się do niego nie przyczepi, żaden charter go
   nie opisze). Kandydat bez rodzica wchodzi więc tylko wtedy, gdy wnosi pliki, których nic innego nie zgłasza —
   `src/main/scss` petclinic wchodzi, opakowanie nie. Test jednostkowy na obu przypadkach.
4. **Granica jest ZAWSZE ciaśniejsza NIŻ COŚ.** Pierwsza wersja pozwalała członowi „czystsza" strzelić bez
   rodzica, i wypromowała `source/` (1504 pliki) na Yggdrasilu oraz `plugins/` (1183) na Grainie — typy
   pokrywające połowę repozytorium, dodane za to, że w ogóle mają importy. Bez aktywnego poziomu nad sobą nie
   ma czego pokonać i porównanie nie strzela. Człon „nieprzeczytana" strzela dalej bez rodzica: fakt „Grain
   nie przeczytał tu niczego" stoi sam (`src/main/scss` na petclinic, +1 typ), a alternatywą jest i tak
   reszta na poziomie `layout`, tylko grubsza.

**Polityka jest dopasowana do TYCH CZTERECH wyroczni i musi zostać zmierzona ponownie, gdy pojawi się piąta.**
Przemiatanie jest w `scratchpad/w110/sweep3.mjs`; test `plugins/grain/tests/propose-type-levels.test.mjs`
przypina osiągnięte liczby jako PODŁOGĘ (nie cel) na express i petclinic, gdy `GRAIN_CORPUS_CLONES` wskazuje
klony.

---

## 4. Dowód wewnętrzny na kandydata — bez wyroczni, bez wag, bez progów

Każdy kandydat (aktywny i alternatywny) niesie te same surowe liczby, policzone na zbiorze, który jego własny
predykat wybiera:

| liczba | co mierzy |
|---|---|
| `files` | ile plików |
| `importsInside` / `importsCrossing` | rozstrzygnięte importy dotykające zbioru, rozdzielone tym, czy oba końce są w środku |
| `cochangeInside` / `cochangeCrossing` | to samo na parach współzmian z eksportu |
| `nameShape` / `nameShapeFiles` | modalny kształt nazwy pliku i ile plików go nosi |
| `mined` | ile z tych plików Grain w ogóle sparsował |
| `rules` | wydobyte konwencje, których KAŻDA strona leży wewnątrz zbioru |

Żadna z nich nie jest współczynnikiem: linia dowodowa mówi „11 z 11 importów, które go dotykają, zostaje
w środku", nigdy „purity 1.00". Współzmiany są rzadkie (Yggdrasil publikuje 18 par plikowych) i tam, gdzie
ich nie ma, zdanie ich nie wymienia.

Przykład linii dowodowej z propozycji dla petclinic:

```
`src/main/resources/templates/**` selects 12 of 132 tracked files; exactly the 12 the evidence names
(Jaccard 1.00) · `src/main/resources/templates` holds 12 tracked files and grain parsed none of them —
the path is the only evidence there is, and the level above (`src/main/resources`) does carry code grain
read, so this is a different kind of place · cut at the layout level: 12 files, no resolved import touches
it in either direction, grain parsed none of these files, 1 of 2 co-change pairs stay inside, 6 of them
are named `aUa.a`, 0 mined rules could attach here
```

---

## 5. Wynik na czterech repozytoriach, przed → po

| repo | recall typów | recall + alternatywy | precision typów | aktywnych typów | recall węzłów | `yg check` na skopiowanym repo |
|---|---|---|---|---|---|---|
| grain | 15/33 → **16/33** | 21/33 → **22/33** | 18/31 → 21/35 | 31 → 35 | 15/35 → **16/35** | PASS 34 → PASS 37 węzłów, 1466/1470 (100%) |
| spring-petclinic | 2/28 → **6/28** | 6/28 → **9/28** | 3/12 → 7/16 | 12 → 16 | 0/20 → **2/20** | PASS 14 → PASS 18 węzłów, 131/132 (99%) |
| express | 6/13 → **7/13** | 6/13 → **7/13** | 7/22 → 8/29 | 22 → 29 | 6/15 → **7/15** | FAIL 22 → FAIL 31 węzłów, 213/213; te same 80 błędów klasy „aspekt niezweryfikowany" |
| Yggdrasil | 21/36 → **23/36** | 23/36 → **25/36** | 23/82 → 25/106 | 82 → 106 | 30/393 → **43/393** | FAIL 72 → FAIL 85 węzłów, 1366/1615 (85%) w obu; ta sama klasa |

**Żaden z czterech przebiegów nie zgłasza kodu blokującego ŁADOWANIE grafu** (`architecture-invalid`,
`node-invalid`, `type-when-mismatch`, `parent-type-forbidden`, `mapping-path-missing`,
`file-duplicate-mapping`) — cztery na cztery ładują się, dokładnie jak przed zmianą. Horde czyta chartery
nowych węzłów (`node.mjs show src/main/resources/templates` na skopiowanej propozycji petclinic zwraca
boundary, stamp i pełny charter).

Recall węzłów rośnie wszędzie, mimo że ticket dotyczył typów: węzeł jest jeden na aktywny typ, więc
drobniejsze cięcie odzyskuje ręczne węzły przy tej samej definicji.

### Klasy różnic — Yggdrasil (i pozostałe trzy), z powodem

**Yggdrasil, +24 typy, +2 ręczne typy, 0 utraconych.**

| klasa | ile | co i dlaczego |
|---|---|---|
| poziom `directory` — podkatalog kodu o ciaśniejszej granicy | 12 | `source/cli/src/templates/{knowledge,schemas}` (te dwa ODZYSKUJĄ ręczne `knowledge-doc` J=1,00 i `schema-doc` J=1,00 — przedtem 0,24 i 0,09), plus 10 drzew fikstur pod `source/cli/tests/fixtures/` |
| poziom `layout` — katalog, którego Grain nie przeczytał | 12 | `reference/relations/<10 języków>`, `docs/public`, `source/cli/tests/fixtures/e2e-companion/references` |
| utracone ręczne typy | **0** | żaden typ dopasowany przed zmianą nie przestał być dopasowany |

Dziesięć drzew fikstur i dziesięć katalogów `reference/relations/<język>` to poprawne cięcia, których ręczny
graf Yggdrasila nie nazywa typami — dlatego kosztują precyzję (0,280 → 0,236), nie recall. To jest ta sama
klasa (c) co w 108: rozjazd granularności, nie chybienie.

**spring-petclinic, +4 typy, +4 ręczne typy.** Wszystkie cztery na poziomie `layout` i wszystkie
z J=1,00: `src/main/resources/templates` → `template`, `src/main/scss` → `stylesheet-source`,
`src/main/resources/static` → `static-asset`, `src/main/resources/db` → `db-script`.

**express, +7 typów, +1 ręczny typ.** `test/fixtures` → `test-fixture` (J=1,00, przedtem 0,19). Pozostałe
sześć to katalogi `views/` przykładów — poprawne, nienazwane przez wyrocznię.

**grain, +4 typy, +1 ręczny typ.** `plugins/grain/commands` → `agent-command` (J=1,00, przedtem 0,02).
Pozostałe: `.system/issues`, `.system/research` (poziom `layout`) i `plugins/grain/tests/relations/unit`
(poziom `domain`).

---

## 6. Co się zmieniło w kontrakcie propozycji (dodatkowo, nic nie zmieniło kształtu)

- każdy AKTYWNY typ niesie `level` (cięcie, z którego pochodzi) i `levels` (każdy poziom, który niezależnie
  nazwał ten sam katalog), plus blok `intrinsic` z §4;
- każdy kandydat, którego przebieg NIE aktywował, jest teraz wierszem tego samego śladu audytowego
  (`kind: "alternative"` z `level`, `form`, `of`, `selects`, `fidelity`, `viable`, `intrinsic`) — przedtem
  istniał wyłącznie w `alternatives.md` i nic po stronie maszyny nie mogło porównać cięcia zrobionego
  z zaoferowanym;
- `counts.typesByLevel` i `counts.alternativesByLevel` dzielą oba sumy;
- `alternatives.md` jest pogrupowany po poziomie, z tymi samymi kolumnami liczbowymi co typy aktywne;
- linia `architecture:` w raporcie wymienia poziomy, z których zrobione jest cięcie tego repozytorium;
- `uncovered` jako nazwa poziomu → `layout`, żeby słownik poziomów był jeden.

Przy okazji poprawiony błąd w dokumentacji nagłówka sekcji 4 `propose.mjs`: twierdziła, że aktywne typy tworzą
ANTYŁAŃCUCH („żaden katalog aktywnego typu nie zawiera innego"), podczas gdy kod nigdy tego nie robił —
akapit trzy niżej, o wydrążaniu rodzica, jest właśnie powodem, dla którego oba poziomy jadą. Rodzina jest
LAMINARNA (każde dwa typy są rozłączne albo zagnieżdżone), i to ona daje niezmiennik „każdy plik ma dokładnie
jednego właściciela". Poprawione zostało zdanie, nie zachowanie.

Horde czyta `charter.md` verbatim (`node.mjs show`) i to się nie zmieniło: charterów jest tyle, ile węzłów,
z tą samą strukturą sekcji.
