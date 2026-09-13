# Odcisk cechy: jak daleko sięga matematyka

Laboratorium na repozytoriach publicznych, 2026-09-13. Pytanie badawcze: czy odchylenie zmiany od środowiska, w
którym ląduje, da się zmierzyć tak, żeby ta liczba mówiła, czy zmiana jest wadliwa. Odpowiedź, liczbami: nie w
tej postaci, w której koncepcja została zgłoszona. Jedna z pięciu składowych odcisku niesie mały, prawdziwy sygnał.
Reszta jest przekodowaniem rozmiaru zmiany albo popularności pliku. Negatywy zapisane z taką samą starannością jak
pozytywy, bo to one wyznaczają, co warto budować.

Wersja robocza pisana pod Grain w stanie z gałęzi `claude/autonomous-self-evolving-system-oiveiz`; harness
laboratorium leży w `tests/stress/fingerprint/`, dziennik eksperymentów w `tests/stress/fingerprint/lab/`. Żadna
liczba w tym dokumencie nie pochodzi z pamięci; każda ma wiersz w `lab/log.md` i plik wyjściowy w archiwum
przebiegów.

## 1. Wynik w jednym akapicie

Na dziewięciu, a potem piętnastu repozytoriach publicznych w ośmiu językach, z modelem zbudowanym wyłącznie z
historii sprzed punktu odcięcia i etykietami wadliwości z późniejszych poprawek, żadna miara „zaskoczenia" kodu
(bity pod słownikiem repozytorium, pod słownikiem modułu, pod poprzednią wersją pliku, pod trigramem tokenów, na
porcjach stałej długości) nie przewiduje późniejszej poprawki lepiej niż sama liczba dodanych linii, ani wewnątrz
repozytorium, ani w przeniesieniu między repozytoriami. Wewnątrz wadliwej zmiany zaskoczenie wskazuje plik
naprawiany gorzej niż rzut monetą, a rozmiar i częstość zmian pliku wskazują go dobrze. Partner co-change, którego
Grain nazywa, a zmiana nie dotknęła, jest później naprawiany dokładnie tak często jak dowolny inny plik o tej samej
częstości zmian. Nowość kształtu zmiany (zestaw plików bez precedensu) nie niesie nic. Jedyna składowa, która
przetrwała kontrolę rozmiaru i przeniesienie: sprzężenie briefu z kodem, czyli ile z dodanego kodu opis zmiany
„opłaca" bitami; kod, którego brief nie wyjaśnia, jest później naprawiany częściej, o około 0,01 AUC ponad sam
rozmiar, w 8 z 9 repozytoriów w przeniesieniu, a po replikacji w 10 z 13. To za mało na dowód, dość na miękką bramkę
wyjaśnialności. Dowodu dowiezienia cechy nie da się z tego korpusu zmierzyć w ogóle: nie istnieje etykieta
„niedowiezione", którą można by z historii odczytać. Koncepcja zmieniona, z kodu na dowody, też nie przechodzi
przez historię: lądowania bez testów są poprawiane rzadziej, nie częściej, bo testy w historii znaczą „dodano
zachowanie", a nowy kod bez pokrycia testami nie wraca jako poprawka częściej niż pokryty. Etykieta z historii
widzi ekspozycję, nie ochronę.

## 2. Koncepcja, którą sprawdzano

Zgłoszona teza brzmiała: cecha ma brief; brief da się przeanalizować matematycznie względem kodu; zmiana ma
„odcisk" mierzony jako odchylenie od środowiska, do którego jest dodawana; odcisk mówi, czy cecha jest wadliwa
albo niedowieziona. Grain jako narzędzie do rozbudowy, bo już liczy bity pod modelem repozytorium.

Rozłożono to na pięć mierzalnych składowych, każda z własnym instrumentem:

| składowa | co mierzy | instrument |
| --- | --- | --- |
| zaskoczenie bajtowe | ile bitów kosztują dodane linie pod modelem repozytorium z chwili odcięcia | słownik zstd 1 MiB ze źródeł w T; warianty: słownik modułu, poprzednia wersja pliku, trigram tokenów, porcje 512 B względem kosztu porcji własnego kodu repozytorium |
| nowość słownika | udział identyfikatorów i importów, których repozytorium w T nie znało | słownik identyfikatorów i importów w T |
| kształt zmiany | czy zestaw plików, katalogów i par plików ma precedens w historii | indeks do 4000 commitów sprzed T; odległość Jaccarda do najbliższego |
| instrumenty Grain | odstępstwa od certyfikowanych konwencji, nienaruszeni partnerzy co-change, niespełnione obligacje narodzin pliku | `grain review --range`, `grain obligation` w worktree zamrożonym w T |
| sprzężenie briefu z kodem | ile z dodanego kodu opis zmiany wyjaśnia: na poziomie identyfikatorów (bity unigramowe) i bajtów (kompresja warunkowa) | opis commita; dla merge także opisy commitów, które wniósł |

Do tego bazowa lista dziesięciu cech „just-in-time" z literatury (linie dodane i usunięte, liczba plików,
katalogów, entropia rozproszenia, historia plików, doświadczenie autora, komunikat o poprawce, testy w zmianie,
merge), żeby każdy wynik odcisku mierzyć jako przyrost ponad to, co pole już umie.

## 3. Metoda

- **Korpus.** Pełne klony: CleanArchitecture (C#), Slim (PHP), axum (Rust), chi i gin (Go), express (JavaScript),
  flask (Python), sinatra (Ruby), spring-petclinic (Java); replikacja: click, requests (Python), koa (JavaScript),
  mux, logrus (Go), serde json (Rust). Lądowania to commity pierwszego rodzica na głównej linii.
- **Odcięcie.** T na 70% historii lądowań. Każdy model (słownik, słowniki lokalne, trigram, model Grain w
  odłączonym worktree, indeks kształtów, słownik identyfikatorów) zbudowany wyłącznie z historii do T.
  Sprawdzono, że Grain w worktree czyta `git log` od HEAD, więc nie widzi commitów po T.
- **Kandydaci.** Pierwsze 80% lądowań po T; ostatnie 20% to horyzont, w którym mogą przyjść poprawki.
- **Etykiety.** SZZ-lite: lądowanie z komunikatem poprawki (albo revert) ma usunięte linie obwinione w rodzicu;
  kandydat jest „wadliwy", gdy poprawka obwinia linię, którą wprowadził. Poprawki dotykające więcej niż 40 plików
  pominięte. Każda etykieta zachowuje pochodzenie (sha poprawki, odniesienie do sprawy, revert, liczba
  obwinionych linii), więc warianty etykiet (tylko poprawki związane ze sprawą, okno, minimalna liczba linii)
  liczone są bez ponownego przebiegu.
- **Ocena.** Regresja logistyczna z karą L2, cechy standaryzowane wewnątrz fałdy, 5 fałd warstwowych, trzy
  ziarna; AUC i precyzja w górnych 10%; sparowany bootstrap na ΔAUC (1000 losowań); przeniesienie
  leave-one-repository-out z cechami standaryzowanymi per repozytorium (bez etykiet). Do tego AUC pojedynczej
  cechy surowe i po usunięciu jej liniowej zależności od logarytmu dodanych linii, oraz korelacja rangowa z
  rozmiarem, żeby wykryć cechy będące przebraniem rozmiaru.
- **Zakres lądowań.** Główne tabele liczone na lądowaniach, które dodają choć jedną linię kodu. Tabela „wszystkie
  lądowania" jest pokazana raz, bo pokazuje artefakt.
- **Kalibracja literaturą.** Sam rozmiar zmiany jako predyktor (LApredict) daje w literaturze AUC około 0,71
  wewnątrz projektu (Zeng i in., 2021); bazowa lista JIT tutaj daje 0,68, a sam rozmiar 0,72, więc korpus
  zachowuje się jak korpusy z literatury. Linie z błędami są w literaturze o około 1,4 bitu bardziej
  „nienaturalne" pod modelem n-gramowym (Ray i in., 2016) na poziomie linii; ten wynik nie przenosi się na
  poziom zmiany, co poniżej widać. Szum SZZ: precyzja rzędu 66–73% dla najlepszych wariantów; tutaj wariant
  prosty, więc etykiety są głośniejsze, co obniża wszystkie AUC jednakowo, ale nie zmienia znaku różnic.

## 4. Wyniki

Wszystkie liczby: lądowania z kodem, etykiety „wszystkie poprawki", chyba że zaznaczono inaczej. „size" to sam
logarytm dodanych linii; „jit" to dziesięć cech bazowych.

### 4.1 Naiwny odcisk: bity na bajt (eksperyment 2)

| zakres | jit | jit + zstd | Δ | zwycięstwa | CI>0 |
| --- | --- | --- | --- | --- | --- |
| wszystkie lądowania (9 repo) | 0,802 | 0,843 | +0,041 | 8/9 | 2/9 |
| lądowania z kodem (9 repo) | 0,684 | 0,703 | +0,018 (mediana −0,006) | 3/9 | 0/9 |

Wzrost na „wszystkich lądowaniach" to artefakt: cechy zstd kodują „nie dodano kodu", czego lista JIT nie ma, a
lądowania bez kodu prawie nigdy nie są obwiniane. Na lądowaniach z kodem kierunek jest odwrotny od tezy: bity na
bajt surowe mają AUC 0,303, czyli **im lepiej zmiana się kompresuje, tym częściej jest poprawiana**, bo duże
zmiany kompresują się lepiej i duże zmiany psują częściej. Naiwny odcisk jest przekodowaniem rozmiaru.

### 4.2 Kontrola rozmiaru (eksperyment 3)

Zaskoczenie liczone na porcjach po 512 bajtów względem kosztu porcji własnego kodu repozytorium (c_excess), reszty
zaskoczenia po odjęciu zależności od rozmiaru, słowniki lokalne, własne, trigram; warstwy rozmiaru; etykiety tylko
ze spraw; przeniesienie między repozytoriami.

| cecha | AUC | AUC po usunięciu rozmiaru | korelacja rangowa z rozmiarem |
| --- | --- | --- | --- |
| log dodanych linii | 0,745 | 0,517 | +1,00 |
| c_excess (porcje) | 0,668 | 0,543 | +0,54 |
| log liczby plików | 0,664 | 0,500 | +0,65 |
| entropia rozproszenia | 0,649 | 0,518 | +0,58 |
| reszta zaskoczenia na porcjach | 0,503 | 0,483 | +0,07 |
| c_excess tylko wśród lądowań ≥512 B | 0,547 | 0,530 | +0,09 |

| model | wewnątrz repo (średnia 9) | przeniesienie (średnia 9) |
| --- | --- | --- |
| size | 0,724 | 0,745 |
| jit | 0,684 | 0,739 |
| size + c_excess | 0,717 (Δ vs size −0,002, 4/9, CI>0 0/9) | 0,747 |
| size + porcje (3 cechy) | 0,718 | 0,743 |
| jit + porcje | 0,695 | 0,737 |
| jit + lokalne/własne | 0,693 (3/9) | — |
| jit + trigram | 0,692 (4/9) | — |
| jit + nowość słownika | 0,691 (4/9) | — |

Etykiety tylko ze spraw (8 repo): size 0,728, jit 0,704, jit + porcje 0,712 (Δ +0,009, 4/8). Kara L2 dziesięć
razy większa: ten sam obraz (size 0,726, jit 0,694). Wniosek: po unieruchomieniu rozmiaru żadna miara kompresyjna
nie niesie więcej niż około 0,04 AUC ponad losowość i żadna nie dokłada nic do modelu z samym rozmiarem.
Uboczny wynik: sam rozmiar bije dziesięć cech JIT wewnątrz repozytoriów, bo przy 9–78 pozytywach na
repozytorium dziesięć cech się przeucza; komunikat „fix" w kandydacie ma po korekcie rozmiaru AUC 0,672, czyli
poprawki są częściej poprawiane ponownie, znany efekt, nie odcisk.

### 4.3 Brief względem kodu i kształt zmiany (eksperyment 4)

| cecha | AUC | AUC po usunięciu rozmiaru | korelacja z rozmiarem | kierunek |
| --- | --- | --- | --- | --- |
| b_overlap: udział słów briefu obecnych w kodzie | 0,625 | 0,539 | +0,37 | więcej → więcej poprawek (rozmiar) |
| b_zgain: udział skompresowanego kodu, który brief opłaca | 0,386 | 0,477 | −0,31 | **więcej → mniej poprawek** |
| b_code_cov: udział identyfikatorów kodu obecnych w briefie | 0,440 | 0,526 | −0,08 | **więcej → mniej poprawek** |
| b_log_words: długość briefu | 0,593 | 0,483 | +0,32 | nic po korekcie |
| a_pair_unseen: pary plików bez precedensu | 0,570 | 0,453 | +0,38 | liczba plików w przebraniu |
| a_nn_jac: brak precedensu zestawu plików | 0,532 | 0,460 | +0,18 | nic |

| model | wewnątrz repo | przeniesienie | zwycięstwa w przeniesieniu vs size |
| --- | --- | --- | --- |
| size | 0,724 | 0,745 | — |
| size + brief (7 cech) | 0,698 | 0,754 | 8/9 |
| jit + brief | 0,677 | 0,753 | — |
| brief samo | 0,680 | 0,738 | — |
| kształt samo | 0,556 | 0,586 | — |
| size + brief + kształt | 0,703 | 0,752 | — |

Największe zyski w przeniesieniu: gin +0,050, CleanArchitecture +0,036, axum +0,020; jedyna strata: chi −0,077.
Sprzężenie briefu z kodem jest jedyną składową, która po korekcie rozmiaru wskazuje kierunek zgodny z tezą (kod,
którego brief nie wyjaśnia, jest częściej poprawiany) i przenosi się między repozytoriami. Jest małe: około +0,01
AUC ponad sam rozmiar przy treningu na innych repozytoriach, i nie przeżywa treningu wewnątrz repozytorium na tym
korpusie. Kształt zmiany nie niesie nic ponad liczbę plików.

### 4.4 Lokalizator: czy zaskoczenie wskazuje naprawiany plik (eksperyment 5)

Wewnątrz jednego lądowania rozmiar nie jest zmienną zakłócającą między lądowaniami. Dla 176 wadliwych lądowań z co
najmniej dwoma plikami kodu, w których poprawka obwiniła właściwy podzbiór plików, uszeregowano pliki lądowania
pięcioma sposobami.

| ranking | trafienie na 1. miejscu (8 repo, 153 lądowania) | AUC wewnątrz lądowania |
| --- | --- | --- |
| losowo (oczekiwane) | 0,34 | 0,50 |
| zaskoczenie (najwyższe bity/bajt pierwsze) | 0,27 | 0,44 |
| zaskoczenie względem poprzedniej wersji pliku | 0,33 | 0,50 |
| rozmiar (najwięcej dodanych bajtów) | 0,48 | 0,63 |
| gorączka (najczęściej zmieniany przed T) | 0,42 | 0,55 |
| odwrócone zaskoczenie | 0,35 | 0,56 |

Na wszystkich piętnastu repozytoriach (231 lądowań): losowo 0,36, zaskoczenie 0,31, rozmiar 0,47, gorączka 0,49.
Poprawka ląduje w największym i najczęściej zmienianym pliku zmiany. Bity na bajt spadają z rozmiarem pliku, więc
zaskoczenie wskazuje od winy w 6 z 9 repozytoriów. Jedyne repozytorium, w którym wskazuje dobrze (sinatra, 23
lądowania, trafienie 0,57), to to, dla którego nie dało się wytrenować słownika; to szum, nie prawo.

### 4.5 Brakujący plik: partner co-change z kontrolą popularności (eksperyment 6)

Grain nazwał nienaruszonego partnera co-change w 808 lądowaniach (2035 partnerów). Czy świat się zgadza?

| plik | dotknięty w ciągu 50 następnych lądowań | dotknięty przez poprawkę w tym oknie |
| --- | --- | --- |
| partner Grain | 0,50 | 0,16 |
| losowy plik z tego samego katalogu | 0,41 | 0,09 |
| plik o najbliższej liczbie zmian przed T | 0,58 | 0,16 |

Okno 20: partner 0,37/0,08, kontrola popularności 0,36/0,07. Na piętnastu repozytoriach (1250 lądowań, 3049
partnerów, okno 50): partner 0,59/0,17, losowy sąsiad 0,46/0,08, kontrola popularności 0,60/0,17. Cała przewaga partnera nad losowym sąsiadem to jego
popularność. Czy nienaruszony partner znaczy lądowanie jako później poprawiane: łączny odsetek wadliwych 0,130 z
partnerem wobec 0,133 bez; iloraz szans po korekcie rozmiaru 1,09 (etykiety ze spraw: 1,28); per repozytorium
0,28–2,92 w obu kierunkach. Partner jest dobrym przypomnieniem dla agenta (połowa dotknięta w 50 lądowaniach), nie
jest dowodem niekompletności ani wadliwości.

### 4.6 Dryf w oknach: czy okres o wyższym zaskoczeniu ma wyższy odsetek poprawek (eksperyment 7)

Lądowania po T pocięte na okna po 40; korelacja rangowa średniego c_excess okna z udziałem lądowań później
poprawianych, łącznie po standaryzacji w repozytorium: +0,46 (39 okien); po odjęciu średniego rozmiaru okna
+0,38; po odjęciu także udziału dużych lądowań +0,29; przy oknach po 30 (53 okna) odpowiednio +0,31 / +0,23 /
+0,16. Na piętnastu repozytoriach: 49 okien po 40: +0,44 / +0,32 / +0,24; 70 okien po 30: +0,32 / +0,28 / +0,25. Reszta
rzędu +0,25 po kontrolach siedzi na granicy istotności, a okna w obrębie jednego repozytorium nie są niezależne
(znaki per repozytorium mieszane: express −0,72, Slim +1,00 na pięciu oknach). Zapisane jako sugestia dla korpusu z
mocą, nie jako wynik do projektowania.

### 4.7 Powrót do sprawy jako etykieta dowiezienia (eksperyment 8)

Próba etykiety „niedowiezione": lądowanie z odniesieniem do sprawy, po którym w 200 lądowaniach przychodzi kolejne
z tym samym numerem. W 14 z 15 repozytoriów mniej niż 8 takich przypadków; w sinatra 17 z 213 (0,08) i żadna
cecha nie osiąga AUC 0,58. Dowodu dowiezienia nie da się z tej historii zmierzyć; etykieta musiałaby pochodzić z
narzędzia śledzenia spraw albo z warstwy dowodowej.

### 4.8 Replikacja na sześciu dalszych repozytoriach (eksperyment 9)

Sześć nowych klonów: click i requests (Python), koa (JavaScript), mux i logrus (Go), serde json (Rust). Dwa z nich
(mux z 3 pozytywami, json z 6) wypadają poniżej progu ośmiu pozytywów, więc łączny obraz to 13 repozytoriów,
2483 lądowania z kodem, 361 pozytywów. Ten sam potok, ta sama reguła odcięcia, te same analizy.

| model | 4 nowe repo, wewnątrz | 4 nowe repo, przeniesienie | 13 repo, wewnątrz | 13 repo, przeniesienie |
| --- | --- | --- | --- | --- |
| size | 0,707 | 0,721 | 0,719 | 0,737 |
| jit | 0,667 | 0,682 | 0,679 | 0,732 |
| size + c_excess | 0,702 | 0,724 | 0,712 | 0,741 |
| size + porcje (3 cechy) | — | — | 0,713 | 0,741 |
| size + brief | 0,701 | 0,726 | 0,699 | **0,747** (wygrane 10/13) |
| jit + brief | 0,679 | 0,690 | 0,678 | 0,744 |
| brief samo | 0,671 | 0,692 | 0,677 | 0,726 |
| size + sprzężenie bitowe (3 cechy) | — | — | 0,709 | 0,742 |
| kształt samo | 0,543 | 0,560 | 0,542 | 0,581 |

Etykiety tylko ze spraw (12 repo): przeniesienie size 0,729 → size + brief 0,738, size + c_excess 0,739; wewnątrz
size 0,715, size + c_excess 0,715, size + brief 0,690. Pojedyncze cechy na 13 repozytoriach (surowe / po usunięciu
rozmiaru): dodane linie 0,737 / 0,497; c_excess 0,643 / 0,551 (korelacja z rozmiarem +0,47); b_overlap 0,635 /
0,557; b_zgain 0,397 / 0,476; b_code_cov 0,467 / 0,544; pary plików bez precedensu 0,571 / 0,453.

Pozostałe testy na piętnastu: lokalizator łącznie na 231 lądowaniach: losowo 0,36, zaskoczenie 0,31, zaskoczenie
względem poprzedniej wersji 0,37, rozmiar 0,47, gorączka 0,49. Brakujący plik na 1250 lądowaniach i 3049
partnerach: partner dotknięty później 0,59, przez poprawkę 0,17; losowy sąsiad 0,46 / 0,08; kontrola popularności
0,60 / 0,17. Partner jako znacznik na 2575 lądowaniach: 0,127 wobec 0,133, iloraz szans po korekcie rozmiaru 1,03.
Dryf na 49 oknach po 40: +0,44 / +0,32 / +0,24 po kontrolach; na 70 oknach po 30: +0,32 / +0,28 / +0,25. Powrót
do sprawy: w 14 z 15 repozytoriów poniżej ośmiu przypadków.

Replikacja nie rusza żadnego werdyktu. Zysk sprzężenia briefu zostaje na +0,010 w przeniesieniu z 10 wygranymi na
13 i dalej przegrywa wewnątrz repozytorium; zaskoczenie po kontroli rozmiaru daje +0,004 (+0,010 na etykietach ze
spraw) bez ani jednego przedziału ufności powyżej zera; zaskoczenie dalej wskazuje od naprawianego pliku; partner
co-change to dalej jego popularność. Dryf w oknach zostaje na granicy istotności (+0,25 przy 70 oknach, które w
obrębie repozytorium nie są niezależne): sugestia, nie wynik.

### 4.9 Koncepcja zmieniona: dowody niesione przez lądowanie (eksperyment 10)

Po zamknięciu odcisku kodu sprawdzono drugą stronę tezy: nie „jak kod odbiega od historii", tylko „co dowody widzą
ze zmiany". Najpierw to, co lądowanie samo niesie: linie testów, asercje, ich ubytek. 13 repozytoriów, 2705
lądowań z kodem.

| znacznik | odsetek poprawianych ze znacznikiem | bez znacznika | iloraz szans po korekcie rozmiaru |
| --- | --- | --- | --- |
| dodany kod bez ani jednej linii testu | 0,082 | 0,195 | **0,62** (etykiety ze spraw 0,65) |
| dotknięty jakikolwiek plik testów | 0,192 | 0,081 | 1,59 |
| dodane asercje, wśród lądowań dotykających testów | 0,232 | 0,129 | 1,36 |
| usunięte asercje | 0,222 | 0,120 | 1,39; wśród dotykających testów 1,15 |
| netto ubytek linii testów | 0,161 | 0,130 | 1,10, znaki mieszane |

Znak jest odwrotny od tezy: lądowanie bez testów jest później poprawiane rzadziej, nie częściej. Wyjaśnienie
jest proste i ważne: w historii publicznej „lądowanie niesie testy" znaczy „lądowanie dodaje zachowanie", a to
zachowanie dostaje później poprawki. Etykieta z poprawek widzi ekspozycję, nie ochronę. Usuwanie asercji zostawia
małą resztę (1,15–1,39), zgodną z regułą „dowody nigdy nie słabną", ale nie jest jej dowodem. Modele: size + dowody
0,740 w przeniesieniu wobec 0,737 dla samego rozmiaru; wewnątrz repozytorium 0,688 wobec 0,719.

### 4.10 Koncepcja zmieniona: pokrycie nowego kodu testami (eksperyment 11)

Najczystszy instrument dowodowy, jaki historia publiczna daje: czy jakikolwiek test wykonuje linie, które lądowanie
dodało. Suita uruchomiona z pomiarem pokrycia na każdym lądowaniu z kodem w chi, gin (100 losowych ze 175), mux,
logrus (Go) i click (Python, pytest 7 w osobnym środowisku). 470 lądowań, profil dla wszystkich, 293 z dodanymi
instrukcjami wykonywalnymi. Suity zielone: chi 96/96, gin 96/100, mux 29/29, logrus 81/102, click 74/143 (stare
testy pod nowym interpreterem). Do oceny 4 repozytoria, 278 lądowań, 66 pozytywów.

| miara | AUC | AUC po usunięciu rozmiaru |
| --- | --- | --- |
| udział dodanych instrukcji bez wykonania | 0,489 | 0,523 |
| liczba dodanych instrukcji bez wykonania | 0,524 | 0,431 |
| znacznik „ma niewykonane instrukcje": odsetek 0,250 wobec 0,231 | iloraz szans 0,83 | etykiety ze spraw 0,78 |

Modele: wewnątrz repozytorium size 0,686, size + pokrycie 0,632–0,651; przeniesienie size 0,706, size + luka
pokrycia 0,706. Per repozytorium iloraz szans 1,59 (chi), 0,96 (click), 0,75 (gin), 0,30 (logrus). Brak sygnału,
próbka mała, a znak nie jest nawet właściwy. Razem z 4.9 zamyka to zmienioną koncepcję na historii commitów:
polityki dowodowej nie da się ocenić z historii, bo etykieta „później poprawione" mierzy ekspozycję nowego
zachowania, nie ochronę przez dowody. Potrzebne są etykiety, które dom robi sam: zwroty, incydenty przypisane do
kompletu, obietnice otwarte ponownie.

## 5. Co to znaczy dla koncepcji

1. **Odchylenie bajtowe od środowiska nie jest odciskiem wadliwości.** W każdej postaci, po kontroli rozmiaru,
   wynosi zero, wewnątrz repozytorium i między repozytoriami, jako predyktor i jako lokalizator. Rozmiar zmiany
   jest prawem, a nie zakłóceniem do usunięcia: pojedyncza liczba (dodane linie) jest najlepszym predyktorem na tym
   korpusie i w literaturze. Każda miara, która rośnie z rozmiarem, będzie wyglądać na sygnał, dopóki ktoś nie
   unieruchomi rozmiaru.
2. **„Brief względem kodu" jest jedyną żywą częścią tezy.** Kod, którego brief nie wyjaśnia, jest częściej
   poprawiany, niezależnie od rozmiaru, konsekwentnie między repozytoriami, słabo. To nadaje się na miękką bramkę
   wyjaśnialności w domu (komplet, którego brief nie opłaca, wraca do briefu, nie do klienta), nie na dowód ani
   próg. Z opisami commitów jako briefami sygnał jest z natury słaby; brief pisany w domu jest bogatszy, więc
   sygnał może być większy, ale tego korpus nie pokaże.
3. **Instrumenty Grain nie są odciskiem.** Konwencje milczą na większości lądowań i nie dokładają nic; partner
   co-change to popularność. Grain zostaje tym, czym jest: mapą architektury i przypomnieniem, nie wyrocznią
   wadliwości.
4. **Kształt zmiany nie niesie nic.** Zestaw plików bez precedensu to po prostu więcej plików.
5. **Dowodu dowiezienia nie da się wyczytać z kodu i historii.** Nie ma etykiety. Dowód dowiezienia zostaje tam,
   gdzie model domu już go umieścił: w warstwie dowodowej, scenariusz sparowany z testem, przebieg w środowisku
   syntetycznym. Matematyka zmiany może co najwyżej powiedzieć „ten komplet jest duży" i „tego kodu brief nie
   tłumaczy".

6. **Etykieta z historii widzi ekspozycję, nie ochronę.** Polityki dowodowej nie da się ocenić na historii
   commitów, ani przez „czy lądowanie niesie testy", ani przez „czy testy wykonują nowy kod". Jedyne etykiety,
   które widzą ochronę, robi dom sam: zwroty klienta, incydenty przypisane do kompletu, obietnice otwarte
   ponownie. To jest właściwe miejsce dla matematyki dowodów i tam trzeba ją mierzyć.

Odpowiedź na pytanie „jak daleko można pójść": do dwóch liczb na komplet, rozmiaru i udziału kodu opłaconego
briefem, obu jako miękkich bramek. Dalej, do „odcisk mówi, czy wadliwe", nie da się pójść tą drogą przy tej
jakości etykiet i tej wielkości próbki; a dowodu, że się da przy lepszych, nie ma.

## 6. Konsekwencje dla modelu domu

- **Polityka rozmiaru kompletu** jest jedyną dźwignią o zmierzonym skutku: mniejszy komplet, mniej poprawek. Wchodzi
  do polityk jako granica z pochodzeniem (ustalona przez klienta lub dom, nigdy z sygnatury), zgodnie z zasadą
  „progi po pochodzeniu".
- **Bramka wyjaśnialności**: komplet, którego kod brief nie opłaca (niski udział bitów wyjaśnionych), wraca do
  briefu jako pytanie, nie jako odmowa. Miękka, bez progu liczbowego w kodzie; próg to decyzja polityki domu.
- **Żadnej bramki „odcisk wadliwości"** w domu. Wpis do rejestru luk jako zamknięty negatywem, żeby przyszła
  sesja nie budowała go od nowa.
- **Partnerzy co-change** zostają przypomnieniem dla robotnika w chwili edycji; nie liczą się jako dowód
  niekompletności w bramce lądowania.
- **Bramki pokrycia nie da się uzasadnić tym pomiarem.** Nie znaczy to, że pokrycie nie ma znaczenia; znaczy, że
  historia commitów nie potrafi go ocenić. Reguła „każda linia nowego kodu w bilecie ma test" zostaje decyzją
  polityki, mierzoną w domu etykietami domu.
- **„Dowody nigdy nie słabną"** dostaje słabe potwierdzenie (usuwanie asercji: iloraz szans 1,15–1,39) i zostaje
  jak jest.
- **Ratchet jakości** nie dostaje wskaźnika z zaskoczenia; dryf w oknach zostaje w laboratorium do czasu, gdy
  ktoś zmierzy go na większym korpusie z mocą.

## 7. Zagrożenia dla ważności

- Etykiety SZZ-lite są głośne (proste wzorce komunikatów, blame liniowy, bez filtrowania zmian kosmetycznych);
  obniżają wszystkie AUC, ale sparowane różnice liczone są na tych samych etykietach.
- 9–78 pozytywów na repozytorium; przedziały ufności ΔAUC ±0,05–0,10; dlatego liczy się liczba zwycięstw i
  przeniesienie, nie pojedyncza średnia.
- Korpus to biblioteki i szkielety małe i średnie; monolity produktowe mogą zachowywać się inaczej.
- Regresja logistyczna, nie modele nieliniowe; interakcje (np. zaskoczenie × rozmiar) nie były modelowane
  jawnie; warstwy rozmiaru i reszty częściowo to pokrywają.
- Brief = opis commita; w domu brief jest bogatszy, więc składowa 4.3 może być niedoszacowana.
- Jedno odcięcie na repozytorium; wynik przy innych T nie był liczony.

## 8. Gdyby ktoś chciał iść dalej

1. Brief z ciała PR i powiązanej sprawy zamiast opisu commita, na repozytoriach z dyscypliną PR; ta sama miara
   b_zgain.
2. Etykieta dowiezienia z narzędzia śledzenia spraw (ponowne otwarcie, „nie działa jak opisano") zamiast SZZ.
3. Pomiar na własnym korpusie domu, gdzie brief i komplet są ustrukturyzowane; wynik tutaj mówi tylko, że z
   kodu i historii publicznych repozytoriów więcej się nie wyciśnie.

## 9. Ślad

- Harness: `tests/stress/fingerprint/harness/` (README w środku), commity laboratorium w archiwum przebiegów;
  pokrycie: `gocov.py`, `pycov.py`, `merge_cov.py`, `post_cov.sh`; dowody: `features5.py`, `marker_effect.py`.
- Dziennik: `tests/stress/fingerprint/lab/log.md` (THINK, eksperymenty 1–11), `results.tsv`, `config.md`.
- Wyjścia analiz: `tests/stress/fingerprint/lab/outputs/` (tekstowe wyjścia każdego przebiegu analizatora).
- Korpus i pamięci podręczne (kilkaset MB) nie są w repozytorium; przebieg odtwarza je z klonów.
