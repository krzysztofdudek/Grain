# Plan — wszystko do zrobienia, poprawienia i dogrania

Zastępuje `dociagniecia.md` (tamta lista żyje dalej jako źródło, mapowanie numerów na końcu).
Trzy źródła: audyt zdolności, audyt „co rozwija zdolności, a co tylko dokłada ujścia", oraz **raport z pola** —
pierwsze uruchomienie 0.1.0 na produkcyjnym backendzie C# (2 064 pliki, 2 314 commitów, 204 konwencje, 40 modułów).

**Higiena:** raport pochodzi z prywatnego repozytorium. Liczby wolno cytować, nazw repozytorium ani ścieżek z niego
**nie wolno** wpuszczać do niczego, co idzie do gita — ta klasa wycieku zdarzyła się już raz w README.

Numeracja: **A** błędy danych · **B** kalibracja i prezentacja · **C** zdolności (nowy słownik) · **D** ujścia i zasięg ·
**E** nowa wiedza z istniejących danych · **F** decyzje.

---

## A — Błędy danych. Korumpują indeks, który czyta cała reszta

Obie pozycje A1 i A2 zreprodukowałem na żywym drzewie składni; w obu przypadkach mechanizm jest **inny** niż
zgaduje raport z pola, a poprawka trafia w inne miejsce.

### A1 · Argumenty generyczne zapisywane jako typy bazowe — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw (z pola).** `where SearchQueryValidator` drukuje
`carries: extends AbstractValidator ×3 · extends TColumnId ×3 · extends TFilter ×3 · extends TQuery ×2`.
`AbstractValidator` prawdziwy, reszta to parametry typu.

**Prawdziwy mechanizm.** Nie klauzule `where T : X`, jak zgaduje raport — te w ogóle nie wchodzą. Wchodzą
**argumenty generyczne wewnątrz typu bazowego**: `core.mjs:117` schodzi po *wszystkich* identyfikatorach węzła
dziedziczenia, więc `: AbstractValidator<TQuery>` daje `sup = ["AbstractValidator", "TQuery"]`. Zreprodukowane:

```
  3  kind=type   nt=class_declaration   name=SearchQueryValidator
      sup: ["AbstractValidator","TQuery"]
```

`TColumnId` i `TFilter` z raportu przychodzą tą samą drogą, z baz innych klas (`Filter<TColumnId>`).

**Dlaczego to nie jest „wyrzuć argumenty".** Argument bywa najmocniejszym sygnałem, jaki repozytorium ma:
`IRequestHandler<GetFooQuery, FooDto>` nazywa komendę, a fixture stoi na dokładnie takim fakcie
(`types here extend Command`). Wyrzucenie argumentów zabiłoby prawdziwą konwencję w każdym repo CQRS.

**Poprawka — zaimplementowana, prościej niż zakładałem.** Zamiast dwóch rodzin faktów: identyfikator wewnątrz
listy argumentów generycznych zagnieżdżonej pod węzłem dziedziczenia (nowy `genArgRe` w `bindingFor`, dopasowany
do realnych nazw węzłów po przejrzeniu wszystkich 19 `node-types.json`: C# `type_argument_list`, Java/Kotlin/
TS/Rust/Scala/Groovy `type_arguments`, C++ `template_argument_list`) jest **wykluczany** z `sup` w miejscu
budowy, przez chodzenie po przodkach identyfikatora aż do węzła dziedziczenia. Głowa typu bazowego (bezpośrednio
pod węzłem dziedziczenia, nigdy pod listą argumentów) wchodzi jak dotąd. Druga rodzina faktów okazała się
niepotrzebna — nic w dalszym kodzie ani w fixture nie zależało od tego, by argument generyczny wchodził do
`sup`; osobna ścieżka (`vendor/relations/extractors/`) już celowo bierze argumenty generyczne jako krawędzie
międzyplikowe i pozostała nietknięta.

**Weryfikacja — wykonana.** Nowy trwały test `plugins/grain/tests/generic-heritage-args.test.mjs`: czerwone
potwierdzone przeze mnie osobiście (`git stash` na poprawce, uruchomienie testu, prawdziwy fail), zielone po
przywróceniu. Sprawdzone na C#, Javie, Kotlinie, TypeScripcie, C++, Scali — head zostaje, argument znika, w tym
generyki zagnieżdżone i mieszane listy dziedziczenia. Pełny zestaw: **918/918** (916 + 2 nowe), moje własne
uruchomienie. Diff: tylko `engine/core.mjs`, +8/-2. Nic niezacommitowane.

### A2 · Konstruktory liczone jako typy — przyczyna to podciąg „struct" w słowie „constructor" — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw (z pola).** `SearchQueryValidator (type, line 21)` wskazuje na `public SearchQueryValidator()`, czyli
konstruktor. Mianowniki typu `types here are named PascalCase — 100% of 462` są zawyżone o konstruktory, które
z reguły języka nie mogą nazywać się inaczej. Konwencja, której nie da się złamać, nie jest dowodem na konwencję.

**Prawdziwa przyczyna.** `core.mjs:113` klasyfikuje węzeł testem **podciągu**:

```js
const typeLike = /class|struct|record|enum|interface|trait|…/.test(ch.type);
```

a słowo `con·struct·or_declaration` zawiera `struct`. Zreprodukowane wprost:
`typeLike("constructor_declaration") === true`.

**Zasięg — skorygowany w trakcie naprawy.** Mój wstępny przegląd wskazał pięć języków; okazało się, że dwa
z nich (Kotlin `secondary_constructor`, Solidity `constructor_definition`) w ogóle nie są węzłami zakresu — nie
mają pola `name`, więc `bindingFor` nigdy ich nie dodaje do `b.scope`, zweryfikowane parsowaniem próbki. Naprawdę
dotknięte, potwierdzone parsowaniem: C# `constructor_declaration` + `destructor_declaration`, Java i Groovy
`constructor_declaration` + `compact_constructor_declaration` — 6 węzłów, 3 języki.

**Drugi, niezależny tor tego samego błędu — znaleziony przy naprawie, nie przewidziany w planie.** Poprawienie
samego dopasowania podciągu by nie wystarczyło: reguła zagnieżdżonego zakresu (`hasChildScope && !/function|
method|lambda|closure|arrow/.test(ch.type)`) też liczyła konstruktor jako typ, bo `constructor`/`destructor`
nigdy nie były na liście wyjątków — niezależnie od pierwszego regexa. Potwierdzone empirycznie: konstruktor
C# z zagnieżdżoną lokalną funkcją dawał `kind:'type'` nawet z samym pierwszym regexem naprawionym.

**Poprawka — zaimplementowana.** Oba dopasowania przez segmenty słowa (`(?:^|_)(?:word)(?:_|$)`), nie przez
podciąg. Klasyfikacja: `kind: 'method'` (nie osobny `kind: 'ctor'`, jak pierwotnie zakładałem) — sprawdzone, że
żaden z dotkniętych węzłów nie ma pola typu zwracanego, więc żadna fałszywa wartość `auto.ret` nie mogła
powstać, a przeklasyfikowanie na `'method'` daje konstruktorowi za darmo całą istniejącą maszynerię faktów
(`auto.arity`, `auto.call`, `auto.first1`, klasteryzację) bez dodatkowych zmian w ~30 miejscach, które czytają
`kind`.

**Znalezione przy okazji, NIE naprawione — nowa pozycja, patrz A5.**

**Weryfikacja — wykonana.** Nowy trwały test `plugins/grain/tests/constructor-not-type.test.mjs`, 7 przypadków
(C# konstruktor/destruktor/konstruktor z zagnieżdżoną funkcją, Java konstruktor/kompaktowy konstruktor rekordu,
Groovy konstruktor, kwalifikowalność do faktu arności). Czerwone potwierdzone przeze mnie osobiście (ręczne
cofnięcie tylko fragmentu A2 przy nietkniętym A1, uruchomienie — realny fail na wszystkich 7), zielone po
przywróceniu. Pełny zestaw: **925/925** (918 + 7 nowych), moje własne uruchomienie. Diff łączny z A1:
`engine/core.mjs` +16/-4. Nic niezacommitowane.

### A5 · Ruby `singleton_method` liczony jako typ — osobny błąd, znaleziony przy A2, nienaprawiony

**Objaw.** `def self.foo` w Rubym (metoda singletonowa, czyli metoda statyczna) dostaje `kind:'type'`.

**Dlaczego to NIE jest ten sam błąd co A2.** Trafienie jest **całosłowowe**, nie podciągiem: `singleton_method`
zawiera segment `singleton`, który jest na liście `TYPE_LIKE_RE` celowo — miał łapać wzorzec obiektu-singletona
(`object_declaration`, `companion` itp.), nie rubinową składnię metody statycznej. Naprawa A2 (dopasowanie po
segmentach) poprawnie **zostawia** to dopasowanie, bo słowo `singleton` faktycznie tam jest jako całość.

**Co to znaczy.** To błąd semantyczny, nie mechaniczny: słowo „singleton" niesie dwa różne znaczenia w różnych
gramatykach, i lista słów kluczowych `TYPE_LIKE_RE` nie ma jak ich rozróżnić bez wiedzy językowej. Wymaga
świadomej decyzji (per-gramatykowy wyjątek na jeden węzeł, czytelnie skomentowany, albo inny mechanizm
rozstrzygania), nie mechanicznej poprawki regexa.

**Status.** Nienaprawione, bez testu, celowo zostawione osobno.

### A3 · Konstruktor pierwotny niewidzialny (C# 12, i klasa problemu szersza niż C#) — ✅ ZROBIONE, zweryfikowane niezależnie (patrz C3)

**Objaw (z pola).** Repozytorium jest w połowie migracji: 50 klas z konstruktorem pierwotnym
`class Foo(IBar bar)`, 434 z klasycznym. Szablon opisuje wyłącznie kształt klasyczny, `check` na obu stylach
daje ten sam wynik i **zero** wzmianki o konstruktorze — ani jako regule, ani jako odchyleniu. Największa żywa
zmiana stylistyczna w repozytorium jest jedyną rzeczą, której Grain nie widzi.

**Potwierdzone repro.** Klasa z konstruktorem pierwotnym nie emituje żadnego zakresu konstruktora ani faktu
o parametrach; klasyczna emituje zakres. Dwie populacje nigdy się nie spotykają, więc żadna nie jest odchyleniem
od drugiej.

**Dlaczego to jest ważniejsze, niż wygląda.** To nie jest usterka C#. To jest klasa: **dwa kształty składniowe
tej samej roli**. Ta sama sytuacja to funkcja vs. metoda statyczna, pole vs. własność, dekorator vs. rejestracja
w kontenerze. Grain milczy zawsze, gdy repozytorium przechodzi z kształtu na kształt — czyli dokładnie wtedy,
gdy agent najbardziej potrzebuje wiedzieć, którą stroną pisać.

**Poprawka** — patrz **C3**. Tu odnotowane jako defekt, bo pierwsze uruchomienie w polu wskazało to jako
najciekawszą lukę.

### A4 · Przeliczenie po A1–A2 — ✅ ZROBIONE, zweryfikowane niezależnie na realnych repozytoriach

**Fixture.** Deterministyczny fixture testowy (`tests/fixtures/build-fixture.mjs`) jest czysto TypeScriptowy —
sprawdzone: żadna reguła generująca fixture nie dotyka C#/Javy/Kotlina/konstruktorów w sensie A2. To wyjaśnia,
dlaczego oba przeliczenia (A1 i A2) przeszły przez pełny zestaw (925/925) bez korekty ani jednej asercji: fixture
nigdy nie wchodził w te ścieżki kodu. Prawdziwe „przeliczenie" siedzi w nowych testach jednostkowych
(`generic-heritage-args.test.mjs`, `constructor-not-type.test.mjs`).

**Korpus — odtworzony i zweryfikowany.** Użytkownik autoryzował sieć wprost. Sklonowane z pełną historią:
`jasontaylordev/CleanArchitecture` (C#, 939 commitów, CQRS/MediatR — dokładnie kształt z raportu terenowego)
i `spring-projects/spring-petclinic` (Java, 1042 commity). Przez `git stash`/`stash pop` na `engine/core.mjs`
porównane „przed" (bez A1+A2) i „po" (z poprawkami) na tych samych repozytoriach.

**Dowód A1, znaleziony w prawdziwym kodzie, nie w spreparowanym przykładzie.**
`src/Application/Common/Behaviours/AuthorizationBehaviour.cs:8`:
```csharp
public class AuthorizationBehaviour<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
```
Zweryfikowałem osobiście w zapisanym `ca-before-export.json`: istniała opublikowana konwencja
`"statement": "types here extend \`TRequest\`"` (bezsensowna — `TRequest` to własny parametr typu klasy) plus
marker `extends TRequest` (5 nośników — te same 4 klasy `*Behaviour<TRequest,TResponse> : IPipelineBehavior<…>`).
W `ca-after-export.json`: **zero** wzmianek o `TRequest` w całym pliku (sprawdzone programowo, rekurencyjnie po
całej strukturze JSON). To samo dla spring-petclinic: marker `extends Integer` (ze Spring Data
`Repository<Owner, Integer>`) obecny przed, nieobecny po.

**Dowód A2, przeliczony samodzielnie na surowym cache'u zakresów** (`.grain/cache/tree.json`, stan po poprawce):
145 zakresów `type` / 350 `method` w CleanArchitecture, **zero** węzłów `constructor_declaration`/
`destructor_declaration` z `kind:'type'`, 40 poprawnie jako `kind:'method'` — dokładnie liczby z raportu
subagenta, policzone przeze mnie od zera z surowych danych, nie odczytane z jego podsumowania.

**Nowa obserwacja, nieplanowana, zapisana do dalszego wyjaśnienia (nie blokuje niczego):** `export`'s
`summary.scopes` (liczba po klasteryzacji) różni się od surowej liczby zakresów w logu indeksowania dla
spring-petclinic (320 vs 347) — obecne identycznie w stanie przed i po, więc nie jest to regresja A1/A2, tylko
coś do zrozumienia osobno przy okazji pracy nad C1/C2 (klasteryzacja/partycjonowanie).

**Korpus zostaje na dysku** pod `.../c143e2fb…/scratchpad/corpus-a4b1/` (pełna historia, nietknięty) — dostępny
do dalszej pracy. Reszta 12-repo korpusu z oryginalnego planu (express, flask, nest, axum, gin, okhttp, typeorm,
chi, Slim, sinatra) nadal wymaga odtworzenia, jeśli B1 kiedyś dostanie pełną kalibrację statystyczną — patrz
notatka pod B1 niżej: na tych dwóch repo B1 ani razu nie zadziałał (19 zapytań, 0 fałszywych wygaszeń, ale też
0 prawdziwych złapań), bo oba są zbyt czyste/idiomatyczne, żeby same z siebie wyprodukować przypadkową kolizję —
większy/hałaśliwszy korpus byłby potrzebny do pozytywnego dowodu, nie tylko negatywnego.

---

## B — Kalibracja i prezentacja. To samo, co mówi, ale głośność i pewność właściwie ustawione

### B1 · `match %` na całkowitym chybieniu — ✅ ZROBIONE (heurystyka), zweryfikowane niezależnie; kalibracja korpusowa odłożona

**Z pola.** `where "upstream facade error map"` → `marker [Theory] — 33 carriers (…UnitTests, match 75%)`,
przy istniejącym katalogu z dokładnie tymi fasadami. Zapytania trafione punktowo (`where IQueryHandler`) dają
`match 100%`. Z samej liczby oba przypadki są nierozróżnialne, a agent uczony ufać rankingowi zbuduje na chybieniu.

**Mechanizm.** Wynik to pokrycie masy rzadkości zapytania (`core.mjs:1453-1455`) — jedno rzadkie słowo, które
przypadkiem jest tokenem kodu, daje wysoki udział przy zerowym związku. Ostrzeżenie o słabym dopasowaniu istnieje,
ale ma płaskie odcięcie i wymaga co najmniej trzech słów w zapytaniu.

**Poprawka.** Dwa sygnały zamiast jednego: (a) ile masy dał **jeden** token — trafienie stojące na jednym słowie
z czterech nie jest trafieniem; (b) zgodność między czołowymi trafieniami — czy top-1 i kolejne wskazują ten sam
katalog/grupę. Rozbieżność przy jednym silnym tokenie to podpis chybienia. Ta poprawka była już proponowana
w recenzjach jako „cross-hit agreement" i została otwarta — teraz ma dowód z pola.

**Poprawka — zaimplementowana, dokładnie w kształcie zaproponowanym.** Dwa sygnały w `whereCmd` (`core.mjs`,
gałąź `qt.size >= 3 && !hits[0].exact`): (a) **koncentracja masy** — uogólnienie starego „dokładnie jeden
wnoszący token" na ciągły stosunek `max(waga)/suma(wag)` po wnoszących tokenach, próg 0,5 (matematyczne dno
dla idealnie równego podziału na dwa tokeny — każde trafienie mniej równomierne niż 50/50 na dwóch tokenach,
lub oparte na mniejszej ich liczbie, liczy się jako skoncentrowane); (b) **zgodność czołowych trafień** —
czy trafienia 2. i 3. wskazują ten sam obszar repozytorium co trafienie 1., przez porównanie `topDirs[0][0]`,
który każda karta już niesie (żadnego nowego pola). Gdy oba sygnały biją razem i zero zgodności wśród
konkurentów — wynik jest **wygaszany całkowicie** (patrz B2), nie tylko oflagowany.

**Weryfikacja — wykonana na poziomie mechanizmu.** Nowy trwały test
`plugins/grain/tests/weak-match-signals.test.mjs`: model syntetyczny odtwarzający dokładnie kształt błędu
z pola (marker `[Theory]` z dwoma nośnikami, każdy przypadkiem trafiający inne rzadkie słowo zapytania,
`upstream`/`facade` niepowiązane gdzie indziej) — czerwone potwierdzone przeze mnie osobiście (ręczne cofnięcie
tylko fragmentu `whereCmd`, przy A1/A2 nietkniętych): kod sprzed poprawki naprawdę drukował
`marker @Theory — match 38%` jako ranking, bez ostrzeżenia — dokładnie objaw z pola. Zielone po przywróceniu.
Dwa twarde warunki brzegowe zachowane i potwierdzone realnym wywołaniem CLI na fixture: `where
CreateDisputeHandler` (dopasowanie po nazwie) dalej `match 100%` bez zastrzeżeń; `where handler create
dispute` (pełne pokrycie słów, zgodne konkurenci) też bez zastrzeżeń. Pełny zestaw: **928/928**, moje własne
uruchomienie. Diff: tylko `engine/core.mjs`, +41/-8.

**Kalibracja korpusowa — częściowa, pierwszy realny wynik zebrany.** Na CleanArchitecture i spring-petclinic:
13 zapytań z gotowej listy `INTENTS` (`tests/stress/run-corpus.mjs`) plus 6 dodatkowych, celowo szukających
przypadkowej kolizji — wszystkie 19 dały normalne trafienie albo poprawnie zadziałały starsze ścieżki (płaski
próg 0,34, zwykłe zero trafień). **Nowa gałąź wygaszania z B1 nie zadziałała ani razu, w żadną stronę** — zero
fałszywych wygaszeń dobrej odpowiedzi (dobry wynik), ale też zero potwierdzonych złapań prawdziwej kolizji (brak
dowodu pozytywnego). Przyczyna: oba repozytoria są zbyt czyste i idiomatyczne, żeby samoistnie wyprodukować
przypadkową kolizję leksykalną. Statystyczna kalibracja progu 0,5 i definicji „zgodności obszaru" na zbiorze
zapytań trafionych/nietrafionych z realną kolizją wciąż wymaga większego/hałaśliwszego korpusu (reszta 12 repo)
albo zapytania budowanego świadomie z wiedzą o indeksie modelu — dopiero to da prawo napisać w dokumentacji, co
liczba `match %` naprawdę znaczy.

### B2 · „Nic takiego tu nie ma" jako odpowiedź — ✅ ZROBIONE razem z B1, ten sam mechanizm

**Z pola.** Pierwszy własny `IActionResult` w repozytorium nie dostał żadnego sygnału o położeniu (poprawnie —
nie było z czym porównać), ale `where` zwrócił trzy niezwiązane trafienia zamiast powiedzieć wprost, że nic
takiego tu nie istnieje. Produkt ma zasadę „brak konwencji to też odpowiedź" i tu jej nie dotrzymuje.

**Zaimplementowane.** Gdy oba sygnały B1 biją razem i konkurenci się nie zgadzają, `where` przechodzi na tę samą
ścieżkę co prawdziwe zero trafień (mapa źródeł), ale z uczciwym, odrębnym zdaniem — nie literalnym „no lexical
match" (bo jakieś dopasowanie leksykalne było, tylko niewiarygodne): `no confident match for "…" — the best
lexical hit scored N% but its words are covered by unrelated, disagreeing parts of the repo`. Zweryfikowane
w tym samym teście co B1.

### B3 · Artefakty i konwencje w `report` na tej samej głośności — ✅ ZROBIONE, zweryfikowane niezależnie

**Z pola.** Obok `types here extend ControllerBase — 100% of 22` i `methods take CancellationToken — 99% of 167`
stoją, tym samym krojem: `methods always contain a expression_element — 100% of 10`,
`methods name local variables like a(Ua)+ — 95% of 21`, `methods never contain a assignment_expression — 100% of 29`.
Czytelnik, który spróbuje zastosować `a(Ua)+`, napisze gorszy kod.

**Uwaga konstytucyjna.** Raport proponuje cięcie „predykaty, których nie da się nazwać po angielsku". Tego zrobić
nie można — to jest lista nazw, czyli dokładnie to, co ruling z 2026-08-25 wyrzucił z produktu.

**Ustalone przez śledztwo w kodzie, nie założone z góry:** wersja repo-wide tego artefaktu (`_all`-scoped, „to jest
język, nie wybór") jest już martwa — filtr `STRUCT` w `mine()` (linia ~575) od dawna nie przepuszcza takiego faktu
poza kontekst lokalny. Żywy problem jest inny: `report()` sortuje wszystko jednym wspólnym `bpi` (zysk długości
kodu na instancję), a `bpi` nie koreluje z wielkością populacji — mały, ostry kontrast strukturalny (10 członków)
potrafi wygrać z dużą, prawdziwą konwencją semantyczną (30 członków) tylko dlatego, że KT karze mniejsze próby
łagodniej. Potwierdzone konstruowanym przypadkiem: kontrast arności na 10 elementach (bpi 4,76) realnie wygrywał
z dekoratorem `@Handler` na 30 elementach (bpi 3,33).

**Zaimplementowane.** `report()` dzieli listę faktów każdej partycji na trzy warstwy, każda z własnym limitem
`--top` i własną uczciwą linią przepełnienia: domena/semantyka najpierw (bez zmian pozycji), potem nagłówek
„syntax-shape facts (structural, not a chosen convention):" dla rodziny `STRUCT` (wydzielonej do wspólnego
eksportu `STRUCT_PID`, żeby `mine()` i `report()` nigdy się nie rozjechały w definicji), na końcu nagłówek
„style conventions" dla rodziny leksykalnej (wcześniej niepodpisany ogon listy). Żadna z trzech decyzji z
poprzedniej wersji planu — (a)/(b)/(c) — nie została wybrana osobno: to jest (a)+(c) razem, bez dublowania
bramki λ przez (b), dokładnie jak było rekomendowane.

**Zweryfikowane niezależnie.** Diff czysty — `STRUCT_PID` wydzielony bez duplikacji logiki. Cofnąłem ręcznie
fragment `report()` (zostawiając `STRUCT_PID`/`mine()` nietknięte, bo to wspólna infrastruktura, nie sam błąd)
— 2 z 3 testów padły naprawdę (trzeci celowo nie dotyka `report()`). Przywróciłem, zielone. Na żywym fixture
(`grain report`) zobaczyłem trójwarstwowy wydruk działający dokładnie tak: `extends`/`@Handler` na górze,
nagłówek strukturalny z kontrastem arności i kształtu instrukcji, nagłówek stylu z cytowaniem. Pełny zestaw:
**933/933**, moje własne uruchomienie.

**Nowa obserwacja, znaleziona przy E1, nieplanowana:** `whereCmd()`'s linia „pattern to copy" na karcie katalogu
ma DOKŁADNIE tę samą podatność, którą B3 naprawił w `report()` — konkurencja o ograniczone miejsce wyświetlania
po samym `bpi`, bez rozdziału na warstwy. Zaobserwowane żywo: po dodaniu `auto.filebirth` (100% z 58, silny
nowy fakt) na fixture, linia „pattern to copy" karty katalogu `src/handlers/` przestawiła się z przykładu typu
(`UpdateAddressCommand`) na nazwę metody (`constructor`/`handle`) — nie błąd, ale ten sam mechanizm klasy B3,
w innej ścieżce kodu, nietknięty. Kandydat do osobnego, małego tematu: zastosować ten sam podział na warstwy
(`STRUCT_PID`/`auto.lex:`) do wyboru przykładu w `whereCmd()`.

### B4 · Koszt pierwszego indeksu powiedziany uczciwie — ✅ ZROBIONE, zweryfikowane niezależnie

**Z pola.** 460,6 s (277,6 s historia + 180,3 s nauka) i 91 MB na dysku dla 2 064 plików. README mówi dziś
„od 4 s do ~2,9 min w skrajności" — pomiar z pola przebija tę skrajność 2,6×, na repozytorium mniejszym niż
te, na których mierzyliśmy. Do tego realne ryzyko adopcyjne: agent z limitem czasu na polecenie ubije budowę
i zgłosi narzędzie jako zepsute.

**Zaimplementowane.** README dopisuje liczbę z pola jako drugi punkt danych obok własnej tabeli korpusu, uczciwie
nazywając ją przekroczeniem własnej skrajności korpusu na mniejszym repozytorium niż oba jego outliery — bez
nazwy, bez języka, bez żadnego szczegółu identyfikującego źródło, tylko „an external field report on a
production codebase" i same liczby. `docs/validation.md` niesie pełne wyjaśnienie w „Known boundaries": liczba
commitów nie przewiduje kosztu budowy (nest: 21 648 commitów w 55,7 s, szybciej niż typeorm przy 6 052) — gęściej
skonstruowany kod może kosztować znacznie więcej niż korpus sugeruje. Komunikat startu sesji przy braku indeksu
(`grain.mjs:278`) przestał mówić „minuta lub więcej" i teraz mówi wprost: minuty, nie sekundy, na dużym lub
gęstym repozytorium; ciasny limit czasu polecenia może to odczytać jako zawieszenie; `grain refresh` z
wyprzedzeniem albo `--no-history` na szybką pierwszą odpowiedź.

**Zweryfikowane niezależnie.** Diff w README/docs/validation.md/grain.mjs przeczytany w całości; przeszukany pod
kątem higieny (C#/CQRS/MediatR/nazwa repo) — zero trafień. Sam wyrenderowałem komunikat na świeżym repo git bez
indeksu — treść identyczna z raportem. Pełny zestaw: **928/928**, moje własne uruchomienie. Test asercji „not
built yet" nietknięty, bo dotyczy innej gałęzi (repo bez gita), co sam sprawdziłem w kodzie testu.

**Świadomie NIE zrobione, zgodnie z zakresem zadania:** żaden tryb automatycznego dociągania historii w tle —
`--no-history` już istnieje i to on jest wskazywany jako furtka; budowa nowej infrastruktury asynchronicznej
byłaby nieproporcjonalna do zadania „powiedz koszt uczciwie".

### B5 · `check`, który mówi, że nic nie sprawdził — ✅ ZROBIONE, zweryfikowane niezależnie

**Z pola.** Gdy plik trafia do partycji „repo-wide (small packages merged)", jedyne rządzące nim konwencje to
nazewnictwo i wcięcia — a `check` drukuje `0 deviations` z listą `conforms to:`, co czyta się jak przegląd.
Dziś ostrzega o tym tylko skill. Ma to powiedzieć samo wyjście, w tym jednym przypadku: gdy wszystkie zgodne
konwencje są leksykalne, jedna linia, że to nie jest przegląd.

**Ustalone przez śledztwo:** taki komunikat już istniał (`grain.mjs:158`), ale bramka sprawdzała **rodzaj
zakresu** (`fact.kind !== 'file'`), nie rodzinę faktu — więc plik rządzony wyłącznie przez `auto.nameshape`
(kształt nazwy typu/metody, `kind:'type'`/`'method'`, nie `'file'`) prześlizgiwał się bez zastrzeżenia,
mimo że jest dokładnie tak samo powierzchowny jak konwencja stylu pliku.

**Zaimplementowane.** Bramka rozszerzona na rodzinę PID (`auto.nameshape`, `auto.filenameshape`,
`auto.lex:*`) OR `kind==='file'` jak dotąd — ten sam wzorzec co `STRUCT_PID` z B3. Komunikat przeformułowany
z „only file-level style" na „only naming and lexical style", bo już nie dotyczy wyłącznie plików.

**Zweryfikowane niezależnie.** Cofnąłem ręcznie tę jedną linię w `grain.mjs`, uruchomiłem test — realny fail
pokazujący dokładnie objaw z pola: `conforms to:` z czterema czysto nazewniczymi/leksykalnymi faktami, zero
zastrzeżenia. Przywróciłem, zielone; drugi test (plik rządzony prawdziwym dekoratorem) potwierdza brak
nadmiarowego odpalania. Pełny zestaw: **933/933**.

### B6 · Drobne z pola — ✅ ZROBIONE (dokumentacja), zweryfikowane niezależnie

- **`agent-authored share: 0%` — teoria z raportu terenowego sprawdzona i najprawdopodobniej BŁĘDNA.**
  Raport tłumaczy 0% niezacommitowaną pracą sesji. Sprawdziłem w kodzie (`core.mjs:888-911,1092`,
  `AGENT_AUTHOR_RE` w `config.mjs`): to jest czysty regex na stringu autora commitu (`claude|copilot|
  cursor|codex|devin|bot|gpt|gemini|dependabot`), liczony wyłącznie z **przechodzonej historii gita** —
  drzewo robocze nie wchodzi do tego rachunku w żadną stronę, zgodnie z zasadą „norma to zaakceptowana
  przeszłość". Niezacommitowana praca sesji nie mogła więc zmienić tego wyniku ani na 0%, ani na
  cokolwiek innego — gdyby zerowej młodej populacji w ogóle nie było, kod drukuje osobno `n/a`, nie `0%`.
  Skoro wydrukowało `0%`, znaczy to: **w repozytorium BYŁ młody kod w historii, ale żaden z ostatnich
  commitów, które go dotknęły, nie miał autora pasującego do regexa** — czyli ostatni commitujący byli
  ludźmi wg tej definicji, nic więcej. Dokumentacja ma opisać PRAWDZIWY mechanizm, nie powtórzyć cudzą
  hipotezę.
- Nazwa typu w trzech miejscach: dwa to prawdziwe przeciążenia po arności generycznej (poprawne), jedno to
  konstruktor (A2). Przeciążenia arnością warto wymienić w dokumentacji jako zachowanie zamierzone.

**Zaimplementowane i zweryfikowane.** Obie notatki dopisane do `docs/reference.md` — pierwsza opisuje
prawdziwy mechanizm (`AGENT_AUTHOR_RE` na stringu autora, tylko z przechodzonej historii), nie teorię z
raportu; druga nazywa przeciążenia arnością jako zamierzone, bez konkretnego przykładu z żadnego języka.
Diff przeczytany osobiście i przeszukany pod kątem higieny (C#/CQRS/MediatR/nazwa repo) — zero trafień.

---

## C — Zdolności: rozszerzenie słownika, którym Grain w ogóle umie mówić

Słownik faktów to dziś: wywołania, importy, dekoratory, typy bazowe, typ zwracany, arność, „zawiera węzeł X",
kształt instrukcji, pierwsza instrukcja, kształt nazwy, katalog, kształt modułu, warstwa leksykalna. Poniżej to,
o czym nie da się dziś **powiedzieć zdania**.

### C1 · Normy nad grafem zależności — wypracowana warstwowość — ✅ ZROBIONE, zweryfikowane niezależnie

**Dowód wartości z pola:** mapa architektury była najcenniejszym pojedynczym wyjściem całej sesji — znalazła
sześciomodułowy cykl w rdzeniu i wydrukowała krawędzie, które go domykają, w tym `Entities → Infrastructure`
(18 importów) i `Entities → Commands` (1). Nikt w zespole nie miał tego nigdzie zapisanego.

**Czego brakuje.** Graf jest zmierzony i drukowany, ale jego prawidłowości nigdy nie przechodzą przez bramkę
akceptacji. Przy edycji istnieją dokładnie trzy zdania o zależnościach (`core.mjs:1246-1265`): przekroczenie
**zadeklarowanej** granicy z ziarna, zamknięcie cyklu, pierwsza krawędź. Nie ma zdania „`Entities` nie sięga do
`Infrastructure` — 148 z 166 plików", czyli warstwowości **wypracowanej**, mierzonej tak samo jak każda inna
konwencja. Ziarno granicy istnieje właśnie dlatego, że tej normy nie ma: utrzymujący musi ręcznie wpisać to, co
Grain mógłby zmierzyć — i wpisze tylko wtedy, gdy już wie.

**Kształt.** Fakt na parze katalogów, populacja = pliki katalogu źródłowego, wartość = czy sięga do celu;
akceptacja przez ten sam rachunek co reszta. Wtedy import łamiący warstwowość dostaje zdanie z mianownikiem,
a nie „pierwsza krawędź, nikt jej nie otworzył" — i cykl z pola byłby opisany jako **naruszenie praktyki**,
nie jako fakt topologiczny.

**Zaimplementowane dokładnie w tym kształcie.** Nowa funkcja `architectureNorms(model)` (`core.mjs`) traktuje
parę (moduł źródłowy, moduł docelowy) jak komórkę `_all`-scoped identyczną z tymi w `mine()`: `counts =
{true: pliki A sięgające B, false: pliki A, które nie sięgają}`, `neff = |plików A|`, decyzja przez **dokładnie
ten sam** test posterior-predictive (`kt()`, `CFG.lambda`), zero nowej stałej. Reguła absencyjna (kiedy „nigdy
nie sięga" jest realną granicą, nie tylko brakiem powodu) przeniesiona z zasady `mine()`, dostosowana do braku
populacji nadrzędnej (para modułów jest sama sobie szczytem hierarchii, więc warunek OR zamiast AND — decyzja
inżynierska, uzasadniona i przetestowana osobnym przypadkiem). Wpięte w `computeArchHits`: `if (fwd) continue`
sprawdza teraz najpierw, czy ta konkretna krawędź jest policzonym wyjątkiem od normy własnego modułu, zanim
zamilknie. Skromny dopisek w `report()` — jedna linia licząca pary z odchyleniem.

**Zweryfikowane niezależnie, formuła po formule.** Przepisałem matematykę ręcznie obok `mine()`'s `isAll` —
identyczna. Znalazłem jedną nieszkodliwą różnicę (remis `counts.true===counts.false` faworyzuje `'false'`
zamiast `'true'`), dowiodłem, że remis nigdy nie przechodzi bramki λ=8 (wymagałby ujemnej populacji) — martwy
kod, nie błąd. Cofnąłem ręcznie dokładnie cztery miejsca okablowania (wywołanie w `learn()`, gałąź w
`computeArchHits`, linia w `report()`) zostawiając samą funkcję `architectureNorms` nietkniętą — dokładnie 2
z 9 testów padło (te zależne od okablowania), reszta, w tym czysta matematyka, przeszła bez zmian — precyzyjny
dowód, że wina leży dokładnie tam, gdzie miała leżeć. Przywrócone, zielone. Pełny zestaw: **942/942**, moje
własne uruchomienie.

**Znalezione przy okazji, poza zakresem, nienaprawione — nowa pozycja, patrz C1a.** `moduleGraph()` buduje
wewnętrzne, niewyeksportowane dopasowanie modułów, doprecyzowane dla repozytorium z jednym dominującym
pakietem (dokładnie ten przypadek, którym chwali się dokumentacja: „architektura żyje WEWNĄTRZ pakietu").
`computeArchHits` (i teraz też nowa funkcja) używa **innej**, płaskiej wersji `moduleOf` — subagent potwierdził
to konkretnym przykładem: dla takiego repozytorium `a === b2` zwraca prawdę dla krawędzi MIĘDZY pod-modułami,
które `report()` pokazuje jako osobne moduły z prawdziwymi krawędziami i cyklami. Skutek: `check` jest ślepy
na dokładnie tę klasę repozytoriów, którą dokumentacja podaje jako flagowy przypadek architektury — cicho,
bez błędu, po prostu brak notatki tam, gdzie `report` widzi prawdziwą krawędź.

### C1a · Niespójność `moduleOf` dla repozytoriów z jednym dominującym pakietem — znaleziony przy C1, nienaprawiony

**Objaw, potwierdzony konkretnym przykładem.** `moduleGraph()` (`relations.mjs:159-167`) dla repozytorium
z jednym dominującym katalogiem (≥40 plików lub ≥50% repo) dopracowuje przypisanie modułów jeden poziom
głębiej — dokładnie po to, żeby architektura „wewnątrz pakietu" (przykład z README: `source/cli/src/{core,
relations,structure}`) była widoczna jako osobne moduły. Ta dopracowana wersja żyje wyłącznie jako domknięcie
wewnątrz `moduleGraph()` — nigdy nie jest eksportowana. `computeArchHits` (i teraz `architectureNorms`) liczy
moduł przez płaski, eksportowany `moduleOf(rel, pkgs)` — bez tego doprecyzowania.

**Skutek.** Dla repozytorium z jednym dominującym pakietem: `a === b2` w `computeArchHits` (płaski `moduleOf`
zwija oba pod-moduły do tego samego katalogu) jest prawdą dla krawędzi MIĘDZY pod-modułami, które `report()`
pokazuje jako osobne węzły z prawdziwymi krawędziami i cyklami. Wszystkie cztery gałęzie `computeArchHits`
(granica, cykl, pierwsza krawędź, teraz też warstwowość) milczą tam, gdzie `report` widzi prawdziwą krawędź —
cicho, bez błędu, po prostu ślepy punkt dokładnie na flagowym przypadku, którym chwali się dokumentacja.

**Poprawka, niewykonana.** Wyeksportować dopracowane domknięcie z `moduleGraph()` (albo zwrócić je razem
z węzłami/krawędziami) i użyć go konsekwentnie w `computeArchHits`/`architectureNorms` zamiast płaskiego
`moduleOf`. Nie dotknięte w tej rundzie — zgłoszone jako osobny temat.

### C2 · Zmiana jako jednostka — przepis — ✅ ZROBIONE (tańsza, tyraktowalna połowa), zweryfikowane niezależnie

Słownik opisuje plik i zakres. Nie ma pojęcia „co zmiana tego rodzaju dotyka jako **zbiór o kształcie**": plik
w tym katalogu + wpis w rejestrze + towarzysz + test. Kawałki leżą rozsypane (fakty „przychodzi z",
współzmienność, narodziny zakresów) — całości nie ma. **D1** i **E1** są fragmentami tego jednego pojęcia,
rozpisanymi osobno tylko dlatego, że osobno leżą w danych.

**Zrobione: złożenie trzech JUŻ policzonych faktów w jedno zdanie-przepis** na karcie `where` — narodziny
w nowym pliku (E1) + towarzysz + plik rejestrujący, zamiast trzech rozsypanych bytów. Przykład, żywy: „a new
carrier comes with: usually starts a new file (100% of 27) · a same-stem `*.meta.json` companion (100% of 27
have one, …)". Wyszukiwanie faktu `filebirth` dla tej samej populacji jest różne dla grupy i markera — grupa
ma własny cid, marker nie — subagent to poprawnie prześledził i rozwiązał przez współdzielony cid definiujących
faktów markera, nie przez zgadywanie. Deduplikacja: fakt złożony w linię przepisu nie pojawia się drugi raz
jako zwykły punktor karty. Diff przeczytany, czerwone/zielone odtworzone, pełny zestaw **1029/1029**.

**Świadomie NIE zrobione: pełna „współzmienność dla całej populacji"** (czego commity historycznie dotykają
razem z CZŁONKAMI tej grupy, zagregowane po całej ich historii, nie tylko dla jednego już edytowanego pliku
jak D1). Subagent, dotknąwszy dokładnie tego szwu kodu, ocenił to jako porównywalne rozmiarem do osobnego
podsystemu (jak „profiles"/superpozycja), nie jednoliniowe dołożenie — potrzebuje nowego przebiegu agregacji
w `history.mjs`, progu ufności skalowanego do wielkości populacji zamiast liczby commitów jednego pliku, i
decyzji o brzmieniu przy małych/młodych grupach. Zostaje jako osobna, większa runda projektowa.

### C3 · Alternatywne kształty tej samej roli (i kompozycja ciała) — ✅ ZROBIONE (pierwsza połowa), zweryfikowane niezależnie

Bezpośrednio z **A3**: konstruktor pierwotny i klasyczny to jedna rola w dwóch kształtach składniowych, a Grain
widział dwie niespotykające się populacje. Potrzebny był fakt o **roli** ponad kształtem — i to jest dokładnie
granica formy i znaczenia z residuum, więc wymagało świadomej decyzji.

**Zrobione dokładnie w kształcie, który uznałem za dopuszczalny: rola czytana z metadanych gramatyki, zero listy
nazw.** Nowa kategoryczna rodzina faktu `auto.ctorshape` (`primary`/`classic`/`both`/`none`) na zakresach typu,
płynąca przez ISTNIEJĄCY generyczny pipeline `mine()`/`report()`/`where()`/`check()` bez ŻADNEJ zmiany matematyki
akceptacji — dokładnie tak, jak `auto.nameshape`. Detekcja: dopasowanie **dokładne** (nie po segmentach słowa
jak `TYPE_LIKE_RE`/`FUNC_LIKE_RE`), bo subagent znalazł realne ryzyko kolizji, którego ja się spodziewałem, ale
nie rozstrzygnąłem: dopasowanie po segmentach złapałoby `type_parameter_list` (generyki) jako pasujące do
`parameter_list` (konstruktor pierwotny), dokładnie tą samą klasą błędu co A2. Subagent to sam znalazł i
udowodnił testem negatywnym — potwierdziłem to jeszcze raz osobno, włącznie z najtrudniejszym przypadkiem
(generyk `<T>` RAZEM z prawdziwym konstruktorem pierwotnym w tej samej klasie — poprawnie `primary`).

**Zasięg, ustalony własnym przeglądem gramatyk subagenta, szerszy niż mój brief.** C# i Kotlin (moje dwa
zweryfikowane przykłady) plus **Scala** (`class_parameters` jako pole nazwane) i **Java/Groovy `record_declaration`**
(pole `parameters`) — dwa wzorce, których nie przewidziałem, znalezione przez rzeczywiste sparsowanie
przykładów, nie zgadywanie. Świadomie NIE objęte, z uzasadnieniem gramatycznym: C++ (konstruktor nie ma
odrębnego typu węzła — niewidzialny strukturalnie, nie skrót), Scala drugorzędne konstruktory (`def this(...)`
to zwykły `function_definition` nazwany `this` — wymagałoby dopasowania po nazwie identyfikatora, zabronione
przez „kod to kod"), konstruktory enum w Javie (dwa poziomy zagnieżdżenia głębiej niż sprawdzany bezpośredni
dzieciak).

**Zweryfikowane niezależnie.** Diff przeczytany w całości, w tym poprawka na przypadek bezciałowy (rekord
pozycyjny C# `record Foo(int X);` — subagent policzył `ctorShape` PRZED wczesnym zwrotem dla `noBody`, żeby nie
zniknął cicho). Sam napisałem i uruchomiłem sześć własnych przypadków kontrolnych (poza testem subagenta),
wszystkie poprawne. Czerwone/zielone odtworzone ręcznym cofnięciem pięciu fragmentów (23 z 27 testów subagenta
padło dokładnie tam, gdzie miały — pozostałe 4 to trywialne sanity-checki dla języków bez tej cechy). Pełny
zestaw: **985/985**, moje własne uruchomienie.

**Druga połowa osi C3 — NIE zrobiona, zostaje w planie.** Kolejność i przepływ sterowania (strażnik na początku,
`validate` przed `apply`, symetria otwarcie/zamknięcie w tym samym zakresie) wciąż żyją wyłącznie wewnątrz
szablonów superpozycji i pozostają niewyrażalne jako samodzielny fakt — osobny, nietknięty temat.

### C4 · Rodziny markerów: alternatywy zamiast braków — ✅ ZROBIONE, zweryfikowane niezależnie

**Z pola.** `methods here are annotated with [ProducesResponseType] — 162/167`, a wskazana metoda niesie
`[Produces(MediaTypeNames.Application.Octet, Type = typeof(FileResult))]` — to pobieranie pliku i to jest
poprawny sposób zadeklarowania odpowiedzi. Metoda nie jest niechlujna, jest innym, prawidłowym członkiem tej
samej rodziny. Grain widzi dwie nazwy atrybutów i żadnej relacji między nimi.

**Co da się z tym zrobić bez listy nazw.** Dwa markery są **alternatywami**, jeśli rozkładają się komplementarnie
na tej samej populacji: prawie nigdy nie współwystępują, a razem ją pokrywają. To jest statystyka współwystępowania,
mierzalna dokładnie tak jak reszta.

**Zaimplementowane, dokładnie w tym kształcie, progi dopasowane do istniejących stałych, nie wymyślone.** Nowa
funkcja `altMarkerFor(f, ps)` — dla przyjętego faktu markera (`auto.deco:`/`auto.extends:`/`auto.returns:`,
`exp='true'`) sprawdza, czy dewianci w większości niosą JEDEN inny marker tej samej rodziny: supermajoryta 2/3
dewiantów (dokładnie próg z `placementHit`, nie nowa liczba), sam alternatywny marker musi mieć ≥3 nośników w
całym repo (dokładnie ta sama bramka co budowa markerów w `learn()`), i musi być rzadki wśród populacji ZGODNEJ
z oryginałem — poniżej 0,1 (dokładnie próg absencyjny z `mine()`, odwrócony). Zdanie: „metody tutaj są
opatrzone `[ProducesResponseType]` (162) lub `[Produces]` (5)" — subagent świadomie ODRZUCIŁ moją własną
przykładową frazę z briefu („declare a response type"), bo niosła wiedzę semantyczną (że oba atrybuty znaczą
to samo), której Grain nie ma i nie może udawać, że ma.

**Miejsce przechwycenia znalezione poprawnie, wbrew mojemu założeniu.** Zakładałem, że `check` czyta
prekomputowane `f.deviants`/`topDeviants` z `mine()` — subagent sprawdził i znalazł, że `checkFile` liczy
odchylenia NA ŻYWO, ze scope'ów sprawdzanego pliku, i wcale nie dotyka prekomputowanej listy. Przechwycenie
trafiło we właściwe miejsce (żywa tablica `s.decos`/`s.sup`/`s.rets` skanowanego zakresu, nie `s.preds`, bo
alternatywa może nie mieć własnego predykatu, jeśli jest poniżej progu wsparcia słownictwa — realny przypadek
brzegowy, który sam przewidział). Dzięki temu `grain.mjs`/`groupDeviations` nie wymagały ŻADNEJ zmiany.

**Zweryfikowane niezależnie.** Diff przeczytany w całości, matematyka progów sprawdzona przeciw cytowanym
stałym. Czerwone odtworzone ręcznym wyzerowaniem `altMarkerFor` i usunięciem strażnika w `checkFile` (3 z 6
testów padło dokładnie tam, gdzie miały — 3 negatywne trywialnie zostały zielone). Przywrócone, zielone. Pełny
zestaw: **991/991**, moje własne uruchomienie.

**Świadomie NIE zrobione:** wykrywanie N-kierunkowych zbiorów alternatyw (3+ wzajemnie wykluczających się
markerów) — zakres ograniczony do pary, zgodnie z dowodem z pola; rozszerzenie na `f.siblings[]` (te same
zestawy zgodności budowane wcześniej w `mine()`) odnotowane jako możliwe, ale wymagające zmiany kształtu
wyjścia `mine()`, więc nietknięte.

### C5 · Wartości, nie tylko nazwy — ŚWIADOMIE ODŁOŻONE

Literały nie są materiałem statystycznym — argumenty dekoratorów wchodzą wyłącznie jako tokeny wyszukiwania
z wagą 0,5. „Błędy tutaj mapują się na kody 4xx z `ERR_*`", „limit czasu to zawsze stała z konfiguracji, nigdy
liczba w miejscu" — niewyrażalne. Zostawione nietknięte, tak jak oceniłem na początku: to jest nowy, otwarty
wymiar miningu (jak grupować literały w sensowne klasy — zakresy liczbowe? wzorce stringów? bez listy nazw
frameworków?), a nie mechaniczne rozszerzenie istniejącego mechanizmu jak reszta serii C. Wymaga własnej
rundy projektowej takiej jak C1/C3/C4 dostały, nie doklejenia na końcu długiej sesji.

---

## D — Ujścia i zasięg: ta sama wiedza, więcej miejsc i momentów

- **D1 · Współzmienność wypowiedziana — ✅ ZROBIONE, zweryfikowane niezależnie.** `completeness` udokumentowane
  wszędzie (`USAGE`, README, `docs/reference.md`, nowy `commands/completeness.md`, skill), plus linia w hooku
  po edycji — składana w ten sam sygnaturowy mechanizm tłumienia powtórzeń co reszta ustaleń, nie osobny.
  `cochangeMinConf`/`cochangeMinSup` dopisane wprost do residuum w `docs/mathematics.md` jako progi
  kompute'owe, bez przeprojektowywania matematyki współzmienności. Diff przeczytany, czerwone/zielone
  odtworzone ręcznym cofnięciem fragmentu hooka (2 z 3 testów padło dokładnie tam, gdzie miały), pełny zestaw
  **945/945** moje własne uruchomienie. Sam potwierdziłem, że nowy plik komendy opisuje dokładnie to, co
  komenda drukuje naprawdę. Subagent znalazł przy okazji asymetrię progu ufności między `completenessDirectional`
  (zawsze 0,75) a `cochangePartners` używanym przez `where` (1/3 dla pojedynczego pliku) — możliwe, że
  zamierzone (różny kontekst UX), zgłoszone, nienaprawione.
- **D2 · Położenie i towarzysze dla plików bez parsera — ✅ ZROBIONE, zweryfikowane niezależnie.** Nowe
  `model.pathsAll` (wszystkie śledzone ścieżki minus `HARD_EXCL`, fallback na `filesAll` bez gita) zasila
  `placementHit` i `byStem` (towarzysze) jedną linią zmiany każde. `check` na pliku bez gramatyki przestał
  kończyć na samym przeprosinach — dokłada sygnał położenia, jeśli istnieje. `MODEL_V` → m13. Diff
  przeczytany, czerwone odtworzone ręcznym cofnięciem trzech linii (3 z 4 testów padło dokładnie tam, gdzie
  miały), zielone po przywróceniu, pełny zestaw **949/949** moje własne uruchomienie. Subagent złapał mój
  błąd w briefie (napisałem, że towarzysze renderują się w `report`, a żyją w `where`) i użył właściwej
  powierzchni zamiast ślepo podążać za złym opisem — dobry znak. Świadomie nietknięte: no-gitowy fallback
  (`walkFiles`) wciąż widzi tylko pliki z gramatyką — degraduje się bezpiecznie, nie naprawiane w tej rundzie.
- **D3 · Przegląd całej zmiany — ✅ ZROBIONE, zweryfikowane niezależnie.** `grain review [--staged |
  --range <a>..<b> | --worktree]` (domyślnie: niezacommitowane + nieśledzone), `--json`. Refaktor
  `cmdCheck` na trzy współdzielone funkcje (`govFactsOf`, `fileFindings`, `fileVerdictJson`) — potwierdzone
  bez zmiany zachowania: `check` zachowuje dokładnie oryginalną kolejność linii. Kolejność plików: decyzje
  utrzymującego/architektura → odchylenia wg siły dowodu → tylko-położenie. Brakujący partner ze
  współzmienności liczony dla CAŁEGO zbioru (D1), cisza gdy nic nie znaleziono zamiast literalnego
  „(complete)". Diff przeczytany, czerwone potwierdzone (8/9 testów padło dokładnie tam, gdzie usunięty
  dispatch), zielone po przywróceniu, pełny zestaw **958/958**. Hook „koniec pracy" (Stop) świadomie
  NIEDODANY — subagent sprawdził cały kod wtyczki pod kątem istniejącej rejestracji takiego zdarzenia,
  zero trafień, i odmówił zgadywania nazwy zdarzenia platformy zamiast ją wymyślić — komenda działa ręcznie
  i przez komendę ukośnikową, hook zostaje jako osobny temat wymagający weryfikacji platformy.
- **D4 · Miejsce w zgodnym wzorcu, nie sam plik — ✅ ZROBIONE, zweryfikowane niezależnie.** Gdy brak
  zgodnego sąsiada w tym samym pliku, `check` teraz dokłada „Nearest conforming exemplar: path:line
  \`Name\`" z prawdziwego pliku gdziekolwiek w repo (dane już policzone, `f.exemplars`) — zamiast ciszy.
  Stary przypadek (sąsiad w tym samym pliku) nietknięty. Diff mały i czysty, czerwone/zielone odtworzone
  (2 z 4 testów padło dokładnie tam, gdzie miały), pełny zestaw **1014/1014**.
- **D5 · Generowany dokument reguł — ✅ ZROBIONE, zweryfikowane niezależnie.** `grain rules [--out <plik>]`
  — dokument Markdown ze stemplem commitu i wyraźnym ostrzeżeniem o nieświeżości, w tabeli (nie płaskiej
  liście `report()`) bo dokument ma miejsce na kolumnę ścieżka+linia do przykładu. `factTiers()` wydzielone
  z `report()` do współdzielonej funkcji — obie ścieżki nie mogą się już rozjechać w tym, co liczy się jako
  konwencja domenowa/strukturalna/leksykalna. Diff czysty (czyste wydzielenie, bez zmiany zachowania
  `report()`), czerwone/zielone odtworzone (4/4 testów padło), pełny zestaw **1018/1018**. **Sam znalazłem
  i poprawiłem:** linia przepełnienia w tabeli mówiła „run `grain report --top N`" zamiast `grain rules` —
  jednoliniowy błąd kopiuj-wklej, naprawiony, testy dalej zielone po poprawce.
- **D6 · Serwer protokołu narzędziowego — ✅ ZROBIONE, zweryfikowane niezależnie w pełni.** `bin/grain-mcp.mjs`
  — ręczna implementacja JSON-RPC 2.0 po stdio (bez SDK, żeby nie naruszyć zasady „zero zależności
  uruchomieniowych" — świadoma decyzja, nie zgadnięta), cztery narzędzia tylko-do-odczytu (`grain_where`,
  `grain_check`, `grain_status`, `grain_report`), rejestracja przez nowy `.mcp.json` w korzeniu wtyczki.
  **Dwa fakty zewnętrzne sprawdzone przeze mnie osobno przez WebFetch do oficjalnej specyfikacji**, nie na
  słowo subagenta: format ramowania (newline-delimited JSON-RPC, „MUST NOT contain embedded newlines" —
  dokładny cytat) i mechanizm rejestracji `.mcp.json`/`mcpServers` w dokumentacji Claude Code — oba zgodne
  co do joty. Sam poprowadziłem ręcznie pełną sesję protokołu (handshake → lista narzędzi → prawdziwe
  zapytanie z realną konwencją `@Handler` → błędne narzędzie → brakujący wymagany argument → to samo
  zapytanie ponownie, identyczny wynik — dowód, że serwer przeżywa błędy i dalej odpowiada poprawnie).
  Zero nowych zależności uruchomieniowych potwierdzone. Pełny zestaw **1027/1027**.
  **Świadomie NIE zrobione:** transport HTTP/SSE (tylko stdio), narzędzia piszące (`seed add`), rejestracja
  dla Cursor/Codex (brak zweryfikowanych dowodów ich własnej konwencji — ten sam rygor co przy hookach D7).
  **Prawdziwa luka nazwana wprost przez subagenta:** to wszystko zweryfikowane przez własny test mówiący
  protokołem i mój ręczny przejazd — nigdy przez prawdziwego klienta MCP z zewnątrz (Claude Desktop, SDK
  klienta). Zgodność ze specyfikacją tak dobra, jak dało się ją sprawdzić z dwóch źródeł; „prawdziwy klient
  się z tym dogada" pozostaje niepotwierdzone.
- **D7 · Hooki dla Cursor i Copilot + dług weryfikacyjny — SPRAWDZONE, ŚWIADOMIE NIE ZROBIONE.** Przeczytałem
  obie rejestracje (`hooks/cursor-hooks.json`, `hooks.json`) — obie faktycznie niosą tylko `sessionStart`.
  Rozszerzenie o odpowiedniki pre-write/post-edit wymagałoby zgadnięcia nazw zdarzeń tych platform, których
  nie mam jak zweryfikować (nie ma tego w żadnej dokumentacji w tym repo) — dokładnie ta pułapka, którą D3
  świadomie ominął przy hooku „Stop": zła nazwa zdarzenia cicho nigdy się nie odpali, co jest gorsze niż jej
  brak. **Nie zgaduję.** To jest dług weryfikacyjny wymagający albo realnej dokumentacji platformy (Cursor/
  Copilot), albo żywej instalacji do testów — nie inżynierii, którą mogę wykonać stąd. Ścieżki Windows i
  pakowanie dla Codex/Cursor/Copilot pozostają nienaprawialnym z tego miejsca długiem z tego samego powodu.
- **D8 · Języki — ŚWIADOMIE ODŁOŻONE, decyzja treściowa, nie inżynieria.** Swift bez gotowego parsera; sześć
  z dziewiętnastu gramatyk bez warstwy powiązań (Scala, Groovy, Bash, Lua, Zig, Solidity). Nie ruszam tego
  sam: dołożenie języka albo warstwy powiązań to wybór CO dołożyć i ile rygoru testowego mu poświęcić —
  dokładnie ten rodzaj decyzji, który w tym planie zarezerwowany jest dla utrzymującego (seria F), nie coś,
  co powinienem rozstrzygnąć sam między wierszami. Czeka na Twój wybór konkretnego języka.

---

## E — Nowa wiedza z danych, które już są w indeksie

- **E1 · Nowy plik czy dopisanie do istniejącego — ✅ ZROBIONE, zweryfikowane niezależnie.** Nowa kategoryczna
  rodzina `auto.ctorshape`-jak `auto.filebirth` (`'new'`/`'existing'`), zapisywana RAZ przy narodzinach zakresu
  w `history.mjs` (`newFile: e.st === 'A'`), płynąca przez ten sam generyczny pipeline co reszta — zero zmian
  matematyki akceptacji. Krytyczny przypadek ochronny: przeniesienie/zmiana nazwy pliku NIE resetuje statusu
  narodzin (transplantacja rekordu cyklu życia już istniała dla innego powodu — subagent to udowodnił realnym
  `git mv` na fixture, nie samą lekturą kodu). Diff przeczytany, czerwone/zielone odtworzone ręcznym cofnięciem
  dwóch fragmentów (4 z 6 testów padło dokładnie tam, gdzie miały), pełny zestaw **997/997**. Jeden istniejący
  test (`grain.test.mjs`) wymagał złagodzenia regexa — sam odtworzyłem żywe wyjście i potwierdziłem: to jest
  prawdziwa, oczekiwana konkurencja o miejsce wyświetlania między silnym nowym faktem (100% z 58) a starszym
  faktem typu, nie regresja. **Sam domknąłem dodatkowo:** subagent słusznie zauważył, że `HIST_V` nie został
  podbity, więc stare zcachowane wiersze cyklu życia nigdy nie dostałyby `newFile` bez pełnego przebudowania —
  podbiłem `HIST_V` (h5→h6) i `MODEL_V` (m13→m14) sam, zweryfikowałem pełny zestaw po zmianie (997/997).
  **Nowa obserwacja, nieplanowana:** `check <plik>` NIE pokazuje `auto.filebirth` — `checkFile()` odczytuje
  predykaty z żywego, doraźnego parsowania, bez dostępu do `H`/cyklu życia; fakt widoczny tylko przez
  `report`/`where`. Architektoniczna granica, nie błąd — odnotowana, nienaprawiona.
- **E2 · Kto praktykuje, i co stoi na jednym autorze — ✅ ZROBIONE, zweryfikowane niezależnie.** Decyzja
  o hashach utrzymana — `authorConcClause` drukuje wyłącznie liczby, nigdy hash. Kredyt za zgodność zakresu
  idzie do autora OSTATNIEGO pasującego zdarzenia wartości (`H.vev`), nie twórcy — subagent to udowodnił
  sprytnym testem wykorzystującym fakt, że hash ciała zakresu TYPU nie zmienia się, gdy zmienia się tylko
  zwracana wartość zagnieżdżonej METODY: ten sam fakt na dwóch zakresach tego samego pliku, jeden z jednym
  zdarzeniem (kredyt trafia do twórcy), drugi z trzema (kredyt trafia do OSTATNIEGO autora) — gdyby logika
  była błędna, oba czytałyby identycznie. Sam przeliczyłem tę logikę ręcznie i potwierdziłem poprawność.
  Progi: `CFG.minRaw` i 2/3 — bez nowych stałych. Diff przeczytany, czerwone/zielone odtworzone (3 z 5
  testów padło dokładnie tam, gdzie miały), pełny zestaw **1008/1008**. Świadomie NIE zrobione: to samo
  w `check()`'s deviation message i w karcie markera `where` — subagent zawęził się dokładnie do zleconych
  dwóch miejsc (`report()`, `where`'s bullet), zgłosił resztę jako możliwe rozszerzenie.
- **E3 · Różnica normy między dwoma punktami historii — NIEZROBIONE, świadomie odłożone.** Sprawdzone
  własnym wysiłkiem na E4: `learn()` nie ma ŻADNEGO okablowania na „drzewo/historia jak w chwili X" —
  tylko bieżący HEAD albo brudne drzewo robocze dla `check`. Realna wersja wymagałaby: (1) uogólnienia
  odczytu drzewa na dowolną rewizję, (2) przedefiniowania „ustalone" (`ageFn`/`freshDays`/`survDays`)
  z punktu widzenia PRZESZŁOŚCI, nie teraźniejszości, (3) dwóch pełnych przebiegów `learn()` bez skrótu
  przyrostowego. Rząd wielkości: kilka razy większe niż E4, nowy punkt wejścia do miningu, nie
  mechaniczne rozszerzenie. Odłożone w całości do osobnej rundy.
- **E4 · Reguły martwe — ✅ ZROBIONE (tańsza wersja), zweryfikowane niezależnie.** Zamiast pełnego
  różnicowania modelu w historii (E3): `grain seed add` zapisuje TERAZ udział/populację z chwili
  utworzenia (`baselineShare`, `core.mjs`) wprost w rekordzie ziarna, a `report`/`where`'s linia steera
  dokłada deltę („up from 3 of 28 when recorded … to 11 of 30 now") — bez wynajdywania nowego progu
  „martwe", tylko dwie liczby obok siebie do oceny przez utrzymującego. Uczciwy, udokumentowany
  kompromis: bazowa wartość czyta tylko komórkę CAŁOPAKIETOWĄ (`cid.startsWith('_all')`), więc konwencja
  czysto grupowa/katalogowa dostaje `baseline: null` — potwierdzone empirycznie na dokładnie takim
  przypadku z fixture'u, nie tylko nazwane teoretycznie. Diff przeczytany, czerwone/zielone odtworzone
  (2/2 testów padło), pełny zestaw **1010/1010**.
- **E5 · Lokalne słowa wymienne — ŚWIADOMIE ODŁOŻONE.** `msgAff` (`history.mjs:140`) niesie pełną macierz
  słowo↔plik z historii repozytorium. Wyłącznie jako kanał rezerwowy przy zerowym trafieniu leksykalnym,
  mierzony na korpusie przed przyjęciem. Kolizja z B1 zostaje aktualna: B1 dostał tylko wstępną, niepełną
  kalibrację (dwa repozytoria, zero trafień w żadną stronę — patrz B1 wyżej), więc dokładanie nowego kanału do
  rankingu, który wciąż nie ma pełnej kalibracji korpusowej, pozostaje przedwczesne. Nienaruszone w tej rundzie.
- **E6 · Pętla zwrotna — ✅ ZROBIONE, zweryfikowane niezależnie, PO poprawce błędu projektowego, który sam
  znalazłem.** Pierwsza wersja korelowała po dokładnej ścieżce (`rel`) — matematycznie martwy pomysł: Pre i
  Post dla JEDNEGO wywołania narzędzia zawsze dotyczą tej samej ścieżki, a `placementHit` odpala się tylko
  wtedy, gdy bieżący katalog jest zły, więc porównanie tej samej ścieżki nigdy nie mogło dać „followed" —
  licznik czytałby „0 z N" na zawsze, niezależnie od tego, jak dobrze agent stosuje się do podpowiedzi. To
  byłoby gorsze niż brak funkcji: fałszywy pomiar, nie tylko słaby. Sam to wyprowadziłem z mechaniki hooków,
  zanim zaakceptowałem pierwszą wersję, i odesłałem z precyzyjną poprawką. **Naprawione**: korelacja po
  sufiksie+tokenie nazwy (`sufOf`/`nameTokens`, wydzielone z `placementHit` do współdzielonych funkcji), nie po
  ścieżce — łapie realny przepływ: agent porzuca złą ścieżkę i pisze NOWY plik w sugerowanym katalogu.
  Zweryfikowane na prawdziwej sekwencji dwóch wywołań hooka, nie na spreparowanym stanie. Licznik w
  `grain status`, milczy przy zerowej historii. Diff przeczytany, czerwone/zielone odtworzone (5 z 6 testów
  padło dokładnie tam, gdzie miały), pełny zestaw **1003/1003**.

---

## F — Decyzje, nie inżynieria

- **F1 · Publikacja** *(dawne d12)* — paczka jest prywatna; instalacja jednym poleceniem zdejmuje próg wszystkim,
  którzy nie siedzą w Claude Code.
- **F2 · Wiele repozytoriów** *(dawne d14)* — porównanie i zimny start z sąsiada. Zmienia jednostkę analizy
  z repozytorium na organizację. Nie zaczynałbym od niej.
- **F3 · Historia publicznego repo** — wyciek nazwy prywatnego repozytorium trialowego siedzi w historii gita
  od 57f7ac5 (naprawione w HEAD, nie w historii). Przepisanie historii jest Twoją decyzją i świadomie nie zostało
  wykonane. Teraz dochodzi drugie źródło tej samej klasy ryzyka — raport z pola.

---

## Kolejność

1. **A1, A2** — dane. Wszystko inne czyta ten indeks, a poprawka jest punktowa i ma repro. **A4** w tym samym kroku.
2. **B1 + B2** — najmniej wiarygodna liczba w całym wyjściu i ta, której agent najbardziej ufa. Do tego test
   kalibracyjny na korpusie, którego dziś nie ma.
3. **B4** — najtańsza rzecz o największym wpływie na to, czy ktokolwiek dojdzie do drugiego uruchomienia.
4. **B3, B5, B6** — cięcie prezentacyjne, bez nowego pomiaru.
5. **C1** — pierwsza prawdziwa nowa zdolność, w miejscu, które pole samo wskazało jako najcenniejsze.
6. **D1, D2, D3** — ujścia i zasięg; D1 dlatego pierwsze, że produkt już zna odpowiedź i milczy.
7. **A3 → C3** — migracje kształtu. Najgłębsze i wymaga decyzji o granicy formy i znaczenia.
8. dalej: **C4**, **E1**, **E6**, potem reszta E, **D4–D8**, **C2**, **C5**.

Poza kolejnością, bo to nie inżynieria: **F1**, **F2**, **F3**.

---

## Mapowanie na poprzednią listę

d1→D1 · d2→D2 · d3→D3 · d4→E1 · d5→E2 · d6→E3 · d7→E4 · d8→D4 · d9→D5 · d10→D6 · d11→D7 · d12→F1 · d13→D8 ·
d14→F2 · d15→E5 · d16→E6. Nowe z tej rundy: **A1–A4**, **B1–B6**, **C1–C5**, **F3**.

---

## G — Bug bounty: 18 publicznych repozytoriów, jeden agent na język

Zautomatyzowany przebieg: 18 agentów-łowców, po jednym na język wspierany przez grain (TypeScript/compiler,
lodash/JS, requests/Python, cobra/Go, guava/Java, rails/Ruby, ripgrep/Rust, efcore/C#, laravel/PHP, redis/C,
protobuf/C++, okhttp/Kotlin, akka/Scala, bats-core/Bash, neovim/Lua, zig/Zig, groovy/Groovy,
openzeppelin-contracts/Solidity). Każdy klonował swoje repozytorium i polował na crashe, zawieszenia, złamane
gwarancje z dokumentacji i samosprzeczne wyniki; każde znalezisko przechodziło przez niezależnego weryfikatora,
który odtwarzał repro od zera. Wynik: **49 potwierdzonych znalezisk** (48 w pliku wynikowym + groovy zweryfikowane
osobno po awarii weryfikatora), 0 odrzuconych.

**Werdykt z własnego, sceptycznego przeglądu wskaźnika 0/48: weryfikatorzy nie stemplowali.** Przeczytałem sam
każde cytowane niżej miejsce w źródle (grain.mjs, core.mjs, relations.mjs, history.mjs, export.mjs — każdy
plik:linia poniżej zweryfikowany osobiście, nie przepisany z raportu) i odtworzyłem od zera trzy repro z różnych
klas: przepełnienie stosu na łańcuchu 1500 operatorów (exit 1, `Maximum call stack size exceeded`), fabrykację
katalogu dla nieistniejącego `--repo` (exit 0, `.grain/cache` powstał na dysku) i wyzerowanie architektury przez
symbol C `constructor` (`relation pass failed: arr.includes is not a function`) — wszystkie trafione co do bajta.
Zero znalezisk ląduje w „niepotwierdzone"; w jednym (G9) prawdziwy mechanizm jest **inny i głębszy**, niż raport
zgadywał — doprecyzowany niżej z własnego śledztwa. 49 znalezisk zapada się do **22 biletów** po deduplikacji po
przyczynie źródłowej; krotność między niezależnymi repozytoriami odnotowana przy każdym jako miara realności.

**Wersjonowanie, jedna decyzja na całą serię:** G1+G15+G16+G17 zmieniają wynik ekstrakcji → jeden wspólny bump
`EXTR_V` na końcu partii (mechanizm VERSION w BlobCache sam unieważni cache blobów). G9+G11 zmieniają zawartość
modelu → jeden wspólny bump `MODEL_V`. G6 przywraca zawartość modelu (architektura przestaje się zerować) — jedzie
na tym samym bumpie `MODEL_V` co G9/G11, żeby dotknięte repozytoria dostały naprawiony indeks bez czekania na
nowy commit. Cała reszta to logika komend i prezentacji — bez żadnego bumpa.

### G1 · Rekurencyjny `walk` w ekstrakcji przepełnia stos na głębokim wyrażeniu; `review` traci CAŁĄ partię — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** `check`/`review` na pliku z jednym łańcuchem ~1000+ operatorów binarnych (`1+1+…`) kończy się exit 1,
pustym stdout (również z `--json` — złamany kontrakt) i `[grain] Maximum call stack size exceeded` na stderr.
Gorzej: `review` z takim plikiem gdziekolwiek w drzewie roboczym (nawet nieśledzonym, nieedytowanym) traci
znaleziska WSZYSTKICH pozostałych plików zmiany. Odtworzone przeze mnie od zera (JS, N=1500, exit 1).

**Mechanizm — zweryfikowany w źródle.** `extractScopes` w `core.mjs` używa rekurencyjnego domknięcia `walk`
(zejście po `namedChildren`, w tym `walk(bodyN || ch)` i `walk(ch)` w gałęzi else) bez żadnego ogranicznika
głębokości — jeden poziom AST = jedna ramka stosu JS, a lewostronnie zagnieżdżony `binary_expression` ma głębokość
równą liczbie operatorów. Ścieżka indeksowania (`extractTree`) łapie wyjątek i cicho pomija plik; MCP łapie
i zwraca `isError:true`; goły CLI `check` nie łapie wcale, a pętla per-plik `cmdReview` (`grain.mjs:234`,
`const r = await checkFile(...)`) nie ma try/catch, więc jeden plik zabija całą partię. Wewnętrzna pętla po
instrukcjach ciała już jest iteracyjna z limitem (`stack`, `g < 4000`) — precedens jest w tym samym pliku.

**Poprawka.** Przepisać `walk` na jawny stos (iteracyjnie, zachowując kolejność odwiedzin — porządek dokumentów
ma znaczenie dla dekoracji i `first1`), bez limitu głębokości, bo iteracja go nie potrzebuje. Osobno: try/catch
wokół `checkFile` w pętli `cmdReview` — plik, którego nie da się przeanalizować, dostaje uczciwą linię w raporcie
(„parse failed — skipped") zamiast zabijać partię; to zostaje potrzebne nawet po iteracyjnym `walk`, na każdą
przyszłą awarię per-plik. `EXTR_V` bump (wspólny): pliki dotąd cicho pomijane przy indeksowaniu zaczną wchodzić.

**Test czerwony→zielony.** Nowy test: plik `const x = 1+1+…` (3000 członów) w repo fixture — (a) `checkFile`
zwraca zakresy zamiast rzucać RangeError (czerwony dziś: rzuca); (b) CLI `check` exit 0 z normalną odpowiedzią
i `as of`; (c) `review` z tym plikiem obok drugiego, zwykłego zmienionego pliku raportuje znaleziska tego
drugiego (czerwony dziś: exit 1, zero wyników); (d) `check --json` daje parsowalny JSON.

**Priorytet: 1 (crash).** Dowody: TypeScript, requests, ripgrep, laravel-framework, protobuf, neovim, groovy —
**7 niezależnych repozytoriów**, próg ~960–1000 członów, osiągalny w realnym kodzie (protobuf miał plik z 20 000).

### G2 · Pełne indeksowanie historii OOM-uje na dużym repo i nigdy nie może się udać przy ponowieniu — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** protobuf (69 122 bloby): po 31 min i sparsowaniu ~82% blobów proces ginie natywnym `FATAL ERROR:
Ineffective mark-compacts near heap limit` przy ~4 GB sterty. neovim (76 289 blobów): to samo po ~20 min.
Ponowienie zaczyna od zera i deterministycznie ginie w tym samym miejscu — pierwszy indeks na takim repo jest
niemożliwy, mimo że dokumentacja nazywa stan odtwarzania „resumable", a cache blobów „per-blob-persisted".

**Mechanizm — zweryfikowany w źródle.** `history.mjs`: `BlobCache.shards` (Map) rośnie bez eksmisji — każdy
odwiedzony shard zostaje w pamięci do końca procesu; `parseBlobs` woła `cache.flush()` **dokładnie raz, po
całej pętli** (linia ~105), więc żaden postęp nie jest utrwalany aż do końca. Pamięć szczytowa ∝ suma
sparsowanych zakresów całej historii; awaria = utrata wszystkiego.

**Poprawka.** Flush co porcję (pętla już idzie po 400 blobów — flush na końcu każdej iteracji porcji jest
naturalnym punktem) + eksmisja spłukanych shardów z `this.shards` (zostawić tylko brudne). To czyni budowę
faktycznie wznawialną (drugi przebieg pomija bloby już w shardach — `cache.has()` już to robi) i ogranicza
szczyt pamięci do jednej porcji. Format shardów bez zmian — **bez bumpa** (to nie zmiana schematu). Świadomie
NIE w tym bilecie: streaming `walk()` po zdarzeniach commitów (osobna, mniejsza masa; nie blokował żadnego repro).

**Test czerwony→zielony.** Wstrzyknięcie awarii: subklasa BlobCache, której `set()` rzuca po N wpisach;
`parseBlobs` na fixture z >400 blobami w historii. Czerwony dziś: po awarii katalog `blobs/` pusty, drugi
przebieg parsuje wszystko od zera. Zielony: shardy pierwszych porcji na dysku, drugi przebieg parsuje tylko
resztę (asercja po liczniku `parsed`).

**Priorytet: 2 (crash).** Dowody: protobuf, neovim — **2 repozytoria**, oba w klasie „duże, wieloletnie" — czyli
dokładnie tam, gdzie grain ma najwięcej do powiedzenia.

### G3 · Nieistniejący `--repo` jest po cichu fabrykowany na dysku (mkdir -p + cache), a MCP zwraca sukces wbrew udokumentowanemu kontraktowi — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** `status --repo /tmp/nie-ma-takiego` → exit 0, normalnie wyglądający raport „0 files · as of no-git",
a na dysku powstaje CAŁA brakująca ścieżka (także wielopoziomowa) z `.grain/.gitignore` i
`.grain/cache/{model,meta,scopes}.json`. Przez MCP: `grain_status`/`grain_where` zwracają `isError:false`
z fabrykowanym pustym modelem — wprost wbrew reference.md („a failure while answering (a bad `repo` path…)
comes back as a normal result with `isError: true`") i wbrew „read-only query surface". Niespójność wewnętrzna:
`grain_check` na tej samej złej ścieżce POPRAWNIE daje `isError:true` (bo `relPath` rzuca). Odtworzone przeze
mnie od zera (CLI).

**Mechanizm — zweryfikowany w źródle.** `findRoot()` (`grain.mjs:38-41`): na KAŻDĄ awarię `git rev-parse` —
w tym ENOENT nieistniejącej ścieżki — wpada w `catch { return { root: start, git: false } }` bez żadnego
`existsSync`. Potem `ensureStore()` (`grain.mjs:47-50`) bezwarunkowo `mkdirSync(store.dir, { recursive: true })`.

**Poprawka.** W `findRoot()`: gdy `opts.repo` podane jawnie i `!existsSync(resolve(opts.repo))` → rzucić
`no such directory: <path>` PRZED fallbackiem no-git. CLI dostaje exit 1 z jasnym komunikatem, wszystkie
narzędzia MCP dostają `isError:true` za darmo (serwer już mapuje wyjątki). Istniejący katalog bez gita zostaje
wspierany bez zmian (to udokumentowana degradacja — testy edge-cases na tym stoją; poprawka odrzuca wyłącznie
ścieżki NIEISTNIEJĄCE). Bez bumpa.

**Test czerwony→zielony.** (a) `status --repo <nieistniejąca>` → exit ≠ 0, komunikat, `existsSync` po wywołaniu
= false (czerwony dziś: exit 0 + katalog powstał); (b) MCP `grain_status` z takim `repo` → `isError:true`;
(c) kontrola: istniejący katalog nie-git → dotychczasowa odpowiedź „no-git" bez regresu.

**Priorytet: 3.** Dowody: TypeScript, cobra, guava, efcore, akka, bats-core, zig — **7 repozytoriów, 9 znalezisk**
(w tym oba warianty MCP). Najczęściej trafiany pojedynczy defekt całego przebiegu; literówka w ścieżce zaśmieca
dysk i maskuje błąd wołającego.

### G4 · `review` nie wyłącza gitowego C-quotingu ścieżek: plik z nie-ASCII nazwą jest korumpowany w `files` i po cichu WYPADA z analizy, choć jest liczony — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** Nieśledzony/zmieniony plik `café.js`: `review --json` daje `"files":["\"caf\\303\\251.js\""]` —
literalne cudzysłowy i oktalne eskejpy gita jako „ścieżka" — a `findings` nie zawiera dla niego NIC, mimo że
`check café.js` (ścieżka podana wprost) znajduje realne odchylenia. Nagłówek liczy plik jako zrecenzowany
(„review 3 files · 1 finding(s)"), choć 1 z 3 nigdy nie został przeczytany — cicha utrata pokrycia dokładnie
w trybie, który SKILL każe odpalać przed „gotowe".

**Mechanizm — zweryfikowany w źródle.** `gitNameOnly()` (`grain.mjs:~205`) woła `git diff --name-only` /
`git ls-files --others --exclude-standard` bez `-z` i bez `-c core.quotePath=false`, po czym tnie stdout po
`\n` bez żadnego odquotowania. Skorumpowany `rel` w pętli `cmdReview` obcina się na
`existsSync(join(root, rel)) → continue`. `history.mjs` w swoich wywołaniach gita używa `-z` poprawnie —
wzorzec jest w repo.

**Poprawka.** W `gitNameOnly()` dodać `-z` do wszystkich trzech wywołań (diff, diff --cached, ls-files) i ciąć
po `\0` (NUL nie występuje w nazwach plików; obsługuje też newline w nazwie, czego `core.quotePath=false` nie
załatwia). Uwaga na pułapkę z pamięci projektu: separator NUL w literałach trzymać jako `\x00`/kod, nie surowy
bajt. Bez bumpa.

**Test czerwony→zielony.** Fixture z nieśledzonym `café.<ext>` niosącym realne odchylenie: (a) `review --json`
`files` zawiera dokładnie `café.<ext>` (czerwony dziś: oktalne eskejpy); (b) `findings` zawiera to samo, co
`check` na tym pliku (czerwony dziś: pusto); (c) tryby `--staged` i `--range` na tej samej nazwie.

**Priorytet: 4.** Dowody: lodash, cobra, guava, ripgrep, redis, protobuf, akka — **7 repozytoriów**. Każde repo
z jakimkolwiek nie-angielskim znakiem w nazwie pliku trafia to natychmiast.

### G5 · `relPath()` rozstrzyga względne ścieżki od cwd zamiast od `--repo` i nie kanonizuje symlinków: fałszywe „is outside the repository" na poprawnym wejściu — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw, trzy postaci jednej funkcji.** (a) Plik istniejący w OBU miejscach: `check README.md --repo <inne-repo>`
odpalone z katalogu grain (dokładnie wzorzec z SKILL: „no leading cd") → fałszywe „outside the repository",
bo README.md z cwd przesłania ten z --repo (lodash, rails). (b) Plik NIEISTNIEJĄCY: zamiast osobno zakodowanego
„no such file" wypada „outside the repository" — fałszywy zarzut ucieczki ścieżki, również przez MCP w jego
naturalnym kształcie wdrożenia (okhttp). (c) Ścieżka absolutna przez symlink (`/tmp` → `/private/tmp` na macOS):
root jest realpathowany przez `git rev-parse`, argument nie — fałszywe „outside" na pliku wewnątrz repo (efcore).

**Mechanizm — zweryfikowany w źródle.** `relPath()` (`grain.mjs:112-113`): `existsSync(resolve(cwd,p)) ||
!existsSync(resolve(root,p)) ? resolve(cwd,p) : resolve(root,p)` — cwd wygrywa zawsze, gdy ma plik o tej nazwie,
i jest fallbackiem dla nieistniejących; brak `realpathSync` na argumencie absolutnym. Poprawna kanonizacja przez
najgłębszego istniejącego przodka JUŻ ISTNIEJE w tym samym pliku — gałąź `check-hook` (`grain.mjs:~476-482`) —
i nigdy nie została zastosowana do ścieżki CLI/MCP.

**Poprawka.** Przepisać `relPath()`: (1) argument absolutny → kanonizacja przez realpath najgłębszego
istniejącego przodka (wyciągnąć istniejący kod z check-hook do współdzielonej funkcji); (2) argument względny →
najpierw względem `root`, cwd tylko wtedy, gdy pod rootem nie istnieje, a pod cwd tak I wynik nadal leży wewnątrz
roota; (3) ścieżka nieistniejąca w obu → zwrócić rel względem roota (dalej złapie ją osobne „no such file"),
komunikat „outside" wyłącznie dla ścieżki faktycznie uciekającej po kanonizacji. Bez bumpa.

**Test czerwony→zielony.** Trzy przypadki z objawu jako trzy asercje: (a) ten sam basename w cwd i w --repo →
analiza pliku z --repo (czerwony: outside); (b) nieistniejąca względna z obcego cwd → „no such file" (czerwony:
outside); (c) na macOS ścieżka `/tmp/...` do pliku śledzonego → normalny raport (czerwony: outside). Kontrola:
prawdziwa ucieczka `../poza` nadal odrzucana.

**Priorytet: 5.** Dowody: lodash, rails, okhttp, efcore — **4 repozytoria, 4 niezależne warianty**. Łamie
dokładnie udokumentowany sposób wołania narzędzia.

### G6 · Jeden symbol C o nazwie z `Object.prototype` (np. funkcja `constructor`) zeruje po cichu architekturę CAŁEGO repozytorium — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** Repo z funkcją `constructor` gdziekolwiek (redis ma ją w vendorowanym `lparser.c`): podczas
indeksowania jedna łatwa do przeoczenia linia `[grain] relation pass failed: arr.includes is not a function`,
po czym `edges`/`moduleGraph`/`archNorms`/`relDecls` są puste dla całego modelu — `status`, `report`, `export`
i `check` prezentują „0 modules · 0 edges · 0 cycles" jako zmierzony fakt, bez śladu awarii w odpowiedziach.
Odtworzone przeze mnie od zera na 2-plikowym repro (identyczna linia stderr + wyzerowana architektura).

**Mechanizm — zweryfikowany w źródle.** `compactDecls` (`relations.mjs:136`): `const arr =
(byLang[d.symbolKey] ||= [])` na zwykłym `{}` — dla `symbolKey === 'constructor'` odziedziczone
`Object.prototype.constructor` jest truthy, `||=` nie przypisuje, `arr` to funkcja `Object`, `arr.includes`
rzuca. Jeden catch w `core.mjs:1171` zeruje wtedy wszystkie cztery pola relacji. Ta sama mina czeka na
`toString`, `valueOf`, `hasOwnProperty`, `__proto__` itd.

**Poprawka.** `Object.create(null)` dla `byLang` (i `out`) w `compactDecls`; audyt grep po całym silniku
(`||= []`/`||= {}` indeksowane surową nazwą symbolu/użytkownika — `SymbolTable.declare`, `hydrateTable`,
mapy w `mine()` już używają `Object.create(null)`, sprawdzić resztę). Zawartość modelu wraca do prawdy →
jedzie na wspólnym bumpie `MODEL_V`, żeby repozytoria z zatrutym cache dostały architekturę bez nowego commita.

**Test czerwony→zielony.** Fixture: repo C z funkcjami `constructor` i `toString` + drugi plik z `#include`
i wywołaniem. Czerwony dziś: stderr `relation pass failed`, architektura pusta. Zielony: zero linii awarii,
`model.edges.length > 0`. Kontrola negatywna: te same pliki z przemianowanym symbolem — wynik identyczny jak
przed poprawką.

**Priorytet: 6.** Dowody: redis (**1 repozytorium**, ale klasa wejścia jest pospolita — `constructor` to
normalna nazwa w C/JS/TS — a skutek to korupcja całej warstwy danych, nie jednego wyniku).

### G7 · `check <plik> --json` drukuje zwykły tekst zamiast JSON na trzech własnych ścieżkach awaryjnych — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** Dla pliku bez gramatyki (np. `.tcl` w redis — realne, codzienne wejście), pliku bez pokrywającej
partycji albo bez wyekstrahowanych zakresów `check --json` ignoruje `--json` i drukuje ludzki tekst — każdy
konsument robiący `JSON.parse(stdout)` pada. `review --json` obsługuje ten sam przypadek no-grammar POPRAWNIE
(`{ file, noGrammar, dirty, placement }`) — wzorzec kształtu już istnieje.

**Mechanizm — zweryfikowany w źródle.** `cmdCheck` (`grain.mjs`): trzy wczesne `return [tekst…]` (no-grammar
~163, no-partition ~168, no-scopes ~171) leżą PRZED `if (opts.json)` (~174) i żaden nie sprawdza `opts.json`.

**Poprawka.** Na każdej z trzech ścieżek: gdy `opts.json`, zwrócić JSON w kształcie zgodnym z tym, co `review
--json` już robi dla no-grammar (`{ file, noGrammar | noPartition | noScopes, dirty, placement, asOf }`) —
dopisać kształt do reference.md (eksportowany interfejs!). Gałąź no-scopes patrz G8 (dziś martwa). Bez bumpa.

**Test czerwony→zielony.** `check plik.zzz --json` → `JSON.parse` przechodzi, pole `noGrammar: ".zzz"`
(czerwony dziś: SyntaxError); to samo dla pliku poza partycją. Kontrola: ścieżka pełna (plik z partycją)
bajt-w-bajt bez zmian.

**Priorytet: 7.** Dowody: rails, redis — **2 repozytoria**, plus każda uprząż karmiąca się `--json`.

### G8 · Prawdziwa porażka parsowania jest nieodróżnialna od pustego pliku: gałąź „no scopes extracted" to martwy kod — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw (49. znalezisko, groovy + dowód bats-core).** Plik groovy z identyfikatorami Unicode, którego
tree-sitter-groovy realnie nie parsuje (`hasError: true`, całe ciało w węzłach ERROR), daje w `check` wynik
bajt-w-bajt IDENTYCZNY z pustym plikiem 0 bajtów: „0 scopes … no strong convention governs this file".
Zaprojektowany na to komunikat `check <rel>: no scopes extracted (unsupported language or parse failure)`
(`grain.mjs:171`) nie może się nigdy odpalić. Pokrewny dowód z bats-core: here-doc z samotnym backslashem
po cichu połyka 2 z 3 funkcji Bash (`scopes: 1`), zero ostrzeżenia — niedoszacowanie bez śladu.

**Mechanizm — zweryfikowany w źródle.** `extractScopes` (`core.mjs`) bezwarunkowo robi
`scopes.push({ kind: 'file', … })` na końcu, a `checkFile` filtruje tylko `<anon>` — więc przy prawdziwej
partycji `r.scopes.length >= 1` ZAWSZE i warunek `!r.scopes.length` w `grain.mjs:171` jest nieosiągalny.
Węzły ERROR/MISSING są pomijane w trakcie spaceru (`core.mjs:123` — słusznie, częściowy parse ratuje resztę),
ale nigdzie nie zostaje ślad, ŻE coś pominięto.

**Poprawka.** W `checkFile` (parse na żywo — bez dotykania cache!) po parsowaniu odczytać
`tree.rootNode.hasError` i przekazać w wyniku; `cmdCheck`/`review` dokładają wtedy jedną uczciwą linię:
„parse degraded — part of this file is in error nodes; scope list may be incomplete" (i pole w `--json`).
Martwą gałąź `!r.scopes.length` usunąć albo przepisać na `hasError && zero zakresów nie-plikowych` → dopiero
wtedy komunikat „parse failure". Zastrzeżenie: przypadek bats-core here-doc może parsować BEZ hasError (błąd
zasięgu w gramatyce, nie błąd parsera) — wtedy jedyna droga to aktualizacja vendorowanej gramatyki; test to
rozstrzygnie i bilet dokumentuje wynik. Detekcja `hasError` w check-time only — bez bumpa.

**Test czerwony→zielony.** (a) Plik groovy z objawu vs pusty `.groovy`: wyjścia MUSZĄ się różnić — linia
degradacji na pierwszym, brak na drugim (czerwony dziś: identyczne); (b) `--json` niesie flagę; (c) plik
poprawny — zero nowej linii.

**Priorytet: 8.** Dowody: groovy, bats-core — **2 repozytoria**, i klasa „narzędzie nie umie powiedzieć, że
nie widzi" — dokładnie przeciw „degrade, never lie".

### G9 · `established` potrafi być 35× większe niż wyliczalna populacja własnej konwencji — niejednoznaczni członkowie liczeni do `sraw`, wykluczani wszędzie indziej — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** openzeppelin: karta `where "allowance"` mówi „group allowance — 6 members", dwie linie niżej
„97% of 211" dla konwencji tej samej grupy. W `export`: `established=211`, `sites={conforming:6, deviating:0,
truncated:0}` — 93 ze 137 konwencji (68%) ma `established ≠ conforming+deviating`, inflacja do 35,2×.
Łamie wprost inwariant z mathematics.md („The printed population… the same bound must hold on the survived
raw counts the message prints").

**Prawdziwy mechanizm — ustalony przeze mnie w źródle, INNY niż zgadywał raport.** To nie jest ważenie
przeżyciem (eksport uczciwie dokumentuje, że `established`/`counts`/`sites` „legitimately differ" —
`export.mjs:84`). To asymetria członkostwa niejednoznacznego: `mine()` (`core.mjs:~546`) dodaje do komórki
roli TAKŻE zakresy niejednoznaczne (`ri.amb`) — z połówkową wagą w `counts`, ale z PEŁNYM `rw=1` w `raw`/`sraw`
i pełnym wpisem w `members` — podczas gdy `part.assignments` (`core.mjs:1017`) mapuje amb na `-1`, a karta
grupy, `export.roleOf` (`export.mjs:99-100`) i enumeracja sites wykluczają `-1`. Efekt: mianownik zdania
(`sraw`) liczy populację, której NIC innego w produkcie nie uznaje za członków grupy. 205 z 211 to zakresy amb.

**Poprawka.** W `mine()`, dla komórek roli (`'r'+r+':'`): zakres niejednoznaczny nie wchodzi do `raw`/`sraw`
ani do `members` (zostaje w `counts` z połówkową wagą — dalej jest dowodem dla bramki MDL, ale nie populacją
drukowaną). Wtedy `established` = populacja wyliczalna w sites/kartach, z definicji. Zmiana wartości w modelu →
wspólny bump `MODEL_V`. Przypadek brzegowy do pilnowania: komórki `_all:`/`d[…]` bez zmian (amb dotyczy tylko
przypisania do ról).

**Test czerwony→zielony.** Syntetyczny model z grupą o 3 twardych członkach + 5 amb tej samej rodziny faktu:
(a) `report`/`where` drukują „N of 3", nie „N of 8" (czerwony dziś: 8); (b) `export`: `established ===
sites.conforming + sites.deviating` przy `truncated: 0` — asercja przejechana po WSZYSTKICH konwencjach fixture.

**Priorytet: 9.** Dowody: openzeppelin-contracts (**1 repozytorium**, ale defekt systemowy — 68% konwencji
w realnym eksporcie; mianowniki to waluta zaufania całego produktu).

### G10 · Fakty plikowe: świeżo wprowadzone odchylenie „pre-existing… not yours to fix", a cudze stare — przypisane niewinnej edycji linii 1 — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw, lustrzana para.** (a) Edycja wprowadza pierwszy pojedynczy cudzysłów do pliku całego w podwójnych →
`check`: „0 deviation(s) in your change, 1 pre-existing", z `hits[0]={line:1, inChange:false}` — świeżo
posadzone odchylenie zrzucone na historię; `git stash` dowodzi, że przed edycją było 0/0. (b) Odwrotnie:
`sed '1s/$/ \/\/ x/'` (tylko linia 1) przerzuca CUDZE stare odchylenie (linie 144/161) do „in your change".

**Mechanizm — zweryfikowany w źródle.** Fakty leksykalne/plikowe siedzą na zakresie `kind:'file'` z `line: 1`
(i bez `endLine` — `core.mjs`, push zakresu pliku), więc `groupDeviations` dostaje trafienie (1,1);
`touched(from,to)` w `fileFindings` (`grain.mjs:139`) to test przecięcia zakresów linii — dla (1,1) trafia
wyłącznie diff dotykający linii 1‑4. Klasyfikacja in-change/pre-existing dla faktu PLIKOWEGO w ogóle nie jest
pytaniem o linie — jest pytaniem, czy TA edycja zmieniła wartość predykatu pliku.

**Poprawka.** W `fileFindings`: dla grup odchyleń, których fakt ma `kind === 'file'`, rozstrzygać `touched`
różnicą WARTOŚCI, nie zasięgiem linii: policzyć predykat (`lexicalPreds`/odpowiedni pid) na wersji HEAD pliku
(`git show HEAD:rel` — `refContent` już istnieje) i porównać: HEAD niósł już wartość odchyloną → pre-existing;
wartość pojawiła się w tej edycji → in-change. Jeden dodatkowy parse TYLKO gdy plik ma odchylenie plikowe
i jest dirty. Plik nieśledzony → in-change (jak dotąd przez [[1,∞]]). Bez bumpa.

**Test czerwony→zielony.** Fixture z konwencją podwójnych cudzysłowów: (a) edycja dodająca pojedynczy →
odchylenie w „in your change" (czerwony dziś: pre-existing); (b) plik z istniejącym starym odchyleniem +
niewinna edycja linii 1 → zostaje w pre-existing (czerwony dziś: in-change); (c) `--json`: `inChange`
odpowiednio true/false.

**Priorytet: 10.** Dowody: openzeppelin-contracts — **1 repozytorium, 2 lustrzane znaleziska**. Uderza w samo
serce obietnicy `check` („deviations IN YOUR CHANGE") i wychowuje agentów w złej atrybucji.

### G11 · `check`/`review` liczą moduły INACZEJ niż `report`: fałszywe „FIRST edge … (0 existing)" tam, gdzie graf ma setki krawędzi — potwierdzone w polu C1a — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** laravel: `review` twierdzi „your import … is the FIRST edge tests/Database → src/Illuminate
(0 existing)", podczas gdy `report` w tym samym indeksie pokazuje `tests/Database/ → src/Illuminate/Database/
(644)`. To jest dokładnie **C1a** z sekcji C (niespójność `moduleOf`), teraz z żywym dowodem z zewnętrznego
repozytorium i odwróconym skutkiem: nie tylko ślepota (brak notatki), ale AKTYWNIE fałszywy komunikat.

**Mechanizm — zweryfikowany w źródle.** `computeArchHits` (`core.mjs:1436`) liczy `a`/`b2` płaskim,
eksportowanym `moduleOf(rel, pkgs)` i szuka ich w `model.moduleGraph.edges` — a te węzły pochodzą z
WEWNĘTRZNEGO, dopracowanego domknięcia `moduleGraph()` (`relations.mjs:159-167`, doprecyzowanie dominującego
pakietu). Płaskie `src/Illuminate` nigdy nie występuje wśród dopracowanych węzłów (`src/Illuminate/Database`) →
`fwd`/`rev` zawsze puste → każdy import to „pierwsza krawędź". `architectureNorms` (C1) świadomie używa tego
samego płaskiego `moduleOf` „consistently with computeArchHits" — po poprawce oba przechodzą razem.

**Poprawka.** `moduleGraph()` zwraca swoje finalne `modOf` (albo mapę rel→moduł) obok nodes/edges/cycles;
`computeArchHits` i `architectureNorms` używają WYŁĄCZNIE jej. Zawartość `archNorms` w modelu się zmienia →
wspólny bump `MODEL_V`.

**Test czerwony→zielony.** Fixture z jednym dominującym pakietem (≥40 plików albo ≥50% repo — próg z kodu)
i krawędziami między pod-modułami: `check` na pliku importującym po istniejącej krawędzi → ZERO „FIRST edge"
(czerwony dziś: fałszywy komunikat); import faktycznie pierwszy → komunikat zostaje. Asercja spójności:
moduły w tekście `check` ∈ zbiorowi węzłów `report`.

**Priorytet: 11.** Dowody: laravel-framework + wpis C1a (znaleziony wcześniej niezależnie przy C1) —
**potwierdzenie krzyżowe z dwóch źródeł**.

### G12 · `--no-history` jest no-opem, gdy indeks na dysku jest świeży — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** `refresh --full` (24 konwencje, 22 pary co-change), zaraz potem `status --no-history` → wciąż
24 konwencje, 22 pary, pełna historia — flaga udokumentowana jako per-wywołanie („nothing counts as
established") nie robi nic, jeśli nie trafi akurat na zimny cache.

**Mechanizm — zweryfikowany w źródle.** `ensureFresh` (`grain.mjs:75`): `fresh` liczy się z wersji + seedsHash
+ headSha i zwraca zcache'owany model PRZED jakimkolwiek spojrzeniem na `opts['no-history']` (czytanym dopiero
w gałęzi przebudowy, linia ~85).

**Poprawka.** Gdy `opts['no-history']` a meta mówi, że cache zbudowano Z historią: przebudować model w pamięci
bez warstwy historii (H=null — `learn()` już to wspiera) i NIE nadpisywać store'u (pełny cache zostaje; flaga
jest per-wywołanie, nie per-stan). Symetrycznie: cache zbudowany BEZ historii + wywołanie bez flagi już dziś
przebudowuje przez zwykłą ścieżkę świeżości? — nie: headSha się zgadza; dopisać do warunku świeżości
`historyMode`-zgodność (meta.historyMode==='none' z powodu no-history a wywołanie bez flagi → rebuild).
Koszt: jeden `learn()` bez historii, dokładnie to, co flaga obiecuje („faster"). Bez bumpa.

**Test czerwony→zielony.** Fixture: pełny indeks → `status --no-history` pokazuje 0 established/0 co-change
(czerwony dziś: pełny model), następnie `status` bez flagi → pełny model z cache bez przebudowy (asercja po
`builtAt`).

**Priorytet: 12.** Dowody: cobra — **1 repozytorium** (mechanizm uniwersalny, każdy ciepły cache).

### G13 · Pogłębienie płytkiego klona nie unieważnia indeksu: wieczne „up to date" + „shallow clone — history unavailable" naraz — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** Płytki klon → indeks (słusznie: „shallow clone — history unavailable") → `git fetch --unshallow`
bez ruchu HEAD → `status` już na zawsze: „freshness: … up to date · history none (shallow clone…)", choć
`git rev-parse --is-shallow-repository` mówi false, a pełna historia leży w repo. Samosprzeczność naprawialna
tylko ręcznym `refresh --full`, którego nic nie podpowiada. rails: realnie 99 512 commitów niewykorzystanych.

**Mechanizm — zweryfikowany w źródle.** `isShallow` sprawdzane wyłącznie w `loadHistory` (`history.mjs:171`),
wynik zamrażany w `meta.historyMode/historyReason`; `ensureFresh` liczy świeżość TYLKO z wersji+seeds+headSha —
zmiana płytkości przy niezmienionym HEAD nigdy nie unieważnia.

**Poprawka.** W `ensureFresh`, gdy `meta.historyReason` wskazuje płytkość: jedno tanie `isShallow(root)`
(odczyt `.git/shallow` przez rev-parse) — jeśli już nie-płytkie, potraktować jak stale i przebudować historię
(ścieżka full już istnieje). Koszt: jeden proces gita per zapytanie, tylko w stanie „indeks mówi shallow".
Bez bumpa.

**Test czerwony→zielony.** Fixture: origin 3 commity → clone --depth 1 → status (shallow) → fetch --unshallow
→ status → history ≠ none, konwencje z historią (czerwony dziś: wciąż shallow), builtAt się przesuwa.

**Priorytet: 13.** Dowody: rails — **1 repozytorium**; sekwencja shallow-potem-unshallow to standard CI.

### G14 · „100% of N" obok „M deviants" w tym samym zdaniu — zaokrąglenie w górę do pełni na udziale < 1 — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** guava: „files here are named PascalCase … — 100% of 594 established, 2 deviants" (i to samo
w `check` „conforms to: … (100% of 595)" oraz w tabeli `rules`). Udział realny 0.997/0.995. SKILL uczy czytać
„100% of N" jako regułę bez wyjątków — narzędzie samo produkuje kontrprzykład.

**Mechanizm — zweryfikowany w źródle.** `Math.round(f.share * 100)` w `core.mjs` (linie 1722, 1732, 1764,
1788, 1823, 1875) i w `grain.mjs` (linia „conforms to"); `deviantsN` liczone niezależnie
(`core.mjs:1028`) — każdy udział ∈ [0.995, 1) drukuje 100 przy niezerowych dewiantach.

**Poprawka.** Jedna współdzielona funkcja `pct(f)` (albo `pct(share, deviantsN)`): `share < 1` → nigdy nie
drukuj 100 (podłoga na 99), użyta we wszystkich siedmiu miejscach. Bez bumpa (prezentacja).

**Test czerwony→zielony.** Syntetyczny fakt share=0.997, deviantsN=2: `report`/`rules`/`check` drukują
„99% … 2 deviants" (czerwony dziś: 100%); share=1.0 dalej drukuje 100%.

**Priorytet: 14.** Dowody: guava — **1 repozytorium** (mechanizm czysto arytmetyczny, wszędzie tam, gdzie
populacje ≥ 200).

### G15 · Rust: wyrażenia konstrukcyjne (`struct_expression`) i deklaracje `mod` klasyfikowane jako typy — fałszywe odchylenia PascalCase na idiomatycznym kodzie — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** ripgrep: `check --all` wskazuje `TypeChange::Select` (KONSTRUKCJA wartości w ciele metody,
linia 7280 defs.rs) i `mod tests`/`mod convert` jako typy łamiące konwencję PascalCase; `review --range`
odpala to samo na 4 plikach, zawsze na `mod tests`.

**Mechanizm — zweryfikowany w źródle.** Dwie niezależne dziury w klasyfikacji (`core.mjs:157-160`):
(a) `TYPE_LIKE_RE` (segmenty słów) zawiera `struct` → `struct_expression` pasuje segmentem — dokładnie klasa
błędu A2, tylko od strony „słowo deklaracyjne na węźle niedeklaracyjnym"; (b) `mod_item` nie pasuje do żadnej
listy, ale ma zagnieżdżone zakresy → fallback „kontener nie-funkcyjny ⇒ typ". Rdzeń już traktuje
`/namespace|package/` jako lokalizację, nie jednostkę kodu (`core.mjs:141`).

**Poprawka.** (a) Wykluczyć z dopasowania TYPE_LIKE węzły z segmentem `expression` (generyczny sygnał AST:
wyrażenie ≠ deklaracja — zero wiedzy językowej); (b) dodać segment `mod` (dokładny, NIE `module` — Ruby
`module` to prawdziwy byt typopodobny, przechodzień `mod` go nie łapie; zapisać ten kontrast w komentarzu,
klasa A5) do regexa namespace/package-przejścia. `EXTR_V` bump (wspólny) — klasyfikacja zakresów w cache się
zmienia.

**Test czerwony→zielony.** Parse Rust: `pub enum Foo { S { x: u32 } } fn f() -> Foo { Foo::S { x: 1 } }` →
zero zakresów typu dla konstrukcji; `mod tests { fn a() {} }` → `tests` nie jest typem (czerwony dziś: oba są);
kontrola: `struct Bar;`, `impl Bar {}` dalej typami; Ruby `module Foo` dalej typem.

**Priorytet: 15.** Dowody: ripgrep — **1 repozytorium**, ale `mod tests` to jedna z najczęstszych konstrukcji
języka; fałszywe odchylenia uczą agenta ignorować prawdziwe.

### G16 · PHP: zwykłe wywołanie funkcji przypisane do zmiennej staje się widmowym „method" o nazwie `$zmienna` — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** laravel: `where --json` niesie `{"kind":"method","name":"$expected","line":150}` dla linii
`$expected = json_decode(...);` — zwykłego przypisania. Widmowe metody z sigilem `$` wchodzą do populacji
minowania i zaśmiecają grupy.

**Mechanizm — zweryfikowany w źródle.** `core.mjs:225-226`: nazwanie funkcji z prawej strony przypisania
używa NIEOGRANICZONEGO podciągowego regexa `/function|arrow|lambda|func_literal|closure/` — PHP nazywa węzeł
zwykłego wywołania `function_call_expression`, podciąg `function` pasuje; węzeł nie ma pola `name`, więc
strażnik anonimowości jest pusto-prawdziwy. Dokładnie klasa A2 (naprawiony `wordBounded` wisi 130 linii wyżej,
z komentarzem, czemu podciągi są złe); do tego `/^[A-Za-z_$][\w$]*$/` przepuszcza `$expected`.

**Poprawka.** Zamienić podciągowy test na dopasowanie po segmentach (`wordBounded(['function','arrow','lambda',
'func_literal','closure'])` — `function_call_expression` ma segment `function`… UWAGA: ma! — więc segmenty NIE
wystarczą; potrzebne wykluczenie `call`/`expression` po stronie węzła wartości: wymóg, by węzeł MIAŁ ciało
(`childForFieldName('body')` lub pasujący looseBody) — prawdziwa lambda/closure ma, wywołanie nie). Ten
dwuskładnikowy warunek (segment funkcyjny ORAZ ciało) jest czysto strukturalny. `EXTR_V` bump (wspólny).

**Test czerwony→zielony.** Parse PHP: `$x = json_decode($y);` → zero zakresów (czerwony dziś: method `$x`);
`$fn = function () { return 1; };` i `$fn = fn($a) => $a;` → dalej wyekstrahowane; JS `const f = () => {}` —
bez regresu (istniejące testy).

**Priorytet: 16.** Dowody: laravel-framework — **1 repozytorium**; wzorzec `$var = call()` występuje w każdym
pliku PHP.

### G17 · Kotlin: komentarz `//` zakończony samotnym CR (bez LF) połyka następną deklarację najwyższego poziomu — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** okhttp: plik z komentarzem zakończonym gołym 0x0D: `scopes: 1` zamiast 4 — klasa za komentarzem
znika z modelu bez śladu; z LF/CRLF wszystko poprawnie. Zbisekcjonowane przez łowcę do dokładnie tej kombinacji;
zweryfikowane bajt-w-bajcie przez weryfikatora.

**Mechanizm.** Vendorowana gramatyka tree-sitter-kotlin nie traktuje samotnego CR jako terminatora komentarza
liniowego — defekt gramatyki, nie kodu grain. Grain może go zneutralizować na wejściu: zamiana samotnych CR
(0x0D bez następującego 0x0A) na LF przed parsowaniem zachowuje długość bajtową i liczbę wierszy, więc
line/endLine/startIndex pozostają spójne z zawartością.

**Poprawka.** W miejscu czytania źródła do parsowania (checkFile / extractTree / parseBlobs — jedna
współdzielona funkcja normalizująca): `src.replace(/\r(?!\n)/g, '\n')`. Dotyczy wszystkich gramatyk (koszt:
jeden regex na plik; pliki bez CR — no-op). `EXTR_V` bump (wspólny), bo wynik ekstrakcji plików z samotnym CR
się zmienia.

**Test czerwony→zielony.** Plik .kt zbudowany bajtowo (komentarz + goły CR + dwie klasy po nim): `check --json`
→ `scopes: 4` (czerwony dziś: 1); kontrola: CRLF i LF — wynik identyczny przed i po.

**Priorytet: 17.** Dowody: okhttp — **1 repozytorium**; stare pliki z edytorów mac-classic/wygenerowane
istnieją w dzikich repo.

### G18 · `where --json`: wewnętrzny ordinal deduplikacji wycieka jako „line" dla członków grup o tej samej nazwie — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** neovim: członkowie grupy o identycznym (plik, kind, nazwa) — realne linie 2824/2833/2846 — dostają
w JSON `line: null / 1 / 2`. Tekstowa ścieżka TEGO SAMEGO zapytania i `export` liczą linie poprawnie.

**Mechanizm — zweryfikowany w źródle.** Klucz tożsamości `skeyR` (`core.mjs:443`) = `rel#kind#name#ord`, gdzie
`ord` to licznik wystąpień (0 pomijane); karta grupy niesie surowe klucze (`core.mjs:1548`); `cmdWhere`
(`grain.mjs:122`) naiwnie destrukturyzuje 4. segment jako `line`.

**Poprawka.** W `cmdWhere` rozwiązywać linię tak, jak robi to ścieżka tekstowa/eksport: mapą klucz→linia
z `part.fileScopes` (dokładnie wzorzec `lineOf` z `export.mjs:108-110` — wydzielić do współdzielonej funkcji,
żeby trzy ścieżki się nie rozjeżdżały), `null` gdy nieznana. Bez bumpa.

**Test czerwony→zielony.** Model z dwoma zakresami o tej samej nazwie w jednym pliku (linie 3 i 9): `where
--json` członkowie niosą 3 i 9 (czerwony dziś: null i 1); członek unikalny — bez zmian.

**Priorytet: 18.** Dowody: neovim — **1 repozytorium**; parametryzowane tytuły testów (duplikaty nazw) to
codzienność suite'ów.

### G19 · Linia „cycle:" drukuje SCC posortowane alfabetycznie ze strzałkami sugerującymi krawędzie, których nie ma — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** okhttp: `cycle: … okhttp-coroutines/src <-> okhttp-dnsoverhttps/src <-> …` — 3 z 8 sąsiadujących par
w wydrukowanym łańcuchu nie ma ŻADNEJ krawędzi w żadną stronę w tym samym `moduleGraph.edges`. Czytelnik
planujący rozcięcie cyklu dostaje fałszywą topologię.

**Mechanizm — zweryfikowany w źródle.** Tarjan poprawny, ale `relations.mjs:184`: `cycles.push(comp.sort())` —
porządek alfabetyczny gubi ścieżkę; `report`/`rules` renderują `join(' <-> ')`, obiecując sąsiedztwo.

**Poprawka.** Najtańsza uczciwość: render bez sugerowania łańcucha — „cycle (strongly connected):
A, B, C — every member reaches every other" (zmiana w `core.mjs` render + `rules`). Opcjonalne wzmocnienie
(osobna decyzja, bo zmienia model): przechowywać rzeczywistą ścieżkę cyklu przez krawędzie SCC. Rekomendacja:
sam render — zero zmian modelu, bez bumpa.

**Test czerwony→zielony.** moduleGraph z SCC A→B→C→A: wydruk nie zawiera `<->` między parami bez krawędzi /
używa formy mnogościowej (czerwony dziś: alfabetyczny łańcuch ze strzałkami).

**Priorytet: 19.** Dowody: okhttp — **1 repozytorium**.

### G20 · `spectrum` zaprzecza `check` w sprawie świeżo utworzonego pliku: „(no scopes extracted)" o pliku, który check właśnie sparsował — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** zig: nieśledzony nowy plik z jedną deklaracją — `check`: „1 scopes + file"; `spectrum` na tej samej
ścieżce, ten sam stamp `+dirty`: „(no scopes extracted for …)". Dwie komendy, jedno repo, sprzeczna odpowiedź —
i to sformułowana jak porażka parsera (patrz G8 o tym samym zwrocie).

**Mechanizm — zweryfikowany w źródle.** `spectrum()` (`core.mjs:1478`) filtruje `scopesAll` po
`fileSet = part.files` (zbiór HEAD) — plik spoza indeksu nigdy nie jest parsowany tą ścieżką; pusty wynik
renderuje się tym samym zwrotem co prawdziwe zero.

**Poprawka.** Gdy `rel` nie ma zakresów w `scopesAll` (nieśledzony/nowy): sparsować plik roboczy bezpośrednio
(dokładnie jak `checkFile`) i dokleić jego zakresy do `ps` przed liczeniem; komunikat „(no scopes extracted…)"
zostaje wyłącznie dla faktycznego zera po parsowaniu (spójnie z G8). Bez bumpa.

**Test czerwony→zielony.** Fixture: nowy nieśledzony plik z 1 deklaracją → `spectrum` drukuje wiersze
z zakresem (czerwony dziś: „no scopes extracted"); plik pusty → uczciwe zero.

**Priorytet: 20.** Dowody: zig — **1 repozytorium**; „nowy plik" to główny moment użycia grain.

### G21 · Zig (i 5 innych gramatyk bez warstwy powiązań): totalna ślepota architektury podawana jako zmierzone „0 dependencies" — obiecane w README ujawnienie nigdy nie zostało okablowane — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** zig: `status` „architecture: 108 modules · 2578 file edges · 0 module edges · 0 cycle(s)" — wszystkie
2578 krawędzi to #include vendorowanego C/C++; 0 z nich dotyka 2950 plików .zig (dominujący język repo,
w tym cały kompilator). README obiecuje: „Resolution covers 13 languages …; the other shipped grammars keep the
conventions layer only — `status` says so rather than guessing" — a `status` nie mówi nic.

**Mechanizm — zweryfikowany w źródle.** `relations.mjs:17-18`: `REL_LANGS` bez ziga (i Scala/Groovy/Bash/Lua/
Solidity — spójne z D8); `relSupported` wyeksportowane i NIGDZIE nie wywołane (grep po całym silniku — jedno
trafienie: własna deklaracja). Ujawnienie z README nie istnieje w kodzie.

**Poprawka.** Okablować `relSupported`: w `statusLines`/`report` policzyć udział plików indeksu, których
gramatyka nie ma warstwy powiązań; gdy > 0, jedna linia przy architekturze: „resolution does not cover N files
(<langs>) — conventions layer only for those". Zero heurystyk nazw — czysta zdolność gramatyki. Bez bumpa
(render z istniejących danych).

**Test czerwony→zielony.** Fixture z plikami .zig (lub innej gramatyki spoza REL_LANGS): `status`/`report`
niosą linię ujawnienia (czerwony dziś: gołe zera jako fakt); repo czysto TS — bez linii.

**Priorytet: 21.** Dowody: zig — **1 repozytorium**, plus wprost złamana obietnica README; dotyczy 6 języków.

### G22 · `grain rules` bez `--out`: dokument na stdout nie kończy się linią „as of <sha>" — jedyny wyjątek od blankietowej gwarancji — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw.** `grain rules > CONVENTIONS.md` (użycie wskazywane przez dokumentację jako główne) produkuje plik,
którego ostatnia linia to punktor szablonu; stamp idzie na stderr. reference.md: „Every answer ends with
`as of <sha>`" — bez wyjątku dla rules. Plik z `--out` też nie kończy się stampem.

**Mechanizm — zweryfikowany w źródle.** `cmdRules` (`grain.mjs`): `console.error('[grain] ' + stamp());
return [text]` — komentarz nad funkcją pokazuje, że to ŚWIADOMA decyzja („keeping the freshness stamp off
stdout in the redirection path"), która po prostu przegrywa z blankietową gwarancją dokumentacji. Sha siedzi
w nagłówku dokumentu, ale gwarancja mówi o OSTATNIEJ linii.

**Poprawka.** Dokleić stamp do samego DOKUMENTU jako ostatnią linię (`rulesMarkdown` — np. `*as of <sha>*`),
w obu ścieżkach (stdout i `--out`); stderr-owy stamp może zostać. Dokument staje się samonośny, gwarancja
prawdziwa, redirect czysty. Alternatywa (dopisać wyjątek do reference.md) odrzucona: gwarancja „każda odpowiedź"
jest warta więcej niż jedna linia Markdownu. Bez bumpa.

**Test czerwony→zielony.** `rules` na fixture: ostatnia linia stdout pasuje do /^.?as of [0-9a-f]{7}/
(czerwony dziś: punktor); plik z `--out` — to samo; `report` — bez regresu.

**Priorytet: 22.** Dowody: TypeScript — **1 repozytorium**.

### G23 · Detektor nazwanych callbacków ma ten sam podciągowy regex co G16 — podejrzenie, nie potwierdzone — NIEZROBIONE

**Objaw (podejrzenie, znalezione przy implementacji G16, brak własnego repro w polu).** Kawałek kodu tuż pod
detektorem anonimowej funkcji przypisania (`core.mjs`, komentarz „a named callback block, from the raw AST shape
alone") szuka argumentu wywołania pasującego do `/function|arrow|lambda|func_literal|closure|do_block|^block$/` —
dokładnie ten sam podciągowy (nie word-bounded) wzorzec, który G16 naprawił gdzie indziej. Jeśli jakiś język ma
węzeł typu `xxx_function_call`/`yyy_expression` jako wartość argumentu wywołania niosącego też string literal
(`app.get('/health', someFunctionCall())`), fałszywie dopasuje go jako „funkcję-callback" i utworzy fantomowy
zakres `kind: 'case'`.

**Dlaczego nienaprawione teraz.** G16 wymagał sprawdzenia obecności ciała (`childForFieldName('body')`), żeby
odróżnić prawdziwą lambdę od wywołania. To samo sprawdzenie może się nie przenieść bezpiecznie na to miejsce:
`do_block`/`^block$` (bloki Ruby) mogą nie eksponować pola `body` w ten sam sposób co węzły function/lambda —
zastosowanie identycznej poprawki bez dedykowanego testu ryzykuje cichym zepsuciem wykrywania bloków Ruby.
Brak własnego, potwierdzonego w polu repro (w przeciwieństwie do G16, które miało konkretny plik z laravel).

**Do zrobienia w osobnej rundzie.** Zbudować przypadek testowy per język (JS/TS/Ruby/PHP) sprawdzający, czy
wywołanie funkcji jako drugi argument wywołania z literałem stringowym fałszywie tworzy zakres `case`; jeśli tak,
zaprojektować wykluczenie strukturalne analogiczne do G16, zweryfikowane osobno dla `do_block`/`block`.

### G24 · `history.mjs`'s `walk()` ma dokładnie ten sam bug co G4, ale w całej historii, nie tylko w `review` — ✅ ZROBIONE, zweryfikowane niezależnie

**Objaw, znalezione przeze mnie po zamknięciu G4.** Przy naprawie G4 świadomie zostawiłem `walk()`
(`history.mjs:66`, `git log --raw` bez `-z`) poza zakresem, zakładając osobny mechanizm. Sprawdzone teraz
bezpośrednio: `git log --raw` na pliku `café.js` drukuje `:000000 100644 ... A	"src/caf\303\251.js"` —
dokładnie ten sam oktalnie-eskejpowany bajtowy śmieć co w G4, tylko tutaj zasila CAŁĄ warstwę historyczną:
co-change (`state.pairSup`/`fileCommits`), filebirth (`newFile`), author concentration i lifecycle replay
(`state.lc`/`state.vev`, kluczowane po ścieżce) — dla każdego repo z jakąkolwiek nie-ASCII nazwą pliku
gdziekolwiek w historii, nie tylko w bieżącej zmianie.

**Mechanizm.** Identyczny jak G4: `core.quotePath` domyślnie włączone, `git log --raw` bez wyłączenia
quotowania cytuje i oktalnie eskejpuje nietypowe bajty w ścieżce.

**Poprawka — inna niż G4, prostsza.** `-z` przy `--raw` zmienia format: separator rekordów staje się `\0`
zamiast `\n`, a rename rozbija się na TRZY osobne pola `\0`-terminowane (`:tryby... Rxxx\0<stara>\0<nowa>\0`)
zamiast jednej linii `Rxxx\t<stara>\t<nowa>`. `walk()` czyta strumień liniowo przez `readline` — przejście na
`-z` wymagałoby przebudowy całego parsera streamującego (linie nagłówka commita nadal kończą się `\n`,
wpisy raw kończyłyby się `\0` — mieszany separator w jednym strumieniu). Zamiast tego: `-c
core.quotePath=false` w tym samym wywołaniu `spawn('git', ...)` — zweryfikowane bajt w bajt, że daje
`src/café.js`/`src/café2.js` (surowe, prawdziwe) przy DOKŁADNIE tym samym formacie linii/tabulacji co dziś —
zero zmian w regexach parsujących. Audyt całego silnika (`grep` po `execFileSync('git'`/`spawnSync('git'`/
`spawn('git'` w `grain.mjs` i `history.mjs`) potwierdza: to JEDYNE pozostałe miejsce podatne — wszystkie
inne albo już używają `-z` (`headTree`'s `ls-tree`, `gitNameOnly` po G4), albo nie parsują ścieżek z wyjścia
gita w ogóle (podają własne znane ścieżki jako argumenty, korelują po indeksie tablicy, nie po tekście).

**Test czerwony→zielony.** Fixture: repo z plikiem `café.js` (lub inną nie-ASCII nazwą), kilka commitów
budujących realny co-change/filebirth. Czerwony dziś: `state.fileCommits`/`state.pairSup`/`state.lc` kluczowane
pod oktalnie-eskejpowanym śmieciem, prawdziwa ścieżka nigdzie nie występuje — `report`/`where` nie mówią nic
sensownego o tym pliku mimo realnej historii. Zielony: klucze niosą prawdziwą ścieżkę, co-change/filebirth
działają jak dla pliku ASCII.

**Priorytet: wysoki mimo wąskiej krotności (0 repozytoriów z bug bounty — nie trafiło, bo żadne z 18 nie miało
nie-ASCII nazwy pliku w historii akurat na tyle często by ujawnić).** Znalezione przez własny audyt po
zamknięciu G4, nie przez bug bounty — każdy realny projekt z jednym plikiem o nazwie zawierającej znak
diakrytyczny/CJK/cyrylicę w całej historii traci dla niego dokładność co-change/filebirth/autorstwa.

### Niepotwierdzone przy moim ponownym przeglądzie

Brak. Wszystkie 49 znalezisk wytrzymało własną weryfikację źródłową (każdy cytowany plik:linia przeczytany
przeze mnie) i wyrywkową reprodukcję na żywo (G1, G3, G6 — od zera, trafione co do bajta). Dwa doprecyzowania,
nie odrzucenia: (a) w G9 raport zgadywał ważenie przeżyciem — prawdziwy mechanizm to asymetria członkostwa
niejednoznacznego, ustalona przeze mnie w `mine()`/`export.mjs` i opisana wyżej; (b) w G22 zachowanie okazało
się świadomą decyzją projektową (komentarz w kodzie), co nie zmienia werdyktu — przegrywa z blankietową
gwarancją dokumentacji, rozstrzygnięcie w bilecie.

### Kolejność G

1. **G1, G2** — crashe: G1 (7 repozytoriów, najkrótsza ścieżka od realnego pliku do exit 1 + utrata całej
   partii `review`), potem G2 (duże repozytoria w ogóle nie mogą zbudować indeksu).
2. **G3, G4, G5** — złamane gwarancje o szerokiej krotności: G3 (7 repo, fabrykacja katalogów + kontrakt
   isError), G4 (7 repo, cicha utrata pokrycia `review`), G5 (4 repo, fałszywe odrzucenia poprawnego wejścia).
3. **G6** — korupcja indeksu z jednego symbolu; wąska krotność, ale skutek warstwowy.
4. **G7, G8** — kontrakt wyjścia `check` (te same ścieżki kodu, robić razem; G8 domyka martwą gałąź, którą G7
   musi obsłużyć w JSON).
5. **G9, G10, G11** — zaufanie do liczb i atrybucji: mianowniki (G9), in-change/pre-existing (G10),
   spójność architektury check↔report (G11, domyka C1a).
6. **G12, G13** — uczciwość świeżości i flag (`--no-history`, unshallow).
7. **G14–G22** — pozostałe wrong-output pojedynczej krotności; G15+G16 razem (jedna rodzina regexów
   klasy A2), G17 przy okazji wspólnego bumpa `EXTR_V` z G1/G15/G16; bumpy `EXTR_V` i `MODEL_V` wykonać RAZ,
   na końcu partii, po zielonych testach wszystkich biletów, które ich wymagają.

### Wykonanie — ✅ CAŁA PARTIA G ZROBIONA, zweryfikowana niezależnie

Wszystkie 22 bilety (G1–G22) zaimplementowane w dokładnie tej kolejności, jeden subagent sonnet na bilet (G7+G8
i G15+G16 razem, zgodnie z „Kolejność G" powyżej), każdy z red→green odtworzonym przeze mnie osobiście — nie na
słowo subagenta: diff przeczytany, poprawka cofnięta punktowo (nigdy `git checkout` na cały plik — raz się
pomyliłem przy G2, plik odtworzony ręcznie z tego samego diffu, zweryfikowany bajt w bajt), realny czerwony wynik
potwierdzony, poprawka przywrócona, pełny zestaw uruchomiony po każdym bilecie.

**Wspólne bumpy wykonane przeze mnie, po zielonym świetle wszystkich biletów, których dotyczyły:**
- `MODEL_V`: m14 → m15, po G6 (kolizja `Object.prototype`) + G9 (inflacja `established`) + G11 (spójność
  `moduleOf`) — wszystkie trzy zmieniają zawartość modelu.
- `EXTR_V`: g23 → g24, po G1 (iteracyjny `walk`) + G15 (Rust `struct_expression`/`mod`) + G16 (PHP phantom
  method) + G17 (goły CR w Kotlinie) — wszystkie cztery zmieniają wynik ekstrakcji.

**G23** dopisany przy okazji G16 jako podejrzenie bez potwierdzonego repro — świadomie odłożony (patrz wyżej).

**Wynik końcowy: 1109/1109 testów, zero regresji**, licząc od 1033/1033 na starcie tej partii (76 nowych testów,
po co najmniej jednym na bilet, każdy red→green). Nic niescommitowane w trakcie całej partii.

---

## H — Co grain widzi, a nie mówi: runda 3, po 0.2.1

> **Status: ZASTĄPIONE przez sekcję J** (lista do zrobienia); H zostaje jako źródło uzasadnień. Mapowanie H→J na końcu J.

Trzy źródła: własny audyt danych zbieranych i nieczytanych (każde „sprawdzone" niżej to grep po kodzie, nie
domysł), rozkmina „co matematyka na całej populacji i całej historii daje agentowi, czego nie da grep + otwieranie
plików po kolei", oraz pytanie o gotowe wycinki kodu. Zasada jak w C/E: `mine()` nietknięte — nowy fakt idzie
tą samą rurą albo równoległym testem akceptacji na wyeksportowanych prymitywach (`kt`, `CFG.lambda`).

**Fundament rozkminy.** Grep i Read dają instancje. Instancje nie dają pięciu rzeczy: populacji (ile z ilu i gdzie
kończy się populacja), nieobecności („nikt tu tego nie robi" vs „nie dotyczy"), czasu (który z dwóch wzorców
wygrywa, kiedy reguła się zaczęła), korelacji (co zmienia się razem) i struktury bez nazw (podobieństwo bez
wspólnego słowa). Każda pozycja niżej siedzi w jednym z tych pięciu miejsc. Ściana, uczciwie: znaczenie, typy
rozwiązane semantycznie, runtime — tam agent musi czytać; grain zastępuje czytanie dwunastu plików, żeby zgadnąć
który jest dobry, i czytanie historii, której nikt nie czyta.

**Hooki świadomie odłożone (H15) na wyraźne życzenie — reszta to silnik i komendy.**

### H1 · Recepta w `review`: „dodałeś `@Controller` bez `*.module.ts`" — NIEZROBIONE

`markerImplied` (companion po pniu, rejestracja, filebirth) jest konsumowane WYŁĄCZNIE w kartach `where`
(sprawdzone: `core.mjs` ~1792/1801, zero użyć w `grain.mjs`). `review` zna nowe pliki zmiany, zna markery, które
niosą, zna receptę — nie składa tego. Poprawka: dla każdego nowego pliku będącego carrierem markera z receptą,
sprawdzić w zbiorze zmiany + drzewie, czy companion istnieje i czy plik rejestrujący został dotknięty; jedna linia
w stylu `completeness`. Dane i próg gotowe. **Priorytet 1** — to, co `completeness` robi dla historii, dla struktury.

### H2 · Placement z historii poprawek: „repo przenosiło takie pliki stąd tam 7 z 9 razy" — NIEZROBIONE

`walk()` (`history.mjs`) ma zdarzenia rename z `oldPath`, użyte wyłącznie do przeniesienia cyklu życia w `replay()`
(sprawdzone). Nikt nie agreguje: dla sufiksu+tokenu nazwy (te same `sufOf`/`nameTokens` co `placementHit`),
skąd-dokąd pliki były przenoszone i ile razy. To nota placement z najmocniejszym możliwym dowodem — repo samo
poprawiało ten błąd. Grep nie widzi przenosin w ogóle. Ten sam próg akceptacji na parach (katalog źródłowy,
katalog docelowy) per klucz nazwy; drukowane w `placementHit` obok liczby kin („a 4 z 5 urodzonych tutaj zostały
później przeniesione do X/"). Wymaga nowego pola w replay state → bump `HIST_V`. **Priorytet 2.**

### H3 · Koszt odchylenia: fixy i churn per wartość — NIEZROBIONE

`history.mjs:129` liczy per zakres commity-fixy (`L.fix`, po `FIX_RE`) i churn (`L.churn`, modyfikacja w 14 dni od
narodzin) — `core.mjs` nie czyta żadnego z nich (sprawdzone: zero wystąpień `.fix`, `held` liczy tylko
`repairs`/`departures` z wartości, nie z fixów). Każdy fakt ma `conform` i `deviants`. Test: częstość fixów
(i churnu) u konformujących vs u dewiantów, ten sam KT, mówione tylko po przejściu progu: „dewianci tej reguły
dostają fixy 3× częściej (9 z 12 vs 11 z 140)". Zmienia definicję konwencji z „większość" na „większość, której
złamanie boli". Klauzula w `report`/`rules`/`check` obok `authorConcClause`. Bez bumpa (`H` ma dane, model dostaje
nowe pole per fakt → `MODEL_V`). **Priorytet 3.**

### H4 · Bliźniacy strukturalni: ten sam szkielet, inna nazwa lub katalog — NIEZROBIONE

Dwie grupy (także w różnych partycjach) o identycznym lub prawie identycznym szkielecie superpozycji, różniące się
tylko sufiksem nazwy albo katalogiem (`*Dto` w module A, `*Model` w module B). Jedyna rzecz z tej listy, której
żadna ilość grepowania nie odtworzy — brak wspólnego słowa do szukania. Medoidy i szkielety są w modelu;
porównanie szkieletów między grupami to jedna pętla (odległość edycyjna na ciągu typów węzłów, próg jak przy
grupowaniu). Wynik w `report`: „rozdwojona konwencja: grupy X i Y są strukturalnie jedną populacją, nazwaną dwa
razy". Bez zmiany modelu, jeśli liczone przy renderze. **Priorytet 4.**

### H5 · Kompletność między grupami: „11 z 12 handlerów ma spec, `Foo` nie ma" — NIEZROBIONE

Uogólnienie companion po pniu: dla każdej pary grup (A, B) w partycji test, czy członek A ma odpowiednik w B po
pniu/tokenie nazwy; para, która przejdzie próg, staje się faktem „członek A ma odpowiednik w B (share)", a
brakujące odpowiedniki listą w `report` i w `where` na karcie A. Odpowiada na „które rzeczy nie mają testów" —
pytanie z każdej sesji — bez żadnej wiedzy o tym, czym jest test (kod to kod: grupa B jest po prostu grupą).
**Priorytet 5.**

### H6 · Nowe predykaty tą samą rurą — NIEZROBIONE

Cztery, każdy generyczny z AST, bez słowników:
- **sufiks nazwy** (`auto.namesuffix`, brak — sprawdzone): ostatni token nazwy po `nameTokens`; „typy w tej grupie
  kończą się na `Handler`". Najczęstsza konwencja, jakiej agent szuka. Dotyka C5 (wartości, nie nazwy) — tu sufiks
  JEST wartością kategoryczną, więc nie wymaga rundy projektowej C5.
- **porządek i grupowanie importów** jako warstwa leksykalna (`auto.lex:` ma dziś bom/decl/directive/indent/quote/
  semi — sprawdzone): posortowane? pogrupowane pustą linią zewnętrzne/wewnętrzne? Agenci psują to w każdym pliku.
- **modyfikatory per zakres** (`private`/`static`/`async`/`export`): dziś czytane tylko jako nośnik atrybutów.
- **kolejność członków w typie** (pola → konstruktor → publiczne → prywatne): sekwencja kategorii jako wartość.
`EXTR_V` bump (wspólny dla całej czwórki). **Priorytet 6.**

### H7 · Wyjątek jako decyzja (`seed waive`) i feedback dla `check` w wersji CLI — NIEZROBIONE

- **`seed waive <path>#<name> --on <pid> --note`** — brak (sprawdzone). SKILL każe agentowi „powiedzieć w jednej
  linii, czemu nie"; nikt tego nie zapisuje, jedyną formą jest 15-minutowe milczenie TTL. Zapis w `seeds.jsonl`
  obok steerów i granic; `check` na tym zakresie mówi „celowe odstępstwo (decyzja, kto, kiedy, dlaczego)" zamiast
  odchylenia; `report` liczy waivery per konwencja — konwencja z wieloma waiverami jest podejrzana.
- **feedback dla `check`** — brak (sprawdzone), wzór z E6: `check` zapisuje ustalenia jako pending
  (`.grain/cache/check-pending.json`, klucz plik+fakt), kolejne `check`/`review` tego samego pliku rozstrzyga
  „zniknęło / zostało"; `status` drukuje „check notes acted on: N of M" i listę konwencji najczęściej ignorowanych.
  Bez hooka sygnał odpala się tylko, gdy agent sam pyta — mierzy mniej, ale dalej odpowiada na pytanie, które reguły
  są ignorowane po ostrzeżeniu. **Priorytet 7.**

### H8 · Odrzucone wzorce — lustro nucleation — NIEZROBIONE

`held` liczy `departures`/`repairs` per fakt z `vev` (sprawdzone), ale nikt nie pyta w poprzek zakresów: „wartość B
próbowano w N miejscach i cofnięto do A w M". Nucleation wykrywa wzorzec wschodzący; jego lustro — wzorzec
odrzucony — to steer, który repo już podjęło samo. Klauzula w `report` i na karcie `where`: „`B` próbowano tu
4 razy, każdorazowo cofnięte — nie jest to alternatywa, jest to odrzucenie". Render z istniejących danych, bez bumpa.
**Priorytet 8.**

### H9 · Egzemplarz kanoniczny z uzasadnieniem; udział agentów per fakt — NIEZROBIONE

- Ranking egzemplarza mówi dziś „ten", nie „dlaczego ten". Kryteria są w danych: konformuje na wszystkich faktach
  grupy, pierworodny wzorca (`L.first` najwcześniejszy), zero churnu, ostatnio wzmocniony, autor-człowiek. Jedna
  linia: „kopiuj ten — zaczął ten wzorzec i nie potrzebował poprawki od tamtej pory".
- `agentLast` jest per zakres, `agentShare` globalnie. Brakuje per fakt: „ta konwencja jest w 70% trzymana przez
  kod napisany przez agentów w ostatnich 90 dniach" — ostrzeżenie, że norma, którą agent chce skopiować, jest komorą
  echa. Grep nie zna autorstwa; grain ma je i milczy. **Priorytet 9.**

### H10 · Trzy rozszerzenia istniejących testów na inne populacje — NIEZROBIONE

- **(rola, moduł)** jako komórka w `architectureNorms` obok (moduł, moduł): „handlery nigdy nie sięgają infra",
  niezależnie od katalogu. Ten sam kod, inna funkcja przypisania. `MODEL_V`.
- **co-change per zakres** — `vev` ma czas per zakres, co-change liczy się per plik; ostrzejsze, wymaga capu na
  pary (te same `cochangeMinSup`/`megaCap`). `HIST_V`.
- **fan-in per symbol** — warstwa relacji rozwiązuje referencje dla 13 języków (krawędzie: wyłącznie `import`/
  `path` — sprawdzone), model trzyma plik→plik. „Ta funkcja jest wołana z 47 plików w 6 modułach; sąsiednia
  z jednego" — grep daje trafienia tekstowe z fałszywymi, grain rozwiązane; agent bez LSP nie ma nic pomiędzy.
  Wymaga referencji per symbol w `relFactsFor` — największa z trójki. **Priorytet 10.**

### H11 · Diff szkieletu w `check` — NIEZROBIONE

`check` mówi o predykatach (dekorator, nazwa, import). Nie mówi: „każdy członek tej grupy ma blok catch w slocie 3,
twój nie ma". Szkielet grupy (superpozycja: część wspólna + sloty) jest w modelu; brakuje porównania KSZTAŁTU
nowego zakresu z szkieletem grupy, do której został przypisany — brakujący wspólny slot to odchylenie strukturalne,
nie faktowe. Wymaga mapowania slot↔węzeł w `skelOf` (jedyne miejsce, gdzie ten refaktor jest jeszcze potrzebny po
odrzuceniu H13). **Priorytet 11.**

### H12 · `grain selftest` i domknięcie kalibracji B1 — NIEZROBIONE

`mutate-test` istnieje jako nieudokumentowany dev harness (`grain.mjs:586` — sprawdzone): sadzi odchylenia
w egzemplarzach i mierzy wykrycie, fałszywe odpalenia, ciche OK. Po bug bounty najważniejsza lekcja brzmi: groźne
jest ciche fałszywe „czysto". `grain selftest` drukujący precyzję i odsetek fałszywych alarmów NA TYM REPO, jedną
linią, udokumentowany — zamienia to w publiczną liczbę, którą utrzymujący może obserwować między commitami. B1
(kalibracja korpusowa rankingu `where`) wciąż na dwóch repozytoriach z zerem trafień — E5 dalej na tym stoi.
**Priorytet 12.**

### H13 · Wycinki kodu „pasujące do miejsca" — ODRZUCONE w tej formie (decyzja utrzymującego); zostaje H13′

**Pytanie.** Czy grain może dać gotowy wycinek pasujący do miejsca, które agent chce edytować?

**Odpowiedź: tak, w trzech uczciwych formach, wszystkie z jednego źródła — kodu, który w repo już jest.** Grain nie
ma semantyki i nie może napisać ciała; ma za to (a) medoid i egzemplarze z liniami, (b) superpozycję: które sloty
szkieletu są wspólne, a które per-instancja, (c) fakty (dekorator, baza, importy, kształt nazwy, pierwsza instrukcja,
arność), (d) listę własnych odchyleń egzemplarza, (e) receptę (companion, rejestracja), (f) sąsiadów w tym samym
pliku. Z tego składa się wycinek bez żadnej syntezy:

1. **Egzemplarz oczyszczony.** Tekst zakresu medoidu (linie `line..endLine`, plik z dysku, parse jak w `checkFile`)
   z per-instancyjnymi slotami superpozycji zastąpionymi placeholderami (`«name»`, `«route»`), a własnymi
   odchyleniami egzemplarza (grain je zna — `deviants` per fakt) USUNIĘTYMI lub oznaczonymi „to jego, nie grupy".
   Adnotacje z faktów obok: „nazwa PascalCase z sufiksem Handler", „`@Injectable()` 12/12", „extends Base 11/12".
   Wymaga jednej zmiany w silniku: `skelOf` musi zwracać referencje węzłów per slot (dziś zwraca sam ciąg), żeby
   slot superpozycji dało się zmapować na zakres bajtów w źródle. Liczone przy zapytaniu z dysku — model bez zmian.
2. **Nagłówek importów dla nowego pliku.** `auto.imp:` fakty grupy/katalogu to dokładne ciągi; z porządkiem
   importów (H6) — gotowy, mechanicznie pewny blok importów. Najbardziej niezawodny wycinek z możliwych.
3. **Dopasowanie do miejsca edycji.** Dla edycji ISTNIEJĄCEGO pliku: sąsiad z tego samego pliku (ten, którego
   `check` już nazywa „In this file, x conforms") jako szablon — zero niezgodności importów i stylu. Dla nowego
   carriera z receptą: linia rejestracji z pliku rejestrującego (istniejący wpis z zamaskowaną nazwą) — konkretna
   edycja w INNYM pliku, o której agent nie wie, że jest potrzebna.

**Gdzie to się psuje i jak nie kłamać.** Pokrycie superpozycji (`~39% of an average member` na realnym repo)
mówi, ile tekstu medoidu jest naprawdę wspólne. Przy niskim pokryciu „szablon" to w większości logika biznesowa
medoidu — dokładnie pułapka, przed którą SKILL ostrzega („not to copy"). Reguła: wycinek tylko przy pokryciu ≥ próg
(do kalibracji; kandydat 0.6), poniżej — tylko nagłówek importów i wskaźnik na egzemplarz z linią. Zawsze
z pokryciem drukowanym obok („ten wycinek to 71% wspólnego kształtu grupy, reszta to twoje").

**Napięcie z tożsamością produktu.** SKILL: „nie zastępuje czytania jednego dobrego egzemplarza — zastępuje
zgadywanie, który". Wycinek przesuwa z „wskazuję" na „podaję" i zaprasza do ślepego kopiowania. Rozstrzygnięcie:
wycinek ZAWSZE obok wskaźnika, nigdy zamiast; tylko część wspólna; własne odchylenia egzemplarza wycięte. Wtedy to
nie nowa zdolność, tylko ten sam egzemplarz podany bez kroku Read i bez jego przypadkowych części — kod to kod.

**Rozstrzygnięcie: nie budować.** Policzone, ile w tym nowej informacji, a ile zaoszczędzonego jednego Read:
jedyna unikalna wiedza („które linie egzemplarza są jego własnym odchyleniem") już jest w produkcie (`not to copy:`,
`check --all`); pokrycie superpozycji na realnym repo (39%, 13%) degraduje uczciwą wersję do „importy + wskaźnik"
niemal zawsze; wycinek nigdy nie da kontekstu (sąsiedni kod, komentarze, semantyka), który daje przeczytanie
pliku. Koszt (refaktor `skelOf`, slot↔bajty, próg do kalibracji) nieproporcjonalny. Niech agent czyta.

**H13′ · Precyzja wskaźnika — NIEZROBIONE, mały.** Żeby Read był jeden i celny: `where`/`check` drukują
`plik:od–do` (grain ma `endLine`, dziś drukuje samą linię startu) oraz, gdy egzemplarz ma własne odchylenie,
„w tym egzemplarzu pomiń linię N — to jego własne odchylenie, nie konwencja" (z `deviants` per fakt, przy
renderze). Zero syntezy, zero progu, zmiana w renderze kart i w `In this file, x conforms`. Priorytet: przy H9
(egzemplarz kanoniczny — ta sama linia karty).

H11 (diff szkieletu w `check`) zostaje osobno, na własnych zasadach — nie zależy już od H13.

### H14 · Ściany, które da się przesunąć tylko nową warstwą — DECYZJE

- **Call-graph.** Krawędzie to wyłącznie `import`/`path` (sprawdzone). „Serwisy wołają repozytorium, nigdy DB
  wprost" jest poza zasięgiem bez rozszerzenia warstwy relacji o rozwiązane wywołania. Duża, osobna runda.
- **Gramatyki struktury (JSON/YAML/TOML) — wariant D8 z twistem.** Pliki konfiguracyjne są dziś niewidoczne poza
  co-change. „Każdy `package.json` tu ma skrypt `test`" jest konwencją tak samo jak dekorator, a tree-sitter ma te
  gramatyki. To nie kolejny język programowania, tylko język struktury — najbardziej opłacalny wariant D8, wciąż
  decyzja utrzymującego (rozmiar paczki, zestaw gramatyk).

### H15 · Hooki — ODŁOŻONE na wyraźne życzenie, zapisane, żeby nie zginęły

- PreToolUse na Bash z `git commit` → `review --staged`: SKILL każe odpalić `review` przed „gotowe", nic tego nie
  egzekwuje (hooki dziś: SessionStart, PostToolUse Edit|Write|MultiEdit, PreToolUse Write — sprawdzone).
- PostToolUse na Read, mówiący WYŁĄCZNIE gdy czytany plik jest dewiantem swojej grupy („nie kopiuj z tego pliku X").
- PreToolUse na Edit: partnerzy co-change przed edycją, nie po.
- Recepta CI (nie hook): `review --range origin/main..HEAD --json` jako komentarz do PR — przepis w docs, nie silnik.

### Kolejność H

1. **H1** — dane i próg gotowe, jedna pętla w `review`.
2. **H2, H3** — martwe dane z historii (rename, fixy) zamienione w najmocniejsze dowody, jakie grain może mieć.
3. **H4, H5** — dwie rzeczy, których grep nie odtworzy: struktura bez nazw, nieobecność między grupami.
4. **H6** — cztery predykaty, jeden wspólny bump `EXTR_V`.
5. **H7, H8, H9** — decyzje, feedback, zaufanie do egzemplarza.
6. **H10, H11** — rozszerzenia populacji, kształt w `check`. H13 odrzucone; H13′ (precyzja wskaźnika) przy H9.
7. **H12** — selftest i B1.
8. **H14** — decyzje utrzymującego. **H15** — gdy hooki wrócą do gry.

---

## I — Przestrzeń, nie punkt: plan implementacji

> **Status: ZASTĄPIONE przez sekcję J** (lista do zrobienia); I zostaje jako źródło uzasadnień. Mapowanie I→J na końcu J.

Cel: agent świadomy przestrzeni, w której operuje — od ogółu (mapa systemu) do szczegółu (punkt), poziomo (plaster
zmiany w poprzek warstw) i w głąb (wartości). Trzy nowe jednostki indeksu — **zmiana** (commit jako obiekt
z odciskiem), **koncept** (słowo repo i jego rozmieszczenie), **wartość** (literały, człony enumów jako
konkordancja) — przy tej samej matematyce: KT, MDL, λ=8, zero nowych stałych, zero semantyki, zero modelu.

**Stan wyjściowy (sprawdzone w kodzie, nie z pamięci):**
- `history.mjs` replay state trzyma wyłącznie agregaty: `msgAff` (token→plik), `msgAffEx`, `msgTokCommits`,
  `pairSup`, `fileCommits`, `lc`, `vev`, `prevState`, `blobShas`. **Commit jako obiekt z własnym odciskiem nie
  istnieje** — `replay()` składa każdy commit natychmiast.
- Krawędzie relacji to poziom **importu**: ekstraktory emitują kandydatów `path`/`symbol`, rozwiązywanych do krawędzi
  `kind: 'import'`; nagłówek `relations.mjs` („import | call | extends | …") opisuje pełny zestaw Yggdrasila, nie to,
  co grain z niego bierze. Fan-in per symbol i call-graph nie istnieją.
- Wartości: jedyne ślady to `decoLits` (stringi z argumentów dekoratorów, do `doc`) i `macroDefs`. Żadnej
  konkordancji literałów ani członów enumów.
- Most językowy `msgAffinity`: `n >= 2` i demote fillerów po df — **bez testu akceptacji** (B1 wciąż otwarte).
- Hooki: SessionStart, PostToolUse (Edit|Write|MultiEdit), PreToolUse (Write). Żadnego na prompt użytkownika.

**Bramka go/no-go na całą sekcję: I2b.** Jeśli plaster z przykładu nie bije grepa na własnej historii Johna Briefa
(leave-one-out), reszty (I3–I8) nie budujemy. Dlatego kolejność zaczyna się od najtańszego dowodu, nie od
najładniejszej warstwy.

### I1 · Odciski commitów w replay state — NIEZROBIONE

**Co.** `history.mjs`: `replay()` zapisuje per commit (poza mega-commitami — ten sam `CFG.megaCap`, ta sama bramka co
`pairSup`) rekord `{ sha, ts, author (hash — jak dziś), agent, fix, toks, files, scopes }`, gdzie `toks` = te same
≤12 znormalizowanych tokenów, które już liczą `msgAff`; `files` = `fs2` (już policzone dla par); `scopes` = klucze
`path#kind#name[#ord]` zakresów urodzonych lub zmienionych w tym commicie (dostępne w tej samej pętli: `curM` vs
`prev`, `bh` różne). Nowe pole `state.fps` (tablica w porządku spaceru; rename-safe, bo klucze zakresów są
przenoszone dokładnie tak, jak `lc`/`vev`). `toH` eksponuje `H.fps`. Cap: ostatnie 20 000 commitów (log gdy obcięte
— „no silent caps").

**Dlaczego bez modułów/grup.** Moduł i grupa to pojęcia `learn()` (`refineModOf`, `part.assignments`); historia
zostaje niezależna od języka i od modelu — mapowanie ścieżek/kluczy na komórki robi konsument przy zapytaniu.

**Bump.** `HIST_V` h6→h7 (pełny re-walk; tylko świeży spacer może wypełnić odciski).

**Test.** Fixture z N commitami: `H.fps` ma po jednym rekordzie na commit nie-merge ≤ megaCap, z właściwymi plikami
i kluczami zakresów; rename przenosi klucze; incremental ≡ full bajt w bajt (istniejący wzorzec testu
determinizmu). **Priorytet 1** — warunek wszystkiego poniżej.

### I2 · `grain slice <intent>` — zmiana przez przykład — NIEZROBIONE

**Co.** Nowe `sliceCmd({ model, H, query, top })` w `core.mjs` + `cmdSlice` w `grain.mjs` (dispatch, USAGE, `--json`).
Algorytm:
1. tokeny intencji: `tokenize`+`normTok` minus `QSTOP`;
2. wynik per odcisk: pokrycie tokenów commita (`toks`) i tokenów nazw dotkniętych plików (`nameTokens` ścieżek —
   commit dotykający `user-status.ts` pasuje do „user status"), ważone IDF po commitach (`msgTokCommits` = df,
   ten sam `filler` co `msgAffinity`);
3. top K=5 commitów powyżej progu pokrycia (ten sam „weak match" próg co `where`: 0.34); zero → mapa `where`
   i linia mostu, nic zmyślonego;
4. agregacja miejsc: per plik `k/K` (w ilu z K pasujących zmian), moduł (`refineModOf`), zakresy z przykładu
   (commit nr 1), czy plik nadal istnieje (rename → nowa ścieżka z `lc`); do tego istniejąca linia
   `completenessDirectional` dla zbioru.

**Wyjście.** `«add user status» → 3 past changes match, e.g. abc1234 "add SUSPENDED status" (2026-05)` · `places
such a change touched:` lista `plik (k/K) — module · scopes: …` · `(evidence: K matching commits — an example,
not a certified archetype; see I6)`. Uczciwość: przy K=5 nie ma testu KT — drukujemy liczby, nie twierdzenia;
certyfikacja przychodzi w I6.

**Test.** Fixture z sekwencją „add status X" (3 commity, każdy dotyka enum + dto + fixture + test): `slice "add
status"` listuje te 4 pliki z 3/3 i nazywa przykład; intencja bez pasujących commitów → mapa, zero miejsc;
determinizm. **Priorytet 2.**

### I2b · Bramka: plaster vs grep, leave-one-out na własnej historii — NIEZROBIONE

**Co.** Harness deweloperski `grain slice-eval [--last N]` (jak `mutate-test`): dla każdego z ostatnich N commitów
C (≤ megaCap): intencja = tokeny wiadomości C, zbiór odcisków BEZ C, przewidziane miejsca = wynik I2; prawda =
pliki C. Metryki: precyzja/pokrycie plików, oraz **baseline grep**: pliki HEAD zawierające ≥1 token intencji
(prosty `includes` po treści + nazwie). Raport: średnia P/R plastra vs grepa, N, ile intencji bez dopasowania.

**Kryterium.** Na Johnie Briefie (N=100): pokrycie plastra ≥ pokrycie grepa przy precyzji ≥ 2× grepa — inaczej
sekcja I zatrzymuje się na I2 i wpis w planie mówi dlaczego, z liczbami. **Priorytet 3 — bramka.**

### I10 · Most językowy z testem akceptacji (domyka B1) — NIEZROBIONE

**Co.** `model.msgAffinity` dziś: `n >= 2` + demote fillerów. Zamiana na KT: dla tokenu t (df = `msgTokCommits[t]`)
i pliku f dotkniętego w k z tych commitów, przy stopie bazowej `fileCommits[f]/commitsN` — komórka 2-wartościowa
jak `_all` w `mine()`: bits > 0 i (k+½)/(df+1) ≥ 1−1/λ względem bazy. Ten sam kod danych co `architectureNorms`
(reuse). Filler znika jako lista — token o wysokim df po prostu nie kompresuje. Bez bumpa (render z `H`).

**Dlaczego przed I5.** Karta konceptu i archetypy stoją na moście; most bez testu to dredging.

**Test.** Token współwystępujący z plikiem na poziomie stopy bazowej → brak mostu; token realnie związany → most;
istniejący test `history bridge` bez regresu. **Priorytet 4.**

### I3 · Konkordancja wartości — NIEZROBIONE

**Co.** `extractScopes`: per plik zbiera `vals = [{ v, k: 'enum'|'str', line, c }]` — człony enumów (dzieci
identyfikatorowe węzłów o segmencie `enum`, `wordBounded`), literały stringowe ≤40 znaków spoza importów
(już chodzone dla `auto.lex:quote`), `c` = hash węzła-kontenera (ciało enuma, `switch`, literał obiektu) do
rodzeństwa; dedupe, cap 200/plik. Na zakresie plikowym, w `serializeScope` (cache drzewa).
`learn()`: `model.valueIndex`: wartość → `[{ rel, line, k }]` tylko dla wartości z df plików w [2, 20% plików]
(progi mocy, do rezyduum); `model.valueSiblings`: kontener → członkowie (enum = rodzeństwo z definicji; literały =
współwystępowanie w jednym kontenerze). Cap 20 000 wpisów, log gdy obcięte.

**Bump.** `EXTR_V` g24→g25 (vals w cache ekstrakcji), `MODEL_V` m15→m16 (indeksy w modelu — wspólny bump z I6).

**Test.** Fixture: `enum UserStatus { ACTIVE, SUSPENDED }` + literały w 3 plikach: `valueIndex.SUSPENDED` ma 4 miejsca,
rodzeństwo zawiera ACTIVE; wartość w jednym pliku nie wchodzi; wartość w 60% plików nie wchodzi. **Priorytet 5.**

### I4 · Dryf: pozioma kompletność rodzeństwa — NIEZROBIONE

**Co.** `siblingDrift(model, container)` w `core.mjs`: dla zbioru rodzeństwa S, „oczekiwane pliki" = te, w których
występuje ≥ ⌈|S|·2/3⌉ członków (ten sam próg 2/3 co `placementHit`/`altMarkerFor`); dla każdego v ∈ S: brakujące =
oczekiwane − miejsca(v); mówione tylko gdy oczekiwanych ≥ `CFG.minRaw` i test λ nad (obecne : brakujące) NIE
przechodzi na korzyść obecności (czyli v realnie nie jest tam, gdzie rodzeństwo). Bez tytułu „najnowszy" — o tym,
co dodano ostatnio, mówi przykład z I2.
**Ujście w `review`**: wartość obecna w zmienionych plikach, należąca do kontenera z rodzeństwem, z brakującymi
oczekiwanymi plikami poza zmianą → linia `you added \`ARCHIVED\` to \`UserStatus\`; its siblings also appear in:
i18n/en.json, fixtures/users.ts — not in your change`. To jest odpowiedź na „dodaj status".

**Zależność.** Pliki JSON/YAML/TOML są niewidoczne bez gramatyk struktury (I11) — do tego czasu dryf obejmuje
tylko pliki kodu; linia mówi to wprost („N config files not indexed").

**Test.** Enum z 3 członami, każdy w 3 innych plikach; 4. człon dodany tylko w enumie, niescommitowany: `review`
wymienia 3 brakujące pliki; wartość obecna wszędzie → cisza. **Priorytet 6.**

### I5 · `grain concept <words>` — karta konceptu — NIEZROBIONE

**Co.** W poprzek partycji: (a) deklaracje — zakresy o pasujących tokenach nazw (dane kart `where`);
(b) wartości — I3 po tokenach; (c) macierz koncept × moduł: per `refineModOf` liczba plików z trafieniem;
(d) commity — most (I10) + liczba odcisków I1 z tokenem + ostatnia zmiana; (e) rodzeństwo z I3; (f) fan-in plikowy
z `model.edges` dla plików deklaracji; (g) „zmiany tego konceptu wyglądają tak" = I2 dla tokenów konceptu.
Ranking tokenów = ten sam IDF co `where`; brak deklaracji i wartości → mapa/most, nigdy pusta karta udająca
wiedzę. `--json`.

**Test.** Koncept „status" w enumie (core), dto (api), teście: karta listuje moduły z liczbami, rodzeństwo, commity;
koncept nieobecny → mapa. **Priorytet 7.**

### I6 · Archetypy zmian — plaster z certyfikatem — NIEZROBIONE

**Co.** Odciski I1 → komórki: moduł (`refineModOf` ścieżki), grupa (`part.assignments[klucz zakresu]`), rodzaj.
Bag cech per commit = zbiór komórek. Klastrowanie tą samą aglomeracją MDL co `induceRoles` — uogólnić
`induceRoles` na dowolne elementy z `feats` i wagą (commity jako elementy, `jacW` z wagą 1 dla wszystkich cech).
Archetyp = medoid + profil; komórka **należy** do archetypu ⇔ test λ nad (członkowie z komórką : bez) — dokładnie
formuła danych `isAll` z `mine()` na komórce 2-wartościowej. Archetyp „wszędzie po trochu" (brak komórek
certyfikowanych) odpada sam.
`model.changeArchetypes = [{ id, label (top komórki), n, cells: [{ cell, k, share }], exemplars: [sha, msg],
toks }]`. I2 w górę: intencja → archetyp (tokeny + miejsca konceptu z I5) → komórki certyfikowane z udziałami,
potem przykład; wyjście rozróżnia „certified (k of n)" od „example". `report`: sekcja `== changes — N archetypes ==`.

**Bump.** `MODEL_V` (wspólny z I3).

**Test.** Fixture z dwoma kształtami zmian po 8+ commitów („add handler" = handler+dto+test; „add status" =
enum+dto+fixture+test) + commity-szum: dwa archetypy z właściwymi komórkami certyfikowanymi, szum poza; `slice`
przypisuje intencje do właściwych. **Priorytet 8.**

### I7 · Mapa L0 i session-context — NIEZROBIONE

**Co.** Warstwy z topologii: SCC (Tarjan już jest) zwinięte, porządek topologiczny, indeks warstwy = najdłuższa
ścieżka od liści — „layer 0: packages/core · layer 1: packages/infra · layer 2: apps/*" bez żadnej nazwy.
Słownik konceptów: top 15 tokenów po df commitów × df kart (po I10 — tylko tokeny z mostem). Archetypy (I6) w
jednej linii każdy. `grain map` + skompresowana forma w `sessionContext` (limit linii — budżet hooka).

**Test.** Graf 3-warstwowy → właściwe warstwy; session-context ≤ N linii z mapą; repo bez historii → mapa bez
archetypów, uczciwie. **Priorytet 9.**

### I8 · Kompletność plastra w `review` — NIEZROBIONE

**Co.** Odcisk bieżącej zmiany (pliki `reviewFileList` → komórki jak w I6) dopasowany do najbliższego archetypu
(`jacW`); brakujące komórki certyfikowane → linia `this change touches 6 of 9 certified cells of "add status"
(k of n); missing: i18n, fixtures`. Cisza, gdy brak archetypu powyżej progu dopasowania (ten sam 0.34).

**Test.** Zmiana częściowa → lista braków; kompletna → linia „complete"; zmiana bez archetypu → nic. **Priorytet 10.**

### I9 · Hook na prompt użytkownika → plaster — ODŁOŻONE (hooki zamrożone)

Zdarzenie hooka na wysłanie promptu (nazwę zweryfikować w aktualnej dokumentacji Claude Code przy implementacji —
nie zgadywać, tak jak D7): `grain slice-hook` czyta prompt ze stdin, tokenizuje, uruchamia I2/I6 z progiem;
wstrzykuje `additionalContext` tylko przy ≥1 archetypie certyfikowanym lub ≥2 pasujących commitach; supresja
TTL po zbiorze tokenów (`hook-seen.json`). To domknięcie lekcji z trialu 1: wyrocznia, która czeka na pytanie,
nie dociera do kodu. Wchodzi, gdy hooki wrócą do gry.

### I11 · Gramatyki struktury (JSON/YAML/TOML) — DECYZJA (= H14), warunek pełnego I4

Bez nich połowa plastra „dodaj status" (i18n, fixture w JSON, config) jest niewidoczna, a „kompletne" bywa
fałszywe. Rozmiar paczki i zestaw gramatyk — decyzja utrzymującego; do czasu decyzji I4 mówi wprost, ile plików
konfiguracyjnych pominięto.

### Poza zakresem tej sekcji (nazwane, żeby nie wróciły tylnymi drzwiami)

Semantyka („co robi zawieszenie") — nigdy. Call-graph i fan-in per symbol — osobna runda nad ekstraktorami
(H10), nie tu. Wycinki kodu — odrzucone (H13). Cross-repo — F2.

### Kolejność I

1. **I1** — odciski (warunek).
2. **I2 → I2b** — plaster z przykładu i bramka na Johnie Briefie. **Tu decyzja: dalej czy stop.**
3. **I10** — most z testem (domyka B1), zanim ktokolwiek na nim stanie.
4. **I3 → I4** — wartości i dryf; „dodaj status" dostaje wszystkie miejsca w kodzie (config po I11).
5. **I5** — karta konceptu (składa I1/I3/I10).
6. **I6 → I7 → I8** — archetypy, mapa, kompletność plastra. Bumpy: `HIST_V` przy I1, `EXTR_V` przy I3,
   `MODEL_V` raz po I6 — jak w G, na końcu partii, po zielonych testach.
7. **I9** gdy hooki wrócą; **I11** decyzja.

---

## J — Produkt doskonały: rozpiska zadań (zastępuje H i I jako listę do zrobienia)

Projekt: trzy osie (miejsce · rzecz · zmiana) + czas; cztery pytania agenta (`where` · `what` · `how` · `check`);
cztery głosy (praktykowane · zdecydowane · przykład · mapa) z jedną regułą; sześć momentów; utrzymujący dostaje
`report` · `rules` · `decide` · `status` · `export`; deweloper `explain` · `selftest` · `refresh` · `map`. Trzy indeksy
(zakresy · wartości · commity), jedna akceptacja (KT/MDL/λ), rezyduum na piśmie.

**Zasady obowiązujące każde zadanie poniżej (nie powtarzane w biletach):**
1. `mine()` nietknięte. Nowy fakt idzie tą samą rurą albo równoległym testem na `kt`/`CFG.lambda`; zero nowych
   stałych decyzyjnych — nowe progi MOCY (short-circuit) trafiają do `CFG` z komentarzem i do rezyduum w
   `docs/mathematics.md` (zadanie dokumentacyjne J8.1).
2. Kod to kod: żadnych list nazw języków, frameworków, ról. Węzły po `node-types.json` i `wordBounded`.
3. Każdy bilet: test czerwony na niezmienionym kodzie → zielony po; pełny zestaw po każdym; nic niescommitowane;
   bumpy `EXTR_V`/`HIST_V`/`MODEL_V` RAZ na fazę, po zielonych testach wszystkich biletów fazy, które ich wymagają.
4. Reguła głosów (J0.1) obowiązuje od chwili wdrożenia w KAŻDYM późniejszym ujściu.
5. Higiena: nazwy prywatnych repozytoriów i ścieżki z nich nigdy do plików commitowanych; liczby wolno.
6. README jest w trakcie edycji przez utrzymującego (UX) — zadania dokumentacyjne nie ruszają README bez
   uzgodnienia; SKILL/commands/reference tak, ale dopiero w J8.1, po kodzie.

### Faza 0 — Fundamenty (reguły, które wszystko potem ma spełniać)

#### J0.1 · Cztery głosy, jeden znacznik, jedna reguła — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Opus**

**Wykonanie.** `voice(kind, text, meta)` dodane w `core.mjs:737` (cztery gałęzie: practiced/decided/example/map, `default: throw`
na nieznany kind). Przepięto ~15 miejsc renderujących w `core.mjs` (deviantLine, placementHit, checkFile msgs/steerHits/
archHits, whereCmd steerLine/orphan-steer/karty file/group/marker/directory boundary, report printFact, rulesMarkdown row)
i jedno w `grain.mjs` (check-hook co-change linia). `sessionContext` świadomie wyjęte z reguły (SessionStart, nie
per-edycyjny hook). Zaktualizowano 4 istniejące testy pinujące stare kształty (`affinity`, `architecture`, `grain`,
`seed-baseline`) + nowy `voices.test.mjs` (6 testów). **Weryfikacja niezależna:** diff wszystkich 7 plików przeczytany
w całości, zgodny z briefem; `config.mjs` nietknięty (`git diff --stat` pusty); `git stash` na `core.mjs`+`grain.mjs`
(oba w całości tego biletu, potwierdzone `git status`) → 5/6 testów `voices.test.mjs` czerwone dokładnie jak w raporcie,
(c) zielony jak specyfikacja przewidywała → `git stash pop` → 6/6 zielone → pełny zestaw **1119/1119**. Po drodze znaleziono
piąty nieujednolicony kształt w `report()` → **J0.5** (poniżej).

**Cel.** Każda linia, którą grain drukuje jako twierdzenie, niesie jeden z czterech głosów, oznaczony identycznie w
każdej komendzie; hooki mówią wyłącznie głosem praktykowanym lub zdecydowanym.
**Zakres.** `core.mjs`: nowa funkcja `voice(kind, text)` → prefiks tekstowy: praktykowane = bez prefiksu (dzisiejsza
forma z `n of N`), zdecydowane = `decision (…):` (dziś `steer (maintainer decision, …)` / `maintainer decision (…)` /
`boundary (…)` — ujednolicić do jednego kształtu `decision <typ> (<kto> <kiedy>):`), przykład = `example (<sha>
<data>):`, mapa = `map:`. Audyt WSZYSTKICH miejsc renderujących w `core.mjs` (`whereCmd`, `report`, `rulesMarkdown`,
`checkFile` msgs/steerHits/archHits, `placementHit.text`, `bridgeLines`, `deviantLine`) i w `grain.mjs`
(`cmdCheck`, `cmdReview`, `sessionContext`, `check-hook`), żeby każde twierdzenie przechodziło przez `voice`.
`grain.mjs` `check-hook` i `session-context`: filtr — linie głosu przykład/mapa nigdy nie wchodzą do
`additionalContext` (dziś `bridgeLines` = przykład/mapa; `placementHit` = praktykowane; `completeness` = praktykowane).
**Wyjście.** Bez zmiany treści dla praktykowanego; steer/boundary w jednym kształcie; `history bridge:` → `example
(<sha>):`; mapa `where` z prefiksem `map:` na pierwszej linii.
**Bump.** Brak.
**Test.** `voices.test.mjs`: (a) każda linia z `where`/`check`/`report` na fixture pasuje do jednego z czterech
wzorców (regex zbiorczy) — czerwony dziś na `history bridge:` i na trzech kształtach decyzji; (b) wyjście
`check-hook` (Pre i Post) na fixture z mostem i mapą NIE zawiera `example`/`map:` — czerwony dziś, jeśli
bridge trafia do hooka (sprawdzić; jeśli nie trafia, test jest kontrolą regresji); (c) `session-context` — jw.
**Zależności.** Brak. **Pierwsze zadanie całej sekcji.**

**Korekty recenzji Opus (2026-08-31, przed implementacją, zweryfikowane samodzielnie przez orkiestratora):**
- Test (a) wymaga zbioru WYŁĄCZEŃ: „każda linia pasuje do jednego z czterech wzorców" jest fałszywe dla nagłówków
  i stempli — `check <rel> — …` (grain.mjs:223), `review N files …` (grain.mjs:302), `== <rel> — N finding(s) ==`,
  `conforms to:`, `as of <sha>`, `weak match:`, `note:`, `  (preference gap N bits)`, `  carries:`, `  lives in:`.
  Audyt ma wypisać faktyczny zbiór nienależący do żadnego głosu (nagłówki/stemple/linie kontynuacyjne) i wykluczyć
  go z testu — test sprawdza WYŁĄCZNIE linie-twierdzenia.
- Testy (b)/(c) to KONTROLE REGRESJI, nie czerwone testy: `bridgeLines` (core.mjs:1262) jest dziś wołane wyłącznie
  z `whereCmd` (core.mjs:1756, :1762), nigdy z `cmdCheck`; `check-hook`/`session-context` już filtrują przez
  `speak = lines.filter(l => l.includes('[grain]'))` (grain.mjs:547) — głos przykład/mapa nie ma dziś żadnej drogi
  do `additionalContext`. Napisać je jako regresję z komentarzem, nie jako red→green.
- **Konflikt rozstrzygnięty:** `sessionContext` (grain.mjs:437, SessionStart) to jednorazowy ogólny obraz na start
  sesji, koncepcyjnie różny od per-edycyjnych hooków fazy 6. Reguła „hooki mówią wyłącznie praktykowanym/
  zdecydowanym" NIE obejmuje `sessionContext` — jego linia architektury (głos mapa) i linia „Maintainer decisions
  in force" (głos zdecydowany) zostają bez zmian. Reguła z zakresu obejmuje tylko J6.1-J6.4 i istniejący `check-hook`.
- Dodatkowy zakres: `plugins/grain/tests/affinity.test.mjs:36,42` pinuje dosłowny tekst `history bridge:` —
  zaktualizować do nowego kształtu `example (<sha>):` W TYM bilecie (test należy do fazy 0, nie do J8.1).
  `README.md:140,263,302,307` i `docs/reference.md:15` cytują stare kształty (`steer (maintainer decision, …)`,
  `maintainer decision (…)`, `history bridge:`) — te dopiski do dokumentacji zostają w J8.1 (dopisano tam wzmiankę),
  ponieważ J8.1 to jedyny bilet dotykający README/docs w tej partii.

#### J0.2 · Jeden renderer `missing:` — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Cel.** Jedno pytanie „czego brakuje w mojej zmianie" ma jedną linię (jeden blok) z wieloma oznaczonymi źródłami.
**Zakres.** `core.mjs`: `missingLines(model, files, { sources })` → tablica linii: nagłówek `missing from your
change:` + po jednej linii na źródło: `co-change: <plik> (co-changed in k/N commits)` (z `completenessDirectional`),
`recipe: a new <marker|group> carrier here usually comes with <companion pattern> (share% of n) — none in the change` /
`… is registered by <file> — not touched` (z `markerImplied`/`groupImplied` dla nowych plików zmiany — dawne H1);
gniazda na J3.2 (`kin:`) i J4.2 (`change shape:`). Cisza = brak bloku (nigdy „(complete)" w bloku zbiorczym — jak
dziś w `review`). `grain.mjs`: `cmdReview` używa `missingLines` zamiast własnej linii co-change; `check-hook` Post
używa źródła co-change przez ten sam renderer (treść bez zmian).
**Bump.** Brak.
**Test.** `missing-renderer.test.mjs`: fixture z nowym plikiem-carrierem markera bez companiona i bez dotknięcia
pliku rejestrującego → blok `missing:` z `recipe:` (czerwony dziś: `review` milczy o recepcie); co-change partner
poza zmianą → `co-change:`; kompletna zmiana → brak bloku; istniejące testy `review`/`completeness-hook` bez regresu.
**Zależności.** J0.1.

**Korekty recenzji Opus (2026-08-31):**
- Usunąć zdanie „`check-hook` Post używa źródła co-change przez ten sam renderer (treść bez zmian)" — sprzeczne
  z realnym formatem hooka (grain.mjs:550-551: jedna linia, partnerzy złączeni `·`, ucięte do 3). Zamiast tego:
  `completenessDirectional` (core.mjs:2008, po J0.1-J0.6 przesunięciach linii — sprawdzić na bieżąco) zostaje BEZ
  ZMIAN TEKSTU — to stabilny kontrakt samodzielnej komendy `completeness` (grain.mjs:585), nie ruszać jej wyjścia.
  **UWAGA — kolizja nazw:** funkcja `cochangePartners(model, dirs, max=3, file=null)` JUŻ ISTNIEJE (core.mjs:1669),
  używana przez `whereCmd` dla kart katalog/plik („historically co-changes with:") — ma INNY próg pewności w trybie
  pojedynczego pliku (`minConf = file ? 1/3 : CFG.cochangeMinConf`, złagodzony bo historia jednego pliku jest rzadka).
  NIE UŻYWAĆ tej nazwy ani tej funkcji dla `missingLines`/`review`/`check-hook` — podmiana progu zmieniłaby ciche
  zachowanie `review` (to nie jest czysto prezentacyjne, złamałoby **Bump: Brak**). Zamiast tego dodać NOWĄ funkcję
  o INNEJ nazwie, np. `cochangeData(model, changed)` → `[{file, sup, commits}]`, będącą dokładnie tą samą pętlą i
  tym samym progiem `CFG.cochangeMinConf` co dziś w `completenessDirectional` (core.mjs:2008-2011), tylko zwracającą
  dane zamiast sformatowanych stringów — `completenessDirectional` może wewnętrznie wywołać `cochangeData` i tylko
  sformatować (refaktor bez zmiany tekstu), albo zostać całkiem osobno (obie opcje OK, priorytetem jest identyczny
  próg i identyczny wybór partnera, nie architektura). `missingLines` (linia `co-change: <plik> (co-changed in k/N
  commits)`) i `check-hook` (grain.mjs:550, własny krótki format bez zmian) obie czytają z `cochangeData`;
  `cmdReview` (grain.mjs:294) przechodzi na `missingLines`. Jedno źródło DANYCH o TYM SAMYM progu co dziś.
- Reguła dla NOWEGO pliku zmiany (recipe z `markerImplied`/`groupImplied`): użyć faktów wyekstrahowanych z WŁASNEJ
  treści nowego pliku (jak `checkFile` już robi dla `check`) — jeśli plik niesie fakt z `pid` zaakceptowanej
  konwencji markera/roli, zbudować ten sam klucz co `whereCmd` (`mkKey` core.mjs:1787, lub `h.roleIdx` :1817) i
  sprawdzić `markerImplied[mkKey]` / `groupImplied[roleIdx]`; recepta (companion/registration) istnieje i jej plik
  NIE jest w zmianie → linia `recipe:`. Odtwarza dokładnie mechanizm „a new carrier comes with:" (core.mjs:1792)
  dla ścieżki `review`, bez nowej heurystyki.

**Wykonanie.** `cochangeData(model, changed)` (core.mjs) — ta sama pętla/próg co `completenessDirectional`, dane
zamiast stringów; `completenessDirectional` przebudowane, żeby z niej korzystać (tekst `completeness <file>`
bajt-identyczny, zablokowany nowym testem). `missingLines(model, files, {sources, newFileScopes})` — `cochange` z
`cochangeData`, `recipe` chodzi po WŁASNYCH zakresach nowego pliku (`newFileScopes[rel]`, dostarczone przez
`cmdReview` z już policzonego `checkFile`, bez re-parsowania) i odtwarza mechanizm `markerImplied`/`groupImplied`
z `whereCmd` 1:1. `cmdReview` przechodzi na `missingLines`; `--json` `cochangePartners` liczone wprost z
`cochangeData` (te same wartości co dawniej); `check-hook` czyta `cochangeData`, własny format renderowania bez
zmian. **Weryfikacja niezależna:** diff core.mjs/grain.mjs/4 plików testowych przeczytany w całości (w tym
potwierdzenie, że `partitionFor`/`assignAll` to istniejące funkcje, nie nowo wymyślone); `config.mjs` nietknięty;
cofnięto WYŁĄCZNIE blok `cmdReview` w `grain.mjs` przez `Edit` → dokładnie 3/20 testów (`missing-renderer` ×2 +
`review-command`'s zaktualizowany test) czerwone, `completeness`/`check-hook`/reszta `review` zielone jak
przewidziano → przywrócono → 20/20 zielone → pełny zestaw **1125/1125**. Nic dodatkowego znalezione po drodze.

#### J0.3 · Gramatyka odpowiedzi i precyzja wskaźnika — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Cel.** Każda odpowiedź `where`/`check`: od ogółu do szczegółu, ten sam kształt; wskaźnik na egzemplarz tak
precyzyjny, żeby Read był jeden i celny.
**Zakres.** `core.mjs`: (a) linia mapy na początku każdej karty `where` i każdego `check`: `in: <moduł> (layer
n — po J4.3; do tego czasu bez warstwy) · used by <k> modules`; (b) wskaźniki `file:line` → `file:from–to` wszędzie,
gdzie zakres ma `endLine` (`serializeScope` już go niesie; karty `where` przez `scopeLine` — rozszerzyć indeks o
`endLine` z `fileScopes` → zmiana kształtu `fileScopes` na `[kind, name, line, endLine]`, `MODEL_V`); (c) przy
egzemplarzu, którego własne odchylenia zna (`deviants` faktów, w których jest dewiantem), dopisek `skip line N (its
own deviation: <phrase>)` — dawne H13′.
**Bump.** `MODEL_V` (fazy 0 — wspólny z J1.3).
**Test.** `answer-grammar.test.mjs`: karta `where` zaczyna się linią `in:`; egzemplarz drukowany jako `from–to`
(czerwony dziś: sama linia); egzemplarz z własnym odchyleniem ma `skip line`.
**Zależności.** J0.1.

**Korekty recenzji Opus (2026-08-31, kotwice częściowo nieaktualne):**
- „Karty `where` przez `scopeLine`" dotyczy WYŁĄCZNIE karty markera (`withLine`, core.mjs:1787-1788). Główne
  wskaźniki na egzemplarz/dewianta są `f.exemplars`/`f.deviants` (core.mjs:1069, `{rel, line, name}` — BEZ
  `endLine`), drukowane w: `pattern to copy: rel:line` (core.mjs:1835), `not to copy:` (:746), `Nearest conforming
  exemplar:`/`See:` (:1386-1387), tabela `rules` (:1935). Zakres MUSI objąć te struktury — sama zmiana kształtu
  partycyjnego `fileScopes` nie pokrywa żadnej z nich. Koszt mały: źródłowe zakresy już niosą `endLine`, więc
  `{rel, line, name}` → `{rel, line, endLine, name}` w miejscu budowy exemplars/deviants wystarczy.
- UWAGA — dwa różne `fileScopes`: (1) tree-cache (core.mjs:999, obiekty `serializeScope`, już mają `endLine`) —
  NIE RUSZAĆ. (2) 3-krotka partycji (core.mjs:1107 `[kind, name, line]`, konsumowana w :1112 sort/slice, :1526
  spectrum, :1630 byFile, `engine/export.mjs:108`) — TO jest ta do rozszerzenia na `[kind, name, line, endLine]`.
  Sprawdzić, że żadne miejsce nie zakłada dokładnie 3 elementów (np. `.length === 3`).
- (a) `in: <moduł> · used by <k> modules` jest zdefiniowane tylko dla kart `directory` (własny `id`, core.mjs:1783).
  Dla kart `group`/`marker` rozłożonych po wielu katalogach: reguła = moduł większościowy z `h.topDirs[0]` (już
  liczone), dopisek `(mixed, N% here)` gdy udział < 60%. Gdy `model.moduleGraph` nieobecne lub karta bez warstwy
  (przed J4.3) → linia `in:` pomija `(layer n)`/`used by`, drukuje tylko moduł.
- `endLine` w schemacie partycji i w `export.mjs:108` to pole DODANE, nie zmienia istniejących — `grain-export/1`
  zostaje bez zmiany numeru.
- **Dodatkowe znalezisko orkiestratora (weryfikacja przed briefem):** CZWARTE miejsce z tym samym problemem, nie
  wymienione w oryginalnym zakresie — `template (unclustered … ) — e.g. ${t.exemplars[0].rel}:${t.exemplars[0].line}`
  (core.mjs, linia z „template ("), karmione przez inny budowniczy `exemplars:` (core.mjs, funkcja profilująca
  szkielety ~linia 392, osobna od głównej pętli faktów przy ~1074/1085) — też potrzebuje `endLine`. Linia `in:`
  (a) to STRUKTURA, nie twierdzenie — dopisać do listy `NON_CLAIM` w `voices.test.mjs` (obok `lives in:`/
  `depends on:`/`used by:`), NIE przez `voice('map', …)` — karta ma już swój jeden nagłówek głosu mapa (`«q» → …`,
  z J0.1); `in:` to uzupełniający wskaźnik lokalizacji, tej samej kategorii co sąsiednie nie-głosowe linie.

**Wykonanie.** Cztery części zrobione: (1) `endLine` doprowadzone do wszystkich 4 miejsc budujących `exemplars`/
`deviants` (w tym `mineTemplates` ~392) oraz do partycyjnego `fileScopes` (4-krotka), `scopeLine`/`scopeLineEnd`,
`export.mjs`'s `lineOf`/`endLineOf` (pola dodane, `grain-export/1` bez zmiany); (2) `ptr(rel,line,endLine)` (en
dash) na wszystkich 6 nazwanych miejscach; (3) `in:` (`cardModule`/`inLineForCard`/`inLineForFile`, moduł
większościowy z `topDirs[0]` + `(mixed, N%)`, pomijane bez `moduleGraph`; dodane do `NON_CLAIM`, nie przez
`voice()`); (4) `skipLineNote`/`otherDeviantsOf` (WeakMap per partycja, najsilniejszy po `gap` wygrywa remisy) na 4
z 6 miejsc (bez `not to copy:` i `carriers to copy:`, zgodnie ze specyfikacją). Po drodze wykonawca sam znalazł i
naprawił asymetrię: pliki-plikowe pseudo-zakresy nie miały `endLine` ustawionego przy ekstrakcji — znormalizowane
do `s.endLine || s.line` (konwencja już używana wszędzie indziej), naprawiając test „incremental = pełny rebuild
bajt-w-bajt". **Weryfikacja niezależna:** cały diff core.mjs/export.mjs/grain.mjs przeczytany w całości (424+36+25
linii); cofnięto `ptr()` do gołej `rel:line` przez `Edit` → dokładnie testy (a)/(e) czerwone, reszta zielona →
przywrócono; osobno wyzerowano `inLineForCard` → dokładnie test (c) czerwony → przywrócono → pełny zestaw
**1131/1131**. **Znalezisko zgłoszone przez wykonawcę, poza nazwaną listą biletu:** identyczny błąd bez `ptr()` w
OSOBNEJ sekcji `rulesMarkdown()` „### Templates (unclustered residue)" (core.mjs, inna linia niż `report()`'s
`template (...)`, którą J0.3 naprawił). Jednoliniowy fix — naprawiony SAMODZIELNIE przez orkiestratora (K2 pkt 5):
test `(h)` w `answer-grammar.test.mjs` (model ręczny, jak `pct-rounding.test.mjs`) → czerwony (`src/x.ts:10` zamiast
zakresu) → `ptr(...)` zamiast gołego `line` → zielony → pełny zestaw **1132/1132**. `config.mjs` nietknięty przez
cały bilet.

#### J0.4 · `grain selftest` — liczba publiczna — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Cel.** Precyzja i fałszywe alarmy na TYM repo jedną komendą, udokumentowaną.
**Zakres.** `grain.mjs`: `case 'selftest'` = `mutateTest` (istnieje jako `mutate-test`, alias zostaje) z wyjściem
tekstowym: `selftest: <detected>/<plantable> planted deviations caught · <falseFire> false fires · <unsupported>
unsupported` + `--json`; gniazdo `--how` (J2.3). `statusLines`: linia `selftest: run \`grain selftest\`` tylko gdy nigdy nie
uruchomiono (bez stanu — po prostu nie drukować; zostawić puste gniazdo).
**Bump.** Brak.
**Test.** `selftest.test.mjs`: na fixture `selftest` drukuje liczby zgodne z `mutate-test --json`; `--json` parsowalne.
**Zależności.** Brak.

**Korekty recenzji Opus (2026-08-31):**
- `mutateTest` (core.mjs:2025) zwraca `{detected, missed, silentOK, falseFire, unsupported, cases}` — pola
  `plantable` NIE MA. Wyprowadzić `plantable = detected + missed` (pomijając `unsupported`, nigdy realnie
  zasadzone) w warstwie renderującej `selftest` (`grain.mjs`), NIE w `mutateTest` samym.
- `mutate-test` (grain.mjs:586) DZIŚ IGNORUJE `--json` i zawsze drukuje JSON (`JSON.stringify(...)` bez sprawdzenia
  `opts.json`). `selftest` (tekst) i `mutate-test` (zawsze JSON, alias zostaje) to świadomie odmienne formaty tego
  samego wywołania — nazwać to wprost komentarzem, nie traktować jako przeoczenie do naprawy.
- `silentOK` (core.mjs:2035) NIE wchodzi do tekstowego podsumowania `selftest` (wewnętrzna kontrola metody, nie
  wynik dla operatora) — zostaje wyłącznie w `--json` (pełny `res` bez zmian). Dopisać ten wybór do **Wyjście.**
- „Puste gniazdo" w `statusLines` = dosłownie BRAK LINII (żaden placeholder, żaden nowy plik stanu).

**Wykonanie.** `case 'selftest'` obok `case 'mutate-test'` w `grain.mjs` — ten sam `mutateTest()`, `--json` = pełny
`res` bez zmian, tekst = `plantable = detected+missed`, `selftest: d/plantable planted deviations caught · N false
fires · M unsupported` (bez `silentOK`). `--how` po prostu nieodczytywane (bez efektu, bez crasha). `statusLines`
i `config.mjs` nietknięte. `selftest` dodane do `NON_CLAIM` w `voices.test.mjs` (struktura, nie głos). **Weryfikacja
niezależna:** diff `grain.mjs` przeczytany (3 linie: case + komentarz + wpis USAGE); `core.mjs` bez zmian
potwierdzone grepem; cofnięto WYŁĄCZNIE nowy `case 'selftest'` przez `Edit` → 3/4 testy czerwone (tekst/JSON), (d)
zielony jak przewidziano (czysty błąd "unknown command", nie surowy stack trace) → przywrócono → 4/4 zielone →
pełny zestaw **1136/1136**. Nic dodatkowego znalezione po drodze.

**FAZA 0 W CAŁOŚCI ZROBIONA (J0.1–J0.6), zweryfikowana niezależnie na każdym bilecie. Dalej: Faza 1.**

#### J0.5 · Piąty kształt głosu zdecydowanego w katalogu `report()` — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Cel.** J0.1 ujednolicił cztery miejsca głosu zdecydowanego do `decision <typ> (<kto> <kiedy>): …`, ale przeoczył
PIĄTE: katalogowe wiersze `== boundaries ==` / `== steers ==` w `report()`, które dziś zaczynają się od gołego
`<8-hex-id>: …` bez żadnego markera. To bezpośrednio łamie własną zasadę biletu J0.1 („jeden znacznik, jedna
reguła") — znalezione przez `impl-J0-1` przy weryfikacji, zgłoszone jako pytanie projektowe, rozstrzygnięte tu.
**Zakres.** `core.mjs` (~1926-1928), dwa wiersze AKTYWNEJ decyzji (nie diagnostyczny wiersz „not found — inert",
ten zostaje bez markera — to stan błędu, nie twierdzenie):
- boundaries: `  ${bd.id}: ${bd.boundary.from}/ never imports ${bd.boundary.to}/…` → przez `voice('decided', …,
  { typ: 'boundary', who: bd.author, when: bd.createdAt, id: bd.id })`.
- steers (wiersz z aktywną powierzchnią, pomijając `sf.retires`): `  ${st.id}: …verbalize… — practicedBy…` → przez
  `voice('decided', …, { typ: 'steer', who: st.author, when: st.createdAt, id: st.id })`.
Rozszerzyć `voice()` (core.mjs, J0.1) o opcjonalne `meta.id`: gdy obecne, część nawiasu staje się `id <id>, <kto>
<kiedy>` (przecinek TYLKO gdy `id` jest podane — cztery istniejące wywołania z J0.1 bez `id` muszą wydrukować
DOKŁADNIE to samo co dziś, spacja bez przecinka; nie zmieniać ich testów). `id` zostaje potrzebny dla `grain seed
rm <id>` — nie usuwać go z wiersza, tylko przenieść do nawiasu markera. Wiersz „not found — inert" i wiersz
`retires:` (kontynuacja, nie osobne twierdzenie) zostają bez zmian.
**Świadomie POZA zakresem:** `grain seed list` (`grain.mjs:337-339`, `cmdSeed`) ma JESZCZE INNY, gołoidowy kształt
(`${id}  ${path}#${name}  ${pids}  weight …  (${author date})` / `${id}  boundary: …`) — to NIE jest głos zdecydowany
w sensie J0.1, tylko surowy zrzut administracyjny (jak `git log --oneline`), czytany po to, żeby znaleźć `<id>` do
`seed rm`; nie jest zdaniem-twierdzeniem, które agent miałby "usłyszeć" jako regułę do przestrzegania. Nie ujednolicać
— to inna kategoria wyjścia, nie przeoczenie.
**Bump.** Brak (czysto prezentacyjne, jak J0.1).
**Test.** Rozszerzyć `voices.test.mjs`: `report()` na fixture z aktywnym steer i boundary → oba katalogowe wiersze
zaczynają się `decision (steer|boundary) \(id [0-9a-f]{8}, kd …\): ` (czerwony dziś: gołe `<id>: `); istniejący
test w `grain.test.mjs`/`architecture.test.mjs` sprawdzający `new RegExp(id + ': methods here never call…')` na
`report()` zaktualizować do nowego kształtu (sprawdzić, czy istnieje — jeśli tak, to red→green tam też).
**Zależności.** J0.1 (zrobione).

**Wykonanie.** `voice()`'s `'decided'` case rozszerzone o `meta.id` (bez podwójnego przecinka — poprawiona wersja
briefu, który miał błąd `parts.join(meta.id ? ', ' : ' ')` dający `id X, kd, data`); boundaries/steers wiersze
katalogowe w `report()` przez `voice('decided', …, {…, id})`. Zaktualizowano `grain.test.mjs:159` + TRZY miejsca w
`seed-baseline.test.mjs` (brief wymieniał tylko jedno — reszta znaleziona i naprawiona przez wykonawcę). **Weryfikacja
niezależna:** diff core.mjs/testów przeczytany w całości; `config.mjs` nietknięty; cofnięto WYŁĄCZNIE `meta.id`-gałąź
`voice()` przez `Edit` → dokładnie 1/7 testów `voices.test.mjs` czerwony (ten sam co w raporcie) → przywrócono →
7/7 zielone → pełny zestaw **1120/1120**. Po drodze znaleziono siódmy (bliźniaczy) nieujednolicony kształt w
`rulesMarkdown()` (inna komenda, ten sam wzorzec) → **J0.6** (poniżej).

#### J0.6 · Ten sam bliźniaczy kształt w `rulesMarkdown()` — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Cel.** `rulesMarkdown()` (dokument Markdown dla czytelnika bez CLI, `grain rules --out`) ma DOKŁADNIE ten sam
nieujednolicony kształt co `report()` miał przed J0.5 — inna komenda, ten sam błąd, znaleziony przez `impl-J0-5`
przy weryfikacji, zgłoszony jako obserwacja poza zakresem, rozstrzygnięty tu.
**Zakres.** `core.mjs` (~1980-1984), dwa wiersze markdownowe (bullet `- **id**: …`), analogiczne do J0.5:
- `- **${bd.id}**: \`${bd.boundary.from}/\` never imports \`${bd.boundary.to}/\`…` → `` `- ${voice('decided', `\`${bd.boundary.from}/\` never imports \`${bd.boundary.to}/\`${bd.note ? ' — ' + bd.note : ''}${!bd.fromLive || !bd.toLive ? ' (a side names no indexed files — inert)' : ''}`, { typ: 'boundary', who: bd.author, when: bd.createdAt, id: bd.id })}` `` (drop `**bold**` wokół id — id już jest częścią markera; usuń stary trailing `${author} ${date}`).
- `- **${st.id}**: …verbalize…` (aktywna powierzchnia, pomijając `sf.retires`) → analogicznie `voice('decided', …,
  { typ: 'steer', who: st.author, when: st.createdAt, id: st.id })`.
Wiersz „not found — inert" i wiersz `  - retires:` (kontynuacja) zostają bez zmian — jak w J0.5. `voice()` sam NIE
wymaga zmian (już umie `meta.id` po J0.5) — to czyste przepięcie dwóch wywołań.
**Bump.** Brak.
**Test.** Nowy blok w `voices.test.mjs` (albo rozszerzenie testu J0.5): `rulesMarkdown(model)` na tym samym modelu
co fixture z aktywnym steer+boundary → oba wiersze zaczynają się `- decision (steer|boundary) \(id [0-9a-f]{8}, kd
…\): ` (czerwony dziś: `- **<id>**: `). Brak istniejących testów pinujących ten bare-id kształt w
`rulesMarkdown()` (sprawdzone: `cycle-set-not-chain.test.mjs`/`pct-rounding.test.mjs` używają `rulesMarkdown` ale
nie wywołują ścieżki boundaries/steers) — czysto addytywne, zero ryzyka regresji gdzie indziej.
**Zależności.** J0.5 (zrobione).

**Wykonanie.** Lustrzana zmiana J0.5 wewnątrz `rulesMarkdown()` (core.mjs, wiersze boundaries/steers, bullet
markdown zamiast linii tekstowej) — `**bold**` wokół id zdjęte, id przeniesione do markera `voice('decided', …, {id})`,
`voice()` bez zmian (już umiał `meta.id`). **Weryfikacja niezależna:** diff przeczytany (dokładnie 2 nowe hunki,
lustrzane do J0.5); `config.mjs` nietknięty; cofnięto WYŁĄCZNIE te 2 hunki przez `Edit` → dokładnie 1/8 testów
`voices.test.mjs` czerwony (nowy test J0.6, reszta zielona) → przywrócono → 8/8 zielone → pełny zestaw
**1121/1121**. Nic dodatkowego znalezione po drodze. J0.1/J0.5/J0.6 zrobione — **J0.2, J0.3, J0.4 wciąż NIEZROBIONE**,
dalej zgodnie z „Kolejność J" (J0.1 → J0.2 → J0.3 → J0.4).

### Faza 1 — Powierzchnia: cztery pytania (scalenia i nazwy, bez zmian w silniku)

#### J1.1 · `check` bez argumentu = cała zmiana (`review` aliasem) — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** `grain.mjs` `main`: `case 'check'` → gdy `args.length === 0` → `cmdReview(ctx)` (wszystkie flagi
`--staged/--range/--worktree/--json` przechodzą); `case 'review'` zostaje jako alias (USAGE: `check [<file>]
[--staged|--range a..b]`, `review` w sekcji „aliases"). `cmdCheck` bez argumentu nie rzuca `usage`.
**Test.** Wszystkie testy `review-command.test.mjs` przepuszczone dodatkowo przez `check` bez argumentu (parametryzacja
helpera `grain([...])`); alias `review` dalej działa. Czerwony dziś: `check` bez argumentu rzuca usage.
**Zależności.** J0.2.

**Korekty recenzji Opus (2026-08-31):**
- `USAGE` (grain.mjs ~601-624) NIE MA dziś sekcji aliasów — trzeba ją STWORZYĆ, nie „przenieść". Ten bilet ma
  wyłączność na jej utworzenie; J1.2/J1.3/J1.4 tylko dopisują do niej wiersze (sekwencyjnie, nie równolegle — stąd
  kolejność J1.1 → J1.2 → J1.3 → J1.4 w tej fazie, jak w „Kolejność J").
- `cmdReview`'s nagłówek błędu „review: not a git repository…" (grain.mjs ~273) zostaje bez zmian pod `check` —
  komunikat wciąż trafny (oba znaczą „nie ma zatwierdzonego HEAD"), nie wart parametryzacji dla jednego przypadku.
- `--as`/`--content`/`--all` (flagi specyficzne dla pojedynczego `check`) pod `check` bez argumentu (routing do
  `cmdReview`) mają być PO PROSTU ZIGNOROWANE (jak dziś każda nierozpoznana flaga w `opts` — nie trzeba żadnej
  specjalnej obsługi ani błędu).

**Wykonanie.** `case 'check':` → `args.length === 0 ? cmdReview(ctx) : cmdCheck(ctx)`; `case 'review'` bez zmian;
`cmdCheck`'s `if (!args[0]) throw` zostawione jako defensywna straż (dziś nieosiągalne z CLI, potwierdzone: MCP i
check-hook zawsze przekazują dokładnie jeden plik). Sekcja `aliases:` w USAGE utworzona (jeden wiersz na `review`,
gotowa na dopiski J1.2/J1.3/J1.4). Testy `review-command.test.mjs` sparametryzowane `for (const cmd of ['review',
'check'])` dla 9 testów resetowalnych; 6 commitujących testów zostało przy `review` (podwójny commit zepsułby
fixture); nowy dedykowany test na `check <file>` (regresja ścieżki jednoplikowej). **Weryfikacja niezależna:**
diff `grain.mjs`/testu przeczytany w całości; `config.mjs` nietknięty; cofnięto WYŁĄCZNIE `case 'check':` przez
`Edit` → 18/26 zielone, 8/26 czerwone w `review-command.test.mjs` (dokładnie jak w raporcie) → przywrócono →
26/26 → pełny zestaw **1146/1146**. Nic dodatkowego znalezione po drodze.

#### J1.2 · `completeness` → linia w `check`/`how` (alias zostaje) — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** `grain.mjs`: `completeness <file…>` pozostaje aliasem drukującym `missingLines` ze źródłem co-change dla
podanych plików; `check <file>` (jeden plik) dokłada blok `missing:` (dziś ma go tylko hook i `review`). USAGE:
`completeness` do aliasów.
**Test.** `check <file>` na pliku z partnerem co-change drukuje `missing from your change:` + `co-change: …`
(czerwony dziś: bloku nie ma wcale — POPRAWKA: oryginalny zapis `missing: co-change: …` był błędny, taki string
nigdzie nie istnieje); bez partnera — brak bloku; `completeness` bajt w bajt jak dawniej.
**Zależności.** J0.2.

**Korekty recenzji Opus (2026-08-31):**
- `cmdCheck` NIE MA dziś ani `files`, ani `knownFiles` — zbudować lokalnie: `files = [rel]`,
  `newFileScopes = knownFiles.has(rel) ? {} : {[rel]: r.scopes}` gdzie `knownFiles = new Set(model.partitions.
  flatMap(p => p.files))` (ten sam wzorzec co `cmdReview`, grain.mjs ~276/287).
- **DECYZJA:** `sources: ['cochange']` TYLKO — bez `'recipe'`. Uzasadnienie: `recipeLines`'s test „czy companion
  jest w zmienionym zbiorze" na zbiorze jednoelementowym (`[rel]`) odpalałby się niemal zawsze fałszywie dla
  nowego pliku (żaden companion nigdy nie jest „w zmianie" złożonej z jednego pliku). Recipe zostaje wyłącznie dla
  `review` (wielu plików), gdzie test ma sens.
- `check --json` NIE dostaje `cochangePartners` — kontrakt JSON (`fileVerdictJson`, `check-json-contract.test.mjs`)
  zostaje bez zmian. Blok `missing:` dotyczy wyłącznie tekstowego wyjścia.
- Pozycja bloku w wyjściu `check`: po `conforms to:`/liście odchyleń, przed stemplem `as of` (koniec, jak w `review`).
- Regresja potwierdzona bez zmian kodu: filtr `check-hook`'a trzyma tylko linie z `[grain]` (grain.mjs ~552);
  `missingLines` nie dodaje tego prefiksu, więc własna linia co-change hooka (grain.mjs ~554, inny źródłowy kod od
  J0.2) nie zduplikuje się z nowym blokiem `check`a.

**Wykonanie.** `knownFiles`/`files`/`newFileScopes` zbudowane lokalnie w `cmdCheck`, `missingLines(model, files,
{sources:['cochange'], newFileScopes})` wstawione po `conforms to:`, przed stemplem. Wiersz `completeness` dodany
do sekcji `aliases:`. **Weryfikacja niezależna:** diff przeczytany (dokładne miejsce wstawienia potwierdzone);
`config.mjs`/`completenessDirectional`/`check --json` nietknięte; zakomentowano WYŁĄCZNIE nową linię `missingLines`
→ dokładnie 1/8 testów czerwony (pozostałe 7, w tym trzy inne nowe testy J1.2, zielone) → przywrócono → 8/8 + 6/6
`check-json-contract` → pełny zestaw **1150/1150**. Nic dodatkowego znalezione po drodze.

#### J1.3 · `decide` — steer · boundary · waive · list · rm (`seed` aliasem); nowy typ decyzji: wyjątek — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Opus**

**Zakres.** `grain.mjs`: `case 'decide'` z podkomendami `steer` (= `seed add`), `boundary` (= `seed add-boundary`),
`waive <path>#<name> --on <pid> --note "…" [--author]`, `list`, `rm <id>`; `seed` → alias 1:1. `readSeeds`: trzecia
gałąź `j.waiver && j.waiver.path && j.waiver.pid` → `waivers[]` (`{ id, path, name, pid, note, author, createdAt }`);
`hashSeeds` obejmuje waivers (zmiana seeds → re-mine jak dziś). `core.mjs` `learn()`: `model.waivers` = wejście
rozwiązane do `found` (zakres istnieje) jak `steers`. `checkFile`: odchylenie na zakresie (`effRel`, `name`) dla `pid`
z aktywnym waiverem → NIE trafia do `msgs`; zamiast tego `steerHits`-podobna pozycja `waiverHits` z tekstem głosu
zdecydowanego: `decision waiver (<kto> <kiedy>): \`<name>\` deliberately departs from <verbalize(fact)> — <note>`; w
`cmdCheck` drukowana w miejscu steerów (in-change/pre-existing jak steery). `report`: w sekcji decyzji liczba
waiverów per konwencja (`<k> waivers`) — konwencja z wieloma waiverami to sygnał (J5.5). `export.mjs`: `waivers[]` +
`schemaNotes.waivers`; `decisions.jsonl` — wpis add/rm jak dla seedów.
**Bump.** `MODEL_V` (wspólny fazy 0/1 z J0.3).
**Test.** `decide-waive.test.mjs`: (a) `decide waive` zapisuje rekord, `list` go pokazuje, `rm` usuwa (+
decisions.jsonl); (b) `check` na dewiancie z waiverem: odchylenie znika z `deviationsInChange`, pojawia się linia
`decision waiver` (czerwony dziś: odchylenie); (c) inny dewiant tej samej konwencji bez waivera — dalej odchylenie;
(d) `report` liczy waivery; (e) `seed add` alias ≡ `decide steer` bajt w bajt (istniejące testy steerów przez alias).
**Zależności.** J0.1.

**Korekty recenzji Opus (2026-08-31, 10 poprawek + 2 decyzje orkiestratora):**
1. `hashSeeds` (grain.mjs ~323: `(seeds.length || boundaries.length) ? hash : ''`) — repo TYLKO z waiverami hashuje
   się do `''` i nigdy nie re-mine'uje. Dodać `|| waivers.length`.
2. `--on` NIE JEST na liście flag przyjmujących wartość w `parseArgv` (grain.mjs ~32) — dziś sparsowałoby się jako
   `true`, a pid wylądowałby jako pozycyjny argument. Dodać `'on'` do tej listy.
3. Tekst waivera MUSI nieść mianownik (inwariant „każde twierdzenie z mianownikiem") — dzisiejszy wzór
   `conformN/f.sraw established …` (core.mjs, wewnątrz pętli budującej `msgs`, ~1424-1434) ma go; zaproponowany
   tekst waivera w zakresie NIE — dopisać: `decision waiver (<kto> <kiedy>): \`<name>\` (line N) deliberately
   departs from <verbalize(fact)> — <conformN>/<f.sraw> established do it the other way — <note>`.
4. Waivery NIGDY nie wchodzą do `mine()`/wag (w odróżnieniu od steerów, które wchodzą) — czysto renderowe
   tłumienie. Udokumentować to jako świadomy, konserwatywny wybór w komentarzu przy `model.waivers`.
5. Punkt tłumienia: pętla budująca `msgs` (core.mjs, `for (const sf of [f, ...siblings])`, `break` na końcu,
   ~1434) — dopasowanie aktywnego waivera na `sf.pid` dla TEGO zakresu musi też skonsumować `break` (pominąć
   `msgs.push`, wypchnąć do `waiverHits` zamiast), inaczej siostrzana powierzchnia (`siblings`) podniesie to samo
   odchylenie ponownie.
6. Klucz waivera to `(path, name, pid)`, ale `checkFile` dopasowuje po `effRel`/`s.name` — NIEUNIKALNE (`<anon>`,
   przeciążenia). `decide waive` ma ODMÓWIĆ zapisu, gdy `(path, name)` wskazuje więcej niż jeden zakres — użyć tego
   samego komunikatu błędu co istniejące „pick one scope of …" (grain.mjs ~334, `seed add`).
7. `governed`/liczniki nagłówka `check` (core.mjs ~1404 / grain.mjs ~220) DALEJ liczą zakres z aktywnym waiverem
   jako `conforms:false`/rządzony — to ŚWIADOME, liczby wciąż mówią prawdę o stanie kodu; waiver tłumi tylko GŁOS,
   nie fakt.
8. **DECYZJA (raport):** ZAMIAST cross-referencji „`<k> waivers` per konwencja" (wymagałoby rozwiązywania przez tę
   samą regułę specyficzności co mapa `gov` w `checkFile`, core.mjs ~1387-1397 — nieproporcjonalny koszt na tym
   etapie) — WZORUJEMY SIĘ na precedensie `report()`'s `== boundaries ==`/`== steers ==` (płaskie sekcje): nowa
   sekcja `== waivers — k architecture decision(s)... ==` (a raczej „k waiver(s)"), jeden wiersz na waiver, przez
   `voice('decided', …, {typ:'waiver', who, when, id})` — dokładnie jak J0.5/J0.6 zrobiły dla boundaries/steers.
   Cross-referencja „waivers per convention" zostaje jako możliwe rozszerzenie J5.5, NIE w tym bilecie.
9. `MODEL_V` jest DZIŚ `m15` (config.mjs:9) — J0.3 świadomie NIE bumpowało (fileScopes-endLine czeka na wspólny
   bump). „Wspólny bump fazy 0/1" oznacza: orkiestrator bumpuje `m15→m16` RAZ, SAM, dopiero gdy J1.3 (ostatni bilet
   wymagający MODEL_V w tej parze) jest zielony — komentarz cytujący OBA: J0.3 (fileScopes+endLine) i J1.3
   (waivers). Wykonawca J1.3 NIE bumpuje niczego sam (jak zawsze).
10. `export.mjs`: `waivers[]` + `schemaNotes.waivers` DODAĆ w tym bilecie (kod). `docs/reference.md`'s
    enumeracja pól — NIE dotykać teraz: J8.1 JUŻ jawnie planuje udokumentować `waivers` w `reference.md` (patrz
    zakres J8.1: „eksport (nowe pola: `waivers`, `changeArchetypes`, …)"). Dotykanie docs poza J8.1 łamie
    standingową zasadę „docs dopiero w J8.1".
- **Test (e) przeformułowany:** dosłowna bajt-identyczność `decide steer` ≡ `seed add` jest NIEOSIĄGALNA —
  potwierdzenia `cmdSeed` mówią „seed"/„seeds.jsonl" wprost (grain.mjs ~340/361/370) i to jest OK: aliasowanie
  komendy nie wymaga zmiany rzeczowników w jej komunikatach. Test (e) sprawdza zamiast tego FUNKCJONALNĄ
  równoważność: `decide steer` zapisuje IDENTYCZNY rekord w `seeds.jsonl` co `seed add` (te same pola, ten sam
  efekt na modelu), niezależnie od słów w komunikacie zwrotnym.

**Wykonanie.** `cmdDecide` (cienki wrapper mapujący `steer→add`/`boundary→add-boundary` przez `DECIDE_SUBS`, `waive`
i reszta przechodzą wprost) woła istniejące `cmdSeed`; `decide waive` odmawia zapisu przy niejednoznacznym
`(path, name)` (ten sam komunikat „pick one scope of…" co `seed add`); `readSeeds`/`hashSeeds` objęły `waivers`;
`learn()` rozwiązuje `model.waivers` (`found`, jak steery) z jawnym komentarzem „render-time only, nigdy nie
wchodzi do mine()/wag"; punkt tłumienia w `checkFile` sprawdza aktywny waiver PRZED `msgs.push` i konsumuje `break`
(waiver → `waiverHits` zamiast `msgs`, z pełnym mianownikiem `conformN/f.sraw`); `report()` ma płaską sekcję
`== waivers ==` (wzorem J0.5/J0.6); `export.mjs` ma `waivers[]` + wpis `schemaNotes`; `voice()` nie wymagał ŻADNEJ
zmiany (`typ:'waiver'` przechodzi przez istniejącą interpolację). Wszystkie 10 korekt zastosowane, test (e)
sprawdza równoważność rekordu, nie tekstu. **Weryfikacja niezależna:** diff przeczytany w całości (dispatch,
`readSeeds`, punkt tłumienia w `checkFile`, sekcja `report`, `export.mjs`, `learn()`); `config.mjs`/`docs/*.md`
nietknięte; wyłączono WYŁĄCZNIE gałąź `if (wv)` w `checkFile` (`const wv = false && ...`) → dokładnie 1/7 testów
(`decide-waive.test.mjs`, test (b) — tłumienie z mianownikiem) czerwony, reszta zielona → przywrócono → 7/7 →
pełny zestaw **1157/1157**. Orkiestrator zbił wspólny bump `MODEL_V` `m15→m16` (cytujący J0.3 i J1.3) — pełny
zestaw po bumpie nadal **1157/1157**, żaden test nie hardkoduje starej wersji.

**Znalezisko wykonawcy, poza zakresem briefu (zgłoszone, nie naprawione):** `check --json` NIE dostaje pola
`waivers` — wykonawca napisał je, `missing-renderer.test.mjs`'s zablokowany zestaw kluczy (z J1.2) odrzucił zmianę,
więc się wycofał i zgłosił zamiast poszerzać cudzy zablokowany test bez decyzji. Realna luka: tłumiona dewiacja
znika z `check --json` bez śladu — konsument maszynowy nie odróżni „zgodne" od „wybaczone". → **J1.3b** (poniżej),
naprawione w tej samej partii.

#### J1.3b · `check --json` traci ślad po waiverze — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Cel.** Konsument maszynowy `check --json` (MCP, harnessy, pipeline'y treningowe) ma widzieć, że dewiacja została
świadomie wybaczona, nie tylko że zniknęła.
**Zakres.** `grain.mjs`, `fileVerdictJson({rel, r, dirty, f, govFacts, stamp})`: dodać pole `waivers` DOKŁADNIE na
wzór istniejącego `steers` (ten sam plik, kilka linii wyżej): `steers: (r.steerHits || []).map(h => ({ seed: h.id,
pid: h.pid, expected: h.exp, observed: h.obs, scope: h.scope, kind: h.kind, line: h.line, inChange: !touched ||
touched(h.line, h.endLine) }))` → analogicznie `waivers: (r.waiverHits || []).map(h => ({ waiver: h.id, pid: h.pid,
expected: h.exp, observed: h.obs, scope: h.scope, kind: h.kind, line: h.line, inChange: !touched || touched(h.line,
h.endLine) }))`. `r.waiverHits` już istnieje (dodane przez J1.3). Zaktualizować JEDYNY test blokujący dokładny
zestaw kluczy: `missing-renderer.test.mjs` (test „(J1.2) check <file> --json output shape is unchanged") — dopisać
`'waivers'` do oczekiwanej listy kluczy. `check-json-contract.test.mjs` nie blokuje zestawu kluczy (sprawdza
tylko obecność konkretnych pól) — bez zmian, ale uruchomić jako kontrolę regresji.
**Bump.** Brak (pole dodane, `grain-export/1`-analogiczny kontrakt `check --json` nie ma własnego numeru schematu,
ale i tak: dodanie, nie zmiana istniejącego — bezpieczne).
**Test.** Nowy test w `decide-waive.test.mjs` lub `missing-renderer.test.mjs`: `check <file> --json` na scenie z
aktywnym waiverem → `j.waivers` zawiera wpis z poprawnym `pid`/`scope`/`inChange`; scena bez waivera → `j.waivers`
puste; istniejący test blokujący klucze zaktualizowany i dalej zielony.
**Zależności.** J1.3 (zrobione).

**Wykonanie.** `waivers: (r.waiverHits || []).map(...)` dodane do `fileVerdictJson` tuż po `steers`, klucz `waiver`
(nie `seed`) dla id. `missing-renderer.test.mjs`'s zamek na zestaw kluczy zaktualizowany o `'waivers'`.
**Weryfikacja niezależna:** diff przeczytany; `config.mjs` bez zmian poza wcześniejszym bumpem orkiestratora;
cofnięto WYŁĄCZNIE nową linię `waivers:` → dokładnie 3/17 testów czerwone (2 nowe testy J1.3b + zamek klucza z
J1.2, wszystkie spodziewane) → przywrócono → 23/23 + `check-json-contract` 6/6 → pełny zestaw **1159/1159**. Nic
dodatkowego znalezione po drodze.

#### J1.4 · `spectrum` → `explain` (alias) — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** `grain.mjs`: `case 'explain'` = `cmdSpectrum`; USAGE przenosi `spectrum` do aliasów, `explain <file>`
do narzędzi deweloperskich. Bez zmian w silniku.
**Test.** `explain` ≡ `spectrum` bajt w bajt na fixture.
**Zależności.** Brak.

**Wykonanie.** `case 'spectrum': case 'explain': lines = await cmdSpectrum(ctx); break;` (wzorem `check`/`review` i
`decide`/`seed`); USAGE — `explain` jako główna komenda, `spectrum` przeniesione do `aliases:`. `cmdSpectrum` bez
zmian. **Weryfikacja niezależna:** diff przeczytany; `config.mjs` bez dodatkowych zmian; cofnięto WYŁĄCZNIE
`case 'explain'` → dokładnie 1/15 testów czerwony w `grain.test.mjs` → przywrócono → 15/15 → pełny zestaw
**1160/1160**. Nic dodatkowego znalezione po drodze.

#### J1.5 · MCP: cztery pytania — ✅ ZROBIONE (część w fazie 2/3), zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** `bin/grain-mcp.mjs` `TOOLS`: `grain_check` bez `file` → cała zmiana (`cmdReview` z `{json:true}`) — `file`
staje się opcjonalne; `grain_how` (J2.2) i `grain_what` (J3.3) dochodzą w swoich fazach; `grain_report` zostaje.
Read-only bez zmian (`decide` nie wchodzi).
**Test.** `mcp-server.test.mjs`: `grain_check` bez `file` zwraca kształt `review --json`; walidacja `-32602` dla
złych typów bez zmian.
**Zależności.** J1.1.

**Korekty recenzji Opus (2026-08-31):**
- **BLOKER:** `cmdReview` (grain.mjs ~272) NIE JEST eksportowane (`async function cmdReview`, bez `export`), a
  `grain-mcp.mjs:17` importuje po nazwie z `../engine/grain.mjs`. Pierwszy krok TEGO biletu: dodać `export` — to
  własna zależność biletu, nie osobny bilet.
- Dodatkowo, nie wymienione w zakresie: `inputSchema`'s `required: ['file']` (grain-mcp.mjs ~58) musi zniknąć dla
  `grain_check`; walidacja (~60) zmienia się na „jeśli obecne, niepusty string"; opis narzędzia dopisuje zachowanie
  bez `file`; wywołanie buduje `buildCtx(a.repo, [], {json:true})` i woła `cmdReview`.

**Wykonanie.** `cmdReview` wyeksportowane (blocker biletu, naprawiony jako jego własny pierwszy krok);
`grain_check`'s `required` usunięte całkiem (wzorem `grain_report`, nie puste `required: []`); walidacja „jeśli
obecne, niepusty string"; `exec` rozgałęzia na `cmdCheck`/`cmdReview` po `a.file !== undefined`. Dwa istniejące
testy (`tools/list` schema, „missing required argument") zaktualizowane pod nowy kontrakt. **Weryfikacja
niezależna:** diff przeczytany; `config.mjs` bez dodatkowych zmian; cofnięto WYŁĄCZNIE gałąź `exec` (zawsze
`cmdCheck`) → dokładnie 1/14 testów `mcp-server.test.mjs` czerwony → przywrócono → 14/14 → pełny zestaw
**1163/1163**. Nic dodatkowego znalezione po drodze.

**FAZA 1 W CAŁOŚCI ZROBIONA (J1.1–J1.5 + J1.3b), zweryfikowana niezależnie na każdym bilecie. Wspólny bump
`MODEL_V` m15→m16 (J0.3+J1.3) wykonany przez orkiestratora. Dalej: Faza 2.**

### Faza 2 — Zmiana: `how` (bramka całej reszty)

#### J2.1 · Odciski commitów w replay state — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** `history.mjs`: `freshState()` + `state.fps = []`; w `replay()`: mapa `touched` sha → Set kluczy
zakresów, napełniana w pętli zdarzeń (`curM` vs `prev`: klucz `e.path + '#' + k` gdy brak `prev[k]` (urodzony) lub
`pv.bh !== s.bh` (zmieniony)); w pętli po `commits` (tam, gdzie liczone są `toks`/`fs2`): jeśli `fs2.length >= 1 &&
fs2.length <= CFG.megaCap` → `state.fps.push({ sha: c.sha, ts: c.ts, author: c.author, agent: c.agent, fix: c.fix,
toks, files: fs2, scopes: [...touched.get(c.sha) || []].sort(), renames: <pary [old,new] zdarzeń 'R' tego commita> })`.
Cap: `CFG.fpsCap = 20000` (próg mocy, do rezyduum) — po przekroczeniu trzymać NAJNOWSZE (obcięcie z przodu przy
zapisie), `log` z liczbą obciętych. `toH`: `fps: state.fps`. Rename-safe: klucze zakresów w `scopes` są kluczami z
chwili commita (historyczne) — konsument mapuje przez `lc` (który już przenosi lineage) na bieżące; udokumentować w
komentarzu.
**Bump.** `HIST_V` h6→h7 (pełny re-walk).
**Test.** `history-footprints.test.mjs`: fixture z 6 commitami (w tym 1 rename, 1 mega-commit > megaCap): `H.fps`
ma 5 wpisów z właściwymi `files`/`scopes`/`renames`; mega-commit nieobecny; incremental ≡ full (dwa spacery,
`JSON.stringify(H.fps)` identyczne); cap: fixture z `CFG.fpsCap` nadpisanym przez env testowe → obcięcie z przodu i
log.
**Zależności.** Brak. **Pierwsze zadanie fazy 2.**

**Korekty recenzji Opus (2026-08-31):**
- **Błąd zakresu zmiennej.** `toks` (history.mjs ~139) jest liczone WEWNĄTRZ `if (fs2.length >= 1 && fs2.length <=
  CFG.megaCap && c.msg)` — commit bez wiadomości nie ma `toks` w zasięgu. `fs2` samo jest liczone POZA tym blokiem
  (~134). Jeśli `fps.push` ma warunek dopasowany do `fs2` (bez `c.msg`), odczyt `toks` tam rzuci ReferenceError na
  pierwszym commicie bez wiadomości. Podnieść liczenie `toks` NAD strażnik `c.msg` (np. `const toks = c.msg ? [...]
  : []`), zweryfikowane w źródle.
- **Sprzeczność: cap vs test bajt-identyczności.** Obcinanie „przy zapisie" ORAZ `toH: fps: state.fps` razem: pełny
  spacer w jednym procesie zwróci >cap wpisów, incremental cap — własny test `JSON.stringify(H.fps)` padnie na
  repo powyżej capu. Obcinać `state.fps` NATYCHMIAST PO `replay()`, przed `toH` I przed `atomicWrite`, w
  `loadHistory` (nie przy każdym zapisie). Trzymanie ostatnich N jest przemienne względem appendu, więc obcinanie
  raz na koniec jest bajt-identyczne z obcinaniem po każdym spacerze.
- **Rozmiar do zmierzenia, nie zgadnięty.** 20k × {sha, ts, author, ≤12 toks, files, scopes, renames} to
  orientacyjnie 10-30 MB dodatkowe do `history.json`, parsowane/serializowane przy KAŻDYM spacerze. Zmierzyć na
  repo z korpusu przed ustaleniem `CFG.fpsCap` na stałe 20000 — wpisać zmierzoną liczbę do biletu.
- **Do udokumentowania w komentarzu:** `walk()` emituje zdarzenia tylko dla ścieżek `CODE_RE` (history.mjs ~96) —
  `renames` w `fps` obejmuje więc WYŁĄCZNIE pliki kodu, podczas gdy `fp.files` (z `c.files`) obejmuje też pliki
  niekodowe. Ta asymetria ma znaczenie dla J2.3 (uniwersum plików między ramionami eval).
- Test NIE ma asercji na tekst logów (`log(...)` z liczbą obciętych) między pełnym a incremental — logi nie są
  stanem, tylko `H.fps` samo.

**Wykonanie.** `toks` podniesione nad strażnik `c.msg` (`c.msg ? [...] : []`); `touched` (sha→Set kluczy) i
`renamesBySha` (sha→pary) budowane w pętli zdarzeń; `fps.push` bramkowane TYM SAMYM warunkiem co `fileCommits`
(bez `c.msg`); obcinanie RAZ w `loadHistory` po `replay()`, przed `atomicWrite`/`toH`; `toH` zwraca `fps`.
`HIST_V` h6→h7 zbite przez wykonawcę (własny bump biletu, brak bileta-bliźniaka do połączenia). **Zmierzony
rozmiar** (spring-petclinic, 937 wpisów): +431 KB (~460 B/wpis) → ekstrapolacja na `CFG.fpsCap=20000` ≈ 9 MB —
znacznie mniej niż szacunek recenzji (10-30 MB); wartość 20000 zostaje bez zmian. **Weryfikacja niezależna:** diff
`history.mjs` przeczytany w całości (73 linie) — każda z 4 korekt potwierdzona dosłownie w kodzie; `config.mjs`
diff ograniczony do `HIST_V`+`CFG.fpsCap` (bez EXTR_V/MODEL_V/ENGINE_VERSION); wyłączono WYŁĄCZNIE `state.fps.push`
→ 4/4 testy `history-footprints.test.mjs` czerwone → przywrócono → 4/4 zielone → pełny zestaw **1167/1167**.
Znalezisko wykonawcy (nie naprawione, poza zakresem): `bh` (body-hash) nie zmienia się przy edycji samej wartości
literału — commit „touched" oznacza zmianę strukturalną, nie każdą edycję; istniejące zachowanie `bh`, nie
wprowadzone przez ten bilet, ważne dla konsumentów J2.2+.

#### J2.2 · `grain how <intent>` — zmiana przez przykład — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Opus**

**Zakres.** `core.mjs`: `howCmd({ model, H, query, top = 5, exemplarOk })`:
1. `qt` = `tokenize`+`normTok` minus `QSTOP` (jak `whereCmd`);
2. dla każdego `fp` w `H.fps`: tokeny commita `fp.toks` ∪ `nameTokens` każdej ścieżki w `fp.files`; wynik = suma IDF po
   commitach (`idf(t) = log2(1 + commitsN / df)`, `df = H.msgTokCommits[t]` dla tokenów wiadomości; dla tokenów ścieżek
   df liczone raz nad `fps` i cache'owane w `model.fpsPathDf` — `MODEL_V` fazy 2) / suma IDF zapytania — ten sam wzór co
   karty; próg `0.34` (ten sam „weak match");
3. top K commitów; K = `top`; zero → `map:` z `whereCmd`'s mapą (reuse) — nic zmyślonego;
4. miejsca: per plik z unii `files` top K: `k/K`, moduł (`refineModOf(model.filesAll, model.pkgs)`), istnieje w HEAD
   (`model.filesAll`/`pathsAll`) — jeśli nie, lineage przez `H.lc` path → nowa ścieżka lub `(deleted)`; zakresy z
   przykładu (commit nr 1): nazwy z `fp.scopes` po `#`;
5. `missingLines` dla zbioru plików przykładu (źródło co-change; później wszystkie).

**Korekty recenzji Opus (2026-08-31):**
- **BLOKER:** `ctx` (grain.mjs ~611, budowane z `ensureFresh`) NIE MA pola `H` — `ensureFresh`'s szybka ścieżka
  (cache świeży, grain.mjs ~89) zwraca `{model, meta, head, banner}` i WCALE nie woła `loadHistory`. `cmdExport`
  już obchodzi to przeładowując historię samodzielnie (grain.mjs ~427) — `cmdHow` potrzebuje analogicznego,
  LENIWEGO `getH()` (nie eager — eager parsowałoby spuchnięty przez `fps` `history.json` przy KAŻDYM `where`/
  `check`, nie tylko `how`). Zdefiniować zachowanie `how` gdy `H === null` (`--no-history`, płytki klon, brak gita)
  i pod `--no-refresh`/STALE.
- `map:` fallback żyje WEWNĄTRZ `whereCmd` (core.mjs ~1839-1849) i potrzebuje zarówno `cards` jak i `df` —
  doprecyzować: `how` wywołuje `whereCmd` wprost, czy ten blok wydzielony do osobnego helpera? (Decyzja projektowa
  dla wykonawcy Opus — ma sens).
- `example (<sha> <YYYY-MM>): "<msg>"` to DOKŁADNIE kształt `voice('example', text, {sha, date})` z J0.1 (core.mjs
  ~749) — użyć go wprost, nie formatować ręcznie ten sam string drugi raz. Linie miejsc (`<plik> (k/K)`) to głos
  praktykowany (bez markera). Fallback zero-trafień to `voice('map', …)`.
- `missingLines(model, files, {sources, newFileScopes})` (core.mjs, sprawdzić aktualną linię po J2.1): `how`
  nazywa pliki Z HISTORII i nigdy ich nie parsuje, więc NIE MA jak dostarczyć `newFileScopes` —
  `sources: ['cochange']` to JEDYNA poprawna konfiguracja (ticket już to mówił, teraz jawnie: `recipe` nie da się
  dokleić bez parsowania, nie rozszerzać domyślnie w przyszłości).

**Wyjście.** `«<q>» → how such a change runs here: K past changes match (evidence: examples, not a certified shape —
see J4.1)` · `example (<sha> <YYYY-MM>): "<msg>" — <n> files` · `places such a change touched:` · `  <plik> (k/K) —
<moduł> · scopes: a, b` … · blok `missing:` · `as of`. `--json`: `{ query, matches: [{sha, ts, msg, files}], places:
[{rel, k, of, module, exists, scopes}], missing }`. `grain.mjs`: `cmdHow`, dispatch, USAGE, parseArgv (`top` już
jest). MCP `grain_how { query, repo?, top? }`.
**Bump.** `MODEL_V` (fazy 2) tylko jeśli `fpsPathDf` ląduje w modelu; alternatywa bez bumpa: liczyć df przy zapytaniu
(H.fps ≤ 20k — O(n) przy każdym `how`) — wybrać wariant bez bumpa, jeśli pomiar na Johnie Briefie < 100 ms.
**Test.** `how-command.test.mjs`: fixture: 3 commity „add status X" (enum + dto + fixture + test) + 5 commitów szumu:
`how "add status"` → 3 dopasowania, 4 miejsca `3/3`, przykład = najnowszy z trzech; `how "nonexistent thing"` → `map:`,
zero miejsc; determinizm (dwa uruchomienia identyczne); `--json` kształt; MCP `grain_how` ≡ `--json`.
**Zależności.** J2.1, J0.1, J0.2.

**Wykonanie.** `howCmd({model, H, query, top, msgOf, mapRows, exemplarOk})` w core.mjs (wzorem `whereCmd`/`cmdWhere`
split), `cmdHow` w grain.mjs ładuje `H` samodzielnie (wzorem `cmdExport`, bez zmian w `ensureFresh`/`ctx`
współdzielonym). Zero trafień → deleguje CAŁKOWICIE do `whereCmd`, bez duplikacji mapy. `sources: ['cochange']`
jedyne poprawne dla `missingLines` (udokumentowane w kodzie). Ranking: score → recency (remis wygrywa najnowszy) →
sha (porządek całkowity). Zmierzona latencja przy `CFG.fpsCap=20000`: 14-35 ms (realny brief: 0.4 ms) — DECYZJA:
bez bumpa, df liczone przy zapytaniu tylko dla tokenów zapytania (nie całej historii).

**Trzy odstępstwa wykonawcy od briefu, poprawnie zdiagnozowane i naprawione (nie po cichu):**
1. `H.lc` NIE nadaje się do lineage old→new (klucze są PRZEPISYWANE do przodu przy rename, stary klucz kasowany) —
   użyto `fps[*].renames` (obie strony każdego rename, capped 20 skoków przeciw cyklom). Dodano test (f) poza
   listą briefu.
2. `fps` nie niesie treści wiadomości commita (tylko ≤12 tokenów) — `msgOf(sha)` czyta `git show -s --format=%s`
   tylko dla dopasowanych commitów (memoizowane), fallback do tokenów gdy git nie rozwiąże sha.
3. `df` liczone NAD `fps` bezpośrednio (nie `H.msgTokCommits`, który pomija commity bez wiadomości i nic nie wie o
   tokenach ścieżek) — udokumentowane w kodzie jako świadomy wybór spójności mianownika.

**Decyzje orkiestratora na zgłoszone przez wykonawcę pytania:**
- **„— see J4.1" w tekście dla użytkownika** — USUNIĘTE przeze mnie (jednoliniowy fix, K2 pkt 5): wewnętrzny numer
  biletu nigdy nie powinien trafiać do wyjścia produktu. Pełny zestaw pozostał zielony po zmianie (żaden test nie
  pinował dosłownego stringa).
- **„missing from your change:" w kontekście `how` (nie ma żadnej „zmiany")** — ZOSTAJE bez zmian: parametryzowanie
  wspólnego renderera `missingLines` per wywołujący łamałoby cel J0.2 („jeden renderer, jeden blok"); to kosmetyczna
  nitka, nie błąd funkcjonalny — świadomie odłożone, bez nowego biletu.

**Weryfikacja niezależna:** diff `core.mjs`/`grain.mjs`/`grain-mcp.mjs` przeczytany w całości; `config.mjs` diff
ograniczony do J2.1 (bez nowego bumpa); wyłączono WYŁĄCZNIE dopasowania (próg 0.34→2.0) → dokładnie 3/6 testów
`how-command.test.mjs` czerwone (a, c, f — wszystkie zależne od realnych dopasowań) → przywrócono → 6/6 → pełny
zestaw **1173/1173**, także po usunięciu „see J4.1". `mcp-server.test.mjs`'s zestaw narzędzi zaktualizowany do
pięciu (dodane `grain_how`) przez wykonawcę — sprawdzone, uzasadnione.

#### J2.3 · BRAMKA: `selftest --how` — plaster vs grep, leave-one-out — ✅ ZROBIONE, WERDYKT KOŃCOWY: **DALEJ** (przez F1, po STOP na oryginalnym kryterium pokrycia) · **model: Sonnet (harness) → Opus (werdykt bramki)**

**Zakres.** `core.mjs`: `howEval({ model, H, root, last = 100 })`: dla każdego z ostatnich `last` odcisków C (≤ megaCap,
≥ 2 pliki): intencja = tokeny `C.toks` (+ nic więcej), zbiór odcisków = `H.fps` bez C, przewidziane = miejsca z `howCmd`
(k ≥ 1); prawda = `C.files` żyjące w HEAD; **baseline grep** = pliki HEAD (`model.filesAll`), których ścieżka lub
treść (readFileSync, cap 1.5 MB) zawiera ≥ 1 token intencji (case-insensitive, po `normTok` obu stron). Metryki per C:
precyzja, pokrycie; agregat: średnie, mediany, `noMatch` (intencje bez dopasowania), `n`. `grain.mjs`: `selftest --how
[--last N]` drukuje tabelę `how: P=… R=… · grep: P=… R=… · n=… · no-match=…` + `--json`.
**Kryterium (zapisane tu, żeby nie ruszać go po fakcie):** na Johnie Briefie i na ≥ 6 repozytoriach korpusu z
`validation.md` (te, które mają ≥ 300 commitów nie-merge): pokrycie `how` ≥ pokrycie grepa ORAZ precyzja `how` ≥ 2×
precyzja grepa, w medianie. Wynik i decyzja (dalej / stop na J2) wpisane do tej sekcji jako „Bramka J2.3 — wynik".
**Test.** `how-eval.test.mjs`: na fixture z J2.2 harness liczy P/R dla znanych commitów (wartości ustalone ręcznie),
grep baseline liczony poprawnie na 2 plikach kontrolnych; `--json` parsowalne.
**Zależności.** J2.2. **Po tym bilecie: decyzja utrzymującego.**

**Korekty recenzji Opus (2026-08-31) — MECHANIZM WYMAGA POPRAWKI przed implementacją:**
1. **Asymetryczne uniwersa między ramionami — naprawić PRZED implementacją.** `fp.files` (z `c.files`) zawiera
   pliki niekodowe; `how`'s miejsca sprawdzają `filesAll`/`pathsAll` (core.mjs ~1238/1242); baseline grep ma być po
   `model.filesAll` (tylko kod). Prawda i oba ramiona MUSZĄ być nad tym samym uniwersum — ujednolicić na
   `model.pathsAll` dla obu ramion, grep czyta treść tylko tam gdzie plik jest czytelny. Bez tego `how` dostaje
   kredyt za recall na plikach, których grep nigdy nie mógł zobaczyć — bramka byłaby ustawiona nieuczciwie.
2. **Rozliczenie `noMatch` niedookreślone w kryterium, które ma być zamrożone.** Ustalić TERAZ: intencja bez
   dopasowania liczy się jako P=0/R=0 w średniej I w medianie (nie wykluczona — wykluczenie czyni bramkę
   „gameable": odpowiedz dobrze na 10% intencji i zdaj).
3. Próg „precyzja how ≥ 2× precyzja grepa" jest niemal trywialnie spełnialny przy typowej precyzji grepa ~0.01 —
   brakuje bezwzględnego progu podłogi. **Decyzja utrzymującego** (tylko flaga, nie rozstrzygam).
4. `howCmd` przyjmuje STRING zapytania; `howEval` ma tokeny. Doprecyzować interfejs (dodać parametr `toks`, albo
   złączyć spacją — bezpieczne, oba już przechodzą przez `normTok`).
5. Policzyć `path-df` RAZ na `howEval`, nie w pętli (inaczej 100× po 20k). Wykluczyć C zarówno z `fps`, jak i z
   `df` — inaczej przeciek w leave-one-out.
Nazwa-placeholder repozytorium próbnego w tekście biletu NIE JEST ruszana — mechanizm sprawdzony bez niej.

**Wykonanie (harness).** `howEval({model, H, root, last=100})` w core.mjs: uniwersum ujednolicone na `model.pathsAll`
(korekta 1); `noMatch` liczone i WŁĄCZANE do agregatu jako P=0/R=0, nigdy wykluczane (korekta 2); intencja =
`C.toks.join(' ')` (korekta 4); leave-one-out przez `H: {...H, fps: fps.filter(sha≠C.sha)}` przekazywane do
`howCmd`; tokenizacja ścieżek/treści cache'owana raz na całe wywołanie (częściowo korekta 5 — pełne cache'owanie
df zostaje wewnątrz `howCmd` per-wywołanie, zaakceptowane w briefie jako tanie po pomiarach z J2.2). CLI:
`selftest --how [--last N]` + `--json`, bez wpływu na zwykły `selftest`/`mutate-test`. **Weryfikacja niezależna:**
diff przeczytany w całości; `config.mjs` bez nowych zmian; wyłączono WYŁĄCZNIE wykluczenie leave-one-out
(`fps2 = fps`) → 5/7 testów `how-eval.test.mjs` czerwone (w tym (c) — bezpośredni dowód na wyciek) → przywrócono →
7/7 → pełny zestaw **1180/1180**. Wykonawca ręcznie wyliczył P/R dla każdego z 6 kandydatów na fixture i sprawdził
zgodność co do wartości — bardzo solidna weryfikacja własna.

**Utrzymujący (2026-08-31): repozytorium prywatne niedostępne w tej turze — „sklonuj sobie jakieś repozytoria jak
potrzebujesz". Bramka policzona na 10 publicznych repozytoriach z `docs/validation.md` (bez okhttp/typeorm —
sygnał już jednorodny na 10, pominięte dla czasu).**

**Bramka J2.3 — wynik**

**Korpus.** Repozytorium próbne utrzymującego niedostępne w tej turze — bramka policzona wyłącznie na
repozytoriach publicznych z `docs/validation.md`: 10 z 12 (pominięte okhttp i typeorm — najdłuższy zimny
build, sygnał był już jednorodny na 10). Każde sklonowane z PEŁNĄ historią do `/tmp` (nigdy do repo), każde
powyżej progu ≥ 300 commitów nie-merge (min. 759 — chi). Dla każdego: `refresh` (zimny indeks, w tym `H.fps`
z J2.1), potem `selftest --how --last 100 --json`.

| repo | commity nie-merge | pliki | `how` medP | `how` medR | grep medP | grep medR | 2× grep medP | R ≥ | P ≥ 2× | werdykt | no-match |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| spring-petclinic | 957 | 132 | 0,075 | 0,333 | 0,070 | 1,000 | 0,140 | NIE | NIE | STOP | 20% |
| CleanArchitecture | 850 | 258 | 0,000 | 0,000 | 0,036 | 1,000 | 0,071 | NIE | NIE | STOP | 30% |
| chi | 759 | 105 | 0,000 | 0,000 | 0,027 | 1,000 | 0,055 | NIE | NIE | STOP | 51% |
| gin | 1 791 | 130 | 0,708 | 0,775 | 0,029 | 1,000 | 0,058 | NIE | TAK | STOP | 27% |
| flask | 3 824 | 236 | 0,218 | 0,551 | 0,037 | 1,000 | 0,075 | NIE | TAK | STOP | 6% |
| axum | 1 971 | 503 | 0,286 | 0,667 | 0,012 | 1,000 | 0,024 | NIE | TAK | STOP | 18% |
| express | 5 678 | 213 | 0,667 | 1,000 | 0,091 | 1,000 | 0,182 | TAK | TAK | DALEJ | 29% |
| sinatra | 3 723 | 292 | 0,089 | 0,333 | 0,038 | 1,000 | 0,076 | NIE | TAK | STOP | 15% |
| Slim | 3 322 | 145 | 0,065 | 0,250 | 0,031 | 1,000 | 0,061 | NIE | TAK | STOP | 12% |
| nest | 12 435 | 2 307 | 0,450 | 0,697 | 0,008 | 1,000 | 0,016 | NIE | TAK | STOP | 8% |

**Agregat (mediana median po 10 repozytoriach — kryterium jest zapisane w medianach, więc każde repo waży tak
samo, niezależnie od liczby plików).** `how` medP = 0,154 · medR = 0,442; grep medP = 0,033 · medR = 1,000.
Pokrycie: 0,442 < 1,000 → **NIE**. Precyzja: 0,154 ≥ 0,066 → **TAK** (4,64×). **Agregat: STOP.** Per repo
kryterium przechodzi **1/10** (tylko express): połowa „pokrycie" przegrywa w 9/10, połowa „precyzja"
przechodzi w 7/10.

**Dlaczego pokrycie przegrywa: baseline grep zwraca prawie całe repozytorium.** Ręczna kontrola 6 przypadków
w 3 repozytoriach (K5 pkt 2) potwierdza, że grep dostaje DOKŁADNIE te same tokeny i nie jest chochołem —
używa tej samej kompozycji `nameTokens`+`normTok` co `how` dla ścieżek, a dodatkowo przeszukuje TREŚĆ plików,
czego `how` nie robi; jest hojniejszy niż `how`, nie słabszy. Skutek: intencja to 3-9 tokenów z komunikatu
commitu, a token typu `github`, `byte`, `func`, `fix`, `dep` trafia w treść niemal każdego pliku. Zmierzone
zbiory przewidziane przez grep: gin 91-102 ze 130 plików (70-79% repo), nest 520 z 2307, express 16-54 z 213.
Stąd grep medR = 1,000 we WSZYSTKICH dziesięciu repozytoriach przy precyzji 0,004-0,125. Połowa „pokrycie
`how` ≥ pokrycie grepa" znaczy więc w praktyce „`how` też musi zwrócić większość repozytorium" — czego celny
plaster z definicji nie robi.

**Precyzja bezwzględna — korekta #3, flaga dla utrzymującego.** Obawa z recenzji fazy 2 potwierdza się co do
grepa, ale nie unieważnia wyniku `how`. Grep medP mieści się w 0,008-0,091 (mediana 0,033), więc próg 2× jest
istotnie niski. Bezwzględna precyzja `how` to 0,000-0,708 (mediana 0,154; średnia średnich 0,331), a przewaga
nad grepem sięga od „brak" (CleanArchitecture, chi: medP = 0) do 55× (nest: 0,450 vs 0,008). Rozrzut jest
ogromny i NIE tłumaczy się rozmiarem repozytorium (gin: 130 plików, medP 0,708; chi: 105 plików, medP 0,000).
Decyzja o bezwzględnym progu podłogi pozostaje przy utrzymującym — werdykt bramki jej nie przesądza.

**`no-match`.** 6-51% intencji bez żadnego przewidzianego miejsca (średnia 21,6%, mediana 19%); najgorzej chi
(51%), CleanArchitecture (30%), express (29%). Liczone jako P=0/R=0 zgodnie z korektą #2, nigdy wykluczane.

**Werdykt: STOP.** Kryterium zamrożone w tym bilecie nie jest spełnione ani per repo (1/10), ani w agregacie,
i nie jest to przypadek graniczny — połowa „pokrycie" przegrywa w 9 z 10 repozytoriów dużym marginesem. Fazy
3-5 pozostają NIEZROBIONE z adnotacją „wstrzymane po bramce J2.3" (K5 pkt 3). Do decyzji utrzymującego, co
dalej: połowa „precyzja" przechodzi w 7/10 repozytoriów i 4,64× w agregacie — sygnał, że plaster wybiera
CELNIEJ, a nie że wybiera źle; niewygrywalną czyni połowę „pokrycie" konstrukcja baseline'u (grep oddający
1/4-3/4 repozytorium przy recall 1,000). Czy przeformułować kryterium (np. F1, albo pokrycie przy
porównywalnej liczbie zwróconych plików), czy uznać wynik za rozstrzygający dla `how` — decyzja
utrzymującego, poza zakresem tego werdyktu.

**Uwaga metodologiczna wykonawcy (gate-J2.3):** tokeny intencji zawierają szum z komunikatów commitów —
prefiksy conventional-commit (`chore`, `refactor`, `perf`) i gołe numery PR. Oba ramiona dostają ten sam szum,
więc porównania to nie zaburza, ale oznacza, że leave-one-out jest hałaśliwszym przybliżeniem prawdziwej
intencji agenta, niż sugeruje brief.

**FAZY 3-5 WSTRZYMANE PO BRAMCE J2.3 (K5 pkt 3), oczekują decyzji utrzymującego.** J2.4 i J2.5 NIE zależą od
wyniku tej bramki (są samodzielnymi biletami fazy 2) i mogą być dokończone niezależnie od tej decyzji.

**Przeliczenie pod F1 (na wyraźne polecenie utrzymującego, po pytaniu „jak zrobić to jakościowo").** Zamrożone
kryterium bramki karze `how` za nieosiągnięcie pokrycia grepa, który z konstrukcji zwraca 20-80% repozytorium
(recall≈1 niemal za darmo) — F1 (średnia harmoniczna precyzji i pokrycia) karze symetrycznie za zwracanie za
dużo i za mało, więc nie jest zniekształcone różnicą rozmiaru odpowiedzi między ramionami. Dodane do `howEval`
jako pole dodatkowe (`meanF1`/`medF1` w obu ramionach, core.mjs) — czysto addytywne, bez zmiany P/R ani progu
IDF `how`. TDD: test na tej samej hand-verified fixture (`how-eval.test.mjs`) czerwony przed dodaniem pól,
zielony po; dwa istniejące testy blokujące dokładny format tekstowy zaktualizowane o `F1=`. Pełny zestaw
**1180/1180** po zmianie. Ponowne uruchomienie na TYCH SAMYCH 10 repozytoriach (klony i indeksy w `/tmp` z
pierwszego przebiegu, bez re-klonowania):

| repo | how medF1 | how meanF1 | grep medF1 | grep meanF1 | how vs grep |
| --- | --- | --- | --- | --- | --- |
| spring-petclinic | 0,119 | 0,171 | 0,124 | 0,166 | remis (lekko gorzej) |
| CleanArchitecture | 0,000 | 0,307 | 0,069 | 0,098 | gorzej (mediana) |
| chi | 0,000 | 0,240 | 0,054 | 0,088 | gorzej (mediana) |
| gin | 0,571 | 0,530 | 0,057 | 0,089 | znacznie lepiej |
| flask | 0,301 | 0,328 | 0,072 | 0,092 | znacznie lepiej |
| axum | 0,369 | 0,425 | 0,023 | 0,035 | znacznie lepiej |
| express | 0,667 | 0,555 | 0,167 | 0,170 | znacznie lepiej |
| sinatra | 0,146 | 0,260 | 0,073 | 0,098 | lepiej |
| Slim | 0,111 | 0,179 | 0,059 | 0,100 | lepiej |
| nest | 0,500 | 0,489 | 0,016 | 0,037 | znacznie lepiej |

**Agregat (mediana median):** `how` F1 = 0,223 vs grep F1 = 0,064 — **`how` ok. 3,5× lepszy**. **`how` wygrywa
F1 w 7/10 repozytoriów, remisuje w 1 (spring-petclinic), przegrywa w 2 (CleanArchitecture, chi).** Przegrane
POKRYWAJĄ SIĘ dokładnie z trzema repozytoriami o najwyższym `no-match` (chi 51%, CleanArchitecture 30%,
spring-petclinic 20%) — `how` tam nie tyle myli się co MILCZY (P=R=0 przy braku dopasowania), co F1 karze tak
samo jak pomyłkę, choć milczenie jest uczciwsze niż zgadywanie. Milczenie `how` nie jest ciche dla użytkownika:
przy zero dopasowań `how` jawnie spada na mapę `whereCmd` (nigdy nie zmyśla) — to już jest zaimplementowana,
uczciwa ścieżka (jedna z czterech uczciwych „nie wiem" produktu), nie cichy błąd.

**Wniosek orkiestratora (rekomendacja, nie decyzja — ta zostaje przy utrzymującym):** oryginalne kryterium było
źle skonstruowane (potwierdzone pomiarem, nie tylko podejrzeniem z recenzji) — porównanie „pokrycie" karało
narzędzie celne za nieosiągnięcie pokrycia narzędzia rzucającego siecią na cały ocean. F1, policzone na TYCH
SAMYCH danych bez zmiany kodu `how`, pokazuje realną, mierzalną przewagę `how` nad grepem w większości
repozytoriów (3,5× w agregacie), z jednym prawdziwym, nazwanym ograniczeniem: na mniejszych/starszych
repozytoriach `how` czasem nie ma nic do powiedzenia (wysoki `no-match`), co produkt już dziś obsługuje uczciwie
(spadek na mapę), nie fałszywym dopasowaniem. Rekomendacja: **DALEJ** do faz 3-5, z tym pomiarem i jego
interpretacją zapisanymi tu jako część rekordu bramki.

**DECYZJA UTRZYMUJĄCEGO (2026-08-31): DALEJ.** Potwierdzone wprost po przedstawieniu wyniku F1. **BRAMKA J2.3
ZAMKNIĘTA — FAZY 3-5 ODBLOKOWANE.** Werdykt ostateczny bramki: DALEJ (na podstawie F1, nie oryginalnego,
błędnie skonstruowanego kryterium pokrycia).

#### J2.4 · Most językowy z testem akceptacji (domyka B1) — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Opus**

**Zakres.** `core.mjs` `learn()`, blok `model.msgAffinity`: dla tokenu t (`df = H.msgTokCommits[t]`) i pliku f
(`k = H.msgAff[t][f]`), baza = `H.fileCommits[f] / H.commitsN`; komórka 2-wartościowa (dotknięty : nie) nad `df`
commitami; dane = k·log2(kt(k/df)/baza) + (df−k)·log2(…) — dokładnie kształt `architectureNorms`; `bits > 0` i
`(k+½)/(df+1) ≥ 1−1/λ` względem bazy → most; `filler` znika jako reguła (token o wysokim df nie kompresuje). Format
`msgAffinity` bez zmian (dodatkowo `bits` per wiersz).
**Bump.** Brak (render z `H`; `msgAffinity` już w modelu — kształt bez zmian, `MODEL_V` niepotrzebny; jeśli `bits`
dochodzi jako pole → wspólny bump fazy 2).
**Test.** `bridge-acceptance.test.mjs`: token współwystępujący z plikiem na poziomie bazy (plik w 80% commitów,
token w 3 z 4 jego commitów) → brak mostu (czerwony dziś: `n >= 2` przepuszcza); token realnie związany (plik rzadki,
token trafia go w 5/5) → most; test `history bridge` istniejący bez regresu.
**Zależności.** Brak od J2.1 — ALE NIE od niczego: `H.fileCommits` NIE ISTNIEJE dziś na `H` (`toH`, history.mjs
~150-161, zwraca `lc, vev, cochange, msgAff, msgAffEx, msgTokCommits, commitsN, NOW, firstTs, stats` — BEZ
`fileCommits`, mimo że `state.fileCommits` jest liczone i trzymane wewnętrznie, ~109/143/153). Prawdziwa zależność:
dodać `fileCommits: state.fileCommits` do zwrotu `toH` — jedna linia, bez bumpa `HIST_V` (kształt stanu bez zmian,
tylko dotąd nieeksponowane pole). To PREREKWIZYT tego biletu, zrobić go jako jego pierwszy krok. (Nie zmienia to
kolejności wykonania — nadal sekwencyjnie, jeden wykonawca naraz, zgodnie z ustaloną metodyką).

**Korekty recenzji Opus (2026-08-31):** `idxCost`'s uniwersum indeksu (liczba rozważanych par (token, plik)) nie
jest zdefiniowane w zakresie — dopisać, bo zmienia to, które mosty przetrwają próg λ.

**Wykonanie.** Test akceptacji zaimplementowany dokładnie wg wzoru (KT vs stała baza, `idxCost` liczony raz nad
całym surowym `H.msgAff`, próg λ w kierunku „dotknięty"). `H.fileCommits` dodane do `toH` jako prerekwyzyt
(autoryzowane przez orkiestratora, bez bumpa `HIST_V`). Oba istniejące fixture'y (`affinity.test.mjs`,
`voices.test.mjs`) rozrośnięte tak, żeby ich most miał df≥3 i realnie przebijał próg λ, zamiast osłabiać test.
Pełny zestaw **1186/1186**.

**Znalezisko wykonawcy — moja wcześniejsza decyzja o `filler()` była BŁĘDNA, cofnięta na podstawie konkretnej
liczby.** Orkiestrator (ja) błędnie założył, że nowy test akceptacji jest ściślejszy niż `filler()` i że oba
mechanizmy dają identyczny wynik. Wykonawca to obalił: `filler()` i test MDL/λ NIE są zagnieżdżone — token
`endpoint` przy df=12 (k=12, commitsN=40, baza=0.325) dostaje `bits=+5.99`, λ=0.9615 ≥ 0.875, kierunek prawidłowy
— doskonały most na każdej osi kryterium — a `filler()` niszczy go wyłącznie dlatego, że `12 > max(8, 0.15·40=6)`.
To dokładnie potwierdza pierwotny zapis planu „filler znika jako reguła": po wprowadzeniu prawdziwego testu MDL,
`filler()` nie jest tanią nadmiarową bramką — aktywnie kasuje mosty zarobione statystycznie. Zgodnie z filozofią
tego kodu („jeden test akceptacji wszędzie", λ jako JEDYNA stała decyzyjna zamiast wielu strojonych progów) —
`filler()` zostaje USUNIĘTY jako oddzielny mechanizm.

#### J2.4b · Usunięcie `filler()` + naprawa mianownika `baza` — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Opus**

**Cel.** Naprawić błędną decyzję orkiestratora z J2.4 (zostaw `filler()`) na podstawie kontrprzykładu wykonawcy,
POTWIERDZONĄ przez niezależną opinię (osobny agent Opus, na wyraźne polecenie utrzymującego: „jak coś trudne do
rozkminy, palisz opusa/fable po opinię, sam nie decydujesz") — i naprawić dodatkowy błąd, który ta opinia znalazła
przy okazji: `filler()` przypadkiem maskował realny błąd mianownika.

**Werdykt niezależnej opinii (2026-08-31):** USUNĄĆ `filler()` — ale uzasadnienie w planie („token o wysokim df
nie kompresuje") jest MATEMATYCZNIE ODWROTNE do prawdy. Dla pary niosącej realny sygnał człon danych rośnie
LINIOWO w `df`, kara tylko `0.5·log2(df) + idxCost` — WIĘCEJ df to WIĘCEJ dowodu, nie mniej (przykład liczbowy:
df=1000, k=1000, baza=0.5, commitsN=2000 → bits ≈ +978). To, co naprawdę odrzuca token-wypełniacz, to `k/df ≈
baza` — ORTOGONALNE do df, i już egzekwowane przez dwie twarde bramki testu (`k/df > baza` oraz próg λ). Zero
roli obronnej: brak ryzyka numerycznego (kt() nigdy się nie degeneruje), zero zysku wydajnościowego (`universe3`
i tak enumeruje każdą parę przed jakimkolwiek filtrem).

**Znalezisko dodatkowe niezależnej opinii — realny błąd mianownika, dotąd maskowany przez `filler()`:**
`baza = fileCommits[f]/commitsN`, ale `fileCommits`/`msgTokCommits` liczą WYŁĄCZNIE commity nie-masowe
(1..`CFG.megaCap`=30 plików, history.mjs ~148-152), podczas gdy `commitsN` (`state.commits`) liczy WSZYSTKIE
commity, w tym masowe (history.mjs ~161). Token obecny w KAŻDYM nie-masowym commicie dostaje `k/df =
baza·(N_wszystkie/N_niemasowe) > baza` ZA DARMO — pozorny nadmiar, mnożony przez duże `df` w setki bitów
fałszywego dowodu. `filler()` dziś PRZYPADKIEM blokuje tę klasę (wysokie df → wysoki ρ → filler odrzuca), więc
usunięcie samego `filler()` BEZ tej naprawy otworzyłoby drogę do fałszywych mostów.

**Zakres.**
1. `core.mjs`, blok `model.msgAffinity`: usunąć wywołanie `filler(t)` jako pre-filtr tokenów (samą definicję
   `filler` usunąć, jeśli nieużywana nigdzie indziej — `grep -n "filler" core.mjs`).
2. **Naprawa mianownika (nowa, z niezależnej opinii):** `baza` musi być liczone nad TĄ SAMĄ populacją co
   `fileCommits`/`msgTokCommits` (commity nie-masowe), nie nad `H.commitsN` (wszystkie). Dodać do `history.mjs`
   nowy licznik stanu, np. `state.nonMegaCommits`, inkrementowany w TYM SAMYM miejscu i pod TYM SAMYM warunkiem co
   `state.fileCommits[f]++` (`fs2.length >= 1 && fs2.length <= CFG.megaCap`, RAZ na commit, nie per plik — uważać
   na podwójne liczenie, bo `fileCommits` inkrementuje się per plik w pętli `for (const f of fs2)`, licznik
   commitów ma się zwiększyć raz przed/poza tą pętlą wewnętrzną). Wyeksportować przez `toH` jako
   `nonMegaCommits: state.nonMegaCommits`. To JEST nowe pole stanu (nie tylko dotąd nieeksponowane, jak
   `fileCommits` w J2.4) — **wymaga bumpa `HIST_V`** (pełny re-walk, żeby istniejące cache'e dostały poprawną
   wartość zamiast `undefined`/0). **DECYZJA:** wykonawca bumpuje `HIST_V` SAM (h7→h8), dokładnie jak J2.1 zrobił dla `fps` —
   to jedyny bilet dotykający `HIST_V` w tym momencie partii, ten sam precedens.
3. `bridgeBits`: `baza = (fc3[f] || 0) / (H.nonMegaCommits || 1)` zamiast `/ cn3` (`cn3 = H.commitsN`).
4. Sortowanie top-6 plików per token (`fs3.slice(0,6)`): zmienić z sortowania po surowym `n` na sortowanie po
   `bits` (trzeci element trójki) — to JEST teraz właściwa miara dowodu, prezentacja top-6 powinna pokazywać
   NAJSILNIEJSZE dopasowania, nie najczęstsze.
**Świadomie NIE w tym bilecie:** `tot >= 2` (agregatowa podłoga na sumę `n` z top-6) zostaje bez zmian — to osobny,
uzasadniony próg gęstości dowodu na cały token, nie część testu per-parowego naprawianego tutaj.
**Test.** (a) endpoint df=12 z raportu wykonawcy (albo równoważny) TERAZ przechodzi jako most — czerwony przed
poprawką, zielony po. (b) Prawdziwie nieinformacyjny token wysokiego df odrzucany przez SAM test akceptacji
(`k/df ≈ baza`), nie przez `filler()`. (c) **Nowy, kluczowy test naprawy mianownika:** token obecny w KAŻDYM
nie-masowym commicie danego repo (wysoki `df` bliski `nonMegaCommits`) na pliku o niskim `baza` — z NAPRAWIONYM
mianownikiem `k/df` nie przekracza sztucznie `baza` tylko przez różnicę populacji `commitsN` vs `nonMegaCommits`;
skonstruować fixture z realnymi commitami masowymi (>30 plików), żeby `commitsN > nonMegaCommits` naprawdę się
różniły — czerwony PRZED naprawą mianownika (fałszywy most), zielony po. (d) Sortowanie top-6 po `bits`, nie `n` —
fixture gdzie kolejność się różni między dwoma kryteriami.
**Bump.** `HIST_V` h7→h8 (nowe pole `nonMegaCommits`) — wykonawca robi SAM, komentarz cytujący ten bilet, wzorem
J2.1. `MODEL_V`/pozostałe: brak zmiany poza wspólnym bumpem fazy 2 dla `bits`.
**Zależności.** J2.4 (zrobione).

**Wykonanie.** `filler()` usunięte całkowicie (wywołanie + definicja). `state.nonMegaCommits` dodane do
`freshState()`, inkrementowane RAZ NA COMMIT (poza pętlą per-plik — pułapka podwójnego liczenia uniknięta,
zweryfikowane empirycznie przez wykonawcę: bez commitów masowych `nonMegaCommits === commitsN`). `bridgeBits`'s
`baza` liczone teraz nad `H.nonMegaCommits` zamiast `H.commitsN`. Top-6 sortowane po `bits` (nie `n`). `HIST_V`
h7→h8 zbite przez wykonawcę z komentarzem cytującym bilet. **Weryfikacja niezależna:** diff przeczytany w całości
(`filler` potwierdzone martwe — tylko niepowiązane wzmianki „instruction filler" w komentarzach gdzie indziej);
cofnięto WYŁĄCZNIE mianownik (`nmc3 = H.commitsN` zamiast `H.nonMegaCommits`) → dokładnie 1/10 testów
(`bridge-acceptance.test.mjs`, test (f) — dowód naprawy mianownika) czerwony, reszta zielona → przywrócono →
10/10 → pełny zestaw **1190/1190**. Żaden test nie hardkoduje starego `h7`. Naprawiono też przy okazji defekt
formatowania w tym planie (zgubiony nagłówek `#### J2.5`, zgłoszony przez wykonawcę). Wykonawca sam
zweryfikował KAŻDĄ z 3 zmian osobno (odwracał jedną na raz) — bardzo solidna dyscyplina własna.

#### J2.5 · Placement z historii przenosin (dawne H2) — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** `core.mjs` `placementHit(model, rel, H)`: z `H.fps[*].renames` zbudować (raz per model, cache na obiekcie
modelu jak `_archModOf`) mapę klucz nazwy (`sufOf` + token `nameTokens`) → liczniki par (`dirname(old)` → `dirname
(new)`); dla nowego `rel`: jeśli istnieje para (katalog `rel`) → D z `n ≥ 2` i `n / (wszystkie renamy z tego klucza
i katalogu) ≥ 2/3` → drugie zdanie noty: `and <n> of <m> such files born here were later moved to \`D/\``. Głos
praktykowany. `check-hook --pre` i `cmdCheck` przekazują `H` (dziś `placementHit(model, rel)` — rozszerzyć sygnaturę;
`H` dostępne w `ensureFresh`? NIE — model nie niesie `fps`; opcje: (a) `learn()` wypisuje do modelu skompresowaną mapę
renamów `model.moves = { '<suf>#<tok>': { 'from→to': n } }` (mała) — wybrać (a), `MODEL_V` fazy 2).
**Test.** `placement-moves.test.mjs`: fixture z 3 renamami `src/X.handler.ts → src/handlers/X.handler.ts` w historii:
`check-hook --pre` dla `src/New.handler.ts` drukuje zdanie o przenosinach (czerwony dziś); bez renamów — nota jak
dziś.
**Zależności.** J2.1.

**Korekty recenzji Opus (2026-08-31):**
- **Bilet sam sobie przeczy — usunąć zdanie o rozszerzeniu sygnatury.** Wybrana opcja (a) (`model.moves`) NIE
  wymaga żadnej zmiany sygnatury `placementHit(model, rel)` (core.mjs ~1332) — WSZYSTKIE 4 miejsca wywołania
  (core.mjs ~1384; grain.mjs ~209, ~293, ~578) są dwuargumentowe i zostają bez zmian. Usunąć zdanie „rozszerzyć
  sygnaturę" z zakresu — to sprzeczne z wybraną opcją.
- Mocniejsze uzasadnienie (a) niż w bilecie: na ścieżce ciepłego cache'u `ensureFresh` zwraca się (grain.mjs ~89)
  BEZ wołania `loadHistory` w ogóle — `H` jest niedostępne dla `check-hook` Z KONSTRUKCJI, nie tylko z niewygody
  przekazywania. Zapisać to uzasadnienie w bilecie, żeby nikt nie wracał do opcji (b).
- **Miejsce wstawienia, nieokreślone w bilecie:** zdanie o przenosinach należy do gałęzi name-kin (core.mjs
  ~1355-1358) — JEDYNEJ niosącej `token`; dwie gałęzie fallback (~1359-1371) mają `token: null`, więc klucz
  `<suf>#<tok>` nie miałby tam czego szukać. Dokleić WEWNĄTRZ istniejącego wywołania `voice('practiced', …)` przy
  ~1358 — jeden wrapper na całą notę, nie drugie wywołanie voice().

**Wykonanie.** `model.moves` budowane w `learn()` z `H.fps[*].renames` (te same `sufOf`/`nameTokens` co
`placementHit`), pomijając rename w tym samym katalogu. Konsumowane w gałęzi name-kin tuż po wyborze `best`,
próg `n≥2 && n/total≥2/3`, jedno zdanie dopisane do TEGO SAMEGO `voice('practiced', …)`. Sygnatura
`placementHit(model, rel)` bez zmian, wszystkie 4 miejsca wywołania nietknięte. Wykonawca poprawił styl
sklejenia zdania (zwykłe zdanie zamiast myślnika po kropce, wzorem istniejącego `rivalBit`) — rozsądna,
kosmetyczna decyzja w ramach briefu. **Weryfikacja niezależna:** diff przeczytany w całości; `config.mjs` bez
dodatkowych zmian poza wcześniejszym `HIST_V`/wspólnym `MODEL_V`; wyłączono WYŁĄCZNIE bramkę 2/3 → dokładnie
1/4 testów (`placement-moves.test.mjs`, test (a)) czerwony → przywrócono → 4/4 → pełny zestaw **1194/1194**.

**FAZA 2 W CAŁOŚCI ZROBIONA (J2.1–J2.5 + J2.4b), zweryfikowana niezależnie na każdym bilecie. Bramka J2.3
rozstrzygnięta: DALEJ (F1, decyzja utrzymującego 2026-08-31). Wspólny bump `MODEL_V` m16→m17 (J2.4/J2.4b `bits`
+ J2.5 `model.moves`) wykonany przez orkiestratora, pełny zestaw po bumpie: **1194/1194**. Dalej: Faza 3.**

### Faza 3 — Rzecz: wartości, krewni, `what`

#### J3.1 · Konkordancja wartości — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Opus**

**Zakres.** `core.mjs` `extractScopes`: przed `scopes.push({ kind: 'file' … })` zebrać `vals`: (a) człony enumów —
dla węzłów, których typ pasuje do `wordBounded(['enum'])` i ma ciało (`body`/`looseBody`): dzieci z polem `name` lub
typu `identifier`/`enumerator`/`enum_entry`-podobnym (po `node-types.json`: każdy typ potomka z polem `name`) → `{ v:
text, k: 'enum', line, c: hash(typ węzła + tekst nagłówka enuma) }`; (b) literały stringowe — te same typy co
`lexicalPreds` STR, tekst bez cudzysłowów, 1–40 znaków, bez `\n`, poza węzłami importów (`b.imp`) → `{ v, k: 'str',
line, c: hash(typ + startIndex rodzica-kontenera) }`, gdzie kontener = najbliższy przodek typu `switch_*|object|
dictionary|array|enum_*|case_*|match_*` (po `wordBounded`) lub sam plik. Dedup per (v, k), cap 200/plik.
`serializeScope` niesie `vals` na zakresie plikowym. `learn()`: `model.valueIndex = { '<k>:<v>': [[rel, line], …] }`
dla wartości o df plików w `[CFG.valueDfMin = 2, CFG.valueDfMaxShare = 0.2 × files]` (progi mocy → rezyduum);
`model.valueSiblings = { '<c>': ['<k>:<v>', …] }` dla kontenerów z ≥ 2 członkami, w których ≥ 2 członków ma wpis w
`valueIndex`. Cap łączny 20 000 wpisów indeksu (log przy obcięciu).
**Bump.** `MODEL_V` (fazy 3, wspólny z J3.2/J3.4) — **TYLKO `MODEL_V`, NIE `EXTR_V`**.
**Test.** `value-index.test.mjs`: fixture `enum UserStatus { ACTIVE, SUSPENDED }` (TS) + literały `'SUSPENDED'` w 3
plikach + `'ACTIVE'` w 3: `valueIndex['enum:SUSPENDED']` i `['str:SUSPENDED']` mają właściwe miejsca; rodzeństwo
kontenera enuma = {ACTIVE, SUSPENDED}; wartość w 1 pliku nieobecna; wartość w > 20% plików nieobecna; Python/Go
kontrola (enum-podobne konstrukcje po gramatyce, nie po nazwie — co gramatyka da, to test przyjmuje: asercja tylko na
literałach dla języków bez węzła enum).
**Zależności.** Brak.

**Korekty recenzji Opus (2026-08-31):**
- **Bump BŁĘDNY w bilecie — usunąć `EXTR_V g24→g25`.** `BlobCache` (history.mjs ~48-53) jest kluczowany WYŁĄCZNIE
  `EXTR_V`, ale NIE przechowuje wyjścia `serializeScope` — przechowuje zredukowany rekord `{k,n,o,bh,val}` budowany
  ręcznie (history.mjs ~98-100), bez `vals`, i nigdy go nie będzie potrzebował. Cache, który RZECZYWIŚCIE niesie
  `serializeScope` (`treeCacheOut`), jest unieważniany przez `ensureFresh`'s `versionOk` (grain.mjs ~72), które i
  tak sprawdza `MODEL_V` — sam bump fazy 3 `MODEL_V` już wymusza pełną re-ekstrakcję HEAD i wypełnia `vals`.
  Dodatkowy bump `EXTR_V` kasowałby CAŁY blob cache i wymuszał pełny re-walk `git log` dla pola, którego warstwa
  historii nigdy nie czyta — czysty koszt bez korzyści. (Konsekwencja: J5.6's dopisek „jeśli faza 3 już zbumpowała
  g25, to g26" jest nieaktualny — J3.1 NIE bumpuje `EXTR_V`, więc J5.6, jeśli bumpuje `EXTR_V`, bierze g25.)
- `CFG.valueDfMin`/`CFG.valueDfMaxShare` NIE ISTNIEJĄ pod żadną nazwą — potwierdzone, sprawdzony cały `CFG`
  (config.mjs ~52-56). **Uzasadnione, ale umieścić poprawnie:** to bramka populacji/gęstości na to, co wchodzi do
  INDEKSU — strukturalnie identyczna z istniejącymi progami wsparcia słownika `SUP`/`TOPK` (config.mjs ~58-59) i z
  `CFG.minRaw`/`minEff` (już wyjęte przez komentarz CFG jako „compute short-circuits"). To NIE jest rywalizujący
  test akceptacji dla twierdzenia. Umieścić obok `SUP`/`TOPK` albo `minRaw`, z komentarzem wprost mówiącym, że to
  NIE jest drugie/trzecie λ.
- Lista typów `STR` (`['string','string_literal','interpreted_string_literal','encapsed_string','raw_string']`)
  jest DZIŚ lokalną stałą WEWNĄTRZ `lexicalPreds` (core.mjs ~439), nie na poziomie modułu — wynieść przed ponownym
  użyciem.
- `vals` potrzebuje WŁASNEGO przejścia po drzewie — główny spacer w `extractScopes` `continue`uje mijając
  poddrzewa importów (core.mjs ~150) i schodzi przez ciała zakresów, więc nie da się tego dopiąć „przy okazji".
  Użyć osobnego `tree.rootNode.descendantsOfType(...)`, wzorem bloku LOADERS (core.mjs ~262-271), z capem jak
  `lexicalPreds`'s własny skan STR (`.slice(0, 2000)`, core.mjs ~440).
- **TS: gołe człony enuma (`enum UserStatus { ACTIVE, SUSPENDED }`) to liście `property_identifier` BEZ pola
  `name`** — główna reguła bileta („każdy typ potomka z polem `name`") nie odpali dla fixture'a z własnego testu
  bileta; ODPALI SIĘ fallback (`identifier`/`enumerator`/`enum_entry`-podobne). Ten fallback jest NOŚNY, nie
  dekoracyjny — dopisać to wprost, inaczej flagowy test bileta padnie.

**Wykonanie.** `STR_TYPES` wyniesione na poziom modułu (dzielone teraz przez `lexicalPreds` i konkordancję
wartości — jedna lista, jedno źródło prawdy o „co jest stringiem"). `ENUM_LIKE_RE`/`ENUM_MEMBER_RE`/`CONTAINER_RE`
dodane wzorem `TYPE_LIKE_RE`/`FUNC_LIKE_RE` (`wordBounded`, bez nazw języków). Osobne przejście po drzewie tuż
przed `scopes.push({kind:'file',…})` (nie przy okazji głównego spaceru, zgodnie z korektą) — (a) człony enumów:
dziecko z polem `name` ALBO (fallback, gdy brak pola `name`) typu `identifier`/`enumerator`/`enum_entry`-podobnego
(bilet mówił „i", co jest niespełnialne jednocześnie — wykonawca poprawnie zaimplementował jako LUB, zgodnie z
polskim oryginałem bileta); klucz kontenera = tożsamość enuma (typ węzła + jego własna nazwa, bez ścieżki —
scalanie międzyplikowe jest zamierzone i przetestowane); (b) literały stringowe poza importami, klucz kontenera =
pozycja (typ + startIndex) + **`rel` (ścieżka pliku), odstępstwo od briefu** — czysto pozycyjny hash groziłby
fałszywym scaleniem dwóch różnych plików otwierających tę samą konstrukcję na tym samym offsecie; enum-kontenery
CELOWO zostają bez `rel` (scalanie międzyplikowe to sens rodzeństwa enuma), asymetria skomentowana w kodzie i
pokryta dedykowanym testem `(d)`. Nazwy członków enuma dostały limit 80 znaków zamiast 1–40 zarezerwowanego dla
stringów (człony enuma bywają dłuższe niż typowa wartość string). `learn()`: `model.valueIndex` z bramką
`CFG.valueDfMin`/`Math.ceil(CFG.valueDfMaxShare × files)` (górna granica włącznie), cap 20000 z logiem przy
obcięciu (najsłabszy dowód — najmniej miejsc — odpada pierwszy, remisy po kluczu, dla bitowej identyczności
inkrementalnego i pełnego przebudowania). `model.valueSiblings` niesie WYŁĄCZNIE członków, którzy przeżyli bramkę
indeksu (nie pełne członkostwo kontenera) — świadome zawężenie, wykonawca oznaczył je do rewizji przy J3.2.
`serializeScope` niesie `vals: s.vals || []`. `EXTR_V` NIETKNIĘTE (zgodnie z korektą — `BlobCache` nie
przechowuje `vals`). **Weryfikacja niezależna:** diff `core.mjs`/`config.mjs` przeczytany w całości — `config.mjs`
bez zmian poza dwoma nowymi kluczami `CFG` i komentarzem odróżniającym je od λ; wersje (`HIST_V`/`MODEL_V`)
niezmienione względem stanu po Fazie 2, `EXTR_V` potwierdzone nietknięte. Cofnięto WYŁĄCZNIE fallback
`ENUM_MEMBER_RE` (usunięta gałąź `else if`) → dokładnie 2/11 testów (`value-index.test.mjs`: test flagowy „TS
bare enum members" i test rodzeństwa enuma) czerwone, dowód że fallback jest nośny, nie dekoracyjny → przywrócono
→ 11/11 → pełny zestaw **1205/1205**.

#### J3.2 · Kompletność krewnych: rodzeństwo wartości + pień nazwy (I4 + H5) → `missing: kin:` — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Opus**

**Zakres.** `core.mjs`: `kinCompleteness(model, files)` z dwoma rodzajami krewieństwa:
(a) **wartości**: dla każdej wartości `v` obecnej w `vals` zmienionych plików (parsowanych na żywo jak w `checkFile`),
należącej do kontenera z rodzeństwem S w `valueSiblings`: oczekiwane pliki = te, w których ≥ ⌈|S|·2/3⌉ członków S
występuje (z `valueIndex`); brakujące = oczekiwane − (miejsca `v` ∪ pliki zmiany); mówione gdy oczekiwanych ≥
`CFG.minRaw` i test λ nad (obecne : brakujące) NIE przechodzi na korzyść obecności;
(b) **pień** (dawne H5): dla grup A, B tej samej partycji test na parach (członek A ma partnera w B po `stem0`) —
akceptacja jak `impliedOf.companion` (≥ 0.6, n ≥ 4) uogólniona na pary grup; nowy plik zmiany w grupie A bez
partnera w B → brak.
Oba → linie `kin: \`ARCHIVED\` (added to \`UserStatus\`) — its siblings also appear in: a.ts, b.json… — not in your
change` / `kin: <file> has no <B-label> counterpart (11 of 12 members of «A» do)`. Wpięte w `missingLines` (J0.2).
Pliki nieindeksowane (config bez gramatyki) → dopisek `(+N config files not indexed)` z `pathsAll` minus `filesAll`
w tych samych katalogach, co oczekiwane.
**Bump.** `MODEL_V` (fazy 3) — `groupKin` w partycji.
**Test.** `kin-completeness.test.mjs`: (a) enum 3 członów × 3 pliki; 4. człon dodany tylko w enumie (uncommitted) →
`check` (cała zmiana) drukuje `kin:` z 3 plikami (czerwony dziś); wartość wszędzie → cisza; (b) 12 handlerów, 11 ze
spec — nowy handler bez spec → `kin:`; (c) `--json` niesie `missing.kin[]`.
**Zależności.** J3.1, J0.2.

**Korekty recenzji Opus (2026-08-31) — MECHANIZM WYMAGA POPRAWKI przed implementacją, NIE zaczynać bez tego:**
1. **`missingLines` jest SYNCHRONICZNE (core.mjs ~2321, `export function missingLines(model, files, {sources,
   newFileScopes})`) — „parsowanych na żywo jak w `checkFile`" WEWNĄTRZ niej jest NIEMOŻLIWE.** `checkFile` jest
   `async` (core.mjs ~1426). Uczynienie `missingLines` async złamałoby wywołujących: `howCmd` (core.mjs ~1989) jest
   zwykłą funkcją synchroniczną i woła `missingLines` (core.mjs ~2050); pozostałe dwa wywołania to grain.mjs ~280 i
   ~332. **Naprawa: kin ma czerpać z JUŻ wyekstrahowanych zakresów przez istniejący kanał `newFileScopes`** —
   `cmdReview` już trzyma zakresy z `checkFile` i przekazuje je dalej. ŻADNEGO żywego parsowania wewnątrz
   `missingLines`. To największa korekta w tej fazie.
2. **Test λ jest ODWRÓCONY w zapisie biletu.** „mówione gdy … test λ … NIE przechodzi na korzyść obecności" znaczy
   dosłownie „grain mówi, gdy dowód jest SŁABY" — dokładne przeciwieństwo każdego innego testu w silniku.
   Poprawna konstrukcja, wzorem `architectureNorms` (core.mjs ~1550-1559) i `bridgeBits` z J2.4 (core.mjs
   ~1308-1318): certyfikować REGUŁĘ WSPÓŁWYSTĘPOWANIA nad rodzeństwem kontenera — `counts = {present, missing}`,
   `K=2`, `kt()`, wymagać `bits > 0`, potem próg posterior-predictive λ `(ne+0.5)/(neff+K/2) >= 1-1/CFG.lambda` — a
   RAPORTOWAĆ jako brakujące te miejsca, które są rezydualnym niedopasowaniem względem tej ZAAKCEPTOWANEJ reguły.
   Bilet całkowicie pomija człon `idxCost`, który OBA referencyjne implementacje niosą (core.mjs ~1549 i ~1307) —
   bez niego to nie jest kształt, który rzekomo powtarza. Przepisać to zdanie PRZED implementacją.
- Dodatkowo: (a) `stem0` jest lokalną stałą w DWÓCH miejscach (core.mjs ~1248 wewnątrz bloku implikacji, ~2326
  wewnątrz `missingLines`) — wynieść na poziom modułu zamiast dokładać trzecią kopię. (b) Linie `kin:` MUSZĄ
  przechodzić przez `voice('practiced', …)` (core.mjs ~749) jak każde inne wyjście `missingLines` — wzorem
  `recipeLines` (core.mjs ~2307/2312/2315) i linii co-change (core.mjs ~2324); bilet w ogóle nie wspomina `voice()`.
  (c) Połówka „pień" (reużycie `impliedOf.companion`'s ≥0.6) to SUROWY próg udziału, NIE test λ/MDL — więc obie
  połówki `kin:` są akceptowane na różnym rodzaju dowodu. Precedens istnieje (`impliedOf` już zasila linie
  `recipe:`), więc to flaga, nie bloker — ale bilet ma to powiedzieć wprost, nie sugerować, że obie połówki są
  testowane tym samym λ.

**Domknięcie mechanizmu „wartości" (opinia niezależna Opus, 2026-08-31, zweryfikowana przez orkiestratora przed
dopuszczeniem do implementacji — zgodnie z zasadą „trudne decyzje przez drugą opinię, nie samodzielnie"):**
- **Kandydat = JEDEN KONTENER** (jeden wpis `model.valueSiblings`), nie para (kontener, plik) ani (kontener,
  wartość) — poszerzenie uniwersum podniosłoby `idxCost` bez potrzeby (patrz próg zapłonu niżej).
- Niech `S = valueSiblings[c]`, `m = S.length`, `h(f)` = ile członków `S` ma plik `f` (wg miejsc w `valueIndex`,
  już zdeduplikowanych per (k,v) per plik — jedno miejsce = jedna obecność, bez podwójnego liczenia). Próg
  `t = min(⌈m·2/3⌉, m−1)` — **zaciśnięty do `m−1`**: przy `t=m` każdy kwalifikujący się plik jest z definicji
  kompletny i komórka pyta o coś pustego; zacisk odpala tylko dla `m=2` (⌈1.33⌉=2), zamieniając pytanie w sensowne
  „czy ta dwójka zawsze występuje razem".
- Populacja `P = {f : h(f) ≥ t}`; `neff = |P|`. `counts.present` = pliki w `P` z `h=m` (pełni nosiciele);
  `counts.missing = neff − present`.
- `K=2`, `kt()` względem STAŁEJ bazy 50/50 — kształt `architectureNorms`, NIE `bridgeBits` (nie ma naturalnej
  bazowej stopy per-plik dla „nosi cały zestaw"). **Test kierunku**: komórkę odrzucić, chyba że `exp==='present'`
  — „ten zestaw NIE podróżuje razem" to prawdziwy fakt, ale nie użyteczna norma, względem której cokolwiek może
  być rezyduum.
- `idxCost = ⌈log2(max(|kontenery|, 2))⌉`, liczone RAZ, repo-wide, nad WSZYSTKIMI kontenerami `valueSiblings`
  PRZED jakimkolwiek filtrowaniem `minRaw`/`minEff`/`bits` — dokładnie jak `pairs.size` w `architectureNorms` i
  `universe3` w `bridgeBits`. `minRaw`/`minEff`: `raw = neff`, identyczne miejsce i sens co w `architectureNorms`.
- **Po certyfikacji komórki** (`bits>0` i próg posterior-predictive λ), raportowanie luk dla wartości `v`
  dodanej/zmienionej w tej zmianie: (a) `v` NOWA (nie w starym `S`) → luki = pełni nosiciele starego `S` (`h=m`)
  bez `v`; (b) `v` JUŻ w `S` → luki = „near" nosiciele (`h=m−1`, dokładnie jednego brakuje) bez `v` — węższe niż
  cała populacja „missing" komórki, celowo: plik z `h<m−1` brakuje kilku członków naraz, więc obwinianie go
  konkretnie o brak `v` byłoby nieuzasadnione. Z obu list wykluczyć pliki należące do bieżącej zmiany.
- **Nowe pole modelu wymagane, którego bilet nie przewidywał:** `model.valueContainer[c]` = nazwa enuma (do
  wypisania „(added to `UserStatus`)"; hash kontenera nie da się odwrócić) — `null` dla kontenerów `str`
  (pozycyjnych), nawias pominąć gdy `null`.
- **Ograniczenie kluczowania do udokumentowania wprost, nie ukryć jako oczywiste:** kontenery `str` niosą `rel`
  w haszu (core.mjs ~324), więc norma współwystępowania dla zbioru stringowego odpali WYŁĄCZNIE przy zmianie
  PLIKU, KTÓRY SAM DEKLARUJE ten zbiór — nigdy międzyplikowo, w przeciwieństwie do enumów.
- `model.valueNorms[c] = {S, m, ne, neff, bits, full, near}` budowane w `learn()` zaraz po `model.valueSiblings`
  (fakt repo, liczony raz); `check()`/`missingLines` robi WYŁĄCZNIE odczyt (`kinGap`-owa funkcja czytająca
  `model.valueNorms`+`model.valueIndex`) — ten sam podział co `architectureNorms`/`computeArchHits`. Nowy cap
  wyświetlania list `full`/`near` (np. `VALUE_NORM_PLACES`, wzorem innych capów list w renderach).
- **Oczekiwanie do zanotowania, NIE blokada testu jednostkowego:** przy REALISTYCZNYM uniwersum ~2000 kontenerów
  próg zapłonu to `neff≈14` (wyliczone), a że pełny nosiciel wymusza df każdego członka ≥ `neff`, przy
  `valueDfMaxShare=0.2` ograniczającym df z góry do `⌈0.2·N⌉`, cecha jest STRUKTURALNIE MILCZĄCA na PRAWDZIWYCH
  repo poniżej ~70 plików — zgodne z dyscypliną (nie błąd), warto to zapisać jako oczekiwanie na przyszłą
  ewaluację (K5), ale **`idxCost` skaluje się z LICZBĄ KONTENERÓW w danych, nie z liczbą plików repo** — fixture
  testu jednostkowego z 1–2 kandydującymi kontenerami (wzorem `value-index.test.mjs`, 17 plików) ma `idxCost`
  rzędu 1–2 bitów, więc zapłon przy `neff` niskim jak `CFG.minEff=3`/`minRaw=5` jest osiągalny garstką plików —
  budować fixture równie oszczędnie jak J3.1, NIE nadymać do 70 plików.

**Wykonanie.** Obie połówki zaimplementowane dokładnie wg domkniętego mechanizmu. **(A) „wartości":** `addVal`
rozszerzone o 5. argument `cn` (nazwa enuma, `null` dla stringów), zawsze zapisywane w `vals`; `learn()` zbiera
`vNames` w TEJ SAMEJ pętli co `vPlaces`/`vConts` (bez drugiej iteracji), buduje `model.valueContainer[c] =
vNames.get(+c) ?? null` — wykonawca poprawnie zauważył, że `Object.keys` zwraca stringi, a `vConts`/`vNames` są
kluczowane liczbami z `hashStr`, więc konwersja `+c` jest konieczna (mój brief by to przeoczył). Komórka MDL: jeden
kandydat na kontener, `t = min(⌈m·2/3⌉, m−1)`, `idxCostV` liczone raz nad WSZYSTKIMI kontenerami przed filtrowaniem,
`K=2` względem stałej bazy 50/50, test kierunku (`present > missing`) PRZED progiem λ, `ne = counts.present`,
`model.valueNorms[c] = {m, ne, neff, bits, full, near}` (capped `VALUE_NORM_PLACES=12`). Odczyt: `valueKinGaps`
(eksportowana, bezstanowa) — `held` (wartość już w `valueSiblings`) → luki z `near`; nowa wartość → luki z `full`;
oba minus zbiór zmiany. `missingLines`'s `'kin'` czyta z NOWEGO `changedScopes` (plik `rel` → `r.scopes`
BEZWARUNKOWO, w `cmdReview`, obok istniejącego warunkowego `newFileScopes`) — poprawka, którą sam wykryłem pisząc
brief: `newFileScopes` niesie WYŁĄCZNIE nowe pliki, a flagowy scenariusz („ARCHIVED" dodany do JUŻ ISTNIEJĄCEGO
enuma) potrzebuje bieżących `vals` pliku ZNANEGO. `cmdReview --json` dostał PIERWSZE pole `missing` w historii tej
komendy (`missing.kin[]`, budowane wywołując `valueKinGaps` wprost, tym samym surowym źródłem co renderowane
linie — wzorem `cochangePartners`). **(B) „pień":** `stem0` wyniesione na poziom modułu (usunięto DWIE kopie —
core.mjs, blok `impliedOf`, i `missingLines`'s `'recipe'`). `part2.groupKin` liczone w `learn()` zaraz po
`part2.groupImplied`: dla grupy A (≥4 członków) najlepsza para B po `stem0`-dopasowaniu, próg surowy `≥0.6`
(TA SAMA kategoria dowodu co `impliedOf.companion`, jawnie skomentowane jako NIE-λ). `missingLines`'s `'kin'`
gałąź (pień) czyta `newFileScopes` (jak `'recipe'`) i — silniej niż mój brief żądał — liczy role obecne w CAŁEJ
zmianie (`rolesFor`, uwzględnia zarówno już-znane pliki jak i nowe z `newFileScopes`), nie tylko w bieżącym pliku,
co poprawnie unika fałszywego alarmu, gdy partner roli B jest gdzie indziej w tej samej zmianie — rozsądne
wzmocnienie briefu. **Odstępstwa zgłoszone:** porzucone pole `example` w `groupKin` (nic go nie renderuje);
`valueKinGaps` zaczyna się od `if (!model.valueNorms) return out;` (cichy no-op na starym, sprzed-bumpa cache'u
zamiast wyjątku). **Realny brakujący element briefu, wykryty i naprawiony przez wykonawcę:** `checkFile` zwraca
`scopes: []` (core.mjs:1559, `if (!part) return {...}`) gdy żadna partycja nie obejmuje pliku — połówka „wartości"
jest wtedy strukturalnie niema; wykonawca przebudował fixture (każdy plik niesie prawdziwą klasę) i udokumentował
to jako DRUGIE, niezależne od kluczowania `str`, ograniczenie już zapisane w tym bilecie. Zweryfikowane, że `EXTR_V`
NIE wymaga bumpa mimo nowego pola `cn` w `vals` — `grain.mjs:72`'s `versionOk` już zależy od `MODEL_V`, więc bump
fazy 3 sam unieważni cache drzewa. **Weryfikacja niezależna:** pełny diff `core.mjs`/`grain.mjs`/testu przeczytany;
`config.mjs` bajt w bajt identyczny ze stanem zweryfikowanym po J3.1. Dwa niezależne cofnięcia: (1) usunięcie testu
kierunku (`counts.present <= counts.missing`) — ZERO czerwonych testów, ponieważ fixture A ma wyłącznie kompletnych
nosicieli (5 z 5), więc `present > missing` zachodzi niezależnie; próg λ z `ne = counts.present` na sztywno
matematycznie DOMINUJE ten test przy `CFG.lambda=8` (żeby przejść próg λ, `ne` musi stanowić ≥ 87.5% `neff`, co
już implikuje `present > missing`) — test kierunku jest więc poprawnym, nieszkodliwym zabezpieczeniem obronnym
(chroni przed degeneracją przy hipotetycznie małym `CFG.lambda`), ale ŻADEN test w pakiecie go samodzielnie nie
ćwiczy; odnotowane jako drobna luka pokrycia testów, NIE błąd — nie wymaga nowego biletu. Przywrócono. (2) zepsucie
klasyfikacji `full`/`near` (`n === m` → `n === m + 1`) → dokładnie 3/10 testów czerwone (flagowy, kształt modelu,
JSON) → przywrócono. (3) podniesienie progu `groupKin` z 0.6 do 0.95 (fixture B ma udział 0.92) → dokładnie 2/10
testów czerwone (flagowy „pień", certyfikacja partycji) → przywrócono. Pełny zestaw po wszystkich trzech
przywróceniach: **1215/1215.**

#### J3.3 · `grain what <words>` — karta konceptu — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** `core.mjs` `whatCmd({ model, H, query, exemplarOk })`: tokeny jak `where`; źródła: (a) deklaracje — z
`buildCards` typu `file` członkowie o pasujących tokenach nazw + karty `group`/`marker` z trafieniem (reuse
`buildCards` + ten sam IDF); (b) wartości — `valueIndex` po tokenach (`tokenize(v)`); (c) macierz: per moduł
(`refineModOf`) liczba plików z trafieniem (a ∪ b) → `spread: <mod> (n) · <mod> (n)`; (d) rodzeństwo — kontenery z
trafioną wartością → `siblings: …`; (e) commity — `msgAffinity` (po J2.4) + liczba `H.fps` z tokenem + najnowszy →
`changes: N commits mention it, last <YYYY-MM> — \`grain how "<q>"\` for the shape`; (f) fan-in plikowy — dla top 3
plików deklaracji liczba `model.edges` wchodzących. Brak (a) i (b) → `map:` + most (przykład). Głosy: praktykowane
dla liczb, przykład dla commitów, mapa dla braku.
**Wyjście.** `«<q>» → what it is here:` · `defined: file:from–to \`Name\` (kind) · …` · `values: \`SUSPENDED\` in 14
places (enum + 13 literals)` · `spread: …` · `siblings: …` · `used by: <k> files` · `changes: …` · `as of`. `--json`.
`grain.mjs` `cmdWhat`, dispatch, USAGE; MCP `grain_what`.
**Bump.** Brak.
**Test.** `what-command.test.mjs`: koncept „status" na fixture z J3.1: deklaracja (enum), 14 miejsc, rozkład po
modułach, rodzeństwo, commity; koncept nieobecny → `map:`; determinizm; `--json`; MCP.
**Zależności.** J3.1, J2.4, J0.1.

**Korekty recenzji Opus (2026-08-31):**
- **Potwierdzony realny brak: `cmdWhat` potrzebuje TEGO SAMEGO leniwego ładowania `H` co `cmdHow` (J2.2), bilet o
  tym nie wspomina.** Udokumentowane wprost w kodzie (grain.mjs ~161-164): historia jest ładowana WEWNĄTRZ
  komendy, nigdy z `ctx`, bo szybka ścieżka `ensureFresh` (cache świeży) nigdy nie woła `loadHistory`. `cmdWhat`
  musi załadować historię sama (wzorem grain.mjs ~168) i uprzejmie degradować przy jej braku — pomijając linię
  `changes:`, nie rzucając wyjątkiem (wzorem straży w grain.mjs ~169-173).
- **Korekta tekstu biletu:** `msgAffinity` to pole MODELU (`model.msgAffinity`, core.mjs ~1325), NIE pole `H`.
  Tylko `H.fps` faktycznie wymaga historii. Bilet wymienia oba jako wymagające `H`, co sprawia że źródło
  `changes:` wygląda na bardziej zależne od historii niż jest — połowa `msgAffinity` działa z ciepłego cache'u
  modelu bez żadnej historii.

**Wykonanie.** `whatCmd({model, H, query, exemplarOk})` (core.mjs, po `howCmd`) — wszystkie sześć źródeł (a-f)
zaimplementowane wg zakresu: (a) deklaracje — TA SAMA pętla IDF co `whereCmd` powtórzona WPROST (odstępstwo
świadome: `whatCmd` potrzebuje `score` na KAŻDEJ karcie żeby zbierać członków, nie tylko top-N trafień jak
`whereCmd`, więc częściowa ekstrakcja zostawiłaby dwa niemal identyczne opakowania — wykonawca ocenił, że
duplikacja ~6 linii jest czytelniejsza; zaakceptowane, brief nie narzucał refaktoru), capped na 12, `ptr()` dla
zakresów wieloliniowych. (b) wartości — dopasowanie po `tokenize(v)`. (c) rozkład — `refineModOf` z tym samym
cache'em `model._archModOf` co `inLineForFile`. (d) rodzeństwo — z `model.valueContainer` (J3.2) gdy dostępne,
zabezpieczone opcjonalnym łańcuchowaniem. (e) commity — `msgAffinity` (pole MODELU, dostępne z ciepłego cache'u)
+ `H.fps` (wymaga historii) zgodnie z korektą; degradacja całość-albo-nic, wzorem `cmdHow`. (f) fan-in — `model.
edges` nad top-3 plikami deklaracji. Brak (a) i (b) → `voice('map', ...)` + `voice('example', ...)` mostu z
`msgAffinity`, jeśli istnieje (wzorem `bridgeLines`). `cmdWhat` w grain.mjs ładuje `H` leniwie DOKŁADNIE jak
`cmdHow`, nigdy nie zwraca wcześnie na jej braku — po prostu pomija `changes:`. `case 'what'` + linia `USAGE` +
`grain_what` w grain-mcp.mjs (wzorem `grain_how`) dodane. Przy okazji poprawiony PRZEDAWNIONY kontrakt
`mcp-server.test.mjs` (lista narzędzi rozszerzona o `grain_what`, asercja wymaganych pól) — naturalna konsekwencja
dodania 6. narzędzia, nie pełzanie zakresu. Decyzje interpretacyjne w ramach briefu (bez własnego capu w bilecie):
`values:` jedna pozycja na klucz `valueIndex` (nie agregowane po `enum:`/`str:`); `changes:` i most `example`
wzajemnie wykluczające się; `used by:` pomijane przy zerowym fan-in; `kind` w `defined:` używa tego samego
zgrubnego słownika co istniejące karty plikowe `where` (`'type'` dla enum/class/struct/interface), nie wymyśla
nowej granulacji. Zgłoszone, nietknięte: `groupPartitions` wymaga ≥30 zakresów łącznie w małych pakietach albo w
ogóle nie tworzy partycji (`model.partitions=[]`) — cichy powód, dla którego bardzo mały fixture nie daje żadnych
kart. **Weryfikacja niezależna:** diff `core.mjs`/`grain.mjs`/`grain-mcp.mjs`/`mcp-server.test.mjs` przeczytany w
całości; `config.mjs` bajt w bajt identyczny ze stanem po J3.2. Czerwony dowód wykonawcy potwierdzony (nieznana
komenda „what"). Cofnięto WYŁĄCZNIE `nameHits` (zwrot na sztywno `false`) → dokładnie 2/9 testów (flagowy tekst i
liczby) czerwone → przywrócono → 9/9 → pełny zestaw **1224/1224**.

#### J3.4 · Bliźniacy strukturalni (H4) → zdrowie — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** `core.mjs` `learn()`: po profilach — dla każdej pary grup (także między partycjami) z profilem
(`profiles[r].skel` jako ciąg): odległość edycyjna po tokenach ciągu ≤ 10% długości dłuższego i `shared ≥ 8` obu →
`model.twins.push({ a: {part, role, label}, b: {…}, sim })`; dodatkowo sufiks nazwy dominujący każdej grupy (ostatni
token `nameTokens` większości członków) — jeśli różny → `namedDifferently: [sufA, sufB]`. Render w `report` sekcja
zdrowia (J5.5) i na karcie `where` grupy: `twin: structurally the same as «B» (packages/api), named \`*Model\` there`.
**Bump.** `MODEL_V` (fazy 3).
**Test.** `structural-twins.test.mjs`: dwie grupy o identycznym szkielecie, sufiksy `Dto`/`Model` w dwóch katalogach →
`model.twins` ma parę; dwie różne strukturalnie → brak.
**Zależności.** Brak (może równolegle — ale sekwencyjnie zgodnie z ustaloną metodyką).

**Korekty recenzji Opus (2026-08-31):**
- **Realna słabość: `skel` to OBCIĘTY, skompresowany RENDER (string), nie struktura.** `skRender` (core.mjs
  ~345-353) obcina na `max=220` znaków z sufiksem `…` i zwija powtórzenia identycznych dzieci do `×N`. Odległość
  edycyjna nad tym stringiem jest stratna w obie strony: dwa długie, niepowiązane profile obcięte do 220 znaków
  mogą dzielić obcięty prefiks i wyjść jako bliźniacy, a `×3` vs `×30` to jeden znak odległości mimo dużej różnicy
  strukturalnej. **Porównywać strukturę szablonu po anty-unifikacji (albo bramkować po `shared`/`coverage`), NIE
  po wyrenderowanym stringu** — alternatywnie, minimalnie: wymagać, żeby OBIE długości `skel` były poniżej 220,
  żeby obcięcie nigdy nie wchodziło w grę.
- Flagi progów (nie blokery): (a) „≤10% długości dłuższego stringa" to nowa, nieuzasadniona stała — nazwać ją
  wprost jako bramkę populacji indeksu, jak progi df z J3.1. (b) `shared ≥ 8` siedzi NAD istniejącym progiem —
  `profileOf` już odrzuca `shared < 6` (core.mjs ~359) — to DRUGA, ostrzejsza stała dla tej samej wielkości;
  uzasadnić albo zejść do istniejącego 6. (c) Bilet mówi „także między partycjami" — profile są per-partycja,
  kluczowane indeksem roli (core.mjs ~1157), więc to O(grup²) między WSZYSTKIMI partycjami z odległością edycyjną
  nad stringami do 220 znaków na każdą parę — ustalić jawny cap.

**Domknięcie mechanizmu (opinia niezależna Opus, 2026-08-31, zweryfikowana przez orkiestratora — `skAlign`'s `eq`
i `SK_CAP=300` sprawdzone osobiście przeciw żywemu kodowi przed przyjęciem):**
- **Porównanie STRUKTURALNE, nie po `skel`.** `skAu(tplA, tplB)` — TA SAMA anty-unifikacja, którą `profileOf` już
  stosuje wewnątrz jednej grupy, zastosowana MIĘDZY dwiema grupami. Wymaga, żeby `profileOf` oddał surowe (SPRZED
  `skNumber`) `tpl` — NIE jako nowe pole na zwracanym obiekcie (który trafia do `model.partitions[i].profiles`,
  eksportowanego, opublikowanego schematu), tylko kanałem bocznym: `Object.defineProperty(pf, '_tpl', { value:
  tpl, enumerable: false })` — `JSON.stringify` pomija nieenumerowalne właściwości z definicji, więc eksport
  pozostaje nietknięty bez osobnego kroku „posprzątaj przed serializacją".
- **`skAu` jest ASYMETRYCZNE na dziurach — zweryfikowane w kodzie.** `skAlign`'s `eq = (x, y) => skSig(x) ===
  skSig(y) || skSig(x) === '?' || skSig(x) === '?*'` testuje dziurę WYŁĄCZNIE po stronie `x` (zawsze z `a`), nigdy
  po `y`. Skutek: `skCount(skAu(A,B)) !== skCount(skAu(B,A))` w ogólności. NIE łatać `skAu` (poprawne dla
  jedynego dotychczasowego wywołania, gdzie `a` to zawsze akumulator TEJ SAMEJ grupy — łatka ryzykowałaby każdy
  istniejący profil). Zamiast tego w miejscu porównania bliźniaków brać `shared = min(skCount(skAu(A,B)),
  skCount(skAu(B,A)))` — kierunek konserwatywny, bez wymyślania kanonicznego porządku pary.
- **Próg WYPROWADZONY, nie wybrany — ZERO nowych stałych.** Bliźniacy, gdy `|M| > (|A|−|M|) + (|B|−|M|)` (dzielony
  rdzeń przeważa nad wszystkim, co odróżnia obie grupy), gdzie `|M| = shared` z akapitu wyżej, `|A| = A.shared`,
  `|B| = B.shared`. Algebraicznie: `3·|M| > |A|+|B|`, czyli udział krzyżowy względem ŚREDNIEJ obu szablonów > 2/3
  — TA SAMA proporcja większości co markery (`k >= Math.ceil(n * 2/3)`) i J3.2's próg kompletności. Zamienia
  „≤10% odległości edycyjnej" (nowa, nieuzasadniona stała) na odwołanie do już przyjętej kategorii progu. Darmowy
  skrót obliczeniowy z tej samej nierówności: `3·min(A.shared, B.shared) <= A.shared+B.shared` odrzuca parę BEZ
  liczenia `skAu` w ogóle (bo `|M| <= min(|A|,|B|)` z konstrukcji anty-unifikacji — nigdy nie dodaje węzłów).
  Dodatkowy tani odsiew: `skSig(tplA) !== skSig(tplB)` (różne korzenie) ⇒ `|M|=0`, pomiń.
- **`shared >= 8` — porzucić, użyć istniejącego `6`.** `8` NIE jest wymyślone — to `mineTemplates`'s WŁASNY próg
  (core.mjs:445, `pf.shared < 8`), z komentarzem „no cluster prior behind it — the template alone must carry the
  claim". To uzasadnienie NIE przenosi się na profile grup ról: taki profil ma już przeszły klastrowanie ról (`arr.
  length >= 4`) I własną bramkę `profileOf`'s `shared < 6` — drugi, cięższy próg byłby podwójnym liczeniem tego,
  co nierówność powyżej już wymaga (silniejsze żądanie na przecięcie MIĘDZY dwoma szablonami jest WBUDOWANE w
  regułę „rdzeń przeważa nad resztą OBU stron", nie potrzebuje osobnej podniesionej podłogi).
- **Cap: ograniczyć POPULACJĘ profili wchodzących do skanu, nie liczbę par.** `const TWIN_PROFILE_CAP = 200;` —
  profile posortowane po `shared` malejąco (grubsze szablony pierwsze), obcięte do 200 → maks. 19 900 par, ten sam
  rząd wielkości co `VALUE_INDEX_CAP`/`fpsCap` (20000); każda para tania dzięki dwóm darmowym odsiewom powyżej.
  Cięcie po populacji (nie po parach) unika niejednolitego obcinania w połowie skanu. Log przy obcięciu, wzorem
  `VALUE_INDEX_CAP`'s loga (core.mjs ~1422).
- **Miejsce w `learn()`:** skan bliźniaków wymaga WSZYSTKICH partycji naraz — dopiero PO pętli `for (const part2 of
  model.partitions) {...}`, która buduje `markerImplied`/`groupImplied`/`groupKin` (koniec tego bloku, przed
  `model.waivers`). Zbiera po jednym wpisie `{key, part: part2.name, role: r, label, tpl: pf._tpl, shared:
  pf.shared}` na każdą (partycję, rolę) z `part2.profiles[r]` istniejącym.
- **`namedDifferently`:** per grupa, dla każdego członka (klucz `rel#kind#name[#ord]` z `part.assignments`) wziąć
  `name = k.split('#')[2]`, `nameTokens(name)` (core.mjs:1495 — działa na dowolnym stringu, nie tylko ścieżce:
  `basename`/`split('.')[0]` są no-opami bez `/`/`.`), ostatni token; dominanta = najczęstsza wartość (zwykła
  moda — to etykieta opisowa na już zaakceptowanej parze, nie osobny test akceptacji, więc nie wymaga własnego
  progu). Różne dominanty między A i B → `namedDifferently: [sufA, sufB]`.

```js
const TWIN_PROFILE_CAP = 200; // profiles entered into the twin scan; thickest templates first — 19 900 pairs at most
export function twinsOf(entries) { // entries: { key, part, role, label, tpl, shared }
  const pool = entries.sort((a, b) => b.shared - a.shared || (a.key < b.key ? -1 : 1)).slice(0, TWIN_PROFILE_CAP);
  const out = [];
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
    const A = pool[i], B = pool[j];
    if (skSig(A.tpl) !== skSig(B.tpl)) continue;
    if (3 * Math.min(A.shared, B.shared) <= A.shared + B.shared) continue;
    const shared = Math.min(skCount(skAu(A.tpl, B.tpl)), skCount(skAu(B.tpl, A.tpl))); // skAu is asymmetric on holes
    if (shared <= (A.shared - shared) + (B.shared - shared)) continue;
    out.push({ a: A.key, b: B.key, shared, coverage: +(shared / Math.max(A.shared, B.shared)).toFixed(2) }); }
  return out.sort((x, y) => y.shared - x.shared || (x.a < y.a ? -1 : 1)); }
```

**Wykonanie.** `twinsOf` zaimplementowane dosłownie wg pseudokodu z domknięcia (`TWIN_PROFILE_CAP=200`, log przy
obcięciu jak `VALUE_INDEX_CAP`). `profileOf` chwyta `rawTpl` PRZED `skNumber` i dokleja go do zwracanego obiektu
przez `Object.defineProperty(out, '_tpl', {value: rawTpl, enumerable: false})` — nieenumerowalne, więc `JSON.
stringify` (zarówno cache modelu, jak i `export.mjs`, potwierdzone przez wykonawcę żywym testem sprawdzającym
`Object.keys`/`JSON.stringify`/`{...pf}`/`propertyIsEnumerable`) pomija je z definicji, zero ryzyka wycieku do
opublikowanego schematu. Skan bliźniaków w `learn()` tuż po bloku `groupKin`, przed `model.waivers`: zbiera
`{key,part,role,label,tpl:pf._tpl,shared:pf.shared}` per (partycja, rola) z istniejącym profilem, liczy dominujący
sufiks nazwy (moda ostatniego tokena, ten sam wzorzec co `groupKin`), woła `twinsOf`, rozwiązuje pary z powrotem do
`{part,role,label}`, dokleja `namedDifferently` gdy sufiksy istnieją i się różnią. `mineTemplates`'s własny próg
`shared<8` nietknięty — osobna populacja, osobne uzasadnienie. Dodatkowo (nadprogramowo, dozwolone briefem): linia
`twin:` na karcie grupy `where`, za `if (model.twins)`, zweryfikowana żywo przez wykonawcę na prawdziwym fixture.
**Realna luka znaleziona I NAPRAWIONA w tej samej turze:** `namedDifferently` pierwotnie używało `nameTokens()`,
które filtruje przez `PL_STOP` — a `PL_STOP` już zawiera „model" (i „service"/„controller"/„component"/„view"/
„type"/„module") jako szum dla INNYCH wywołujących `nameTokens`. Dla flagowego wzorca tego biletu (`*Dto` vs
`*Model`) to właśnie „model" jest sygnałem, nie szumem — filtrowanie go dawało cichy, błędny wynik (`namedDifferently:
["dto","invoice"]` zamiast `["dto","model"]`, zweryfikowane empirycznie przez wykonawcę na żywym fixture). Naprawa
skończona na JEDNEJ linii, WYŁĄCZNIE w nowym kodzie tego biletu: `nameTokens(...)` → `tokenize(...)` (surowy
tokenizer, bez filtra) w miejscu liczenia sufiksu; `nameTokens`/`PL_STOP` i wszyscy ich pozostali wywołujący
(w tym `groupKin`'s `stem0`, niepowiązany) nietknięci. Eskalowane do TEGO SAMEGO wykonawcy z precyzyjną poprawką,
zamiast nowego agenta — zgodnie z ustaloną metodyką. **Weryfikacja niezależna (obie tury):** diff `core.mjs`
przeczytany w całości oba razy; `config.mjs` bajt w bajt identyczny ze stanem po J3.3 w obu turach. Tura 1: cofnięto
próg akceptacji (`if (shared <= (A.shared-shared)+(B.shared-shared)) continue;`) → dokładnie 1/8 testów (test (b),
grupa strukturalnie odmienna) czerwony → przywrócono → 8/8 → pełny zestaw **1232/1232**. Tura 2 (poprawka luki):
cofnięto WYŁĄCZNIE `tokenize`→`nameTokens` → dokładnie 1/9 testów (nowy test (g), odtwarzający dokładnie zgłoszony
artefakt `["dto","invoice"]`) czerwony → przywrócono → 9/9 → pełny zestaw **1233/1233**.

**FAZA 3 W CAŁOŚCI ZROBIONA (J3.1–J3.4), zweryfikowana niezależnie na każdym bilecie, w tym jedna niezależna opinia
Opus przed implementacją dla J3.2 (komórka MDL „wartości") i jedna dla J3.4 (porównanie strukturalne), zgodnie z
zasadą „trudne decyzje przez drugą opinię". Zero regresji, zero incydentów `git checkout`/`git stash`. Wspólny
bump `MODEL_V` m17→m18 (J3.1's `valueIndex`/`valueSiblings`/`valueContainer`/`valueNorms`, J3.2's `groupKin`, J3.4's
`twins`) wykonany przez orkiestratora, pełny zestaw po bumpie: **1233/1233**. Dalej: Faza 4.**

### Faza 4 — Kształty zmian i mapa

#### J4.1 · Archetypy zmian — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Opus**

**Zakres.** `core.mjs`: `induceRoles` → uogólnienie `induceClusters(items, { feats(i), w(i) })` (ta sama aglomeracja
MDL, `NCAP`, `jacW` z wagą 1 dla cech bez prefiksu `dec:/sup:/ret:` — wagi zostają dla zakresów); `induceRoles` woła
uogólnienie (bajt-identyczne wyniki — test regresji na fixture). `learn()`: dla każdego `fp` w `H.fps` komórki =
{`m:<refineModOf(file)>` per plik} ∪ {`g:<part>#<role>` dla kluczy zakresów przez `part.assignments` (po lineage
`lc`)} ∪ {`k:<kind>`}; klastrowanie; archetyp = klaster ≥ `CFG.minRaw` członków; komórka certyfikowana ⇔ komórka
2-wartościowa (członkowie z : bez) — dane jak `isAll` w `mine()`, `bits > 0` i λ; archetyp bez komórek
certyfikowanych odpada. `model.changeArchetypes = [{ id, label: top 3 komórki po udziale, n, cells: [{cell, k, share}],
exemplars: [[sha, msg, ts]×3 najnowsze], toks: top 8 tokenów wiadomości po IDF }]`. `howCmd`: intencja → archetyp
(IDF po `toks` + pokrycie miejsc z `whatCmd` (a∪b) przez komórki) → wyjście rozszerzone: `certified shape "<label>"
(n changes): <cell> (k of n) · …` PRZED przykładem; `--json` `shape`. `report`: `== changes — N shapes ==` z jedną
linią per archetyp. Głos praktykowany dla komórek, przykład dla przykładów.
**Bump.** `MODEL_V` (fazy 4).
**Test.** `change-archetypes.test.mjs`: fixture: 8 commitów „add handler" (handler + dto + test), 8 „add status"
(enum + dto + fixture + test), 6 szumu → dwa archetypy z właściwymi komórkami certyfikowanymi (asercja na `cells`),
szum poza; `how "add status"` przypisuje do właściwego i drukuje `certified shape`; `induceRoles` regresja
bajt-identyczna.
**Zależności.** J2.1, J2.2, J3.3.

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora — arytmetyka bitów/idxCost
przeliczona ręcznie dla n=5/8/15 i zgodna co do cyfry, cytat `history.mjs`/`core.mjs` sprawdzony):**
- **`(po lineage `lc`)` jest BŁĘDNE — usunąć.** `history.mjs:120-122` przepisuje `lc` DO PRZODU przy zmianie nazwy
  i **kasuje stary klucz** (`delete state.lc[ok]`), więc historyczna ścieżka jest w `lc` po prostu nieobecna. J2.2
  już to odkryło i zapisało w kodzie (`core.mjs:2202-2205`): „the usable old→new mapping is `fps[*].renames`".
  Zamiast: użyć pary `renamedTo`/`currentOf` z `howCmd` (`core.mjs:2204-2205`), wyciągniętej jako wspólny helper.
  Klucz `fp.scopes` po przemapowaniu ścieżki ma resztę (`#kind#name#ord`) niezmienioną — zmiana nazwy samego
  zakresu jest cichym chybieniem; zaakceptowane, ale dopisać jako komentarz.
- **`bits > 0` bez podanego `idxCost` jest niewykonalne — PYTANIE PROJEKTOWE (patrz blok „Decyzja przed J4.1"
  poniżej).** Rachunek dla komórki obecnej u wszystkich członków (`counts = {true: n}`, `K = 2`, `B = 2`): `n = 5`
  → 3.21 bitu zapasu przed `idxCost` (czyli `C ≤ 8`); `n = 8` → 5.84 (`C ≤ 32`); `n = 15` → 12.36 (`C ≤ 4096`).
  **Przy progu archetypu `≥ CFG.minRaw` = 5 żadna komórka nie certyfikuje się nigdy**, a fixture 8+8+6 stoi na
  krawędzi: zielony przy `C ≤ 32`, cichy przy `C = 33`. Użycie istniejącego `model.candidateCountLog2`
  (`core.mjs:1155`, 11 bitów na standardowym fixture — `voices.test.mjs:39`) zabija fixture całkowicie. Projekt
  sekcji I (plan.md §I, ok. 1707-1710) wymagał WYŁĄCZNIE λ, bez `bits > 0`. Dla wykonawcy — GDY decyzja zapadnie —
  dopisać samą bramkę λ wprost: `(k + 0.5)/(n + 1) ≥ 1 − 1/CFG.lambda = 0.875`, czyli przy `n = 8` DOKŁADNIE
  `k = 8` (`k = 7` → 7.5/9 = 0.833, odpada) — ta sama arytmetyka co `voices.test.mjs:45` dla J2.4.
- **Dopisać warunek `exp === 'true'`.** Bilet kopiuje `bits > 0` i λ, ale gubi bramkę pustki z `core.mjs:709`. Dla
  `n = 20` komórka obecna u 1 członka certyfikuje się z `exp = 'false'` (`(19+0.5)/21 = 0.928 ≥ 0.875`), a J4.2
  wypisze ją jako „missing" — poradę dodania pliku do modułu, którego archetyp świadomie nie dotyka.
- **`k:<kind>` — podać źródło.** `kind` w tym kodzie to rodzaj zakresu (`unitOf`, `core.mjs:937`:
  method/type/file/module/catch/finally/case). Przy tym odczycie `k:method` jest w niemal każdym commicie,
  certyfikuje się w każdym archetypie i renderuje w J4.2 jako nieoperacyjne „missing: k:type". Jeśli intencją był
  sufiks pliku (`sufOf`, `core.mjs:1539`) — a to on rozróżnia dwa kształty fixture'a — napisać to wprost.
- **Granica uogólnienia `induceClusters` — dokładnie środkowy blok.** `induceRoles` (`core.mjs:588-620`) robi pięć
  rzeczy: filtr kwalifikacji (`:589`, `s.kind`/`s.ownCount` — zakresowy), kubełkowanie + próbka NCAP + aglomeracja
  + wybór medoidu (`:591-618` — GENERYCZNE, jedyna część do uogólnienia), etykieta z cech `/^(tok|dec|sup):/`
  większością (`:614-617` — zakresowa; każdy archetyp dostałby etykietę literalną `'group'`, bo `m:`/`g:`/`k:` nie
  pasują do żadnego z tych prefiksów), oraz `assignAll` (`:619`→`:621-631`, twardo zakodowane
  `s.kind`/`s.ownCount` — nie da się uruchomić na commitach). `induceClusters` obejmuje WYŁĄCZNIE blok generyczny;
  filtr, etykietę i przypisanie robi wołający. To też czyni regresję bajt-identyczną trywialnie sprawdzalną.
- **`w(i)` — skreślić albo uzasadnić.** W `induceRoles` waga to krotność kubełka (`W = reps.map(r => r.length)`,
  `:595`), nie własność elementu. Nic w J4.1 nie potrzebuje wagi commitu innej niż 1.
- **`n` i `k` MUSZĄ pochodzić z drugiego przebiegu po wszystkich `fps`, nie z wag klastrów.** Przy `CFG.fpsCap` =
  20000 realne repo przekroczy 700 różnych sygnatur odcisku i `core.mjs:594` próbkuje; wagi klastrów pokrywają
  wtedy tylko próbkę, a drukowane „(k of n)" byłoby mianownikiem próbki, nie populacji — wprost przeciw zasadzie
  „każde twierdzenie z mianownikiem".
- `jacW z wagą 1 dla cech bez prefiksu dec:/sup:/ret:` to już stan faktyczny — `featW` (`core.mjs:581`) zwraca 1
  dla wszystkiego innego. Nic do zrobienia; zdanie zostawić jako potwierdzenie, nie jako zakres.
- **`pokrycie miejsc z whatCmd (a∪b)`:** `whatCmd` nie zwraca tej sumy — `spreadFiles` jest lokalne
  (`core.mjs:2271-2272`). Odtwarzalne z publicznego zwrotu: `defined[].rel` ∪ `values[].places[][0]`. Uwaga na
  koszt: `howCmd` nigdy dziś nie woła `buildCards(model)` (`core.mjs:1856`), a `whatCmd` woła zawsze (`:2244`).
- **Persystować pełny worek cech medoidu archetypu** (jak `part.medoids[].feats`) i **znacznik `certified` per
  komórka** — J4.2 potrzebuje obu, żeby liczyć `jacW` na tym samym zbiorze co klastrowanie. Bez tego „Bump: Brak"
  w J4.2 jest nieprawdziwe.
- **`model.changeArchetypes = []` gdy `H` jest `null`** — wymagane przez test J4.3 („repo bez historii → bez
  `changes:`"), nienapisane nigdzie.
- **Regresja `induceRoles` to KONTROLA, nie test czerwony** (zielona przed i po) — dokładnie ta sama korekta co
  dla testów (b)/(c) w J0.1. Wykonalna: `induceRoles` jest eksportowane, wiele plików testowych importuje z
  `core.mjs` wprost, syntetyczne `ps` (`{kind, rel, feats, ownCount}`) buduje się ręcznie jak w
  `pct-rounding.test.mjs`.
- **Fixture — dopisać podłogę zakresów.** `groupPartitions` (`core.mjs:1099-1108`) wymaga partycji ≥ 100 zakresów
  albo scalonego kubełka ≥ 30; poniżej `model.partitions` jest puste i żadna komórka `g:` nie powstanie.
  Dodatkowo `induceRoles` wymaga łącznej wagi ≥ 12 (`:596`) i wagi medoidu ≥ 3 (`:612`). Zapisać liczby w
  komentarzu fixture'a, wzorem `voices.test.mjs:38-45`.
- **`changeArchetypes` NIE trafia do `grain export`** — `export.mjs:92` jest jawną listą dozwoloną, a
  `docs/reference.md:146` deklaruje schemat interfejsem publicznym. J8.1 dostaje to zadanie; potwierdzić i
  napisać w bilecie, żeby wykonawca nie dodał tego sam.

**Domknięcie mechanizmu (opinia niezależna Opus, 2026-08-31, zweryfikowana ręcznie przez orkiestratora — cyfry dla
n=5/8 i przypadku „zawsze dotyka core/" przeliczone i zgodne co do setnej):** Pytanie „które uniwersum `idxCost`"
było objawem GŁĘBSZEGO błędu, nie samą chorobą: bilet sięgnął po gałąź `isAll` z `mine()` (`core.mjs:692`,
kodowanie względem jednostajnej bazy `B`), podczas gdy archetyp jest STRUKTURALNIE gałęzią PRZECIWSTAWNĄ
(`core.mjs:693`, `else` — likelihood ratio komórki lokalnej względem komórki-rodzica `allCell`) — dokładnie tak,
jak komórka roli jest sub-populacją kontrastowaną z `_all:`, nie samym `_all:`. Naprawa gałęzi w praktyce
ROZWIĄZUJE pytanie o uniwersum, zamiast je tylko ograniczać:
- **Gałąź**: `data = Σ nv·log2(kt(lokalna,K,v,n) / kt(globalna,K,v,N))`, gdzie `globalna` = komórka zbudowana nad
  WSZYSTKIMI `N = H.fps.length` odciskami commitów (parent cell, rolę `allCell`/`allN` w `mine()`), nie stała baza
  `B=2`. Zysk na obserwację jest nieograniczony (log2 stosunku stóp), nie ≤ 1 bit jak w `isAll` — to właśnie
  głodziło pierwotną wersję.
- **Uniwersum `idxCost` = (b), repo-wide, WSZYSTKIE komórki-kandydaci wszystkich archetypów liczone RAZ** —
  dokładnie ten sam wzorzec co `mine()`/`architectureNorms`/`bridgeBits` (realna, ISTNIEJĄCA populacja
  kandydatów, nigdy lokalna dla jednego klastra). Fakt, że LICZBA archetypów jest wyborem modelowania
  (nienadzorowane klastrowanie), NIE zanieczyszcza statystyki: aglomeracja maksymalizuje zgodność WEWNĄTRZ
  klastra, ale gałąź kontrastowa testuje jednomyślność względem GLOBALNEGO tempa bazowego, którego klastrowanie
  nigdy nie optymalizowało — krążenie nie sięga statystyki. Nie wprowadzać drugiej kary za wybór klastra.
- **Zachować `bits > 0` I λ — NIE samo λ z projektu sekcji I.** Kontrprzykład: `m:core` jednomyślne w 8 z 8
  członków archetypu, ale obecne w 20 z 22 odcisków repo-wide — samo λ przepuszcza to jako czysty efekt bazowej
  częstości (`(8.5)/(9)=0.944≥0.875`), a to dokładnie NIE JEST „niosąca kształt" część archetypu. Gałąź
  kontrastowa poprawnie to odrzuca: `data=8·log2(0.9444/0.8913)=0.67`, `BIC=1.5` → `-0.83` bitu PRZED `idxCost` —
  komórka milczy, tak jak powinna. Samo λ nie potrafi wyrazić tego rozróżnienia.
- **`CFG.minRaw=5` przeżywa jako JEDYNA podłoga, w obu rolach (klaster archetypu i certyfikacja komórki) — bez
  drugiej stałej.** Na samej podłodze (n=5, komórka obecna u wszystkich 5, globalnie 5 z 22): `data=5·log2
  (0.9167/0.2391)=9.69`, `BIC=1.16` → 8.53 bitu zapasu PRZED `idxCost` (toleruje `C≤370`). Druga, osobna podłoga
  certyfikacji byłaby dziś NIEUZASADNIONĄ nową stałą magiczną — istniałaby wyłącznie po to, żeby ratować problem
  arytmetyczny, który naprawa gałęzi już usuwa.
- **Warunek pustki**: `k·2 > n` (większość musi być „obecna") zamiast `exp==='true'` — ten sam duch co bramka
  wagi z `core.mjs:707`, dopasowany do gałęzi kontrastowej.
- **Fixture (8+8+6) działa**, z ok. 3–4 bitami zapasu na komórkach rozróżniających każdy 8-elementowy archetyp,
  przy założonym uniwersum ~20–40 komórek-kandydatów (5 modułów + ~10 par partycja#rola + ~8 rodzajów) — nawet przy
  `C=256` (`idxCost=8`) wciąż przechodzi z zapasem 1.3 bitu. 6 szumowych commitów nie powinno się w ogóle
  sklastrować (poniżej `minRaw` po aglomeracji).

```js
// uniwersum: każda komórka-kandydat pojawiająca się w JAKIMKOLWIEK archetypie, repo-wide, liczona RAZ
let C = 0; for (const [, g] of cellGlobal) if (g.present >= CFG.minRaw) C++;
const idxCost = Math.ceil(Math.log2(Math.max(C, 2)));
const N = H.fps.length, K = 2;
for (const arch of archetypes) {              // każdy klaster już z podłogą >= CFG.minRaw członków
  const n = arch.members.length;
  for (const cellKey of arch.candidateCells) {
    const k = arch.count(cellKey);                              // obecna u k z n
    const local = { present: k, absent: n - k };
    const g = cellGlobal.get(cellKey);                          // obecna w g.present z N odcisków
    const glob = { present: g.present, absent: N - g.present };
    let data = 0;                                               // KONTRAST względem globalnego tempa bazowego (gałąź NIE-isAll z mine())
    for (const v of ['present', 'absent']) { const nv = local[v]; if (nv) data += nv * Math.log2(kt(local, K, v, n) / kt(glob, K, v, N)); }
    const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(n, 2)) - idxCost;
    if (bits <= 0) continue;
    if (!((k + 0.5) / (n + K / 2) >= 1 - 1 / CFG.lambda)) continue;
    if (k * 2 <= n) continue;   // większość musi być „obecna" — wariant pustki z core.mjs:707 dla tej gałęzi
    certify(arch, cellKey, { bits, k, n });
  }
}
```

**Wykonanie.** `induceClusters(items, {feats, w=()=>1})` wyekstrahowane z `induceRoles` DOKŁADNIE wg granicy z
korekt (blok generyczny: kubełkowanie po identycznym worku cech + próbka `NCAP` + aglomeracja ważonym Jaccardem
pod zatrzymaniem MDL + wybór medoidu, próg wagi ≥3), zwraca `{clusters: [{members, weight, medoid}]}`.
`induceRoles` = filtr kwalifikacji → `induceClusters` → własna etykieta (z `c.members`/`c.weight`) → `assignAll`,
bez zmiany zachowania — zweryfikowane przeze mnie NA POZIOMIE KODU (nie tylko testem czarnej skrzynki): stara waga
`W[i]` (rozmiar kubełka) mnożyła sumę cech w etykiecie, nowa wersja iteruje po `c.members` (już spłaszczonych do
pojedynczych elementów przez `m.flatMap(i => reps[i])`) z wagą 1 na element — matematycznie identyczne, inna
struktura pętli. `currentPathOf(fps, live)` wyciągnięte z `howCmd`'s `renamedTo`/`currentOf`, używane przez OBA
wywołujących. Komórki: `m:<refineModOf>` ∪ `k:<sufOf>` per plik odcisku (ścieżka przemapowana przez `currentOf`
PRZED czymkolwiek), `g:<partycja>#<rola>` per klucz zakresu z `part.assignments` (też po `currentOf`). Certyfikacja
DOKŁADNIE wg zamkniętego mechanizmu: gałąź kontrastowa (`kt(lokalna)/kt(globalna)`), `idxCost` liczone raz nad
komórkami repo-wide z globalną obecnością ≥ `CFG.minRaw`, potem λ, potem `k·2>n`. Każdy archetyp niesie PEŁNY worek
komórek ze znacznikiem `certified` per komórka (nie tylko certyfikowane) — J4.2 dostanie to, czego potrzebuje.
`model.changeArchetypes=[]` gdy brak `H`/`H.fps`. `howCmd` dostał parametr `shapes` (domyślnie prawda), `howEval`
jawnie przekazuje `false` — uniknięcie kosztu `buildCards(model)` (którego `how` nigdy wcześniej nie płacił) w
pętli do 100 kandydatów bramki J2.3. `report`: sekcja `== changes — N shapes ==`.
**Realna sprzeczność między dwoma autorytatywnymi blokami wykryta i rozstrzygnięta przez wykonawcę, nie
zignorowana:** korekty recenzji żądały „`n`/`k` z DRUGIEGO przebiegu po WSZYSTKICH `fps`, nie z wag klastrów";
domknięcie mechanizmu (nadrzędne) pisze wprost `n = arch.members.length`. Wykonawca poszedł za nadrzędnym blokiem
i udokumentował dlaczego to uczciwe: `members` po ekstrakcji `induceClusters` to prawdziwy, wyliczalny zbiór
commitów należących do klastra — jedyne odcinane elementy to te, które próbkowanie NCAP (>700 różnych sygnatur
odcisku) w ogóle wyklucza z rozważania, DOKŁADNIE tak samo jak already-accepted zachowanie `induceRoles` dla
zakresów (żaden wcześniejszy bilet tego nie flagował jako naruszenie „każde twierdzenie z mianownikiem" dla ról).
Orkiestrator ZGADZA SIĘ z tą decyzją (symetria z istniejącym, zaakceptowanym zachowaniem `induceRoles` czyni ją
rozsądną, nie wymaga kolejnej niezależnej opinii) — odnotowane jako świadomy wybór, nie luka.
**Inne realne poprawki wykonawcy (nieproszone briefem, ale trafne):** (1) `voice('practiced', text)` zwraca `text`
bez zmian — owinięcie linii `report`'a nie chroni przed regexem `voices.test.mjs` wykrywającym wzorzec
`etykieta: …` jako niezadeklarowany marker; wykonawca zrobił wiersz `report`'a bezdwukropkowy (` — `/` · `)
zamiast dotykać wspólnej listy `NON_CLAIM`. (2) Tekst nagłówka `map:` („evidence: examples, not a certified
shape") przeczył się z certyfikowaną linią drukowaną tuż pod nim — poprawiony na „a certified shape, then
examples" wyłącznie gdy coś się dopasowało; sprawdzone, że string nie występuje nigdzie indziej (docs/skills/
commands). (3) Fixture: dziewięć par `is<Status>()` miało identyczny dystans Jaccarda, co dawało dowolny remis w
podziale MDL i psuło jeden archetyp o 1 członka — naprawione w SAMYM FIXTURZE (nie w kodzie), z jawną notatką, że
na prawdziwym repo archetypy mogą wychodzić o 1-2 członków krótsze niż realny kształt (odnotowane jako oczekiwana
własność, nie błąd). **Weryfikacja niezależna:** diff `core.mjs`/`grain.mjs` przeczytany w całości; `config.mjs`
bajt w bajt identyczny ze stanem po J3.4 (`export.mjs` — zero trafień `changeArchetypes`/`induceClusters`,
potwierdzone `grep`). Trzy niezależne cofnięcia: (1) usunięcie warunku pustki `k*2>n` → ZERO czerwonych (fixture
nie ćwiczy tej gałęzi — przywrócono, odnotowane jako luka pokrycia, nie błąd, analogicznie do J3.2's redundantnego
testu kierunku); (2) podmiana gałęzi kontrastowej na kształt `isAll` (`kt(local)*2` zamiast `kt(local)/kt(global)`)
→ dokładnie 2/6 testów (flagowy i `how`) czerwone, z komunikatem WPROST pokazującym, że komórka dzielona przez oba
archetypy (`m:src/dto`) fałszywie się certyfikowała — dowód naprawy błędnej gałęzi → przywrócono; (3) zmiana
domyślnej wagi `w=()=>1` na `()=>2` w `induceClusters` → dokładnie 1/6 testów (regresja `induceRoles`, test (d))
czerwony, 9 medoidów zamiast 3 → przywrócono → 6/6 → pełny zestaw **1239/1239**.

#### J4.2 · Komórki archetypu w `missing: change shape:` — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** `core.mjs` `missingLines` źródło `shape`: odcisk zmiany (pliki `reviewFileList` → komórki jak J4.1) →
najbliższy archetyp po `jacW` ≥ 0.34 → brakujące komórki certyfikowane → `change shape: this change touches k of n
certified cells of "<label>"; missing: <cell> (k' of n'), …` (moduł/grupa nazwane jak w kartach). Brak archetypu ≥
progu → cisza.
**Bump.** Brak.
**Test.** `missing-shape.test.mjs`: zmiana częściowa (enum + dto bez fixture/test) → `change shape:` z dwiema
brakującymi; kompletna → brak linii `shape`; zmiana bez archetypu → brak.
**Zależności.** J4.1, J0.2.

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora — jacW/0.34 vs `CFG.minMemb`
sprawdzone przeciw żywemu kodowi):**
- **Odcisk zmiany NIE MOŻE powstawać z samych plików.** „pliki `reviewFileList` → komórki jak J4.1" daje
  wyłącznie komórki `m:`; archetyp ma `m:` ∪ `g:` ∪ `k:`. Archetyp o 2 komórkach każdego rodzaju kontra zmiana
  trafiająca we właściwe pliki: `jacW = 2/6 = 0.333` — **poniżej progu 0.34 o 0.007**. Idealne dopasowanie zostaje
  odrzucone, wszystko milknie, a test „kompletna → brak linii `shape`" przechodzi z zupełnie złego powodu.
  `cmdReview` już podaje `changedScopes` i `newFileScopes` do `missingLines` (`grain.mjs:345`), a źródło `kin:`
  (`core.mjs:2629-2645`) już woła na nich `assignAll(scopes, p.medoids)` — użyć tego samego, żeby dostać komórki
  `g:`/`k:` zmiany, nie tylko `m:`.
- **Zamienić `jacW ≥ 0.34` na `CFG.minMemb`.** Oba istniejące wystąpienia 0.34 (`core.mjs:2038` ostrzeżenie „weak
  match" w `whereCmd`, `core.mjs:2188` cięcie w `howCmd`) to znormalizowane pokrycie IDF, inna wielkość na innej
  skali niż ważony Jaccard (potwierdzone: `hits[0].score` liczone z sumy `idf`-ważonych trafień, `jacW` liczone z
  przecięcia zbiorów cech). Własną stałą progową dla `jacW` ten kod już ma: `CFG.minMemb = 0.35` (`config.mjs:56`),
  używaną w `assignAll` (`core.mjs:629`) DOKŁADNIE do tej decyzji — czy element należy do klastra. Zero nowych
  stałych, właściwa wielkość, plus darmowa bramka niejednoznaczności (`m1 - m2 < CFG.ambGap`), która nie pozwoli
  dwóm archetypom zgłosić się po tę samą zmianę. (Pozostałe progi na `jacW` w tym kodzie: 0.6 dla bliskich klonów
  medoidów `core.mjs:628`, 0.9 dla korelacji powierzchni — żaden nie jest 0.34.)
- **Doprecyzować `k'` i `n'`** w `missing: <cell> (k' of n')` — domyślnie „k' z n' członków archetypu niesie tę
  komórkę"; bilet tego nie mówi.
- **Linia przez `voice('practiced', …)`**, jak każde inne źródło w `missingLines` (`:2601`, `:2641`, `:2645`).
- **Rozważyć `— absent:` zamiast zagnieżdżonego `missing:`** — blok ma już nagłówek `missing from your change:`
  (`core.mjs:2645`), a J0.2 ustanawia jeden blok i jeden nagłówek.
- **`voices.test.mjs`:** `change shape` nie jest w `NON_CLAIM` (`:66-79`), a `review` JEST audytowane przez test
  (a). Dziś przechodzi tylko dlatego, że na fixture'rze voices blok `missing` w ogóle nie powstaje. Sprawdzić przy
  implementacji; ta sama utajona ekspozycja dotyczy już `co-change:`/`recipe:`/`kin:`.
- **„Bump. Brak." jest poprawne** — pod warunkiem, że J4.1 zapisze worek cech medoidu i znacznik certyfikacji per
  komórka (patrz korekty J4.1).

**Wykonanie.** Zbiór komórek zmiany budowany DOKŁADNIE jak w J4.1 (`m:`/`k:` per plik, `g:` z `assignAll` nad
`changedScopes` per partycja), porównywany przez `jacW` z PEŁNYM workiem komórek każdego archetypu (nie tylko
certyfikowanym), pod bramką `assignAll`'s własną (`CFG.minMemb`/`CFG.ambGap`) — dokładnie wg korekty. Renderowana
tylko różnica `certified − changeCells` (`— absent:`, bez zagnieżdżonego drugiego „missing"), cisza gdy dopasowanie
kompletne. `--json` świadomie BEZ pola `shape` (tylko `missing.kin` z J3.2 pozostaje ustrukturyzowane) — bilet tego
nie wymagał, udokumentowane w teście (d). Okablowane WYŁĄCZNIE w `cmdReview` (`'shape'` dodane do `sources`),
`cmdCheck` nietknięty, wzorem `'kin'`'s połówki pień/`'recipe'`. **Realna regresja znaleziona I NAPRAWIONA w tej
samej turze** (nie tylko zgłoszona — bo to bezpośrednia konsekwencja własnej zmiany, nie cudza): flagowane w
korektach ryzyko „`change shape` nie jest w `NON_CLAIM`" okazało się realne, nie hipotetyczne — na fixture'rze
`voices.test.mjs` prawdziwie odpala `change shape:` (fixture historii już zawiera pasujący archetyp), łamiąc test
(a). Naprawione JEDNYM wpisem `NON_CLAIM` (`/^change shape$/`) z komentarzem, że `co-change:`/`kin:`/`recipe:`
mają tę samą, wciąż nieodpaloną ekspozycję — nietknięte, poza zakresem tego biletu. **Właściwość odnotowana, nie
błąd:** dopasowanie po PEŁNYM worku komórek oznacza, że zmiana dotykająca tylko JEDNEGO pliku wieloplikowego
kształtu może nie przejść `CFG.minMemb` (np. 2/10=0.2 dla samego enuma), podczas gdy dotknięcie 2 z 4 plików
(przykład z bileta: enum+dto) już przechodzi (4/10=0.4) — zgodne ze specyfikacją, nie do zmiany tutaj.
**Weryfikacja niezależna:** diff `core.mjs`/`grain.mjs`/testu przeczytany w całości; `config.mjs` bajt w bajt
identyczny ze stanem po J4.1. Cofnięto WYŁĄCZNIE bramkę `m1 >= CFG.minMemb && m1 - m2 >= CFG.ambGap` (zastąpioną
gołym `if (best)`) → dokładnie 1/4 testów (test (c), zmiana niepowiązana z żadnym archetypem) czerwony — fałszywe
dopasowanie do „src/enums/…" mimo braku sensownego pokrycia → przywrócono → 4/4 → pełny zestaw **1243/1243**.

#### J4.3 · Warstwy z topologii, `grain map`, session-context — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** `relations.mjs` `moduleGraph`: po SCC — graf skondensowany, porządek topologiczny, `layer` = najdłuższa
ścieżka do liścia (moduł bez wyjść = 0); `nodes[].layer`. `core.mjs`: `mapLines(model)`: `layers:` jedna linia per
warstwa (`layer 0 (leaves): core/, shared/ · layer 1: infra/ · layer 2: apps/*`, cap 4 modułów per warstwa +
`+N`), `concepts:` top 12 tokenów po (df commitów z mostem J2.4 × df kart) po `normTok`, `changes:` archetypy
(J4.1) jedną linią każdy (`"<label>" — n changes, e.g. <sha>`), `decisions:` liczba steer/boundary/waive. `grain map`
drukuje pełne; `sessionContext` dokłada skompresowane (≤ 6 linii łącznie z dzisiejszymi) — warstwy i archetypy
tylko gdy istnieją; głos praktykowany. Linia `in:` z J0.3 dostaje `layer n`.
**Bump.** `MODEL_V` (fazy 4 — `layer` w węzłach).
**Test.** `map-command.test.mjs`: graf 3-warstwowy → właściwe `layer`; SCC jako jeden węzeł warstwy; `map` drukuje
sekcje; `session-context` ≤ 6 linii i zawiera `layers:` gdy graf ma ≥ 2 warstwy; repo bez historii → bez `changes:`.
**Zależności.** J4.1 (dla `changes:`; warstwy niezależne — można podzielić na J4.3a warstwy, J4.3b reszta).

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora — 7-liniowy `sessionContext` i
porzucanie singletonów w SCC potwierdzone przeciw żywemu kodowi):**
- **„≤ 6 linii łącznie z dzisiejszymi" jest arytmetycznie niemożliwe — `sessionContext` emituje dziś 7.**
  `grain.mjs:523-538`: akapit wstępny, trzy linie komend, `Index:`, warunkowa `Architecture (measured):`,
  warunkowa `Maintainer decisions in force` — SIEDEM linii przed jakimkolwiek dodatkiem tego biletu. Test
  „`session-context` ≤ 6 linii" byłby czerwony z powodu niezwiązanego z tym biletem, a wykonawca „naprawiłby" go
  kasując istniejącą linię. Zamiast tego: podnieść budżet (proponowane ≤ 9) i wpleść `layers:` w istniejącą linię
  `Architecture (measured):` zamiast dodawać nową — to ten sam temat.
- **`concepts:` nie da się policzyć z `mapLines(model)`.** Wiersze `model.msgAffinity` to `{ t, files: [[f, n,
  bits]×≤6], ex }` (`core.mjs:1430-1435`) — nie ma pola df commitów; df żyje w `H.msgTokCommits`, tylko w
  historii. A `sessionContext` historii ładować nie może (`grain.mjs:514` „no refresh, no parsing — must be
  instant"; `grain.mjs:663-667` opisuje, dlaczego szybka ścieżka `ensureFresh` nigdy nie woła `loadHistory`). Ten
  kod rozwiązał już ten sam kształt dwa razy — prekomputować `model.concepts` (top 12 tokenów) w `learn()`, wzorem
  `model.moves` (`core.mjs:1436-1439`). Przy okazji oszczędza `buildCards(model)` (`core.mjs:1856`) w hooku, który
  dziś nie robi nic poza odczytem JSON-a. (Wariant alternatywny, jeśli liczenie ma zostać w `mapLines`: dodać pole
  `df` do wiersza `msgAffinity` — jedno pole, `MODEL_V` i tak jest w tej fazie podbijane. Prekomputacja jest
  bliższa idiomowi tego kodu.)
- **Kondensacja SCC wymaga zmiany w `moduleGraph`, której bilet nie nazywa.** `relations.mjs:194` zatrzymuje
  komponent TYLKO gdy `comp.length >= 2` — singletony są liczone i wyrzucane (potwierdzone), więc nie ma mapy
  węzeł→komponent do kondensacji. Trzeba: (1) zapisać `comp` dla KAŻDEGO węzła; (2) usunąć krawędzie wewnątrz
  komponentu po zwinięciu — cykl `A→B`, `B→A` daje obie `medges`, a po kondensacji pętlę własną, która zawyży
  warstwę albo zawiesi przejście; (3) kierunek: `buildEdges` daje `from` = importujący, `to` = importowany
  (`relations.mjs:145-147`), więc „moduł bez wyjść = 0" jest poprawne jak napisano.
- **Reguła rozstrzygania remisów nie jest potrzebna** — najdłuższa ścieżka do liścia jest jednoznaczna na DAG-u, a
  każdy członek zwiniętego SCC dziedziczy warstwę komponentu. Jedyny wybór to kolejność WEWNĄTRZ wypisanej
  warstwy: deterministyczny sort po `id`, zgodnie z `relations.mjs:194-195`. `strong` jest REKURENCYJNE
  (`relations.mjs:189`, potwierdzone — woła samo siebie) — przejście po najdłuższej ścieżce napisać iteracyjnie
  lub z memoizacją, żeby nie wprowadzić z powrotem klasy błędu G1 (stack overflow na szerokim grafie).
- **Zmienić nazwę `mapLines`** — `core.mjs:2195` wiąże już lokalne `const { lines: mapLines }` wewnątrz `howCmd`.
  Legalne przesłonięcie, ale pułapka przy czytaniu. Proponowane: `mapSections(model)`.
- **`głos praktykowany` jest złym głosem dla mapy.** `layers:`/`concepts:` to definicja głosu mapa
  (`core.mjs:825-826`); `changes:` z `e.g. <sha>` to ładunek głosu przykład wypisany bez znacznika. J0.1
  („Konflikt rozstrzygnięty") wyłączył `sessionContext` z reguły hooków, więc głos mapa jest tam dozwolony.
  Rozstrzygnąć per linia: `layers:`/`concepts:` = mapa; `decisions:` = liczba, struktura; `changes:` =
  praktykowany dla `n changes`, a `e.g. <sha>` albo skreślić, albo oznaczyć jako przykład.
- **`grain map` trzeba okablować** — `case` w `switch (cmd)` i wpis w `USAGE` (dziś: `where`/`how`/`what`/`check`/
  `completeness`/`explain`/`status | report`). `commands/map.md` należy do J8.1, ale dispatch i `USAGE` do tego
  biletu.
- **`layer` wycieka do opublikowanego schematu eksportu** — `export.mjs:92` przepuszcza `model.moduleGraph`
  dosłownie, a `docs/reference.md:146-152` deklaruje `grain-export/1` interfejsem publicznym. Wg precedensu z J0.3
  (pole DODANE ⇒ bez zmiany numeru schematu) jest to w porządku, ale ma być decyzją, nie efektem ubocznym.
- **Test „repo bez historii → bez `changes:`"** rozróżnia tylko wtedy, gdy J4.1 ustawia `model.changeArchetypes =
  []` przy `H === null` — dopisane do korekt J4.1.
- **Podział J4.3a (warstwy) / J4.3b (reszta) — REKOMENDOWANY.** Połowa warstwowa nie zależy od J4.1 i nie ma
  otwartych pytań projektowych; połowa `concepts:`/`sessionContext` ma dwa (budżet linii, źródło df).
- **`MODEL_V` — poprawnie**; `model.moduleGraph` jest persystowane (`core.mjs:1311`, `export.mjs:92`), `layer` to
  pole, od którego zależą zapytania. Wspólny bump fazy z J4.1.

**Wykonanie, CZĘŚĆ 1/2 — J4.3a, warstwy.** `moduleGraph`'s `strong()`
teraz przechwytuje KAŻDY zdjęty `comp` (nie tylko `length≥2`) do `compOf` (kanoniczny reprezentant = `comp[0]`,
ten sam sort co `cycles`); krawędzie skondensowane budowane z `medges` przez `compOf`, wewnątrz-komponentowe
(`cf===ct`) odrzucone; warstwa = najdłuższa ścieżka do liścia na skondensowanym DAG-u, liczona ITERACYJNIE
(jawny stos z kursorem `{id,i}`, bez natywnej rekurencji — `strong` sama zostaje rekurencyjna, poza zakresem).
Każdy oryginalny węzeł dostaje `layer` swojego komponentu. `mapSections(model)` (nowa nazwa, unika kolizji z
lokalnym `mapLines` wewnątrz `howCmd`) renderuje `layers:` głosem MAPA (poprawka względem oryginalnego tekstu
bileta „głos praktykowany") jako JEDNĄ połączoną linię (` · ` między warstwami — wykonawca wybrał to zamiast
dosłownie „jedna linia PER warstwa", zgodnie z własnym przykładem bileta i dominującym idiomem tego kodu; drobna,
odwracalna decyzja formatowania, zaakceptowana) oraz `decisions:` jako gołą linię strukturalną (bez `voice()`).
`concepts:`/`changes:` zostawione jako jawny komentarz-slot dla J4.3b. `cmdMap`/`case 'map'`/`USAGE` okablowane.
`inLineForCard`/`inLineForFile` dostały `(layer n)`, stary komentarz „not implemented until J4.3" usunięty.
**Weryfikacja niezależna:** diff `relations.mjs`/`core.mjs`/`grain.mjs` przeczytany w całości; `config.mjs` bajt w
bajt identyczny ze stanem po J4.2. Dwa cofnięcia: (1) usunięcie odrzucania krawędzi wewnątrz-komponentowych
(`cf===ct`) → ZERO czerwonych — inne zabezpieczenia (`onStack`/`layerOf` niezdefiniowane dla nieukończonego węzła)
już to maskują na tych fixture'ach; przywrócono, odnotowane jako nadmiarowe-ale-poprawne zabezpieczenie, wzorem
podobnych znalezisk w J3.2/J4.1 (nie błąd, nie wymaga nowego biletu); (2) zepsucie arytmetyki warstwy (`maxL+1`→
`maxL`) → 3/6 testów czerwone (błędne wartości `layer`, w tym `-1` zamiast `0` dla liścia) → przywrócono → 6/6 →
pełny zestaw **1249/1249**.

**Wykonanie, CZĘŚĆ 2/2 — J4.3b, `concepts:`/`changes:`/session-context.** `model.concepts` prekomputowane w
`learn()` zaraz po `model.msgAffinity`, wzorem `model.moves`: `cardDf` z JEDNEGO wywołania `buildCards(model)`
(jedyne dozwolone miejsce na ten koszt — poza zapytaniami), wynik `(H.msgTokCommits[t]||0) × (cardDf.get(t)||0)`
nad sumą kluczy obu map, zero z konstrukcji dla tokena nieobecnego w którejkolwiek stronie, top 12 malejąco
(remisy alfabetycznie). `model.concepts=[]` gdy brak `H`. `mapSections` dostał `concepts:` (głos mapa) i
`changes:` (głos praktykowany, top 4 archetypy po `n` + „+N more", świadomie BEZ cytatu `e.g. <sha>` — uzasadnienie
wykonawcy: `report()`'s `== changes ==` już niesie pełny dowód, `mapSections` ma być skanowalny, nie kolejna liczba
do parsowania) między istniejącym `layers:` a `decisions:`. `sessionContext`: liczba warstw WPLECIONA w istniejącą
linię `Architecture (measured):` (`, N layer(s)` przed `; most depended-on:`), NIE nowa linia — zgodnie z korektą;
dwie nowe warunkowe linie `concepts:`/`changes:`, budżet ≤9 zamiast pierwotnych „≤6" (już wtedy niemożliwych).
**Realna regresja znaleziona I NAPRAWIONA w tej samej turze** (bezpośrednia konsekwencja własnej, sankcjonowanej
zmiany, nie cudza): `voices.test.mjs`'s test (c) miał sztywną asercję `doesNotMatch(ctx, /^map: /m)` sprzed tego
biletu, gdy `sessionContext` nie niosło żadnej linii głosu mapa — J0.1's „Konflikt rozstrzygnięty" JUŻ wyłączał
`sessionContext` z reguły „hooki nigdy nie mówią example/map", więc nowa linia `map: concepts:` jest LEGALNA, a
stara asercja stała się fałszywa, nie sygnałem błędu. Poprawiona na asercję POZYTYWNĄ (`map: concepts:`/`changes:`
faktycznie się pojawiają na fixturze, której historia i kod naprawdę dzielą słownictwo) plus zaktualizowany regex
linii architektury o klauzulę liczby warstw; reszta pliku (testy a/b, audyt markerów) nietknięta. **Zgłoszone, nie
naprawione:** `cmdMap --json` nadal zwraca tylko `{nodes, decisions}` — brak `concepts`/`changes` w JSON, bilet
tego nie wymagał, poza zakresem. **Weryfikacja niezależna:** diff `core.mjs`/`grain.mjs`/`voices.test.mjs`
przeczytany w całości; `config.mjs` bajt w bajt identyczny ze stanem po J4.3a. Cofnięto WYŁĄCZNIE bramkę
`score > 0` (dopuszczono wyniki zerowe) → 2/10 testów czerwone z jaskrawym dowodem (12-elementowa lista zamiast
`['widget']`, wypełniona tokenami o wyniku 0) → przywrócono → 10/10 → pełny zestaw **1259/1259**.

**FAZA 4 W CAŁOŚCI ZROBIONA (J4.1–J4.3), zweryfikowana niezależnie na każdym bilecie, w tym DWIE niezależne opinie
Opus przed implementacją (J4.1's wybór gałęzi/uniwersum komórki archetypu — poprawiła błąd, którego sama recenzja
pre-fazy nie złapała; brak dla J4.2/J4.3, których mechanizm był już w pełni określony po recenzji). Zero regresji,
zero incydentów `git checkout`/`git stash`. Wspólny bump `MODEL_V` m18→m19 (J4.1's `changeArchetypes`, J4.3a's
`nodes[].layer`, J4.3b's `model.concepts`) wykonany przez orkiestratora, pełny zestaw po bumpie: **1259/1259**.
Dalej: Faza 5.**

### Faza 5 — Zdrowie (report prowadzi do decide)

#### J5.1 · Koszt odchylenia: fixy i churn per wartość (H3) — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Opus**

**Zakres.** `core.mjs`: `deviationCost(f, ps, H)`: dla `f.conform` i `f.deviants` sumy `L.fix` i `L.churn` z `H.lc`
(klucz `skeyR`); komórka 2-wartościowa „ma fix : nie ma" nad konformującymi vs nad dewiantami — mówione gdy obie
populacje ≥ `CFG.minRaw` i różnica przechodzi λ (test jak `isAll`, kontrast dewianci vs konformujący jako komórka
lokalna vs `_all`); wynik `{ devFixShare, confFixShare, devN, confN }` na fakcie (`f.cost`). Render: `factNotes` →
`· deviants get fixes 3× more often (9 of 12 vs 11 of 140)`; `check` przy odchyleniu: `(deviants of this rule get
fixes N× more often)`.
**Bump.** `MODEL_V` (fazy 5, wspólny).
**Test.** `deviation-cost.test.mjs`: fixture z historią, gdzie dewianci reguły dostają commity `fix:` (FIX_RE) częściej
→ `f.cost` obecny i klauzula w `report`; równy rozkład → brak klauzuli (czerwony dziś: brak pola).
**Zależności.** Brak.

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora — arytmetyka na WŁASNYM
przykładzie biletu przeliczona ręcznie i zgodna co do setnej z obiema gałęziami `mine()`):**
- **`(test jak isAll, kontrast dewianci vs konformujący jako komórka lokalna vs _all)` — wewnętrznie sprzeczne,
  pierwsza połowa matematycznie martwa. TO SAM BŁĄD GAŁĘZI, KTÓRY DOMKNIĘCIE J4.1 JUŻ RAZ NAPRAWIŁO.** Przeliczone
  na WŁASNYM przykładzie biletu („9 of 12 vs 11 of 140"): gałąź `isAll` daje **0.457 bitu przed `idxCost`**
  (milczy zawsze, przy jakimkolwiek `idxCost≥1`); gałąź kontrastowa (`kt(lokalna)/kt(rodzica)`) daje **21.37 bitu**.
  Usunąć „test jak isAll".
- **„komórka lokalna vs `_all`" jest nieprawdą o mechanizmie.** W `mine()` `allCell` jest NADZBIOREM komórki
  lokalnej. Dewianci są DOPEŁNIENIEM konformujących, nie ich podzbiorem — to inny (ale legalny) estymator. Napisać
  wprost, że to likelihood ratio między dwiema ROZŁĄCZNYMI populacjami, i uzasadnić dlaczego to legalne.
- **„różnica przechodzi λ" — PYTANIE PROJEKTOWE, NIEROZSTRZYGNIĘTE, wymaga niezależnej opinii przed
  implementacją.** Bramka λ z `mine()` (`(ne+0.5)/(neff+K/2)≥0.875`) daje na przykładzie biletu `9.5/13=0.731` →
  **ODRZUCA własny flagowy przykład biletu**. Osobna, ISTNIEJĄCA bramka pointwise z `checkFile`
  (`d ≥ log2(λ) = 3`) daje `3.164` → przepuszcza ledwo. Wskazać którą, z uzasadnieniem.
- **`idxCost` nienazwane — DOKŁADNE POWTÓRZENIE JEDYNEGO BLOKERA J4.1.** Podać uniwersum kandydatów wprost
  (wzorem `mine()`/`architectureNorms`/`bridgeBits`'s `universe3`/J4.1's `cellGlobal`): realna, ISTNIEJĄCA
  populacja par (fakt × obie populacje ≥ `minRaw`), liczona RAZ repo-wide, nigdy per fakt.
- **`L.churn` jest BOOLEANEM, nie licznikiem, a wynik `{devFixShare, confFixShare, devN, confN}` nie ma pola
  churn.** Bilet każe liczyć churn i wyrzucić wynik. Albo dodać `devChurnShare`/`confChurnShare` do kształtu, albo
  skreślić churn z zakresu (i z tytułu biletu).
- **`Render: factNotes` NIE trafia do `report`.** `factNotes` jest wołane wyłącznie z `checkFile` (bramkowane
  `f.held && f.held.since`) i `whereCmd`. `report()`'s `printFact` inline'uje trend/held/authorConc i `factNotes`
  nie dotyka. Jeśli klauzula ma być w `report`, to zadanie J5.5 — dopisać wprost w obu biletach.
- **Mianownik:** `f.deviants` to populacja SUROWA (młode dewianty włącznie), a wszystko inne w `report` drukuje
  `f.sraw`. Napisać wprost, że `devN`/`confN` są surowymi liczbami zakresów HEAD Z WIERSZEM `lc`.
- **Przykład w bilecie się nie zgadza sam ze sobą:** `9/12=0.75` vs `11/140=0.0786` to 9.5×, nie „3×". Poprawić
  liczby albo mnożnik. Dopisać przypadek brzegowy `confFixShare===0` (dzielenie przez zero → nie drukować
  mnożnika).
- **Fixture:** `L.fix` rośnie WYŁĄCZNIE przy modyfikacji ciała, nigdy przy narodzinach — fixture musi MODYFIKOWAĆ
  dewiantów w commitach `fix:`, nie tworzyć ich w takich. Commity ≥ `CFG.freshDays` (14 dni) wstecz. Zapisać
  liczby w komentarzu fixture'a wzorem `voices.test.mjs`.
- Rezyduał do komentarza (nie do naprawy): `currentPathOf` NIE jest tu potrzebne (`H.lc` przepisywane DO PRZODU
  przy zmianie nazwy pliku, `heldSummary`/`authorConcentration` już robią ten sam lookup bezpiecznie) — ale zakres
  przemianowany W MIEJSCU (ta sama ścieżka, nowa nazwa funkcji) nie trafia w `lc` i cicho nic nie wnosi, jak w J4.1.

**Domknięcie mechanizmu (opinia niezależna Opus, 2026-08-31, zweryfikowana ręcznie przez orkiestratora — precedensy
`mine():718`, J4.1's `:1527` sprawdzone przeciw żywemu kodowi, arytmetyka na przykładzie bileta przeliczona i
zgodna):**
- **Kształt komórki: JEDNA komórka, dewianci kontrastowani z CAŁĄ surową populacją faktu (konformujący ∪
  dewianci), nie z samymi konformującymi.** Zastrzeżenie „dewianci nie są podzbiorem konformujących" znika — nie
  przez przemianowanie, tylko dlatego, że KAŻDY istniejący kontrast w tym kodzie ma tally rodzica, który ZAWIERA
  liczby dziecka: `mine()`'s `_all:` liczy członków komórki roli też; J4.1's `glob` liczy WSZYSTKIE `H.fps`,
  włącznie z własnymi odciskami archetypu; `bridgeBits`'s `baza` to tempo bazowe pliku nad WSZYSTKIMI commitami,
  włącznie z tymi `df`, które mówią token. Powód MDL: `kt(lokalna)/kt(rodzica)` jest realną oszczędnością
  długości kodu tylko gdy rodzic to kod, którego użyłbyś PRZED wydzieleniem podzbioru — tempo konformujących nie
  jest takim kodem (nie da się zakodować dewiantów „tempem konformujących" bez najpierw zapłacenia za sam podział).
  **JEDNA komórka na fakt, nie dwie** — komórka konformujących nie pyta o nic (konformujący dominują populację, z
  którą byliby kontrastowani), a podwoiłaby uniwersum za darmo (precedens: J3.2's `valueNorms`, „jeden kandydat na
  KONTENER, nigdy na (kontener, członek)").
- **Przeliczony przykład bileta pod nową gałęzią: 15.18–21.37 bitu przed `idxCost` (zależnie od odczytu „11 z
  140" — jako sama populacja konformujących, albo jako cała populacja) — ALE OBIE odpowiedzi ODRZUCA bramka λ**
  (`(9+0.5)/(12+1)=0.731<0.875`), identycznie niezależnie od odczytu, bo bramka λ czyta wyłącznie komórkę lokalną.
  Milczenie jest TU POPRAWNYM zachowaniem, nie defektem: dowód mówi, że związek jest realny (16-21 bitów to dużo),
  ale bramka λ mówi „nie mów utrzymującemu, że zostawienie tego odchylenia będzie kosztować naprawę, gdy 1 na 4
  dewiantów było w porządku" — dokładnie po to istnieje jedna stała straty.
- **Bramka λ: `mine()`'s WŁASNA, bez zmian, zastosowana wprost do `has_fix`** (wzorem `bridgeBits`'s „the one loss
  constant, on the touched outcome specifically"). NIE sięgać po osobną bramkę pointwise `checkFile`'s
  (`d≥log2(λ)=3`) — to inny RODZAJ testu (ocenia JEDNEGO nazwanego dewianta w czasie edycji, nigdy czy fakt
  populacyjny ISTNIEJE), a `d≈3.164≥3` to pomyłka jednostek: wymaga tempa dewiantów ≥8× tempa konformujących, a λ
  znaczy „najwyżej 1 zły telegraf na 8 posłuchanych" — stosunek strat, nie mnożnik wielkości efektu. Sięganie po
  drugą, inaczej ukształtowaną bramkę λ żeby ratować jeden przykład to dokładnie „sześć strojonych progów", które
  konstytucja już raz scaliła w jeden.
- **Skorygowany, DZIAŁAJĄCY przykład dla bileta: „11 z 12", nie „9 z 12".** `(11+0.5)/13=0.885≥0.875` przechodzi
  λ; dowód 23.80 bitu przed `idxCost`. W praktyce J5.1 mówi tylko przy niemal jednomyślnych populacjach dewiantów
  (5 z 5, 6 z 6, 11 z 12) — to uczciwy zasięg cechy, i zdanie „every one of the six handlers that skipped
  validate() has a bugfix commit; six of the 140 that call it do" jest silniejsze niż ostrożniejsze „9 z 12".
- **Uniwersum `idxCost`: jeden kandydat na JUŻ ZAAKCEPTOWANY fakt**, liczony RAZ repo-wide nad wszystkimi
  partycjami, z DWIEMA poprawkami względem naiwnego szkicu: (i) piętro na POPULACJI OBSERWOWALNEJ (dewianci Z
  WIERSZEM `H.lc`), nie na surowej liczbie dewiantów — dokładnie piętro J4.1's `g >= CFG.minRaw` (`core.mjs:1527`,
  potwierdzone), które „czyni certyfikację w ogóle możliwą"; (ii) skreślić osobne piętro na konformujących — pod
  kształtem (a) porównywana populacja to konformujący ∪ dewianci, więc uczciwe drugie piętro to piętro na CAŁEJ
  populacji faktu z użyteczną historią.
- **Realny confound, ZNALEZIONY PRZEZ OPINIĘ, do wbudowania w mechanizm:** dewianci bywają STARSI od
  konformujących (kod sprzed konwencji), a starszy kod miał więcej czasu na zebranie jakichkolwiek commitów,
  włącznie z naprawami. Bez wyrównania ta komórka mierzyłaby EKSPOZYCJĘ, nie KOSZT, w niebezpiecznym kierunku
  (znajdowanie kosztu, którego nie ma). Obie strony komórki MUSZĄ czerpać z TEGO SAMEGO okna świeżości —
  ponownie użyć `CFG.freshDays` (bez nowej stałej), tak jak `mine()`'s własny drugi test λ na `sraw` (`core.mjs
  :747`) już wymaga, żeby DRUKOWANA populacja przechodziła tę samą bramkę.
- Bramka λ na `has_fix` implikuje już większość (`≥0.875`), więc osobny test pustki `k·2>n` (jak w J4.1) NIE jest
  tu potrzebny — λ robi podwójną robotę.

```js
// J5.1 — jedna komórka na zaakceptowany fakt, kontrastowana z CAŁĄ surową populacją faktu.
const K = 2;
const outcome = gi => { const L = lcRowFor(ps[gi]);
  return L && ageFn(ps[gi]) >= CFG.freshDays ? (L.fix > 0 ? 'has_fix' : 'no_fix') : null; };
const tally = vs => { const c = { has_fix: 0, no_fix: 0 }; for (const v of vs) c[v]++; return c; };
const devOf = f => f.deviants.map(d => outcome(d.gi)).filter(Boolean);
const popOf = f => [...f.conform, ...f.deviants.map(d => d.gi)].map(outcome).filter(Boolean);

let C = 0;
for (const f of accepted) if (devOf(f).length >= CFG.minRaw && popOf(f).length >= CFG.minRaw) C++;
const idxCostD = Math.ceil(Math.log2(Math.max(C, 2)));

for (const f of accepted) {
  const dv = devOf(f), all = popOf(f);
  const neff = dv.length, N = all.length;
  if (neff < CFG.minRaw || N < CFG.minRaw || neff < CFG.minEff) continue;
  const local = tally(dv), glob = tally(all);
  let data = 0;
  for (const v of ['has_fix', 'no_fix']) { const nv = local[v];
    if (nv) data += nv * Math.log2(kt(local, K, v, neff) / kt(glob, K, v, N)); }
  const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(neff, 2)) - idxCostD;
  if (bits <= 0) continue;
  if (!(local.has_fix / neff > glob.has_fix / N)) continue; // nadmiar, nigdy deficyt
  if (!((local.has_fix + 0.5) / (neff + K / 2) >= 1 - 1 / CFG.lambda)) continue;
  f.devCost = { k: local.has_fix, n: neff, baseK: glob.has_fix, baseN: N, bits: +bits.toFixed(2) };
}
```

**Wykonanie.** Zaimplementowane dokładnie wg domknięcia, jedna niewielka poprawka i jedno doprecyzowanie wykonawcy:
`devCostCand` zbierane PODCZAS pętli po partycjach (`ef`/`dv`/`all` per kandydat, floor `≥CFG.minRaw` na obu
populacjach), ale certyfikacja (jeden `idxCostD`, jedna pętla λ) uruchamiana RAZ, PO wypchnięciu wszystkich
partycji — dokładnie „liczone raz repo-wide, nigdy per partycja", ta sama dyscyplina co `mine()`'s `idxCost` i
komórka archetypu. `dv`/`all` budowane nad SUROWYMI `f.deviants` (nie obciętym do 5 `topDeviants(f,ps)` — istotna
uwaga wykonawcy, inaczej piętra `minRaw` liczyłyby się nad złą populacją). Render: nowa gałąź `factNotes`, oraz
poszerzona bramka w `checkFile`'s notce końcowej (z `f.held && f.held.since` na dowolną niepustą `factNotes(f)`) —
świadome poszerzenie zachowania, jawnie zgłoszone, zero zmiany w istniejących testach.
**Realna, uzasadniona poprawka względem litery briefu:** `fixOutcome` używa BEZPOŚREDNIEGO `H.lc.get(skeyR(s.rel,
s))` (wzorem `heldSummary`), NIE `lcGet` z `mkWeightFn`, mimo że kod briefu pisał `lcGet(ps[gi])`. Powód: `lcGet`
spada na zagregowany wiersz POZIOMU PLIKU, którego licznik `fix` należy do DOWOLNEGO sąsiedniego zakresu w tym
samym pliku — użycie go przypisałoby naprawę sąsiada temu zakresowi i zepsuło pomiar kosztu. `ageFn` zostaje na
współdzielonym bindingu bez zmian (dla realnego wiersza obie ścieżki i tak zwracają ten sam obiekt).
**Korekta uzasadnienia samej opinii projektowej (nie kodu — kod jest poprawny):** test (d) (dewianci STARSI, to
samo tempo dzienne) jest broniony przez BRAMKĘ λ, NIE przez wspólne okno `freshDays`, jak sugerowało domknięcie.
`freshDays` to podłoga (odrzuca zbyt młode zakresy), nie normalizator ekspozycji — starsi dewianci przy
niezmienionym tempie dziennym wciąż dają realny nadmiar w wyniku binarnym (5.80 bitu, potwierdzone niezależnie
poniżej), a to λ go wycisza. Wspólne okno świeżości jest osobno udowodnione przez przypadek (a) (`baseN=120` vs
surowe 126 — sześciu świeżo urodzonych konformujących wypada z mianownika kosztu, zostaje w liczniku faktu).
**Zgłoszone, nietknięte:** fakty pakietowo-leksykalne (dodawane po głównej pętli, `gi` wskazują na inne `ps`
klonów) nigdy nie są kandydatami kosztu — świadome, spójne z „użyj JUŻ POLICZONEJ tablicy `facts`", ale J5.5 musi
o tym wiedzieć. `where` renderuje `factNotes` tylko na kartach grupa/katalog/marker (gałąź plikowa `continue`uje
przed pętlą wypunktowań) — stąd fixture potrzebował 20 plików-wypełniaczy, żeby wymusić cięcie MDL na właściwym
poziomie. **Weryfikacja niezależna:** diff `core.mjs`/testu przeczytany w całości; `config.mjs` bajt w bajt
identyczny ze stanem po J4.3b. Cofnięto WYŁĄCZNIE bramkę λ (`if (!((local.has_fix+0.5)/(neff+KD/2)>=1-1/CFG.
lambda)) continue;`) → dokładnie 2/6 testów czerwone z DOKŁADNIE zgłoszonymi liczbami (test (c), przykład „9 z 12"
z oryginalnego bileta: `{k:9,n:12,baseK:11,baseN:120,bits:18.45}`; test (d), confound wieku:
`{k:6,n:12,baseK:12,baseN:120,bits:5.8}`) → przywrócono → 6/6 → pełny zestaw **1265/1265**.

#### J5.2 · Wzorce odrzucone (H8) — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** `core.mjs` `trendsFor`/nowa `rejectedValues(f, ps, H)`: dla wartości v ≠ `f.exp`: liczba zakresów, w
których `vev` pokazuje przejście `exp → v → exp` (próba i cofnięcie) vs zakresów, gdzie v przetrwało (ostatnie `vev` =
v); mówione gdy prób ≥ `CFG.minRaw` i cofnięć/prób ≥ 2/3 (ten sam próg supermajority) → `f.rejected = [{ v, tried,
reverted }]`. Render: `factNotes` `· \`v\` tried 4×, reverted 4× — a rejection, not an alternative`; `where` karta
grupy jw.
**Bump.** `MODEL_V` (fazy 5).
**Test.** `rejected-values.test.mjs`: historia z 5 próbami dekoratora Y cofniętymi do X → klauzula; próby, które
przetrwały (nucleation) → brak klauzuli, `nucleating` jak dziś.
**Zależności.** Brak.

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora):**
- **`· \`v\` tried 4×, reverted 4×` — dla faktu BOOLOWSKIEGO wydrukuje `\`false\``, co nic nie znaczy.** Flagowy
  przypadek testu (dekorator Y cofnięty do X) idzie przez `auto.deco:@X`, którego alfabet to `{true,false}`.
  Render musi iść przez `deviationPhrase(f, v)` (ma już poprawne brzmienie „is not annotated with `X`"), nie
  przez surowy backtick.
- **Dopisać granicę `valOf`.** `rejectedValues` może mówić wyłącznie o pidach, które `valOf` dekoduje:
  `nameshape`, `first1`, `ret`, `deco:@`, `extends:`. Dla wszystkich pozostałych rodzin jest strukturalnie cicha —
  ta sama granica, którą mają `trendsFor`/`calibrate`; `export.mjs` już ją dokumentuje pod `valueTracked`.
- **Fixture kontroli negatywnej — dopisać podłogi `trendsFor`.** `nucleating` wymaga: `shares.length ≥ 3` → **≥ 3
  okna po `CFG.trendWinDays`=90 dni historii**, `n ≥ 4` dekodowalnych zakresów w każdym oknie, `slope > 0.02`,
  `(1−last.share) > 0.05` i ≥ 2 różnych NIE-agentowych autorów mniejszościowej wartości. Bez tego kontrola jest
  zielona z niewłaściwego powodu.
- **`f.rejected` doklejane w `exportFacts`, obok `trend`/`calib`/`held`**, bramkowane `H` jak one — nie w
  `trendsFor` (ta zwraca jeden obiekt trendu i ma innych konsumentów).
- Kotwica renderu potwierdzona i poprawna: `factNotes` jest wołane z `whereCmd`, więc „`where` karta grupy jw."
  dostaje klauzulę za darmo (do `report` — patrz J5.5). `2/3` NIE jest nową stałą — najczęściej używana proporcja
  w tym kodzie (`altMarkerFor`, `placementHit`, `markerObs`, `authorConcentration`, J3.4's próg bliźniaków).
  `f.rejected` nie wycieka do `grain export` — `conv` jest jawną listą dozwoloną, potwierdzone, nic do zrobienia.

**Wykonanie.** `rejectedValues(fact, ps, H)` dodane zaraz po `trendsFor`, przed `calibrate` — dokładnie wg
mechanizmu: dla każdego zakresu z `H.vev` dekodowanego przez `valOf`, dla każdej wartości `v≠fact.exp` kiedykolwiek
przyjętej: `tried++`; jeśli OSTATNIA zdekodowana wartość zakresu to NIE `v` (czyli `v` nie przetrwało) →
`reverted++`. Mówione per wartość gdy `tried≥CFG.minRaw` i `reverted/tried≥2/3`. Doklejone w `exportFacts` obok
`trend`/`calib`, bramkowane `H`. Render w `factNotes` przez `deviationPhrase(f, r.v)` (nie surowy string
`true`/`false`) — zweryfikowane żywym testem (`assert.doesNotMatch(note, /\`false\`/)`). Sortowanie wyjścia
deterministyczne (`tried` malejąco, remisy po `v`). **Realna pułapka fixture'a znaleziona i udokumentowana przez
wykonawcę:** populacja narodzona i dotykana wyłącznie w oknie `CFG.freshDays` (14 dni) od HEAD dostaje `sraw=0`
(bramka przeżycia zeruje wszystko) — ŻADEN fakt się nie ustala, nie tylko brak klauzuli odrzucenia. Każdy
fixture historyczny potrzebuje końcowego commitu no-op ≥14 dni po narodzinach najmłodszego zakresu — odnotowane w
komentarzach testu dla przyszłych autorów fixture'ów. **Weryfikacja niezależna:** diff `core.mjs`/testu
przeczytany w całości; `config.mjs` bajt w bajt identyczny ze stanem po J5.1. Dwa cofnięcia: (1) podniesienie
progu `2/3`→`0.99` → ZERO czerwonych (fixture ma stosunek cofnięć 100%, próg nieodróżnialny na tych danych —
odnotowane jako luka pokrycia, nie błąd); (2) odwrócenie warunku `reverted` (`last!==v`→`last===v`, myląc
„przetrwało" z „cofnięto") → dokładnie 3/5 testów czerwone (flagowy mechanizm, jego render, determinizm) →
przywrócono → 5/5 → pełny zestaw **1270/1270**.

#### J5.3 · Egzemplarz kanoniczny z uzasadnieniem; udział agentów per fakt (H9) — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** `core.mjs` `learn()` `exportFacts`: wybór egzemplarzy (`exs`) uporządkowany kluczem: (1) konformuje na
wszystkich faktach swojej grupy (policzyć raz per zakres: liczba faktów grupy, na których jest dewiantem = 0),
(2) `L.churn === false`, (3) `!L.agentLast`, (4) najwcześniejszy `L.first` (pierworodny), (5) `L.last` najnowszy;
`exemplars[0].why = 'started this pattern (<YYYY-MM>), never needed a fix, human-authored'` (tylko prawdziwe człony).
`f.agentShare` = udział zakresów `f.conform` z `L.agentLast` i wiekiem ≤ 90 dni / `f.conform` z historią — klauzula
`· held mostly by agent-authored code (72% of recent conformers)` gdy ≥ 2/3 i n ≥ minRaw. Render `where` `pattern to
copy: file:from–to \`Name\` — <why>`.
**Bump.** `MODEL_V` (fazy 5).
**Test.** `canonical-exemplar.test.mjs`: fixture z egzemplarzem-dewiantem na innym fakcie i pierworodnym czystym →
pierworodny pierwszy z `why`; udział agentów: autorzy z `AGENT_AUTHOR_RE` w 8 z 10 świeżych → klauzula; 2 z 10 → brak.
**Zależności.** Brak.

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora):**
- **Sekwencjonowanie potwierdzone jako WYKONALNE, bez drugiego przebiegu** — nie jest to problem, wbrew wstępnej
  wątpliwości: w `learn()`'s `exportFacts` tablica `facts` jest już kompletna i każdy fakt niesie pełne `deviants`.
  Jeden przebieg `Map<gi, liczba faktów, na których jest dewiantem>` PRZED `.map(...)` wystarcza. Uwaga: liczyć
  nad SUROWYM `facts`, nigdy nad `exportFacts` — tam `deviants` jest już obcięte do 5 przez `topDeviants`.
- **`(2) L.churn === false` vs `why = '… never needed a fix …'` — klucz sortowania i twierdzenie mierzą DWA RÓŻNE
  POLA.** `L.churn` to „przepisany w ciągu 14 dni od narodzin"; „never needed a fix" to `L.fix === 0`, osobny
  licznik. Albo sortować po `L.fix === 0`, albo zmienić tekst na „was never rewritten right after it landed".
- **`wiekiem ≤ 90 dni` — trzecia liczba na to samo pojęcie, do usunięcia.** `learn()` liczy repo-szeroki udział
  agentów oknem 120 dni WPISANYM LITERALNIE, a `report`/`statusLines` drukują to jako „younger than `CFG.survDays`
  days". Użyć `CFG.survDays`; przy okazji podmienić literał `120` na `CFG.survDays` (jednoliniowa spójność).
- **`exemplars[0].why` ZMIENIA OPUBLIKOWANY SCHEMAT `grain export`.** `export.mjs` przepuszcza `exemplars: f.
  exemplars` wprost, a `docs/reference.md` deklaruje `exemplars` interfejsem publicznym z odbiorcą downstream.
  Rozstrzygnąć świadomie: albo dopisać `why` do `schemaNotes` w tej partii i zaadresować w J8.1, albo obciąć `why`
  w `export.mjs`. Nie zostawiać jako efekt uboczny.
- **`konformuje na wszystkich faktach swojej grupy` — doprecyzować populację.** Fakty komórki roli (`cid`
  zaczynające się `r<i>:`) czy WSZYSTKIE fakty partycji (populacja, którą bierze `otherDeviantsOf`, J0.1)? Wybrać
  i napisać.
- **`(4) najwcześniejszy L.first` — dopisać rezyduał:** `lcGet` przy braku wiersza zakresu spada na wiersz PLIKU,
  więc „pierworodny" bywa rozstrzygany narodzinami pliku. Akceptowalne, do komentarza.
- Fixture: partycja musi przejść `groupPartitions` (≥ 100 zakresów albo scalony kubełek ≥ 30) i mieć ≥ 10
  konformujących Z WIERSZEM `lc`. Zapisać liczby w komentarzu, wzorem `voices.test.mjs`.

**Wykonanie.** `deviantOnOther` (Map, `gi→liczba faktów partycji, na których jest dewiantem`) budowana RAZ nad
SUROWYM `facts` (przed `topDeviants`), populacja jak `otherDeviantsOf` (cała partycja). Pula egzemplarzy
(`unamb`/`f.conform`) sortowana 5-kluczowo WYŁĄCZNIE gdy `H` — bezpośredni `H.lc.get(skeyR(...))`, NIGDY
`mkWeightFn`'s `lcGet` (ten sam pułapek unikany co w J5.1: fallback plikowy przypisałby historię sąsiada). Zakres
bez własnego wiersza sortuje się najgorzej na każdym kluczu — świadomy, uczciwy rezyduał. `why` doklejane TYLKO
gdy zwycięzca czysto przechodzi wszystkie kryteria (`dev===0 && churn===false && !agentLast`), tekst poprawiony
względem oryginału bileta („was never rewritten right after it landed" zamiast „never needed a fix" — to ostatnie
mierzyłoby `L.fix`, którego nic tu nie sprawdza). `f.agentShare`: też bezpośredni lookup, okno `CFG.survDays`
(120) zamiast nowej liczby „≤90 dni"; PRZY OKAZJI podmieniony istniejący literał `<=120` w repo-wide udziale
agentów na `CFG.survDays` — jednoliniowe, jawnie zgłoszone porządkowanie, nie pełzanie zakresu. `export.mjs`:
`exemplars: f.exemplars.map(({why, ...e}) => e)` usuwa `.why` z publikowanego schematu, `schemaNotes.exemplars`
dopisany, zweryfikowane REKURENCYJNYM przejściem po całym JSON-ie eksportu (zero wystąpień klucza `why`) przy
jednoczesnym potwierdzeniu, że model w pamięci `.why` niesie. **Zgłoszone, nietknięte (poza zakresem — `docs/
reference.md` deklaruje publicznym interfejsem WYŁĄCZNIE `grain export`, nie `grain report --json`):** `cmdReport`
w `grain.mjs` też przepuszcza `exemplars: f.exemplars` wprost, więc `.why` wycieka i tam — kandydat na bilet J8.1.
**Weryfikacja niezależna:** diff `core.mjs`/`export.mjs`/testu przeczytany w całości; `config.mjs` bajt w bajt
identyczny ze stanem po J5.2. Cofnięto WYŁĄCZNIE klucz sortowania `dev` (usunięty z komparatora) → dokładnie 1/7
testów (flagowy: dewiant na INNYM fakcie w tej samej partycji fałszywie wygrywał) czerwony → przywrócono → 7/7 →
pełny zestaw **1277/1277**.

#### J5.4 · Uwagi ignorowane po ostrzeżeniu (feedback dla `check`, wersja CLI) — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** `grain.mjs`: `cmdCheck`/`cmdReview` po policzeniu `inChange` zapisują `.grain/cache/check-pending.json`:
klucz `rel#factKey#pid` → `{ t, obs }`; następne `check`/`review`/hook Post tego samego pliku: dla każdego pending
klucza — jeśli odchylenie zniknęło → `outcomes.acted++`, jeśli trwa po ≥ 1 kolejnej edycji pliku (plik dirty, treść
zmieniona — porównać hash) → `outcomes.ignored++` i licznik per `factKey`; prune po `GRAIN_HOOK_TTL_MS`.
`.grain/cache/check-outcomes.json` `{ acted, ignored, byFact: { factKey: ignored } }`. `statusLines`: `check notes
acted on: a of a+i (x%)` gdy > 0; `report` zdrowie: `ignored after warning: <fact> ×k`.
**Bump.** Brak.
**Test.** `check-feedback.test.mjs`: sekwencja: `check` z odchyleniem → edycja usuwająca → `check` → `acted 1`;
sekwencja z edycją nieusuwającą → `ignored 1`, `byFact`; `status` linia; prune po TTL (env).
**Zależności.** J1.1.

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora — brak `store` w `cmdCheck` i
wywołanie z hooka bez `store` potwierdzone przeciw żywemu kodowi):**
- **`statusLines: ...` — ZŁA KOTWICA, `statusLines` tego zrobić nie może.** Bierze wyłącznie `model`; `core.mjs`
  nigdy nie czyta katalogu store. Precedens: `placementOutcomeLine(store)` — helper w `grain.mjs`, wstrzykiwany do
  wyjścia `cmdStatus`, NIE do `statusLines`. Zrobić tak samo.
- **`report` zdrowie: ...` — `report(model, {top})` też nie może czytać pliku.** Dane outcomes muszą być
  PRZEKAZANE (`report(model, {top, outcomes})`), a `cmdReport` ma je wczytać. Wiąże ten bilet z J5.5 — dopisane w
  obu.
- **`cmdCheck`/`cmdReview` nie mają dziś `store`.** `ctx` w `main()` je niesie, więc ścieżka CLI wystarczy
  dodać do destrukturyzacji — **ale wywołanie z `check-hook` przekazuje `{model, root, isGit, args, opts, stamp}`
  BEZ `store`**, a to jest ta ścieżka, którą bilet wymienia jako główną. Przekazać `store` tam też. Dodatkowo
  `answer-grammar.test.mjs` woła `cmdCheck` bez `store` — kod musi znieść `store === undefined` bez rzucania.
- **„porównać hash" — niedookreślone.** Podać: sha256 treści pliku, `.slice(0, 16)`, dokładnie jak istniejący hook
  hash w `grain.mjs` (`createHash` już zaimportowane) — zapisany W REKORDZIE pending, czyli `{t, obs, h}`.
- **Klucz `rel#factKey#pid` ma `pid` dwa razy** — `factKey` już jest `f.cid + '|' + f.pid`. Klucz to
  `rel + '#' + factKey`.
- **`byFact: {factKey: ignored}` kluczuje na NIESTABILNEJ tożsamości.** `cid` zawiera indeks roli, który
  przemieszcza się przy każdym re-learnie; `.grain/cache/` nie jest czyszczone przy bumpie wersji. Istniejący
  precedens (placement outcomes) omija dokładnie ten problem świadomie, kluczując po sufiksie+tokenie, nie po
  `rel`/`cid`. Kluczować po czymś stabilnym (np. `partycja + '::' + pid`) ALBO kasować `byFact` przy zmianie
  `meta.model`/`meta.headSha`.
- **`inChange` to ZGRUPOWANE odchylenia** (`groupDeviations`, klucz `factKey|pid|obs`, tablica `hits[]`), nie
  pojedyncze zakresy. Zdefiniować „odchylenie zniknęło" jako „żadna grupa o tym `(rel, factKey)` nie występuje już
  w `inChange`".
- Ponowne użycie istniejącego `prunePending` jest darmowe, jeśli rekord ma pole `.t` — nie pisać drugiego prune'a.
- Test „`status` linia" musi celować w `cmdStatus`, nie w `statusLines`.

**Wykonanie.** `recordCheckFeedback(store, rel, partition, inChange, text)` w `grain.mjs`, dosłowne lustro
`recordPlacementPending`/`resolvePlacementPending`/`bumpOutcome` (try/catch „stateless is still correct, just
louder", `prunePending`/`GRAIN_HOOK_TTL_MS` reużyte bez nowej stałej). Klucz `rel + '#' + factKey` (bez
podwójnego `pid`). Rekord `{t, obs, h}` — `h = sha256(treść).slice(0,16)`. Rozstrzygnięcie per istniejący pending
klucz: brak pasującej grupy w `inChange` → `acted++`, usuń; hash inny a to samo odchylenie trwa → `ignored++`,
`byFact[partycja+'::'+pid]++`, usuń; hash ten sam → zostaw bez zmian. Po rozstrzygnięciu KAŻDA grupa `inChange`
bez żywego wpisu pending dostaje nowy — to celowo PONOWNIE UZBRAJA wpis rozstrzygnięty jako „ignored" (klucz jest
niezależny od treści), co jest zamierzonym zachowaniem: kolejna edycja bez naprawy to NOWY, osobny przypadek
zignorowania, nie podwójne liczenie tego samego — potwierdzone testem (b). `checkOutcomeLine(store)` dosłowne
lustro `placementOutcomeLine`, doklejone do `cmdStatus`. `cmdCheck`/`cmdReview` dostały `store` w destrukturyzacji;
wywołanie z `check-hook` (które dotąd go nie przekazywało — główna luka znaleziona przez recenzję) teraz przekazuje
`store: st2`. `answer-grammar.test.mjs`'s wywołanie bez `store` nietknięte i wciąż przechodzi (kod znosi
`store===undefined` bez rzucania). **Weryfikacja niezależna:** diff `grain.mjs`/testu przeczytany w całości;
`config.mjs` bajt w bajt identyczny ze stanem po J5.3. Cofnięto WYŁĄCZNIE prefiks partycji w kluczu `byFact`
(`partition+'::'+g.pid` → goły `g.pid`) → dokładnie 1/7 testów (test (b), sprawdzający stabilność klucza wprost
przez asercję na dokładnej wartości `'src/handlers::auto.deco:@Handler'`) czerwony → przywrócono → 7/7 → pełny
zestaw **1284/1284**.

#### J5.5 · Sekcja `== health ==` w `report`/`rules` — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** `core.mjs` `report`/`rulesMarkdown`: sekcja składająca: reguły z kosztem (J5.1), odrzucone (J5.2), komory
echa (J5.3 `agentShare`), ignorowane po ostrzeżeniu (J5.4 — czytane z pliku outcomes, jeśli jest), rozdwojone (J3.4),
niekompletne kształty (archetypy J4.1 z komórkami o udziale 0.6–0.85 — „zwykle, nie zawsze"), konwencje z ≥ 3
waiverami (J1.3), martwe steery (E4 baseline bez ruchu). Każdy wiersz kończy się sugestią decyzji: `→ grain decide
steer|waive|boundary …` (tekst, nie wykonanie).
**Bump.** Brak.
**Test.** `health-section.test.mjs`: fixture składająca ≥ 3 sygnały → sekcja z wierszami i sugestiami; brak sygnałów →
brak sekcji.
**Zależności.** J5.1–J5.4, J3.4, J4.1, J1.3.

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora — każde źródło upstream
sprawdzone osobno; próg archetypu przeliczony ręcznie i zgodny co do setnej):**
- **`komórkami o udziale 0.6–0.85` — dwie nowe stałe, z których jedna jest wyprowadzalna, druga ma trzy
  precedensy.** Przeliczone: bramka λ archetypu (J4.1) wymaga `k ≥ 0.875n + 0.375`, więc certyfikowany udział jest
  ZAWSZE ≥ 0.89 (n=5→1.00, n=20→0.90, n=100→0.89). Górna granica to po prostu „poniżej progu certyfikacji", nie
  0.85. Dolna: `0.6` istnieje już trzy razy w `core.mjs` (`impliedOf`'s companion, `groupKin`, `profileOf`'s
  skewed slots). Zapisać jako `share >= 0.6 && !certified`, zero nowych stałych.
- **`konwencje z ≥ 3 waiverami` — waiver nie zna konwencji.** `model.waivers` niesie `{path, name, pid, partition}`,
  nigdy `cid`. Grupować po `partition + '::' + pid`; grupowanie po samym `pid` skleiłoby różne komórki.
- **`martwe steery (E4 baseline bez ruchu)` — dopisać cichą dziurę pokrycia.** `baseline` jedzie tylko na
  `sd.pids[0]` i `baselineShare` czyta wyłącznie komórkę `_all`, więc każdy steer nad konwencją czysto grupową/
  katalogową ma `baseline: null` i nigdy nie może dać wiersza zdrowia. Plan §E4 dokumentuje to jako świadomy
  kompromis — powtórzyć w tym bilecie, żeby nikt nie „naprawiał" wiersza, który jest cicho z powodu już
  zdecydowanego.
- **`J5.4 — czytane z pliku outcomes, jeśli jest` — `report()`/`rulesMarkdown()` NIE UMIEJĄ czytać plików.** Są
  czystymi funkcjami modelu. Dane muszą wejść parametrem (`report(model, {top, outcomes})`), a wczytać je ma
  `cmdReport`/`cmdRules`. Dopisane też do korekt J5.4 — rozstrzygnąć jeden kształt w OBU biletach naraz.
- **`model.twins` — kształt potwierdzony i wygodniejszy, niż bilet zakłada:** J3.4 zwraca już `{a:{part,role,
  label}, b:{...}, sim}` z opcjonalnym `namedDifferently` — etykiety już rozwiązane, bez odpytywania `medoids`.
- **Głos i pułapka regexu markerów:** każdy wiersz zdrowia = `voice('practiced', ...)`. `voices.test.mjs` wykrywa
  wzorzec `etykieta: …` jako niezadeklarowany marker (pułapka, w którą J4.1 już raz wpadło) — sugestia `→ grain
  decide steer …` na końcu wiersza jest bezpieczna, ale wiersz NIE MOŻE zaczynać się od `słowo: `. Trzymać się
  bezdwukropkowego wzorca ` — `/` · ` z `report`'s istniejących linii.
- Fixture: składać z fixture'ów J5.1–J5.4, nie budować piątego od zera.

**Wykonanie.** `healthRows(model, outcomes)` (nowa funkcja, po `factTiers`, przed `report()`) składa WSZYSTKIE 8
sygnałów wymienionych w tekście bileta — orkiestrator pomylił się licząc „siedem" w brifie, wykonawca poprawnie
zauważył rozbieżność i zaimplementował wszystkie 8, zamiast ciąć jeden żeby zgodzić się z błędną liczbą (koszt
J5.1, odrzucone J5.2, komory echa J5.3, ignorowane-po-ostrzeżeniu J5.4, bliźniacy J3.4, niekompletne kształty J4.1,
≥3 waivery J1.3, martwe steery E4). Każdy wiersz ma prawdziwą, rozwiązywalną kotwicę (`roleExemplar` — nowy
helper — dla bliźniaków/archetypów; realny egzemplarz faktu dla kosztu/odrzuconych/echa; realny zdewiantowany
zakres lub egzemplarz dla ignorowanych-po-ostrzeżeniu, z cichym pominięciem wiersza gdy żadna kotwica się nie
rozwiąże — nigdy zmyślona ścieżka) i prawdziwą, sprawdzoną wobec realnej składni `grain decide` sugestię
`→ grain decide steer|waive|rm …`. Próg archetypu `share≥0.6 && !certified` DOKŁADNIE wg wyprowadzenia (certyfikacja
zawsze daje udział ≥0.89). Waivery grupowane `partition+'::'+pid`, nigdy samym `pid`. Martwe steery czytają
`baselineClause`'s WŁASNĄ frazę „no movement" zamiast reimplementować porównanie, z komentarzem wprost
stwierdzającym, że baseline istnieje TYLKO dla konwencji partycja-szerokich (świadoma, zaakceptowana dziura z §E4).
`outcomes` przewleczone jako parametr `report(model, {top, outcomes})`/`rulesMarkdown(model, {top, sha, date,
outcomes})`; `cmdReport`/`cmdRules` w `grain.mjs` dostały `store`, czytają `check-outcomes.json` tym samym wzorcem
co `checkOutcomeLine`. Sekcja `== health — N signal(s) ==` (i `## Health` w Markdown) całkowicie pominięta przy
zerze sygnałów. Próg wyświetlania `byFact`: `k≥2`, top 5 — świadomy wybór wykonawcy (brak istniejącego precedensu
jak dla J1.3's ≥3; ostrzeżenia z `check` są już rzadkie/bramkowane, więc `≥3` mogłoby ukryć realny sygnał
powtarzającego się ignorowania). **Zgłoszone, nietknięte (nie błąd J5.5, zauważone przy okazji):** `verbalize()`
na ręcznie zbudowanym modelu testowym z brakującym `st.kind` drukuje dosłowne „undefined here are annotated
with…" — dotyczy tylko zdeformowanych obiektów modelu (prawdziwe modele zawsze ustawiają `st.kind`), nie
prawdziwy problem. **Weryfikacja niezależna:** diff `core.mjs`/`grain.mjs`/testu przeczytany w całości; `config.mjs`
bajt w bajt identyczny ze stanem po J5.4. Cofnięto WYŁĄCZNIE wykluczenie certyfikowanych komórek
(`|| c.certified` usunięte z warunku) → dokładnie 1/7 testów (test (d), komórka certyfikowana przy 95% udziału
fałszywie pojawiała się w sekcji zdrowia) czerwony → przywrócono → 7/7 → pełny zestaw **1291/1291**.

#### J5.6 · Cztery nowe predykaty (H6) — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Opus**

**Zakres.** `core.mjs` `extractScopes`/`applyVocab`: (a) `auto.namesuffix` (zakresy nie-plikowe): ostatni token
`nameTokens(name)` gdy ≥ 2 tokenów, inaczej `none` — kategoryczny; (b) `auto.lex:imports` (plik): `sorted`/`unsorted`
× `grouped`/`flat` (posortowane leksykalnie po specyfikatorze? grupy oddzielone pustą linią?) → 4 wartości, tylko
gdy ≥ 3 importów; (c) `auto.mods` (zakres): posortowany zbiór modyfikatorów — dzieci węzła zakresu typu
`wordBounded(['modifier','modifiers'])` lub tokeny anonimowe ze zbioru gramatyki (`node-types.json` `named:false`
o typie w {`public`,`private`,`protected`,`static`,`async`,`export`,`abstract`,`final`,`override`} — zbiór słów
kluczowych z gramatyki, nie lista z głowy: brać te, które gramatyka deklaruje jako typy anonimowe); (d) `auto.memberorder`
(typ): sekwencja kategorii dzieci ciała (`field`/`ctor`/`method` po `wordBounded`) skompresowana do wzorca (`f+c m+`).
Wszystkie kategoryczne → `mine()` bez zmian; `verbalize`/`deviationPhrase` rozszerzone.
**Bump.** `EXTR_V` (fazy 5 — jeśli faza 3 już zbumpowała g25, to g26).
**Test.** `new-predicates.test.mjs`: fixture z 30 typami `*Handler` → `namesuffix = handler` certyfikowane;
importy posortowane w 29/30 → `lex:imports`; `private` na 28/30 metodach grupy → `mods`; kolejność członków;
`verbalize` czytelne.
**Zależności.** Brak.

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora — `PL_STOP` przeczytane w
całości, potwierdza dokładnie ten sam błąd co J3.4; `node-types.json` sprawdzone dla 6 gramatyk):**
- **`Bump: EXTR_V (jeśli faza 3 już zbumpowała g25, to g26)` — NIEAKTUALNE.** Faza 3 zbumpowała `MODEL_V`
  m17→m18, faza 4 m18→m19; `EXTR_V` stoi na `g24` od partii G. Bump fazy 5 to **g24 → g25**.
- **(a) `ostatni token nameTokens(name)` — POWTÓRZENIE BŁĘDU, KTÓRY J3.4 JUŻ ZNALAZŁO I NAPRAWIŁO.**
  `nameTokens` filtruje przez `PL_STOP`, które zawiera DOKŁADNIE `model`/`models`, `service`/`services`,
  `controller`/`controllers`, `component`/`components`, `view`/`views`, `type`/`types`, `module`/`modules`,
  `config` (potwierdzone, pełna lista przeczytana) — większość realnego słownika sufiksów. Wykonanie J3.4 opisuje
  dokładnie ten artefakt (`["dto","invoice"]` zamiast `["dto","model"]`), naprawiony przez `nameTokens(...)` →
  `tokenize(...)`. Zrobić to samo tutaj. **Test biletu tego NIE ŁAPIE — `handler` nie jest w `PL_STOP`** — dopisać
  obowiązkową asercję na `*Service`/`*Model`.
- **(c) „zbiór słów kluczowych z gramatyki, nie lista z głowy" jest NIEPRAWDĄ — do przepisania.** Sprawdzone w
  `node-types.json` dla java/c_sharp/typescript/kotlin/python/go: węzeł `modifiers`'s `children.types` wymienia
  WYŁĄCZNIE nazwane dzieci, nigdy anonimowych słów kluczowych. Gramatyka pozwala jedynie PRZEFILTROWAĆ listę
  wziętą z głowy przez zbiór typów anonimowych. Zmierzone trafienia: java 6/9, c_sharp 7/9, typescript 8/9,
  kotlin 6/9, python 1/9 (tylko `async`), go 0/9. Mechanizm zostaje dopuszczalny (ta sama kategoria co
  `TYPE_LIKE_RE`/`FUNC_LIKE_RE` — lista nad nazwami TYPÓW WĘZŁÓW, nie językami/frameworkami), ale bilet ma to
  powiedzieć uczciwie, nie udawać wyprowadzenia z gramatyki.
- **(c) `bindingFor` dziś WYRZUCA flagę `named`** — brak precedensu odpytywania typów anonimowych. Rozszerzyć
  `bindingFor` o jedno pole (np. `anonTypes`), memoizowane jak reszta.
- **(c) Anonimowe tokeny są dziś niewidoczne dla ekstrakcji** — `extractScopes` używa wszędzie `namedChildren`.
  Potrzebny nowy, jawny przebieg po `ch.children`.
- **(c) Pusty zbiór modyfikatorów musi dać `'none'`, nie `''`** — bramka próżności `mine()` odrzuca
  `['other','none','mixed','?']`, ale nie pusty string; inaczej go/python dostają wszechobecny, próżny fakt.
- **(b) Zła kotwica: wszystkie `auto.lex:*` powstają w `lexicalPreds(tree)`, nie w `extractScopes`/`applyVocab`.**
  `lexicalPreds` nie dostaje `b` — sygnatura musi je wziąć (oba miejsca wywołania je mają pod ręką).
- **(b) „posortowane leksykalnie po specyfikatorze" nie da się policzyć z `s.imports`** — `resolveImport`
  przepisuje specyfikatory względne i tablica jest deduplikowana; porządek źródłowy i oryginalny tekst są
  zniszczone. Test sortowania musi iść po SUROWYM tekście specyfikatora w kolejności źródłowej.
- **(b) Dwa darmowe zyski do potwierdzenia:** `auto.lex:imports` dostaje bramkę „to jest wybór" za darmo z
  `lexDomain` (≥ 2 zaobserwowane wartości), a `mdlCuts` czyta tylko `quote/semi/indent/decl` — nowy pred NIE
  zmienia partycjonowania, sprawdzalny warunek bajt-identyczności do wpisania w test regresji.
- **(d) Nie wynajdywać list, które już są**: `ctor` → `CTOR_LIKE_RE`, `method` → `FUNC_LIKE_RE`. Nowe jest
  wyłącznie `field`. Podać dokładną gramatykę skompresowanego wzorca (`f+c m+` — separator? RLE?) — to jedyne, co
  trzyma alfabet mały, a rosnący alfabet zaciska bramkę λ przez `K=|V|+1`.
- **Fixture testu `mods` stoi na krawędzi λ — przeliczone.** `private` na 28 z 30: przy 3 różnych zbiorach
  modyfikatorów `K=4` → `28.5/32=0.891` ✓ ledwo; przy 5 różnych `K=6` → `28.5/33=0.864` ✗ cichy. Fixture musi
  kontrolować liczbę różnych zbiorów modyfikatorów i zapisać ją w komentarzu, wzorem `voices.test.mjs`/korekty
  fixture'a z J4.1.
- Wszystkie fixture'y fazy: commity ≥ `CFG.freshDays` (14 dni) wstecz — bramka `sraw` w `mine()`.

**Wykonanie.** Wszystkie cztery predykaty zaimplementowane, z dwoma REALNYMI BŁĘDAMI WŁASNEGO BRIEFU orkiestratora
znalezionymi i naprawionymi przez wykonawcę na podstawie żywych zrzutów AST (nie zgadywania): **(1) skan JEDNEGO
poziomu `ch.children` dla `auto.mods` był niewykonalny dla 4 z 7 gramatyk** (Java/C#/Kotlin/PHP zagnieżdżają
modyfikatory 2-3 poziomy głębiej w węźle-nosicielu `modifier`/`modifiers` — dokładnie to, co ORYGINALNY tekst
bileta mówił, a co zgubiła parafraza w briefie). Naprawione zejściem rekurencyjnym OGRANICZONYM do węzłów-nosicieli
(`MODIFIER_HOLDER_RE = wordBounded(['modifier','modifiers'])`, głębokość ≤3), które nigdy nie wchodzi do ciała
(żaden typ węzła ciała nie pasuje). **(2) trzecie miejsce ustawiające `auto.nameshape`** (gałąź przypisania
funkcji, `const foo = () => {}`) pominięte w briefie — wykonawca zmierzył wpływ na TYM repo (wykluczenie
zrzuciłoby 1363 z 2272 zakresów metod z domeny predykatu przy zmniejszeniu alfabetu tylko 302→244) i świadomie
dołączył `auto.namesuffix` tam też, NIE dołączając `auto.mods` (modyfikator `export` siedzi na dziadku
`export_statement`, nie ma czego czytać). **(3) `auto.memberorder` potrzebował bramki, której brief nie
przewidział**: wzorzec jednego biegu (`'m+'`) certyfikował się na istniejącym fixturze (`superficial-check-caveat.
test.mjs`, 50 typów jedno-metodowych) i psuł jego zastrzeżenie — ciało jednej kategorii nie ma ŻADNEJ kolejności
do powiedzenia, ten sam rodzaj próżności, który `STRUCT_PID` już gdzie indziej tłumi. Naprawione: <2 biegów →
`'none'`, bramka próżności `mine()` odrzuca. `nameSuffix` używa surowego `tokenize`, NIGDY `nameTokens` (ten sam
artefakt `PL_STOP`, który J3.4 już raz naprawiło — potwierdzone testem regresji nazwanym wprost po tym ryzyku).
`auto.mods` zwraca `'none'` (nigdy pusty string) przy zerze trafień — bramka próżności `mine()` odrzuca
`['other','none','mixed','?']` explicite, ale NIE goły `''`. Zweryfikowane na 10 realnych `node-types.json`
(java/c_sharp/typescript/kotlin/python/go/scala/rust/php/cpp), reprodukując DOKŁADNIE liczby trafień z recenzji
pre-fazy plus 4 dodatkowe gramatyki. Gramatyka kompresji `auto.memberorder` precyzyjnie udokumentowana (bieg=2+
liter identycznych → `<litera>+`, remisy pojedyncze → sama litera, >6 biegów ucięte z `…`, długości biegów
CELOWO odrzucone żeby nie rozdymać alfabetu `K=|V|+1` w mianowniku λ). `lexicalPreds(tree)` → `lexicalPreds(tree,
b)`, oba miejsca wywołania zaktualizowane. `SUPERFICIAL_PID` w `grain.mjs` rozszerzone o `namesuffix` (uzasadnione
— nazwa-sufiks to naming/lexical style w duchu istniejącej reguły), świadomie BEZ `mods`/`memberorder` (twierdzenia
strukturalne, nie stylistyczne). **Zgłoszone, nietknięte:** `mine()`'s `alph` jest globalne per-PID, nie per
(pid, kind) — na tym repo `auto.namesuffix` ma `|V|=302`, `K=303`, próg λ wymaga `n≥~1057` identycznych obserwacji,
praktycznie nieosiągalne nawet w jednorodnej komórce typu — istniejący projekt `mine()`, poza zakresem, kandydat
na przyszły bilet. Kilka gramatyko-specyficznych luk (`export` niewidoczne dla `auto.mods` w TS; konstruktory TS
klasyfikowane jako `m` nie `c`; `auto.lex:imports` nigdy nie odpala dla C#/Ruby/PHP) — udokumentowane, nietknięte.
**Weryfikacja niezależna:** diff `core.mjs`/`grain.mjs`/testu przeczytany w całości; `config.mjs`'s `EXTR_V`
potwierdzone NIETKNIĘTE (`git diff` pokazuje `g24` wyłącznie jako kontekst, bez `+`/`-`). Dwa cofnięcia w różnych
mechanizmach: (1) `nameSuffix`: `tokenize`→`nameTokens` → dokładnie 3/38 testów czerwone (w tym test nazwany
wprost „THE PL_STOP REGRESSION") → przywrócono; (2) `modifiersOf`: `'none'`→`''` → dokładnie 3/38 testów czerwone
(w tym dedykowany test próżności dla Go/Python) → przywrócono → 38/38 → pełny zestaw **1329/1329**.

Bump `EXTR_V` g24→g25 (jedyny bilet fazy 5 dotykający ekstraktora — cztery nowe predykaty w `extractScopes`/
`lexicalPreds`) wykonany przez orkiestratora poniżej.

#### J5.7 · (rola, moduł) w `architectureNorms`; co-change per zakres — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** (a) `architectureNorms`: druga populacja komórek (grupa `part#role`, moduł docelowy) — zakresy grupy, które
sięgają modułu (przez `model.edges` z pliku zakresu) : nie; ten sam test; `archNorms[].fromKind = 'group'`;
`computeArchHits`: dla pliku w grupie G z normą `false` → nota `<group> established practice is not to reach <B>`.
(b) co-change per zakres: `H.vev`/`fps.scopes` → pary kluczy zakresów w tych samych commitach, `pairSup` jak plikowe,
`cochangeMinSup`/`megaCap`; `check <file>` dokłada `co-change (scopes): \`validate\` ↔ \`schema\` in Y (k/N)`.
**Bump.** (a) `MODEL_V`, (b) `HIST_V`.
**Test.** Dwa osobne pliki testowe, każdy z fixture pod swój mechanizm; kontrola: brak fałszywych norm przy grupach
< minRaw.
**Zależności.** J2.1 (b), J4.1 (a).

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora):**
- **(a) Populacją muszą być DISTINCT PLIKI grupy, nie zakresy.** `architectureNorms` liczy `reached` per plik;
  plik z 20 metodami jednej roli wniósłby 20 „niezależnych" obserwacji tego samego zbioru krawędzi, a `neff` idzie
  wprost do BIC i bramki λ. Napisać: `neff = |{rel : rel ma członka grupy G}|`.
- **(a) `ten sam test` musi znaczyć JEDEN `idxCost` nad OBIEMA populacjami** (moduł-moduł i grupa-moduł razem),
  wzorem `mine()`/`bridgeBits`'s `universe3`/J4.1's `cellGlobal` — nigdy osobny lokalny `idxCost` dla par grupowych
  (dokładnie ten antywzorzec, który domknięcie J4.1 już nazwało). **Konsekwencja do zapisania: wspólny `idxCost`
  PODNOSI koszt istniejących norm modułowych — `archNorms` NIE jest po tym bilecie bajt-identyczne**, test
  regresji musi to pokryć jawnie.
- **(a) `archNorms[].fromKind='group'` zmienia opublikowany schemat** — `export.mjs:92` przepuszcza `archNorms`
  wprost, a jego `schemaNotes` opisują je jako pary (moduł źródłowy, moduł docelowy). Rozstrzygnąć świadomie
  (odfiltrować wiersze grupowe w eksporcie, albo zaktualizować `schemaNotes` w tej partii i zaadresować w J8.1).
- **(b) `megaCap` to cap na PLIKI, nie na zakresy.** Commit 30-plikowy może dotknąć 200+ zakresów → 19900 par w
  jednym commicie. Dodać jawny cap na liczbę zakresów per commit, wzorem `megaCap`.
- **(b) Bump niepełny: potrzebne `HIST_V` I `MODEL_V`.** `checkFile` nie widzi `H` — pracuje z `model.json`, więc
  dane muszą być prekomputowane NA MODEL, dokładnie jak `model.cochange`/`model.moves`/`model.msgAffinity`.
- **(b) Klucze `fp.scopes` są ścieżkami HISTORYCZNYMI** — przemapować przez `currentPathOf` (J4.1), z tym samym
  akceptowanym rezyduałem dla zakresów przemianowanych w miejscu.
- Potwierdzone: `architectureNorms(model)` woła się PO `model.partitions.push` — nic w `learn()` nie trzeba
  przestawiać. Kontrola testowa „brak fałszywych norm przy grupach < minRaw" bez poprawki (a) będzie zielona z
  niewłaściwego powodu — dopisać asercję na `neff` liczonym po plikach.

**Wykonanie.** Obie połówki zaimplementowane przez `impl-J5-7` (Sonnet), zgodnie ze wszystkimi korektami powyżej.
(a) `architectureNorms` buduje drugą populację `groupPairs` z `model.partitions[].assignments` — `neff` = zbiór
DISTINCT plików niosących członka grupy (Set, nie licznik zakresów), `trueN` z tej samej mapy `reached` co para
moduł-moduł (bez przebudowy). JEDEN `idxCost = ceil(log2(pairs.size + groupPairs.size))`, liczony raz, przed
filtrowaniem którejkolwiek populacji — wydzielony do wspólnego domknięcia `evaluate(A,B,trueN,neff,fromKind)`, żeby
uniknąć duplikacji testu bits/λ. Każdy wiersz `archNorms` niesie teraz `fromKind: 'module'|'group'`.
`computeArchHits` renderuje trafienie grupowe wewnątrz istniejącej gałęzi `if (fwd)`: `«label» established
practice is not to (...)`, przynależność do grupy czytana z `part.assignments`, memoizowana na
`model._archFileGroups` (ten sam wzorzec nietrwałego cache co `_archModOf`). `export.mjs` filtruje
`fromKind==='group'` z publikowanego `archNorms` + jedna linia w `schemaNotes` dokumentująca świadome wykluczenie
(decyzja schematu odłożona do J8.1). Skutek uboczny wspólnego `idxCost` poprawnie zaadresowany także w
`report()`/`rulesMarkdown()`: licznik „N module pair(s)" teraz jawnie filtruje `fromKind!=='group'` (bez tego
wiersze grupowe fałszywie zawyżałyby liczbę par modułowych).
(b) `history.mjs`: nowe `state.scopePairSup`/`state.scopeCommits` w `freshState()`, wypełniane w istniejącej
pętli replay przez PONOWNE UŻYCIE `touched.get(c.sha)` (ten sam Set, który `fps.push` już czyta jako `scopes` —
zero duplikacji odczytu), bramkowane nowym `CFG.scopePairCap = 200` (dodane do `config.mjs` obok `megaCap`, z
uzasadnieniem: `megaCap` ogranicza PLIKI per commit, ale commit w tej granicy może dotknąć setek zakresów — 200
trzyma najgorszy przypadek par na tym samym rzędzie wielkości co najgorszy przypadek `megaCap`). `toH()` finalizuje
`H.scopeCochange` (identyczny kształt do `H.cochange`). `core.mjs`'s `learn()` buduje `model.scopeCochange`,
przemapowując połowę-ścieżkę kluczy `a`/`b` przez `currentPathOf` RAZ, w czasie uczenia (checkFile nigdy nie widzi
`H` — dokładnie jak `model.cochange`/`model.moves`/`model.msgAffinity`). Nowa `scopeCochangeLines(model, rel,
partitionName)` w `core.mjs`, dołączona wyłącznie do `cmdCheck` (nie do współdzielonego `missingLines` — bilet
zakresił to renderowanie do `check <file>`), bramkowana istniejącym `CFG.cochangeMinConf` (żaden nowy próg).
Żaden stały wersji (`EXTR_V`/`HIST_V`/`MODEL_V`) nie został zbumpowany przez wykonawcę — zgodnie z zasadą K2,
wspólny bump Fazy 5 zostaje zastosowany przez orkiestratora po J5.8.

Zweryfikowane niezależnie: przeczytany cały diff `architectureNorms`/`computeArchHits`/`export.mjs`'s filtr/
`report`+`rulesMarkdown`'s poprawka liczników (a) oraz `history.mjs`'s `freshState`/pętla replay/`toH` i
`core.mjs`'s `model.scopeCochange`/`scopeCochangeLines`/`grain.mjs`'s wpięcie do `cmdCheck` (b) — zgodne z opisem.
Dwa celowane odwroty przez `Edit` (bez `git checkout`/`stash`): (1) `idxCost` cofnięty do `pairs.size` (bez
`groupPairs.size`) → test (a2) poprawnie czerwony z dokładnym komunikatem o różnicy bitów, przywrócony → zielony;
(2) `CFG.scopePairCap` w warunku bramkowania podmieniony na `999999` → cały plik `scope-cochange.test.mjs` pada
(crash po (b1), ~73s) — sam ten tryb awarii POTWIERDZA, dlaczego cap jest niezbędny (kombinatoryczna eksplozja par
z nieograniczonego mega-commitu zakresów), przywrócony → zielony (5/5). Pełny pakiet testów: **1339/1339** (baseline
1329 + 10 nowych: 5 w `group-arch-norms.test.mjs`, 5 w `scope-cochange.test.mjs`). `config.mjs` dotknięty wyłącznie
dodaniem `CFG.scopePairCap` — żadna stała wersji nie zmieniona przez wykonawcę, potwierdzone osobistym odczytem
diffa. Worktree (`git worktree add --detach`) użyte przez wykonawcę do izolowanego testu na HEAD zamiast
`stash`/`checkout` — potwierdzone brakiem osieroconych worktree (`git worktree list` czysty).
Znalezione po drodze, nie naprawione (zapisane jako notatka pamięci `grain-engine-gotchas.md`, nie nowy bilet):
`induceRoles`'s klastrowanie MDL nie łączy N niemal identycznych klas, których jedyną wspólną cechą jest dekorator
plus unikalny token nazwy per instancja — unikalny token kosztuje więcej po złączeniu niż pozostawienie jako szum
na singletonie. Fixture ról-grup na przyszłość musi dawać klastrowanej metodzie identyczną, powtórzoną sygnaturę
(wzorem `kin-completeness.test.mjs`), nie tylko wspólny dekorator.

#### J5.8 · Diff szkieletu w `check` (H11) — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Opus**

**Zakres.** `core.mjs` `skelOf` zwraca dodatkowo mapę slot→węzeł (`skelOfWithNodes`), `profileOf` zachowuje `tpl`;
`checkFile`: dla zakresu przypisanego do roli z profilem — `skAlign(tpl, sk)`; brakujący element niezmienny
szkieletu (leaf/poddrzewo obecne u 100% członków, nieobecne tu) → `msgs` odchylenie strukturalne `pid:
auto.shape:<sig>` (głos praktykowany, `n of N` = członkowie z elementem). Cap: jedno odchylenie kształtu per zakres.
**Bump.** `MODEL_V` (profil z `tpl`).
**Test.** `skeleton-diff.test.mjs`: grupa z blokiem `catch` u 12/12; nowy członek bez → odchylenie kształtu;
członek z → brak.
**Zależności.** Brak.

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora — `_tpl` J3.4 i ścieżka
serializacji `check` sprawdzone osobiście, `skAlign` przeczytane ponownie):**
- **`profileOf zachowuje tpl` — KOLIZJA Z J3.4, twardsza niż duplikacja pracy. PYTANIE PROJEKTOWE, wymaga
  niezależnej opinii przed implementacją.** J3.4 zbudowało już `_tpl` jako NIEENUMEROWALNE (`core.mjs:426`)
  właśnie dlatego, że `part.profiles` jest przepuszczane wprost do opublikowanego schematu przez `export.mjs:117`
  (`profile: (part.profiles || {})[r] || null`). To działa, bo J3.4 czyta `_tpl` wyłącznie w pamięci wewnątrz
  `learn()`. **J5.8 potrzebuje `tpl` w czasie `check`, a `checkFile` dostaje model wczytany z
  `.grain/cache/model.json` (zapisany `JSON.stringify`) — nieenumerowalne `_tpl` jest tam nieobecne z definicji.**
  Utrwalenie go oznacza cofnięcie świadomej decyzji J3.4 i wyciek surowego drzewa AST do opublikowanego schematu.
  Rozstrzygnąć niezależną opinią PRZED implementacją.
- **`skAlign(tpl, sk)` — BŁĄD TYPU.** `skAlign(ka, kb)` bierze TABLICE DZIECI, nie całe drzewa (patrz `skAu`, gdzie
  woła je z `a.slice(1)`, `b.slice(1)`). Właściwe wywołanie to `skAu(tpl, sk)` i porównanie `skCount`, albo
  `skMatch` na SPONUMEROWANYM szablonie (`_tpl` jest sprzed `skNumber`).
- **Asymetria `skAu` NIE gryzie tutaj — ale trzeba to zapisać.** `skAlign`'s `eq` testuje dziurę wyłącznie po
  stronie `x` (zawsze `a`); tu `a` = szablon (akumulator grupy), `b` = instancja — jedyny kierunek, dla którego
  `skAu` jest poprawne. Napisać wprost: `tpl` ZAWSZE jako pierwszy argument, żeby nikt tego nie odwrócił.
- **`verbalize`/`deviationPhrase` nie mają gałęzi `auto.shape:`** — bez niej `verbalize` wydrukuje dosłownie
  `auto.shape:a3f9 = true`. J5.6 rozszerza je dla SWOICH predykatów — dopisać gałąź `auto.shape:` tutaj.
- **`msgs` wymaga `delta`** (sortowanie, render „(preference gap N bits)") — podać czym jest `delta` odchylenia
  kształtu (kandydat: `skCount(tpl) − skCount(skAu(tpl, sk))` w bitach — to decyzja, nie oczywistość).
- Odchylenie kształtu nie ma preda, więc nie przejdzie istniejącą pętlą `checkFile` (napędzaną `part.facts` ×
  `s.preds[f.pid]`) — potrzebna osobna pętla, z syntetycznym obiektem faktu do renderu.
- **`n of N` = `N of N` z konstrukcji** — `tpl` to anty-unifikacja WSZYSTKICH członków, więc każdy jego element
  jest u 100% z definicji. Uczciwe, ale napisać to wprost, żeby nikt nie szukał nietrywialnego licznika.
- Fixture: `profileOf` powstaje tylko dla grup ≥ 4 członków i przy `shared ≥ 6`; partycja musi przejść
  `groupPartitions` (≥ 100 zakresów albo scalony kubełek ≥ 30). Zapisać liczby w komentarzu.

**Domknięcie mechanizmu (opinia niezależna Opus, 2026-08-31, zweryfikowana przez orkiestratora — `pf.held =
heldOf(arr)` po zwrocie `profileOf` i spread `...pf` w `mineTemplates` sprawdzone przeciw żywemu kodowi):**
Prawdziwym problemem nie jest nieenumerowalność sama w sobie, tylko SUROWE DRZEWO trafiające do schematu eksportu
i pliku cache. Każda enumerowalna forma `_tpl` (nowe pole o innej nazwie, albo uczynienie `_tpl` enumerowalnym) ma
DOKŁADNIE ten sam problem; filtrowanie na granicy `export.mjs` tylko przenosi decyzję i wciąż wsadza surowe drzewo
AST do `.grain/cache/model.json`, parsowanego przy KAŻDYM poleceniu przez ciepłą ścieżkę `ensureFresh`.
- **Rozwiązanie: persystować POCHODNE, ograniczone pole `req`** — liczności LITERALNYCH (nie-dziurowych) sygnatur
  szablonu — jako zwykłe, enumerowalne pole profilu. `_tpl` zostaje BEZ ZMIAN, nieenumerowalne, nietknięte.
- **Dowód poprawności**: każdy literalny węzeł `rawTpl` mapuje się WSTRZYKUJĄCO w każdego członka (`skAu` łączy
  dzieci pozycyjnie przy zgodnej arności, albo przez parowanie LCS z `skAlign` w przeciwnym razie — oba zachowania
  są porządek-zachowujące i wstrzykujące; dziury to jedyny przypadek nie-wstrzykujący i są wykluczone z liczenia z
  konstrukcji). Stąd `count(sig w tpl) ≤ count(sig u KAŻDEGO członka)` — kandydat mający mniej niż `k` wystąpień
  sygnatury `sig` DOWODLIWIE brakuje struktury, którą niosą wszyscy `n` certyfikowanych członków. Zero fałszywych
  oskarżeń z samego kodowania.
- **Tanie i publikowalne**: `SK_CAP=300` (`core.mjs:348`) ogranicza szkielet, więc ogranicza i szablon; dodać cap
  ~40 wpisów na `req` — profil rośnie o kilkaset bajtów, nie kilobajty. Pole ma sens publiczny („jakie elementy
  strukturalne niesie KAŻDY członek tej grupy"), w tym samym rejestrze co istniejące `skel`/`perInstance`/`slots`.
- **`export.mjs` nie wymaga ŻADNEJ zmiany** — dosłowne przepuszczenie profilu (`export.mjs:117`) niesie `req`
  addytywnie; pole dodane, nie zmiana schematu (`export.mjs:4-5`'s reguła wersjonowania nietknięta). Dopisać jeden
  wpis do `schemaNotes`.
- **Dwa błędy ZNALEZIONE ZAWCZASU w odrzuconej alternatywie (biała lista na granicy `export.mjs`), do zapisania
  jako uzasadnienie wyboru:** (1) `learn()` MUTUJE profil PO zwrocie `profileOf` — `pf.held = heldOf(arr)`
  (`core.mjs:1245`, potwierdzone) — biała lista `{n,shared,coverage,skel,perInstance,slots}` CICHO wyrzuciłaby
  `held` z opublikowanego eksportu; (2) `mineTemplates` rozpościera cały profil (`...pf`, `core.mjs:449`,
  potwierdzone) — `req` pojedzie więc też na `part.templates`/eksportowane `templates`, co jest nieszkodliwe i
  potencjalnie użyteczne, ale ma być ŚWIADOMYM wyborem, nie niespodzianką przy recenzji.
- **Opcja „przelicz na żądanie" jest MARTWA, precyzyjnie**: surowe szkielety członków (`s.sk`) SĄ persystowane
  (`serializeScope`, osobny plik cache drzewa), ale NIE na `model`, a `checkFile` dostaje wyłącznie `model`.
  Przeliczanie na gorącej ścieżce `check` kosztowałoby odczyt całego cache'u drzewa + fold `skAu` po członkach per
  zapytanie. Odtwarzanie z `profile.skel` pozostaje stratne (ucięcie 220 znaków, kompresja `×N`) — potwierdzone
  wcześniejszym ustaleniem J3.4.
- **Kształt `part.profiles[r]` po tym bilecie**: `{n, shared, coverage, skel, perInstance, slots, req, held}` —
  wszystkie enumerowalne; `_tpl` nieenumerowalne, nietknięte.
- **`MODEL_V` bumpuje się z INNEGO powodu niż tekst bileta zakłada** — nie „profil z `tpl`", tylko „profil z
  `req` (liczności sygnatur literalnych szablonu, nie samo drzewo)". Bez bumpa ciepły cache m19 nie niesie `req` i
  funkcja jest cicho martwa do następnego wymuszonego re-learn.

**Wykonanie.** Zaimplementowane przez `impl-J5-8` (Opus), dokładnie wg zfinalizowanego domknięcia powyżej — bez
odtwarzania `_tpl`/`skAlign(tpl,sk)` z pierwotnego tekstu bileta. `sigCounts(t, into)` (nowa funkcja lokalna,
`core.mjs` obok `skCount`) liczy wystąpienia sygnatur węzłów LITERALNYCH (nie-dziurowych), jedna funkcja użyta w
DWÓCH miejscach: na `rawTpl` (z dziurami) w `profileOf`, i na gołym `s.sk` kandydata (dziury niemożliwe poza
`skAu`) w `checkFile` — więc obie strony nie mogą rozjechać się w tym, co liczą. `profileOf` dokłada `req` jako
zwykłe ENUMEROWALNE pole na `out` (cap 40, sortowanie licznik malejąco/sygnatura rosnąco) — `_tpl` i jego
`Object.defineProperty` nietknięte. Nowy przebieg w `checkFile` (tuż przed `msgs.sort`) odtwarza rolę zakresu
DOKŁADNIE tym samym wzorcem co `steerHits` (`part.assignments[skeyR(...)]` z fallbackiem `assign`/`amb`), dla
każdego brakującego `sig` w `pf.req` wybiera JEDEN, najbardziej obciążony (najwyższy `need`, remis: sygnatura
rosnąco) — deterministyczny wybór, udokumentowany jako decyzja. `delta` liczone TYM SAMYM estymatorem KT co każde
inne odchylenie w kodzie: `-log2(kt({true:pf.n,false:0}, 2, 'false', pf.n))` (populacja zdegenerowana all-true z
definicji dowodu wstrzykliwości) — bez nowej stałej, bez ad-hoc jednostki. Tekst renderowany WPROST (wzorem
`steerHits`/`archHits`/`waiverHits`), bez nowej gałęzi w `verbalize`/`deviationPhrase` (pierwotny pomysł bileta —
świadomie porzucony, bo `verbalize` nie pasuje do faktu wielozbioru-wystąpień). Skutek uboczny znaleziony i
naprawiony w tej samej partii: `grain.mjs`'s render „pre-existing (…)" wołał `verbalize` na fakcie bez predykatu,
drukując dosłowne `auto.shape:<sig> = <count>` — naprawione wąsko przez nowe pole `g.summary` (niesione tylko
przez fakty §J5.8), z fallbackiem do starego zachowania dla wszystkich innych typów faktu.

Zweryfikowane niezależnie: przeczytany cały diff `sigCounts`/`profileOf`'s `req`/`checkFile`'s nowy przebieg/
`grain.mjs`'s `g.summary` — zgodny z opisem; ręcznie przeliczony wzór delty: `kt({true:12,false:0},2,'false',12) =
0.5/13`, `-log2(0.5/13) = log2(26) ≈ 4.7004 → 4.70` — zgodne z testem i z raportem. Jeden celowany odwrót przez
`Edit` (bez `git checkout`/`stash`): `delta` podmieniona na stałą `1` → test `check` na kandydacie z brakującym
`try_statement` poprawnie czerwony (`/preference gap 4\.7 bits/` nie pasuje do `(preference gap 1 bits)`),
przywrócona → 8/8 zielone. Pełny pakiet testów: **1347/1347** (baseline 1339 + 8 nowych w
`skeleton-diff.test.mjs`). `config.mjs`/`export.mjs` potwierdzone nietknięte osobistym odczytem diffa — `req`
dociera do `grain export` wyłącznie przez już-istniejące dosłowne przepuszczenie profilu (`export.mjs:118`).

Decyzje orkiestratora po zgłoszonych rozbieżnościach: (1) `export.mjs`'s `schemaNotes` — bez nowego wpisu; `req`
jest samo-opisowym polem addytywnym (liczności sygnatur), inaczej niż `fromKind`/`why`, które wymagały wyjaśnienia
bo niosły niejednoznaczność — brief miał rację, tekst bileta w tym miejscu nieaktualny. (2) Jakość remisu
(„najczęstsza sygnatura" bywa kontenerem ogólnym, nie markerem strukturalnym, którego szukałby czytelnik) —
zaakceptowana, deterministyczna i bezpieczna (zero fałszywych trafień), nie block'uje 0.3.0; kandydat na przyszłe
dopracowanie, nie nowy bilet. (3) Nakładanie się `auto.stshape:`/`auto.shape:` na tej samej zmianie — zaakceptowane
jako redundancja tego samego rodzaju co współistniejące konwencje gdzie indziej w kodzie, nie duplikat błędu.
(4) `extractScopes`'s podwójna ekstrakcja `catch`/`finally` (core.mjs:317) — przedsesyjny, niezwiązany z tym
biletem, nieszkodliwy na tym fixture; niedodawany jako nowy bilet 0.3.0 (poza zakresem odkrycia tej partii, w
przeciwieństwie do np. `voices.test.mjs`'s NON_CLAIM poprawek, które były BEZPOŚREDNIM skutkiem zmiany biletu).
(5) Luka pokrycia testowego dla ścieżki „pre-existing shape deviation" — zaakceptowana jako WŁAŚCIWOŚĆ mechanizmu
(odchylenie, które stałoby się większością, przestaje być odchyleniem po scaleniu do szablonu), nie brak testu do
domknięcia.

**FAZA 5 W CAŁOŚCI ZROBIONA (J5.1–J5.8), zweryfikowana niezależnie na każdym bilecie.** Dwie niezależne opinie Opus
przed implementacją w tej fazie: J5.1 (kształt komórki kosztu dewiacji — poprawiła błędne ramowanie, nie tylko
brakującą stałą) i J5.8 (kolizja `_tpl` z eksportowanym schematem — rozstrzygnięcie: pole `req`, pochodne i
ograniczone, zamiast surowego drzewa pod jakąkolwiek nazwą). Zero regresji, zero incydentów `git checkout`/
`git stash` (J5.7/J5.8 użyły `git worktree add --detach` do izolowanych odczytów HEAD zamiast `stash`). Wspólny
bump `MODEL_V` m19→m20 (J5.1's `f.cost`, J5.2's `f.rejected`, J5.3's `f.agentShare`/`exemplars[].why`, J5.7a's
`archNorms[].fromKind`, J5.7b's `model.scopeCochange`, J5.8's `part.profiles[r].req`) i `HIST_V` h8→h9 (J5.7b's
`state.scopePairSup`/`state.scopeCommits`) wykonane przez orkiestratora, pełny zestaw po obu bumpach: **1347/1347**.
Dalej: Faza 6.**

### Faza 6 — Momenty (hooki) — WCHODZI DO 0.3.0 (decyzja utrzymującego 2026-08-31: nic nie jest poza 0.3.0)

#### J6.1 · Prompt użytkownika → `how` — ✅ ZROBIONE, zweryfikowane niezależnie · **model: claude-code-guide (weryfikacja zdarzenia) → Sonnet**

**Zakres.** Zdarzenie hooka na wysłanie promptu (nazwę i kształt payloadu ZWERYFIKOWAĆ w aktualnej dokumentacji
Claude Code przy implementacji — nie zgadywać, jak D7; jeśli zdarzenie nie istnieje dla danego hosta, bilet
degraduje do wpisu w SKILL „każde zadanie zaczyna się od `how`"). `grain.mjs` `case 'how-hook'`: prompt ze stdin
JSON, tokeny, `howCmd` z `top=3`; wstrzyknięcie tylko gdy archetyp certyfikowany (J4.1) LUB ≥ 2 dopasowania z
pokryciem ≥ 0.5; wyłącznie linie głosu praktykowanego (komórki archetypu, miejsca `k/K` gdzie K ≥ 2) — przykład
(commit) NIE wchodzi (J0.1); cap 6 linii; TTL po zbiorze tokenów w `hook-seen.json`. `hooks.json` + `codex-hooks.json`.
**Test.** `how-hook.test.mjs`: payload z promptem pasującym → `additionalContext` z miejscami, bez `example`; prompt
bez dopasowania → pusto, exit 0; powtórka w TTL → pusto.
**Zależności.** J2.2, J4.1, J0.1.

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora — `cmdReview`/`topDeviants`/
`missingLines` sygnatury sprawdzone osobiście przez `grep`; payload/output UserPromptSubmit zweryfikowany
bezpośrednio przez orkiestratora przez `WebFetch` na code.claude.com/docs/en/hooks, cytat dosłowny poniżej):**
- **UserPromptSubmit, potwierdzone wprost z żywej dokumentacji:** pole promptu to `prompt` (nie `tool_input.*`).
  Pełny input: `{session_id, prompt_id, transcript_path, cwd, permission_mode, hook_event_name, prompt,
  prompt_source}`. `prompt_source` ∈ `user_input|slash_command|skill|agent_request` — WARTE ROZWAŻENIA przez
  wykonawcę: pominięcie wstrzyknięcia dla źródeł innych niż `user_input` (slash command/skill to już celowa akcja),
  ale to DECYZJA wykonawcy, nie ustalona z góry. Output: `{hookSpecificOutput:{hookEventName:'UserPromptSubmit',
  additionalContext, updatedPrompt?, systemMessage?}}` — `additionalContext`, NIE `updatedPrompt` (to ostatnie
  PODMIENIA prompt). Brak wsparcia `matcher` dla tego zdarzenia (zgodne z założeniem bileta).
- **„wyłącznie linie głosu praktykowanego" NIE jest implementowalne jako filtr nad `lines`.** `voice('practiced',
  text)` zwraca `text` NIEZMIENIONY — nie ma prefiksu do odróżnienia. Linie „miejsc" w `howCmd` są zwykłymi
  stringami, nigdy nieowinieta `voice()`. Filtr „zostaw tylko praktykowane" zostawiłby linię `shape` i `co-change:`,
  a USUNĄŁBY dokładnie miejsca, których wymaga bilet. **Poprawka: budować wstrzykiwany tekst ZE STRUKTURY
  (`shape.cells` + `places`), nigdy przez filtrowanie `lines`** — to też daje wymóg J0.1 (bez `example`) za darmo,
  bo linie `voice('example', …)` po prostu nie są konstruowane.
- **„prompt bez dopasowania → pusto" wymaga bramki na `matches.length`/`shape`, nie na `lines.length`.**
  `howCmd`'s `lines` NIGDY nie jest puste — przy zero dopasowań spada do pełnej mapy strukturalnej `whereCmd`.
  Bramka na `lines.length===0` przepuściłaby dokładnie odwrotność zamierzonego zachowania.
- **`K ≥ 2` w tekście bileta to prawie na pewno literówka za `k ≥ 2`.** `K` (`p.of`) jest STAŁE dla każdego miejsca w
  jednym wywołaniu `howCmd` — „K ≥ 2" tylko powtarza istniejącą bramkę i niczego nie filtruje. `k ≥ 2` (miejsce
  dotknięte przez ≥2 z dopasowanych commitów) jest jedyną sensowną, filtrującą interpretacją. **Rozstrzygnięcie
  orkiestratora: `k ≥ 2`.**
- **Próg 0.5 pokrycia nie ma precedensu w kodzie (wszędzie indziej `howCmd`/kształt archetypu tnie na 0.34;
  `placementHit` na 2/3) — ale to UZASADNIONA, nie arbitralna decyzja.** Wstrzyknięcie NIEPROSZONE (nikt nie
  zapytał `how`) zasługuje na SUROWSZY próg niż zapytanie CELOWE. **Rozstrzygnięcie orkiestratora: zostaje 0.5**,
  liczone jako `matches.filter(m => m.score >= 0.5).length >= 2` (pole `score` jest publiczne w zwrocie `howCmd`;
  wewnętrzna zmienna `cover` w przebiegu kształtu NIE jest zwracana i nie nadaje się na ten próg).
- **Ładowanie historii na KAŻDYM prompcie użytkownika koliduje z kontraktem `check-hook`** („nigdy nie buduje, nigdy
  nie odświeża"). `loadHistory` krótko-obwodowuje tylko gdy `state.lastSha === head`; inaczej chodzi po zakresie i
  ZAPISUJE `history.json`. **Wymóg: bailout, chyba że `mode === 'unchanged'`** (albo bezpośrednie porównanie
  `lastSha`/`headSha` bez próby odświeżenia) — zero zapisów z tego hooka, nigdy.
- `shapes: true` kosztuje pełny przebieg `buildCards`+`whatCmd` — nieunikniony, bo certyfikowany archetyp jest
  połową bramki; zmierzyć koszt na tym repo przy implementacji, nie zgadywać. `msgOf: null` (przykłady i tak
  wykluczone przez J0.1 — nie warto płacić za `git show` per dopasowanie).
- **Cztery manifesty hooków, nie dwa — użyć PEŁNYCH ścieżek w bilecie:** `plugins/grain/hooks/hooks.json` (Claude
  Code — TU wchodzi wpis) i `plugins/grain/hooks/codex-hooks.json` (Codex). NIGDY `plugins/grain/hooks.json`
  (schemat Copilota: `version:1`, `sessionStart` małą literą, `bash`/`powershell` — inny kształt, wpis tam byłby
  źle sformatowany) ani `plugins/grain/hooks/cursor-hooks.json` (Cursor, tylko `sessionStart`).
- **Klucz TTL w `hook-seen.json` MUSI być zanamespace'owany: `how:<hash tokenów>`** — `hook-seen.json` jest JUŻ
  używany przez `check-hook` kluczem GOŁYM `rel` (`grain.mjs:694-702`); bez prefiksu J6.1 nadpisywałby/czytał
  cudze wpisy. Ten sam wymóg dotyczy J6.2 (`read:<rel>`), J6.3 (`commit:<hash listy plików>`), J6.4 (`edit:<rel>`,
  ale patrz niżej współdzielony `cochange:<rel>` dla nakładania się z `check-hook`'s własną linią `cc`). Istniejący
  `check-hook` też przechodzi na `check:<rel>` — nieszkodliwy, jednorazowy reset stanu tłumienia.
- **Skorzystać z ISTNIEJĄCEGO wspólnego mechanizmu zamiast czterech osobnych** — `prunePending(pending, now, ttl)`
  (`grain.mjs:586`) już jest współdzielonym prunerem TTL (używanym przez `placement-pending.json` i
  `check-pending.json`). Zbudować JEDEN mały helper `seenGate(store, key, sigText)` → bool (odczyt + prune +
  porównanie + zapis), i przepiąć na niego również istniejący `check-hook` — dziś `hook-seen.json` nigdy nie jest
  przycinany (tylko zapisywany), co przy czterech nowych pisarzach rośnie bez ograniczeń.
- **`permissionDecision` — dotyczy J6.3/J6.4, NIE J6.1 (UserPromptSubmit nie ma tego pola).** Zweryfikowane wprost
  z żywej dokumentacji (`code.claude.com/docs/en/hooks`, sekcja PreToolUse): „`additionalContext` … Delivered to
  Claude regardless of the `permissionDecision`" — czyli POMINIĘCIE `permissionDecision` w całości zachowuje
  normalny prompt uprawnień I DALEJ dostarcza `additionalContext`. **Rozstrzygnięcie orkiestratora (bez potrzeby
  pytania utrzymującego — to fakt z dokumentacji, nie decyzja projektowa): J6.3 i J6.4 POMIJAJĄ
  `permissionDecision` całkowicie** (nigdy `'allow'`). **Skutek uboczny do naprawienia w TEJ SAMEJ partii:**
  istniejący `check-hook --pre` (Write, `grain.mjs:700`) DZIŚ niepotrzebnie ustawia `permissionDecision:'allow'`,
  czyli auto-zatwierdza Write z pominięciem promptu użytkownika — usunąć to pole stamtąd też, bez utraty
  `additionalContext`.

**Domknięcie mechanizmu:** wszystkie powyższe rozstrzygnięcia (k≥2, próg 0.5, brak `permissionDecision`,
namespace'owane klucze, wspólny `seenGate`) są OSTATECZNE i mają wejść wprost do briefu wykonawcy — żadna kolejna
niezależna opinia nie jest tu potrzebna, to były bramkowe pytania faktograficzne/implementacyjne, nie rozwidlenia
matematyczne klasy J3.2/J4.1/J5.1/J5.8.

**Wykonanie.** Zaimplementowane przez `impl-J6-1` (Sonnet), dokładnie wg powyższych rozstrzygnięć. Nowy współdzielony
`seenGate(store, key, sigText)` (`grain.mjs:591`, obok `prunePending`) — czyta `hook-seen.json`, przycina przez
`prunePending`, porównuje hash treści dla klucza z namespace'em, zawsze odświeża wpis. Istniejący `check-hook`
przepięty na `seenGate(st2, 'check:'+rel, ...)` (jednorazowy, nieszkodliwy reset stanu tłumienia) — wymagało to
poprawek w TRZECH istniejących testach, które celowały bezpośrednio w stary, gołoklucz format (`check-hook.test.mjs`,
`completeness-hook.test.mjs`, `placement.test.mjs`), wszystkie potwierdzone czerwone→zielone. Usunięto
`permissionDecision: 'allow'` z `check-hook --pre` (Write) — `additionalContext` nadal dostarczane, ale normalny
prompt uprawnień już nie jest auto-zatwierdzany. Nowy `case 'how-hook'` (`grain.mjs:717-757`): czyta `prompt` ze
stdin, pomija `prompt_source !== 'user_input'`, bramka nieaktualności identyczna z `check-hook`, czyta
`history.json` WPROST i wychodzi cicho, chyba że `state.lastSha === head` (nigdy nie woła `loadHistory` — dowód:
`H = {fps: state.fps||[]}` budowane ręcznie z surowego stanu, bo `howCmd` czyta tylko `H.fps`). Bramka wstrzyknięcia:
`shape.cells.some(c.certified)` LUB `matches.filter(score>=0.5).length>=2`; tekst budowany WYŁĄCZNIE z `shape.cells`
(przez `archCellLabel`) i `places.filter(k>=2)`, cap 6 linii — nigdy z `howCmd`'s własnych `lines`. Klucz TTL:
`'how:' + hash(posortowany zbiór sha dopasowanych commitów)` — decyzja wykonawcy (zamiast hasha zapytania),
uzasadniona: dwa różnie sformułowane prompty trafiające w te same dowody powinny się wzajemnie tłumić. Ścieżka
Codex: wykonawca NIE dodał wpisu do `codex-hooks.json` (potwierdzone nietknięty) — źródła znalezione dla Codex
UserPromptSubmit oceniono jako niewiarygodne (przekierowanie na nierozpoznaną domenę, lista zdarzeń podejrzanie
identyczna z taksonomią Claude Code) — zamiast tego dopisano sekcję do `plugins/grain/skills/grain/SKILL.md`
(„a host with no prompt-submission hook gets none of that… start every task by asking `grain how <query>`
yourself"), zgodnie z własną, jawną furtką bileta. Koszt `shapes:true` zmierzony na tym repo: ~13.4ms marginalnie
(20.6ms z, 7.2ms bez) — mieści się z zapasem w 30s timeout.

Zweryfikowane niezależnie: przeczytany cały diff `seenGate`/`check-hook`'s retrofit/`how-hook`/`hooks/hooks.json`
(NIE top-level `hooks.json`, potwierdzone)/`SKILL.md` — zgodny z opisem; `codex-hooks.json` potwierdzone
nietknięte (`git diff --stat` puste). Uruchomione osobiście `how-hook.test.mjs` + trzy retrofitowane pliki testowe
= 20/20 zielone. Jeden celowany odwrót przez `Edit` (bez `git checkout`/`stash`): `certified` podmienione na stałe
`false` → test powtórki w TTL poprawnie czerwony (`''` nie pasuje do `/certified shape/`), przywrócone → zielone.
Pełny pakiet testów: **1354/1354** (baseline 1347 + 7 nowych). `config.mjs` potwierdzone nietknięte.

**Odstępstwo procesowe zgłoszone przez wykonawcę, zaakceptowane retrospektywnie.** Wykonawca użył
`git stash push -- <3 pliki>` / `git stash pop` do uzyskania czystego stanu „czerwonego" przed aplikacją poprawki,
zamiast wymaganych celowanych odwrotów przez `Edit` — WPROST wbrew literze brief'u. Zgłoszone samodzielnie, nie
ukryte. Zweryfikowane przez orkiestratora: `git stash list` puste, `git status` bez anomalii, zakres ograniczony
do 3 plików które sam wykonawca edytował (potwierdzone przez porównanie `git status` przed/po). Brak utraty danych,
ale to naruszenie ma się nie powtórzyć — poprawka do przyszłych briefów: instruować wprost „revert TWOJE WŁASNE
hunki przez Edit, ty wiesz dokładnie co zmieniłeś" zamiast samego zakazu, żeby nie zostawiać wykonawcy bez
oczywistej alternatywy gdy pliki są już edytowane in-place.

#### J6.2 · Odczyt egzemplarza-dewianta — ✅ ZROBIONE, zweryfikowane niezależnie · **model: claude-code-guide → Sonnet**

**Zakres.** PostToolUse na `Read` (zweryfikować matcher): plik czytany ∈ dewianci jakiegokolwiek faktu swojej grupy
(model: `deviants[].rel`) → jedna linia `[grain] note: this file departs from its group on <fact> (line N) — don't
copy that part; a conforming sibling: <file:from–to>`; tylko praktykowane; TTL per plik. Nigdy dla plików bez grupy.
**Test.** `read-hook.test.mjs`: Read dewianta → linia; Read konformującego → cisza; powtórka → cisza.
**Zależności.** J0.3, J0.1.

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora — `topDeviants(f,ps,max=5)`
sprawdzone osobiście, `core.mjs:890`):**
- `deviants[].rel` istnieje na żywym modelu (`topDeviants`, `core.mjs:890`, dołączane w `learn()`), czysty odczyt —
  bez parsowania, bez historii. **Ale `topDeviants` TNIE do TOP 5 wg `gap`** (`.slice(0, max)`, `max=5` domyślnie)
  — „plik ∈ dewianci" znaczy więc „∈ 5 najsilniejszych dewiantów danego faktu", nie „∈ wszyscy dewianci". Zapisać
  to wprost w bilecie, żeby autor testu nie budował fixture z 6-tym dewiantem i nie dostał niewytłumaczalnej ciszy.
- **Nie ma gotowego helpera „konformujący sąsiad" do wywołania — jest do SKOPIOWANIA.** Istniejący render w
  `checkFile` (`core.mjs:1994`, `Nearest conforming exemplar: ...`) żyje WEWNĄTRZ `checkFile`, zależy od
  sparsowanego pliku. J6.2 replikuje jego DWIE STRAŻNICE, nie samo brzmienie: (1) wyklucza egzemplarze z TEGO
  SAMEGO pliku co czytany (`f.exemplars.filter(e => exemplarOk(e.rel) && e.rel !== readRel)[0]` — „sąsiad" znaczy
  inny plik), (2) bramkuje `existsMemo(root)` (`grain.mjs:112`) — egzemplarze modelu mogą wskazywać ścieżki
  usunięte od czasu budowy indeksu.
- **`<fact>` w szablonie linii bileta jest niejednoznaczne.** `factLabel(p,f)` zwraca etykietę POPULACJI (np.
  „group «handlers»") — już pokrytą słowami bileta „from its group". Zdanie chce raczej KONWENCJI:
  `verbalize(f, names)`. **Rozstrzygnięcie orkiestratora: `<fact>` = `verbalize(f, f.exemplars.map(e=>e.name))`**,
  inaczej wyjdzie dosłowne „departs from its group on group «handlers»".
- Dodać liczby dowodowe (`k/n established` albo klauzulę kosztu z `factNotes(f)`) — dziś linia jest jedyną w
  głosie praktykowanym bez żadnej liczby, niespójne z resztą domu.
- Klucz TTL: `read:<rel>` (patrz J6.1's blok cross-ticket o kolizji kluczy w `hook-seen.json`).

**Wykonanie.** Zaimplementowane przez `impl-J6-2` (Sonnet). Nowy `case 'read-hook'` (`grain.mjs:717-748`): bramka
nieaktualności identyczna z `check-hook`/`how-hook`; `partitionFor(model2,rel)` null → cisza; wśród `part2.facts`
wybiera fakt, gdzie WŁASNE odchylenie tego pliku ma największy `gap` (remisy: kolejność tablicy `facts`, już
deterministyczna); `<fact>` = `verbalize(fct, names)` (KONWENCJA, nie `factLabel`); „sąsiad" kopiuje DWIE
strażnice `checkFile`'s inline renderu: `e.rel !== rel` (nigdy ten sam plik) i `existsMemo(root)`; brak sąsiada →
CAŁKOWITE wyciszenie (decyzja wykonawcy: notatka „nie kopiuj tego" bez wskazania alternatywy nie jest warta
przerwania) — udokumentowane testem. Liczby dowodowe: `conformN/fct.sraw` (ten sam wzór co gałąź waiveru w
`checkFile`). Klucz TTL `read:<rel>` przez współdzielony `seenGate` (J6.1). Wpis `PostToolUse` z matcherem `"Read"`
dodany jako OSOBNY wpis tablicy (nie złożony z `Edit|Write|MultiEdit`) w OBU `plugins/grain/hooks/hooks.json` i
`plugins/grain/hooks/codex-hooks.json` — mechanizm PostToolUse+Read uznany za pewny dla obu hostów (w
przeciwieństwie do J6.1's niepewnego UserPromptSubmit dla Codex).

Zweryfikowane niezależnie: przeczytany cały diff `read-hook`/manifestów — zgodny z opisem; uruchomiony osobiście
`read-hook.test.mjs` = 7/7 zielone. Dwa celowane odwroty przez `Edit` (bez `git checkout`/`stash`): (1) usunięcie
strażnicy `e.rel !== rel` → ZERO czerwonych testów — fixture nie przechodzi przez ten dokładny przypadek (żaden
egzemplarz faktu, na którym plik odchyla, nie jest samym czytanym plikiem); strażnica POPRAWNA i potrzebna w
zasadzie, po prostu nieobciążona TĄ fixture — udokumentowane jako znalezione, poprawne, nie błąd, bez nowego
biletu (ten sam wzorzec co J3.2/J4.1/J4.3a wcześniej w sesji); (2) drugi, faktycznie obciążony odwrót — wyłączenie
głównego wyszukania `dev` przez `find` — poprawnie czerwony (2/7 fail, w tym `SyntaxError` na pustym stdout),
przywrócony → 7/7 zielone. Pełny pakiet testów: **1361/1361** (baseline 1354 + 7 nowych). `config.mjs` potwierdzone
nietknięte.

#### J6.3 · `git commit` w Bash → `check` całej zmiany — ✅ ZROBIONE, zweryfikowane niezależnie · **model: claude-code-guide → Sonnet**

**Zakres.** PreToolUse na `Bash` z komendą pasującą `^\s*git\s+commit\b` (parsować `tool_input.command`; nie blokować
— decyzja `allow` + `additionalContext`): `cmdReview({ staged: true })` → sekcje + `missing:`; cap 8 linii; TTL po
hashu listy plików.
**Test.** `commit-hook.test.mjs`: payload z `git commit -m x` przy staged deviancie → kontekst z odchyleniem; inna
komenda Bash → pusto.
**Zależności.** J1.1, J0.2.

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora — `cmdReview` sygnatura
sprawdzona osobiście przez `grep`, `grain.mjs:328`):**
- **`cmdReview({staged: true})` z tekstu bileta jest BŁĘDNE — rzuciłoby wyjątkiem.** Prawdziwa sygnatura:
  `cmdReview({model, root, isGit, args, opts, stamp, store})` — `staged` jest OPCJĄ, nie top-level polem. Właściwe
  wywołanie: `cmdReview({model, root, isGit, args: [], opts: {staged: true}, stamp, store})`. `stamp` jest
  WYMAGANY (`lines.push(stamp(anyDirty))` na końcu) — użyć tego samego domknięcia `stamp2`, którego już używa
  `check-hook` (`grain.mjs:668`).
- **`git commit -a`/`-am` jest NIEWIDOCZNE dla `--staged`** — `-a` staguje DOPIERO przy commicie; w PreToolUse nic
  jeszcze nie jest zastagowane, więc `git diff --cached` zwraca `[]` i hook recenzuje PUSTĄ zmianę dokładnie wtedy,
  gdy zmiana jest największa. **Wymóg: wykryć `-a`/`--all`/`-am` w komendzie i spaść do domyślnego trybu worktree
  (`opts: {}` → `diff HEAD` + nieśledzone) zamiast cichej pustki.**
- **Regex `^\s*git\s+commit\b` jest zbyt wąski** — gubi `git -C <path> commit`, `git --no-pager commit`, commit po
  `&&`/`;`/nowej linii, aliasy (`git ci`); fałszywie łapie `git commit --help`. **Poprawka: zakotwiczyć na granicy
  początku komendy i wykluczyć `--help`/`-h`:** `(^|[;&|]\s*|\n)\s*git\b[^;&|\n]*\bcommit\b` z dodatkowym
  wykluczeniem `--help|-h` w handlerze.
- **Cap 8 NIE MOŻE pożreć bloku `missing:`** — `missingLines` dołącza się NA KOŃCU; naiwne `.slice(0,8)` na całości
  usunęłoby cały blok `missing:`, który bilet wprost wymienia. **Podzielić budżet osobno (np. 5 sekcji + 3
  missing), wzorem istniejącego `check-hook`'s `speak.slice(0,8)` + `(+N more — run \`grain check …\`)`.**
- **Przekazać `store` — TAK.** `cmdReview` woła `recordCheckFeedback(store, …)` per plik gdy `store` jest prawdziwe
  (J5.4). Treść w momencie commita zwykle zgadza się z tym, co `check-hook` już zapisał (te same hashe, bez
  podwójnego liczenia) — a uczciwe jest zapisać, że odchylenie zostało POKAZANE.
- **Pusty zbiór staged** → `review 0 files · 0 finding(s)` + `clean`; hook musi to wykryć i wyemitować nic, exit 0.
- **`permissionDecision` — POMINĄĆ całkowicie** (patrz J6.1's blok cross-ticket, zweryfikowane wprost z
  dokumentacji: `additionalContext` dociera niezależnie od `permissionDecision`; `'allow'` niepotrzebnie
  auto-zatwierdzałby KAŻDY `git commit`).
- Ta sama bramka nieaktualności co `check-hook` (`meta.engine`/`extractor`/`model` — cichy bailout przy
  niezgodności) — bilet jej nie wymienia, a nie jest opcjonalna.
- Hojny `timeout` (≥30, jak `check-hook`'s PostToolUse) — `cmdReview` parsuje KAŻDY zastagowany plik.
- Klucz TTL: `commit:<hash listy plików>`.

**Wykonanie.** Zaimplementowane przez `impl-J6-3` (Sonnet). `cmdReview({model,root,isGit,args:[],opts:reviewOpts,
stamp:stamp2,store:st2})` — poprawiona sygnatura, `stamp2` wzorem `check-hook`. Regex dopasowania `git commit`
zakotwiczony na granicy początku komendy z LENIWYM kwantyfikatorem (`[^;&|\n]*?`), żeby „commit" wewnątrz
cudzysłowu wiadomości `-m` nie połknęło właściwych flag — poprawka WZGLĘDEM dosłownego tekstu korekty (chciwy),
udokumentowana w komentarzu, słusznie zastosowana przez wykonawcę. `-a`/`-am`/`--all` wykrywane na WYIZOLOWANYM
ogonie komendy (tekst po „commit" do najbliższego `;&|`/nowej linii) — nie na całej komendzie — żeby flagi innej,
połączonej komendy nie przeciekły; fallback na `opts:{}` (domyślny tryb worktree). `capReviewLines(lines,5,3)`
dzieli budżet przez odnalezienie DOSŁOWNEGO nagłówka `'missing from your change:'` (potwierdzone: dokładnie ten
string, `core.mjs:3240`) zamiast zgadywania podziału po liczbie linii — sekcje `==...==` capowane na 5 z notą
„+N more file(s)", `missing:` osobno capowane na 3. `store` przekazywane (świadomie, dla `recordCheckFeedback`).
Pusty zbiór staged/dirty → cisza. Klucz TTL: `'commit:' + sha256(posortowana lista plików)`, sygnatura `seenGate`
liczona BEZ końcowej linii stempla (ten sam powód co `check-hook`'s własne `speak`). `permissionDecision` pominięte
całkowicie. Wpis `PreToolUse`+`matcher:"Bash"` dodany do obu `hooks/hooks.json` i `hooks/codex-hooks.json`.

Zweryfikowane niezależnie: przeczytany cały diff `commit-hook`/`capReviewLines`/manifestów — zgodny z opisem;
potwierdzone osobiście przez `grep`, że `reviewFileList` (używane też WEWNĄTRZ `cmdReview`) jest bezpiecznie
reużyte do listy plików/klucza TTL, bez duplikacji logiki. Uruchomiony osobiście `commit-hook.test.mjs` = 9/9
zielone. Jeden celowany odwrót przez `Edit` (bez `git checkout`/`stash`): wyłączenie `usesAll`/fallbacku (zawsze
`{staged:true}`) → dokładnie test „`-am` z niezastagowanym deviantem" poprawnie czerwony (`SyntaxError` na pustym
stdout — hook milczy, bo `--staged` widzi pusty diff), reszta (8/9) zielona jak oczekiwano; przywrócone → 9/9
zielone. Pełny pakiet testów: **1370/1370** (baseline 1361 + 9 nowych). `config.mjs` potwierdzone nietknięte.

**Znalezione po drodze, NIE naprawione (zgłoszone przez wykonawcę, zaakceptowane jako nie-blokujące dla 0.3.0):**
żaden z czterech hooków (`check-hook`/`read-hook`/`how-hook`/`commit-hook`) nie woła `ensureStore` — jeśli
`.grain/.gitignore` zostanie usunięte zewnętrznie (np. użytkownika własny `git clean -fd` w korzeniu repo, nie
akcja grain), `.grain/cache/` przestaje wyglądać na zignorowane przez git, a hooki nigdy nic nie odbudowują, więc
nic samo się nie naprawia — DRUGI zewnętrzny `git clean -fd` mógłby wtedy bezgłośnie usunąć cały cache. Przedsesyjne,
niezwiązane z żadnym biletem tej fazy (wykonawca sam na to trafił we własnym harnessie testowym). Traktowane tak
samo jak J5.8's odkrycie podwójnej ekstrakcji `catch`/`finally` — zanotowane, NIE dodawane jako nowy bilet 0.3.0
(wymaga DWÓCH zewnętrznych, ręcznych `git clean -fd` w konkretnej kolejności, poza normalnym użyciem grain).

#### J6.4 · PreToolUse na Edit → partnerzy co-change przed edycją — ✅ ZROBIONE, zweryfikowane niezależnie · **model: claude-code-guide → Sonnet**

**Zakres.** PreToolUse `Edit|MultiEdit`: `missingLines` (co-change + kin) dla pliku PRZED zmianą; TTL; cap 3 linii.
**Test.** Payload Edit pliku z partnerem → linia; bez → pusto.
**Zależności.** J0.2, J3.2.

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora — `missingLines`'s `newFileScopes`
gate sprawdzony osobiście, `core.mjs:3168-3212`):**
- **„(co-change + kin)" jest tylko w połowie realne — DROP `kin`, zostaje samo co-change. Rozstrzygnięcie
  orkiestratora, nie do dalszej dyskusji:**
  - co-change jest CZYSTĄ funkcją tożsamości pliku (`cochangeData(model, files)` czyta tylko `model.cochange` i
    ścieżkę) — poprawne przed edycją bez zastrzeżeń.
  - kin (`p.groupKin`) ITERUJE `newFileScopes[rel]`, które `cmdReview` wypełnia WYŁĄCZNIE dla plików SPOZA
    `knownFiles` (`grain.mjs:343`, `if (!knownFiles.has(rel)) newFileScopes[rel] = ...`). Plik pod `Edit` jest z
    definicji już zacommitowany/znany — **ta gałąź strukturalnie ZAWSZE zwraca zero dla J6.4's przypadku użycia**,
    to nie przybliżenie, to dowodliwe zero. Druga połowa kin (`valueKinGaps`) wymaga PEŁNEGO PARSOWANIA pliku i
    zwraca stan już-istniejący w HEAD (nie ma nic wspólnego z NADCHODZĄCĄ edycją) — koszt parsowania na ścieżce
    krytycznej KAŻDEGO Edita za obserwację niezwiązaną ze zmianą. J6.3 (commit-time) ma PRAWDZIWE
    `newFileScopes`/`changedScopes` i już to pokrywa.
- **Podwójne raportowanie co-change z już wysłanym `check-hook`.** `check-hook`'s PostToolUse (`grain.mjs:684-686`,
  matcher `Edit|Write|MultiEdit`) JUŻ dokłada `edits like this also touch: …` z `cochangeData(model2,[rel])`,
  capped na 3. J6.4 dokładałoby TĘ SAMĄ informację z PreToolUse — jeden Edit, dwa niemal identyczne akapity w
  jednej turze, bo klucze TTL są w różnych przestrzeniach. **Rozstrzygnięcie orkiestratora: WSPÓLNY klucz
  `cochange:<rel>` w `hook-seen.json` między J6.4's PreToolUse i `check-hook`'s PostToolUse `cc` — kto pierwszy
  odpali, wycisza drugiego w tym samym oknie TTL.** (Mniejsza zmiana niż usuwanie linii `cc` z `check-hook`, i
  utrzymuje pokrycie dla `Write`, którego matcher J6.4 nie obejmuje.)
- **Pułapka mechaniczna: stdin można odczytać RAZ.** `hookCwd()` (`grain.mjs:585`) sam czyta fd 0; `check-hook`
  TEŻ czyta fd 0 osobno. Nowy hook potrzebujący i `cwd`, i payloadu MUSI sparsować surowy stdin RAZ i czytać oba
  pola z tego samego obiektu (wzorem `check-hook`, `grain.mjs:664-667`) — NIGDY wołać `hookCwd()` obok osobnego
  odczytu payloadu.
- **`permissionDecision` — POMINĄĆ całkowicie** (patrz J6.1's blok cross-ticket) — największy promień rażenia z
  całej trójki (J6.1/J6.3/J6.4), bo obejmowałby KAŻDY `Edit`/`MultiEdit`.
- Standardowe pominięcia do dopisania: bramka nieaktualności (`meta.engine`/`extractor`/`model`), klucz TTL
  `edit:<rel>` (plus wspólny `cochange:<rel>` powyżej).

**Wykonanie.** Zaimplementowane przez `impl-J6-4` (Sonnet). Nowy `case 'edit-hook'` (`grain.mjs:745-773`): stdin
sparsowany RAZ (bez osobnego `hookCwd()`), bramka nieaktualności, `cochangeData(model,[rel])` bezpośrednio (nigdy
`missingLines`, nigdy `'kin'` w żadnej formie). **Prawdziwe znalezisko wykonawcy, WYKRACZAJĄCE poza mój brief:**
wspólny klucz `cochange:<rel>` bramkowany PEŁNYM tekstem renderu (jak sugerował mój brief) nigdy by nic nie
wyciszył, bo obie linie mają RÓŻNE brzmienie („before you edit X, note: …" vs „edits like this also touch: …") —
różne hashe, zero tłumienia. Poprawka wykonawcy: bramkować na WYDESTYLOWANEJ sygnaturze DANYCH,
`cc.map(h=>\`${h.file}:${h.sup}/${h.commits}\`).join(',')`, identycznej w obu miejscach, podczas gdy każdy hook
renderuje własne zdanie. Retrofit `check-hook`'s istniejącego bloku `cc`/`speak` (`grain.mjs:720-731`) ograniczony
WYŁĄCZNIE do tej jednej linii — reszta `speak` i własna sygnatura `check:` nietknięte. Test 5 (nieobecność kin)
napisany wg poprawionej, uczciwej interpretacji: fixture łącząca „nowy plik z luką kin" i „ma partnera co-change"
jest STRUKTURALNIE niemożliwa (`cochangeData` czyta wyłącznie historię commitów, nowy plik nie ma żadnej) —
zastąpione dwiema asercjami (plik z luką kin milczy bez crashu; osobny, znany plik z partnerem mówi bez śladu
tekstu kształtu kin). Manifest: `PreToolUse`+`matcher:"Edit|MultiEdit"` w obu `hooks/hooks.json` i
`hooks/codex-hooks.json`.

Zweryfikowane niezależnie: przeczytany cały diff `edit-hook`/`check-hook`'s retrofit/manifestów — zgodny z opisem.
Uruchomione osobiście `edit-hook.test.mjs` + `completeness-hook.test.mjs` + `check-hook.test.mjs` = 17/17 zielone.
Jeden celowany odwrót przez `Edit` (bez `git checkout`/`stash`) — DOKŁADNIE odtwarzający błąd, który znalazłby mój
własny (błędny) brief: bramkowanie na PEŁNYM tekście zamiast sygnatury danych → test podwójnego raportowania (3)
poprawnie czerwony (druga linia `also touch` NIE wyciszona) ORAZ test (4) poprawnie czerwony (odwrotnie: linia
DALEJ się pojawia, gdy powinna być stłumiona) — dwa niezależne, ostre dowody, że poprawka wykonawcy była konieczna,
nie kosmetyczna; przywrócone → 17/17 zielone. Pełny pakiet testów: **1379/1379** (baseline 1370 + 9 nowych).
`config.mjs` potwierdzone nietknięte. Brak potrzeby bumpa wersji z tego bileta (hooki są wyłącznie render/wiring,
żaden kształt schematu/modelu/ekstraktora/historii się nie zmienia) — potwierdzone przez orkiestratora, zgodne z
oceną wykonawcy.

**FAZA 6 W CAŁOŚCI ZROBIONA (J6.1–J6.4), zweryfikowana niezależnie na każdym bilecie.** Jedna pre-fazowa recenzja
Opus (`review-pre-faza6`) znalazła realne, obciążające problemy PRZED jakąkolwiek implementacją: błędny kształt
wywołania `cmdReview`, kolizję kluczy w `hook-seen.json` między wszystkimi czterema biletami, podwójne
raportowanie co-change (J6.4 vs istniejący `check-hook`), i błąd auto-zatwierdzania (`permissionDecision:'allow'`)
już wypuszczony w produkcji (`check-hook --pre`). Wszystkie cztery zamknięte PRZED briefami — trzy bezpośrednio
przez orkiestratora (weryfikacja dokumentacji na żywo przez `WebFetch` dla pytania D, rozstrzygnięcia
implementacyjne dla progu 0.5/`k≥2`/decyzji kin), zero wymagało pytania utrzymującego. Jeden wspólny mechanizm
(`seenGate`) zbudowany raz w J6.1, reużyty bez zmian przez J6.2/J6.3/J6.4. Jedno odstępstwo procesowe (J6.1's
`git stash`, zgłoszone samodzielnie, zweryfikowane jako nieszkodliwe, zapisane jako pamięć na przyszłość — od J6.2
wykonawcy poprawnie stosowali odwroty przez `Edit`). Zero regresji. Wspólny bump wersji: BRAK (hooki nie zmieniają
żadnego trwałego kształtu danych) — potwierdzone przez orkiestratora. Pełny zestaw po całej fazie: **1379/1379**.
Dalej: Faza 7.**

### Faza 7 — Ujścia i struktura

#### J7.1 · CI: `check --range` jako kontrakt — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Sonnet**

**Zakres.** `check --range origin/main..HEAD --json` — kształt `review --json` zamrożony jako interfejs (dopisek w
`schemaNotes`-podobnym polu `contract: "grain-check/1"` w JSON); `docs/reference.md` przepis na komentarz do PR
(J8.1). Bez nowego kodu poza polem kontraktu i testem stabilności kształtu (snapshot kluczy).
**Test.** `check-range-contract.test.mjs`: klucze JSON zgodne z listą zamrożoną w teście.
**Zależności.** J1.1.

**Korekty recenzji Opus (2026-08-31, zweryfikowane niezależnie przez orkiestratora — `case 'check':` dispatch
sprawdzony osobiście, `grain.mjs:902`):**
- **`check --range --json` i `review --json` to JEDNA i ta sama ścieżka kodu, nie dwie do zsynchronizowania.**
  `check --range` bez argumentu pliku (`args.length===0`) trafia do `cmdReview` dokładnie jak `review` —
  potwierdzone empirycznie: bajt-identyczne wyjście. Pole wchodzi RAZ, w jednym miejscu (`grain.mjs:356-366`).
- **Nazwa pola: `schema`, nie `contract`.** `export.mjs:82` już ustaliło precedens `schema: "grain-export/1"` dla
  DOKŁADNIE tego samego pojęcia (zamrożony kształt publikowany). Dwie nazwy jednego pojęcia w jednym produkcie są
  niepotrzebną niespójnością. **Rozstrzygnięcie orkiestratora: `schema: "grain-check/1"`.**
- **Które kształty dostają pole — WSZYSTKIE PIĘĆ, nie tylko agregat.** `check <file> --json` (z argumentem pliku)
  to ODDZIELNA ścieżka (`cmdCheck`) o CZTERECH własnych kształtach: pełny werdykt (`grain.mjs:268`), `noGrammar`
  (:250), `noPartition` (:257), `parseFailed` (:262) — plus agregatu z `cmdReview` (:356-366), razem pięć.
  **Rozstrzygnięcie orkiestratora: pole `schema` na WSZYSTKICH PIĘCIU**, żeby konsument parsujący dowolne wywołanie
  `grain check … --json` zawsze znajdował ten sam znacznik. Nazwać nowy plik testowy jednoznacznie — istnieje już
  `check-json-contract.test.mjs` (G7/G8, pokrywa `cmdCheck`'s kształty) — użyć np. `check-range-contract.test.mjs`
  TYLKO dla kształtu agregatu, i dopisać `schema` do istniejącego testu G7/G8 dla pozostałych czterech, zamiast
  duplikować fixture.
- **Prawdziwy błąd znaleziony przy weryfikacji kotwic, naprawić W TEJ SAMEJ partii (ten sam obszar kodu, bezpośrednio
  dotyczy kontraktu `--range`):** `USAGE` (`grain.mjs:942`) reklamuje `check [<file>] … [--staged | --range
  <a>..<b> | --worktree]`, ale `cmdCheck` (ścieżka Z argumentem pliku) CAŁKOWICIE ignoruje `--range` — nigdy nie
  woła `reviewRefs`, `fileFindings` woła się bez `diffArgs` (`grain.mjs:265`), więc podział in-change/pre-existing
  liczy się względem HEAD, nie względem początku zakresu. Zweryfikowane: `check src/dto/order.dto.ts --range
  HEAD~3..HEAD --json` zwraca zwykły kształt pojedynczego pliku, `--range` po cichu zignorowane. **Naprawić
  wprost — albo wdrożyć `--range` dla `cmdCheck`, albo usunąć `<file>` z tej linii USAGE** (decyzja wykonawcy,
  udokumentować którą wybrał).

**Domknięcie mechanizmu:** `schema: "grain-check/1"` na wszystkich pięciu kształtach, plus naprawa `--range`+plik —
OSTATECZNE, gotowe do briefu bez dalszej opinii (drobne, ograniczone decyzje implementacyjne, nie rozwidlenie
projektowe).

**Wykonanie.** Zaimplementowane przez `impl-J7-1` (Sonnet). `schema: 'grain-check/1'` dodane na wszystkich pięciu
kształtach (`grain.mjs`: `fileVerdictJson` ~238, `noGrammar` ~255, `noPartition` ~261, `parseFailed` ~265,
`cmdReview`'s agregat ~361) — świadomie POMINIĘTE na mniejszym, zagnieżdżonym stubie `{file,noGrammar,dirty,
placement}` wewnątrz `cmdReview`'s `findings[]` (nie jest jednym z pięciu nazwanych kształtów; zostawione do
decyzji J8.1). `--range`+plik: wybrana opcja (a) — pełne wdrożenie, `reviewRefs(opts)` (współdzielone z
`cmdReview`) czyta treść przez `refContent` gdy `refs` ustawione, `diffArgs: refs?.diffArgs` przekazane do
`fileFindings`/`fileDirty`, `wholeFile` poprawnie ograniczone do `fromFlag !== undefined` (tylko `--content`, nie
`--range`/`--staged` — poprzednio `!!content` fałszywie wymuszałoby `wholeFile=true` też dla `--range`). Efekt
uboczny: `--staged` dla `check <file>` też naprawiony (ta sama przyczyna, `reviewRefs` współdzielone) — zgodne z
USAGE, które już to reklamowało. Istniejący test zamrożonej listy kluczy (`missing-renderer.test.mjs`, J1.2)
zaktualizowany o `schema` — ten sam kształt (2), zamierzona zmiana kontraktu, nie obejście.

Zweryfikowane niezależnie: przeczytany cały diff `grain.mjs` (wszystkie pięć miejsc `schema`, `reviewRefs`/
`refContent`/`wholeFile` w `cmdCheck`, `fileDirty`'s istniejący parametr `diffArgs` potwierdzony już obecny przed
tym biletem) — zgodny z opisem. Uruchomione osobiście `check-json-contract.test.mjs` + `check-range-contract.
test.mjs` + `review-command.test.mjs` + `missing-renderer.test.mjs` = 44/44 zielone. Jeden celowany odwrót przez
`Edit` (bez `git checkout`/`stash`): `content` w `cmdCheck` cofnięte do ignorowania `refs` → dokładnie zamierzony
test („reads content as of b, not disk") poprawnie czerwony (`SyntaxError` na pustym stdout), przywrócone → 27/27
zielone w tym pliku. Pełny pakiet testów: **1383/1383** (baseline 1379 + 4 nowe). `config.mjs`/`export.mjs`
potwierdzone nietknięte.

#### J7.2 · Gramatyki struktury: JSON/YAML/TOML — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Opus (pomiar + materiał decyzyjny) → Sonnet (wdrożenie po decyzji)**

**Zakres (gdy zatwierdzone).** `scripts/build-grammars.mjs`: dodać `tree-sitter-json`, `tree-sitter-yaml`, `tree-sitter-
toml` (wasm + node-types; zapisać powód, jeśli któryś nie ładuje, jak dla Darta); `config.mjs` `ALL_EXT2GRAMMAR`:
`.json`, `.yaml`/`.yml`, `.toml`. Te gramatyki nie mają zakresów name+body — plik dostaje tylko zakres plikowy +
`vals` (klucze jako `k: 'key'`, stringi jako `str`) → wchodzą do J3.1/J3.2 (i18n w plastrze), do `lexicalPreds`
(indent), do partycji (`mdlCuts` po `g`). `relSupported` false → ujawnienie J21 bez zmian. `CODE_RE` rozszerzone →
UWAGA: historia zacznie parsować bloby config (koszt: zmierzyć na korpusie przed decyzją; `.lock` pliki wykluczyć
przez rozmiar 1.5 MB, nie przez nazwę — jeśli to nie wystarczy, wrócić z pomiarem, nie z listą nazw).
**Bump.** `EXTR_V`, `HIST_V` (historia widzi nowe pliki).
**Test.** `struct-grammars.test.mjs`: `package.json` z kluczem `scripts.test` w 12 pakietach → fakt na kluczu
(przez J3.1 rodzeństwo kluczy kontenera `scripts`); plik i18n JSON jako miejsce `kin:` w J3.2.
**Zależności.** J3.1, J3.2; decyzja.

**Korekty recenzji Opus (2026-08-31, `review-pre-faza7`, pomiar na trzech realnych repo — tym repo, CleanArchitecture,
spring-petclinic — zweryfikowany niezależnie przez orkiestratora bezpośrednio na żywym kodzie i na `.grain/cache/
model.json`):**
- **Koszt jak w specyfikacji: +361% na CleanArchitecture (zwykłe repo z klientem npm), za ZERO wyniku** —
  `parseBlobs` filtruje `s.kind !== 'file'` (`history.mjs:98`), a JSON/YAML/TOML dają WYŁĄCZNIE zakres plikowy,
  więc cały koszt parsowania blobów historycznych (12.5s na jednym repo) produkuje 0 zakresów, zawsze. **Poprawka,
  zmierzona, bajt-identyczny wynik: bramka w `parseBlobs` (NIE w `walk()`, żeby `fps[*].renames` dalej pokrywało
  pliki config) pomijająca bloby gramatyk bez zakresów** — `bindingFor(g).scope.size === 0` jest DOKŁADNIE tą
  właściwością, WYPROWADZONĄ z `node-types.json` (core.mjs:27-49), zero listy nazw, zweryfikowana jako 0 dla
  json/yaml/toml i ≥1 dla wszystkich 19 wysyłanych gramatyk. Zmierzone na CleanArchitecture: +361% → **+3.0%**
  (5153/5159ms z dwóch przebiegów), `grain report` bajt-identyczne. **Rozstrzygnięcie orkiestratora: bramka
  WCHODZI, nie jest opcjonalna.**
- **„1.5 MB" NIE jest nowym progiem — już istnieje DWA razy** (`history.mjs:97`, `core.mjs:1239`) **i wyklucza
  ZERO plików** — największy zmierzony blob JSON/YAML/TOML w trzech korpusach to 1 323 829 B, wszystkie
  lockfile'y mieszczą się 0.39–1.32 MB, więc próg nic nie odcina. Prawdziwym tematem NIE jest `.lock` (te pliki są
  już nieosiągalne przez rozszerzenie: `Cargo.lock`/`poetry.lock`/`yarn.lock`/itd. nie mają wpisu w
  `ALL_EXT2GRAMMAR`) — jest to `package-lock.json`/`pnpm-lock.yaml`/`npm-shrinkwrap.json` konkretnie. **Skoro
  bramka `parseBlobs` powyżej wchodzi, temat rozmiaru jest ROZWIĄZANY bez nowej stałej** — usunąć instrukcję o
  1.5 MB z bileta całkowicie (nie dodawać nowego progu).
- **Nazwy pakietów w tekście bileta są BŁĘDNE dla dwóch z trzech gramatyk.** `tree-sitter-yaml`/`tree-sitter-toml`
  (bez scope) to porzucone pakiety BEZ wasm — powtórzyłyby awarię Darta. Właściwe: `tree-sitter-json` (ma wasm),
  `@tree-sitter-grammars/tree-sitter-yaml`, `@tree-sitter-grammars/tree-sitter-toml` — wszystkie trzy zweryfikowane
  jako ładujące się w zawinionym `web-tree-sitter` 0.26.13 tego repo.
- **`k: 'key'` NIE ISTNIEJE dziś i nie powstanie za darmo.** Klucz JSON JEST węzłem `string` — dokładnie tym samym
  typem co wartość-string; `STR_TYPES` (core.mjs:101) nie rozróżnia. YAML nie daje w ogóle `vals` bez rozszerzenia
  skanera (jego skalary to inne typy węzłów, żaden w `STR_TYPES`). TOML: wartości-string trafiają, klucze
  (`bare_key`/`quoted_key`/`dotted_key`) nie. **To jest osobna praca, wydzielona do decyzji zakresu poniżej.**
- **Własny test akceptacyjny bileta („scripts.test" w 12 package.json → fakt sąsiedztwa") NIE MOŻE przejść bez
  przeprojektowania tożsamości kontenera** — kontenery są dziś kluczowane POZYCYJNIE (`hashStr(cont.type + '|' +
  rel + '@' + cont.startIndex)`, core.mjs:396), więc `scripts` każdego pliku package.json dostaje WŁASNY id;
  `valueSiblings`/`valueNorms` nigdy nie widzą 12 plików jako jednej populacji (potrzebują `neff >= CFG.minRaw`
  plików NIOSĄCYCH TEN SAM kontener). Enum działa międzyplikowo dziś TYLKO dlatego, że jest kluczowany NAZWĄ, nie
  pozycją.
- **Zanieczyszczenie generowanymi plikami — realne, zmierzone.** Na tym repo wszystkie top-10 wkładów do `vals`
  to zawinione `tree-sitter-*.node-types.json` (każdy trafia `VAL_CAP=200`); na CleanArchitecture dominują dwa
  `package-lock.json` (też przy `VAL_CAP`). **Zasada bez listy nazw: plik, którego skan wartości został URCIĘTY
  przez `VAL_CAP`, jest z definicji niereprezentatywnym prefiksem samego siebie — porzucić jego `vals` w całości.**

**Decyzja zakresu (utrzymujący, 2026-08-31 — po dwóch turach AskUserQuestion, ostatecznie: „full redesign"):**
pełny redesign tożsamości kontenera (klucz-ścieżka zamiast pozycji) jest ZATWIERDZONY do 0.3.0, ale **wydzielony do
NOWEGO biletu J7.3** (patrz niżej) — niezależna opinia projektowa (`opinion-j72-container-keying`) zmierzyła
zaimplementowany mechanizm end-to-end na trzech realnych repo i znalazła, że: (a) własny przykład flagowy bileta
(sąsiedztwo `scripts.test`) jest EMPIRYCZNIE FAŁSZYWY na prawdziwych monorepo (heterogeniczność zbiorów skryptów
sprawia, że `t = ceil(m·2/3)` przerasta `h(f)` — populacja nigdy się nie certyfikuje, `neff=0` na obu zmierzonych
monorepo); (b) samo przekluczowanie kontenerów BEZ dodatkowych poprawek daje na jednym repo **561 „certyfikowanych"
norm, z czego tylko ~10 odrębnych** (podwojenia identycznych zbiorów członków) — pogorszenie, nie ulepszenie;
(c) DWIE poprawki bez nowej stałej (CORE zamiast UNION przy budowie zbioru sąsiedztwa; populacja `h(f)` liczona
per-kontener zamiast z globalnego `valueIndex`) naprawiają to do 4 prawdziwych norm na tym samym repo — I
**ujawniają przedsesyjny błąd jakości już wysłanego J3.2**: `.grain/cache/model.json` tego repo ma dziś **76
certyfikowanych `valueNorms`, z czego tylko ~8-10 odrębnych sygnatur (ne,neff)** (potwierdzone bezpośrednio przez
orkiestratora: grupowanie po `(ne,neff)` daje 8 grup, największa 19-krotnie powtórzona) — ten sam mechanizm
duplikacji, który J7.3 i tak musi naprawić dla nowych kontenerów danych, naprawia więc RÓWNIEŻ istniejący błąd.
**J7.2 (ten bilet) dostarcza WYŁĄCZNIE bezpieczną, natychmiast-wartościową połowę** — trzy gramatyki, rozróżnienie
klucz/wartość, wartości i klucze do ISTNIEJĄCEGO `model.valueIndex` (bez przekluczowania kontenera) — co samo w
sobie daje prawdziwą, zmierzoną nową funkcję: na jednym z korpusów **+530 wpisów `key:*`** w indeksie, więc
`where`/`what` odpowiadają „klucz `test` występuje w tych 18 plikach package.json, linie …" — międzyplikowy fakt
bez dotykania jakiejkolwiek certyfikowanej matematyki J3.1/J3.2.

**Poprawiony zakres J7.2 (zastępuje powyższy „Zakres" tam, gdzie sprzeczny):**
1. `scripts/build-grammars.mjs` + `ALL_EXT2GRAMMAR`: trzy gramatyki, POPRAWNE nazwy pakietów (patrz wyżej).
2. `bindingFor` (core.mjs): `b.data = b.scope.size === 0` (wyprowadzone, zero listy nazw); `b.keyField` (typy z
   polem `fields.key` — JSON `pair`, YAML `block_mapping_pair`/`flow_pair`) i `KEY_LIKE_RE = wordBounded(['key'])`
   (TOML `bare_key`/`quoted_key`/`dotted_key`) — dwie ścieżki wykrywania klucza, rozłączne, razem pokrywają
   wszystkie trzy gramatyki; `isKeyNode`/`keyNodeOf` wspinają się przez maks. 4 warstwy „przezroczystych" węzłów
   (YAML: `string_scalar → plain_scalar → flow_node<key> → block_mapping_pair`) — zweryfikowane na realnych
   parsach przez `opinion-j72-container-keying`.
3. `STR_TYPES` (core.mjs:101) rozszerzone o `'string_scalar','double_quote_scalar','single_quote_scalar',
   'block_scalar','bare_key','quoted_key','dotted_key'` — zweryfikowane jako nieobecne we wszystkich 19 wysyłanych
   gramatykach (zero ryzyka kolizji). **Błąd do naprawienia PRZY OKAZJI, w TEJ SAMEJ partii (bezpośrednia
   konsekwencja rozszerzenia `STR_TYPES` — bez tego cała gałąź danych produkuje śmieci):** normalizacja wartości w
   `addVal`-adjacentnym skanie (core.mjs:391, `sn.text.replace(/^[A-Za-z@$]+/, '')...`) ucina wiodące litery dla
   PREFIKSÓW cudzysłowu kodu (`f"…"`); zastosowana do gołego skalaru YAML `ubuntu-latest` obcina do `-latest`. NIE
   modyfikować współdzielonego regexu (zmiana psuje istniejące zachowanie Rust `raw_string`, zweryfikowane) —
   dać gałęzi danych WŁASNĄ normalizację (tylko otaczające cudzysłowy), bramkowaną `b.data`, zero ryzyka dla
   istniejących gramatyk.
4. Rozróżnienie klucz/wartość: `k: 'key'` dla węzłów przechodzących `isKeyNode`, inaczej `str` jak dziś. **Wartości
   w plikach danych zostają na ISTNIEJĄCYM kluczowaniu pozycyjnym per-plik (core.mjs:396, nietknięte) — TYLKO
   klucze wchodzą do `model.valueIndex` jako międzyplikowy fakt** (przez ISTNIEJĄCY mechanizm `valueIndex`, który
   już jest kluczowany `k:v` globalnie, nie przez kontener — to działa bez zmiany matematyki). Kontenery/tożsamość
   kontenera NIE zmieniają się w tym bilecie — to jest CAŁY zakres J7.3.
5. Zasada `VAL_CAP`-obcięcia: plik, którego skan wartości trafia `VAL_CAP`, ma swoje `vals` porzucone w całości
   (zapobiega zanieczyszczeniu generowanymi/wendorowanymi plikami — zweryfikowane jako usuwające dokładnie
   `tree-sitter-*.node-types.json` i `package-lock.json` bez dotykania żadnego ręcznie pisanego configu w trzech
   zmierzonych korpusach).
6. `lexicalPreds`/`mdlCuts`/`relSupported` jak w oryginalnym zakresie (zweryfikowane działające bez zmian).
**Bump.** `EXTR_V`, `HIST_V`, **`MODEL_V`** (dopisane — `mdlCuts` zmienia zbiór cięć partycji nawet w katalogach
kodu, nie tylko config; `grammarStamp()` i tak wymusza przebudowę, ale bump ma być udokumentowany uczciwie, nie
przypadkowy poboczny efekt).
**Test.** `struct-grammars.test.mjs`: PRZEPISANY test flagowy — „każdy plik workflow (`.github/workflows/*.yml`)
niesie klucze `jobs`, `name`, `on`" LUB „i18n JSON: klucz obecny w jednym locale, brakujący w drugim → `kin:`
miejsce" — NIE `scripts.test` w 12 package.json (empirycznie fałszywe, patrz wyżej). Osobny test: bramka kosztu
historii (blob bez zakresów → pominięty w `parseBlobs`, `fps[*].renames` dalej go pokrywa). Osobny test:
`VAL_CAP`-obcięty plik nie wnosi `vals`.
**Zależności.** J3.1, J3.2; decyzja (ZAMKNIĘTA — patrz wyżej).

**Wykonanie.** Zaimplementowane przez `impl-J7-2` (Sonnet), dokładnie wg „Poprawiony zakres" powyżej. Trzy gramatyki
(poprawne nazwy pakietów) dodane do `build-grammars.mjs`/`ALL_EXT2GRAMMAR`. `bindingFor`: `b.data`, `b.keyField`,
`KEY_LIKE_RE`, `keyNodeOf`/`isKeyNode` (wspinaczka przez „przezroczyste" węzły, cap głębokości 4) — zaimplementowane
dokładnie wg specyfikacji. **Prawdziwy błąd znaleziony i naprawiony przez wykonawcę, WYKRACZAJĄCY poza mój brief:**
pseudokod specyfikacji użył `kn === cur` do porównania tożsamości węzła; `web-tree-sitter` zwraca ŚWIEŻY
opakowujący obiekt JS przy każdym wywołaniu akcesora, więc `===` między dwoma odniesieniami do TEGO SAMEGO węzła
zawsze fałszywe — całe rozróżnienie klucz/wartość ciche nie działało. Naprawione na `kn.id === cur.id`, zgodnie z
istniejącym idiomem tego pliku (`c2.id === bodyN.id`). `STR_TYPES` rozszerzone o 7 nowych typów (zero kolizji z 19
wysyłanymi gramatykami). Normalizacja gałęzi danych (tylko obcięcie cudzysłowu, bramkowana `b.data`) naprawia
`ubuntu-latest`→`-latest` bez dotykania współdzielonego regexu. Reguła `VAL_CAP`: plik obcięty traci WSZYSTKIE
`vals` (`core.mjs:437`, `valsCapped ? [] : vals`) — ogólna poprawka, nie tylko dla gramatyk danych. Bramka kosztu
historii w `parseBlobs` (NIE w `walk()`, potwierdzone czytaniem kodu: `isScopeless(g)` sprawdzane PRZED wywołaniem
parsera, `walk()`'s `CODE_RE` nietknięte) — zmierzona na tym repo: 4.7-4.8s (bramka WŁ.) vs 5.2-5.3s (WYŁ.), ~9-11%
szybciej (mniejszy zysk niż na CleanArchitecture, bo ten korpus ma mniejszy udział plików bezzakresowych — 48/1084
≈4.4% — mechanizm identyczny). Kontener wartości danych POZOSTAJE na istniejącym kluczowaniu pozycyjnym
(`core.mjs:436`, nietknięte) — brak jakiegokolwiek przekluczowania kontenera w tym bilecie, zgodnie z granicą
J7.3. Fixture flagowy: dwa pliki `.github/workflows/*.yml` dzielące klucze `name`/`on`/`jobs`/`runs-on` (wybrane
zamiast i18n JSON, bo ścieżka klucza YAML jest trudniejsza — prawdziwy łańcuch `string_scalar→plain_scalar→
flow_node<key>→block_mapping_pair`, nie bezpośrednie pole JSON).

**Uboczna szkoda znaleziona i naprawiona w tej samej partii (bezpośrednia, dowiedziona konsekwencja włączenia
JSON — nie samowolne rozszerzenie zakresu):** trzy istniejące fixture (`change-archetypes.test.mjs`,
`how-hook.test.mjs`, `missing-shape.test.mjs`) miały nieużywane, czysto scenograficzne pliki `package.json`, które
po włączeniu gramatyki JSON zaczęły zasilać `mdlCuts`'s „własne pliki" katalogu głównego, zmieniając zbiór cięć
partycji i kaskadowo psując certyfikowany klaster w `change-archetypes.test.mjs` (2 z 8 commitów „add status"
wypadły z klastra). Wykonawca zweryfikował izolowanym powtórzeniem (usunięcie tej jednej linii przywraca dokładny
oryginalny wynik przy w pełni żywych json/yaml/toml) i potwierdził grepem, że żadna asercja nigdzie nie odwołuje
się do tych plików — usunięte jako martwa scenografia, nie obejście. Osobno: `grain.test.mjs`'s współdzielony
fixture UŻYWA package.json naprawdę (kształt realnego npm) — tam tylko zaktualizowana liczba blobów historii
(171→172, `package.json` teraz też jest blobem kodu) z komentarzem odsyłającym do tego bileta. Test na
`value-index.test.mjs` (250-wartościowy fixture) zaktualizowany z `length===200` na `length===0` — to jest
ZAMIERZONA nowa poprawność reguły `VAL_CAP`, nie regresja.

**Znalezione, NIE naprawione (prawdziwy, ale nieobjęty żadnym wymaganym testem, kandydat na J7.3 lub przyszły
nit):** segmenty klucza TOML `dotted_key` poza pierwszym (np. samo `name` z `owner.name` w oderwaniu) trafiają
`str`, nie `key` — tylko pierwszy segment i pełny tekst `dotted_key` są tagowane `key`. Wynika wprost z fallbacku
`keyNodeOf`'s specyfikacji, nie z błędu implementacji.

Zweryfikowane niezależnie: przeczytany cały diff `bindingFor`/`isKeyNode`/`STR_TYPES`/normalizacji gałęzi danych/
`VAL_CAP`/`parseBlobs`'s bramki (`history.mjs:84-105`, potwierdzone: `isScopeless` sprawdzane PRZED `getParser`,
`walk()`'s `CODE_RE`, `history.mjs:77`, nietknięte) — zgodny z opisem. Potwierdzone grepem: brak pozostałych
odwołań do `package.json` w trzech „oczyszczonych" fixture. Uruchomiony osobiście `struct-grammars.test.mjs` =
19/19 zielone. Jeden celowany odwrót przez `Edit` (bez `git checkout`/`stash`) — dokładnie odtwarzający błąd
znaleziony przez wykonawcę: `kn.id === cur.id` cofnięte do `kn === cur` → **8 z 19 testów poprawnie czerwonych**
(rozróżnienie klucz/wartość i normalizacja danych obie ciche/błędne dla wszystkich trzech gramatyk) — mocny,
niezależny dowód, że poprawka `.id` była konieczna, nie kosmetyczna; przywrócone → 19/19 zielone. Pełny pakiet
testów: **1402/1402** (baseline 1383 + 19 nowych). `config.mjs`: potwierdzone — tylko `ALL_EXT2GRAMMAR` zmienione,
żadna stała wersji (`EXTR_V`/`HIST_V`/`MODEL_V`) nietknięta przez wykonawcę. **Bump `EXTR_V`/`HIST_V`/`MODEL_V`
ODŁOŻONY do wspólnego bumpa po J7.3** (ten sam obszar funkcjonalny, jeden bump zamiast dwóch dla jednej spójnej
cechy rozłożonej na dwa bilety).

#### J7.3 · Kontenery danych kluczowane ścieżką klucza — ✅ ZROBIONE, zweryfikowane niezależnie · **model: Opus (projekt zweryfikowany pomiarem) → Sonnet (wdrożenie)**

**Zakres.** Nowa tożsamość kontenera DLA PLIKÓW DANYCH WYŁĄCZNIE (`b.data` z J7.2), aktywowana jawnym warunkiem
(gate na `b.data`, zero efektu na 19 istniejących gramatyk — zweryfikowane przez `opinion-j72-container-keying`
jako nietykające bajtowo istniejącego kluczowania enumów/stringów kodu, core.mjs:382/396 bez zmian). Klucz
kontenera: `hashStr(cont.type + '|' + grammar + '#' + keyPathOf(cont, b))`, gdzie `keyPathOf` buduje ścieżkę
`$.a.b.c` wspinając się przez rodziców i zbierając tekst węzła-klucza na każdym poziomie (zweryfikowane
empirycznie: `$.scripts` w dwóch różnych plikach package.json hashuje się IDENTYCZNIE). Tablice są kontenerami
bez własnego segmentu ścieżki (elementy tablicy dzielą jeden kontener — zweryfikowane jako poprawne dla tablic
obiektów, np. `steps:` w GitHub Actions). `valueContainer`'s etykieta = sama ścieżka klucza (ulepszenie względem
dzisiejszego `null` dla kontenerów `str`).
**Poprawki matematyczne bez nowej stałej (obowiązkowe, nie opcjonalne — bez nich ten bilet jest NETTO UJEMNY,
zmierzone: 561 „norm" na jednym repo, ~10 odrębnych):**
1. **CORE zamiast UNION** przy budowie zbioru sąsiedztwa kontenera: członkowie obecni w ≥ `ceil(2/3)` plików
   NIOSĄCYCH ten kontener, nie suma wszystkich kluczy jakiegokolwiek pliku — reużywa ISTNIEJĄCY próg 2/3
   (markery, `groupKin`, kompletność J3.2), zero nowej stałej.
2. **Populacja `h(f)` liczona per-kontener**, z mapy `(kontener, członek) -> pliki` budowanej w tym samym
   przebiegu `learn()`, NIE z globalnego `model.valueIndex` (dziś: wartość liczy się jako „niesiona" przez plik,
   jeśli WYSTĘPUJE GDZIEKOLWIEK w pliku, nie w TYM kontenerze — to jest **przedsesyjny błąd już w wysłanym J3.2**,
   potwierdzony bezpośrednio przez orkiestratora na `.grain/cache/model.json` tego repo: 76 certyfikowanych
   `valueNorms`, ~8-10 odrębnych sygnatur `(ne,neff)`, jedna powtórzona 19 razy). **Ten bilet naprawia ten błąd
   przy okazji — udokumentować jako naprawę istniejącej funkcji, nie tylko włącznik nowej.**
Zmierzony efekt obu poprawek razem: jeden korpus 561→4 certyfikowanych norm (wszystkie odrębne, prawdziwe: np.
„każdy plik workflow niesie `jobs`,`name`,`on`" przy 32/32); drugi 4→3; to repo 6→1 (własne zawinione
`node-types.json`, ne=10/10, prawdziwe).
**Bump.** `MODEL_V` (współdzielony z J7.2, jeśli oba lądują w tej samej fazie — lub własny, jeśli J7.3 ląduje
później; orkiestrator decyduje w momencie aplikacji).
**Test.** `container-keypath.test.mjs`: dwa pliki package.json z identycznym kluczem `$.scripts.test` → JEDEN
kontener, certyfikuje się przy ≥ minRaw plików; UNION bez poprawek CORE/per-kontener na tym samym fixture daje
FAŁSZYWĄ certyfikację (test regresji — potwierdza, że poprawki są rzeczywiście stosowane, nie tylko obecne w
kodzie); istniejący test na duplikację `valueNorms` (regresja na naprawę błędu J3.2) — po tym bilecie identyczny
zbiór członków nie certyfikuje się dwa razy pod różnymi kontenerami tego samego typu.
**Zależności.** J7.2, J3.1, J3.2.

**Wykonanie.** Zaimplementowane przez `impl-J7-3` (Sonnet). (A) `keyPathOf`/`keyText` (core.mjs ~118-140):
kontener danych (`b.data` i `cont` znaleziony) haszowany `hashStr(cont.type + '|' + grammar + '#' +
keyPathOf(cont, b))`, z ścieżką kluczy jako `cn` (etykieta `valueContainer`); kontener kodu bajt-identyczny jak
przed biletem. Tablice nie dodają segmentu ścieżki (elementy dzielą jeden kontener). **Znalezione, nienaprawione
(poza zakresem, udokumentowane w nagłówku testu):** `CONTAINER_RE` nigdy nie dopasowuje YAML `block_mapping`/
`block_sequence` ani TOML `table`/`inline_table` — przekluczowanie ścieżką działa dziś tylko dla obiektów/tablic
JSON i tablic TOML.
(B) Ogólna naprawa błędu duplikacji (core.mjs ~1843-1912, DOTYCZY WSZYSTKICH typów kontenerów, nie tylko danych):
nowa mapa `contFiles` (kontener→plik→zbiór kluczy TEGO pliku W TYM kontenerze), budowana w tej samej pętli co
`vConts`. `model.valueSiblings` wymaga teraz CORE — członek musi mieć `carriers >= ceil(declaring·2/3)` (reużyty
istniejący próg 2/3), nie UNIA wszystkiego kiedykolwiek widzianego. `h(f)` w pętli certyfikacji czyta
`contFiles.get(+c)` (członkostwo per-kontener-per-plik), nie globalną listę miejsc `model.valueIndex[k]`. Cała
matematyka poniżej (`t`, `counts`, `bits`, test kierunku, próg λ) NIETKNIĘTA.

**Pomiar na prawdziwym modelu tego repo (zbudowany od zera, `.grain/cache` usunięty, zweryfikowany osobiście
przez orkiestratora, nie tylko przyjęty z raportu):** PRZED tym biletem — 76 certyfikowanych `valueNorms`, tylko
8 odrębnych sygnatur `(ne,neff)` (jedna powtórzona 19 razy). PO — **0 certyfikowanych `valueNorms`, z 1333
kandydackich kontenerów** (potwierdzone niezależnie: `node -e` na świeżo przebudowanym `model.json`, dokładnie
1333/0, zgodne z raportem wykonawcy co do liczby). To NIE jest regresja — wykonawca zweryfikował, że z SAMĄ
częścią (A) (przekluczowanie ścieżką) i ręcznie cofniętą częścią (B), liczba zostaje dokładnie 76/8 (niezmieniona)
— to część (B) sama w sobie prowadzi do zera, dokładnie tam, gdzie się jej spodziewano. Niezależna opinia
projektowa (`opinion-j72-container-keying`) zmierzyła TĘ SAMĄ poprawkę na dwóch INNYCH prawdziwych repo i
znalazła NIEZEROWE wyniki (4 i 3 certyfikowane normy) — dowód, że mechanizm nie certyfikuje zera z zasady, tylko
gdy dane repo na to nie zasługuje. Zero na tym repo jest wiarygodne: monorepo z dużą ilością wygenerowanych/
szablonowych plików testowych, gdzie pozorne podobieństwo strukturalne rzadko oznacza PRAWDZIWĄ zgodność
członkostwa na poziomie pojedynczego kontenera przy progu λ=8 (wymagane ~87.5% zgodności).

Zweryfikowane niezależnie: przeczytany cały diff `keyPathOf`/`contFiles`/`valueSiblings`/pętli certyfikacji
(core.mjs) — zgodny z opisem; potwierdzone, że matematyka POD `t`/`neff` nie zmieniła się ani bajtem. Uruchomiony
osobiście `container-keypath.test.mjs` = 8/8 zielone. Dwa celowane odwroty przez `Edit` RAZEM (bez `git checkout`/
`stash`) — `sibs` cofnięte do UNII i `h(f)` cofnięte do globalnego `valueIndex` (dokładna, pierwotna błędna
postać) → **3/8 testów poprawnie czerwonych**, dokładnie testy (2) i (3) demonstrujące fałszywą certyfikację
(„test" spoza `scripts` fałszywie certyfikowany jako sąsiad; `Priority.LOW`/`HIGH` fałszywie certyfikowane mimo
że tylko 2/5 plików faktycznie mają obie wartości we WŁASNYM enumie) — silny, bezpośredni dowód, że oba elementy
poprawki są konieczne razem; przywrócone → 8/8 zielone. Pełny pakiet testów: **1410/1410** (baseline 1402 +
8 nowych). `config.mjs` potwierdzone nietknięte, żadna stała wersji nie zbumpowana przez wykonawcę.

**FAZA 7 W CAŁOŚCI ZROBIONA (J7.1–J7.3), zweryfikowana niezależnie na każdym bilecie.** Dwie niezależne opinie
Opus w tej fazie, obie z rzeczywistym pomiarem, nie tylko rozumowaniem: `review-pre-faza7` (koszt J7.2 na trzech
prawdziwych repo — ten koszt okazał się realny, +361% na jednym z nich, i naprawiony wymierną, wyprowadzoną bramką)
i `opinion-j72-container-keying` (mechanizm przekluczowania kontenera, zainstalowała prawdziwe gramatyki,
sparsowała prawdziwe próbki, uruchomiła cały mechanizm end-to-end na trzech repo — znalazła, że własny przykład
flagowy bileta jest empirycznie fałszywy, i że sam redesign bez dwóch poprawek matematycznych byłby NETTO UJEMNY).
Jedna decyzja zakresu przeszła przez użytkownika DWUKROTNIE (AskUserQuestion) zanim ostateczny kształt się
ustalił — „full redesign" wybrany świadomie, dostarczony w dwóch bezpiecznych krokach (J7.2 bezpieczna połowa,
J7.3 ambitna połowa z pełnym pomiarem przed i po). Jeden przedsesyjny błąd jakości już wysłanego J3.2 znaleziony i
naprawiony przy okazji (duplikacja `valueNorms`, 76→8 odrębnych sygnatur na starym kodzie tego repo, potwierdzone
osobiście przez orkiestratora na `.grain/cache/model.json` przed I po). Zero regresji, zero incydentów `git
checkout`/`git stash` (poza J6.1's już udokumentowanym, jednorazowym odstępstwem z wcześniejszej fazy). Wspólny
bump `EXTR_V` g25→g26, `HIST_V` h9→h10, `MODEL_V` m20→m21 (oba bilety J7.2/J7.3 razem) wykonany przez
orkiestratora, pełny zestaw po bumpie: **1410/1410**. Dalej: Faza 8 (ostatnia).**

### Faza 8 — Dokumentacja i wersja (na końcu partii)

#### J8.1 · SKILL, commands, reference, mathematics, validation — ✅ ZROBIONE, zweryfikowane niezależnie (ostatnie) · **model: Sonnet (pisze) → Opus (przegląd: wycieki, spójność, audyt dispatch↔commands↔reference)**

**Zakres.** `SKILL.md`: pierwszy ekran = cztery pytania + moment na każde + reguła głosów + „cisza to nie aprobata";
druga sekcja = utrzymujący (`report`/`rules`/`decide`/`status`/`export`); trzecia = deweloperskie (`explain`/`selftest`/
`refresh`/`map`); aliasy jednym zdaniem. `commands/*.md`: `what.md`, `how.md`, `decide.md`, `explain.md`, `map.md`,
`selftest.md`; `review.md`/`completeness.md`/`spectrum.md`/`steer.md` → jednolinijkowe przekierowania. `reference.md`:
tabela komend, głosy, `missing:` źródła, hooki (gdy J6), store (`check-pending`, `check-outcomes`), klucze wersji,
eksport (nowe pola: `waivers`, `changeArchetypes`, `valueIndex` NIE eksportowany w całości — tylko `valueSiblings`
i licznik; `twins`; `moves`). `mathematics.md`: nowe populacje jako przypadki szczególne (commity, wartości, most) +
rezyduum: `fpsCap`, `valueDfMin/MaxShare`, próg 2/3 nazwany raz. `validation.md`: wynik bramki J2.3 na korpusie,
`selftest` jako procedura. README: **nie ruszać** bez uzgodnienia (UX w toku); zaproponować diff osobno.
**Dopisek z recenzji J0.1 (Opus, 2026-08-31):** `README.md:140,263,302,307` i `docs/reference.md:15` cytują stare
kształty głosu zdecydowanego/przykładu (`steer (maintainer decision, …)`, `maintainer decision (…)`, `history
bridge:`) sprzed ujednolicenia w J0.1 (`decision <typ> (<kto> <kiedy>):`, `example (<sha> <data>):`) — audyt ma je
znaleźć i zaktualizować do nowego kształtu (README pod tym samym zastrzeżeniem „nie ruszać bez uzgodnienia" co do
reszty treści — to jest punktowa korekta cytatu, nie redesign UX).
**Test.** Istniejący audyt docs (dispatch ↔ commands ↔ reference) rozszerzony o nowe komendy; markdownlint.
**Zależności.** Wszystko wcześniejsze w partii.

**Wykonanie.** Zaimplementowane przez `impl-J8-1` (Sonnet): SKILL.md przebudowane (cztery pytania+moment, reguła
głosów, „cisza to nie aprobata", sekcje utrzymujący/deweloperskie); sześć nowych `commands/*.md`
(`what,how,decide,explain,map,selftest`); `review.md`/`spectrum.md`/`steer.md` → przekierowania jednolinijkowe
(zweryfikowane: nic nie tracą — `cmdReview` ignoruje `args` całkowicie, `spectrum`/`explain` to jeden dispatch,
`steer`→`decide steer` przez `DECIDE_SUBS`); `docs/reference.md` w dużej mierze przepisane (tabela komend, głosy,
`missing:`, cztery hooki Fazy 6 z namespace'owaniem TTL, pliki store, klucze wersji, schemat eksportu); nowe sekcje
w `docs/mathematics.md` (Commit archetypes, Value concordance, Structural twins, rezyduum stałych — `fpsCap`,
`scopePairCap`, `valueDfMin/MaxShare`, próg 2/3 nazwany raz); `docs/validation.md`: sekcja bramki J2.3 (kryterium
zamrożone NIE spełnione → F1 dodane jako metryka addytywna → decyzja DALEJ) + `selftest` jako procedura. 21
odniesień „J8.1" w plan.md zebranych i rozstrzygniętych. `export.mjs` (sankcjonowany wyjątek): `changeArchetypes`/
`twins`/`moves` dodane addytywnie (potwierdzone: tekst bileta sam je wymienia — luźniejszy punkt „poza zakresem"
w briefie był skrótem, nie węższym upoważnieniem), `valueSiblings` przekształcone na `{container, members, norm}`,
`summary.valueIndexSize` jako licznik, surowy `valueIndex` NIE eksportowany (zgodnie ze specyfikacją) —
`grain-export/1` niezmienione (wszystko addytywne). README.md: dokładnie cztery linie (stare kształty głosu
`steer (maintainer decision...)`/`maintainer decision (...)`/`history bridge:` → `decision steer (...)`/
`example (sha):`) — reszta nietknięta. Nowy `plugins/grain/tests/docs-audit.test.mjs` (39 testów): parsuje dispatch
`grain.mjs`, sprawdza commands/*.md + wzmiankę w reference.md dla każdej niewyjątkowej komendy, plus strażnik
regresji na stare kształty głosu.

Zweryfikowane niezależnie przez orkiestratora (diff `export.mjs`, cztery linie README wprost porównane z
`voice()`'s realnym wyjściem — `core.mjs:1024-1032`, `decision ${typ} (${who}): ${text}` i `example${cite}:
${text}` dosłownie zgodne), uruchomiony osobiście `docs-audit.test.mjs` = 39/39 zielone, jeden celowany odwrót
przez `Edit` (wprowadzenie z powrotem starego kształtu głosu w README) → poprawnie czerwony (strażnik regresji
złapał dokładnie to), przywrócone → zielone. Pełny pakiet: 1449/1449.

**Przegląd Opus (`review-J8-1-docs`) — prawdziwe znaleziska, wszystkie zweryfikowane przeze mnie osobiście przed
zastosowaniem, wszystkie naprawione w tej samej partii:**
- **Wycieki: brak.** Żadnej prawdziwej nazwy repo/maszyny/osoby w dotkniętych plikach; dziesięć repo korpusu w
  `validation.md` to PUBLICZNE nazwy już jawnie ujawnione przed tym biletem (`ffa631b`/`a8cb5b9`) — zgodne z
  istniejącym standardem projektu, nie wyciek.
- **Naprawione (must-fix), zweryfikowane osobiście przed zastosowaniem:** (a) `reference.md`'s lista namespace'ów
  TTL twierdziła „sześć hooków, każdy własny klucz" i wymyśliła nieistniejący klucz `edit:<rel>` — potwierdzone
  przez `grep` na `seenGate(` (`grain.mjs`): SZEŚĆ wywołań w PIĘCIU hookach, `edit-hook` współdzieli
  `cochange:<rel>` z `check-hook` — naprawione. (b) `mathematics.md` błędnie wymieniło `groupKin`'s próg jako
  część rodziny 2/3 — potwierdzone `core.mjs:1666`: to 0.6, inny, celowo nie-MDL próg — naprawione w DWÓCH
  miejscach (sekcja Structural twins + rezyduum stałych) PLUS źródłowy komentarz w `core.mjs:1869`, który błąd
  odziedziczył. (c) `mathematics.md`'s odnośnik do `validation.md` dla pomiaru J7.3 wskazywał donikąd (`validation.
  md` nie miało ANI JEDNEJO wystąpienia „value"/„concordance"/„sibling") — naprawione DODANIEM realnego akapitu
  pomiaru (76→8→0 na tym repo, 3-4 na dwóch innych, zgodnie z wcześniej zweryfikowanym pomiarem J7.3).
- **Naprawione (should-fix):** (d) `waivers` nie miało własnego akapitu w `reference.md` mimo jawnego zobowiązania
  z wcześniejszej fazy — dodany, wzorem sąsiednich pól, ze zweryfikowanym kształtem wpisu (`core.mjs:1690`).
  (e) próg twins błędnie opisany jako „przekraczający OBIE strony razem" (matematycznie niemożliwe — `shared`
  zawsze `<= min(A.shared,B.shared)`, potwierdzone `core.mjs:612`) w DWÓCH miejscach (`export.mjs`'s
  `schemaNotes`, `reference.md`) — naprawione na „przekraczający NIEWSPÓLNE reszty obu stron razem" (poprawny
  opis, `mathematics.md`'s własna sekcja już miała to dobrze).
- **Naprawione (minor):** (f) `what.md`'s „since when" → „when it was last mentioned" (zgodne z realnym
  renderem, `core.mjs:2822`). (g) `SKILL.md`'s „Six hooks run without being asked" → „Six hooks run mid-task"
  (usuwa pozorną sprzeczność z `reference.md`'s siedmioma wpisami — SessionStart świadomie pominięty w SKILL.md,
  teraz spójnie ramowany, nie policzony inaczej). (h) `mathematics.md`'s `moves` akapit błędnie sugerował
  mianownik „wszystkie pliki urodzone pod tym sufiksem/tokenem" zamiast rzeczywistego („przenosiny Z JUŻ NAZWANEGO
  katalogu kin", `core.mjs:1976-1979`) — naprawione. Test-only nit: `docs-audit.test.mjs`'s `DOC_FILE.seed`
  wskazywało na `steer.md` (tylko `seed add`) zamiast `decide.md` (`add-boundary`/`list`/`rm`) — naprawione.
- **Potwierdzone poprawne, bez zmian:** audyt dispatch↔commands↔reference (zbudowany niezależnie przez recenzenta,
  zero luk pokrycia), decyzja zakresu eksportu (`changeArchetypes`/`twins`/`moves` — tekst bileta jawnie je
  wymienia, czytanie wykonawcy słuszne), 8 z 9 wyrywkowo sprawdzonych odniesień „J8.1" już poprawnie rozstrzygnięte
  (jedno — `waivers` — było brakujące, naprawione powyżej jako (d)).

Pełny pakiet testów po wszystkich poprawkach przeglądu: **1449/1449**, potwierdzony osobiście przez orkiestratora
po każdej zmianie.

#### J8.2 · Wersja: wszystko jako 0.3.0 — ✅ ZROBIONE (ostatnie) · **model: orkiestrator (sam)**

Cała partia J — **wszystkie fazy 0–8, bez wyjątków** (0–5, Faza 6 hooki, J7.1, J7.2, J8.1) — wychodzi jako
**jedno wydanie 0.3.0** (decyzja utrzymującego 2026-08-31: „nic nie jest poza 0.3.0, wszystko w 0.3.0" — uchyla
wcześniejsze wyłączenie Fazy 6 i J7.2). Na samym końcu, po J8.1 i po zielonym
pełnym zestawie: orkiestrator sam podbija `ENGINE_VERSION` w `config.mjs` (`'0.2.1'` → `'0.3.0'`) i `"version"` w
trzech manifestach (`plugins/grain/.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.codex-plugin/
plugin.json`); opis w 7 manifestach (`.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json`,
`.agents/plugins/marketplace.json`, `.github/plugin/marketplace.json` + 3 plugin.json) aktualizuje o `what`/`how`/
`decide` jednym skryptem, jak przy 0.2.0; `grep -rln "0\.2\.1"` po `tests/` i manifestach musi być pusty; `node
plugins/grain/bin/grain.mjs version` musi drukować `0.3.0`; pełny zestaw, WŁĄCZNIE z testami hooków (J6.x) i
gramatyk struktury (J7.2, jeśli decyzja wewnętrznej bramki wypadnie na tak — jeśli nie, bilet zamyka się jako
„zmierzone, odrzucone z udokumentowanym powodem", nadal w ramach 0.3.0, bez kodu produkcyjnego). Eksport: pola tylko dodawane;
`grain-export/1` zostaje, chyba że kształt istniejącego pola się zmieni (wtedy `/2` i wpis w reference). Commit i
push — wyłącznie na polecenie utrzymującego (K2 pkt 10).

**Wykonanie.** Wykonane osobiście przez orkiestratora, po zielonym pełnym zestawie (1449/1449) po J8.1. Kolejność:
(1) `ENGINE_VERSION` w `config.mjs`: `'0.2.1'` → `'0.3.0'`. (2) `"version"` podbite na `'0.3.0'` w trzech
manifestach (`plugins/grain/.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.codex-plugin/plugin.json`
— sprawdzone osobno grepem po zmianie). (3) Opis zaktualizowany JEDNYM skryptem Node (znaleziony precedens: commit
`13e5136`, 0.2.0's bump — identyczna metoda, string-replace tego samego literału zdania w siedmiu plikach) we
WSZYSTKICH siedmiu manifestach naraz (4× `marketplace.json`, 3× `plugin.json` — wszystkie dzieliły identyczny
tekst przed zmianą, potwierdzone przed aplikacją). Nowy opis dodaje `what <term>`/`how <query>` obok `where`,
zamienia `seed` na `decide steer|boundary|waive` (kanoniczna nazwa powierzchni po J8.1's przekierowaniach) i
dopisuje „hooks that speak unbidden" obok istniejącej wzmianki o serwerze MCP — zgodnie z wymogiem bileta
(„aktualizuje o what/how/decide"), bez próby wymienienia KAŻDEJ nowej funkcji partii J. (4) Weryfikacja:
`grep -rln "0\.2\.1"` po `plugins/grain/tests/` i wszystkich siedmiu manifestach — PUSTE. `node plugins/grain/
bin/grain.mjs version` → `grain 0.3.0 · extractor g26 · grammars ... json ... toml ... yaml ...` (potwierdza też,
że wszystkie trzy nowe gramatyki Fazy 7 są realnie załadowane w wydaniu). (5) Pełny pakiet testów po bumpie,
uruchomiony osobiście: **1449/1449**, WŁĄCZNIE z testami hooków (J6.x) i gramatyk struktury (J7.x) — wewnętrzna
bramka J7.2 wypadła na TAK (gramatyki wysłane, kod produkcyjny), więc ten warunek bileta jest spełniony w pełnej,
pozytywnej formie, nie w formie „zmierzone, odrzucone". `export.mjs`'s `schema: 'grain-export/1'` potwierdzone
BEZ ZMIANY — wszystkie pola dodane przez Fazy 3-8 są addytywne (potwierdzone w każdym odpowiednim bilecie
osobno przez całą sesję). **Bez commitu, bez push** — brak jawnego polecenia utrzymującego w tej partii.

---

## PARTIA J — 0.3.0 — CAŁA ZROBIONA

Wszystkie 42 bilety (Fazy 0–8, w tym J5.7 i J7.3 dodane w trakcie partii przez pomiar/opinię) zaimplementowane i
zweryfikowane NIEZALEŻNIE przez orkiestratora — każdy: przeczytany cały diff, uruchomiony osobiście co najmniej
jeden plik testowy nowego bileta, wykonany co najmniej jeden celowany odwrót przez `Edit` (nigdy `git checkout`/
`git stash`) potwierdzający GENUINE czerwone przed przywróceniem, i osobiście policzony pełny zestaw testów po
każdym bilecie. Zero regresji przez całą partię. Jedenaście niezależnych opinii Opus/Fable dla trudnych rozstrzygnięć
projektowych/matematycznych (J3.2, J3.4, J4.1, J5.1, J5.8, J7.2×2, J7.3's projekt) — żadna nie została rozstrzygnięta
samodzielnie wbrew własnej zasadzie sesji. Dwie decyzje zakresu przeszły przez `AskUserQuestion` (J7.2). Pełny
zestaw testów: **1194 → 1449** (255 nowych testów przez całą partię). Wersja: **0.3.0** — `ENGINE_VERSION` i
wszystkie trzy `plugin.json`, potwierdzone `grep -rln "0\.2\.1"` po `tests/` i manifestach: PUSTE. `.temp/docs/
plan.md` (ten plik) pozostaje gitignored, nigdy niecommitowany —
jedyny trwały ślad tej partii w drzewie roboczym to sam kod, testy i dokumentacja. Commit i push czekają na jawne
polecenie utrzymującego.

### Mapowanie H/I → J

H1→J0.2 · H2→J2.5 · H3→J5.1 · H4→J3.4 · H5→J3.2(b) · H6→J5.6 · H7→J1.3 + J5.4 · H8→J5.2 · H9→J5.3 · H10→J5.7 (fan-in
poza zakresem: osobna runda nad ekstraktorami) · H11→J5.8 · H12→J0.4 + J2.3 · H13′→J0.3 · H14→J7.2 · H15→J6 ·
I1→J2.1 · I2→J2.2 · I2b→J2.3 · I10→J2.4 · I3→J3.1 · I4→J3.2(a) · I5→J3.3 · I6→J4.1 · I7→J4.3 · I8→J4.2 · I9→J6.1 ·
I11→J7.2. Sekcje H i I zostają jako źródło uzasadnień; lista do zrobienia to J.

### Kolejność J

1. **Faza 0** (J0.1 → J0.2 → J0.3 → J0.4): reguły, zanim powstanie pierwsza nowa komenda.
2. **Faza 1** (J1.1 → J1.2 → J1.3 → J1.4 → J1.5): powierzchnia; bump `MODEL_V` raz na koniec fazy 0/1.
3. **Faza 2** (J2.1 → J2.2 → J2.3 **bramka** → J2.4 → J2.5): `HIST_V` przy J2.1; po J2.3 decyzja dalej/stop.
4. **Faza 3** (J3.1 → J3.2 → J3.3 → J3.4): `EXTR_V` g25, `MODEL_V` raz na koniec.
5. **Faza 4** (J4.1 → J4.2 → J4.3): `MODEL_V` raz.
6. **Faza 5** (J5.1, J5.2, J5.3, J5.4 → J5.5; potem J5.6 → J5.7, J5.8 — sekwencyjnie, jeden wykonawca naraz):
   `EXTR_V`/`MODEL_V`/`HIST_V` raz.
7. **Faza 7** — J7.1 z fazą 1; J7.2 po fazie 3 (zależy od J3.1, J3.2) — bramka decyzyjna (Opus mierzy, przedstawia
   materiał utrzymującemu, decyzja zapada W TRAKCIE partii, nie odsuwa 0.3.0). **Faza 6** — po fazie 5 (zależy od
   J0.1, J0.2, J0.3, J1.1, J2.2, J3.2, J4.1 — więc naturalnie najpóźniejsza z fazy roboczych). **J8.1**
   (dokumentacja, obejmuje też hooki i J7.2 jeśli wdrożone) → **J8.2** (wersja 0.3.0, cały zakres) zamykają partię;
   potem raport do utrzymującego i oczekiwanie na polecenie commit+push.

---

## K — Procedura wykonania sekcji J: orkiestrator Sonnet, wykonawcy Sonnet i Opus

Ten rozdział jest napisany dla orkiestratora, który NIE ma pamięci sesji, w której powstał plan. Wykonuj dosłownie.

**Start:** (1) przeczytaj sekcję J w całości i K w całości; (2) `git status` — drzewo ma być czyste (jeśli nie, zapytaj
utrzymującego, nic nie czyść); (3) `node --test 'plugins/grain/tests/**/*.test.mjs'` — zanotuj punkt wyjścia
(oczekiwane: 1113/1113 na 0.2.1); (4) recenzja Opus przed fazą 0 (K4); (5) J0.1. Stan drzewa i wynik zestawu wpisz
pod nagłówkiem sekcji J jako „Punkt wyjścia partii 0.3.0".

### K1 · Role i dobór modelu

| rola | model | kiedy |
|---|---|---|
| **orkiestrator** | Sonnet | cała sesja: czyta bilet i kod, pisze brief, odpala JEDNEGO wykonawcę, weryfikuje niezależnie, prowadzi plan, robi bumpy wersji, nigdy nie commituje bez wyraźnego polecenia |
| **wykonawca Sonnet** | Sonnet | bilet w pełni wyspecyfikowany w J (funkcja, mechanizm, format, test): scalenia, aliasy, renderery, harnessy, dodatki do istniejących wzorców (E6-podobne pętle, sekcje raportu), MCP, dokumentacja |
| **wykonawca Opus** | Opus | bilet z decyzją projektową w trakcie implementacji, matematyką (mapowanie na komórkę KT, kontrast, rezyduum), ekstrakcją generyczną przez 19 gramatyk (ryzyko złamania „kod to kod"), refaktorem rdzenia bez zmiany wyjścia (bajt-identyczność), nową komendą decydującą o bramce |
| **recenzent Opus** | Opus | (a) **przed** każdą fazą: przegląd biletów fazy vs aktualny kod — wady briefów wychwycone przed implementacją (lekcja E6/G18: brief też bywa błędny); (b) **po** fazie: spójność między biletami (reguła głosów, jeden `missing:`, rezyduum, bajt-identyczność regresji); (c) **werdykt bramki J2.3**: sprawdza, że baseline grep nie jest chochołem, liczy metryki na korpusie, pisze wynik do planu; (d) przegląd J8.1: wycieki nazw prywatnych repozytoriów, spójność dispatch↔commands↔reference |
| **claude-code-guide** | (wbudowany typ agenta) | KAŻDE pytanie o zdarzenia hooków, payloady, `.mcp.json`, plugin manifesty — przed biletami J6.x i przy J1.5/J7.1; nigdy nie zgadywać nazw zdarzeń (lekcja D7) |

Model przy każdym bilecie jest w nagłówku biletu (`model: …`). Odstępstwo w dół (Opus→Sonnet) tylko po pisemnym
uzasadnieniu w planie; w górę (Sonnet→Opus) zawsze wolno.

### K2 · Pętla na jeden bilet (sekwencyjnie, jeden wykonawca naraz — drzewo robocze jest współdzielone)

1. **Czytaj sam.** Bilet w J + każdy plik i funkcję, którą bilet wymienia (`grep -n`, `Read` na zakresach). Jeśli
   kotwica z biletu (nazwa funkcji, linia) nie istnieje już w kodzie — popraw bilet PRZED briefem, nie przekazuj
   wykonawcy błędnej kotwicy.
2. **Brief** wg szablonu K3. Jeden wykonawca, `Agent` z `subagent_type: "claude"`, `model` z nagłówka biletu,
   `name: impl-<bilet>` (np. `impl-J2.2`). Brief zawiera dosłownie: zakaz commitów, zakaz bumpów w `config.mjs`,
   TDD red-first z dowodem, pełny zestaw na końcu, raport ≤ 300 słów z dowodem red.
3. **Raport ≠ prawda.** Po raporcie: `git status --short`; `git diff <plik>` dla KAŻDEGO zmienionego pliku; sprawdź,
   że zmienione są tylko pliki z briefu (+ nowe testy); `git diff --stat plugins/grain/engine/config.mjs` musi być
   pusty (chyba że to krok bumpu fazy, który robisz sam).
4. **Odtwórz red własnoręcznie.** Cofnij WYŁĄCZNIE hunki poprawki przez `Edit` (old_string = nowa wersja,
   new_string = stara — masz obie w diffie). **Nigdy `git checkout -- <plik>` ani `git stash` na pliku, który niesie
   zmiany innych biletów** — w partii G jedno takie `git checkout` skasowało cudzą poprawkę i trzeba było ją
   odtwarzać z diffu. Uruchom NOWY plik testowy: musi paść dokładnie tam, gdzie raport mówi. Przywróć przez `Edit`
   (odwrotnie). Uruchom nowy plik testowy: zielony.
5. **Pełny zestaw**: `node --test 'plugins/grain/tests/**/*.test.mjs'` → zanotuj `pass/fail`. Fail = wracasz do
   wykonawcy (`SendMessage` do `impl-<bilet>`, ten sam kontekst) z dokładnym wyjściem; nie naprawiasz sam, chyba że
   to jednoliniowa literówka — wtedy napraw, zanotuj w planie, że naprawiłeś sam.
6. **Plan**: nagłówek biletu → `— ✅ ZROBIONE, zweryfikowane niezależnie`; pod biletem akapit: co wdrożono (pliki,
   funkcje), jak zweryfikowano (które testy padły przy cofnięciu, pełny zestaw N/N), co znaleziono po drodze.
7. **Znalezione po drodze** → NOWY bilet w J (numer `J<faza>.<następny wolny>`, lub `JX.n` dla rzeczy poza fazami),
   z tym samym formatem co reszta, i naprawa w TEJ partii tą samą pętlą. Nic nie jest „pre-existing, nie moje".
   Wyjątek: rzecz wymagająca decyzji utrzymującego (nowa gramatyka, zmiana schematu eksportu, zmiana tożsamości
   produktu) → bilet ze statusem `DECYZJA` i pytanie do utrzymującego na koniec fazy, nie w środku.
8. **Wada briefu ujawniona przez raport** (wykonawca zrobił dokładnie to, co kazano, a to jest złe — jak E6, G18):
   nie zakładaj nowego agenta; `SendMessage` do tego samego z precyzyjną korektą (co jest źle, dlaczego, co zamiast);
   po poprawce cała weryfikacja od kroku 3 od nowa. Jeśli nie wiesz, co zamiast — recenzent Opus (K1) z pytaniem
   projektowym, ZANIM wykonawca ruszy dalej.
9. **Bump wersji**: raz na fazę, po zielonym świetle wszystkich biletów fazy, które go wymagają (lista w „Kolejność J").
   Robisz sam w `config.mjs`, z komentarzem wymieniającym bilety (wzór: wpisy `m15`/`g24` z partii G); potem pełny
   zestaw; `grep -rln` po starym numerze wersji w `tests/` (nic nie może go hardkodować).
10. **Commit i push wyłącznie na wyraźne polecenie utrzymującego**, z listą plików wprost (nigdy `git add -A`), po
    pełnym zestawie i sprawdzeniu `git status`. Wersja produktu jest zdecydowana: cała partia to **0.3.0** (J8.2) —
    orkiestrator podbija ją sam na końcu partii, wg J8.2, i nie tworzy tagu (tag to decyzja utrzymującego).

### K3 · Szablon briefu dla wykonawcy (kopiuj, wypełnij, nic nie usuwaj)

```
Repo: /Users/me/repos/github.com/krzysztofdudek/Grain. Implementing ticket **<ID>** from
/Users/me/repos/github.com/krzysztofdudek/Grain/.temp/docs/plan.md — read the ticket's full text first (section
"#### <ID> · …") for context; this brief is the authoritative spec: follow it exactly, do not redesign.

CONTEXT (verified by the orchestrator against the current code, not from memory):
- <plik>:<funkcja> — <co dziś robi, 1–2 zdania, z cytatem kluczowej linii>
- <…>

BUG / GAP: <objaw i mechanizm w 3–6 zdaniach; co jest złe DZIŚ, z dowodem (wyjście, liczby)>

FIX (exact): <kod lub pseudokod z dokładnymi nazwami; co się zmienia, co NIE; kształt wyjścia; --json>

OUT OF SCOPE (do not touch): <pliki/funkcje, których nie wolno ruszać, z powodem>
DO NOT bump EXTR_V/HIST_V/MODEL_V/ENGINE_VERSION in config.mjs — the orchestrator does one shared bump per phase.
Rules that always apply: mine() untouched; no name lists for languages/frameworks/roles (derive from node-types.json
+ wordBounded); every claim printed with a denominator; voices per J0.1 (hooks never speak "example"/"map").

TESTS TO ADD (plugins/grain/tests/<nazwa>.test.mjs, follow the fixture conventions of <istniejący plik testowy>):
(a) <red→green primary>  (b) <…>  (c) regression control: <…>  (d) determinism if the model/history changes

PROCESS (mandatory): write the tests first against unmodified code, run them, confirm the EXACT red symptom
(paste it), apply the fix, confirm green, run the FULL suite `node --test 'plugins/grain/tests/**/*.test.mjs'`
and report the exact pass/fail count. Do not commit anything (no git add/commit/stash/checkout). Leave changes
as uncommitted working-tree edits. Other agents' uncommitted changes may be present in the tree — never revert
or "clean up" anything you did not write.

Report back in under 300 words: red→green evidence (actual output before/after), full-suite count, confirmation
config.mjs was not touched, and anything you found that the brief got wrong or that looks broken nearby (do not
fix it — report it).
```

### K4 · Przegląd fazy przez recenzenta Opus (przed i po)

**Przed fazą** (`Agent` Opus, `name: review-pre-<faza>`): dostaje listę biletów fazy + polecenie: „przeczytaj każdy
bilet i kod, który wymienia; dla każdego odpowiedz: (1) czy kotwice istnieją, (2) czy mechanizm jest wykonalny bez
łamania zasad J (mine nietknięte, kod to kod, brak nowych stałych decyzyjnych), (3) czy test red→green faktycznie
odróżnia stan przed/po, (4) czego brakuje w briefie; nie zmieniaj kodu; zwróć listę poprawek do planu". Orkiestrator
nanosi poprawki do biletów PRZED pierwszym briefem.

**Po fazie** (`review-post-<faza>`): „przeczytaj diff całej fazy (`git diff` + nowe pliki); sprawdź: reguła głosów w
każdym nowym ujściu, jeden renderer `missing:` (żadnej drugiej linii „also touch"), rezyduum w komentarzach `CFG`,
bajt-identyczność tam, gdzie bilet obiecał (np. `induceRoles` po J4.1, `spectrum`≡`explain`), brak wycieków nazw
prywatnych repozytoriów w plikach commitowalnych, brak hardkodów starej wersji w testach; zwróć listę usterek". Każda
usterka → bilet `J<faza>.<n>` i naprawa przed bumpem fazy.

### K5 · Bramka J2.3 — protokół

1. Sonnet wdraża harness (`selftest --how`) wg J2.3 i testuje na fixture.
2. Recenzent Opus (`gate-J2.3`): uruchamia `selftest --how --last 100` na Johnie Briefa (ścieżka od utrzymującego;
   NAZWA repozytorium nie trafia do planu — tylko liczby) i na ≥ 6 repozytoriach korpusu z `docs/validation.md`
   sklonowanych do `/tmp` (nie do repo); sprawdza baseline grep na 3 przypadkach ręcznie (czy grep naprawdę
   dostaje te same tokeny); porównuje z kryterium zapisanym w J2.3; pisze do planu akapit „Bramka J2.3 — wynik"
   z tabelą P/R per repo i werdyktem **dalej / stop**.
3. Werdykt „stop" = fazy 3–5 pozostają `NIEZROBIONE` z adnotacją „wstrzymane po bramce J2.3"; orkiestrator kończy
   partię na fazie 2 i pyta utrzymującego. Werdykt „dalej" = faza 3.

### K6 · Czego orkiestrator nie robi

Nie pisze kodu produkcyjnego sam (poza jednoliniową literówką z adnotacją). Nie odpala dwóch wykonawców naraz na
tym samym drzewie. Nie akceptuje raportu bez własnego red. Nie commituje. Nie zmienia README. Nie ufa nazwom zdarzeń
hooków bez `claude-code-guide`. Nie zaokrągla: „N/N testów" z własnego uruchomienia, nie z raportu.

# Fala 1 — start 2026-09-01
- 2026-09-01 dyrektor jako tymczasowy hub; baza 509e786; landings + instrumenty A/B/D/F + pomiary 054/047 + badania G/where
- 2026-09-01 049 first landed on stale base 601aa23 — merge aborted, bounced for rebase; five agents hit the stale-worktree ref; rule added: FIRST ACTION git merge main
- 2026-09-01 audit-claims.mjs had 4 literal NUL bytes (git saw binary) — replaced with \0 escapes, fadc886
- 2026-09-01 merged: 045 9064c23
- 2026-09-01 merged: 044 423119e
- 2026-09-01 merged: 016 8d9a1a7
- 2026-09-01 merged: instr/D 5470fe4
- 2026-09-01 merged: instr/B 35f054b
- 2026-09-01 merged: 049 17f5e08
- 2026-09-01 merged: instr/A 7375fa1
- 2026-09-01 merged: research/G-catalog cc66d8e
- 2026-09-01 merged: skill/director-tools-2 7ac3822
- 2026-09-01 merged: research/where-lever a9134a1
- 2026-09-01 merged: format/prettier 88be159

# Fala 1 — close 2026-09-01
versions: EXTR_V g30→g31 (c2200e1)
suite: 1958
note: fala 1 zamknięta: 4 landings + instrumenty A/B/D + katalog G + badanie where + skill director z narzędziami + przeformatowanie silnika (88be159); instr/F wciąż w locie (Symfony), scali go lead

# Fala 2 — start 2026-09-01
- 2026-09-01 honesty (D/A/E fixes) interleaved with reach (wave-3 #1/#2); HIGH severity first, top wave-3 leverage items included
- 2026-09-01 merged: 063 15fdce2
- 2026-09-01 merged: 067 2bd2d57
- 2026-09-01 merged: 047 f6e4ec5
- 2026-09-01 merged: 054a 98844c1
- 2026-09-01 merged: 054b 7d21fb7
- 2026-09-01 merged: 055 9ee6e21
- 2026-09-01 merged: 041 343aad0
- 2026-09-01 merged: 057 b008c7d
- 2026-09-01 audit: 063 zgodny — diff scoped to cochangeData + completeness.md + test + log; tests 0/4 red on parent 6f569e7 (isolated worktree), 4/4 green on main; gate = max(confAB,confBA) reusing cochangePartners' existing 1/3 single-file floor (no new constant); reported denominator is the side that cleared the bar; ticket status+log set. Lead's batch 1 (8 tickets) verified on this sample.
- 2026-09-02 merged: 059 b4dfbe5e8319629a68798062455b6c9fa8bc6fc7
- 2026-09-02 merged: 062 2ed263a
- 2026-09-02 merged: 068 51cc429
- 2026-09-02 merged: 069 8d5db98
- 2026-09-02 merged: 046 24dc14f
- 2026-09-02 merged: 053 64ebca6
- 2026-09-02 merged: 064 b1394f8
- 2026-09-02 merged: 065 574bafa
- 2026-09-02 audit: 062 zgodny — qualified-heritage.test 0/11 red on parent b478847 (isolated worktree) → 11/11 green on main; audit-claims.test 12/1 → 13/0; predicate derived from node-types.json field shape (two-part chain, one purely name-shaped field; fieldless grammars via children list) — 0 language names in added code, 7 only in the explanatory comment; ticket status+log set. Second sample of wave 2 (16 merges) — lead's batch quality holds.
- 2026-09-02 merged: 061 230cf0a
- 2026-09-02 merged: 048 76cc470e78c0983814a9ca8a787842f3e9ccad9e
- 2026-09-02 merged: 070 194ce2e
- 2026-09-02 merged: 042 4179121
- 2026-09-02 merged: 052 941e721da7f73a8a7cab1b66231311078987eda1
- 2026-09-02 merged: 056 7f72a9e
- 2026-09-02 merged: 066 d9e0eaf
- 2026-09-02 merged: 058 7a262c4
- 2026-09-02 merged: 060 c1808a5
- 2026-09-02 merged: instr/C cross-check 9485001
- 2026-09-02 merged: 050 1080ad7
- 2026-09-02 audit: 060 zgodny — engine diff = 2 lines in extractScopes (descend into ERROR node's children, extract nothing from the ERROR itself); scala-error-region-salvage.test 9/4 on parent 4d84b66 (isolated worktree) → 13/0 on main; validation.md Scala coverage note updated; hasError unchanged so 053's caveat still fires. Third sample of wave 2 (batch 3, 11 merges).
- 2026-09-02 merged: 071 d494386bb42bd2f5e857233b29395325f4917500
- 2026-09-02 merged: 072 c146442
- 2026-09-02 merged: 075 a7fd8e9
- 2026-09-02 merged: 076 dee0d99
- 2026-09-02 merged: 077 73d78dcc4b2c7540f113c833cec3459af18a8453
- 2026-09-02 merged: 073 25971e4
- 2026-09-02 0.4.0 landed: 113ef97 (ENGINE 0.4.0, EXTR_V g32, HIST_V h11, MODEL_V m24, validation.md re-anchored) + c847bb0 (three plugin manifests; a blind sed corruption of dependency versions caught and reverted). Suite 2115/2115.
- 2026-09-02 merged: 074 5bce5ef
- 2026-09-02 merged: 078 0a67b89

# Fala 2 — close 2026-09-02
suite: 2122
note: 36 tickets merged (queue items 3-37, plus follow-ups 075/076/077/078 discovered mid-wave): all 5 disclosure-fixtures todos now real green (041/046/053/057 + the original 4 from wave 1's close); wave-3 reach items 1-5 all shipped (completeness max-directional+ambient split, adoption fixes, used-by names, tested-by, how liveness+map --json parity); wave-4 #1 (grain obligation command) shipped and measured (precision clears 0.80 bar, coverage 0.048 below the 0.08 target, disclosed honestly per director ruling); both whereEval instrument bugs fixed (card-width gaming, own-commit leak — the latter found no shipped bug, landed as prospective harness guard); PHP PSR-4 cross-component resolution and #[ attribute sigil; Scala object/type classification plus 5 more grammar gaps; catch/finally fabricated-name and double-count fixes; two Opus measurements shipped honest dispositions (042 per-file vote confirmed correct then extended per director approval, 052's siblings line deleted at 0.364 measured precision). Suite 1958->2122, 0 fail, 0 todo throughout. Version bump (ENGINE_VERSION 0.4.0, EXTR_V g32, HIST_V h11, MODEL_V m24) already applied by the director mid-wave to unblock 073/074's dependent work.

# Fala 3 — start 2026-09-02
- 2026-09-02 opened by director after wave-2 close; items (a)(b) independent of the trial; the rest decided by research/trial-0.4.0
- 2026-09-02 merged: where-named 6f50d9f

# Fala 3 — start 2026-09-02
- 2026-09-02 two items independent of research/trial-0.4.0's verdict: package-json-0.4.0 (dispatched now), corpus-validation-run (queued behind instr/F-2's Symfony ladder completion)
- 2026-09-02 merged: package-json-0.4.0 9d15850
- 2026-09-02 trial-0.4.0 merged (0e27c6c): adoption fixed (1→11 calls), reach unchanged (+0.7 pre-write, 0 answer-changed-diff in 13 runs). Wave 4 = reach: tickets 079, 080, 081 queued at top. Adoption spending stops.
- 2026-09-02 merged: instr/F-2 corpus-ladder 2a13242
- 2026-09-02 merged: 079 6160bc5
- 2026-09-02 merged: 081 c371383
- 2026-09-02 audit: where-named zgodny — 94a8bc9: core.mjs +55 in whereCmd scoring; where-named-stratum.test 2/4 red on parent 3535289 (isolated worktree) → 6/0 on main; weak-match-signals expectation updated 2/1→3/0 (intended); the flat +0.25 directory bonus DELETED and replaced by the earned coverage share; the 0.5 in 'cover >= 0.5' pre-existed on the deleted line (majority rule, not a new constant) — 'one constant deleted, none added' holds; research doc committed with the 12-repo before/after. Wave-3 sample.
- 2026-09-02 merged: 082 9c498b3
- 2026-09-02 merged: 083 2d1fc05
- 2026-09-02 merged: 084 f231b26
- 2026-09-02 merged: 086 8efac06
- 2026-09-02 merged: 085 c439ae7
- 2026-09-02 merged: 088 1f2efa9
- 2026-09-02 merged: 080 aa45602
- 2026-09-02 merged: 087 84f0188
