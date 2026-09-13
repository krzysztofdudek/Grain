# Model AI Software House

**Stan na 2026-09-13.** Jeden kompletny model systemu docelowego, po dwóch recenzjach adwersarialnych, piętnastu eksperymentach myślowych i czterdziestu symulacjach. Opisuje system tak, jak ma działać, nie historię jego powstawania. Każda reguła niesie źródło w nawiasie kwadratowym: rozstrzygnięcie rodziny, eksperyment E, scenariusz S, luka G. Podstawa: rodzina Yggdrasila 6.0.0. Wyprowadzenie leży w `ai-software-house-2026-09-13.md`, katalog symulacji w `ai-software-house-simulations-2026-09-13.md`.

---

## 0. Czym jest dom

Dom to rodzina Yggdrasila działająca razem, bez nadzoru, dla wielu klientów, w czasie. Yggdrasil jest prawem. Grain jest zwiadem i pomiarem. Horde jest organizacją jednej misji. Ratatoskr jest językiem, w którym dom mówi do ludzi. Urd jest hamulcem przed zgadywaniem. Researcher jest silnikiem eksperymentów. Dom dokłada to, czego rodzina nie ma: klientów w liczbie mnogiej, świat poza gałęzią, pieniądze, i siebie samego jako oprogramowanie. Dom nie jest nowym repozytorium [`layers-compatible-no-user-thresholds`].

**Gwiazda polarna.** Oprogramowanie, które się nie psuje, dostarczane klientom, którzy nie czytają kodu, przez maszynę, która sama się nie osłabia.

**Osiem zasad, na których stoi wszystko:**

| # | Zasada | Źródło |
|---|---|---|
| 1 | Egzekucja rośnie sama, w dół idzie tylko podpis człowieka | `quality-always-authorised` |
| 2 | Zapis w chwili aktu, poza stroną związaną, z tożsamością producenta | S02–S06, S12, S18, S22, S25, S36, S37 |
| 3 | Zapis człowieka jest wejściem każdego aktu autonomicznego | S04, S20, S21, S24, S25, S27, S28 |
| 4 | Komplet jest jednostką, nie krok | S03, S32, S33, S35, S36, S38 |
| 5 | Fakty świata mają właściciela | S09, S10, S11, S15, S16, S17 |
| 6 | Prawo pochodzi z decyzji i incydentów, nigdy z większości; incydent nigdy nie jest automatyczny | `law-loop-b1-not-doing-it-with-numbers`, Counsel 3 |
| 7 | Progi mają pochodzenie, nie podpis; odwracalność jest zmienną nadrzędną | `layers-compatible-no-user-thresholds`, E1, E5, E9 |
| 8 | Maszyna jest oprogramowaniem: wersje, przypięcia, kanarek, bootstrap | E10, S19, S22, S23 |

---

## 1. Ludzie

### 1.1 Trzy role i dwie władze stałe

Człowiek daje trzy rzeczy. **Cel**: co ma się stać prawdą, dla kogo, dlaczego; uporządkowanie wartości; kryteria akceptacji w słowach produktu; poziom wierności, prototyp albo wersja docelowa. **Granice**: nie-cele, zakazy, weto wobec wyprowadzonych progów, budżet w pieniądzach, apetyt na ryzyko, pierwszeństwo, zgoda na kroki nieodwracalne, poufność, kroki ludzkie wymagane prawem, polityki, zgoda na wdrażanie. **Świadectwo**: akceptacja, incydent w słowach produktu bez przyczyny, smak jako jedna linia, niewyrażalne. Cel i granice się ustala, świadectwo się obserwuje, i dlatego jest trzecią rolą, nie odmianą pierwszej: cel zamrożony w chwili zero maszyna zoptymalizuje w Goodharta.

Dwie władze stałe, których „cel i granice” nie obejmują. **Arbitraż**: konflikty klasyfikowalne z góry rozstrzyga polityka pierwszeństwa; ciekawe konflikty nie są klasyfikowalne i idą do człowieka z obydwoma wierszami w słowach produktu. **Odmowa**: dom odmawia wymagania niezgodnego z prawem, szkodliwego, poza kompetencją domu albo sprzecznego z „nigdy” podpisanym przez inną stronę; odmowa jest zapisana i zgłoszona strażnikowi [Horde: „claim that something is a boundary”].

### 1.2 Fotele

| Fotel | Kto | Władza | Źródło |
|---|---|---|---|
| klient terytorium | jedna osoba na terytorium produktu, podpisana przy przyjęciu | wszystko, co w tabeli władz stoi po stronie klienta | E3 |
| wnioskodawca | każdy inny interesariusz produktu | wiersze z kontrasygnatą klienta terytorium | E3 |
| strażnik konstytucji | klient repozytoriów maszyny | gwiazda polarna maszyny, władze niedelegowalne, klasy kosztowe, wymiana modelu, zmiana tego, co maszyna twierdzi, polityki techniczne domu | §1.5 wyprowadzenia |
| zastępca strażnika | osoby z klasą delegacji zapisaną w konstytucji | obniżenia w nazwanym terytorium; klasa „wznowienie”: drugie źródło tego samego modelu, nigdy inny model; nigdy konstytucja | S23 |

Podpis wiąże się z **fotelem**, nie z osobą. Przekazanie fotela jest zdarzeniem w księdze władz. Obniżenie przez posiadacza fotela, który nie podpisał oryginału, pokazuje mu zdanie oryginału i jest zgłaszane strażnikowi. Sukcesja strażnika i klientów jest zapisana w konstytucji, nie w głowie [S05].

### 1.3 Podpis

Podpis jest uwierzytelniony i niezaprzeczalny, weryfikowany **w miejscu użycia**: przy dzierżawie terytorium, lądowaniu, obniżeniu, odpowiedzi na pytanie. Zapis podpisany jest commitowany poza repozytorium klienta. Wiersze podpisane przez dwie strony są nieobniżalne bez obu. Obniżenie prawa i otwarcie produkcji wymagają kontrasygnaty. Po wykrytym podszyciu istnieje władza „unieważnienie”: przywrócony status unieważnia pary w locku i wszystko czerwienieje do ponownego osądu [G2, S04, S05].

### 1.4 Polityki

Polityka to podpisana z góry odpowiedź na klasę pytań. Bez polityk dom w nocy stoi. Z politykami bez obwarowań autonomia wraca tylnymi drzwiami.

| Obwarowanie | Treść |
|---|---|
| nigdy prawo | polityka nie obniża statusu reguły, nie wycisza, nie przesuwa daty przeglądu |
| nigdy nieodwracalne | krok klasy Nieodwracalne ma zawsze osobne „tak” na tę instancję z nazwaną stratą |
| przynależność skryptem | o tym, czy zdarzenie należy do klasy, decyduje sprawdzenie deterministyczne, nie osąd maszyny |
| zapis i raport | każde zastosowanie jest wpisem w księdze władz; zastosowanie władzy nieodwracalnej jest zgłaszane w chwili użycia, reszta w rytmie klienta |
| termin i odwołalność | data przeglądu; odwołalna jednym słowem |
| milczenie nie jest zgodą | po terminie misja jest parkowana na granicy bezpiecznego kroku, dzierżawy zwalniane poza węzłami z rozpoczętą sekwencją nieodwracalną, klient poinformowany; nigdy nie uruchamia zalecenia maszyny |
| język produktu | polityki techniczne są domu i ustawia je strażnik; klient je tylko zawęża w słowach produktu |

Polityki, które dom zna: wdrożeniowa, domyślna dla decyzji Łatwo cofnąć, budżetowa z rezerwą awaryjną, pierwszeństwa, eksperymentalna w słowach produktu, źródeł jako polityka domu, operacyjna jako polityka domu, retencji podpisana przy przyjęciu.

### 1.5 Progi

Liczba jest wyprowadzana z historii produktu, z norm domeny znalezionych w sieci albo ze słów klienta, z ujawnioną metodą; klient ją widzi i może zawetować; nigdy nie jest o nią pytany. Parametr produktu w słowach klienta nie jest progiem. Bramki i limity domu nie wprowadzają nowych stałych strojonych: czas czekania na zamek pochodzi z sufitu bramki, klasa modelu z księgi, wiek sondy z obietnicy, budżet z pieniędzy klienta [`layers-compatible-no-user-thresholds`, S35, S40].

### 1.6 Co maszyna robi, żeby role były tanie

Wydobywa cel rozmową w języku produktu, jedna decyzja na raz, zalecenie na głos. Bada świat zanim zapyta i proponuje granice do podpisu. Wyprowadza każdy próg. Kompiluje intencję w obietnice, dowody, przepływy i węzły. Zamienia świadectwo w incydent: klient podpisuje fakt, maszyna proponuje etykietę. Grupuje pytania w rytm klienta. Nigdy nie zadaje pytania wymagającego wiedzy inżynierskiej. Instrukcja techniczna klienta jest ograniczeniem karty i rozstrzygnięciem dyrektora, nigdy prawem; obserwacja klienta poza produkcją jest zapisem bez pytania [Ratatoskr, S07].

### 1.7 Odpowiedzialność

Osoba prawna i ubezpieczenie leżą poza modelem i muszą istnieć. Ślad, którego żadna strona sporu nie może napisać, jest w modelu: podpisy uwierzytelnione, księga domu poza repozytorium klienta, zakotwiczona w rachunku strony trzeciej. Dom nigdy nie trzyma produktu jako zakładnika: repozytorium jest klienta, dźwigni w kodzie nie ma i mieć nie powinno [S06].

---

## 2. Płaszczyzny i pętle

| Płaszczyzna | Co trzyma | Kto posiada |
|---|---|---|
| Konstytucja | gwiazda polarna maszyny, władze niedelegowalne, klasy kosztowe, bootstrap, sukcesja, prawo na repozytoriach maszyny, księga władz, polityki techniczne domu | strażnik |
| Intencja | obietnice ze statusem „planowane” jako wymagania, granice, polityki, podpisy, kolejka pytań, świadectwo, obserwacje | klienci przez Ratatoskra |
| Prawo | graf, reguły, drille, lock, incydenty, normy odcisku, pakiety prawa | maszyna w górę, klient w dół |
| Praca | misje, terytoria, bilety, robotnicy, bramka, retrospektywa | maszyna |
| Świat | środowiska, wdrożenia, dane, sondy, zależności, sieć, regulacje, obietnice operacyjne | maszyna operuje, świat odpowiada |
| Ekonomia | pieniądze na wynik, budżety, klasy modeli, ekspozycja | maszyna mierzy, klienci ustalają |
| Ja | repozytoria maszyny, briefy, skille, modele, ewaluacje, wersje | maszyna pod konstytucją |

Każda płaszczyzna buduje na niższej i nie zna wyższej [`mission-one-system` §2].

| Pętla | Przebieg |
|---|---|
| L1 Dostawa | wymaganie, karta, cięcie, konsultacja, przegląd, „go”, tick, lądowanie, zamknięcie fali, done, wdrożenie kompletu, obserwacja, świadectwo |
| L2 Prawo | odmowy, powtarzające się odpowiedzi, incydenty; legislator czytający „nigdy”; awans na dowodach z linią bazową; wycofanie martwych; propozycje wycofania z ciszą jako faktem; podpis klienta na obniżeniach |
| L3 Wyrocznia | świadectwo klienta, obserwacje z sond, próbkowany audyt; incydent z podpisem; przypadki drilli; retrodykcja; rekalibracja norm |
| L4 Ekonomia | kwota i model per przebieg z odpowiedzi hosta; limit przed rozdaniem i na granicy sekwencji; klasa z pochodzenia; cena per obietnica |
| L5 Ja | repozytoria maszyny jako terytoria; eksperymenty na miarach z zewnątrz; ewaluacje briefów; drabina zmian; wymiana modelu przed wycofaniem |
| L6 Wiedza | badanie sieci z proweniencją; zdarzenia zależności, doradztw i kalendarza; polityka źródeł domu; treść jako dane |
| L7 Koncepcja | prototyp, świadectwo, trajektoria zadeklarowanych odcisków, poprawka karty z ceną, wersja docelowa |

---

## 3. Władze

| Władza | Maszyna | Klient terytorium | Strażnik lub zastępca |
|---|---|---|---|
| podnieść prawo na dowodach | tak | | |
| obniżyć, wyciszyć, przesunąć datę przeglądu | nigdy | w swoim terytorium, z podpisem weryfikowanym przy użyciu, z kontrasygnatą | w repozytoriach maszyny |
| „go” | w ramach polityki o przynależności skryptem | tak | |
| budżet | wydaje w ramach; zatrzymuje się przed rozdaniem i na granicy sekwencji | ustala w pieniądzach | dla maszyny |
| próg | wyprowadza z pochodzeniem | weto | |
| „nigdy” | proponuje z badań i standardów | podpisuje | |
| pierwszeństwo | wykrywa konflikt | rozstrzyga | |
| odmowa wymagania | tak, zapisana | | powiadomiony |
| wdrożenie na produkcję | w ramach polityki wdrożeniowej, kompletem, z kanarkiem | zgoda lub polityka; to obniżenie rodzinnego „nigdy nie pushuj” | |
| cofnięcie wdrożenia | na obserwację różnicową; „oba czerwone” parkuje i budzi klienta | | |
| incydent | proponuje fakt i etykietę | podpisuje fakt | |
| obserwacja poza produkcją | zapisuje | zgłasza, bez pytania | |
| unieważnienie po podszyciu | wykonuje | żąda | powiadomiony |
| eksperyment na produkcie klienta | tylko w podpisanej kohorcie | podpisuje w słowach produktu | |
| zmiana własnych briefów i skilli | drabina pod bramką poprzedniego wydania; cofnięcie tego, co nie awansowało | | obniżenie własnej dyscypliny |
| wymiana modelu | proponuje z testem parowanym przed wycofaniem | | podpisuje; zastępca tylko „wznowienie” |
| zmiana tego, co maszyna twierdzi | nigdy sama | | tak |
| dostęp do sieci | tak, treść jako dane, z proweniencją | zawęża w słowach produktu | polityka źródeł |
| wyjście klienta | eksport, zwolnienie dzierżaw, usunięcie według retencji | żąda | |
| kod klienta A u klienta B; ręczna edycja locka; fabrykacja incydentu; wyciszenie bez podpisu; trzymanie produktu jako zakładnika | nigdy | nigdy | nigdy |

---

## 4. Księga domu i stan

**Zasada.** Zapis powstaje w chwili aktu, poza stroną związaną, z tożsamością producenta. Lądowanie jest chwilą zapisu.

| Zakres | Co | Trwałość |
|---|---|---|
| per produkt | graf, reguły, lock, dzienniki, incydenty, decyzje doradcze | commitowane w repozytorium klienta |
| per produkt | obietnice ze statusem i sekcjami wymagania, podpisy związane z obietnicą, identyfikator niezmienny | commitowane w repozytorium klienta |
| per produkt | stan misji: kolejka, pytania, decyzje, handoff, archiwum | replikowany do księgi domu; odtwarzalny po utracie maszyny |
| per produkt | zapis opieki przy lądowaniu: treść zdobytych wierszy dowodów, klasa, skrót wyniku bramki, wykonawca i ostatnie wykonanie, wersja maszyny | commitowany w treści, nie w identyfikatorze; git notes na commicie scalającym albo katalog opieki |
| per klient | fotel, polityki, budżet w pieniądzach, kolejka pytań, konsola | księga domu, podpisane |
| dom | księga władz; księga pieniędzy i ekspozycji; rejestr wersji maszyny; wyniki ewaluacji i wymian modeli; pamięć wiedzy z proweniencją; magazyn niewyrażalnego; konstytucja; audyt prawa | commitowane poza repozytoriami klientów, z kopią |
| dom | konfiguracja wykonywalna: polecenia bramek, uruchamianie robotników, lista dozwolonych zmiennych, kopiowane ścieżki | podpisana i commitowana; zmiana w trakcie misji odmówiona |

**Tożsamość producenta.** Wiersz księgi pieniędzy niesie kwotę i rozwiązany model, gdy host zwraca zużycie; inaczej jest jawnie „szacunkiem z wagi”. Remapowanie klasy na model jest cezurą w księdze, nie przelicznikiem. Rozwiązany model leży obok werdyktu, nie w jego skrócie. Stempel lądowania niesie wersję narzędzi, skrót briefów i modele per rola. Zamek bramki niesie hosta i identyfikator rozruchu [S18, S22, S25, S36].

**Koszt powstaje tam, gdzie jest zapisywany.** Bramka lądowania dopisuje koszt, wywołania sędziego, klasę i rundy biletu oraz odmowy reguł do własnego pliku wyniku, zanim skasuje drzewo. Odzysk sesji robotnika jest rundą i zostawia wpis. Cisza klienta po propozycji wycofania reguły jest faktem w dzienniku reguły [S33, S37, S29].

**Przypięcie per repozytorium.** Konfiguracja, dzierżawy, zamek i lock są jedne na repozytorium, więc jednostką przypięcia wersji maszyny jest repozytorium. Wersja podnosi się, gdy repozytorium nie ma misji w locie. Cofnięcie wersji to parkowanie wszystkich misji na repozytorium ze zwolnieniem dzierżaw. Dwie wersje współistnieją tylko na osobnych repozytoriach [S19].

---

## 5. Intencja

**Wymaganie jest obietnicą ze statusem „planowane”.** Plik scenariusza w języku człowieka, w kształcie kroków, z sekcjami: wymaganie, „po czym poznasz”, „nigdy”, pochodzenie progu, klient terytorium, pierwszeństwo, wierność, komplet, podpis. Test do niego jeszcze nie istnieje; sędzia sprawdzi zgodność, gdy powstanie. Konflikt z istniejącymi obietnicami jest wykryty przy zapisie [§2.10 wyprowadzenia, S31].

**Kompilator intencji.** Ratatoskr odczytuje zdanie z powrotem: co się zmieni, czego nie, kogo dotyczy, odwracalność, jak sprawdzić. Maszyna pisze scenariusz, klient czyta i mówi „tak”, robotnik pisze test, sędzia sprawdza zgodność w obie strony. Wierność intencji jest liczbą: odsetek par odrzuconych przez sędziego, odsetek scenariuszy poprawianych po akceptacji, czas do podpisu. Okno darmowej poprawki liczy się stanem wiersza, nie datą: wiersz jest wolny, dopóki żaden bilet go nie zajął [S01].

**Komplet.** Obietnica nazywa komplet biletów, które ją realizują. Bramka wdrożenia czyta komplet: dopóki komplet nie jest scalony, nic się nie wdraża i żadna sonda tej obietnicy nie biegnie. Kompletność jest mierzona liczbą biletów dopisanych po orzeczeniu architekta [S32].

**Wierność.** Prototyp to obietnica z zadeklarowaną masą brakującą: bez testów, migracji, ścieżki cofnięcia. Dług jest różnicą między odciskiem prototypu a odciskiem pełnej wierności. Klient widzi listę tego, czego brakuje, w słowach produktu [E7].

**Poprawka karty ma cenę.** Zmiana koncepcji wchodzi w życie dopiero, gdy klient zobaczył, co poprzednia koncepcja kosztowała i które wiersze przestały być potrzebne, z faktów księgi, nie z estymaty. „Stop” mówi klient [S02].

**Time-box klienta** jest linią karty czytaną przed rozdaniem, jak sufit kosztu. Po dacie tick nie rozdaje nowych biletów i renderuje pokrycie katalogu w słowach produktu; zatrzymanie tylko na granicy bezpiecznego kroku. Dom sprzedaje wiersze i sufit, nigdy datę [S03, Ratatoskr].

**Wymaganie bez klasy dowodu** nie dostaje miary zastępczej: zostaje obietnicą „planowane” w słowach klienta z datą przeglądu, a jej jedynym wykonawcą jest świadectwo klienta po wdrożeniu. `done` nie przyjmuje napisu [S34].

**Przeniesienie obietnicy** między terytoriami jest pytaniem „charter” z kontrasygnatą strony przyjmującej; identyfikator obietnicy jest niezmienny, ścieżka pliku nie jest identyfikatorem [S31].

---

## 6. Prawo

**Zapadka.** Reguła wchodzi szkic, doradcza, egzekwowana, na dowodach, bez podpisu. W dół tylko podpis klienta terytorium w jego terytorium. Awans na egzekwowaną czyta własną linię bazową: odmowy na poziomie bazy to dług, powyżej to nowość; dług nie blokuje awansu i nie blokuje dotknięcia plików w trybie progresywnym, który jest standardem domu podpisanym raz przy przyjęciu [S28, G19, G39].

**Legislator i retrospektywa czytają podpisane „nigdy” obietnic terytorium.** Element, którego zdanie dotyka przedmiotu objętego „nigdy”, ląduje w „niewyrażalne” i wraca do klienta, nie staje się regułą. Styk przedmiotów jest osądem modelu, więc asymetria zapadki jest mierzona liczbą reguł wycofanych po podpisie [S21].

**Konflikt dwóch reguł.** Para odmówiona jednocześnie przez dwie reguły jest konfliktem, nie obniżeniem: pytanie „charter” do klienta terytorium przy pierwszej wspólnej parze. Zapadka nie cofa własnego awansu [S20].

**Obniżenia są zakresowe**: reguła i pliki biletu, nigdy cała misja. „Nigdy” z kontrasygnatą jest nieobniżalne bez drugiej strony. Obniżenie reguły pakietu domu zatrzymuje się na doradczej, żeby pomiar został; zmiany zrobione na bazie poza misją widać w indeksie jakości, a konsola mówi, czego już nie umie pokazać. Dom nie odmawia obsługi z powodu obniżenia [S02 wyprowadzenia, S30].

**Cisza jako fakt.** Po terminie propozycji wycofania reguły maszyna dopisuje do dziennika reguły: kiedy zaproponowano, ile lądowań reguła odmówiła od tamtej pory, że odpowiedzi nie było. Jedno pytanie na regułę, nigdy partia. Audyt prawa jest trwały poza stanem misji [S29].

**Data przeglądu obietnicy** jak data przeglądu reguły: odrzucona para z obietnicą po dacie jest pytaniem „charter”, a `done` odmawia do odpowiedzi. Sędzia par jest w standardzie domu egzekwowany, nie doradczy; sam sędzia jest mierzony próbkowaniem do drugiego sędziego z przedziałem Wilsona [S24, G22, G38].

**Pakiety prawa domu** rosną z incydentów u wielu klientów, anonimowe, publikowane przez `yg pack`. To jedyna wiedza, która legalnie przechodzi między klientami. Pierwsza konstytucja produktu greenfield jest cienka i dom to mówi; decyzje techniczne o skutkach produktowych idą do klienta jako kompromisy produktowe [E7].

---

## 7. Dowody

### 7.1 Rejestr scenariuszy

Warstwa dowodów domu: pełna suita e2e w środowisku w pełni syntetycznym; wszystko, czego nie da się traktować jak zależności deweloperskiej, zastąpione stubem według dokumentacji dostawcy i uzupełnione stubem nagranym z prawdziwego dostawcy; to, co da się postawić, postawione jako stand-in; każdy test sparowany 1:1 z plikiem scenariusza w języku człowieka; zmiana testu uruchamia sędziego, który mówi, czy plik opisuje to, co robi test; testu nigdy się nie osłabia, chyba że to intencja zleceniodawcy, wyrażona pytaniem „charter”. Środowisko syntetyczne kontroluje czas, losowość i współbieżność. Dane testowe są maskowane dowodem deterministycznym na kształtach, z drillem i zerem fałszywych alarmów; zrzut produkcji nigdy nie zasila środowiska [§2.10 wyprowadzenia, G23, S43].

Ten sam scenariusz, trzy wykonania, tam gdzie wykonawca istnieje: środowisko syntetyczne to dowód hermetyczny, staging to integracja, syntetyczne konto na produkcji to sonda per obietnica. Plik się nie zmienia, zmienia się wykonawca. Obietnica bez wykonawcy sondy nie parkuje po cichu: jest jawna, z wiekiem ostatniego realnego wykonania, czytanym przy zamknięciu fali [S14].

### 7.2 Klasy dowodów i wykonawcy

| Klasa | Co dowodzi | Wykonawca | Uwaga |
|---|---|---|---|
| scenariusz e2e w środowisku syntetycznym | zachowanie całej aplikacji przy stubach i stand-inach | bramka lądowania | klasa domyślna |
| test hermetyczny | nasz kod bez świata | bramka | |
| test odwrócony lub mutacja | test umie być czerwony | bramka | mutacja domyślna dla biletów dotykających istniejącej obietnicy |
| stub nagrany z prawdziwego dostawcy | że stub mówi to, co dostawca | straż, z poświadczeniami | uzupełnienie stubu z dokumentacji |
| scenariusz, film, zrzut | zachowanie widoczne | robotnik, sprawdzone przez bramkę | |
| charakteryzacja | co kod robi dziś, zanim go tkniemy | robotnik, brownfield | |
| próba danych | migracja na kopii produkcyjnego kształtu | straż, poza limitem czasu bramki; wynik jako plik ze skrótem | `done` weryfikuje plik |
| próba obciążeniowa | gorąca ścieżka pod ruchem | straż | liczba z historii sprzedaży, z pochodzeniem |
| sonda produkcyjna | obietnica trzyma się w działaniu | straż | binarna; wykonywana różnicowo wobec celu cofnięcia |
| sonda z zegarem świeżości | kontrakt zewnętrzny nadal obowiązuje | straż | maksymalny wiek obserwacji jako parametr obietnicy w słowach klienta |
| pomiar z progiem o pochodzeniu | metryka produktu | Researcher | próg wyprowadzony, do weta |
| dowód własności | maszyna stanów, niezmienniki | robotnik, na żądanie klasy Nieodwracalne | |
| świadectwo klienta | to, czego nie da się zmierzyć | klient po wdrożeniu | obietnica „planowane” bez miary zastępczej |

Każdy wiersz katalogu dowodów niesie klasę, wykonawcę i ostatnie realne wykonanie; wiersz bez klasy nie wchodzi do karty; wiersz, którego jedynym wypełnieniem jest napis, odmawia `done` [E1, S12, S14].

### 7.3 Klasy odwracalności

| Klasa | Bramka wymaga dodatkowo |
|---|---|
| Łatwo cofnąć | nic ponad dziewięć punktów; polityka domyślna może wybrać zalecenie maszyny |
| Trudno cofnąć | ścieżka cofnięcia udowodniona jako wiersz dowodu; wdrożenie etapami z obserwacją między etapami |
| Nieodwracalne | próba danych; osobne „tak” na tę instancję; osoba wymagana prawem, jeśli polityka ją nazywa; sonda po kroku; sekwencja zaplanowana tak, by każdy krok był bezpiecznym miejscem zatrzymania |

Klasa jest polem biletu, kroku wdrożenia i zmiany maszyny. Nie da się jej obniżyć w tej samej ręce, która pisze kod [E1, S38].

### 7.4 Dowody nigdy nie słabną

Straż dwudrzewna obok strażnika prawa w lądowaniu: liczba scenariuszy, kroków i asercji nie maleje, wynik mutacji nie maleje, bez odpowiedzianego pytania „charter”. To nie jest aspekt Yggdrasila, bo aspekt widzi jedno drzewo [E4].

---

## 8. Praca

Misja biegnie w Hordzie: karta, cięcie, konsultacja, przegląd architekta, ramka, „go”, tick, lądowanie, zamknięcie fali, retrospektywa, `done`. Dom dokłada:

- **Tick czyta limit pieniędzy przed rozdaniem** i limit na granicy sekwencji nieodwracalnej: odmawia pierwszego biletu sekwencji, gdy reszta budżetu nie pokrywa jej całej według księgi; sekwencja rozpoczęta biegnie do końca; przekroczenie raportowane klientowi w słowach skutku. Time-box klienta czytany w tym samym miejscu [S02, S03, S38].
- **Lądowanie**: dziewięć punktów Hordy, straż „dowody nigdy nie słabną”, residuum odcisku jako sygnał uwagi, nigdy bramka; zapis kosztu, wywołań sędziego, klasy i rund, odmów reguł, wykonawcy i wykonania, zanim drzewo zniknie; trailer `Machine:` obok `Ticket:`, `Evidence:`, `Law:` [S37, G34].
- **Odzysk sesji jest rundą**: reconcile zapisuje przejęcie wierszem rundy, licznik, eskalacja klasy i księga widzą śmierć sesji; stosunek śmierci sesji do czerwonych bramek jest sygnałem cięcia węzła, nie wymiany robotnika [S33].
- **Klasa biletu z pochodzenia**: domyślna z tego, na jakiej klasie bilety tego węzła kończyły ostatnio na zielono, z księgi domu; architekt podnosi swobodnie, obniża z zapisanym powodem [S40].
- **Zamek bramki** niesie hosta i identyfikator rozruchu; przejęcie tylko w obrębie tego samego rozruchu, obcy host to nazwana odmowa; czas czekania wyprowadzony z sufitu bramki; przepustowość to jedno lądowanie na czas bramki na repozytorium i jest mierzona [S35, S36].
- **Niedostępność dostawcy modelu** jest odróżniona od odmowy: bez rundy, zamek zwolniony, ponowienie z odstępem [S3 wyprowadzenia].
- **Dzierżawa zasobów wspólnych**, których węzły nie dzielą: sekwencja migracji, wspólny schemat, plik blokady zależności; scalenie trunk na trunk przed jakimkolwiek PR, gdy dwie hordy biegną na jednym repozytorium; przejęcie terytorium między klientami tylko z podpisem klienta terytorium [S5 wyprowadzenia, E3].
- **Pytania mają termin.** Po terminie: parkowanie na granicy bezpiecznego kroku, dzierżawy zwalniane poza sekwencjami nieodwracalnymi, klient poinformowany [S24].

---

## 9. Świat

**Wdrożenie i push.** Rodzina mówi „push nigdy” i Horde tak zostaje. Polityka wdrożeniowa jest obniżeniem tego „nigdy” i dlatego podpisuje ją wyłącznie klient terytorium, per terytorium, odwoływalnie, z kontrasygnatą. Czwarty poziom bramki po trunk i base: środowisko, czytane kompletem. Podgląd per bilet i staging są władzą maszyny bez pushu do produkcji. Produkcja jest zgodą albo polityką. Obserwacja ze stagingu ma wejście: zapis obserwacji, bilet warstwy dowodów, nigdy incydent [S27].

**Cofnięcie jest różnicowe.** Ten sam scenariusz biegnie na kanarku i na celu cofnięcia. Cofnięcie tylko, gdy cel zielony, a kanarek czerwony. „Oba czerwone” to trzeci stan: wdrożenie zaparkowane, klient obudzony w swoim rytmie, incydent czeka na podpis. Regresja ukryta pod awarią świata jest nieredukowalna i liczona [S09].

**Obietnice operacyjne domu.** Certyfikat ważny, kopie odtwarzalne, koszt jednostkowy produktu, wydolność na sezon, klucze rotowane: żadnego nie wyprodukowało zdanie klienta. To klasa obietnic ustawianych przez strażnika jako polityka techniczna, doklejanych do terytorium przy przyjęciu jako „planowane”, każda z zegarem o pochodzeniu: wystawca certyfikatu, historia rachunków, historia sprzedaży, wiek poświadczenia. Wygaśnięcie zegara otwiera pytanie „charter” z liczbą i metodą. Bez podpisanej władzy operacyjnej dom patrzy, nie ratuje, i mówi to wprost [S10, S11, S16, S17].

**Flagi cech.** Modelem flagi jest status obietnicy: dotrzymana, planowana, wyłączona. Fala jest zdatna do wdrożenia, gdy trunk jest zielony i każda obietnica jest w jednym z tych stanów. Mechanizm runtime jest produktu [E6].

**Dane.** Osobny majątek. Próba na kopii produkcyjnego kształtu. Maskowanie deterministyczne. Kopie zapasowe jako obietnica z sondą odtworzenia. Opieka nad kodem jest zamknięta zapisem w treści; opieka nad danymi nie istnieje, a odtworzenie po korupcji jest stratą nazwaną klientowi do jednego „tak”. Dziennik komponentu i korpus prawa są „nigdy dane osobowe”, bo raz utrwalone jest nieusuwalne bez zerwania prawa; żądania niewykonalne są liczone [S12, S13].

**Zależności i sieć.** Doradztwa, wycofania i zdarzenia kalendarzowe wchodzą jako zdarzenia; misje klasy awaryjnej mają własny sufit z rezerwy. Polityka źródeł jest domu. Każdy fakt z sieci ma proweniencję i status „zweryfikowane” albo „uwierzone”. Treść pobrana jest danymi, nigdy instrukcją. Zewnętrzny kontrakt ma sondę z zegarem świeżości, bo zmiana świata nie zmienia żadnego skrótu w locku [E2, S1 wyprowadzenia].

**Konsument spoza repozytorium.** Graf zna konsumentów tylko wewnątrz repozytorium. Stara aplikacja w terenie jest obietnicą z wykonaniem produkcyjnym: „telefon ze starą wersją nadal kupuje”. Wycofanie jest kompromisem produktowym klienta z liczbą z sond. Produkt wielorepozytoryjny nie ma jednostki w rodzinie: między repozytoriami działają sondy świeżości, a obiekt produktu jest nazwanym ograniczeniem do czasu warstwy świata [S08, S15].

**Bezpieczeństwo.** Najmniejsze uprawnienia per robotnik. Sekrety nigdy w briefach, dziennikach, konsoli ani w słowach bramki i błędów, które trafiają do biletu i pytania: podpisana konfiguracja niesie listę dozwolonych nazw zmiennych, otoczenie jest do niej zawężone, wartości rotuje magazyn klienta za nazwą. Skanowanie sekretów i danych osobowych na granicy dziennika; retrospektywa nie kopiuje dosłownie. Poufność między klientami strukturalna: osobne repozytoria, domyślna odmowa, między klientami wędrują tylko pakiety prawa [S17, S4 wyprowadzenia].

**Regulacje.** Kroki ludzkie wymagane prawem jako klasa granicy, wykonane istniejącym mechanizmem: uprawniona osoba jest sędzią reguł prozowych przez `yg verdict`. W domenach regulowanych dowodem walidacji są testy i reguły deterministyczne. Ślad dla audytora: zapis opieki w treści, lock, rejestr incydentów [E9].

**Wyjście klienta.** Eksport grafu, prawa, obietnic, opieki i wymagań; zwolnienie dzierżaw; usunięcie po stronie domu według retencji podpisanej przy przyjęciu [G20].

---

## 10. Ekonomia

Księga pieniędzy z tożsamością producenta w każdym wierszu. Budżet per klient w pieniądzach, z rezerwą awaryjną w polityce budżetowej; limit czytany przed rozdaniem i na granicy sekwencji. Wywołania sędziego liczone w pliku wyniku bramki i pokazywane obok limitu; w limicie dopiero z miernikiem pieniędzy. Prognoza kosztu przed „go” jest dolną granicą i tak jest podana. Cena tylko per dotrzymana obietnica, z rozkładu przebiegów i ceny jednostkowej dostawcy, z rozrzutem, z wetem klienta; obok dwie liczby: obietnice na jedno zdanie klienta i pytania „lower” na misję. Rachunek za infrastrukturę produktu jest obietnicą operacyjną z sondą; decyzja o nim jest klienta [S18, S37, S39, S11].

---

## 11. Maszyna

- **Wersja maszyny**: skrót briefów, wersje narzędzi, modele per rola; stempel na każdym lądowaniu; przypięcie per repozytorium [S19].
- **Drabina zmian maszyny**: szkic, kanarek na kohorcie podpisanej w słowach produktu, wszędzie. Dwa zegary: retrodykcja jako wskaźnik zastępczy, prospektywne ucieczki z księgi domu jako prawda. Cofnięcie tego, co nie awansowało, jest maszyny; obniżenie tego, co awansowało, strażnika [E10].
- **Bootstrap**: zmiany repozytoriów maszyny lądują pod bramką poprzedniego wydania narzędzi [E10].
- **Ewaluacje behawioralne** briefów i skilli są warunkiem samomodyfikacji; drille dyscyplin są, ewaluacje pod presją trzeba zbudować [G10].
- **Model jako zależność**: protokół parowany uruchamiany przed datą wycofania; dwa źródła modeli dla sędziego jako polityka domu; rozwiązany model obok werdyktu i czytany przez punkt „judge” bramki; zmiana modelu bez wpisu w księdze władz odmawiana przez narzędzia; absencja strażnika przy wycofaniu to kolejka zaparkowanych misji, nigdy ciche przepięcie [S23, S25].
- **Luka w repozytorium maszyny**: doradztwo jako zdarzenie z pytaniem, nigdy ciche podniesienie; werdykty przypisane nieaktualnemu parserowi liczone; odświeżenie werdyktów po podniesieniu narzędzia jest decyzją [S22].
- **Konstytucja** egzekwowana trzema drogami: narzędzia odmawiają, każda władza zostawia podpisany wpis w księdze władz, drille i `yg check` na repozytoriach maszyny czytają tę księgę. Treść konstytucji: lista władz niedelegowalnych, klasy kosztowe, sukcesja i klasy delegacji, bootstrap, drabina, brief maszyny bez tekstu z produktu klienta, wymaganie jako dane, dom nigdy nie trzyma zakładnika, dziennik i korpus prawa nigdy dane osobowe, polityki techniczne domu, magazyn niewyrażalnego z czytelnikiem i limitem [G10, G18, G26, S06, S13].

---

## 12. „Gotowe” na każdym poziomie

| Poziom | Gotowe znaczy |
|---|---|
| bilet | dziewięć punktów; dowody nie osłabione; klasa odwracalności spełniona; zapis lądowania w księdze |
| komplet | każdy bilet obietnicy scalony; dopiero teraz wdrożenie i sonda |
| fala | pokrycie dowodów bez luk; indeks jakości nie spadł; każda podniesiona reguła wypisana; trunk zdatny do wdrożenia; obietnice bez wykonawcy sondy wypisane z wiekiem |
| misja | każdy wiersz odtworzony przez wykonawcę swojej klasy; pełna bramka; raport w pieniądzach; retrospektywa; zapis opieki commitowany |
| wydanie produktu | bramka wdrożenia kompletem; kanarek różnicowy; okno obserwacji bez naruszonej sondy; klient poinformowany |
| wydanie maszyny | ewaluacje behawioralne; retrodykcja nie gorsza; kanarek na kohorcie; okno prospektywne; podniesione tylko na repozytoriach bez misji w locie |

---

## 13. Nieredukowalne

Żadnej z tych luk nie da się zamknąć; każdą model mierzy.

| Luka | Dlaczego | Co model mierzy |
|---|---|---|
| klient mówi „tak” scenariuszowi, którego nie przeczytał | akceptacja jest jedynym sprawdzeniem zgodności z intencją | czas do podpisu; odsetek scenariuszy poprawianych po akceptacji |
| zbiór scenariuszy wierny, a niepełny | żaden test nie dowodzi nieobecności przypadku, o którym nikt nie pomyślał | ślady z produkcji poza scenariuszami; incydenty; niewyrażalne |
| stub mówi to, w co maszyna wierzy | dowód hermetyczny nie widzi świata | zegar świeżości; stub nagrany |
| sędzia par jest modelem | osąd, nie skrypt | drugi sędzia z przedziałem; mutacja na siłę asercji |
| ciekawe konflikty między klientami | nieklasyfikowalne z góry | konflikty eskalowane na misję |
| zakazy nie wynikają z praktyki | żadna praktyka nie zawiera „nigdy” | „nigdy” na produkt i skąd przyszły |
| kompetencja klienta wchodzi kanałem poza domem | recenzja kodu przez klienta bywa trafna, a dom jej nie kontroluje | rozstrzygnięcia wzięte z recenzji klienta |
| opieka nad danymi po korupcji | korupcja nie ma commita; rekordy zmieszane | opóźnienie do podpisu; udział rekordów bez pochodzenia |
| utrwalenie kontra usunięcie | ślad dla audytora jest nieusuwalny bez zerwania prawa | żądania niewykonalne |
| styk reguły z „nigdy” | osąd modelu | reguły wycofane po podpisie |
| absencja strażnika przy wycofaniu modelu | podpis niedelegowalny | kolejka zaparkowanych misji |
| wymaganie bez miary | nie ma czym dowieść | obietnice „planowane” bez miary i ich wiek |
| regresja ukryta pod awarią świata | oba wykonania czerwone | trzeci stan |
| wydolność świata poza stubem | pierwszy szczyt jest pierwszym pomiarem | wyprzedzenie między zegarem a podpisem |

---

## 14. Rejestr luk wobec rodziny 6.0.0

Co trzeba zbudować, pogrupowane według miejsca lądowania. Wszystko addytywne. Rdzeń Yggdrasila nietknięty.

**Horde**
- podpis weryfikowany przy `bind`, `land`, `demote`, `ask answer`; kontrasygnata; unieważnienie; przejęcie terytorium tylko z podpisem klienta [G2, G15, G28]
- księga domu w chwili aktu: trwały stan misji; zapis opieki w treści; koszt, wywołania sędziego, klasa i rundy, odmowy reguł, wykonawca i wykonanie w pliku wyniku bramki; trailer `Machine:` [G3, G27, G31, G34]
- miernik pieniędzy z tożsamością modelu; limit przed rozdaniem i na granicy sekwencji; rezerwa awaryjna; cezura klas; klasa z pochodzenia; odzysk jako runda [G4, G40, G41]
- klasy odwracalności i dowodów jako pola biletu i karty; wykonawca dowodów długich; `done` odmawia napisu i wiersza bez klasy [G13]
- czwarty poziom bramki: środowisko, kompletem; kanarek różnicowy; trzeci stan; cofnięcie; poświadczenie sondy z zegarem [G6, G30, G40]
- harmonogram wielu misji; budżety per klient; „go” asynchroniczne; pytania z terminem; parkowanie na granicy bezpiecznego kroku; time-box jako linia karty; wejście zdarzeń [G7, G9, G29]
- straż „dowody nigdy nie słabną”; obniżenie zakresowe; obniżenie reguły pakietu do doradczej; konflikt dwóch reguł; „nigdy” jako wejście retro i legislatora; awans z linią bazową; cisza jako fakt; audyt trwały [G14, G16, G36, G39, G43, G47]
- niedostępność osobno od odmowy; zamek z hostem i rozruchem; czekanie z sufitu; dzierżawa zasobów wspólnych; trunk na trunk [G17, G42]
- konfiguracja wykonywalna podpisana; lista dozwolonych zmiennych; kopiowane ścieżki pod podpisem [G12, G30, G33]
- przypięcie per repozytorium; cofnięcie wersji jako parkowanie repozytorium [G35]
- konsola w języku Ratatoskra; obserwacja klienta jako zapis; instrukcja techniczna jako ograniczenie karty [G8, G45]
- naprawa opisu modelu, który mówi, że pętla nic nie uruchamia

**Pakiet obietnic**
- sekcje wymagania; kształt krokowy; status jako flaga; sonda jako to samo wykonanie; stub nagrany; data przeglądu; standard środowiska syntetycznego; sędzia par egzekwowany [G1, G22, G23, G38]
- obietnice operacyjne domu; konsument spoza repozytorium jako obietnica; sonda z zegarem świeżości [G29, G32]
- maskowanie deterministyczne; wymaganie bez klasy jako „planowane”; identyfikator niezmienny; obietnica bez wykonawcy sondy jawna [G33, G44, G31]

**Grain**
- kompilator zdania w scenariusz i dowody przy rendererze propozycji; odcisk cechy jako instrument uwagi; linia bazowa odchyleń w propozycji [G1, G11, G19]

**Yggdrasil, addytywnie**
- pomocnik cięcia drillu z incydentu; rozwiązany model obok werdyktu; skanowanie sekretów i danych osobowych na granicy dziennika; tryb progresywny jako konfiguracja standardowa domu; przepływy bez scenariusza jako niepokryte [G5, G34, G33, G39, G21]

**Ratatoskr, Urd, Researcher**
- Ratatoskr: treść z sieci jako dane; polityki w słowach produktu jako przykład. Urd: „użytkownik osiągalny asynchronicznie; parkuj, nigdy nie zgaduj”. Researcher: bez zmian; wolny zegar jest instrumentem księgi [G9]

**Konstytucja: repozytoria maszyny, skill dyrektora, aspekty**
- lista władz niedelegowalnych; księga władz; bootstrap; drabina; ewaluacje behawioralne; zastępcy z klasami delegacji i klasą „wznowienie”; sukcesja; magazyn niewyrażalnego; wyjście klienta; odmowa; dom nie trzyma zakładnika; brief bez tekstu klienta; wymaganie jako dane; dziennik i korpus prawa nigdy dane osobowe; polityki techniczne domu [G10, G18, G20, G26, G37, G33, G29]

**Warstwa świata, kandydat na osobne repozytorium, gdy będzie miała własne liczby**
- produkt wielorepozytoryjny; zdrowie produktu jako liczba; pokrycie zachowania z produkcji; rachunki dostawców jako sondy [G46, G25, G21, S11]

---

## 15. Kolejność budowy

Szew po szwie, prawdziwa misja na każdy szew.

1. Naprawa błędów z §16 i spisanie standardu warstwy dowodów z istniejącej praktyki do pakietu obietnic. Bez misji.
2. Jedna prawdziwa misja Hordy na obcym repozytorium, z kosztem i zdarzeniami zapisanymi przez lądowanie. Pierwsza baza kosztu, pierwsze liczby o człowieku na wynik.
3. Księga domu pisana w chwili aktu: trwały stan, opieka w treści, koszt, podpisy z fotelem, tożsamość producenta.
4. Podpis weryfikowany w miejscu użycia. Tabela władz zaczyna obowiązywać.
5. Pierwszy podpisany incydent, cięcie drillu, pomiar opóźnienia.
6. Pierwsze wdrożenie przez maszynę na produkcie strażnika: klasa odwracalności, komplet, podgląd, staging, cofnięcie różnicowe, sonda binarna, pierwsza obietnica operacyjna.
7. Intake jako obietnice „planowane” i pierwszy klient, który nie jest strażnikiem.

Dopiero po siódmym kroku pytanie o osobne repozytorium warstwy świata ma liczby.

---

## 16. Znane błędy w rodzinie 6.0.0

| Błąd | Gdzie | Skutek |
|---|---|---|
| limit kosztu misji nie jest sprawdzany przed rozdaniem; narzędzie istnieje, pętla go nie wywołuje | Horde, `tick.mjs` | budżet przekroczony bez zatrzymania |
| opis modelu mówi, że pętla nic nie uruchamia; skrypt pod runnerem zewnętrznym uruchamia robotników | Horde, `reference/model.md` | dokumentacja sprzeczna z kodem |
| brak uprawnień do cudzego procesu czytany jako „żyje” | Horde, `land.mjs` | po restarcie zamek bramki nigdy nie jest przejmowany |
| pętla bierze ten sam zamek co lądowanie i kończy się po dwóch minutach czekania | Horde, `tick.mjs` | pod `--watch` pętla umiera przy pierwszej kolizji z lądowaniem |
| odzysk sesji robotnika nie zostawia wpisu w dzienniku biletu | Horde, `queue.mjs` | bramka czerwona za księgowość maszyny; rundy i koszt nie widzą śmierci sesji |

Ograniczenie, nie błąd: tabela zdrowia reguł nie ma postaci maszynowej razem z `--json`, więc partii propozycji wycofania nie da się złożyć narzędziem.

---

## Źródła

- `ai-software-house-2026-09-13.md`: wyprowadzenie modelu, recenzje, piętnaście eksperymentów, luki G1–G47, czterdzieści symulacji.
- `ai-software-house-simulations-2026-09-13.md`: katalog czterdziestu sytuacji i protokół symulacji.
- Rozstrzygnięcia rodziny: `layers-compatible-no-user-thresholds`, `quality-always-authorised`, `law-loop-b1-not-doing-it-with-numbers`, `no-rewrite-one-chain-three-gates`, `prose-aspects-draft-by-default`, `commits-local-push-never`.
