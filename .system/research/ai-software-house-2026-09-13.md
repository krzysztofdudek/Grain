# AI Software House: projekt kompletnego systemu autonomicznego

**Memo projektowe, 2026-09-13, wersja druga po recenzji adwersarialnej.** Punkt wyjścia: rodzina Yggdrasila 6.0.0 (Yggdrasil, Grain, Horde, Ratatoskr, Urd, Researcher), memo Counsel 1–3 z 5 września, próba generalna fabryki, przegrana pętla prawa, misja „jeden zgrany system”, trzy notatki z tej sesji: klient i czarna skrzynka, „nie psuje się” zamiast „działa”, odcisk cechy. Założenie: agenci mają dostęp do sieci. Cel: **AI Software House**. Człowiek jest klientem. Maszyna sama rozwija i ulepsza siebie oraz oprogramowanie zlecone.

Wersja pierwsza przeszła przez dwie recenzje adwersarialne na modelu Opus: jedną szukającą luk i sprzeczności z rozstrzygnięciami rodziny, drugą łamiącą dziesięć eksperymentów myślowych po zainstalowaniu poprawek. Ta wersja włącza obie. Wszystkie liczby z pomiarów rodziny pochodzą sprzed 6.0.0 i są tak oznaczone. Nazwy są robocze.

---

## 0. Streszczenie

1. **Rola człowieka to trzy rzeczy plus dwie władze stałe.** Cel, granice, świadectwo. Do tego prawo do arbitrażu między klientami, którego nie da się sklasyfikować z góry, i prawo maszyny do odmowy, które musi mieć wiersz w tabeli władz. Odpowiedzialność prawna zostaje po stronie osób i osoby prawnej; podpis jest granicą odpowiedzialności tylko wtedy, gdy jest prawdziwy i gdy ślad, który go zapisuje, nie jest pisalny przez strony sporu.
2. **Polityka jest granicą, która odpowiada z góry na klasę pytań, i jest furtką.** Bez polityk dom bez nadzoru stoi. Z politykami bez obwarowań autonomia wraca tylnymi drzwiami. Obwarowania: polityka nigdy nie obniża prawa, nigdy nie zastępuje „tak” dla nieodwracalnego, o przynależności do klasy decyduje skrypt, nie osąd maszyny, każde zastosowanie jest zapisane i zgłoszone, milczenie nigdy nie jest zgodą: po upływie terminu misja jest parkowana, a dzierżawa zwalniana.
3. **Progi mają pochodzenie, nie podpis.** Zgodnie z rozstrzygnięciem `layers-compatible-no-user-thresholds`: liczba jest wyprowadzana z historii produktu, z norm domeny znalezionych w sieci albo ze słów klienta, z ujawnioną metodą; klient ją widzi i może zawetować; nigdy nie jest o nią pytany. Parametr produktu w słowach klienta, „zwrot w czternaście dni”, nie jest progiem.
4. **Incydent nigdy nie jest automatyczny.** Sondy dają obserwacje. Cofnięcie wdrożenia jest reakcją na obserwację. Incydent istnieje tylko z podpisem człowieka. To zgodne z całą rodziną: „jedyny sygnał spoza grafu”, „nigdy nie fabrykuj incydentu”, nie-cel Counsel 3.
5. **Podpis dziś nie istnieje.** Słowo klienta to napis wpisany przez agenta w ignorowanym pliku, a bramka czyta identyfikator pytania, nie tożsamość. To unieważnia całą tabelę władz, dopóki podpis nie jest weryfikowany w miejscu użycia: przy dzierżawie, lądowaniu, obniżeniu.
6. **Stan misji dziś ginie z maszyną.** `.horde/` jest ignorowany w całości, archiwum leży wewnątrz, `.lab/` jest nieśledzony, pamięć werdyktów jest per drzewo robocze. Łańcuch opieki nad linią rozwiązuje się do identyfikatorów, które po utracie kopii roboczej nie wskazują na nic. Dom wymaga trwałego stanu misji i zapisu opieki w commitowanym repozytorium przy każdym lądowaniu.
7. **Odwracalność jest zmienną nadrzędną.** Klasa odwracalności na bilecie, kroku wdrożenia i zmianie maszyny; wymagania bramki rosną z klasą. Rodzina ma słownik, nie ma mechaniki.
8. **Maszyna jest oprogramowaniem.** Wersja przypięta per misja, nie per produkt; podnoszona na granicy misji; stempel wersji maszyny na każdym lądowaniu; zmiany własnych repozytoriów maszyny lądują pod bramką poprzedniego wydania.
9. **Nie ma nowego repozytorium.** Rozstrzygnięcie użytkownika brzmi wprost: „factory to rodzina działająca razem, nie nowe repo”. Wszystkie klocki lądują addytywnie w istniejących repozytoriach. Jedyny kandydat na osobne repo w przyszłości to warstwa świata: wdrożenie, obserwacja, harmonogram wielu misji, i to dopiero, gdy będą miały własne liczby.
10. **Dwa założenia wersji pierwszej były fałszywe** i zostały usunięte: że środek pętli działa, więc brakuje tylko końców, oraz że praktyka plus konsekwencja maszyny dają prawo. Środek jest zmierzony kawałkami i każdy szew przy pierwszym kontakcie pękł. Prawo bierze się z decyzji i incydentów, nigdy z większości.
11. **Jesteśmy blisko w projekcie, nie w dowodach.** Zero prawdziwych misji Hordy na obcym produkcie, brak bazy kosztu, brak miernika pieniędzy, pusty rejestr incydentów, zero wdrożeń zrobionych przez maszynę. Kolejność budowy jest szew po szwie, z prawdziwą misją na każdy szew.
12. **Warstwa dowodów jest rejestrem scenariuszy.** Pełna suita e2e w środowisku w pełni syntetycznym, stuby dostawców według ich dokumentacji, stand-iny dla tego, co da się postawić, i plik scenariusza w języku człowieka sparowany 1:1 z każdym testem, sprawdzany przez sędziego Yggdrasila przy każdej zmianie testu. Rodzina stawia ten kształt na pierwszym miejscu przy rozpoznawaniu dowodów, a pakiet obietnic ma jego cztery reguły. Rejestr robi realnym intake, straż „dowody nigdy nie słabną”, incydent bez triażu i model flag, a wierność intencji, dotąd niemierzona, staje się liczbą. §2.10 i §9.
13. **Czterdzieści symulacji, żadna nie zamyka się do końca.** Osiem niezależnych przebiegów po pięć sytuacji, każda złamana dwa razy: 22 luki modelu, 11 luk rzeczywistości, 7 nieredukowalnych. Model zamyka niewidzialność: fakt staje się zapisany, czerwony, z właścicielem. Skutek zamyka człowiek albo pieniądz. Cztery zasady przekrojowe i pięć zmian, które zamykają najwięcej, §10.

---

## 1. Rola człowieka

### 1.1 Trzy role, z pomiarów rodziny

| Co człowiek daje | Dlaczego maszyna tego nie wyprowadzi | Źródło |
|---|---|---|
| wymaganie w swoich słowach | „wymagania pozostają jedynym wejściem od człowieka” | `layers-compatible-no-user-thresholds` |
| zakaz, „nigdy” | żadna praktyka nie zawiera „nigdy”; 2 z 20 reguł ręcznych odtworzonych z kopania, 0 z 20 przy pokryciu plików | `law-loop-b1-not-doing-it-with-numbers` |
| obniżenie prawa | zapadka: w górę na dowodach, w dół tylko klient | `quality-always-authorised` |
| incydent | jedyny sygnał spoza grafu, człowiek zapisuje realne chybienie | Yggdrasil, rejestr incydentów |
| kompromis, którego reguła nie powie | kupka „niewyrażalne” retrospektywy | Horde, retro |
| zgoda na nieodwracalne | jedno jasne „tak” na tę instancję, z nazwaną stratą | Ratatoskr |
| weto wobec liczby | próg ma pochodzenie, klient może go odrzucić, nie jest o niego pytany | `layers-compatible-no-user-thresholds` |

**Cel.** Co ma się stać prawdą, dla kogo, dlaczego. Uporządkowanie wartości. Kryteria akceptacji w słowach produktu, przetłumaczone na wiersze dowodów i odczytane z powrotem, aż klient powie „tak”. Poziom wierności: prototyp czy wersja docelowa.

**Granice.** Nie-cele. Zakazy. Weto wobec wyprowadzonych progów. Budżet w pieniądzach. Apetyt na ryzyko. Pierwszeństwo między własnymi wymaganiami. Zgoda na kroki nieodwracalne. Poufność. Kroki ludzkie wymagane prawem. Polityki, §1.3. Zgoda na wdrażanie, która jest obniżeniem rodzinnego „nigdy nie pushuj” i dlatego należy wyłącznie do klienta terytorium, §2.8.

**Świadectwo.** Akceptacja: „to jest to, co miałem na myśli”. Incydent: „to się zepsuło”, w słowach produktu, bez przyczyny; przyczynę proponuje maszyna, człowiek podpisuje fakt. Smak: jedna linia do dziennika komponentu. Niewyrażalne.

Cel i granice się ustala. Świadectwo się obserwuje. Cel zamrożony w chwili zero jest celem, który maszyna zoptymalizuje w Goodharta, więc świadectwo jest trzecią rolą, nie odmianą pierwszej.

### 1.2 Dwie władze stałe, których „cel i granice” nie obejmują

**Arbitraż.** Konflikty między klientami i między wymaganiami tego samego klienta bywają klasyfikowalne z góry i wtedy polityka pierwszeństwa je rozstrzyga. Ciekawe konflikty nie są. Te idą do człowieka i nie da się tego zaprojektować inaczej: maszyna wykrywa, przedstawia oba wiersze w słowach produktu, człowiek rozstrzyga.

**Odmowa.** Najcenniejszy akt w prawdziwym domu oprogramowania to odmowa wymagania. Horde już to rezerwuje: „twierdzenie, że coś jest granicą i nie powinno być zrobione” wraca do klienta. Dom musi mieć wiersz w tabeli władz: maszyna odmawia, gdy wymaganie jest niezgodne z prawem, szkodliwe, poza kompetencją domu albo sprzeczne z „nigdy” podpisanym przez inną stronę. Odmowa jest zapisana i zgłoszona strażnikowi.

### 1.3 Polityki i ich obwarowania

Runner zewnętrzny Hordy działa „kosztem tego, że nikt nie odpowie na pytanie”. Jedyne wyjście, które nie łamie „pytaj, nie zgaduj”, to odpowiedź podpisana z góry na klasę pytań. Recenzja nazwała to furtką i ma rację: podpisana klasa, do której maszyna sama klasyfikuje instancje i z której sama korzysta, to obejście zapadki. Stąd obwarowania:

| Obwarowanie | Treść |
|---|---|
| nigdy prawo | polityka nie obniża statusu reguły, nie wycisza, nie przesuwa daty przeglądu |
| nigdy nieodwracalne | krok klasy Nieodwracalne ma zawsze osobne „tak” na tę instancję z nazwaną stratą |
| przynależność skryptem | czy zdarzenie należy do klasy, decyduje sprawdzenie deterministyczne, nie osąd maszyny; „poprawka zależności z identyfikatorem doradztwa bezpieczeństwa” jest klasą, „drobna zmiana” nie jest |
| zapis i raport | każde zastosowanie polityki jest zapisane w księdze władz i zgłoszone klientowi w jego rytmie |
| termin i odwołalność | polityka ma datę przeglądu i jest odwoływalna jednym słowem |
| milczenie nie jest zgodą | brak odpowiedzi w terminie parkuje misję na granicy bezpiecznego kroku, zwalnia dzierżawy terytorium poza tymi, na których stoi rozpoczęta sekwencja nieodwracalna, informuje klienta; nigdy nie uruchamia zalecenia maszyny |
| język produktu | polityki techniczne, źródła zależności, wiek wersji, weryfikacja podpisów pakietów, nie są zadawane klientom; to domyślne polityki domu ustawiane przez strażnika; klient może je tylko zawężać w słowach produktu: „dane moich klientów nie opuszczają Unii” |

Polityka eksperymentalna w słowach produktu: „mój produkt dostaje nasze ulepszenia jako pierwszy, przed innymi klientami, z automatycznym cofnięciem, jeśli cokolwiek się pogorszy”. Na to osoba nietechniczna umie odpowiedzieć. Na „kohortę kanarka wersji maszyny” nie.

### 1.4 Co maszyna robi, żeby cel, granice i świadectwo były tanie

- Wydobywa cel rozmową w języku produktu, jedna decyzja na raz, zalecenie nazwane na głos.
- Bada świat zanim zapyta i **proponuje** granice, nigdy ich nie wymyśla po cichu.
- Wyprowadza każdy próg z ujawnionym pochodzeniem; pyta tylko o nieredukowalne.
- Kompiluje intencję w obietnice, wiersze dowodów, przepływy i węzły.
- Zamienia świadectwo w incydent: klient podpisuje fakt, maszyna proponuje etykietę.
- Grupuje pytania w rytm klienta.
- Nigdy nie zadaje pytania wymagającego wiedzy inżynierskiej. Test Ratatoskra: czy osoba nietechniczna odpowie z codziennego rozumienia produktu.

### 1.5 Ludzie w systemie

**Klient terytorium**: jedna osoba na terytorium produktu, podpisana przy przyjęciu. Inni interesariusze są wnioskodawcami; ich wiersze wymagają kontrasygnaty klienta terytorium. Wiersze podpisane przez dwie strony są nieobniżalne bez obu.

**Strażnik konstytucji**: klient repozytoriów samej maszyny. Ustala gwiazdę polarną maszyny, listę władz niedelegowalnych, klasy kosztowe, podpisuje wymiany modeli i każdą zmianę tego, co maszyna twierdzi klientom.

**Zastępcy.** Rodzina zapisała ponad dziewięćdziesiąt rozstrzygnięć w sześć dni na jednym repozytorium bez jednego klienta. Dziesięciu klientów mnoży przepływy, których zapadka nie pozwala delegować. Strażnik musi mieć zastępców z klasami delegacji: zastępca może podpisywać obniżenia w nazwanym terytorium, nigdy zmian konstytucji ani wymiany modelu. Sukcesja jest zapisana w konstytucji, nie w głowie.

**Odpowiedzialność.** Osoba prawna, ubezpieczenie i ślad, którego żadna strona sporu nie może napisać. Pierwsze dwa leżą poza projektem i muszą istnieć. Trzeci jest w projekcie: podpisy uwierzytelnione, zapisy podpisane i commitowane, opieka nad linią w repozytorium, nie w ignorowanym katalogu.

---

## 2. System kompletny

### 2.1 Siedem płaszczyzn

| Płaszczyzna | Co trzyma | Kto posiada | Dziś |
|---|---|---|---|
| Konstytucja | gwiazda polarna maszyny, władze niedelegowalne, klasy kosztowe, bootstrap, sukcesja, prawo na repo maszyny, księga władz | strażnik | rozproszona: digest Yggdrasila, skill dyrektora, model Hordy |
| Intencja | obietnice ze statusem „planowane” jako wiersze wymagań, granice, polityki, podpisy, kolejka pytań, świadectwo | klienci przez Ratatoskra | karta misji, kanał czterech pytań, pakiet obietnic |
| Prawo | graf, reguły, drille, lock, incydenty, normy odcisku | maszyna w górę, klient w dół | Yggdrasil, Grain |
| Praca | misje, terytoria, bilety, robotnicy, bramka, retrospektywa | maszyna | Horde 6.0.0 |
| Świat | środowiska, wdrożenia, dane, sondy, zależności, sieć, regulacje | maszyna operuje, świat odpowiada | nic |
| Ekonomia | pieniądze na wynik, budżety, klasy modeli, ekspozycja | maszyna mierzy, klienci ustalają | koszt w przebiegach razy klasa, limit per misja niesprawdzany |
| Ja | repozytoria maszyny, briefy, skille, modele, ewaluacje, wersje | maszyna pod konstytucją | dyrektor Graina, Researcher, protokół wymiany modelu |

### 2.2 Siedem pętli

| Pętla | Przebieg | Stan dziś |
|---|---|---|
| L1 Dostawa | wymaganie, karta, cięcie, konsultacja, przegląd, „go”, tick, lądowanie, zamknięcie fali, done, wdrożenie, obserwacja | Horde do „done”; wdrożenie i obserwacja: brak |
| L2 Prawo | odmowy, powtarzające się odpowiedzi, incydenty; legislator; awans na dowodach; wycofanie martwych; budżet fałszywych blokad jako propozycje; podpis klienta na obniżeniach | jest bez triażu i bez propozycji partiami |
| L3 Wyrocznia | świadectwo klienta, obserwacje z sond, próbkowany audyt; rejestr incydentów z podpisem; przypadki drilli; retrodykcja | rejestr jest, bierny; przewód: brak |
| L4 Ekonomia | pieniądze per przebieg z odpowiedzi dostawcy; wybór klasy; budżety; baza | przebiegi razy wagi klas; miernik pieniędzy: brak |
| L5 Ja | repo maszyny jako terytoria; eksperymenty na miarach z zewnątrz; ewaluacje briefów; drabina zmian maszyny; wymiana modelu | dyrektor Graina; ewaluacje i drabina: brak |
| L6 Wiedza | badanie sieci z proweniencją; zdarzenia zależności; polityka źródeł domu; treść jako dane | brak poza wzorcem „prompt badawczy” |
| L7 Koncepcja | prototyp, świadectwo, trajektoria zadeklarowanych odcisków, wersja docelowa | poprawki karty; wierność: brak |

### 2.3 Władze

| Władza | Maszyna | Klient terytorium | Strażnik lub zastępca |
|---|---|---|---|
| podnieść prawo na dowodach | tak | | |
| obniżyć, wyciszyć, przesunąć datę przeglądu | nigdy | w swoim terytorium, z podpisem weryfikowanym przy użyciu | w repo maszyny |
| „go” | w ramach polityki o przynależności skryptem | tak | |
| budżet | wydaje w ramach; zatrzymuje się przed rozdaniem, gdy limit osiągnięty | ustala w pieniądzach | dla maszyny |
| próg | wyprowadza z pochodzeniem | weto | |
| „nigdy” | proponuje z badań | podpisuje | |
| pierwszeństwo | wykrywa konflikt | rozstrzyga | |
| odmowa wymagania | tak, zapisana | | powiadomiony |
| wdrożenie na produkcję | w ramach polityki wdrożeniowej, z kanarkiem | zgoda lub polityka; to obniżenie „nigdy nie pushuj” | |
| cofnięcie wdrożenia | zawsze, natychmiast, na obserwację | | |
| incydent | proponuje fakt i etykietę | podpisuje fakt | |
| eksperyment na produkcie klienta | tylko w podpisanej kohorcie, w słowach produktu | podpisuje | |
| zmiana własnych briefów i skilli | drabina; pod bramką poprzedniego wydania; cofnięcie tego, co nie awansowało | | obniżenie własnej dyscypliny |
| wymiana modelu | proponuje z testem parowanym | | podpisuje |
| zmiana tego, co maszyna twierdzi | nigdy sama | | tak |
| dostęp do sieci | tak, treść jako dane, z proweniencją | zawęża w słowach produktu | domyślne polityki źródeł |
| wyjście klienta | eksport wszystkiego, zwolnienie dzierżaw, usunięcie po stronie domu według retencji | żąda | |
| kod klienta A u klienta B; ręczna edycja locka; fabrykacja incydentu; wyciszenie bez podpisu | nigdy | nigdy | nigdy |

### 2.4 Stan: co musi być trwałe

| Zakres | Co | Dziś | Wymagane |
|---|---|---|---|
| per produkt | graf, reguły, lock, dzienniki, incydenty, decyzje doradcze | commitowane | bez zmian |
| per produkt | stan misji: kolejka, pytania, decyzje, koszt, handoff, archiwum | `.horde/` ignorowany w całości, archiwum wewnątrz | replikowany do trwałego magazynu domu albo na gałąź stanu; odtwarzalny po utracie maszyny |
| per produkt | opieka nad linią | trailery w git wskazują na identyfikatory w `.horde/` | zapis opieki commitowany przy lądowaniu: bilet, wiersze dowodów, skrót wyniku bramki, wersja maszyny; git notes na commicie scalającym albo commitowany katalog opieki |
| per produkt | obietnice ze statusem | pakiet `promises` | rozszerzony o wymaganie: „po czym poznasz”, „nigdy”, pochodzenie progu, klient terytorium, podpis |
| per klient | polityki, budżet w pieniądzach, kolejka pytań, konsola | brak | podpisane, commitowane |
| dom | księga władz, księga ekspozycji i pieniędzy, rejestr wersji maszyny, wyniki ewaluacji, wyniki wymian modeli, pamięć wiedzy z proweniencją, magazyn „niewyrażalnego”, konstytucja | brak | commitowane, z kopią |
| dom | konfiguracja wykonywalna: polecenia bramek, polecenie uruchamiania robotników | `.horde/config.json`, niepodpisane, wykonywane detached | podpisane i commitowane; zmiana w trakcie misji odmówiona |

Ekspozycja i pieniądze są faktami producenta: bramka lądowania pisze wynik do pliku i już dziś; ma dopisać koszt i zdarzenia do tego samego pliku, zanim usunie drzewo, w którym biegła. Strumień zdarzeń Yggdrasila zawiera tylko wywołania modelu, a lądowanie biegnie w odłączonym drzewie, które jest potem kasowane, więc „commitowany strumień zdarzeń” nie jest przełącznikiem konfiguracji i Counsel 3 nazwał go jedyną zmianą, która „walczy z kształtem”. Zapis kosztu po stronie lądowania jest alternatywą, która z kształtem nie walczy.

### 2.5 Jedno wymaganie od zdania do produkcji

1. Klient pisze zdanie. Ratatoskr odczytuje je z powrotem: co się zmieni, czego nie, kogo dotyczy, odwracalność, jak sprawdzić.
2. Intake zapisuje **scenariusz ze statusem „planowane”** w kształcie kroków: wymaganie, „po czym poznasz”, „nigdy”, klient terytorium, pierwszeństwo, wierność, podpis. Test do niego jeszcze nie istnieje; sędzia sprawdzi zgodność, gdy powstanie. To istniejący pakiet obietnic z dwiema nowymi sekcjami, nie nowy format. Konflikt z istniejącymi scenariuszami jest wykryty tu.
3. Wiedza: maszyna sprawdza świat i proponuje granice do podpisu; wyprowadza progi z pochodzeniem.
4. Harmonogram otwiera misję Hordy w budżecie klienta, z wersją maszyny przypiętą do misji. Karta z katalogiem dowodów, każdy wiersz z klasą dowodu.
5. Cięcie, konsultacja, przegląd architekta, ramka dla klienta. „Go” asynchroniczne albo polityka o przynależności skryptem.
6. Tick sprawdza limit pieniędzy przed rozdaniem. Robotnicy. Dziewięć punktów lądowania plus straż „dowody nigdy nie słabną” obok strażnika prawa, plus residuum odcisku jako sygnał uwagi, nigdy bramka.
7. Zamknięcie fali: pokrycie dowodów, indeks jakości, podniesione reguły, koszt w pieniądzach, zdatność do wdrożenia: trunk zielony i każda obietnica dotrzymana albo zaparkowana.
8. Done: katalog zielony, pełna bramka, raport, retrospektywa; wiersz, którego jedynym wypełnieniem jest ręczny napis, odmawia done.
9. Wdrożenie według klasy odwracalności i polityki: podgląd, staging, kanarek; sondy per obietnica; okno obserwacji; cofnięcie na obserwację.
10. Świadectwo: klient sprawdza według kroków w produkcie; „tak” albo „nie to”; obserwacje z sond i słowa klienta stają się incydentami dopiero z podpisem.
11. Konsola pokazuje: co wylądowało i jak sprawdzić, co kosztowało, co czeka na słowo, co się zepsuło i co z tym zrobiono, co polityki zrobiły w nocy.

### 2.6 „Gotowe” na każdym poziomie

| Poziom | Gotowe znaczy |
|---|---|
| bilet | dziewięć punktów; dowody nie osłabione; klasa odwracalności spełniona |
| fala | pokrycie dowodów bez luk; indeks jakości nie spadł; każda podniesiona reguła wypisana; trunk zdatny do wdrożenia |
| misja | każdy wiersz dowodów odtworzony przez wykonawcę swojej klasy, nie napisem; pełna bramka; raport w pieniądzach; retrospektywa; zapis opieki commitowany |
| wydanie produktu | bramka wdrożenia; kanarek; okno obserwacji bez naruszonej sondy; klient poinformowany |
| wydanie maszyny | ewaluacje behawioralne; retrodykcja nie gorsza; kanarek na podpisanej kohorcie; okno prospektywne; podniesione tylko na granicy misji |

### 2.7 Klasy dowodów, klasy odwracalności, wykonawcy

| Klasa dowodu | Co dowodzi | Wykonawca | Uwaga |
|---|---|---|---|
| test hermetyczny | nasz kod bez świata | bramka lądowania | |
| scenariusz e2e w środowisku syntetycznym | zachowanie całej aplikacji przy dostawcach zastąpionych stubami według ich dokumentacji i stand-inami dla tego, co da się postawić | bramka lądowania | klasa domyślna domu; każdy scenariusz sparowany 1:1 z plikiem w języku człowieka, §2.10 |
| stub nagrany z prawdziwego dostawcy | że stub mówi to, co dostawca, nie to, co jego dokumentacja | straż, z poświadczeniami | uzupełnienie stubu z dokumentacji, nie zamiennik |
| test odwrócony lub mutacja | test umie być czerwony | bramka | |
| scenariusz, film, zrzut | zachowanie widoczne | robotnik, sprawdzone przez bramkę | |
| charakteryzacja | co kod robi dziś | robotnik, brownfield | |
| próba danych | migracja na kopii produkcyjnego kształtu | straż, poza limitem czasu bramki, wynik jako plik ze skrótem | bramka nie ma bazy danych ani czasu; próba biegnie w straży, `done` weryfikuje plik |
| próba obciążeniowa | gorąca ścieżka pod ruchem | straż | jak wyżej |
| sonda produkcyjna | obietnica trzyma się w działaniu | straż | ten sam scenariusz z syntetycznym kontem na produkcji, tam gdzie bezpieczny; binarna: przechodzi albo nie |
| sonda z zegarem świeżości | kontrakt zewnętrzny nadal obowiązuje | straż | maksymalny wiek obserwacji jest parametrem obietnicy w słowach klienta |
| pomiar z progiem o pochodzeniu | metryka produktu | Researcher | próg wyprowadzony, ujawniony, do weta |
| dowód własności | maszyna stanów, niezmienniki | robotnik, na żądanie klasy Nieodwracalne | |

| Klasa odwracalności | Bramka wymaga dodatkowo |
|---|---|
| Łatwo cofnąć | nic ponad dziewięć punktów; polityka domyślna może wybrać zalecenie maszyny |
| Trudno cofnąć | ścieżka cofnięcia udowodniona jako wiersz dowodu; wdrożenie etapami z obserwacją między etapami |
| Nieodwracalne | próba danych; osobne „tak” na tę instancję; osoba wymagana prawem, jeśli polityka ją nazywa; sonda po kroku |

Klasa jest polem biletu i kroku wdrożenia. Nie da się jej obniżyć w tej samej ręce, która pisze kod. Wiersz katalogu dowodów bez klasy nie wchodzi do karty.

### 2.8 Świat

**Wdrożenie i push.** Rodzina mówi „push nigdy” na każdym poziomie bez polecenia użytkownika. Maszyna, która wdraża, pushuje. Dom nie obchodzi tej zasady: **polityka wdrożeniowa jest obniżeniem rodzinnego „nigdy” i dlatego podpisuje ją wyłącznie klient terytorium, per terytorium, odwoływalnie.** Horde sama zostaje push-never. Czwarty poziom bramki po trunk i base: środowisko. Podgląd per bilet i staging są władzą maszyny bez pushu do produkcji. Produkcja jest zgodą albo polityką. Kanarek i cofnięcie są zawsze maszyny.

**Flagi cech.** Modelem flagi jest status obietnicy: dotrzymana, planowana, wyłączona. Zdatność fali do wdrożenia to trunk zielony i każda obietnica w jednym z tych stanów. Mechanizm runtime flagi jest produktu.

**Dane.** Osobny majątek: próba na kopii, maskowanie danych osobowych jako „nigdy”, kopie zapasowe jako obietnica z sondą w postaci próby odtworzenia. Dzierżawa repozytorium na zasoby wspólne, których węzły nie dzielą: sekwencja migracji, wspólny schemat, plik blokady zależności; sprawdzenie scalenia trunk na trunk przed jakimkolwiek PR, gdy dwie hordy biegną na jednym repozytorium.

**Czas działania.** Każda obietnica nazywa, jak jest obserwowana. Sondy binarne uruchamiają cofnięcie, ale różnicowo: ten sam scenariusz biegnie na kanarku i na celu cofnięcia; cofnięcie tylko, gdy cel zielony, a kanarek czerwony; „oba czerwone” to trzeci stan: wdrożenie zaparkowane, klient obudzony, incydent czeka na podpis, §10. Odcisk behawioralny, profil względem podobnych cech, jest **wyłącznie rankingiem uwagi**: instrument nadmiaru Graina oznaczał sumarycznie 27,4% plików Yggdrasila i został odrzucony jako flaga; ta sama matematyka podpięta do cofnięcia cofałaby czwartą część wydań.

**Zależności i sieć.** Doradztwa i wycofania jako zdarzenia, misje klasy awaryjnej z rezerwą w polityce budżetowej. Polityki źródeł są domu. Każdy fakt z sieci ma proweniencję i status „zweryfikowane” albo „uwierzone” według Urda. Treść pobrana jest danymi; reguła Ratatoskra o wstrzyknięciach rozciąga się na wszystko z zewnątrz. Zewnętrzny kontrakt ma sondę z zegarem świeżości, bo zmiana świata nie zmienia żadnego skrótu w locku.

**Bezpieczeństwo.** Najmniejsze uprawnienia per robotnik. Sekrety nigdy w briefach, dziennikach, konsoli. Skanowanie sekretów na granicy `yg log add`, bo to jedyna droga z ignorowanego `.horde/` do commitowanego dziennika, a retrospektywa nie kopiuje dosłownego tekstu dziennika do dziennika komponentu. Poufność między klientami strukturalna: osobne repozytoria, domyślna odmowa, między klientami wędrują tylko pakiety prawa, nigdy kod. Niedostępność dostawcy modelu odróżniona od odmowy: brak rundy, zwolniona blokada, ponowienie z odstępem.

**Regulacje.** Kroki ludzkie wymagane prawem jako klasa granicy, wykonane istniejącym mechanizmem: `yg verdict package` i `record` pozwalają, by sędzią reguły prozowej była uprawniona osoba, nie model. W domenach regulowanych dowodem walidacji są testy i reguły deterministyczne; reguły osądzane przez model są doradcze. Ślad dla audytora: zapis opieki commitowany, lock, rejestr incydentów.

**Wyjście klienta.** Eksport grafu, prawa, obietnic, opieki i wymagań; zwolnienie dzierżaw; usunięcie danych po stronie domu według polityki retencji. Prawo do bycia zapomnianym gryzie się z opieką nad linią, która ma przetrwać misję; rozstrzyga to polityka retencji podpisana przy przyjęciu.

### 2.9 Maszyna jako oprogramowanie

- **Wersja maszyny**: skrót briefów, wersje narzędzi, identyfikatory modeli per rola. Trailer `Machine:` obok `Ticket:`, `Evidence:`, `Law:`. Rozwiązany identyfikator modelu zapisany **obok** werdyktu, nie w jego skrócie: skrót pary jest zamrożony, a jego zmiana przebija każdemu adopterowi każdy werdykt. Atrybucja kohortowa potrzebuje zapisu; unieważnienie pozostaje decyzją protokołu wymiany.
- **Przypięcie per repozytorium**, nie per misja i nie per produkt. Symulacja S19 pokazała, że konfiguracja, dzierżawy, zamek bramki i lock są jedne na repozytorium, więc jednostką przypięcia jest repozytorium; cofnięcie wersji to parkowanie wszystkich misji na tym repozytorium ze zwolnieniem dzierżaw, a dwie wersje współistnieją tylko na osobnych repozytoriach. Horde 6.0.0 mówi wprost: misję w locie kończy się na starym wydaniu.
- **Drabina zmian maszyny**: szkic, kanarek na podpisanej kohorcie, wszędzie. Dwa zegary: retrodykcja jako wskaźnik zastępczy, prospektywne ucieczki z księgi domu jako prawda. Researcher zostaje szybką pętlą; wolny zegar jest instrumentem księgi, nie Researchera.
- **Bootstrap**: zmiany repozytoriów maszyny lądują pod bramką poprzedniego wydania narzędzi.
- **Ewaluacje behawioralne** briefów: brak; drille czterech dyscyplin są. Bez ewaluacji samomodyfikacja jest ruchem niezmierzonym.
- **Konstytucja egzekwowana** trzema drogami, bo `yg check` sądzi pliki, a władza nie zostawia pliku: narzędzia odmawiają, jak dziś odmawia obniżenie bez `--by user`; każda wykonana władza zostawia podpisany wpis w księdze władz; drille i `yg check` na repozytoriach maszyny czytają tę księgę.
- **Wymiana i wycofanie modelu**: protokół parowany uruchamiany przed datą wycofania, nie po; dwa źródła modeli dla sędziego jako polityka domu.

### 2.10 Warstwa dowodów: rejestr scenariuszy

Praktyka, którą dom przyjmuje jako standard: pełna suita e2e w środowisku w pełni syntetycznym; wszystko, czego nie da się traktować jak zależności deweloperskiej, zastąpione stubem według dokumentacji dostawcy; to, co da się postawić, na przykład baza, postawione jako stand-in; każdy test sparowany przez Yggdrasil z plikiem markdown, który opisuje scenariusz 1:1 w języku człowieka; zmiana testu uruchamia sędziego, który mówi, czy plik opisuje to, co robi test; testu nigdy się nie osłabia, chyba że to intencja zleceniodawcy.

Rodzina już zna ten kształt. Horde przy rozpoznawaniu dowodów stawia „katalog obietnic, plik na obietnicę, ze statusem, z lustrem w testach” przed suitą testów i runnerem scenariuszy, a pakiet obietnic ma cztery reguły tego kształtu: kształt pliku, język produktu, dokładnie jedna rzecz pilnująca obietnicy, sędzia sprawdzający, czy test pokrywa każde zdanie.

| Blok projektu | Jak go realizuje rejestr |
|---|---|
| intake | wymaganie to scenariusz „planowane” bez testu; maszyna pisze scenariusz ze słów klienta, klient czyta i mówi „tak”, robotnik pisze test, sędzia sprawdza zgodność w obie strony |
| wierność intencji | dotąd niemierzona; teraz: odsetek par odrzuconych przez sędziego i odsetek scenariuszy poprawianych po przeczytaniu przez klienta; sam sędzia mierzony próbkowaniem do drugiego sędziego z przedziałem Wilsona, które Horde już ma |
| dowody nigdy nie słabną | zapadka rodziny zastosowana do dowodów; wyjątek ma kanał: zmiana wiersza katalogu dowodów jest pytaniem rodzaju „charter” do klienta |
| incydent bez triażu | skarga klienta trafia w plik scenariusza; klient podpisuje fakt, maszyna proponuje przyczynę |
| flagi | status „wyłączona” |
| konsola | zbiór dotrzymanych scenariuszy jest czytelnym dla klienta opisem tego, co produkt robi; „jak to zobaczyć” jest w każdym pliku |

Trzy poprawki do praktyki:

1. **Kroki, nie tylko proza.** Sędzia ocenia zgodność; straż dwudrzewna musi liczyć: kroki i asercje nie maleją bez pytania do klienta. Struktura krokowa daje jej co liczyć.
2. **Ten sam scenariusz, trzy wykonania, tam gdzie wykonawca istnieje.** Środowisko syntetyczne to dowód hermetyczny; staging to integracja; syntetyczne konto na produkcji, tam gdzie bezpieczne, to sonda per obietnica. Plik się nie zmienia, zmienia się wykonawca. Obietnica, której wykonania na produkcji nie da się zrobić, na przykład zmiana czasu raz w roku, nie parkuje po cichu: jest jawnie „bez wykonawcy sondy”, z wiekiem ostatniego realnego wykonania, czytanym przy zamknięciu fali.
3. **Stuby według dokumentacji dryfują.** To scenariusz S1: świat zmienia się po cichu, lock niczego nie unieważnia. Uzupełnienia: stub nagrany z prawdziwego dostawcy oraz sonda z zegarem świeżości przeciw prawdziwemu dostawcy.

Czego rejestr nie daje: świata poza stubem, danych w skali produkcyjnej, pieniędzy, podpisów, trwałości stanu misji. I jednego, co daje tylko połowicznie: siły asercji. Sędzia widzi, czy test pokrywa każde zdanie; czy asercja jest mocna, mówi dopiero wariant mutacyjny przy lądowaniu. Rejestr i mutacja idą razem.

Standard domu: reguły pakietu obietnic przyjmują te konwencje jako wzorzec, a akapit „dowody w tym repozytorium” w karcie misji przestaje być sądem per misja i staje się standardem domu, z sądem tylko dla brownfieldu, który przychodzi z własnym kształtem.

---

## 3. Luki wobec tego, co jest, i gdzie lądują

| # | Klocek | Stan | Gdzie |
|---|---|---|---|
| G1 | intake: scenariusze „planowane” w kształcie kroków z sekcjami wymagania; kompilator zdania w scenariusz i dowody | pakiet `promises` istnieje; sekcje i kroki: brak | pakiet obietnic; kompilator przy rendererze propozycji Graina, bo pisze te same obiekty |
| G2 | podpis weryfikowany przy użyciu | napis w ignorowanym pliku | Horde: `bind`, `land`, `demote`, `ask answer` czytają zapis podpisany |
| G3 | trwały stan misji; zapis opieki commitowany przy lądowaniu | ginie z maszyną | Horde |
| G4 | miernik pieniędzy; limit sprawdzany przed rozdaniem | przebiegi razy wagi; `limit-reached` istnieje, tick go nie wywołuje | Horde: błąd do naprawy i nowy instrument |
| G5 | przewód wyroczni: propozycja incydentu z podpisem, cięcie drillu, opóźnienie | rejestr bierny | Yggdrasil: pomocnik cięcia drillu, addytywny; Horde: propozycja i podpis |
| G6 | wdrożenie, środowiska, sondy, kanarek, cofnięcie, próby danych i obciążenia | brak | Horde: czwarty poziom bramki i wykonawca dowodów długich, addytywnie; kandydat na osobne repo później |
| G7 | harmonogram wielu misji, budżety per klient, „go” asynchroniczne, pytania z terminem, parkowanie | pętla per horda | Horde, addytywnie |
| G8 | konsola w języku Ratatoskra | dokumenty istnieją: `horde-law/1`, zamknięcie fali, pytania | renderer w Hordzie |
| G9 | wiedza: proweniencja, treść jako dane, zdarzenia zależności | brak | Ratatoskr i Urd: rozszerzenie dyscypliny; Horde: wejście zdarzeń |
| G10 | ewaluacje behawioralne; bootstrap; drabina zmian maszyny; księga władz | drille dyscyplin | repo maszyny, skill dyrektora |
| G11 | odcisk cechy | blok `missing:` | Grain, jako instrument uwagi |
| G12 | bezpieczeństwo: uprawnienia, sekrety na granicy dziennika, konfiguracja wykonywalna podpisana | drzewa per robotnik | Horde |
| G13 | klasy odwracalności i dowodów jako pola | słownik | Horde |
| G14 | „dowody nigdy nie słabną”: kroki i asercje scenariuszy nie maleją bez pytania „charter” | test odwrócony pilnuje nowych; sędzia ocenia zgodność, nie liczy | Horde: straż dwudrzewna obok strażnika prawa; nie aspekt, bo aspekt widzi jedno drzewo |
| G15 | konflikty między klientami: kontrasygnata, pierwszeństwo, przejęcie terytorium tylko z podpisem klienta | przejęcie na własne pytanie hordy | Horde |
| G16 | obniżenie zakresowe: reguła i pliki biletu, nie cała misja | `--scope mission` | Horde |
| G17 | niedostępność vs odmowa | nieodróżnione | Horde |
| G18 | magazyn „niewyrażalnego” z czytelnikiem i limitem | tylko zdanie dyrektora | konstytucja |
| G19 | linia bazowa odchyleń przy adopcji: istniejące odmowy liczone jako dług, raport pokazuje deltę | 44 odmowy stałe na nietkniętym kodzie | Yggdrasil tryb progresywny dla raportu; Grain propozycja |
| G20 | wyjście klienta, odmowa, zastępcy strażnika | brak | konstytucja i Horde |
| G21 | pokrycie zachowania: ślady z produkcji, które nie trafiają w żaden scenariusz ani przepływ | brak | straż i `yg flows`: przepływy bez scenariusza jako „niepokryte”, tak jak dziś niepokryte pliki |
| G22 | starzenie się scenariuszy: prawdziwy wobec testu, nieprawdziwy wobec klienta | brak | pakiet obietnic: data przeglądu jak `review_by` reguł; audyt przy zamknięciu fali |
| G23 | środowisko syntetyczne kontroluje czas, losowość i współbieżność; scenariusze zachowań długotrwałych | zależy od praktyki | standard środowiska w pakiecie obietnic |
| G24 | scenariusze negatywne, „nikt nie może”, proponowane ze standardów świata | brak | wiedza: modelowanie zagrożeń jako propozycje „nigdy” do podpisu |
| G25 | zdrowie produktu jako liczba: dotrzymane, planowane, wyłączone, stan sond, stopa incydentów | indeks jakości jest o prawie, pokrycie dowodów o misji | konsola |
| G26 | brief maszyny nie niesie tekstu z produktu klienta; wymaganie jest danymi, nigdy instrukcją dla maszyny | niezapisane | konstytucja |

---

## 4. Dziesięć eksperymentów, każdy złamany dwa razy

### E1. Migracja schematu bez przestoju

**Pęka raz:** bramka dowodzi kodu, nie zachowania migracji na wolumenie; cofnięcie po zapisie danych nie jest rewertem. **Poprawka:** klasa Nieodwracalne, wzorzec rozszerz, zapisuj podwójnie, uzupełnij, zwęź, próba danych, sonda po kroku, jedno „tak” na krok.
**Pęka drugi raz:** próba danych nie ma gdzie biec: bramka uruchamia jedno polecenie w odłączonym drzewie bez bazy, z limitem piętnastu minut; robotnik pisze „próba zrobiona” do dziennika, wiersz zamyka ręczny napis, `done` przyjmuje. **Poprawka ostateczna:** klasa dowodu ma wykonawcę; próba biegnie w straży, wynik jako plik ze skrótem; `done` odmawia wierszom wypełnionym napisem; obowiązek narodzin nie jest tu strażnikiem, bo pokrywa 4,8% zmian.

### E2. Doradztwo bezpieczeństwa o trzeciej w nocy

**Pęka raz:** brak polityki oznacza stój albo przekrocz. **Poprawka:** polityka wdrożeniowa klasy awaryjnej, przynależność skryptem, rezerwa budżetu.
**Pęka drugi raz:** limit kosztu nie jest mechanizmem, tick go nie czyta; pod runnerem zewnętrznym bilety wracają z „changes”, rundy tykają, pytanie „stuck” czeka do rana, a budżet miesiąca wydany do śniadania. **Poprawka ostateczna:** tick sprawdza limit pieniędzy przed rozdaniem; misja awaryjna ma własny sufit; gdy łatki nie ma, pytanie do klienta w słowach skutku.

### E3. Dwóch klientów, sprzeczne wymagania

**Pęka raz:** maszyna nie arbitrażuje; przejęcie terytorium jest jednostronne. **Poprawka:** klient terytorium, kontrasygnata, pierwszeństwo, przejęcie tylko z jego podpisem.
**Pęka drugi raz:** mechanizm nie czyta podpisu: `bind --take --ask` wymaga odpowiedzianego pytania na hordzie przejmującej, a odpowiedź to napis w `decisions.md` w ignorowanym `.horde/`, wpisany przez dyrektora tej samej hordy. **Poprawka ostateczna:** podpis weryfikowany w miejscu użycia, nie przy wejściu; zapis podpisany commitowany; ciekawe konflikty do człowieka.

### E4. Niestabilne testy

**Pęka raz:** osłabienie istniejących asercji nie jest odmawiane z nazwy. **Poprawka:** reguła „dowody nigdy nie słabną”.
**Pęka drugi raz:** to nie może być aspekt Yggdrasila, bo aspekt widzi jedno drzewo bez gita, a porównanie liczby asercji jest dwudrzewne; jako proza byłoby regułą osądzaną, klasą, której 1305 z 1671 propozycji nie działa bez klucza. **Poprawka ostateczna:** straż dwudrzewna obok strażnika prawa w lądowaniu; klasy dowodów oddzielają nasz kod od świata; wskaźnik niestabilności w zamknięciu fali.

### E5. Regresja wydajności na produkcji

**Pęka raz:** nikt nie widzi. **Poprawka:** sondy, kanarek, cofnięcie, odcisk behawioralny.
**Pęka drugi raz:** matematyka odcisku jako flaga została zmierzona i odrzucona: 27,4% plików oznaczonych; podpięta do cofnięcia cofałaby czwartą część wydań; zostawiona doradczo bez czytelnika wraca pierwotna awaria. **Poprawka ostateczna:** cofnięcie tylko na sondzie binarnej; próg wydajności wyprowadzony z historii produktu z pochodzeniem i wetem, nie podpisany per punkt końcowy; odcisk behawioralny wyłącznie jako ranking uwagi dla próbkowanego audytu.

### E6. Refaktor przez dwanaście modułów

**Pęka raz:** zachowanie bez specyfikacji, stan mieszany między falami. **Poprawka:** obietnice odtworzone, charakteryzacja, flagi.
**Pęka drugi raz:** nic nie sprawdza zdatności do wdrożenia i nic w rodzinie nie modeluje flagi; flaga czytana przez dwanaście modułów jest trzynastą rzeczą bez właściciela. **Poprawka ostateczna:** flaga to status obietnicy; zdatność to trunk zielony i każda obietnica dotrzymana albo zaparkowana; zamknięcie fali to sprawdza; mechanizm flag jest produktu.

### E7. Produkt od zera

**Pęka raz:** brak norm, brak historii, decyzje najbardziej brzemienne najmniej podparte. **Poprawka:** prawo startowe, prototypy, zamrożenie koncepcji, wczesne wystawienie użytkownikom.
**Pęka drugi raz:** istnieje jeden pakiet prawa i mówi o kształcie dokumentów obietnic, nic o uwierzytelnianiu, pieniądzach, wielodzierżawności, rezydencji danych; a „normy z konsekwencji maszyny” to błąd „większość jako cnota”, który rodzina zmierzyła. **Poprawka ostateczna:** pierwsza konstytucja produktu jest cienka i to trzeba powiedzieć; decyzje techniczne o skutkach produktowych idą do klienta jako kompromisy produktowe; prawo przychodzi z decyzji i incydentów, a pakiety domu rosną z incydentów u wielu klientów; konsekwencja maszyny wyostrza wykrywanie odchyleń, nie tworzy prawa.

### E8. Stary monolit bez testów

**Pęka raz:** maszyna nie wie, czego nie widzi. **Poprawka:** obserwuj zanim zmienisz, obszary nietykalne.
**Pęka drugi raz:** na przyjaźniejszym repozytorium adopcja dała 0 reguł egzekwowanych, 9 doradczych i 44 stałe odmowy na nietkniętym kodzie, z których 12 twierdzi fałsz o kodzie; wszystkie pliki mapują się na jeden węzeł, więc nie ma czego ogrodzić. **Poprawka ostateczna:** istniejące odchylenia są przy adopcji linią bazową, liczone jako dług, raport pokazuje deltę; ogrodzenie wymaga najpierw cięcia grafu z klientem; linia bazowa z czasu działania przed pierwszą zmianą pozostaje, jako obserwacja, nie jako prawo.

### E9. Domena regulowana

**Pęka raz:** regulacja żąda człowieka, podpis jest flagą. **Poprawka:** bramki ludzkie jako granica, podpisy prawdziwe.
**Pęka drugi raz:** łańcuch opieki dla audytora rozwiązuje się do identyfikatorów w ignorowanym katalogu i ginie z kopią roboczą; zepchnięcie reguł osądzanych do doradczych usuwa większość prawa. **Poprawka ostateczna:** zapis opieki commitowany przy lądowaniu; uprawniona osoba jest sędzią reguł prozowych przez `yg verdict`, więc bramka ludzka wymagana prawem ma mechanizm, a prawo nie kurczy się, tylko zmienia sędziego.

### E10. Zmiana briefu, ucieczki rosną

**Pęka raz:** przypisanie niemożliwe, eksperymenty bez zgody, bramka sama zmieniona. **Poprawka:** stempel wersji, kohorta, bootstrap.
**Pęka drugi raz:** przemieszanie siedzi w locku: tożsamość werdyktu zawiera nazwę warstwy sędziego, nie model, więc przepięcie warstwy przypisuje historię modelowi, który nic nie sądził; mianownik ucieczek wymaga rejestru incydentów, który jest pusty, bo jedyny prawdziwy defekt z próby generalnej umarł z biletem. **Poprawka ostateczna:** rozwiązany model zapisany obok werdyktu; protokół wymiany przed wycofaniem; przewód wyroczni przed jakąkolwiek samomodyfikacją, bo bez mianownika wolny zegar nie istnieje.

### Pięć scenariuszy spoza pierwszej wersji

| Scenariusz | Gdzie pęka | Zmiana minimalna |
|---|---|---|
| S1 kontrakt zewnętrzny zmienia się po cichu | zmiana świata nie zmienia żadnego skrótu; wszystko zielone, produkcja zepsuta | sonda z zegarem świeżości; lądowanie czerwone, gdy ostatnia obserwacja starsza niż zadeklarowany wiek |
| S2 klient żąda cechy łamiącej podpisane „nigdy” | prośba o obniżenie w zakresie misji obniża regułę dla każdego biletu | obniżenie zakresowe: reguła i pliki biletu; „nigdy” z kontrasygnatą nieobniżalne bez drugiej strony |
| S3 częściowa awaria dostawcy modelu w trakcie lądowania | transport nieodróżnialny od odmowy; rundy tykają; blokada trzymana do dziesięciu minut | niedostępność osobno od odmowy; bez rundy; blokada zwolniona; ponowienie z odstępem |
| S4 robotnik wpisuje sekret do dziennika | retrospektywa kopiuje linie dziennika do commitowanego dziennika komponentu | skanowanie sekretów na granicy `yg log add`; retro nie kopiuje dosłownie |
| S5 dwie hordy lądują niezgodne migracje | wyłączność jest per węzeł; konflikt wychodzi dopiero przy scalaniu do bazy, którego rodzina nie robi | dzierżawa repozytorium na zasoby wspólne; scalenie trunk na trunk przed PR |

### Co pęka pierwsze w domu bez nadzoru

| # | Awaria | Płaszczyzna | Jedna zmiana |
|---|---|---|---|
| 1 | podpis to napis w ignorowanym pliku | intencja, prawo | weryfikacja w miejscu użycia |
| 2 | polecenia bramek i uruchamiania robotników w niepodpisanym pliku, wykonywane detached | bezpieczeństwo | konfiguracja wykonywalna podpisana i commitowana |
| 3 | limit kosztu niesprawdzany przed rozdaniem | ekonomia | tick czyta limit |
| 4 | opieka nad linią ginie z kopią roboczą | prawo, regulacje | zapis opieki commitowany przy lądowaniu |
| 5 | zmiana świata niczego nie unieważnia | świat | zegar świeżości |
| 6 | model poza tożsamością werdyktu | ja | model zapisany obok werdyktu |
| 7 | „dowody nigdy nie słabną” niezapisywalne jako aspekt | prawo | straż dwudrzewna przy lądowaniu |
| 8 | transport czytany jako odmowa | praca | niedostępność osobno |
| 9 | próg szumu przy adopcji | prawo | linia bazowa i delta |
| 10 | wiersz dowodu zamykany napisem | intencja | klasa dowodu z wykonawcą; `done` odmawia |

---

## 5. Wnioski i poprawki projektu

1. **Odwracalność jest zmienną nadrzędną.** E1, E5, E6, E9, E10.
2. **Świat to płaszczyzna z większością luk.** Rodzina kończy się na gałęzi.
3. **Polityki są konieczne i są furtką.** Siedem obwarowań z §1.3 albo nie ma polityk.
4. **Człowiek: trzy role, dwie władze stałe, zastępcy, osoba prawna.**
5. **Maszyna jest oprogramowaniem**, przypiętym per misja.
6. **Prawo z decyzji i incydentów, nigdy z większości.** Odcisk to instrument uwagi.
7. **Podpisy prawdziwe, stan trwały, opieka commitowana.** Bez tego tabela władz jest literaturą.
8. **Dowody mają klasy i wykonawców.** Bramka nie jest wykonawcą dowodów długich.
9. **Każda pętla ma mianownik**, a mianownik potrzebuje miernika pieniędzy i rejestru incydentów z podpisem.
10. **Środek pętli jest zmierzony kawałkami, nie jako całość.** W próbie generalnej pękła około połowa szwów przy pierwszym kontakcie; Grain zapisał to samo dla każdego z trzynastu języków. Dom dodaje sześć płaszczyzn nowych szwów. Kolejność budowy: szew po szwie, prawdziwa misja na każdy szew.
11. **Warstwa dowodów to rejestr scenariuszy.** Maszyna zmienia wykonawcę, nigdy scenariusz; scenariusz zmienia tylko klient.

Błędy wersji pierwszej, poprawione: progi jako podpis; incydent automatyczny; milczenie jako zgoda; polityki techniczne stawiane klientom; nowe repozytorium; „normy z konsekwencji maszyny”; „stan w plikach” bez trwałości; wersja maszyny per produkt; reguła dwudrzewna umieszczona w pakiecie obietnic; Urd „użytkownik dostępny ciągle” zostawiony bez zmiany, gdy dom go falsyfikuje; brak odmowy, wyjścia, zastępców, sukcesji.

---

## 6. Dalsze iteracje

- **Replay całego domu na historii.** Publiczne repozytorium, prawdziwe PR jako wymagania, dom w chwili t produkuje zmianę, sędzią są testy z PR i późniejsze rewerty. Benchmark całości z dyscypliną dowodową rodziny.
- **Pakiety prawa jako majątek domu**, rosnące z incydentów u wielu klientów, anonimowe, przez `yg pack`. Jedyna wiedza, która legalnie przechodzi między klientami.
- **Dowody formalne dla klasy Nieodwracalne.**
- **Magazyn „niewyrażalnego” jako agenda badań maszyny**, metodą katalogu pytań Graina, z czytelnikiem i limitem, po którym trzeba coś rozstrzygnąć.
- **Ekonomia wyniku**: cena per wynik. Wymaga miernika pieniędzy.
- **Uczenie klasy modelu per archetyp** na księdze pieniędzy.

---

## 7. Klocki: gdzie co ląduje

Bez nowego repozytorium, zgodnie z rozstrzygnięciem. „House” jest nazwą koncepcji: rodzina działająca razem.

| Repo | Zmiana | Charakter |
|---|---|---|
| Horde | podpis weryfikowany przy `bind`, `land`, `demote`, `ask answer`; trwały stan misji; zapis opieki commitowany przy lądowaniu; tick czyta limit; miernik pieniędzy; klasy odwracalności i dowodów; wykonawca dowodów długich; czwarty poziom bramki: środowisko; kanarek i cofnięcie; harmonogram wielu misji; pytania z terminem i parkowanie; straż „dowody nigdy nie słabną”; obniżenie zakresowe; niedostępność osobno; dzierżawa zasobów wspólnych; konfiguracja wykonywalna podpisana; konsola; trailer `Machine:`; przypięcie wersji per misja; naprawa `model.md`, które mówi, że tick nic nie uruchamia | addytywne; dwa błędy |
| pakiet obietnic | wchłania konwencje rejestru scenariuszy: kształt krokowy, sekcje wymagania, status jako model flagi, sonda jako to samo wykonanie, stub nagrany, data przeglądu, standard środowiska syntetycznego | addytywne |
| Grain | odcisk cechy jako instrument uwagi; kompilator zdania w obietnicę i dowody przy rendererze propozycji; linia bazowa odchyleń w propozycji | nowa zdolność |
| Yggdrasil | pomocnik cięcia drillu z incydentu; rozwiązany model obok werdyktu; skanowanie sekretów na granicy dziennika | addytywne, rdzeń nietknięty |
| Ratatoskr | wstrzyknięcia: treść z sieci jako dane; polityki w słowach produktu jako przykład | jedno zdanie i przykład |
| Urd | „użytkownik jest dostępny ciągle” na „osiągalny asynchronicznie; parkuj, nigdy nie zgaduj” | jedno zdanie |
| Researcher | bez zmian; wolny zegar jest instrumentem księgi | |
| repo maszyny | konstytucja, księga władz, bootstrap, ewaluacje behawioralne, zastępcy i sukcesja, magazyn niewyrażalnego | skill dyrektora i aspekty |

Kandydat na osobne repozytorium w przyszłości: warstwa świata, gdy będzie miała własną kadencję i własne liczby.

---

## 8. Co widzę i kolejność

Blisko w projekcie. W dowodach nie. Zero prawdziwych misji Hordy na obcym produkcie, brak miernika pieniędzy, pusty rejestr incydentów, zero wdrożeń maszyny.

Kolejność, szew po szwie:

1. **Naprawa dwóch błędów i spisanie standardu warstwy dowodów** z istniejącej praktyki do pakietu obietnic. Oba bez misji, oba tanie.
2. **Jedna prawdziwa misja Hordy na obcym repozytorium pod 6.0.0**, koszt i zdarzenia zapisane przez lądowanie zanim skasuje drzewo. Pierwsza baza kosztu, pierwsze liczby o człowieku na wynik.
3. **Księga domu pisana w chwili aktu.** Trwały stan misji; zapis opieki commitowany przy lądowaniu w treści, nie w identyfikatorze; koszt, wywołania sędziego, klasa i rundy biletu, odmowy reguł, wykonawca dowodu z ostatnim wykonaniem; podpisy z fotelem i chwilą; wszystko poza repozytorium klienta, zakotwiczone w rachunku dostawcy tam, gdzie host go zwraca. Bez tego nic dalej nie ma sensu, bo nic nie przetrwa i nic nie da się przypisać.
4. **Podpis weryfikowany w miejscu użycia.** Tabela władz zaczyna obowiązywać.
5. **Pierwszy podpisany incydent** z pierwszej misji, cięcie drillu, pomiar opóźnienia.
6. **Pierwsze wdrożenie przez maszynę** na produkcie strażnika: klasa odwracalności, podgląd, staging, cofnięcie, sonda binarna.
7. **Intake jako obietnice „planowane”** i pierwszy klient, który nie jest strażnikiem.

Dopiero po siódmym kroku pytanie o osobne repozytorium ma liczby, na których można je rozstrzygnąć.

---

## 9. Czy model ma luki

Tak. Trzy rodzaje.

**Luki modelu, doprojektowane w tej wersji**, G21–G26: pokrycie zachowania, starzenie się scenariuszy, czas i współbieżność w środowisku syntetycznym, scenariusze negatywne ze standardów świata, zdrowie produktu jako liczba, brief bez tekstu klienta i wymaganie jako dane. Po czterdziestu symulacjach doszły G27–G47, §10.

**Luki w rzeczywistości, nie w modelu.** Model je nazywa i mówi, gdzie lądują, ale nic ich jeszcze nie buduje: podpis weryfikowany przy użyciu, trwały stan misji, miernik pieniędzy, warstwa świata, ewaluacje behawioralne briefów. Tabela władz jest literaturą, dopóki pierwsze dwie nie istnieją.

**Luki nieredukowalne, które model może tylko mierzyć:**

| Luka | Dlaczego nie da się jej zamknąć | Co model mierzy |
|---|---|---|
| klient mówi „tak” scenariuszowi, którego nie przeczytał | akceptacja jest jedynym sprawdzeniem zgodności scenariusza z intencją | czas między pokazaniem a podpisem; odsetek scenariuszy poprawianych po akceptacji |
| zbiór scenariuszy jest wierny, a mimo to niepełny | żaden test nie dowodzi nieobecności przypadku, o którym nikt nie pomyślał | ślady z produkcji poza scenariuszami; incydenty; kupka „niewyrażalne” |
| stub mówi to, co maszyna wierzy o dostawcy | dowód hermetyczny z definicji nie widzi świata | sonda z zegarem świeżości; stub nagrany |
| sędzia par jest modelem | osąd, nie skrypt; ma ślepe plamy systematyczne | próbkowanie do drugiego sędziego; wariant mutacyjny na siłę asercji |
| ciekawe konflikty między klientami | nieklasyfikowalne z góry | liczba konfliktów eskalowanych na misję |
| zakazy nie wynikają z praktyki | żadna praktyka nie zawiera „nigdy” | liczba „nigdy” podpisanych na produkt i skąd przyszły |

Model bez luk nie istnieje. Model, który wie, gdzie ma luki, i mierzy każdą, którą może, to najwięcej, co da się zaprojektować.

---

## 10. Czterdzieści symulacji

Metoda: katalog czterdziestu sytuacji pokrywających wszystkie płaszczyzny, osiem niezależnych przebiegów po pięć, każdy na modelu z §2 przyjętym jako zainstalowany i z mechanizmami rodziny sprawdzanymi w repozytoriach. Protokół: przebieg, pęka, poprawka zgodna z rozstrzygnięciami, pęka ponownie, ostatecznie. Katalog leży obok memo jako `ai-software-house-simulations-2026-09-13.md`.

| Klasa luki | Ile |
|---|---|
| model | 22 |
| rzeczywistość | 11 |
| nieredukowalna | 7 |

Żadna z czterdziestu nie zamyka się do końca. Model zamyka niewidzialność: fakt staje się zapisany, czerwony, z właścicielem. Skutek zamyka człowiek albo pieniądz.

### 10.1 Czterdzieści przebiegów

| S | Sytuacja | Klasa | Pęka najpierw | Ostatecznie |
|---|---|---|---|---|
| S01 | podpis w sekundę | nieredukowalna | jedno „go” na trzydzieści wierszy; Ratatoskr dopuszcza zbiorczą zgodę; sprzeczne scenariusze podpisane | darmowe okno poprawki liczone stanem wiersza; czas do podpisu i odsetek poprawek po akceptacji |
| S02 | zmiana zdania codziennie | rzeczywistość | poprawka karty jest dyscypliną, nie mechanizmem; limit niesprawdzany; dwa tygodnie pod porzuconą koncepcją | poprawka karty pokazuje koszt poprzedniej koncepcji i porzucone wiersze; „stop” mówi klient; wymaga miernika pieniędzy |
| S03 | termin w umowie | model | time-box jako proza w karcie; nic nie czyta kalendarza | time-box jako linia karty czytana przed rozdaniem; zatrzymanie tylko na granicy bezpiecznego kroku; dom sprzedaje wiersze i sufit, nigdy datę |
| S04 | podszycie się pod klienta | model | weryfikacja uwierzytelnia poświadczenie, nie osobę; bramka czyta rodzaj pytania, nie podpis | kontrasygnata dla obniżeń i otwarcia produkcji; raport w chwili użycia; wiersz „unieważnienie”: przywrócony status unieważnia pary w locku |
| S05 | następca klienta | model | tożsamości nie ma; „nigdy” kontrasygnowane przez nieobecnego nieobniżalne przez nikogo | podpis związany z fotelem; przekazanie fotela w księdze; obniżenia przez posiadacza bez oryginału do strażnika |
| S06 | klient nie płaci | rzeczywistość | podstawa faktury w ignorowanym katalogu u dłużnika | księga domu w chwili lądowania, zakotwiczona w rachunku dostawcy; konstytucja: dom nigdy nie trzyma produktu jako zakładnika |
| S07 | klient techniczny czyta diffy | nieredukowalna | czarna skrzynka jest własnością rozmowy, nie repozytorium; instrukcja techniczna nie ma rodzaju | instrukcja jako ograniczenie karty i rozstrzygnięcie dyrektora, nigdy prawo; obserwacja klienta poza produkcją jako zapis bez pytania |
| S08 | wspólna biblioteka | model | każda jednostka rodziny kończy się na repozytorium; kontrakt u sąsiada nie działa przez granicę | sondy świeżości między repozytoriami; brak jednostki wielorepozytoryjnej nazwany |
| S09 | awaria regionu w kanarku | model | sonda binarna nie zna przyczyny; cofnięcie zdrowego wydania w martwy region | sonda różnicowa; trzeci stan „oba czerwone” parkuje wdrożenie; regresja pod awarią świata nieredukowalna |
| S10 | certyfikat wygasa | model | fakt operacyjny bez autora; status obietnicy nie zna „ważne do” | obietnice operacyjne domu z zegarem o pochodzeniu; bez podpisanej władzy operacyjnej dom patrzy, nie ratuje |
| S11 | cennik chmury | model | rachunek za infrastrukturę bez czytelnika | koszt jednostkowy produktu jako obietnica z sondą; decyzja klienta; brak winnego wydania |
| S12 | korupcja danych po trzech tygodniach | nieredukowalna | opieka rozwiązuje się do identyfikatorów w `.horde/` | trailery niosą treść; opieka nad danymi nie istnieje; odtworzenie to strata nazwana klientowi |
| S13 | usunięcie danych osobowych | nieredukowalna | dziennik append-only ze skrótami; usunięcie łamie lock | dane nie wchodzą na wejściu; dziennik i korpus prawa „nigdy dane osobowe”; żądania niewykonalne liczone |
| S14 | zmiana czasu raz w roku | model | trzeciego wykonania nie ma; zaparkowana obietnica jest zielona | obietnica bez wykonawcy sondy nie parkuje po cichu; liczba i wiek jawne |
| S15 | stare aplikacje w terenie | model | port bez wersji; konsumenci tylko w repozytorium; zero konsumentów | konsument spoza repozytorium jako obietnica z sondą; wycofanie jako kompromis klienta |
| S16 | ruch pięćdziesięciokrotny | model | sezon nie jest wymaganiem; nic nie otwiera misji | obietnica wydolnościowa z zegarem; wygaśnięcie otwiera pytanie „charter” z liczbą z historii sprzedaży; wydolność świata poza stubem |
| S17 | rotacja sekretów | model | słowa bramki z sekretem idą do biletu i pytania klienta | lista dozwolonych zmiennych w podpisanej konfiguracji; poświadczenie sondy z zegarem; rotacja jako wiersz opieki |
| S18 | cena modelu trzykrotna | rzeczywistość | księga nie zna pieniędzy ani modelu; wagi klas nie drgną | kwota i model w wierszu tam, gdzie host je zwraca; „szacunek z wagi” jawnie; cezura przy remapowaniu klas |
| S19 | cofnięcie wersji maszyny | model | konfiguracja, dzierżawy, zamek per repozytorium; brief niesie absolutną ścieżkę | przypięcie per repozytorium; cofnięcie to parkowanie wszystkich misji na repozytorium |
| S20 | dwie wersje, sprzeczne reguły | model | obie wchodzą, żadna nie wychodzi; nic nie porównuje aspektów | para odmówiona przez dwie reguły to konflikt do klienta; wykrycie przy pierwszej parze; zapadka nie cofa własnego awansu |
| S21 | reguła kontra „nigdy” | nieredukowalna | retro i legislator nie widzą obietnic klienta | „nigdy” jako wejście legislatora; styk przedmiotów to osąd modelu; asymetria zapadki mierzona |
| S22 | luka w repozytorium maszyny | rzeczywistość | skrót werdyktu wyklucza wersję narzędzia; łatka nic nie unieważnia | doradztwo jako zdarzenie z pytaniem; wersja w stemplu; werdykty nieaktualnego parsera liczone |
| S23 | strażnik niedostępny miesiąc | nieredukowalna | pary prozowe czekają na wycofany model; zastępca może przepiąć model jedną linią | klasa delegacji „wznowienie”; absencja to kolejka zaparkowanych misji |
| S24 | test ma rację, scenariusz stary | rzeczywistość | sędzia par na doradczej; nieprawdy się scalają; brak terminu | data przeglądu obietnicy w bramce; zakleszczenie przy milczeniu zostaje |
| S25 | wymiana sędziego | model | model spoza skrótu; sekrety per drzewo; werdykty nieodróżnialne | rozwiązany model czytany przez punkt „judge” bramki; zapas zieleni sprzed wymiany zostaje |
| S27 | staging pada | rzeczywistość | nie ma czwartego poziomu; robotnik już nie istnieje; brak wejścia obserwacji | stub nagrany jako wykonawca; wiek obserwacji w commitowanym pliku; bramka odmawia za wiek, nie dowodzi prawdy stubu |
| S28 | dług trzystu plików | model | `promote` nie czyta własnej linii bazowej; egzekwowanie nieosiągalne | baza to dług, powyżej nowość; tryb progresywny standardem domu |
| S29 | spór o fałszywe blokady | model | licznik fałszywych blokad rośnie tylko z aktu, którego brak jest sporem | cisza jako fakt w dzienniku reguły; jedno pytanie na regułę; audyt trwały |
| S30 | wyłączenie reguły pakietu | model | adaptacja gasi regułę w całym repozytorium; obniżenie na bazie niewidoczne dla straży | obniżenie do „advisory”; spadek widoczny w indeksie; dom nie odmawia obsługi |
| S31 | przeniesienie cechy | model | terytorium nietrwałe; identyfikator obietnicy to ścieżka | podpis związany z obietnicą, identyfikator niezmienny; przeniesienie jako „charter” z kontrasygnatą |
| S32 | bilet na trzy węzły | model | jednostka wdrożenia to bilet, obietnica to dwanaście biletów; cofanie własnej migracji | obietnica nazywa komplet; czwarty poziom czyta komplet; kompletność mierzona |
| S33 | „wip: reclaimed” w kółko | rzeczywistość | odzysk bez wpisu; bramka czerwona za księgowość maszyny; robotnicy nieksięgowani | odzysk jest rundą; śmierć sesji do czerwonych bramek jako sygnał cięcia węzła |
| S34 | wiersz niemierzalny | nieredukowalna | nic nie odrzuca przymiotnika; napis zamyka wiersz | obietnica „planned” bez miary zastępczej; `done` nie przyjmuje napisu |
| S35 | lądowanie dłuższe niż tick | rzeczywistość | tick bierze ten sam zamek, czeka dwie minuty, pętla umiera | czekanie wyprowadzone z sufitu bramki; przepustowość jedno lądowanie na czas bramki |
| S36 | zamek po restarcie | rzeczywistość | brak uprawnień czytany jako „żyje”; zamek nigdy nie przejęty | host i rozruch w zamku; obcy host to nazwana odmowa |
| S37 | koszt sędziego przy refaktorze | rzeczywistość | wywołania sędziego poza sumą; powstają w kasowanym drzewie | liczone w pliku wyniku bramki; prognoza jako dolna granica |
| S38 | budżet w połowie migracji | model | limit tnie sumę, nie sekwencję; parkowanie zwalnia dzierżawy rozgrzebanego schematu | limit wiąże na granicy sekwencji; pierwsza sekwencja bez precedensu w księdze |
| S39 | stała cena | rzeczywistość | brak ceny jednostkowej i liczby; stała cena to estymata | cena per dotrzymana obietnica z rozkładu; dwie liczby obok |
| S40 | tania klasa pada | model | nikt nie czyta księgi przy rozdaniu; retrospektywa nie ma kubełka | klasa z pochodzenia z księgi domu; nośnik między misjami dopiero z trwałą księgą |
| S43 | kopia produkcji w środowisku | model | jedyna reguła nad obietnicami widzi kod, nie ludzi; proza bezwładna | maskowanie deterministyczne na kształtach; historia gita nieusuwalna bez zerwania prawa |

### 10.2 Cztery zasady przekrojowe

Osiem przebiegów dało osiem wniosków, które składają się w cztery zasady:

1. **Zapis w chwili aktu, poza stroną związaną, z tożsamością producenta.** Każdy akt klienta ma fotel, chwilę i cenę. Każda władza maszyny ma wpis. Każde lądowanie zapisuje koszt, wywołania sędziego, klasę i rundy, odmowy reguł, wykonawcę dowodu i jego ostatnie wykonanie, w treści, nie w identyfikatorze. Każdy zapisany fakt niesie rozwiązaną tożsamość tego, co go wyprodukowało: model, wersję narzędzia, hosta i rozruch. Księga leży poza repozytorium klienta i jest zakotwiczona w rachunku strony trzeciej. Zamyka lub ogranicza S02, S03, S05, S06, S12, S18, S22, S25, S29, S31, S36, S37, S39, S40.
2. **Zapis człowieka jest wejściem każdego aktu autonomicznego.** Retro i legislator czytają podpisane „nigdy”. Bramka czyta, który model sądził, i datę przeglądu obietnicy. Awans reguły czyta własną linię bazową. Obserwacja ze stagingu ma wejście. Żaden ruch na własnej władzy nie biegnie przeciw zapisowi, którego nie umie przeczytać. S04, S20, S21, S24, S25, S27, S28.
3. **Komplet jest jednostką, nie krok.** Obietnica nazywa swój komplet biletów; sekwencja nieodwracalna, życie sesji, okno bramki, rozruch maszyny deklarują komplet i tożsamość wykonania. Bramka wdrożenia, limit budżetu, time-box klienta i zwolnienie dzierżaw czytają komplet. Co przerwane i powtórzone, dostaje własny wiersz kosztu. S03, S32, S33, S35, S36, S38.
4. **Fakty świata mają właściciela.** Awaria, certyfikat, cennik, sezon, klucz, konsument spoza repozytorium: żadnego nie wyprodukowało zdanie klienta. Dom ma klasę obietnic operacyjnych ustawianych przez strażnika, każda z zegarem o pochodzeniu i sondą wykonywaną różnicowo wobec celu cofnięcia. S09, S10, S11, S15, S16, S17.

### 10.3 Co się zmienia w modelu

- §1.3: milczenie parkuje misję na granicy bezpiecznego kroku; dzierżawy węzłów z rozpoczętą sekwencją nieodwracalną nie są zwalniane.
- §1.5: sukcesja po stronie klienta: podpis wiąże się z fotelem klienta terytorium, przekazanie fotela jest zdarzeniem w księdze władz.
- §2.3: nowe wiersze: „unieważnienie” po wykrytym podszyciu, obserwacja klienta poza produkcją jako zapis bez pytania, instrukcja techniczna klienta jako ograniczenie karty; kontrasygnata dla obniżeń prawa i otwarcia produkcji.
- §2.8: cofnięcie jest różnicowe, z trzecim stanem; poświadczenie sondy ma zegar świeżości; słowa bramki i błędów nie idą do kanału klienta bez skanu.
- §2.9: przypięcie wersji maszyny per repozytorium, nie per misja.
- §2.10: trzy wykonania tylko tam, gdzie wykonawca istnieje; obietnica bez wykonawcy sondy jest jawna.
- §8: krok trzeci to księga domu pisana w chwili aktu.

### 10.4 Nowe luki

| # | Klocek | Z symulacji | Gdzie |
|---|---|---|---|
| G27 | księga domu w chwili aktu: podpisy z fotelem, chwilą i ceną; władze; koszt, wywołania sędziego, klasa i rundy, odmowy reguł, wykonawca i ostatnie wykonanie; poza repozytorium klienta, zakotwiczona w rachunku dostawcy; poprawka karty z ceną; cena per dotrzymana obietnica z rozkładu | S02, S03, S06, S12, S37, S39, S40 | Horde: lądowanie i księga |
| G28 | fotel klienta terytorium i sukcesja; kontrasygnata dla obniżeń i otwarcia produkcji; raport w chwili użycia dla władz nieodwracalnych; „unieważnienie” | S04, S05 | Horde, konstytucja |
| G29 | obietnice operacyjne domu ustawiane przez strażnika: certyfikat, kopie, koszt jednostkowy, wydolność; zegar o pochodzeniu; zdarzenia kalendarzowe otwierają pytania „charter” | S10, S11, S16 | pakiet obietnic, konstytucja |
| G30 | sonda różnicowa i trzeci stan; poświadczenie sondy z zegarem; lista dozwolonych zmiennych w podpisanej konfiguracji; rotacja jako wiersz opieki | S09, S17 | Horde: straż |
| G31 | wykonawca i ostatnie realne wykonanie w każdym wierszu dowodu, commitowane w treści; obietnica bez wykonawcy sondy jawna z wiekiem | S12, S14 | Horde: lądowanie; pakiet obietnic |
| G32 | konsument spoza repozytorium jako obietnica z wykonaniem produkcyjnym; wycofanie jako kompromis klienta z liczbą z sond | S15 | pakiet obietnic |
| G33 | maskowanie jako dowód deterministyczny na kształtach nad danymi testowymi i scenariuszami, z drillem; ten sam skan na granicy dziennika; konstytucja: dziennik i korpus prawa „nigdy dane osobowe”; kopiowanie plików z niepodpisanej konfiguracji jako wektor | S43, S13 | pakiet obietnic, Yggdrasil addytywnie, Horde |
| G34 | tożsamość producenta w każdym fakcie: kwota i model w wierszu, gdzie host zwraca zużycie, inaczej „szacunek z wagi” jawnie; cezura przy remapowaniu klas; model czytany przez punkt „judge”; wersja narzędzia w stemplu; werdykty nieaktualnego parsera liczone | S18, S22, S25 | Horde, Yggdrasil addytywnie |
| G35 | przypięcie per repozytorium; cofnięcie wersji to parkowanie repozytorium | S19 | Horde |
| G36 | konflikt dwóch reguł jako pytanie „charter” przy pierwszej wspólnej parze; „nigdy” obietnic jako wejście retro i legislatora | S20, S21 | Horde: role |
| G37 | zastępca strażnika z klasą „wznowienie”; zmiana modelu bez wpisu odmawiana; absencja jako kolejka | S23 | konstytucja |
| G38 | data przeglądu obietnicy czytana przez bramkę; sędzia par na egzekwowanej w standardzie domu; obserwacja ze stagingu z wejściem; stub nagrany jako wykonawca z wiekiem w commitowanym pliku | S24, S27 | pakiet obietnic, Horde |
| G39 | `promote` czyta własną linię bazową; tryb progresywny standardem domu, podpisany raz przy przyjęciu | S28 | Horde, Yggdrasil konfiguracja |
| G40 | komplet jako jednostka: obietnica nazywa komplet biletów; czwarty poziom czyta komplet; limit wiąże na granicy sekwencji nieodwracalnej; time-box klienta jako linia karty | S03, S32, S38 | Horde |
| G41 | odzysk sesji jako runda; śmierć sesji do czerwonych bramek jako sygnał cięcia; klasa biletu z pochodzenia z księgi domu | S33, S40 | Horde |
| G42 | zamek z hostem i rozruchem; czekanie wyprowadzone z sufitu bramki; przepustowość mierzona | S35, S36 | Horde: dwa błędy |
| G43 | cisza jako fakt w dzienniku reguły po terminie propozycji; jedno pytanie na regułę; audyt prawa trwały poza `.horde/` | S29 | Horde |
| G44 | wymaganie bez klasy dowodu jako obietnica „planned” w słowach klienta, bez miary zastępczej | S34 | pakiet obietnic |
| G45 | instrukcja techniczna klienta jako ograniczenie karty; obserwacja klienta poza produkcją jako zapis | S07 | Horde |
| G46 | produkt wielorepozytoryjny: jednostką rodziny jest repozytorium; sondy świeżości między repozytoriami; obiekt produktu nazwany jako ograniczenie do czasu warstwy świata | S08 | warstwa świata |
| G47 | obniżenie reguły pakietu domu zatrzymuje się na „advisory”; zmiany na bazie widoczne w indeksie jakości; konsola mówi, czego już nie umie pokazać | S30 | Horde, pakiet obietnic |

### 10.5 Pięć zmian, które zamykają najwięcej

1. Księga domu pisana w chwili aktu, poza repozytorium klienta, z tożsamością producenta w każdym wierszu.
2. Obietnice operacyjne domu z sondą różnicową i zegarem o pochodzeniu.
3. Komplet jako jednostka bramki wdrożenia, budżetu, time-boxu i dzierżaw.
4. „Nigdy” i data przeglądu jako wejście legislatora i bramki; awans czyta własną bazę.
5. Tożsamość wykonania: host i rozruch w zamku, model przy werdykcie, wersja w stemplu, przypięcie per repozytorium.

Siedem nieredukowalnych, potwierdzonych symulacją, dochodzi do tabeli z §9: podpis nieprzeczytany, kompetencja klienta wchodząca kanałem poza domem, opieka nad danymi po korupcji, utrwalenie kontra usunięcie, styk reguły z „nigdy” jako osąd modelu, absencja strażnika przy wycofaniu modelu, wymaganie bez miary.
