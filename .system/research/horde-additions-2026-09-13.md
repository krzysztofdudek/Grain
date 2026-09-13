# Co dołożyć do Hordy: los biletu, koszt w pieniądzach, straż dowodów, sygnał rozmiaru

Opis od zera, 2026-09-13. Cztery dodatki do Hordy 6.0.0, wyhodowane z wzorca, którym powstała wersja 6.0.0:
główny agent pracuje z człowiekiem, issues leżą w katalogu jako backlog, subagenty biorą równolegle to, co
niezależne, szeregowo to, co zależne, a agent zakłada issue albo idzie do człowieka, zależnie od tego, co znalazł.
Do tego twarda bramka, którą już masz: jeden skrypt na CI, w pre-commit i w pre-push.

Cel dodatków w jednym zdaniu: po jednej wersji zrobionej tym wzorcem mieć liczby, których dziś nie ma, koszt na
wynik, odsetek zwrotów, ile człowieka było potrzebne, i mieć zasady dowodowe pilnowane przez skrypt, nie przez
to, że agent przeczytał zasadę. Żadnych nowych warstw, żadnego odcisku, żadnej stałej bez pochodzenia.

## 1. Stan wyjściowy

Horde ma dziś:

- **Bilet** z polami: węzeł, klasa modelu, pliki (lista wiążąca), dowody, baza cofnięcia albo komenda mutacji,
  status, gałąź. Sekcje: co, dlaczego, zakres, akceptacja jako dowody, notatki dla robotnika.
- **Kolejkę** w pliku, ze stanami; `tick` godzi to, co wróciło, ląduje to, co gotowe, drukuje listę do rozdania.
- **Bramkę lądowania** `land.mjs`: dwie straże przed punktami (prawa: gałąź nie może osłabić reguł, którymi jest
  sądzona; konfliktu: reguła i kod, który ona sądzi, nie lądują razem) i dziewięć punktów: świeżość bazy, osąd
  reguł prozą, zakres plików, test czerwono-zielony, bramka repozytorium, graf, mapowanie, dziennik, język w
  tekstach grafu. Punkt piąty to `config.gates.<poziom>`: dowolna komenda, uruchomiona na świeżym, odłączonym
  drzewie gałęzi.
- **Koszt** jako liczba przebiegów razy waga klasy modelu, jeden wpis na uruchomionego agenta; limit w karcie
  misji jako tekst.
- **Zamknięcie fali** z pokryciem katalogu dowodów i wskaźnikiem jakości z Yggdrasila; retrospektywa na końcu misji.
- **Pytania** do klienta czterech rodzajów: stop, utknięcie, obniżenie reguły, karta.

Twoja bramka (CI, pre-commit, pre-push) i piąty punkt Hordy to ten sam skrypt. Nic tu nie dublujemy: Horde
uruchamia go czwarty raz, na czystym drzewie, i tyle.

## 2. Cztery dodatki

### A. Los biletu

Dziś bilet kończy się na „wylądował". Nikt nie zapisuje, co stało się z tym potem. Dodatek: każdy wylądowany bilet
dostaje z czasem jedną z trzech wartości w polu **Fate:** cicho, zwrot, incydent.

Kto to pisze i kiedy:

- **Zwrot.** Bilet naprawczy dostaje pole **Fixes:** z numerem biletu, który psuje się albo nie dowiózł. Zakładający
  go agent musi to pole wypełnić albo wpisać „none" z powodem; `tk.mjs new` bez tego pola odmawia dla biletów
  rodzaju „fix". W chwili założenia skrypt `fate.mjs` oznacza wskazany bilet jako zwrot i dopisuje odnośnik.
- **Incydent.** Incydent Yggdrasila, który nazywa bilet, oznacza ten bilet jako incydent. Incydent zapisuje człowiek,
  nigdy maszyna, jak dziś.
- **Cicho.** Przy zamknięciu fali albo wersji każdy wylądowany bilet bez zwrotu i bez incydentu dostaje „cicho" z
  datą. Późniejszy zwrot nadpisuje „cicho" na „zwrot"; historia zostaje w pliku `fate.json`.

Po co: to jedyna etykieta, która widzi, czy dowody chroniły. Laboratorium odcisku pokazało, że z kodu i historii
commitów nie da się jej wyczytać; z katalogu biletów da się, jeśli zaczniesz ją zapisywać. Bez niej pętla
samouczenia domu nie ma na czym się uczyć.

### B. Koszt w pieniądzach i człowiek przy bilecie

Dziś koszt to przebiegi razy umowna waga. Dodatek: przy każdym powrocie subagenta runner, czyli Ty albo Twoja sesja,
dopisuje `cost.mjs add --ticket NNN --class X --model M --usd Y --tokens T`. Kwota i model pochodzą z odpowiedzi
hosta, jeśli host je podaje; jeśli nie, zostaje sama waga klasy, a pole kwoty jest puste, nigdy zgadywane.

Drugi licznik, ważniejszy: **człowiek przy bilecie.** Każde pytanie z `ask.mjs` już ma bilet i czas. Dodatek
zapisuje czas odpowiedzi i liczy dla biletu: ile pytań poszło do człowieka, ile czasu bilet czekał na odpowiedź.
Bilet, który wylądował bez pytania, dostaje zero. To jest surowiec do jedynej liczby, która mówi, jak daleko jest
do czarnej skrzynki: udział biletów dowiezionych bez człowieka.

### C. Straż dowodów w bramce

Twoja praktyka: pełna suita e2e w środowisku syntetycznym, każdy test sparowany jeden do jednego ze scenariuszem w
markdown, zmiana testu odpala recenzenta Yggdrasila, testu nigdy nie osłabiamy, chyba że to intencja zleceniodawcy.
Dziś tego pilnuje reguła prozą i agent, który ją przeczytał. Dodatek: trzecia straż w `land.mjs`, obok straży prawa
i konfliktu, dwudrzewna, licząca, nie uruchamiająca:

- porównuje drzewo bazy z drzewem gałęzi w trzech liczbach: pliki testów, linie asercji (wzorce per język, w
  konfiguracji), scenariusze;
- odmawia lądowania, gdy którakolwiek liczba spadła, chyba że `decisions.md` niesie odpowiedź klienta na pytanie
  rodzaju „obniżenie" nazywające ten test albo scenariusz, dokładnie tak, jak dziś działa straż prawa;
- przy włączonym `evidence.scenarios` sprawdza parowanie: nowy test bez scenariusza i scenariusz bez testu to odmowa,
  wg konwencji nazw z konfiguracji;
- dopisuje do wyniku bramki, co gałąź dołożyła: ile testów, ile asercji, ile scenariuszy.

Ta straż jest wyjęta do osobnego skryptu `evidence-guard.mjs <baza> <gałąź>`, żeby ten sam kod biegł w pre-push i
na CI jako sprawdzenie na pull request. Pre-commit go nie uruchamia, bo bez bazy nie ma z czym porównać. Jedno
źródło, trzy miejsca. Twój skrypt CI zostaje punktem piątym, bez zmian.

Pomiar daje tej straży słabe, ale zgodne wsparcie: usuwanie asercji zwiększa szansę późniejszej poprawki
(iloraz szans 1,15 do 1,39 po korekcie rozmiaru). Reszta jej racji jest decyzją, nie pomiarem, i tak ma być.

### D. Sygnał rozmiaru

Jedyna rzecz z całego laboratorium, która mierzalnie zmniejsza liczbę późniejszych poprawek: mniejsza zmiana. Sama
liczba dodanych linii jest lepszym wskaźnikiem ryzyka niż wszystko inne. Dodatek w dwóch miejscach, oba miękkie:

- **Przy krojeniu.** Architekt widzi przy każdym bilecie spodziewany rozmiar i normę węzła: medianę linii dodanych
  w zmianach, które ten węzeł lądował w historii. Bilet powyżej normy wraca do konsultanta z pytaniem o cięcie.
- **Przy lądowaniu.** Jedna linia informacyjna obok dziewięciu punktów: „zmiana X linii, węzeł zwykle Y". Odmowa
  tylko, gdy `config.size.limit` istnieje i ma pole `origin` z wartością klient albo dom. Bez pochodzenia nie ma
  limitu.

## 3. Jak to działa w ciągu jednego dnia pracy

1. Ty albo agent zakładacie bilet: `tk.mjs new`. Pola jak dziś, do tego puste **Fate:** i, dla biletu
   naprawczego, wymagane **Fixes:**.
2. Rozdanie. Ty jesteś runnerem: czytasz listę z `tick`, uruchamiasz subagentów, równolegle to, co niezależne. Po
   każdym powrocie `cost.mjs add` z tym, co host podał. Pytania agentów idą przez `ask.mjs` jak dziś; Twoja odpowiedź
   zamyka pytanie i zapisuje czas.
3. Lądowanie. `land.mjs`: straż prawa, straż dowodów, straż konfliktu; potem dziewięć punktów, z Twoim skryptem CI
   jako piątym; do tego linia rozmiaru. Zielone: gałąź scala się sama. Czerwone: nazwany jeden punkt.
4. Po lądowaniu nic. Bilet czeka na los.
5. Wraca zwrot: nowy bilet z **Fixes:** NNN. Bilet NNN dostaje los „zwrot". Incydent: to samo przez Yggdrasila.
6. Zamknięcie fali albo wersji. `wave.mjs close` dokłada tabelę: bilet, węzeł, klasa, rozmiar, koszt w pieniądzach i
   w wadze, pytania do człowieka i czas czekania, los. Trzy liczby na górze: koszt na wylądowany bilet, odsetek
   zwrotów, udział biletów bez człowieka. Bilety bez zwrotu dostają „cicho".

## 4. Co z tego wychodzi po jednej wersji

Po wersji robionej tym wzorcem, kilkadziesiąt biletów, masz pierwsze prawdziwe liczby domu: ile kosztuje wynik,
ile z tego wraca, gdzie człowiek był naprawdę potrzebny. I pierwsze etykiety do pętli samouczenia: rozmiar wobec
zwrotu, klasa modelu wobec zwrotu, pytania do człowieka wobec zwrotu, wszystko z księgi domu, nie z kodu. Dopiero
te liczby mówią, którą następną warstwę z modelu domu warto stawiać, i czy w ogóle.

## 5. Czego nie dokładamy

- Bramki pokrycia testami. Pomiar na historii nie potrafi jej uzasadnić; zostaje decyzją polityki, mierzoną potem
  losem biletów.
- Odcisku cechy w jakiejkolwiek postaci. Zamknięty liczbami.
- Automatycznych incydentów. Incydent podpisuje człowiek.
- Limitów bez pochodzenia. Każdy próg ma pole `origin`.
- Nowego runnera, nowego repozytorium, nowych ról. Runnerem jesteś Ty, dopóki liczby nie powiedzą, że można inaczej.

## 6. Zmiany w Hordzie, plik po pliku

| plik | zmiana |
| --- | --- |
| `templates/ticket.md` | pola **Fate:**, **Fixes:**, **Size:** |
| `scripts/tk.mjs` | nowe pola; odmowa biletu „fix" bez **Fixes:** |
| `scripts/fate.mjs` (nowy) | oznaczanie losu: zwrot z **Fixes:**, incydent z Yggdrasila, „cicho" przy zamknięciu; `fate.json` |
| `scripts/cost.mjs` | `add` z kwotą, modelem, tokenami; człowiek przy bilecie z czasów pytań i odpowiedzi |
| `scripts/ask.mjs` | czas odpowiedzi zapisany przy pytaniu |
| `scripts/evidence-guard.mjs` (nowy) | dwudrzewna straż dowodów, wywoływana z `land.mjs`, pre-push i CI |
| `scripts/land.mjs` | trzecia straż; linia rozmiaru; norma węzła z historii |
| `scripts/refine.mjs` | rozmiar i norma węzła przy każdym bilecie w orzeczeniu architekta |
| `scripts/wave.mjs` | tabela losów i kosztów przy zamknięciu; trzy liczby na górze |
| `reference/model.md` | opis dodatków; poprawka zdania o tym, że pętla nic nie uruchamia |
| konfiguracja | `evidence.scenarios`, `evidence.assertPatterns`, `evidence.pairing`, `size.limit{value, origin}`, `cost.currency` |
| `CHANGELOG.md` | wpis dla adoptera, w jego języku |

Każdy z czterech dodatków da się wdrożyć osobno i osobno wyłączyć w konfiguracji. Kolejność, jeśli po jednym:
najpierw los biletu, bo bez etykiety reszta nie ma czego mierzyć; potem straż dowodów, bo ogrywa Twoją praktykę
mechanicznie; potem koszt i człowiek; sygnał rozmiaru na końcu, bo jest najtańszy.
