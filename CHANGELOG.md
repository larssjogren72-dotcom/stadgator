# Changelog – ParkSpot

Semantisk versionering (MAJOR.MINOR.PATCH), retroaktivt taggad från projektstart.
v1.0.0 och framåt är den formella eran (från commit `923e63e`, då appen fick ett eget
`/version`-endpoint). v0.x täcker utvecklingen innan dess – taggat i efterhand för
att kunna referera till exakt vad som var live vid ett givet datum.

SHA:t i `/version` är fortfarande facit för exakt spårbarhet (en användarrapport
måste gå att knyta till exakt den kod personen såg – flera commits kan dela samma
semver). Semver är den mänskligt läsbara etiketten, för changelog och listningar
som SaaS Hive.

Varje patch-version är en logisk bunt commits (samma princip som v1.0.0–v1.5.0
redan använde), inte en version per enskild commit – annars blir en rollback
följd av dess egen återställning två meningslösa versionsnummer i rad.

## v1.23.0 – 2026-09-02
**Sökförslagen visste inte vilken stad man tittade på.**

Med två städer live blev det som fungerat i år plötsligt fel: förslagslistan var
hårdkodad mot Stockholms centrum (`lat=59.33&lon=18.06`) oavsett vald stad. I
Göteborgsläget rankades alltså Stockholmsgator högst. Och väljer man en sådan flyger
kartan dit med Göteborgs data laddad – resultatet blir en **tom karta utan förklaring**,
och tomt betyder "vi vet inget" i appen, inte "här finns inget".

Tre lager, byggda tillsammans:

**1. Sökrutan följer staden.** Varje stad bär sin egen `sokRuta` – kommungränsens
omslutande rektangel, hämtad ur OSM:s kommunytor, inte gissad. Rutan skickas som
`bbox` till Photon, som filtrerar hårt på den. (`lang=sv` får inte läggas till:
tillsammans med bbox svarar Photon HTTP 400.)

**2. Kommunnamnet fäller grannen.** Rutan ensam räcker inte – Sundbyberg, Solna och
Nacka ligger inne i Stockholms ruta, Mölndal och Partille inne i Göteborgs. Uppmätt:
sökningen "Sveavägen 10" gav **SUNDBYBERGS** Sveavägen som första träff i
Stockholmsläget. Nu behålls bara träffar där Photons `city`-fält matchar staden.
Kontrollerat att fältet bär kommunen och inte postorten: Askim, Fiskebäck och
Kvillebäcken svarar alla "Göteborg".

**3. En vakt vid den enda dörren.** Alla vägar in i kartan – sökknappen, ett valt
förslag, hemknappen, GPS-punkten, ett klick på kartan – går genom `flyToAndShow`.
Ligger destinationen i en av våra ANDRA städer ställer appen frågan i stället för att
rita tomt: *"Den platsen ligger i Stockholm. Du tittar på Göteborg."* med knappen
**Byt till Stockholm**, som tar med destinationen över omladdningen (via sessionStorage,
inte URL:en – en sökt adress ska inte följa med in i webbstatistiken eller i en delad
länk). Täcker ingen av våra städer punkten flyger kartan dit ändå, men med rak besked:
"Utanför Göteborg – ParkSpot har inga uppgifter här."

**Vad vakten inte kan:** den mäter mot stadens rektangel, inte mot kommungränsen.
Sundbyberg, Solna och Nacka ligger HELT inne i Stockholms rektangel och kan alltså inte
fällas där. Medvetet: en exakt gränskontroll hade krävt ett nätanrop före varje sökning
och klick. Grannkommunerna fångas i lager 2 i stället, som är vägen de faktiskt kommer in.

**Kommunfiltret talade bara svenska.** Photon svarar på det språk webbläsaren ber om.
En användare med engelskt språkval fick därför `"Gothenburg"`, medan filtret jämförde mot
`"Göteborg"` – varenda träff kastades och **sökrutan dog helt** i Göteborgsläget. Lars körde
rakt in i det. Felet var mitt: jag verifierade filtret med `curl`, som inte skickar
Accept-Language alls, och missade därmed hela dimensionen. Fixen är `lang=default`, som ger
de LOKALA namnen oavsett webbläsarspråk – och som bonus svenska gatunamn för alla
("Chalmers Tekniska Högskola", inte "Chalmers University of Technology"). Notera att
`lang=sv` inte går att använda: den ger HTTP 400 tillsammans med bbox.

**Och ett filter ska aldrig kunna radera hela svaret i tysthet.** Tar kommunfiltret bort
ALLT medan tjänsten faktiskt svarade med träffar, är det sannolikt filtret som har fel –
då visas träffarna ändå. Varje rad bär sin kommun i undertexten, och stadsvakten fångar
den om man väljer en i fel stad. Hellre ett förslag i grannkommunen än en död sökruta.

**`?sokdebug=1`** visar råa räknare i förslagsrutan (svar / utan namn / fel stad /
dubbletter / kvar, plus kommunnamnen tecken för tecken). Det var den som avslöjade
"Gothenburg" – samma motiv som `?kartlogg=1`: fjärrfelsökning utan konsol är annars
ren gissningslek.

**Sökförslagen är inte längre tysta när de misslyckas.** Gick förslagstjänsten (Photon)
inte fram visade appen **ingenting alls** – exakt samma sak som när sökningen gick fram men
inte hittade något. Den enda som kunde skilja dem åt var den som öppnade utvecklarkonsolen.
Nu står det i rutan: *"Inga träffar i Göteborg"* när sökningen gick fram, och
*"Sökförslagen går inte att nå"* med skälet när den inte gjorde det – plus påminnelsen att
sökknappen använder en HELT annan tjänst och därför fungerar ändå. (Felet var äldre än
stadsuppdelningen; det blev bara smärtsamt uppenbart när vi försökte felsöka på distans.)

**Stadsläget visar staden – punkt.** Kartan flyttade sig till din GPS-position vid första
träffen om du befann dig utanför staden. Lars satt på tåg i Norrland och fick Norrland i
stället för Göteborg. Den automatiska förflyttningen är **borttagen**: väljer man Göteborg
ser man Göteborg, var man än råkar vara. Den blå punkten ritas fortfarande – den flyttar
bara inte längre kartan. Vill man till sin egen position finns platsknappen, och den är ett
medvetet tryck. (Koden bakom hade dessutom en egen hårdkodad Stockholmsruta, `STOCKHOLM_BOUNDS`,
som avgjorde saken oavsett vald stad.)

**Ett sidofynd, rättat:**
* `map.flyTo` över stadsavstånd (~45 mil) flyttar inte kartan alls; nålen och datan hamnar
  rätt medan kartan står kvar. Reproducerat med ett rått `map.flyTo` i båda riktningarna,
  alltså Leaflets beteende. Så långa hopp uppstår bara via vaktens "Visa ändå"; där
  hoppar vi rakt dit med `setView` i stället.

## v1.22.0 – 2026-08-31
**Grön gata, tio minuter kvar till lastplatsen.**

Lars stod på Vegagatan klockan 06:50. Kartan sa grönt, och lastplatsen började 07:00.
Kontrollerat i efterhand: klockan **06:59** svarade appen "Får stå nu" samtidigt som den
internt visste att förbudet började om en minut. Uppgiften fanns hela tiden – färgkedjan
frågade aldrig efter den. Städning hade sedan länge en varning innan den slår till;
tidsbestämda förbud hade ingen.

**Nu blir gatan orange redan innan förbudet börjar**, efter exakt samma regel som gäller
för städning. Och det sista kvarten är det inte klockslaget som står där utan
nedräkningen: **"Lastplats om 10 min"**. Det är den formuleringen som får en att låta bli
att kliva ur bilen – "får stå tills 07" gör det inte, klockan 06:50.

**Ingen glöd, till skillnad från städningen, och det är ett val.** Glöden betyder "bra
chans just nu" – en möjlighet. En städning skapar en: gatan töms och blir ledigare efteråt.
En lastplats som öppnar skapar bara ett hinder, och det återkommer varje vardag. Glöden
hade dessutom lyst mellan midnatt och fem, där "gott om tid" är det sämsta man kan säga
till någon som ska lämna bilen till morgonen.

**Kvällen före varnas inte.** Att också spegla städningens blick tio timmar framåt hade
gjort Vegagatan orange 21–07, röd 07–19 och grön med glöd 19–22 – gatan hade aldrig blivit
vanlig grön igen, och en färg som aldrig slocknar är ingen information. Läget "Nu" svarar
på nu. Frågan om bilen kan stå kvar till i morgon äger "Natt", och där stämmer svaret redan.

Förändringen är avgränsad: mätt över 117 733 prov i fem stadsdelar ändras 3 963 lägen, och
**alla går från grönt till orange** – ingen gata förlorar sin blå tidsgräns eller sin röda
varning. Allt ligger mellan midnatt och sju, som mest 17 % av kartan på Östermalm, och
slocknar när förbudet väl börjar. Dagkartan är oförändrad.

En bieffekt som visade sig direkt: klockan 09:09 fick Östermalm två oranga sträckor –
lastplatserna som öppnar 10 och 11. De låg gröna förut, en timme innan de stängde.

## v1.21.0 – 2026-08-30
**Appen svarade på rätt fråga, men om fel klockslag.**

**Det började med en lastplats på Vegagatan.** Gatan städas torsdag 09–14 och är lastplats
07–19. Klockan fem på morgonen lyste den med den starkaste positiva signal appen har och
sa "Gott om tid – får stå till 09". Bilen måste vara borta 07. Nu-läget satte deadline
enbart efter städningen och frågade aldrig när platsens *egen* lastplats öppnar. Natt-läget
hade redan rätt regel – det som öppnar först binder – så den flyttades över. Var femte
lastplats i Vasastan har minst en veckodag med det mönstret.

**Natt-läget hade motsatt blindfläck: det frågade bara om i morgon.** En lastplats mitt i
sitt eget fönster fick "FÅR STÅ · flytta innan 07". Värre: gällde den inte i morgon
försvann varningen helt, och gatan blev **grön "Trygg över natten"** medan förbudet pågick
– och räknades bland de trygga platserna. Grönt på en sträcka man inte får stå på är precis
den falska trygghet appen är byggd för att undvika.

**Under den utredningen föll en taxiplats ut.** Folkungagatan har en taxiplats som gäller
18–07. Koden antog att hinder börjar på morgonen, så ett fönster som startar 18:00
klassades som "du har åkt innan det börjar" – grönt, på en sträcka som är förbjuden exakt
de timmar bilen skulle stått där. Ett fönster som vänder över midnatt kan aldrig vara sent
nog. Det påverkar inga städgator: noll av 5 192 städfönster vänder.

**En text som gissade rättades också.** Nu-läget tittar tio timmar framåt efter
morgondagens städning och kallade allt som rymdes där "i natt". Klockan 23 blev en
09–14-städning "servas i natt · flytta annars i kväll". Ordet väljs nu av klockslaget.
Nattstädningen 00–06 – 3 741 av posterna, det stora flertalet – är oförändrad; det var de
1 448 förmiddagsposterna som beskrevs fel.

**Och så färgen.** Orange betydde två motsatta saker i Nu-läget: "Städas nu" (får inte stå)
och "Får stå tills 09" (får stå). Klockan fem en onsdag var 50 av 56 oranga sträckor sådana
man inte fick stå på – färgen betydde alltså oftast motsatsen till vad legenden sa, och
legenden gick inte att skriva rätt. **Städning som pågår är nu röd.**

Streckad röd prövades och föll på en mätning: vid appens landningszoom är mediansträckan
5 pixlar och 78 % ligger under 12, medan ett streckmönster behöver omkring 20. En tredje
orange nyans var också utesluten – städ-amber och uteserveringens orange ligger redan
närmare varandra än något annat färgpar på kartan.

**Det tyngsta skälet var inte färgen utan en knapp som inte fungerade.** Reglaget "Tona ner
där bilen inte får stå" tonade aldrig ner en gata som städades – och kunde inte lagas, för
lägger man till orange i den mängden försvinner även gatorna som städas om fem timmar, och
dem får man stå på. Nu faller allt man inte kan använda tillbaka, och kvar i full styrka
står alternativen.

Blå, gågata och uteservering är orörda. Grön, blå, orange, röd och lila svarar på "får jag
stå här"; gågata och uteservering säger vad platsen *är*, och den skillnaden får synas.
Natt-läget behåller sin egen färgregel – det svarar på om bilen kan lämnas till i morgon,
inte på vad som gäller just nu.
## v1.20.1 – 2026-08-30
**Det gick inte att se hur många som använder Göteborg.**

Frågan kom kvällen före kampanjstart, och svaret var nej – av tre skäl som alla gick att
mäta. **Ingen av de sjutton SEO-sidorna har Google Analytics**, så kampanjens naturliga
landningssidor var helt mörka. **GA laddas först efter kaksamtycke**, och hur många som
avböjer går inte att läsa ut ur GA – de saknas per definition. Och **den som kommer
tillbaka är osynlig**: staden sparas i webbläsaren, så nästa besök sker på en ren adress
utan `?stad=`, och GA ser bara "/". Man kunde alltså se vem som *kom*, aldrig vem som
*stannade* – tvärtemot vad en kampanj behöver veta.

**Nu räknar servern själv, utan kaka.** SEO-sidorna räknas där de serveras, så de behöver
ingen JavaScript. Appen säger till vilken stad den visar, eftersom servern omöjligt kan
veta det för en återvändande besökare. Ingenting sparas om personen – bara ett antal per
stad och dygn – och därför krävs inget samtycke. `/statistik` läser av.

**Talen är byggda för att inte kunna misstolkas.** De räknar sidvisningar, inte personer,
och det står i svaret. Sökrobotar räknas för sig i stället för att tyst sorteras bort – ett
tal som filtrerat bort trafik i hemlighet går inte att kontrollera i efterhand. Ett okänt
stadsnamn hamnar under "okänd" i stället för att försvinna, så en felstavad kampanjlänk
syns. Och eftersom siffrorna bor i minnet och nollställs vid varje driftsättning bär svaret
alltid ett `sedan`-fält: en nolla ska gå att skilja från "ingen kom".

**Google Analytics vet nu vilken stad besöket gällde**, både som användaregenskap och på
varje sidvisning. Det kräver en engångsregistrering i GA4 som inte är retroaktiv.

Integritetstexten har fått ett stycke om räkningen. Ny insamling som inte står beskriven
vore fel oavsett hur ofarlig den är.

## v1.20.0 – 2026-08-30
**Tabellerna sköter sig själva, och säger till när de inte gör det.**

**Tre uppslagstabeller styr vad appen påstår om verkligheten**, och alla tre åldrades tyst.
Ändrar Stockholm en föreskrift slutar raden gälla – appen faller tillbaka på grönt, vilket
är säkert men obemärkt. Skriver Göteborg om en mening hittas den inte längre, och appen
säger "vet inte". Ingen fick veta något av det.

**Nu finns en robot.** Den 1:e varje månad: se om något ändrats → hämta om → skriv om
tabellerna → kör testgrinden → committa och pusha bara om den går igenom → kvitto.
Ingen handpåläggning.

**Det som skyddar är inte förtroende utan tre spärrar.** Roboten rör bara de tre
JSON-tabellerna och de genererade blocken – aldrig logik, texter eller färger. En
testgrind måste godkänna: den fäller dagtyper appen inte känner, trasiga klockslag,
generatorer som glidit isär från sin källa, index.html som slutat vara giltig JavaScript,
och massborttagningar. Och verktygen vägrar gissa – en oläslig föreskrift eller en
otolkbar mening lämnas utanför tabellen, vilket betyder "vet inte", precis som förut.

**Tre larmvägar, för tre olika fel.** Säger roboten något öppnas ett issue som tilldelas
ägaren – GitHub mejlar då. Tiger roboten larmar en klocka utanför GitHub, som pingas
vid varje körning. Och `/datastatus` i appen svävarar alltid på hur gamla tabellerna är,
oberoende av GitHub – för en vakt som slutat gå ser likadan ut som en vakt som inget hittat.

**Vakten hittade något första gången den körde.** Göteborgs villkorstabell saknade
meningen "Tidsbegränsningen gäller vardag utom dag före sön- och helgdag klockan
00.00 - 24.00." – 1 554 sträckor. Gränsen gäller alltså vardagar, men inte helger. Appen
skrev "max 24 tim" även på en söndag. Ingen färg ändras (gränsen är exakt ett dygn),
men klausulen försvinner nu när den inte gäller.

## v1.19.0 – 2026-08-29
**Göteborgs lastplatser vet när de gäller. Och glöden slutar lova saker den inte vet.**

**339 lastplatser i Göteborg ritades gröna, även mitt i sitt eget lastningsfönster.** Staden
skriver inte tiden som klockslag utan som en mening i löpande text, ordagrant ur föreskriften:
"Lastplats vardag utom vardag före sön- och helgdag klockan 09.00 - 18.00…". Appen läste
aldrig den meningen.

**140 av dem har ingen mening alls.** Tomt fält betyder inte "okänt" – det betyder dygnet
runt. Fyra av dem lästes i Transportstyrelsens register, spridda över 2008, 2014, 2022 och
2026, och alla fyra säger samma sak utan ett enda klockslag. De är röda nu, dygnet runt,
i båda lägena.

**De 199 med tider fick en tabell.** 98 av 100 meningar översattes en gång, utanför appen,
och slås upp ordagrant. Skriver Göteborg om en mening hittas den inte, och då säger appen
"vet inte" i stället för att tolka fel. En dygnskurva på riktiga sträckor visar mönstret:
75 aktiva klockan tre på natten, 206 klockan nio, 76 klockan sju på kvällen.

**Glöden från v1.18.0 lovade "bra chans" på gator där inget förbud funnits.** Fältet som bär
tiden finns på nästan varje parkeringspost i Stockholms data och betyder där något annat –
när avgiften gäller, eller när gatan städas. Liljeholmsvägen, vanlig avgiftsparkering, sa
"Förbudet tog slut 17 – bra chans att det finns plats" när det i själva verket var taxan som
slutat ticka klockan fem på en lördag. Glöden kräver nu en riktig ändamålsplats.

**Kortet visar också nästa förbud, inte bara nästa städning.** En grön gata som lyser för att
förbudet nyss tog slut sa ingenting om att lastplatsen kommer tillbaka. Ny rad: "Lastplats
igen på måndag 07–19". Den svarar på två frågor på en gång – att sträckan är tidsstyrd, och
när den gäller igen.

**Nedräkningen "om N dygn" är borta där veckodagen redan står utskriven.** Den var fel åt
båda hållen: räknad i timmar blev måndag 00:00 "om 1 dygn" medan måndag 07:00 blev "om 2
dygn" – samma dag, olika svar. Räknad i kalenderdygn blev tisdag 00:00 "om 3 dygn" fast den
låg 54 timmar bort. Veckodagen och klockslaget är exakta; en ungefärlig siffra som motsäger
dem tillför inget. Inom ett dygn står "om 3 tim" kvar, för då finns ingen veckodag att luta
sig mot.

**Stockholm är orört.** 66 024 jämförelser – 393 ändamålsplatser, varje timme i en hel vecka,
ny kod mot gammal – gav noll avvikelser.

## v1.18.0 – 2026-08-29
**En gata som just blivit tillåten lyser upp.**

**Bakgrunden är verklig.** Lars körde till en restaurang, gatan var full, men klockan 19:08
hade lastplatsens stoppförbud precis slutat gälla och det fanns plats. Kartan visade grönt –
men sa ingenting om att sträckan öppnat för tjugo minuter sedan, vilket är den mest
användbara upplysningen som finns i det ögonblicket.

**Nu lyser den.** En sträcka vars förbud tog slut inom de senaste tre timmarna får en ljus
kant, och kortet säger varför: "Förbudet tog slut 17 – bra chans att det finns plats".

**Det är samma signal som förut, inte en ny.** Den ljusa kanten har redan två betydelser i
appen – nyss städad, och gott om tid innan städning – och båda säger samma sak: det här är en
bra chans just nu. Ett förbud som nyss tog slut säger detsamma, starkare till och med,
eftersom ingen har kunnat parkera där under tiden. En egen färg hade påstått att det är något
annat, och tre lysande signaler med samma innebörd blir brus i stället för information.

**Därför byter legenden ord.** Den sa "Nyss städad – bra chans", vilket beskrev en av
orsakerna i stället för signalen. Nu står det "Förbudet tog nyss slut – bra chans" och täcker
båda – ett städfönster är också ett parkeringsförbud. Städningen finns kvar som förklaring på
platskortet, där den hör hemma.

🔴 **Vi lovade något vi inte kan veta.** Kortet för motorcykel- och handikapplatser sa "bra
chans att den är ledig". ParkSpot har inga sensorer för lediga platser och skriver det
uttryckligen i sin egen ansvarstext. Nu står det "bra chans att det finns plats" – vi vet att
förbudet tog slut, inte att bilen som stod där har åkt.

**Signalen är sällsynt med flit.** I fem innerstadsområden en lördagseftermiddag lyste två
sträckor av 3 277. Den gäller bara när något gick från förbjudet till tillåtet – inte när en
tidsgräns slutade gälla, för då har ingen varit förhindrad att parkera och platsen är inte
mer ledig än vanligt.

## v1.17.0 – 2026-08-29
**Göteborg slutar visa en tidsgräns när den inte gäller.**

**Många av Göteborgs tidsgränser gäller bara vissa timmar.** "30 min" på skylten kan betyda
30 minuter vardagar 09–18 och ingen gräns alls däremellan. Staden skriver det i klartext, med
beslutets egen mening – men appen läste meningen utan att använda den, och sa "max 30 min"
dygnet runt.

**Nu läses meningen.** 55 formuleringar är översatta en gång och granskade för hand. Uppslaget
i appen är en ren jämförelse mot den exakta meningen: känner den inte igen formuleringen säger
den "vet inte" och beter sig som förut. Ingen gissning sker medan du använder kartan.

**Kontrollerat på plats.** Fyra skyltar i Göteborg lästes i verkligheten – Oljekvarnsgatan,
Framnäsgatan, Vegagatan och Ekedalsgatan. Alla fyra stämde med registret, städdagarna med,
inklusive jämna och udda veckor. Det var det beskedet som gjorde det försvarbart att bygga.

**Vad du märker:** i tio stadsdelar bär 90 sträckor ett sådant villkor. 76 av dem har en gräns
som gäller just nu och står kvar som blå. 13 slutar visa en gräns som vilar. Kärrdalsvägen är
ett exempel: 30-minutersgränsen gäller lördagar bara 09–15, så en lördagseftermiddag är gatan
grön i stället för blå.

**En formulering lämnas utanför med flit.** "Tillåtelsen gäller vardag klockan 08.00 – 22.00"
säger att tillståndet att parkera gäller då – inte att tidsgränsen gör det. Utanför fönstret
vet vi inte om parkering är tillåten alls, och att då säga "ingen gräns" vore fel åt det
farliga hållet.

## v1.16.0 – 2026-08-29
**Nittiofyra sträckor visade grönt där parkering är förbjuden dygnet runt. Nu visar de rött.**

🔴 **Ett tidsreglerat förbud har två lager, appen kände bara till ett.** Skylten på de här
gatorna växlar mellan två märken: ett kryss under rusningstid, då du inte ens får stanna, och
ett streck resten av dygnet, då du får stanna men inte parkera. Gatan blir alltså aldrig
parkerbar. Appen läste bara tidsfönstret, och när det tog slut släppte den fram grönt.

**Så här står det i besluten:** "Förbudet gäller vardagar … klockan 07.00 – 10.00 och
15.00 – 19.00. **Övrig tid får fordon inte parkeras.**" Den sista meningen finns inte i
kartdatan – den står bara i föreskriftstexten hos Transportstyrelsen.

**Hela Stockholm är genomläst.** 579 beslut i den här kategorin, texten hämtad i original.
413 säger ingenting om övrig tid och 109 säger uttryckligen att parkering är tillåten – för
dem var grönt rätt hela tiden. **46 säger att den är förbjuden**, och de fördelar sig över
sjutton stadsdelar: Södermalm och Vasastaden tyngst, men också Ålsten, Norra Ängby,
Mälarhöjden och Enskede. Elva beslut gick inte att läsa maskinellt och lämnas orörda.

**Kontrollerat på plats.** Fyra av gatorna är fotograferade och stämmer med beslutet, noll
motsäger det. Och varje berörd sträcka har testats mot appens egen kod: ingen av de 94 är
längre enbart grön.

**Tabellen kan inte bli tyst fel.** Varje rad bär datumet regeln började gälla. Ändrar staden
föreskriften stämmer inte datumet längre, och appen slutar då lita på raden i stället för att
gissa. Ersätts beslutet får det ett nytt ärendenummer och faller igenom på samma sätt. En
gammal tabell blir alltså bara omodern, aldrig farlig.

**Kvar, medvetet:** på tolv av sträckorna ritas rött nu, men ett grönt streck ligger kvar
ovanpå eftersom staden registrerat både en tillåtelse och ett förbud på samma trottoarkant.
Vilket som syns avgörs av ritordningen – en egen fråga som rörts tidigare och backats.

## v1.15.0 – 2026-08-29
**Blått betyder nu "klockan tickar" – i båda lägena, i båda städerna. Och tidsgränsen visas bara när den faktiskt gäller.**

**Grönt lovade för mycket.** Grönt ska betyda att du kan ställa bilen utan att hålla koll på
klockan. Ändå låg gator med 30-minutersgräns gröna i Nu-läget. Regeln som färgar dem blå fanns
redan, men den krävde ett fält bara Stockholm har – så en Göteborgsgata där staden uttryckligen
skrivit "30 min" låg grön, medan en Stockholmsficka där tiden bara är gissad ur längden låg blå.
Vi visade minst där vi visste mest. Nu gäller samma tröskel överallt: finns en tidsgräns kortare
än ett dygn blir gatan blå, med siffran utskriven.

🔴 **Stockholm kastade en tidsgräns den redan hade.** Avgiftsfria platser finns registrerade i
två lager samtidigt. Appen tog bort den ena kopian för att slippa rita gatan dubbelt – men det
var i den kopian tiden bodde. Följden: "kontrollera tidsgräns" på gator där registret säger
2 tim, och grön färg där. I fem ytterstadsområden bar den kastade kopian tiden i 59 fall av 59.
Nu räddas den. **Bekräftat i fält:** skyltarna på Österögatan och Skalholtsgatan i Kista säger
"P 2 tim".

🔴 **Men gränsen gäller inte alltid.** Samma skylt säger också "7–20", och föreskriften avslutar
"övrig tid får fordon parkeras". En lördag finns alltså ingen gräns – ändå stod det "max 2 tim".
Appen kollar nu både vilken dag och vilken timme gränsen gäller, och säger ingenting alls om
den inte gäller just nu. Vet vi inte, står blått kvar: hellre en onödig blick på skylten än en
kontrollavgift.

**"Vardag" betyder inte måndag–fredag.** Det betyder en dag som varken är söndag eller helgdag.
Utan den skillnaden svarade appen "gränsen gäller" på Kristi himmelsfärd och på dagen före –
ungefär 15 av årets 261 vardagar, i båda riktningarna. Svenska helgdagar räknas nu ut, påsken
inräknad.

**Boendezoner slutade motsäga sig själva.** En boendezon utan publicerad tidsgräns visades grön
med texten "kontrollera tidsgräns" – grönt som ber dig hålla koll på klockan. De är blå nu,
med samma förklaring som i Natt-läget. Efter det finns ingen grön sträcka kvar som ber dig
kontrollera tiden.

**Texterna hann ikapp.** Frågan "Vet ParkSpot om en avgiftsfri plats har egna tidsbegränsningar?"
svarade att appen färgar gatan grön. Det gör den inte längre. Rättat både i det synliga svaret
och i den strukturerade datan sökmotorerna läser.

**Kvar, medvetet:** där staden inte publicerar tidsgränsens klockslag står blått kvar hela dygnet
– det gäller bland annat Kista. Och städvarningarnas egen tolkning av "vardag" är orörd; den
rör hela stadens viktigaste färg och förtjänar en egen mätning.

## v1.14.0 – 2026-08-28
**Göteborg finns nu även i sökmotorerna – och en marknadsföringstext som produkten förnekade är borta.**

**Sajten sa att appen bara täcker Stockholm.** En delad länk till Göteborgsvyn förhandsvisades
som "ParkSpot Stockholm" i sociala medier och sökresultat, och `llms.txt` sa uttryckligen att
tjänsten är Stockholm-bara – så en AI-assistent som fick frågan "finns det en app för parkering
i Göteborg" läste vår egen fil och svarade nej. Titel, beskrivning och og-taggar sätts nu per
stad av servern, som är enda stället som hinner före sökmotorernas läsning.

**Fjorton nya sidor om Göteborg:** en översikt, en om städdagar med jämna och udda veckor, en
om boendeparkering och vad n-suffixet betyder, en om parkeringsanläggningar – plus tio
områdessidor, en per boendeparkeringsområde. Alla bär de två saker som skiljer Göteborg:
staden publicerar inga parkeringsförbud, och städningen går varannan vecka.

🔴 **Knappen lovade något appen inte gör.** På 213 sidor stod "Öppna kartan – se lediga platser
live". ParkSpot har inga sensorer för beläggning – det står i appens egen ansvarstext. Nu står
det "se var du får parkera". Knappen leder dessutom till rätt stad.

**Apple Kartor visas för alla.** Den doldes utanför iPhone och Mac med motiveringen att länken
inte öppnar någon app på Windows och Android. Apple har sedan dess lanserat Kartor på webben,
så länken fungerar överallt – verifierat.

## v1.13.0 – 2026-08-28
**Göteborg går att välja – och slutar vara pilot.**

**Stadsval i rubriken.** `ParkSpot Göteborg ▾` öppnar en lista med Stockholm och Göteborg,
och valet kommer ihåg sig till nästa besök. Undertexterna säger vad städerna faktiskt har
("Full data – även parkeringsförbud" mot "Staden publicerar inga parkeringsförbud") – utan
dem ser de likvärdiga ut, och skillnaden är den sort som kan kosta en bot. En delad
`?stad=`-länk sparas; en felstavad gör det inte. Sundbyberg listas inte medan kommunens
karttjänst ligger nere, men länken dit fungerar oförändrat.

**Pilotmärkningen borta för Göteborg.** Den gröna banderollen och "– pilot" i fliktiteln.
Varningen finns kvar i texten under sökrutan, som säger samma sak utförligare.

**Parkeringsanläggningar i Göteborg** – 923 stycken, med kapacitet, operatör och **rätt
pris för stunden**. Priset räknas ut av appen ur kommunens prisfönster, eftersom stadens
eget API svarar fel: uppmätt 2026-08-27 avvek 668 av 764 anläggningar (87 %) – mitt i
högtaxan svarade det nattpriset 2 kr/tim där datan säger 18, 32 och 34. Realtidsfältet för
lediga platser är dessutom tomt på alla 3 511 poster, så den uppgiften finns inte att visa.
Listan heter "Parkeringsanläggningar nära" i Göteborg: staden har inget fält för
anläggningstyp, och att kalla 923 platser för garage vore ett påstående datan inte gör.

**Garagekortet visade inte att det var ett garage.** Rubriken var bara adressen, vilket blev
obegripligt i Göteborg där anläggningar döps efter gatan – "Kristinelundsgatan" finns både
som gata med 11 parkeringssträckor och som anläggning med 25 platser. Kortet visar nu typ,
platsantal och operatör. På köpet rättat: platsantalet har varit **osynligt** på garagekortet
i alla städer, eftersom det skrevs till ett element som är dolt sedan hjälte-designen kom.

**Cykelläget i Göteborg sa "0 platser" fast staden har 1 691.** Lagret var inte inkopplat.
Nu visas de. **Cykelställ ritas bara i cykelläget** – ett cykelställ målades tidigare lila
"ej för dig" för bilister, vilket inte förhindrar något misstag någon gör, och kostade
läsbarhet. MC-rutor och handikapplatser är kvar: de förhindrar riktiga misstag.

**Boendezoner utan publicerad tidsgräns säger inte längre "Trygg över natten".** Ett foto på
Vattugatan i Kungsladugård visade skylten "P 2 tim / Boende V5" på en sträcka där appen
lovade en trygg natt. Göteborg publicerar boendezonen men inte tidsgränsen för 496 av 2 095
sträckor. En boendezon förutsätter att en tidsgräns finns – tillståndet gäller enligt
föreskriften "med avvikelse från gällande tidsbegränsning på platsen" – så grönt byggde ett
löfte på ett hål i registret. De blir blå med "kontrollera tidsgräns". De 1 032 sträckor som
har en publicerad dygnsgräns förblir gröna: där får du som saknar tillstånd faktiskt stå.

**RH-räknaren säger "registrerade" i stället för "reserverade".** Ett fotograferat vägmärke
saknades i alla fem källor vi har, inklusive OpenStreetMap. Räknaren var den enda ytan som
påstod att listan var fullständig. Gäller alla städer.

## v1.12.0 – 2026-08-27
**Appen visste hur länge man fick stå – men sa det bara ibland. Och Göteborg blev stad tre.**

⚠️ **Det här ändrar kartan i Stockholm.** 260 gatusegment på 148 gator som sagt "Trygg över
natten" blir blå med en tidsgräns. Registret har hela tiden sagt max 15 min–4 tim på dem;
appen läste bara aldrig fältet. Nästan alla är avgiftsfria ytterstadsplatser – Kista,
Hässelby, Tensta, Rinkeby, Vällingby – alltså precis där man letar när bilen ska stå natten
över. Mätt över sex stadsdelar: 57 av 8 102 segment bär en maxtid, 55 av dem under ett dygn.

**Maxtiden blev ett eget fält.** `MAX_MINUTES/HOURS/DAYS` läses nu och skrivs alltid om av
appen själv, aldrig kopierad ur källan. En känd maxtid under ett dygn fäller grönt till blått
i Natt-läget – tröskeln är räknad, inte vald: 18:00 → 08:00 är 14 timmar, så inte ens
"12 tim" räcker. Nu-läget byter aldrig färg av en tidsgräns, men säger den numera:
"Får stå nu · max 30 min".

**En formulering i stället för fem.** Appen hade fyra olika blå texter plus en femte i
förklaringsrutan. Nu gäller samma klausul överallt: känd tid → "max 30 min", okänd →
"kontrollera tidsgräns". Lägets eget verb står före ("Får stå nu" / "Får parkera") – det
ska skilja sig, klausulen inte. Förklaringsrutan säger "Tidsgräns – var uppmärksam på tiden".

**Städscheman som gäller varannan vecka lästes som varje vecka.** Ny veckoparitet i
städlogiken (ISO 8601). Stockholm har inga sådana poster och är oförändrat, men i Göteborg
gäller det 1 597 av 2 002 – felet hade slagit varannan vecka utan att synas. Städraden visar
det nu: "Servas onsdagar 09–12 jämna veckor".

**Cykelställ ritas bara i cykelläget.** Ett cykelställ målades lila "ej för dig" för bilister.
Det förhindrar inget – ingen bilist överväger att ställa bilen i ett cykelställ – och kostade
läsbarhet. MC-rutor och handikapplatser är kvar, för de förhindrar riktiga misstag.

**Göteborg som tredje stad** (`?stad=goteborg`, avstängd i drift som Sundbyberg).
Trafikkontorets öppna WFS utan nyckel: städning med säsong och veckoparitet, maxtider,
taxor, boende, MC, rörelsehindrade, lastplatser och 1 691 cykelparkeringar. Staden publicerar
inga parkeringsförbud, vilket sägs rakt ut i appen. Till skillnad från Sundbyberg pekar
Göteborg ut hur länge man får stå – därför finns grönt "Trygg över natten" där.

**Kapabilitetsflaggor blev adresser.** `harPhus`/`harTaxaZoner` var ja/nej med Stockholms-
adresser bakom sig; en ny stad med `true` hade fått Stockholms garage och zoner som sina egna.
Nu pekar varje stad ut sina egna källor, och tom adress betyder att staden saknar källan.

**Bakgrundskartan kräver nyckel.** CARTO stämplar "API KEY REQUIRED" i varje kartruta utan
nyckel. Stöd för `CARTO_KEY` inlagt; utan nyckel fungerar allt som förut, bara med stämpeln.

## v1.11.2 – 2026-08-26
**"Nyss städad" syns nu även när hela staden är blå.** Den ljusblå glowen försvann bland
övriga blå linjer i Sundbyberg. Ersatt med en mörk infattning runt linjen – färgkontrast
och form i stället för en nyansskillnad inom samma kulör. Stockholms gröna variant är
oförändrad (verifierat: 28 halo-linjer vid Sjöviksvägen, oförändrat före och efter).

## v1.11.1 – 2026-08-26
**Debug-klockan kan resa till ett annat datum, inte bara ett annat klockslag.**
`?debugtid=` tar nu även `2026-08-28T07:00`, vilket krävs för att nå en annan veckodag –
Sundbyberg städar bara tisdag och fredag, så halo-effekterna gick annars inte att se
mot riktig data. Klockan går dessutom vidare i simulerat läge i stället för att stå
stilla; en fastfrusen `Date.now()` får Leaflets animeringar att aldrig bli klara.
Datan rörs aldrig – bara klockan flyttas, så städscheman och förbud är kommunens
äkta poster hela vägen.

## v1.11.0 – 2026-08-26
**Inget grönt i städer som inte pekar ut sin korttidsparkering.** Sundbyberg visar nu
blått "kontrollera tidsgräns" både dag och natt i stället för grönt. Skälet är mätt:
alla 808 bilsegment i kommunens data bär en enda platstyp, "P Avgift", så appen kan
inte skilja en tvåtimmarsficka från en långtidsplats – och korttidsplatserna finns
i verkligheten. Regeln (`STAD.skiljerKorttid`, tidigare `harMaxtid`) gäller nu båda
lägena och alla städer: kan staden inte skilja korttid från långtid ritas inget grönt.
Städsignalerna är orörda – "nyss städad" finns kvar, i blått. Förklaringsrutan,
läges-chippet och intro-texten följer med. Också rättat: taxa-prisstegen visades i
förklaringen även i städer utan taxazoner. **Stockholm är orört** (verifierat: 602
gröna segment i Nu, 602 i Natt, "Trygg över natten" och prisstegen kvar).

## v1.10.0 – 2026-08-26
**Välj navigeringsapp: Google Maps, Apple Kartor eller Waze.** Navigeringsknappen på
platskortet är nu delad – vänstra delen kör igång i vald app, pilen till höger öppnar
en liten låda med apparna. Valet sparas och gäller även listornas ↗-knappar och
kartpopupen. Google Maps är standard för nya användare, precis som förut.
Apple Kartor visas bara på iPhone/iPad/Mac (länken öppnar ingen app på Android/Windows).
Waze går inte att kontrollera från en webbsida – länken öppnar appen om den finns,
annars Wazes webbkarta.

## v1.9.0 – 2026-08-26
**Sundbyberg flyttar in i huvudversionen – avstängd i drift.** Ingen synlig
förändring för användarna: Stockholm är oförändrat och Sundbyberg syns inte publikt.

Sundbyberg har legat på en egen gren sedan pilotstarten. Det höll så länge grenen var
ung, men den började halka efter. Varje Stockholm-fix måste plockas över för hand, och
en gren som ligger efter är en gren där redan lagade buggar kryper tillbaka. Piloten
hittade dessutom sex buggar i Stockholm som fick flyttas åt andra hållet. Två kopior av
appen som driver isär är en sämre affär än en kopia med en strömbrytare.

Nu bor koden i huvudversionen men är avstängd när appen kör skarpt. Sundbybergs
kartserver är öppet åtkomlig, men åtkomlig är inte samma sak som licensierad – frågan
är ställd till kommunen och obesvarad. Inget av Sundbyberg når publiken förrän de
svarar ja.

| läge | vad som händer |
|---|---|
| Railway (drift) | av – adaptern laddas inte ens, inga anrop mot Sundbybergs server |
| Lars dator | på – ingen handpåläggning behövs |
| `STADER=sundbyberg` | på, även i drift – så publicering blir en variabel, inte en kodändring |
| `STADER=av` | av, oavsett läge |

Stadskoden ligger i `cities/sundbyberg.js` bakom ett kontrakt (`id`, `prefix`,
`hantera`). Stad nummer tre blir en fil att kopiera i stället för ett block att väva in
i `server.js`, och stadskod kan inte längre råka blandas in i en kärn-commit.

**Stockholm bevisat orört:** 21 vägar mätta före och efter – 20 byte-identiska. Den enda
som skiljer är `index.html`, som växer 328 252 → 334 073 tecken; det är stadskoden som
följer med, avstängd. Mätningen täcker index, servicedagar, tre bbox-uttag, tre
schedule-uppslag med riktigt innehåll, WFS tillåten + taxa, fem SEO-sidor, sitemap,
robots, llms och 404. Verifierat mot tre riktiga serverstarter, inte påtvingade värden.

**Sundbyberg säger inte längre "Trygg över natten".** Lars gick Brunnsgatan med skylt i
handen: vid vändplanen i norr (59.363734, 17.968813) står **2 tim**, och appen ritade grönt
"Trygg över natten" på segmentet 14 meter därifrån. Att följa appen där ger kontrollavgift.

Orsaken är inte ett trasigt segment utan en lucka i källan: **maxtid finns inte i
Sundbybergs data.** Kontrollerat mot alla 48 karttjänster kommunen publicerar – de enda
tidsfälten i parkeringslagren är städtid, avgiftstid och ett 30-minutersfönster satt på 18
av 812 segment. `Typ_av_parkering` visade sig betyda längsgående kontra vinkelparkering.

Ny kapabilitetsflagga `STAD.harMaxtid`. Är den falsk fälls varje grön "Trygg över natten"
till den blå nivå appen redan använder för Stockholms korttidsfickor: **"Får parkera –
kontrollera tidsgräns"**, med detaljraden "Maxtid saknas i kommunens data – skylten avgör".
Förklaringen byter ut sin "Trygg över natten"-rad mot en mening som säger varför, och
räknaren säger "N platser – kontrollera tidsgräns" i stället för "0 trygga platser".
**Nu-läget rörs inte** – "får du stå just nu" är sant även med en tidsgräns.

Fällningen ligger EFTER färgkedjan, inte i tre grenar. Då kan Stockholm inte påverkas
(hela blocket hoppas över när `harMaxtid` är sant) och framtida gröna grenar fångas
automatiskt. Uppmätt i appen, Vasastan, före och efter: **identiska färgräkningar och
badgetexter i båda lägena** (natt 571 gröna / 310 röda / 113 amber, "201 trygga platser i
natt"; nu 615 / 360 / 19, "221 gator där du får stå nu"). I Sundbyberg blev exakt de 184
gröna blå, inget annat rördes, och Nu-läget står kvar på 185 gröna.

Mätverktyget hade själv två fel som gömde sanningen och nu är lagade: fyra svar visade
"samma längd, olika hash", vilket var WFS-svarens tidsstämpel med millisekunder som
normaliseringen missade – inte en beteendeändring utan en trasig mätsticka. Och fyra
testvägar pekade fel (tomma scheman, en 404), alltså testade de ingenting.

## v1.8.5 – 2026-08-26
Textfix: "Flytta bilen innan 06 **ikväll**" → "innan 06 **i morgon**". Klockan 06 är
inte på kvällen. Felet fanns i varje fall texten visades — natt-grenen utlöses bara
när fönstret börjar före 07:00, så klockslaget ligger alltid mellan 00:00 och 06:59.
Nålarnas motsvarande text har alltid sagt "i morgon"; gatuvägen var den avvikande.
Midnatt behåller sin egen formulering ("innan midnatt") — då öppnar fönstret faktiskt
ikväll, och det är tydligare än "innan 00 i morgon".

Kontrollerat vilka lägen som berörs: **cykel/moped klass 2 berörs inte** (läget ritar
inga gatlinjer alls — uppmätt 5 mot bilens 1173). **Rörelsehindrad-läget berörs, och
ska göra det**: trafikförordningen 13 kap. 8 § ger tillståndet "rätt att parkera under
högst tre timmar där parkering enligt en lokal trafikföreskrift är förbjuden" — en
städdag är en sådan föreskrift, alltså tre timmar och inte undantag. Att tysta
varningen där vore falsk trygghet för den grupp som har svårast att flytta bilen snabbt.
`35c7650`

## v1.8.4 – 2026-08-25
"Över natten" missade ändamålsplatser helt. Läget frågade bara om **städning** i
morgon bitti, så en lastplats som blir aktiv 07:00 föll rakt igenom färgkedjan till
grön "Trygg över natten" — utan ett ord om att bilen måste flyttas. Nu-läget hade
rätt hela tiden; det var specifikt natt-läget som aldrig ställde morgondagens fråga
om segmentets *egna* tidsfönster.

Fixen speglar städlogiken i stället för att uppfinna en ny: det finns **två** slags
morgonhinder, inte ett. Städningen kommer från gatan, ändamålsplatsen från segmentet
självt — och det som öppnar **först** binder, för bilen måste vara borta innan det
första fönstret börjar. Samma `overnightCleaningTier` avgör natt/morgon/sen. Texten
skiljer på vad som kommer: "Lastplats imorgon 07–19" mot "Servas imorgon 07–19".

Omfattning i fem innerstadsområden: 1 197 påverkade segment (1 164 lastplatser,
30 på-/avstigning, 2 taxiplatser, 1 skolskjuts). Av 1 552 ändamålsplatser är **noll**
aktiva kl 22–04 men **1 442 aktiva kl 07:00** — felet biter alltså på morgonen, vilket
är precis vad natt-läget lovar: att bilen kan stå kvar tills du hämtar den.

Verifierat i samma vy före och efter: grön 588 → 550 (−38), amber 104 → 142 (+38),
och röd/lila/rosa/orange samt totala antalet linjer exakt oförändrade. Tio amber-segment
klickade via riktig klickväg: nio städsegment behöll sin ordagranna text, ett fick den
nya lastplatstexten. Marktestat mot originalföreskriften `0180 2018:02726`
(Kungstensgatan), där data, sträcklängd 12 m och sida stämmer med beslutet.
`b7766af`

## v1.8.3 – 2026-08-25
En latent bugg i regelmotorn plus ett nytt verktyg. **Stockholms beteende är
oförändrat** — det är mätt, inte antaget.

`andamalActiveAt()` returnerade `null` när en ändamålsplats (lastplats, taxi,
på-/avstigning) hade klockslag men saknade både `DAY_TYPE` och `START_WEEKDAY`.
`null` betyder "rör inte segmentet", så en aktiv lastplats hade sluppit igenom och
sträckan kunnat visas grön. Det strider mot funktionens egen försiktighetsprincip:
vaktens uppgift är att fånga ETT tolkbart villkor, och tiden ÄR tolkbar. Tom
dagangivelse betyder alla dagar, inte "okänt". Nu returneras `true`.

Uppmätt i åtta områden (Vasastan, Norrmalm, Gamla stan, Södermalm, Östermalm,
Kungsholmen, Hägersten, Bromma): 11 308 P_TILLATEN-poster, 1 552 ändamålsplatser,
och **noll av dem når den ändrade raden** — alla har både tid och dag. Domarna före
och efter är identiska (1 538 inaktiva, 14 aktiva, 0 otolkbara). Buggen är alltså
latent i Stockholm men blir verklig så snart en stad skriver lastplatser utan
dagangivelse, vilket Sundbyberg gör i 35 av 74 fall.

Nytt verktyg `verktyg/stadskoll.js` (rör ingen appkod): läser av vilken data en stad
publicerar och matchar mot vad appen påstår, så frågan "vilka påståenden kan appen
göra här, och vilka måste den tiga om" går att svara på innan någon utvecklar något.
Går alltid ner till lagren, aldrig bara tjänsternas namn.
`9411ea8`, `71c5f5f`

## v1.8.2 – 2026-08-25
Bottenlådans höjd kommer nu från `85%` i stället för `85vh`, så CSS och JS inte kan
glida isär. Lådan är absolutpositionerad i `#app` (`position:relative; height:100%`),
så procenten räknas mot appens faktiska höjd — exakt det tal `sheetCompute()` läser
som `appH`. Med `vh` fanns två oberoende sanningar: på iOS är `vh` den *stora*
vyporten (adressfältet borträknat) medan `window.innerHeight` är den faktiska, och de
är oense så fort adressfältet syns. Initiala peek-läget gick från
`translateY(calc(85vh - 118px))` till `calc(100% - 118px)` — procent i `translateY`
syftar på elementets egen höjd, alltså samma innebörd utan vyport-beroende.

Omfattningen, ärligt: `full`, `peek` och `min` härleds alla relativt lådans egen höjd
och tog till stor del ut sig själva, så detta var ett **proportionsfel, inte ett
överflöde**. Där CSS och JS redan var ense: 690 px, identiskt före och efter. Med
simulerat adressfält (app 730 av 812) gav gamla koden 690 px = 94,5 % av appen i
stället för 85 %. Lådan stack aldrig ut nedanför appen — den var för hög i förhållande
till skärmen, vilket förskjuter `half`/`full` och den plats legenden får.

Ej ändrat, men dokumenterat i ARKITEKTUR.md §9: i `full`/`half` hamnar legenden under
lådan (uppmätt överlapp 193 px) eftersom `fitLegendHeight()` har ett golv på 120 px som
vinner över att få plats. Avsiktligt, och sannolikt det som upplevts som "hoptryckt
legend".
`da29528`

## v1.8.1 – 2026-08-25
Vakthund som håller kartans canvas i takt med sin container, efter att Lars
återskapat frysningen live 24/8 och fotograferat den. Bilden visade en *riven*
rendering: baskartan målad över hela containern medan överläggen (taxa-zoner +
p-linjer) bara täckte översta tredjedelen — vilket utesluter den tidigare ledande
teorin om en nätverksstall, som hade fryst hela vyn intakt.

Mekanismen: vektorlagren ritas på EN canvas (`L.canvas`). Leaflet håller den i takt
med containern via `trackResize`, men korrigeringen kör inuti `requestAnimationFrame`.
Stryper iOS rAF — tangentbord, adressfält som fälls in, minnestryck — kör den aldrig
och ingenting försöker igen. Eftersom canvas-renderaren dessutom *träffkollar* mot
canvasen blir kartan död för tryck utanför den, vilket känns som en låst app.

`kartSynkKoll()` jämför `map.getSize()` med containern och rättar med
`invalidateSize({pan:false})` vid mer än 2 px avvikelse — var 2:a sekund plus vid
`visibilitychange`, `pageshow`, `orientationchange` och `visualViewport.resize`.
Intervallet är poängen: felet uppstår när en händelse fick köra men dess uppföljning
inte gjorde det, så en ny händelse kan inte förutsättas komma. Utfall loggas till
localStorage och överlever omstart — läsbart via `?kartlogg=1` efter en frysning.

Verifierat: inducerad äkta desynk (container 499→620 utan resize-event, Leaflet kvar
på 499) rättad inom 1,3 s; **0 utslag på 25 s normal drift**. Före detta anropades
`invalidateSize` noll gånger i hela filen och det fanns ingen återhämtningsväg alls.

⚠️ Grundorsaken är **inte bevisad** — detta är ett skyddsnät som samlar bevis, inte en
verifierad fix. Den kända `85vh`-mot-`innerHeight`-skörheten i lådan är inte åtgärdad.
Båda dokumenterade i ARKITEKTUR.md §9.
`91068a8`

## v1.8.0 – 2026-08-25
Regelgranskning mot vägmärkesförordningens E19 och C35: en utmärkt specialplats
*pausar* gatans angivelser på sin sträcka, och en reglering gäller bara den sida
skylten står på. Fyra fynd därifrån, plus ett femte som föll ut ur en helt annan
utredning (vilande städsäsong). Alla mätta mot riktig data i sex
innerstadsområden (Vasastan S+N, Norrmalm, Södermalm, Östermalm, Kungsholmen).

**MC-rutor styrs nu av sin EGNA städföreskrift på alla nivåer**, inte bara
"städas nu" – resten (nyss/snart/trygg/risk) hämtades tidigare från gatan.
Uppmätt har 64 av 64 MC-rutor en egen föreskrift, och dagen skiljer sig ofta från
gatans: Holländargatan har både en måndagsruta och en onsdagsruta. Den ruta som
saknar gatunamn fick tidigare ingen städdom alls och visades utan varning natten
den faktiskt städas. Kortet visar nu rutans eget veckoschema.

**Cykelplatser påstår inte längre gatans städdag som faktum** när stödet bara är
en grovt dragen bilstädlinje som råkar passera. Av 16 sådana fall hade bara 1 en
vertex inom 3 m vid båda ändarna – kommunen har varken ritat runt eller genom
platserna (Rådmansgatan: 62 m linje på 2 punkter). Nu gul ring i stället för grön
och texten "Gatan städas måndagar 00–06 – gäller sannolikt inte här". En plats med
egen föreskrift påstår fortfarande, som förr.

**Städmatchningen låser till gatans egen sida innan veckodagarna jämförs.**
25-metersgränsen spänner över de flesta innerstadsgator, och dagsloopen gick i
tidsordning – låg egen sida på 0 m och grannsidan på 12 m med en tidigare dag,
vann grannsidan. 34 segment svarade med andra sidans nästa städning; nu 0. De 30
som därmed tystnade är Narvavägen, vars egen sida har säsong 1/12–15/5 och alltså
inte städas i augusti – borttagna falska varningar, inte tystade riktiga.

**MC-kortet visade schemat två gånger**, gatans i kalenderraden och rutans i
klockraden, när dagarna sammanföll.

**Vilande städsäsong sägs nu rakt ut.** Hittad via Sundbyberg-piloten, men felet
satt i Stockholm: `/schedule` hoppade över poster utanför säsong helt, så en gata
med vinterschema (1/11–15/5) föll i augusti ut som tomt schema och kortet skrev
"Ingen registrerad servicedag – kontrollera skylt". Schemat är registrerat, det
vilar. Uppmätt mot live-API:t: 5 964 av 6 171 säsongsposter vilar just nu
(96,6 %), fördelat mån–fre, och 1 465 gator saknade därför städtext helt. Nu står
det "Servas måndagar 08–16 · vilande till 1 nov". Gatufärgerna var hela tiden
korrekta – de går via `/servicedagar-bbox` och gatorna städas faktiskt inte i
augusti – så det var en textbugg, inte en säkerhetsbugg. De 64 gator som har både
en aktiv och en vilande säsong visar fortsatt bara den aktiva.

`355d46d` … `164b02f`

## v1.7.1 – 2026-08-22
Moped klass 1 tillagt i MC-parkeringstexten, appen och SEO-sidorna. Verifierat
mot 7 RDT-originalbeslut (2018–2026, 6 stadsdelar) att moped klass 1 juridiskt
delar alla MC-parkeringsplatser i Stockholm – MC_VEHICLES-logiken var redan
korrekt sedan 21/8, det som saknades var texten. Uppdaterat: FAQ (ny fråga +
utökat svar), fordonsväljarens etikett, legend, platskortstitel och hint-text
(tre separata kodvägar) i appen; ny fråga på huvudhubben "parkering", utökat
taxa-svar och produktbeskrivning på om-parkspot i SEO-sidorna.
`55bef8e` … `b507dbd`

## v1.7.0 – 2026-08-21
Cykel-/mopedplatser: två separata "lånad städtext från en orelaterad bilgata"-buggar
hittade och fixade (gatunamns-baserad fallback i fetchCykelPlatser, samt platskortets
egna gatunamns-schema-uppslag) – upptäckta genom fälttest (Onkel Adams Väg). Riktiga
citation-kopplade fall (Vegagatan, Spelbomskans Torg) återinförda. Ny geometrisk
sammanfallningskoll: en cykel-/mopedruta utan egen citation ärver nu bilens städschema
när den bevisligen ligger på samma fysiska yta (Norra Agnegatan-fallet, verifierat mot
RDT-föreskrift + vägmärkesförordningen), inte bara på gatunamn.
`239773c` … `2565ac9`

## v1.6.0 – 2026-08-21
FAQ:n i om-modalen omgjord till strukturell schema.org-markup (Question/Answer),
synkad ordagrant med JSON-LD (en säsongsfråga hade glidit isär i ordval). Fyra nya
frågor: MC-parkering, "nyss städat/kommer städas"-glow-effekten, rörelsehindrad-läge
och avgiftsfri-parkering-schemat.
`0b0a58e` … `e6ad38a`

## v1.5.9 – 2026-08-20
SEO/AEO-omgång: FAQ + FAQPage-schema på de 6 hubbsidor som saknade det,
entitetsgraf i index.html utökad med cykel/moped/RH + dateModified, borttaget
felaktigt "läget I kväll"-påstående (pekar på Nu-läget istället), llms.txt
tillagd + teckenkodningsbugg fixad på .txt-filer.
`8b59607` … `f18a1ab`

## v1.5.8 – 2026-08-19
"Avgiftsfri parkering" utan egna villkor är ofta ett riktigt förbud, inte en
frizon – rättad logik och text. Grönt (inte blått) för avgiftsfri-poster där
schemat är verifierat säkert just nu.
`045ddb8`, `007b368`, `4cd462c`, `4d43bc0`

## v1.5.7 – 2026-08-19
UX-städbatch: gula streckade städlinjer borttagna helt (alla lägen), stäng-kryss,
kompakt läges-ruta, sökradie 500→250, städad cykel-legend/RH-rättighetsruta.
`9a333fd`, `98ff023`, `006af4e`, `9dbf005`

## v1.5.6 – 2026-08-19
Server-cachens minnesgräns höjd 64→512 MB.
`a822ef5`

## v1.5.5 – 2026-08-18
Cykel/moped klass 2 som eget nål-lager (ingen gatufärgning). MC/RH/cykel-nålar
får städnings-status (nyss städad/städas snart/städas nu), legend-förklaringar,
vit kant på ringarna, tona-ner-stöd för busshållplatser. Innehåller en rollback
("allvarliga fel hittade") och en efterföljande återställning av samma rollback
samma dag.
`a473836` … `7d428c5`

## v1.5.4 – 2026-08-18
"Avgiftsfri parkering"-sträckor får egen blå färg med tidsgräns-varning istället
för rött eller tyst grönt. Flyttad högre i legenden, nämnd i "Nu"-introtexterna.
`fd14428`, `b83c14a`

## v1.5.3 – 2026-08-17
Polygon-yta-fixar: rättad riktning på skevade räddade p-ytor (minsta omskrivna
rektangeln), MC-reserverade ytor räddade från att vara osynliga, MC-ytor riktade
efter grannens vinkel istället för egen diagonal.
`2770783`, `77e7dce`, `7618fe5`

## v1.5.2 – 2026-08-16 – 2026-08-17
Förbud-tidsfönster respekteras: läser postens faktiska tidsfönster istället för
att alltid rita rött, grönt för förbud vars tidsfönster inte är aktivt just nu.
Räddade osynliga "P Avgift, boende"-parkeringsytor.
`16b5248` … `283019d`

## v1.5.1 – 2026-08-14
Rättat inaktuellt boendeparkeringspris i platskortet (zon 1–3). Nytt
stickprovsläge (`?debug=1`) som visar sväljningsmodellens beslut per klick.
`922e62b`, `87072c8`

## v1.5.0 – 2026-08-13
Boendeparkeringspriser (kr/dygn, kr/30 dagar, MC) på taxa-SEO-sidorna och de
16 stadsdelssidorna. Källa: parkering.stockholm.
`a24c6da`, `8d37ef0`

## v1.4.0 – 2026-08-12 – 2026-08-13
Busshållplatser (SL/OSM): röd nål på kartan + platskort med varningstext,
kopplad till "Tona ner"-switchen. Backend-cache (48h TTL).
`47d87b2`, `fd21e4c`, `ef862ea`

## v1.3.0 – 2026-08-12
"Platsmodell" fas 1/2a/2/2c – träffsäkerhetsfixar: dubbelregistrerade platser
rensas, rityordning för överlappande förbud, taxa-typad data målas aldrig
rött längre.
`16287e6` … `43a6c82`

## v1.2.0 – 2026-08-10
"Hidden gem"-glow för gator med 2–7h kvar till städning i Nu-läget (orange
som möjlighet, inte bara varning). Prestanda: bbox-skopade sökningar,
TCP/TLS keep-alive mot Stockholms API.
`0bf2ff9` … `7b02f5f`

## v1.1.0 – 2026-07-30 – 2026-07-31
Morgon och Kväll slås ihop till Nu (fyra lägen → två: Nu/Natt). "Nyss
städad" får en egen glow istället för bara en ljusare nyans.
`28c5f36` … `af99842`

## v1.0.0 – 2026-07-27 – 2026-07-29
Första formellt versionsstämplade releasen (`/version`-endpoint infört).
500m-glappet i städmatchning fixat i alla lägen, ändamålsplatser och
rörelsehindrade-platser ritas korrekt, taxa-zoner cachas.
`8dd0a59` … `934073d`

## v0.5.0 – 2026-07-13 – 2026-07-24
AEO/entitetsgraf + Om-sida. Recensions-/feedback-loop (👍/👎 loggat till
Google Sheets). Ljust tema. MC-läge (eget fordonsval, mc-rutor, mc-taxa).
Rörelsehindrade-läge.
`be8620c` … `789f917`

## v0.4.0 – 2026-06-15 – 2026-06-21
Besöksfickor (VF_METER). Gågator flaggas (vinkelrät distans + täckningsgrad).
Fyra-läges-modellen (Nu/Morgon/Kväll/Natt). SEO: intern länkning,
kategori-hubbar, 109 gatu-sidor, engelska sidor.
`5cf3c0b` … `e045e78`

## v0.3.0 – 2026-06-06 – 2026-06-10
Taxa-pris i platskort och popup. Parkeringshus som sista utväg (Google
Maps-körväg). Enhetlig UX i alla lägen. SEO: programmatisk sidgenerator
(77 sidor).
`99c4486` … `e0ded81`

## v0.2.0 – 2026-06-02
Strukturerad datagrund (P_TILLATEN/P_FORBUD). Enande skal: "när"-väljare,
bottensheet, grönt färgspråk. Nu-läget i realtid. Release-prep:
server-side API-nyckel, GDPR-samtycke.
`9f0b03c` … `0ebf8ba`

## v0.1.0 – 2026-05-25 – 2026-06-01
Första fungerande prototypen: gatusökning, städgator-filtrering via
Stockholms öppna data, grundläggande SEO.
`fcf5454` … `384714e`
