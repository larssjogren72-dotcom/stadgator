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

## v1.42.3 – 2026-09-20
**Centrums hål blev aldrig grå – min urvalsregel räknade fel.**

Lars efter tre justeringar av tonen: «nu börjar jag ledsna på dig», med en bild där
förklaringsrutans ruta är tydligt grå medan kartans fläckar fortfarande är **vita**. Han hade
rätt, och de tre tonjusteringarna var fel spår: fläckarna var inte för ljust färgade, de var
**inte färgade alls**.

**Felet:** regeln som skiljer munkhål (där en inre zon ligger) från hål med egna regler
testade mot andra zoners **yttre ringar**. Uppsalas zon E omsluter hela staden, så varje hål
i A, B, C och D såg ut att «täckas av E» och hoppades över. **50 av 161 hål, allihop i
centrum** – precis där man tittar.

Att det blev **110 grå hål** såg ut som en lyckad siffra i alla mina prov. Den fråga jag
aldrig ställde var *vilka*: samtliga 110 låg i zon E.

**Rättat:** en zons YTA är yttre ringen **minus dess egna hål**. En punkt i D ligger då inte
längre «i E», eftersom D sitter i E:s stora hål. Resultat: **159 grå hål** (A 4, B 6, C 8,
D 31, E 110) och 2 äkta munkhål.

Samtidigt borttagen en ordningsberoende risk: de grå hålen ritades per zon, så en senare zons
fyllning kunde lägga sig över en tidigare zons grå. De ritas nu i ett andra svep efter alla
fyllningar – kontrollerat: de grå är lager 10–168 av 169.

Provat: Uppsala 159 grå hål fördelade över alla fem zoner (inte bara E) · Stockholm oförändrat
16 · Karlstad 0 och ingen rad · inga konsolfel.

## v1.42.2 – 2026-09-20
**Starkare grå ton på zonhålen – och opaciteten räckte inte som reglage.**

Lars: «ton upp». Att bara höja opaciteten hade knappt synts, och det går att visa varför:
blandningen mot bakgrundskartan är `a·färg + (1−a)·242`, så **färgen sätter ett golv som
ingen opacitet kan gå under**. Med `#a1a1aa` (161) är det mörkaste möjliga rgb(161) även vid
full opacitet – steget 0,70→0,85 hade gett rgb(173), tolv nivåer. Därför mörknades färgen
till `#8b8b94`, som på 0,85 ger **rgb(154)**: 31 nivåer mörkare än förut och klart under
zonernas egna fyllningar (rgb 220–240).

Hela skalan står nu i koden vid `ZON_HAL_FYLL`, så nästa justering inte blir en gissning:

| Färg och opacitet | Blandad ton | Utfall |
|---|---|---|
| `#a1a1aa` @ 0,40 | rgb(210) | lästes som vitt (v1.42.0) |
| `#a1a1aa` @ 0,70 | rgb(185) | syntes, men Lars ville ha mer (v1.42.1) |
| `#8b8b94` @ 0,85 | **rgb(154)** | nuvarande |
| `#71717a` @ 0,85 | rgb(132) | nästa steg om det behövs |

Städat samtidigt: kommentaren vid själva ritningen upprepade historiken och angav dessutom
fel aktuellt värde efter bytet. Den pekar nu på konstanten, där räkningen bor.

Provat: 110 grå hål i Uppsala med färg rgb(139,139,148), kartan och förklaringsrutan på
samma 0,85, inga konsolfel.

## v1.42.1 – 2026-09-20
**Det grå syntes i förklaringen men inte på kartan – tonen var för svag.**

Lars efter v1.42.0: «de är fortfarande vita på kartan, förklaring visar grå». Felsökt i
drift innan något ändrades, för att utesluta att ytorna inte ritades alls:

- Geometrin stämmer – största hålet mäter **381×209 px** på skärmen.
- Ritordningen stämmer – de grå ligger **sist av 120 paths**, alltså överst.
- Inget dämpar dem – beräknad `fill-opacity` 0,4, pane-opacity 1, `visibility: visible`.

Problemet var alltså rent perceptuellt, och det går att räkna på: bakgrundskartan ligger runt
242, så `#a1a1aa` på 0,40 blandar till **rgb(210)** – drygt 30 nivåer från vitt, bredvid
zonernas ljusa färger (den gula fyllningen landar på rgb(240,223,172)). Det läses som vitt.
**0,70 ger rgb(185,185,192)**, ungefär 40 nivåer mörkare än zonerna – tydligt en yta, men
fortfarande genomskinlig nog att gatunamnen syns i de fyra stora hålen (~11 ha).

Opaciteten är nu **ett tal** (`ZON_HAL_OPACITET`) som både kartan och förklaringsrutans
färgruta läser. Låg de som två tal kunde rutan visa en ton kartan inte har – vilket är exakt
det Lars såg. Räkningen förutsätter den nuvarande bakgrundskartan; byts den måste talet
räknas om, och det står i koden.

Provat: 110 grå hål i Uppsala, kartan och rutan på samma 0,7, inga konsolfel. **Tonen är
fortfarande inte ögongranskad av mig** – förhandsvisningen ritar kartan tom i den här
sessionen, så värdet är räknat, inte sett.

## v1.42.0 – 2026-09-20
**Zonkartans vita fläckar var äkta hål – nu grå, med en rad som säger varför.**

Lars fotograferade Uppsala: zonkartan full av vita fläckar som såg ut som trasig rendering.
De är äkta hål i **kommunens egna** zonpolygoner, och de betyder något. Uppmätt samma dag:
**288 parkeringssträckor börjar inuti ett sådant hål**, och den vanligaste taxan där är
«7–16 Tillstånd erfordras» (130 sträckor), följt av «3 timmar 0 kr» och skolparkering.
Utanför hålen är det tvärtom bara de vanliga zonpriserna. Uppsala har alltså stansat ut
ytorna med flit – att fylla igen dem med zonfärgen hade lovat «5 kr/tim» där man behöver
tillstånd.

Hålen får därför en **dämpad grå ton** i stället för att lämnas vita, plus en rad i
förklaringsrutan: **«Egna regler – zonens pris gäller inte»**. Grått läses som «något annat
gäller här», vitt som «trasigt».

**Två sorters hål, och skillnaden är semantisk – inte en storleksgräns:**
- **Munkhål** – zon E omger D som omger C, så varje yttre zon har ett hål där den inre
  ligger. De ska inte bli grå; den inre zonen fyller dem redan.
- **Egna regler** – resten.

Ett hål räknas som munkhål om en **annan zon täcker det**. En ytgräns hade varit en gissning
som tyst blir fel när kommunen ritar om – och den var mätbart fel: den klassade Stockholm som
9 munkhål / 13 egna, medan den rätta regeln ger **6 / 16**. Uppsala: 161 hål = **51 munkhål +
110 med egna regler**.

Detaljer: ingen kant runt fläckarna (en kant runt 110 hål gjorde E-zonen prickig när det
provades tidigare) · grå `#a1a1aa` på 0,40 – inte 0,28, eftersom bakgrundskartan är nästan
vit och en svagare ton fortfarande lästs som ett hål · färgen är oanvänd i appen sedan
tidigare (MC-lägets «ej för MC» är blågrått **och en linje**, inte en yta) · zonfärgerna
själva är orörda · förklaringsraden visas bara i en stad som faktiskt fick grå fläckar
ritade, så Karlstad och Göteborg är oförändrade.

Provat mot riktig data: Uppsala 110 grå hål ritade, Stockholm 16, Karlstad 0 och ingen rad ·
alla med rätt färg, rätt opacitet och utan kant · inga konsolfel. **Bilden är inte
ögongranskad** – förhandsvisningens skärmbilder av kartan gick inte att få fram i den här
sessionen, så tonen kan behöva justeras efter en titt på riktig skärm. Den sitter i ett tal.

## v1.41.5 – 2026-09-20
**Rubriken bär klockslaget när `?debugtid=` är på.**

Rubriken under appnamnet visade den simulerade **dagen** men inte tiden: «Onsdag 23 sep».
Nu står hela tidpunkten där – **«Onsdag 23 sep · 14:30»** – och bara när klockan faktiskt är
flyttad. Utan `?debugtid=` är rubriken oförändrad.

**Rättelse till det jag sa när ändringen föreslogs:** jag beskrev det som att en simulerad
tid annars kunde misstas för den riktiga. Det stämde inte – den röda badgen «⏱ SIMULERAD
TID · ons 23 sep. 14:30» finns sedan tidigare och bär redan både dag och klockslag. Den
verkliga nyttan är en annan: badgen sitter längst ned och faller lätt bort när en skärmbild
beskärs, medan rubriken ligger i toppen. Tidpunkten följer alltså med bilden.

- Klockslaget tas ur `KLOCKA.nu()`, alltså **inklusive Framåt-steget**: rubriken säger samma
  tidpunkt som kartan svarar på. Med `debugtid=23:45` och +60 blir rubriken «Måndag 21 sep ·
  00:45» – både datum och klocka rullar över midnatt.
- Ny `KLOCKA.simulerad()` svarar på frågan «visar appen en påhittad tidpunkt», på ett ställe.
  Den räknar bara `?debugtid=`, inte Framåt – Framåt är användarens eget val och har redan
  ett eget band över kartan.
- Rubriken sattes på **tre** ställen med var sin formatering. Nu en funktion,
  `headerDatumText()`, som alla tre använder.

Provat: utan debugtid oförändrad rubrik, även med +30 · med debugtid «Onsdag 23 sep · 14:30»
medan riktig tid är söndag 19:14 · +30 ger «· 15:00» och bandet säger samma sak · kort form
`?debugtid=23:45` fungerar och +60 rullar över till «Måndag 21 sep · 00:45» · ogiltigt värde
(`?debugtid=struntprat`) faller tillbaka på riktig tid utan klockslag i rubriken.

## v1.41.4 – 2026-09-20
**iOS förstorade halva förklaringsrutan – och raderna var för luftiga.**

Lars fotograferade rutan på iPhone: «Avgiftszoner · dyrast → billigast» ritades **större** än
«Tidsgräns – var uppmärksam på tiden» och radbröts, trots att etiketten är 11 px och raden
12 px, och trots att den längre raden fick plats på en rad. Det syns inte i en emulerad
mobil, bara på riktig iOS.

**Orsaken:** Safaris egen textförstoring (text autosizing) skalar upp text i vanliga block
efter blockets bredd – men rör inte flex-behållare. Färgraderna är flex och förblev 12 px;
zonetiketten, prisfotnoten och feedback-länken är vanliga block och blåstes upp. Viewport-
taggen stänger **inte** av det; bara `text-size-adjust` gör det. Satt på `.legend`, inte på
body: övrig text i appen är inställd som den ser ut **med** uppblåsningen, och att stänga av
den överallt hade krympt texter ingen klagat på.

**Och luften:** radhöjd 1.9 gav 27 px höga rader för 12 px text. Raderna är inte tryckytor
(bara reglaget är det), så höjden behövde inte hållas uppe. Nu 1.5 → **22 px per rad**, och
färgrutans centrering räknas ur radhöjden i stället för att vara en handräknad siffra som
tyst blir fel nästa gång någon rör värdet.

Provat i fem städer × två lägen × fyra fordon: indrag 22 px, färgrutans mitt 11 px och
radhöjd 22 px överallt (40 px bara för den röda Nu-raden som wrappar med flit), två
textstorlekar, två radhöjder. Inga konsolfel. **Att iOS-förstoringen är borta går inte att
mäta i en emulator – det kräver en riktig iPhone.**

## v1.41.3 – 2026-09-20
**Typografin i förklaringsrutan – en textkolumn, två storlekar, en rytm.**

När Karlstads prisstege flyttades ner (v1.41.0) syntes det som alltid hade varit fel i
rutan, bara inte lika tydligt. Uppmätt på 375×812:

- **Två textkolumner.** Prisraderna har med flit ingen färgruta (en färgruta hade lovat att
  kartan färgas så), men utan indragning började de vid lådans kant medan färgradernas text
  börjar 22 px in. Stegraderna räknar nu sin indragning **ur färgrutan + luften**, så de inte
  kan glida isär från dem.
- **Tre textstorlekar och två radhöjder.** 10 px noter, 11 px etiketter, 12 px rader – och
  1.4 mot 1.9 i radhöjd. Nu **två storlekar** (12 för raderna, 11 för allt sekundärt) och
  **två radhöjder** (färgradernas 1.9 är tryckytehöjd, sekundärtextens 1.5 är typografi).
  Zonetiketten ärvde dessutom 1.9 och blev 21 px hög – lika hög som en hel färgrad, fast den
  bara är en rubrik.
- **Skrollisten låg ovanpå priserna.** Systemets list är överlagrad: den tar 0 px i layouten
  men målas över innehållet, och det enda högerställda i rutan är Karlstads priser. Lådans
  högermarginal ligger nu innanför skrollytan i stället – textens högerkant står på exakt
  samma pixel som förut, men listen har egen plats. Priserna hamnar därmed i linje med
  stängningskrysset.
- **Färgrutan mot första raden.** Stockholms «Får inte stå – förbud, lastplats eller städning
  pågår» tar två rader; rutan centrerades då mot hela den 50 px höga raden och tappade
  vänsterkolumnens rytm. Den ligger nu mot första raden, på exakt samma pixel som i enradiga
  rader. Reglaget är undantaget och sitter kvar mitt i sin rad – det är en kontroll, inte en
  färgruta.

Provat i fem städer × två lägen × fyra fordon, med rutan **uppfälld**: en enda textkolumn,
två textstorlekar, två radhöjder, och färgrutan på samma höjd i varje rad. Inga konsolfel.
Radbrytningen i den röda Nu-raden är kvar med flit – den är rutans mest informationstäta
rad, och att korta den hade kostat antingen ett skäl eller läsbar text.

## v1.41.2 – 2026-09-20
**Cykelvalet följer inte längre med till en stad som saknar cykelplatser.**

Fordonsvalet sparas globalt, inte per stad, och det är rätt – byter man stad kör man oftast
samma fordon. Men cykelläget målar **medvetet inga gator**; det visar bara nålar. Den som
valde cykel i Stockholm och bytte till Karlstad möttes därför av en alldeles tom karta utan
att ha gjort något. Uppmätt 2026-09-20: **0 cykelplatser av 381 sträckor i Karlstad och 0 av
2 272 i Uppsala**.

- **Bara cykel faller tillbaka**, till bil. MC och rörelsehindrad har inte problemet – de
  målar gatorna precis som bil-läget och svarar fortfarande på «får jag stå här», bara utan
  egna nålar.
- **Valet raderas inte.** Fallbacken sparas inte, så cykeln är tillbaka så fort man är i en
  stad som har platserna. Ett stadsbyte ska inte kasta bort det man valt.
- **Väljer man cykel aktivt ändå** säger lägestexten varför kartan är tom: «Karlstad
  publicerar inga dedikerade cykel- eller mopedplatser». Tidigare lovade den «visar
  dedikerade cykel- och mopedplatser i närheten» i en stad som inte har några.

Fordonsfakta per stad bor nu på **ett** ställe (`stadHarFordon` + `HAR_MC_PLATSER` /
`HAR_RH_PLATSER` / `HAR_CYKELPLATSER`) i stället för att räknas om inne i `updateLegend` –
förklaringsrutan, fordonsväljaren och lägesintrot måste svara likadant.

Provat: cykel valt i Stockholm → Karlstad startar som bil med valet kvar i lagringen →
tillbaka i Stockholm är cykeln vald igen · startläget kontrollerat i alla sex städer
(behålls i Stockholm/Göteborg/Sundbyberg/Malmö, faller i Uppsala/Karlstad) · Stockholms
förklaringsruta oförändrad i alla åtta kombinationer · inga konsolfel.

## v1.41.1 – 2026-09-20
**Förklaringsrutan ligger still när man byter läge.**

Raderna låg i olika ordning i Nu och Natt: fordonsblocket (MC-ruta / reserverad plats)
näst **sist** i Nu men näst **först** i Natt, och orange före blått i Nu men efter gågatan
i Natt. Rutan hoppade alltså när man bytte läge, trots att innehållet till stor del var
detsamma – och lägena är tänkta som linser på samma karta, inte som två olika vyer.

Ordningen är inte omskriven två gånger utan **byggd av samma funktion i båda lägena**
(`legendOrdning`), så de inte kan glida isär igen. En kommentar som lovar «samma ordning»
hade kunnat bli osann vid nästa ändring; det här kan inte det. Bäst utfall först, värst
sist: grönt → orange → blått → fordonets egna platser → gågata/uteservering → lila → rött.
Nu-läget behåller sin ordning; det är Natt som rättas in i ledet.

Städat: `dimVilka` i `updateLegend` räknades ut vid varje omritning men skrevs aldrig ut.
Två av dess tre grenar gav dessutom samma sträng. Borttagen.

Provat: sekvensen utläst ur den renderade rutan i fem städer × två lägen × fyra fordon –
**identisk radordning i Nu och Natt i alla fyrtio fallen** · inga konsolfel.

## v1.41.0 – 2026-09-20
**Förklaringsrutan beskriver bara färger staden faktiskt kan rita.**

Regeln infördes 2026-09-19 för gågata och uteservering, men gällde bara de två raderna.
Fordonsraderna fortsatte lova platser som inte finns. En census över **hela kommunen** i
fyra städer visar hur illa det var i Karlstad: alla **381 sträckor** har ett enda
fordonsvärde («fordon») och en enda platstyp («P Avgift»). Noll MC-rutor, noll platser för
rörelsehindrade, noll cykelplatser, noll lastplatser – och rutan visade ändå varenda en av
de raderna. Cykelläget lovade nålar på en karta som är helt tom.

**Tre saker rättade:**
- **Rader som inte kan ritas tas bort.** Nya, uppmätta fält per stad (`fordonIData`,
  `andamalIData`) styr vilka rader som visas. Där ett helt fordonsläge saknar platser står
  i stället varför: «Karlstad publicerar inga MC-platser som egna sträckor». Röda radens
  orsaker räknas upp efter vad staden har – Karlstad säger nu bara «städning pågår», och
  Göteborgs Natt-läge «Lastplats – parkera ej» i stället för «Förbud», eftersom staden
  inte publicerar några förbud. Uppsala tappar «Gott om tid» (kräver städdata staden
  saknar) och får «Lastplats eller liknande» där det stod «Servas», i en stad utan städning.
- **Sundbyberg slutar säga emot sig själv.** I Natt-läget med MC eller rörelsehindrad stod
  «publicerar ingen maxtid – appen kan inte säga hur länge» med «Trygg över natten» tio
  pixlar under. Raden är borta. Samma spärr lades i `nyssSnartRing` så att nålen följer
  gatans regel – se not om att den grenen ännu inte nås av någon stads data.
- **Karlstads prisstege begravde färgnyckeln.** Fyra prisrader plus en fotnot på tre låg
  överst; uppmätt på 375×812 syntes **inte en enda färg** innan lådan tog vid. Stegen
  flyttad under färgnyckeln – priset är det mindre viktiga av de två.

Provat: Stockholms ruta **byte-identisk i alla åtta kombinationer** av läge och fordon
före/efter · censusen körd över hela kommunrutan i Göteborg (6 428), Uppsala (2 272),
Sundbyberg (1 109) och Karlstad (381) · Natt-flödet kört mot riktig data i Karlstad
(60 sträckor: bara grönt och blått, ingen röd – raden som togs bort) och Göteborg
(6 röda, alla «Lastplats · gäller dygnet runt» – ordet som byttes) · inga konsolfel.
Malmö lämnas orörd: stadens tjänst svarade HTTP 500 hela dagen, så censusen gick inte att
köra, och utan fälten beter sig appen exakt som förut.

## v1.40.0 – 2026-09-20
**Göteborg får sin prissida – och taxenumret som lurar reds ut.**

«Vad kostar parkering i X» är den mest sökta frågan om en stads parkering (Stockholms
taxesida ensam: 43 492 exponeringar på tre månader). Göteborg saknade en sådan sida.

Ny sida **/parkeringsavgifter-goteborg** med hela pristrappan, mätt ur Trafikkontorets WFS:
**8 priser från 46 till 6 kr/tim**, fördelade på 1 426 gatusträckor och ~35 700 platser.
Dyrast tas ut per påbörjad halvtimme (23 kr), billigast är 6 kr/tim med tak på 30 kr/dag.
Mellan 22 och 8 kostar det 2 kr/tim på i stort sett varje gata.

**Två saker sidan reder ut, som är lätta att gå fel på:**
- **Avgift även söndag.** Göteborgs avgiftstid är 8–22 *alla dagar*, till skillnad från
  Stockholm där söndagen ofta är fri.
- **Taxenumret är ett id, inte en rangordning.** Göteborgs taxa 1 kostar 34 kr/tim och
  taxa 7 kostar 7 kr/tim – tvärtemot Stockholm. Därför visar appen kommunens pristext.

- `verktyg/bygg-gbg-taxa.js`: nytt skript som läser de 14 taxelagren (skiftläget varierar:
  `taxa_1` men `Taxa_9` – bara gemener tappar 77 sträckor tyst), räknar om halvtimmespriset
  till kr/tim så att stadens dyraste nivå inte hamnar näst sist, och slår ihop nivåer med
  identiskt pris. Resultatet i `seo/goteborg-taxa.json`. Inga handskrivna tal i generatorn.

Provat: 261 av 261 sidor svarar 200 lokalt · sidan ligger i sitemap och länkas från alla
Göteborgssidor · 0 titlar över 60 tecken · texten säger samma antal priser som tabellen.

## v1.39.1 – 2026-09-20
**Andra omgången: resterande 164 för långa titlar, inklusive de 109 gatusidorna.**

v1.39.0 tog de mest exponerade sidorna. Kvar låg 164 titlar över 60 tecken – gatusidorna,
de engelska «parking near»-sidorna, Uppsalas stadsdelar, Göteborgs områden och
över natten-mallen. Nu är **0 av 260 titlar över 60 tecken** (median 52, längst 60).

- Varumärket ur titeln även här. Kvar har det 15 korta sidor där det ryms.
- Ny hjälpfunktion `kortTitel(lång, kort)` i generatorn: den fylliga titeln används när
  den ryms, annars den korta. Gatusidorna behåller alltså stadsdelen – «Parkering på
  Narvavägen, Östermalm» – medan «Hammarby Fabriksväg» tappar den i titeln men har kvar
  den i rubriken och beskrivningen. Tidigare fick alla sidor betala för de längsta namnen.
- «Parkering över natten i X – tryggt & lagligt» → «Parkera över natten i X – vad som
  gäller». «Tryggt och lagligt» var ett löfte vi inte kan hålla i städer utan förbudsdata.
- Billigare-sidornas beskrivning kortades från 165 till under 160 tecken.

Provat: 260 av 260 svarar 200 lokalt · 0 titlar över 60 tecken · 0 identiska titlar ·
0 beskrivningar över 160 · H1 orörda · stadsdelen kvar i beskrivningen där titeln tappat den.

## v1.39.0 – 2026-09-20
**Omskrivna titlar och beskrivningar på de mest exponerade sidorna.**

Search Console 19 juni–18 sep: **177 000 exponeringar, 2 430 klick, 1,4 % CTR, position 8,7.**
Synligheten finns alltså redan – klicken saknas. Värst var taxesidan: **43 492 exponeringar
och 0,4 % CTR**. 82 % av klicken är mobila, där Google kapar titeln vid ~55–60 tecken, och
våra titlar låg på 59–83. Slutet – inklusive `| ParkSpot` – syntes aldrig.

- **Varumärket bort ur titeln** på de omskrivna sidorna. Varumärkessökningar var 158 av
  177 000 exponeringar; platsen gör mer nytta åt löftet. Taxa 1–5 är korta nog att behålla det.
- **Frågan först, inte kategorin.** «Parkeringstaxor Stockholm – Taxa 1–5 …» →
  «Vad kostar parkering i Stockholm? 5–55 kr/tim per zon». Samma grepp på p-hus, städgator
  och den engelska pelarsidan (som är sajtens största klickkälla, 271 klick).
- **Svaret först i beskrivningen.** Frågan står redan i titeln; beskrivningen ger priset.
- **Två sidor som konkurrerade om samma ord delades:** `/stadgator` är kartan över i morgon,
  `/stadgator-stockholm` förklarar hur städdagarna fungerar.
- Mallarna ändrades, så syskonsidorna följer med: 17 stadsdelar, 17 billigare-sidor,
  17 städgatusidor och 11 «nära»-sidor. 74 filer, inga nya sidor.

Provat: 260 av 260 sidor svarar 200 lokalt · 0 tomma titlar · 0 identiska titlar ·
H1, kanonisk tagg och og-taggar orörda.

**Känt kvar:** 164 titlar är fortfarande över 60 tecken – främst de 109 gatusidorna och de
engelska «parking near»-sidorna. Samma fel, ej åtgärdat i denna omgång.

## v1.38.0 – 2026-09-20
**Göteborg får sin sida om att parkera över natten – den mest sökta frågan saknades.**

Stockholm, Uppsala och Karlstad hade sedan tidigare varsin «över natten»-sida. Göteborg,
vår näst största stad, hade ingen alls.

Sidan svarar på det som faktiskt avgör om bilen kan stå kvar, och siffrorna är mätta,
inte ungefärliga:
- **Städningen.** 1 170 av 2 002 sträckor städas 09–12, men **514 börjar före klockan 8**
  och vanligaste nattiden är **02–07 (512 sträckor)**. 1 597 sträckor (80 %) städas bara
  jämna eller bara udda veckor; vanligaste dagen är tisdag.
- **Tidsgränsen.** Av 2 335 tidsbegränsade sträckor har 1 236 bara 30 minuter och **bara
  171 tillåter ett helt dygn**. På **388 sträckor gäller gränsen bara vardagar** – då är
  natten och helgen fria trots siffran på skylten.
- **Boendeparkering** som undantag, inte förbud, med n-zonernas 18–09.

- `verktyg/bygg-gbg-natt.js`: nytt skript som räknar fram siffrorna ur Trafikkontorets
  WFS till `seo/goteborg-natt.json`. Inga handskrivna tal i generatorn – kör om skriptet
  när kommunen ändrar. Skriptet räknar bara poster med veckodag 1–5, så sidan säger
  samma 2 002 som resten av sajten.
- Sidan länkas från alla Göteborgssidor och står i `llms.txt`.

## v1.37.1 – 2026-09-20
**Återställning: v1.37.0 hade en TOM package.json och slog ut servern.**

Versionshöjningen skrevs med ett anrop som öppnade `package.json` för skrivning innan
filen lästes. Innehållet nollställdes tyst och följde med i pushen. Railway byggde då
inte längre en Node-tjänst: förstasidan svarade 200 medan `/version` och **alla 259
SEO-sidor svarade 404** i drygt tjugo minuter. Filen är återställd från taggen v1.36.0.
Efter återställningen: 259 av 259 sidor svarar 200 live.

**Lärdom:** skriv aldrig en fil med ett uttryck som öppnar för skrivning och läser samma
fil. Versionsbump görs med Edit-verktyget, och filen läses tillbaka med `node -e require`
innan commit.

Samtidigt, ur genomgången av Search Console: **robots.txt stänger appens data-adresser**
(`/schedule`, `/servicedagar-bbox`, `/gbg/`, `/sbg/`, `/malmo/`, `/uppsala/`, `/karlstad/`,
`/proxy/`, `/wfs/`, `/phus`, `/r`, `/statistik`). Google rapporterade åtta av dem som
«blockerad av 4xx-problem» – de är inga sidor. Kontrollprov: ingen av de 259 SEO-adresserna
och inget under `/vendor/` träffas av reglerna.

## v1.37.0 – 2026-09-20
**Prissidor för Karlstad och Uppsala – och en 404 som dölde sig i sitemap.**

«Vad kostar parkering i X» är den mest sökta frågan om en stads parkering, och varken
Karlstads eller Uppsalas priser fanns beskrivna som egen sida.

- Ny sida **/parkeringsavgifter-karlstad**: de fyra gatuzonerna i prisordning (Röd 18 ·
  Gul 16 · Grön 8 · Blå 4 kr/tim), de 26 namngivna parkeringarna med egen taxa, vad
  parentesen på skylten betyder och när det är gratis.
- **/parkeringsavgifter-uppsala** fick områdena **A–E** som egen prisstege med kvällstaxan
  och de avgiftsfria söndagarna, plus varningen att enskilda parkeringar inne i områdena
  har egen taxa (Stadshusgatan 36 kr/tim). Siffrorna kommer ur samma data som appen.
- `llms.txt`: priserna per zon i båda städerna, för svarsmotorer som citerar utan besök.

**Servern släppte bara ut sidor som stod i en handskriven lista.** Den nya Karlstad-sidan
hamnade därför i sitemap men svarade **404** – vi hade skickat Google en adress som inte
fanns. Vitlistan läses nu ur `seo/pages.json`, alltså exakt de sidor generatorn skapat.
Provat: alla 259 sidor i sitemap svarar 200, okänd adress och katalogtrick ger fortsatt 404.

## v1.36.0 – 2026-09-20
**Karlstads prisstege i förklaringen: Röd 18 · Gul 16 · Grön 8 · Blå 4 kr/tim.**

Karlstad får ingen zonkarta, och det är ett medvetet nej. Stadens «zoner»
(`vy_parkab_appzoner`) ÄR parkeringsplatserna: 129 ytor, median 937 m², tillsammans
0,18 km² – och 355 av 381 avgiftssträckor ligger inne i en yta. Att rita dem hade bara
gett en tjockare kopia av linjerna appen redan ritar, inte en översikt. Någon
kommuntäckande zonkarta finns inte (623 lager i geoservern genomsökta).

Prisstegen finns däremot, och den visas som TEXT i förklaringen. Färgrutor hade lovat
att kartan färgas så, och grönt och blått betyder redan «får stå nu» och «kontrollera
tiden». Kommunens egna zonnamn är färger och ligger i appens prisordning – men på
kartan fortsätter färgen betyda laglighet, aldrig pris.

- `cities/karlstad.js`: ny väg `/karlstad/zontaxor` som HÄRLEDER stegen ur samma fält
  som platskortet läser. Priserna står aldrig i koden, så en taxehöjning slår igenom
  av sig själv. Cache 6 h. Saknas någon av de fyra zonerna visas ingen stege alls.
- `index.html`: ny stadsruta `prisStege` (stad utan zonkarta). Hämtas en gång per
  sidladdning och ritar om förklaringen när svaret kommer. Faller hämtningen säger
  konsolen varför, i stället för att stegen tyst uteblir.
- De ~27 namngivna parkeringarna (Sundstabadet, Karolinen …) hör inte till stegen:
  de har egna priser, som redan står på platskortet. Fotnoten säger det.

## v1.35.0 – 2026-09-20
**Uppsalas avgiftsområden A–E ritas som färglagda zoner, som Stockholms taxezoner.**

Uppsala publicerar fem stadstäckande områden (A dyrast till E billigast) i samma lager
som appen redan läser. De ritas nu med appens egen prisskala: rött dyrast, blått billigast.
Uppsalas EGEN karttjänst färglägger tvärtom (grönt = billigast) – den följs inte, eftersom
grönt betyder «får stå nu» i appen och E täcker hela staden. Kommunen använder heller inga
färgnamn mot invånarna («Avgiftsområde A – kod 18100»), så inget inarbetat språk bryts.

Priset på kortet ändras inte: utanför Stockholm kommer det fortfarande från gatan själv.
Det är viktigt, för 79 av 470 avgiftssträckor i centrum ligger i ett HÅL i zonerna – egna
p-områden med annat pris, t.ex. Stadshusgatan 36 kr/tim mitt i A–B. Där zonen gäller stämde
den med gatans pris på 380 av 382 sträckor (de två avvikande ligger vid en zongräns).

- `cities/uppsala.js`: ny väg `/uppsala/zoner` (kartportalen skickar ingen CORS-header, så
  klienten kan inte hämta själv). Cache 6 h. Får vi färre än fem zoner ritas inga alls –
  en stad där B saknas ser ut som att B är gratis.
- `index.html`: ny stadsruta `zonLager` (bara ritning) vid sidan av Stockholms `taxaZon`
  (som också sätter priset). Förklaringen visar stadens egna beteckningar: 1–5 i Stockholm,
  A–E i Uppsala.
- Zonerna ritas nu som fyllning UTAN kant plus kant på bara yttre ringen. Hål är enskilda
  p-områden med eget pris; med kant blev Uppsalas E-zon full av mörka fläckar (112 hål).
  Stockholm har 22 hål och ser i praktiken oförändrat ut – kontrollerat i bild, samma vy.

## v1.34.9 – 2026-09-19
**Vid gathörn avgör mitten av sträckan vilken sida den hör till, inte första punkten.**

Städmatchningen mätte från sträckans första punkt. Vid ett gathörn kan den ligga nära
båda sidornas städlinjer, och då fick sträckan även andra sidans städdag. Nu avgör
mitten av sträckan när den ligger nära en linje. Annars avgör den ände som ligger
närmast en linje, och ligger ingen punkt nära någon linje väljer appen det strängaste.
«Nyss städad»-glöden och «avslutad»-texten utgår alltid från mitten.

Provet mot live (hela kartan, sju scenarier i tre städer) gav två ändringar, båda
falska röda som försvinner: Dannemoragatans tisdagssida på onsdagen, och
Herrgårdsgatans onsdagssida i Karlstad på torsdagen. Tre tidigare varianter av regeln
föll i provet, varav en hade gjort en sträcka grön där live visar rött.

## v1.34.8 – 2026-09-19
**Priset syns på kortet i Göteborg, Uppsala och Karlstad, och inte längre där man inte får stå.**

- **Pris utanför Stockholm.** Kortet hämtade priset bara ur Stockholms taxezoner, så i
  övriga städer syntes inget pris. Varje sträcka hade ändå sitt eget pris i datan:
  Göteborg 90 %, Uppsala 94 % och Karlstad 98 %. Nu visas det, till exempel «Röd zon ·
  18 kr/tim 09–18 (09–15) · fritt övrig tid» och «Avgiftsfri». Texten städas, med
  tankstreck, «kr/tim», mellanslag och «·» mellan delarna, men tolkas inte om. Alla
  belopp och klockslag står kvar som kommunen skrev dem. Tider inom parentes förklaras
  med en rad: «gäller lör/helgafton», som på skyltarna. Göteborgs boendesträckor säger
  rakt ut att besökspriset inte finns i stadens data.
- **Inget pris på lila kort.** Reserverade platser och platser för andra fordon visade
  taxan, även i Stockholm. Där får du inte stå, så nu visas inget pris, på samma sätt
  som på förbudskortet.

## v1.34.7 – 2026-09-19
**Förklaringen öppnas av sig själv bara första gången.**

Förut fälldes färgförklaringen ut vid varje besök och skymde kartan i åtta sekunder. På
mobil täckte den tillsammans med introtexten ungefär 80 % av kartan. Nu visas den
automatiskt bara vid första besöket, och fälls ihop efter åtta sekunder som förut.
Därefter startar den ihopfälld, och man öppnar den med «Förklaring» när man behöver den.
Gäller alla städer.

Webbläsaren kommer ihåg att förklaringen har visats (`parkspot_forklaring_sedd`). Går
det inte att spara, till exempel i privat läge, räknas varje besök som det första:
hellre en förklaring för mycket än en ny användare som aldrig ser den.

Byggd 2026-09-18 som v1.34.1 men aldrig släppt. Testrundan kom emellan, och numret
gick till andra rättningar.

## v1.34.6 – 2026-09-19
**Småfel från testrundan: förklaringen följer staden, sökförslagen syns, och kort utan gata påstår inget om städning.**

- **Förklaringen per stad.** Gågata och Uteservering visades i förklaringen i alla
  städer, men ritas bara i Stockholm. Appen frågade dessutom Stockholms
  uteserveringslager om rutor i Göteborg, Uppsala och Karlstad. Båda är nu bara i
  Stockholm.
- **Sökförslagen överst.** På mobil låg kartans zoomknappar och Förklaring-knappen
  ovanpå förslagslistan och dolde texten.
- **Förbudskortet utan pris.** Ett kort för en sträcka där man inte får parkera visade
  taxan, vilket kunde läsas som att man kan betala sig till en plats. Det och kortet för
  SL-hållplatser slog också upp städschemat med sin rubrik som gatunamn och sa «Ingen
  registrerad servicedag» om en gata som inte finns. Raden döljs nu.

## v1.34.5 – 2026-09-19
**Platskortet säger inte längre emot sig självt i Karlstad och Göteborg, förklarar röda dagar och är ärligt om sträckor utan gatunamn.**

- **Ingen motsägelse under städning.** Kortet kunde säga «Städas nu» och «Ingen städning
  de närmaste 8 dygnen» samtidigt. Sökningen efter nästa städning gick bara 7 dygn
  framåt, och i städer som städar varannan vecka hittade den därför ofta ingenting. Nu
  söker Karlstad och Göteborg 42 dygn framåt och visar datumet («Nästa städning den 28
  sep 05:00»). Så långt behövs: vecka 53 gör både v53 och v1 udda, och en röd dag kan
  hoppa över ytterligare ett tillfälle. Värsta fallet är 35 dygn. Pågår städningen står
  det «Nästa gång» i stället för «Nästa städning».
- **Röda dagar förklaras (Karlstad).** När gatans ordinarie städdag infaller på en röd
  dag säger kortet «Ingen städning i dag – juldagen är röd dag». I natt-läget står det
  «i morgon».
- **Sträckor utan gatunamn** (77 av 381 i Karlstad) heter nu «Parkering utan gatunamn».
  Kortet påstår inte längre att det inte städas där, eftersom uppslaget bygger på
  gatunamnet och inte kan veta det. Ingen av sträckorna ligger nära en städlinje.

## v1.34.4 – 2026-09-19
**Sajten lämnar bara ut de filer sidorna behöver, och appen startar även när webbläsaren blockerar lagring.**

- **Vitlista för filer.** Servern lämnade ut varje fil i projektmappen: kommunbreven,
  interna dokument, serverkoden, verktygen och ett svar från Malmö med en namngiven
  tjänstepersons e-postadress. Nu lämnas bara appen, kartbiblioteken, delningsbilderna,
  `llms.txt` och arkitektursidan ut. Listan bygger på vad sidorna faktiskt hänvisar
  till. Allt annat svarar som en fil som inte finns. SEO-sidorna och datatjänsterna
  påverkas inte.
- **Ingen vit sida när lagring är blockerad.** Blockerar webbläsaren lagring (t.ex.
  Safari med «Blockera alla kakor») stannade hela appen redan vid start, eftersom sju
  ställen läste lagringen utan skydd. Nu går allt via en säker funktion. Appen fungerar
  som vid ett första besök och minns valen så länge sidan är öppen.

## v1.34.3 – 2026-09-19
**Servern skickar bara vidare appens egna frågor till Stockholm, och Stockholms API-nyckel kan inte längre läsas ut.**

Servern lägger på Stockholms API-nyckel när den skickar vidare frågor till stadens
tjänster. Sedan juni skickade den vidare vilka frågor som helst. En fråga om vilka
tjänster som finns fick Stockholms server att svara med sina egna adresser, och där
stod nyckeln i klartext. Appens egna frågor läckte aldrig nyckeln, men den gick att
få ut för den som frågade medvetet. Felet hittades i testrundan samma dag.

- **Vitlista.** Bara de två sorters frågor som appen och SEO-sidorna faktiskt ställer
  släpps igenom: kartdata (`GetFeature`) och städdagar per veckodag. Allt annat nekas
  med 403, även försök att smyga in en annan fråga som en dubbel parameter.
- **Tvätt.** Skulle nyckeln ändå finnas i ett svar byts den ut innan svaret skickas
  eller sparas i cachen.
- Nyckeln byts dessutom ut mot en ny, eftersom den gamla har varit läsbar sedan juni.

## v1.34.2 – 2026-09-19
**Natt-läget varnar för städning i Göteborg och Karlstad, och en gatusida färgas inte längre av den andra sidans städdag.**

Båda felen hittades i en testrunda mot parkspot.se samma dag.

- **Natt-läget i Göteborg och Karlstad visade «Trygg över natten» på gator som städas
  samma natt.** Morgondagens städning hämtades vid appstart från en källa som bara finns
  i Stockholm, och i andra städer blev listan tom. Karlstad söndag 22:00: Trädgårdsgatan
  grön, städas måndag 05–07. Göteborg tisdag 22:00: Linnégatan grön, städas onsdag 02–07.
  Nu-läget varnade samtidigt för samma gator. Felet fanns sedan v1.25.0. Nu hämtas
  städningen för sökområdet, och misslyckas det visas ett fel i stället för en grön
  karta. Stockholm hämtar som förut.
- **Sidolåset gäller nu även gatans färg, inte bara texten.** Städlinjer matchas på
  gatunamn och 25 m, vilket räcker över de flesta gator. Texten «Nästa städning» fick
  ett sidolås i augusti, men färgen fick det inte. Därför kunde kortet säga «Städas nu»
  och «Nästa städning i morgon» om samma sträcka (Linnégatans torsdagssida röd på
  onsdagen, Dannemoragatans onsdagssida röd på tisdagen). Färg och text delar nu en
  funktion, med marginalen 6 m (var 3). Mätningen i 19 områden visar att andra sidan
  normalt ligger 6,6–25 m bort. De få fall under 6 m där datan inte kan avgöra sida
  räknas som egen sida, så ändringen gör appen försiktigare, aldrig generösare.

## v1.34.0 – 2026-09-18
**Karlstad, stad sex: servicedagar varannan vecka, och ett undantag på röda dagar som ingen annan stad har.**

Karlstad har riktiga städgator. Kommunen kallar dem **servicedagar**, och de är ett
skyltat parkeringsförbud några timmar varannan vecka, året runt, i centrala Karlstad.
Det gör staden till en fullvärdig ParkSpot-stad: städvarning, «trygg över natten» och
glöd när städningen slutat. Allt är samlat i `KARLSTAD.md`.

- **Ny adapter `cities/karlstad.js`**, som läser kommunens GeoServer utan nyckel.
  Avgiftssträckorna, servicedagarna och 37 parkeringsanläggningar följer samma kontrakt
  som övriga städer.
- **Röda dagar, en stadsflagga (`stadUndantagRodaDagar`).** Karlstads förbud gäller inte
  på helgdagar, men Stockholms gör det. Därför är undantaget en flagga i
  `STADER_CFG` och ingen generell regel. Helgdagarna räknas enligt lag (påsken med
  Gauss formel), med en enda grind i `cleaningActiveOn`. Bevisat i appens ritkod:
  Kristi himmelsfärd 2027 (torsdag i jämn vecka) ger 0 röda sträckor i Karlstad, och en
  vanlig torsdag två veckor senare ger 21. Stockholm ritar städningen röd samma
  helgdag, eftersom flaggan är av där.
- **Koordinaterna räknas själva.** Karlstads server avrundar grader till två decimaler,
  ungefär 1 km. Allt hämtas därför i meter, och Gauss–Krüger ligger i adaptern. Mot
  proj4 är avvikelsen under 1 mm. Projektet har fortfarande noll beroenden.
- **Gatunamn härleds, eftersom kommunen inte publicerar dem.** Namnen tas ur kommunens
  adresslager (`verktyg/bygg-karlstad-gatunamn.js`). Kommunens egen lista över
  servicedagar är facit och filter: 77 av 79 gator stämmer. En parkeringssträcka som
  ligger på sin städlinje får städlinjens namn, så att städvarningen inte tappas. Före
  den regeln tappade sträckor på Hagagatan och Sandbäcksgatan sin varning.
- **Konfliktregeln.** På Vikengatan och Drottninggatan säger kommunens två källor olika
  saker. Appen väljer inte mellan dem, utan båda fönstren visas.
- **Tre SEO-sidor:** `/parkering-karlstad`, `/servicedagar-karlstad` (varje gata, dag
  för dag, ordagrant ur kommunens lista) och `/parkering-over-natten-karlstad`.
  Underlaget kommer ur `verktyg/bygg-karlstad-seo.js` och går genom adaptern. Om-sidan,
  sidfoten, `llms.txt` och arkitektursidan är uppdaterade.
- **Ärligt om luckorna:** 178 av 381 sträckor saknar tidsgräns i datan (nästan bara gatuzonerna). De behandlas som i Stockholm: ingen skyltad gräns, grönt möjligt. Två skyltar bekräftar att det inte står någon gräns.
  Kommunen publicerar inga andra parkeringsförbud, och inga RH- eller MC-platser som
  sträckor. Lagren ligger i kommunens `webbkartan`, inte i `oppnadata`, så appen skriver
  «webbkarta», aldrig «öppna data». Frågorna står i `KARLSTAD_BREV.md` (ej skickat).
- **Prov:** `node test/karlstad-prov.js`, 33 prov mot riktig data, bland annat en
  kontroll att alla 21 grupperna i kommunens lista finns i datan.

## v1.33.0 – 2026-09-17
**SEO för Uppsala: 29 nya sidor, alla byggda på mätt data.**

Uppsala hade en enda sida medan Göteborg har fjorton. Nu finns fyra guider och en sida per
stadsdel – 255 sidor totalt (från 226).

**Underlaget räknas av ett eget verktyg** (`verktyg/bygg-uppsala-seo.js` → `seo/uppsala.json`),
samma mönster som Göteborgs: sidorna räknar aldrig själva vid byggtid, för ett nätfel skulle
då bli en sida med nollor i drift. Uppmätt 2026-09-17: **1 888 parkeringssträckor**,
**15 328 platser**, 95 avgiftsområden med prislista, 4 garage, 55 stadsdelar (26 stora nog
för egen sida).

- **`/parkeringsavgifter-uppsala`** – att priset hänger på områdeskoden och inte på gatan,
  zonerna (A–K) och de 33 besöksparkeringarna med egen taxa, med kommunens avgiftstexter
  ordagrant. Att skriva om «20kr/tim i 2 timmar därefter 35kr/tim» till egna ord vore att tolka.
- **`/parkering-over-natten-uppsala`** – de tre sakerna som avgör om bilen kan stå kvar:
  gränsens längd, gränsens klockslag (den som vaknar 07) och avgiften. 139 sträckor har en
  gräns på ett dygn eller mer, 215 har några timmar eller mindre.
- **`/parkeringshus-uppsala`** – de fyra garagen med platser, laddplatser, takhöjd, maxtid
  och pris ur områdestexterna.
- **26 stadsdelssidor** (`/parkering-uppsala/luthagen` m.fl.) med sträckor, platser, avgift
  mot avgiftsfritt och vilka tidsgränser som förekommer. Luthagen är störst: 210 sträckor,
  1 586 platser.
- Uppsalas sidfot länkar nu stadsdelarna och de fyra guiderna; `llms.txt` uppdaterad.

**Två fel fångade under bygget:**
- **Verktyget tappade en tredjedel av datan i tysthet.** ArcGIS svarar HTTP 200 *med* ett
  felobjekt när ett fältnamn inte finns, så avgiftsfri-lagret gav noll poster och skriptet
  rapporterade 1 563 av 1 888 sträckor som om allt gått bra. Nu kastar hämtningen på
  felobjektet **och** jämför antalet mot lagrets eget `returnCountOnly` – ett underlag som
  tappar poster ska inte kunna se lyckat ut.
- **Garagepriserna var avrundade till «från 15 till 36 kr».** Nu står de per garage, och det
  fjärde garaget – som saknar områdespost och därmed prisuppgift – får ingen prissiffra alls.
  Dess namn (Brandmästaren) kommer ur kommunens webbadress, och sidan säger det rakt ut.

Stockholms och Göteborgs sidor är oförändrade: 254 av 255 sidor behöll sitt `lastmod`.

## v1.32.2 – 2026-09-17
**Nedräkningen flimrade på hel timme. Nu räknar gränsen och texten samma tal.**

Gränsen för att skriva minuter i stället för klockslag räknades i bråkdelar av en timme
(`h < 1`) medan texten rundade minuterna. Vid exakt en timme kvar kunde två renderingar i
**samma sekund** därför ge olika svar – «Lastplats om 60 min» respektive «Får stå tills 07»
– beroende på hur många millisekunder som gått. Uppmätt när Uppsala-svepet kördes fyra
gånger på klockslaget 06:00: 6, 0, 6, 0 nedräkningar. Felet fanns i alla versioner sedan
v1.22.0 och satt i ord, aldrig i färg.

Nu avgörs både gränsen och texten av **samma heltal**, räknat uppåt: hela intervallet «mer
än 59 men högst 60 minuter kvar» blir 60, och 60 hör till klockslags-grenen. «om 60 min»
kan alltså inte längre skrivas – det var också en dubblett av «om 1 tim». Samma räkning i
alla fyra nedräkningarna: lastplats som öppnar, nästa förbud, nästa städning och den nyss
avslutade städningen («Städat klar 1 tim sen» i stället för «60 min sen»).

**Bevis:** sex körningar av samma svep kl 06:00 gav sex identiska resultat (förut 6/0/6/0).
Trappan kontrollerad minut för minut: 06:00 och 06:00:30 «Får stå tills 07», 06:01 «om 59
min», 06:05 «om 55 min», 06:50 «om 10 min», 06:59:30 «om 1 min» – alla stabila vid upprepning.

**Regression mot live:** Stockholm 25 184 ritade sträckor i tre rutor, Göteborg 17 312 i
tre rutor. Identiska utom **4 av 96** svep i vardera stad, alla på klockslaget 06:00 och
alla samma sorts byte: «om 60 min» → «Får stå tills 07». Färgen är oförändrad överallt.

## v1.32.1 – 2026-09-17
**Antal platser även på MC-, RH- och cykelkorten – och rätt böjning.**

De tre specialplatserna har egna anrop till kortet och fick därför ingen platsrad i
v1.32.0. Nu har de den, med **ikonen efter platsens sort** (cykelställ får cykel, inte bil).
Göteborg har uppgiften på 49 av 50 cykelparkeringar och 12 av 12 RH-platser i centrum;
Stockholm har den på ett fåtal RH-platser (Arbetargatan 6 platser). MC-rutor saknar den i
båda städerna, och då visas ingen rad.

**Rättat i samma bunt:** raden skrev «1 platser» på en enstaka plats – 11 av Göteborgs 12
RH-platser i centrum är enstaka, så felet syntes direkt. Böjningen räknas nu ut, och för en
enda plats säger raden «1 plats · om den är ledig vet vi inte».

**Regression:** dygnssvep mot live i Vasastan (ons + lör, var tredje timme, båda lägena):
12 320 ritade sträckor, **byte-identiska**. Ändringen rör bara kortet.

## v1.32.0 – 2026-09-17
**Antal platser på sträckan – och en fråga till Uppsala om ytor.**

Lars frågade om Uppsala publicerar parkering som **ytor** (polygoner) som vi kan rita.
Svaret efter en genomgång av hela kartportalen: **nej.** All bilparkering är linjer längs
gatan. Ytor finns bara för lastplatser (121, som appen gör om till streck), cykelparkering,
boendeområden och de 95 områdeskoderna. Två polygonlager finns i UPAB-tjänsten men går
inte att lita på: «Avstängda parkeringar» har två poster som båda slutade 2024-12-31 och
ändå står som «Pågående: Ja», och «P 5 minuter» är en enda polygon på 2,4 km². Fälten
`PPID`/`PYID` såg ut att peka på en parkeringsyta men `PYID` är unikt per sträcka – radens
eget nummer. Frågan ligger nu i `UPPSALA_BREV.md` (ny fråga 6 och 7).

**Det som däremot fanns: antalet platser.** `VF_PLATSER` är ifyllt på 1 350 av Uppsalas
1 351 avgiftssträckor (10 888 platser totalt), på 884 av 1 075 sträckor i centrala
Göteborg och på 16 av 530 i Vasastan. Adaptrarna skickade redan fältet – klienten läste
det aldrig. Nu står det på kortet: **«26 platser · antalet platser, inte hur många som är
lediga»**. Sista ledet är inte fyllnad: ingen av städerna publicerar beläggning, och utan
det läses talet som ett löfte om ledig plats.

Raden styr ingen färg och inget beslut. Saknas talet visas ingen rad – en gissad siffra
vore värre än tyst.

**Regression:** dygnssvep mot live (ons + lör, var fjärde timme, båda lägena, tre rutor per
stad) – Stockholm 18 888 ritade sträckor och Göteborg 12 984, **byte-identiska**.

## v1.31.1 – 2026-09-17
**Sidfotens länkar följer staden.**

Uppsala-vyn länkade «Parkering i Stockholms områden» till sexton Stockholmsstadsdelar
(Lars såg det). Sidfoten låg hårdkodad i `index.html` och satt kvar i alla städer.
Servern byter nu ut hela footern efter `?stad=`, av samma skäl som titeln byts där:
sökmotorer och AI-läsare läser HTML:en innan någon JavaScript kört.

- **Göteborg:** stadens tio områdessidor + fyra guider.
- **Uppsala:** `/parkering-uppsala` + Om ParkSpot.
- **Malmö och Sundbyberg:** tom sidfot – de har inga egna sidor än. Tomt är sant;
  Stockholms länkar är det inte.
- **Stockholm:** oförändrad (HTML:en är rad för rad identisk mot live, bortsett från
  byggtidsstämpeln).

**Malmö saknades i `SEO_STADER`** och föll därför tillbaka på Stockholms metadata – en
delad `?stad=malmo`-länk förhandsvisades som «ParkSpot Stockholm». Staden har nu egen
titel och beskrivning. Den är fortfarande dold i stadsväljaren.

## v1.31.0 – 2026-09-17
**Tidsgränsen som vilar syns nu – och säger till innan den vaknar.**

Lars stod vid en 30-minutersruta på Studentvägen i Uppsala klockan 19. Kortet sa
«Får stå nu» och ingenting mer. Det var sant – skylten säger «30 min 7-18», och efter
18 gäller ingen gräns – men kortet sa heller ingenting om att gränsen är tillbaka 07:00.

**Varför det aldrig syntes förut:** appens genomgående regel är att kortet visar det som
gäller **just nu**, och en gräns utanför sitt fönster nämndes inte alls. Det höll så länge
Stockholm var enda staden: gränsen finns där på 3,3 % av sträckorna, och i ett svep över
fem innerstadsrutor hade **en enda** sträcka en gräns. Uppsala publicerar sina brett – i
centrala Uppsala 41 sträckor med fönster, 24 av dem högst två timmar.

**Tre tillägg, alla städer:**
- **Fönstret på detaljraden.** Grön ruta med vilande gräns: «Max 30 min vardagar utom dag
  före helgdag 07–18 – fritt just nu».
- **Nedräkning när gränsen är nära.** Inom en timme: «Får stå nu · max 30 min om 10 min».
  Samma mönster som lastplatsen som öppnar (v1.22.0). **Ingen orange:** en tidsgräns
  hindrar dig inte från att parkera, den säger hur länge – till skillnad från ett förbud.
- **Natt-läget** skriver ut fönstret på de gröna som klarar natten, och säger «gäller inte
  i natt» bara när gränsen faktiskt vilar hela natten.

Källorna till ett fönster är tre och landar i samma form: Uppsalas färdiga regler,
Göteborgs villkorsmening ur tabellen, Stockholms klockslagsfält plus `DAY_TYPE`. Saknas
reglerna eller är dagtypen otolkbar blir det ingen text alls – ingen gissning.

**Regressionsbevis (dygnssvep mot orörd master på port 3457, ons + lör, varannan timme,
båda lägena):**
- **Stockholm** 5 rutor: 240 av 240 svep **byte-identiska**, 72 768 ritade sträckor.
- **Göteborg** 5 rutor: 29 088 sträckor, allt **byte-identiskt** när de nya raderna räknas
  bort; 4 774 rader fick den nya texten.
- **Uppsala** 5 rutor: 10 944 sträckor, 239 av 240 identiska. Det avvikande svepet ligger
  exakt på klockslaget 06:00 och **flimrar likadant i master** (6 respektive 0 nedräkningar
  mellan körningar) – en millisekundsgräns i den gamla nedräkningen, inte i det här bygget.

**Fångat i svepet innan det gick ut:** en 24-timmarsgräns som gäller dygnet runt fick först
texten «gäller inte i natt», vilket var rakt av falskt. Natt-raden frågar nu om gränsen
biter i morgon innan den påstår att den vilar.

## v1.30.1 – 2026-09-15
**Uppsala är inte pilot längre – och skillnaden mot Stockholm står rakt ut.**

**Uppsala har inga fasta städdagar.** Städningen som kräver att bilen flyttas är vårens
sandupptagning, som skyltas tillfälligt 24 timmar före (kommunens sidor om gatudrift).
Appen visar inte de skyltarna och säger därför ingenting om städning i Uppsala. Det är en
grundskillnad mot Stockholm, där appen föddes som städgatukarta – och den sades inte
till Lars förrän efter lanseringen. Nu står den i disclaimern, i stadsväljaren («Inga
fasta städdagar och inga förbud i datan»), i `llms.txt` och som eget avsnitt på
`/parkering-uppsala` med två frågor i FAQ.

**Pilotmärkningen borttagen** (Lars beslut): ingen PILOT-banderoll, fliktiteln «ParkSpot
Uppsala – var får du parkera?», Uppsala sorteras bland de fullständiga städerna. Samma
modell som Göteborg: varningen bärs av disclaimern, som alltid syns.

**NY_STAD.md steg 1b – städmodellen först.** Varje ny stad: fasta dagar, veckoparitet,
datum i månaden eller bara tillfälliga skyltar? Utreds ur kommunens gatudriftssidor och
sägs som egen rubrik, aldrig som en parentes.

**Arkitektursidan räknar alla städer** (`verktyg/kodpekare.js`). Adaptrarna läses ur
`STADSNAMN` i server.js i stället för en handskriven lista, så en ny stad kan inte glömmas
i diagrammet. Uppsalas 702 rader saknades i summan; per stad nu 20 % av koden.

## v1.30.0 – 2026-09-15
**Uppsala – stad fem, som pilot i stadsväljaren.**

**Uppsalas parkering på kartan** (`cities/uppsala.js`). Syns i stadsväljaren med
«Pilot – städdagar och förbud finns inte i datan», och nås med `?stad=uppsala`.
Skyltrundan (Lars, Street View) bekräftade tidstolkningen och avgifterna innan valet
tändes. Ny SEO-sida `/parkering-uppsala`, länkad från Om-sidan; Uppsala i entitets-
grafen (appen och Om-sidan) och i `llms.txt`. Stockholms och Göteborgs 224 sidor
oförändrade (lastmod behållen). Brevet om användningen är inte skickat.
Källan är kommunens egen parkeringskarta (`kartportal.uppsala.se`, ingen nyckel). Lagren
är publikt åtkomliga men står inte i kommunens öppna dataportal – därför «parkeringskarta»
i appens texter, och användningsfrågan först i `UPPSALA_BREV.md`. Hela
kommunen: 2 288 poster, varav 2 272 ritas; de 16 som inte ritas har ett loggat skäl
(säsongsregler, laddplatser, platser som inte är för allmänheten). Uppsala pekar ut
hur länge man får stå – på sträckan och i områdets avgiftstext («Max-P 4tim») – så
staden kan visa grönt. Skolområdens «7-16 Tillstånd erfordras» blir röd dagtid och
grön kväll och helg. Lastplatser utan tid i datan (117 av 121) visas röda dygnet runt,
«Lastplats · gäller dygnet runt», i stället för «Får stå nu». Det är läst, inte gissat:
fyra föreskrifter i Transportstyrelsens register (0380 2016-00593 Väktargatan,
0380 2020:224 Skolgatan, 0380 2025:424 och 0380 2025:450 Rosendalsvägen) saknar alla
klockslag, och Lars två skyltfoton från Skolgatan har ingen tid. Känd brist: lagret kallar
alla 121 «Lastplats», även på- och avstigningsplatser – färgen blir rätt, ordet ibland fel.

**Kommunen publicerar inga städdagar.** Appen säger därför ingenting om städning i
Uppsala – inte heller «ingen städning de närmaste 8 dygnen», som vore ett påstående
utan grund.

**Stadsneutralt i klienten:** tidsgränsens och ändamålets fönster kan nu levereras som
färdiga regler (`MAXTID_REGLER`, `ANDAMAL_REGLER`) i samma form som Göteborgs tabeller,
och en adapter kan märka en plats med `KONTROLLERA_SKYLT` när den ser ett villkor den
inte kan läsa. Stockholm, Göteborg och Malmö är bevisat orörda: 36 dygnssvepstillfällen
(Nu och Natt, vardag, lördag, kväll) i åtta områden ritade byte-identiskt mot v1.29.1.

**Rättat på vägen:** när veckans städdata inte gick att hämta kastade ett klick på en
gata fel (`nastaStadUppslag.senaste` saknades). Raden döljs nu i stället.

**Malmö: parkeringen försvann runt lastplatserna** (`68e3566`, egen commit som kan gå
till master för sig). Adaptern levererade grader i stället för meter, och klientens
klippning runt lastplatser räknar i meter – en lastplats i sökrutan tog bort all
parkering runt sig. Kornettsgatan: 85 sträckor i datan, 1 ritad; nu ritas alla 85.
Gatunamn, platstyper, priser och städdata är oförändrade, och fyra Malmöområden utan
lastplats ritar byte-identiskt mot förut. Malmö är fortfarande dold i stadsväljaren.
Kvar i Malmö: stadens fyra lastplatser saknar tider och visas gröna – samma sorts lucka
som Uppsalas, egen fråga.

## v1.29.1 – 2026-09-14
**Snabbare start på mobil, och lådan slutar åka upp när du stängt den.**

**Bibliotek och typsnitt från egen server** (`52ac3a7`). PageSpeed (mobil) mätte 6,8 s
till kartan och 69 poäng. Leaflet, proj4 och typsnittet Inter hämtades från tre olika
externa servrar, och varje ny server kostade en egen uppkoppling innan kartan kunde
ritas (Google uppskattade ~1,8 s). De ligger nu i `vendor/` med versionen i
katalognamnet och cachas ett år. Uppkopplingen mot bakgrundskartans server öppnas
direkt. Google har ingen data från riktiga användare för parkspot.se, så siffrorna
är en simulering. Ritningen verifierad identisk mot live i båda städerna.

**Lådan minns att du minimerat den** (`0fffb02`). Efter sökning eller valt mål åkte
lådan alltid upp, även om man nyss stängt den. Nu åker den upp första gången; har man
minimerat den stannar den nere, också vid nästa besök, tills man själv drar upp den.
Ett tryck på en gata öppnar alltid lådan med kortet.

**Feedbackfrågan täcker inte handtaget** (`bce8a3b`). "Har ParkSpot hjälpt dig?" satt
fast längst ner och låg över handtaget på en minimerad låda. Den står nu ovanför
lådan, följer med när lådan flyttas och göms när lådan är helt öppen.

## v1.29.0 – 2026-09-07
**SEO-sidorna kände inte igen appen längre – och sju anläggningar visades för förare som inte får stå där.**

De 225 genererade sidorna hade ett eget `/garage/i`-filter och en egen ögonblicksbild
av datan från **9 juni**. De sa "Närmaste parkeringshus", listade bara de 50 garagen och
var därför tomma i hela ytterstaden — precis där appen sedan v1.27.0 har flest träffar.

**Logiken kopieras inte, den läses ur appen.** `seo/build.js` plockar ut
`taxaArBesok`, `maxtidUr`, `garageVillkor` och `garageArForBesok` ur `index.html` vid
bygget. En kopia hade glidit isär tyst, och då hade sidan och kartan sagt olika saker om
samma parkering. Saknas funktionerna kraschar bygget med flit i stället för att generera
225 sidor utan villkor.

**Sidorna visar nu typ, platser, villkor och maxtid**, sorterat med samma regel som appen
(under sex platser sjunker sist). Anläggningar bara för rörelsehindrade utelämnas: appen
har ett RH-läge att visa dem i, sidorna har inget.

**Sju anläggningar med 656 platser var inte till för besökare alls.** Det upptäcktes när
"Sveriges Radio Personal" med sina 343 platser hamnade på hubbsidans lista över stadens
största besöksanläggningar. Den har inte en enda besöksrad för bil — alla biltaxor är
Personalparkering. Samma sak för Glasbruket, Bodö, Måsholmen 33, Pilvingen 3 garage och
två husbilscampingar (Kaknästornet, Långholmen).

`AntalBesokPlatser > 0` räcker alltså inte som bevis. Den nya regeln `garageArForBesok`
utesluter en anläggning som HAR taxarader där ingen är en besöksrad för fordonet — men
**tystnad diskvalificerar inte**: 19 anläggningar saknar taxarader helt och behålls, för
vi vet ingenting om dem. Samma skillnad som mellan "ingen maxtid publicerad" och
"maxtid = ingen". Regeln gäller nu både appen och sidorna.

> **Regeln är asymmetrisk, och det är hela poängen.** Ett första försök krävde en besöksrad
> för rätt fordon, och då föll **409 av 453 anläggningar bort i MC-läget** — nio av tio.
> Att en MC-taxa saknas betyder inte att motorcyklar är förbjudna; det slog v1.26.0 redan
> fast när MC-läget fick låna biltaxan märkt "biltaxa". En bil behöver en besöksrad som
> inte är MC-taxa; en MC duger med vilken besöksrad som helst. Fångat i svepet, inte i
> huvudet.

**Ögonblicksbilden är uppdaterad** från juni till idag, efter en jämförelse: två
anläggningar borta, sju tillkomna, ett ändrat timpris. Litet och trovärdigt.

**Hubbsidan heter nu "Parkeringshus och parkeringsytor i Stockholm"** och har fått en
sektion om tidsgränser samt två nya FAQ-frågor. **Adressen är oförändrad** —
`parkeringshus-stockholm` är indexerad sedan juni och ligger i sju interna länkar;
rubriken får bli bredare, adressen får inte byta.

179 av 225 sidor ändrades och fick dagens `lastmod`; 46 var byte-identiska och behöll sitt
datum. Arkitektursidans 22 kodpekare är uppdaterade med `verktyg/kodpekare.js --skriv`.

## v1.28.0 – 2026-09-07
**Villkoren stod i klartext i datan. Appen läste dem aldrig.**

Stockholm Parkering skriver villkor som fri text på varje taxarad. Hela korpusen är
**82 unika texter** på de rader som kan bli ett besökspris – liten nog att läsa i sin
helhet, vilket också var enda sättet: när jag först *sökte* i den hittade min regex
elva träffar och jag rapporterade dem som om de vore hela sanningen. De var en av fem
kategorier.

**Maxtiden visas nu – 32 anläggningar.** "Max p-tid 3 h", "Max 48 timmar", "Max 30 min
parkering". Det är samma uppgift som appens hela grönfärgning vilar på att sakna, och
den låg i en källa vi redan laddar ner. **Två av garagen som redan visades i drift har
en maxtid vi tigit om:** Viking P-Hus 8 timmar, Kolonistugan 24.

> **Fällan i korpusen:** "Max p-tid till 24" och "Parkeringsautomat Max p-tid till
> 24.00" betyder *till klockan 24* – inte 24 timmar. Lästa som varaktighet hade en
> tvåtimmarsgräns blivit ett dygn. Allt med "till" före siffran avvisas, och de två
> texterna citeras i stället ordagrant på kortet. Parsern är körd mot alla 82
> texterna, en i taget, och varje utfall är läst.

**Tre anläggningar föreslås inte längre i bil-, mc- eller cykelläget.** Personnevägen,
Svedjaren 2 och Örbytoppen har bara platser för rörelsehindrade – de dyker upp i
RH-läget i stället. Skillnaden mot gatulagret är avsiktlig: på gatan ritas en RH-ruta
även för bilister, eftersom den som SER rutan slipper ta den av misstag. En rad i en
förslagslista hindrar inget misstag – där är den bara ett dåligt förslag.

**Fyra anläggningar till får en varning, men döljs inte.** Att gömma på en
fritexträff hade låtit min läsning av en mening bestämma över hundratals platser, och
mätningen visar varför det vore fel: **Värtaterminalen** har 58 platser där två rader
säger "Endast för rörelsehindrade" men en tredje är en vanlig tvåtimmarsruta, och
**Valparaiso** har bussparkering på två rader av fyra. Att utesluta dem hade tagit bort
268 platser som allmänheten faktiskt får använda. En etikett sätts därför bara som
"Endast …" när ALLA bilrader bär villkoret; annars står det "Vissa platser har villkor".

**Anläggningens egna ord citeras ordagrant på kortet** – 57 anläggningar. Salkhallen,
som var platsen som startade hela den här utredningen, säger nu själv:
*"Medlemsparkering 3tim 20 kr BA i reception"*. En omskrivning som blir en aning fel
är farligare än ett citat som är en aning kryptiskt, och koden i citatet kan dessutom
vara samma som står på betalautomaten.

**Maxtiden bär indigo, som platsantalet** – den är ett faktum om anläggningen. Gult
(`sl-warn`) är reserverat för det man ska se upp med, och används redan med exakt den
betydelsen i gatulistan ("⚠️ Boende – max 3 tim"). Ingen ny färg infördes.

**Två buggar i mitt eget filter, hittade i test:** en ordgräns efter `kr` träffar mitt inne i "krävs",
eftersom JavaScripts `\w` bara är [A-Za-z0-9_] och åäö därför räknas som ordgräns –
"Tillstånd krävs mellan 07-23" försvann som "prisdetalj". Och en text som bär både
villkor och pris (Salkhallens medlemsrader) föll bort av samma filter.

**Göteborg orört:** stadens rader saknar fritext helt, så villkorsläsningen returnerar
tomt för alla 923 poster. Lista och kort verifierade identiska med före.

Testat mot riktig data: 453 anläggningar lästa utan en enda krasch eller felformad
maxtid; RH-grindningen ger 0 av 3 synliga i bil-, mc- och cykelläget och 3 av 3 i
RH-läget; gatukartan oförändrad (831 ritade linjer, 222 gator på Odengatan).

**Kvar:** SEO-sidorna använder fortfarande sitt eget `/garage/i`-filter och känner
varken till ytparkeringarna eller villkoren.

## v1.27.0 – 2026-09-07
**403 parkeringar med 15 948 platser var gömda bakom ett filter.**

P-huslistan filtrerade Stockholm Parkerings `/phus` med `/garage/i` och visade därför
**50 garage med 7 480 besöksplatser**. I exakt samma svar låg **403 ytparkeringar med
15 948 besöksplatser** – kommunens egna anläggningar, med publicerad taxa.

De var inte dubbletter. **237 av dem har inget garage alls inom en kilometer.**
Garagen är innerstadens svar, ytparkeringarna är ytterstadens, och ytterstaden hade
inget lager över huvud taget.

Så här såg det ut i Farsta centrum före den här versionen:

> *"Inga parkeringshus inom 1 km. Prova en plats mer centralt."*

Nio parkeringar med 781 platser låg inom en kilometer. Den närmaste 53 meter bort.

**Sorteringen fick lagas samtidigt.** Ren avståndssortering gick sönder i samma stund
som ytorna kom in: vid Globen hamnade en parkering med **en enda plats** på andra plats
medan Arenagaraget med 761 knappt kom med i listan. Nu sjunker anläggningar med färre
än sex platser sist.

Valet att **sänka i stället för att sålla bort** är mätt, inte tyckt: topp tolv blir
identisk med båda reglerna, eftersom de små ändå trängs undan där det finns
alternativ. Skillnaden syns på ett enda ställe i staden – **Hjorthagens skola, tre
platser**, är den enda parkeringen inom en kilometer. Sållning ger Hjorthagen
ingenting. Sänkning ger samma rena lista överallt och behåller trean där den är allt
som finns. Gränsen sex är en bedömning: 24 anläggningar har exakt en plats, 71 har
fem eller färre.

**Taket är kvar på tolv rader.** Problemet var aldrig att listan var för kort, utan
att fel tolv stod i den.

**Rubriken använder stadens egna ord:** "Garage och ytparkering nära". Samma princip
som avgjorde Göteborgs etikett i augusti – ordet måste vara sant för staden, och
"parkeringshus" blev osant i samma stund som en asfaltsyta kom in i listan. Varje rad
bär stadens ord för just den anläggningen, "Garage" eller "Yta".

**Tomma listan hade också ordet inbakat.** Att bygga meningen ur stadens rubrik gick
inte – "Ingen parkeringsanläggningar" och "Ingen garage" är inte svenska, och genus
går inte att härleda ur en sträng. Rubriken ritas därför även när listan är tom, och
meningen nöjer sig med rådet.

**"1 platser"** stod aldrig i appen förut, eftersom inget garage har en enda plats.
Tjugofyra ytparkeringar har det.

**Göteborg är orört.** Staden har inget typfält, så den behöll sin rubrik, sin
etikett och sin lista. Sorten skrivs ut i listan bara i städer som HAR mer än en sort
– i Göteborg är allt "Parkeringsanläggning" och ordet hade bara gjort badgen längre.
Verifierat i webbläsaren efteråt: badge och kort identiska med före.

Testat mot riktig data: urvalet innehåller exakt de två avsedda typerna (453 poster,
inga cykelgarage), och sju destinationer × fyra fordon gav noll fel på tak, sortering,
etikett och grammatik. Gatukartan oförändrad (222 gator på Odengatan, som förut).

**Kvar att göra (steg 2):** 55 av de 403 bär villkor i fritext som appen ännu inte
läser – 34 med **maxtid** ("Max p-tid 3 h"), 13 med vem som får stå där (medlem,
personal, tillstånd, rörelsehindrad, buss), åtta med bara vissa platsnummer. Två av
de femtio garagen har också en maxtid vi inte visar: Viking P-Hus 8 timmar,
Kolonistugan 24. Och SEO-sidorna använder fortfarande sitt eget `/garage/i`-filter.

## v1.26.0 – 2026-09-07
**P-huspriset visade fel enhet, fel klockslag och fel fordon.**

Priset i p-huslistan lästes med en rad som tog första taxan vars tidsenhet innehöll
"tim". Tre saker gick fel samtidigt, och alla tre är mätta mot Stockholm Parkerings
riktiga `/phus`-data:

**1. Fel enhet fick etiketten "kr/tim".** "24 Timmar", "3 Timmar" och "1:a Timmen
Därefter" matchar också "tim". Alviks Torg P-Hus visade "15 kr/tim" ur en rad som
betyder något annat – timpriset där är 20 kr. Nu räknas bara enheten "timme" som
timpris; övriga rader skrivs ut med sin egen enhet i stället för att döpas om.

**2. Dygnet ignorerades.** Arenagaraget och Parkören kostar 30 kr/tim vardagar 00–18
men **55 kr/tim kvällar 18–24 och hela helgen**. Appen visade 30 kr dygnet runt –
alltså nästan hälften av verkligt pris precis när flest söker, i lägena "i kväll"
och "över natten". Klockslagen stod hela tiden i fältet `Galler`. Nu läses de, via
appens egen klocka – samma klocka som färgar gatorna, så `?debugtid=` och Framåt-läget
slår igenom även här.

**3. Fordonet ignorerades.** Åtta av femtio p-hus har egen MC-taxa. Norra Latin kostar
95 kr/tim för bil och **8 kr/tim för MC** – appen visade 95 kr även i MC-läge. Tolv
gånger fel, åt det håll som avråder från en plats som var billig. Nu följer priset
fordonsvalet. Saknas MC-taxa visas biltaxan märkt "biltaxa – MC-pris ej publicerat"
i stället för omärkt, eftersom 42 av 50 hus saknar den och ett tomt fält vore
ärligt men oanvändbart.

**Två rader som aldrig borde varit priser är också borta.** Personal-, boende-,
camping- och laddningstaxor svarar på en annan fråga än "vad kostar det att stå här",
och periodkort likaså: Alexandria 4 hade som enda besöksrad "1650 kr / 31 dygn". Nu
visas inget pris hellre än fel sorts pris.

Kortet säger dessutom **"Priset varierar över dygnet – detta gäller nu"** när
anläggningen har fler timpriser än det som visas, så att en enda siffra inte läses
som ett fast pris.

**Vad som INTE ändrades:** 46 av 50 p-hus visar exakt samma pris som förut. Sveriges
röda dagar finns inte i appen, så en taxa som bara gäller helgdag kan aldrig få ett
rakt nej på en vardag – den räknas som osäker i stället för utesluten.

**Regression som fångades före release:** Göteborg bygger sina taxarader i
`cities/goteborg.js` med `Tidsenhet: 'timme'` i gemener. En strikt jämförelse mot
"Timme" hade tyst tagit bort samtliga göteborgspriser. Jämförelsen är skiftläges-
okänslig, och Göteborg är verifierad i webbläsaren efteråt. Göteborgs källa skiljer
inte på fordon alls, så "MC-pris ej publicerat" visas bara i städer vars källa
faktiskt gör det (`STAD.phusMcTaxa`).

Testat i webbläsaren mot riktig data: 50 p-hus × 4 fordon × 4 tidpunkter = 800 anrop,
noll fel och noll felformade texter, plus Arenagaraget avläst både 10:00 (30 kr) och
20:00 (55 kr) via hela kedjan sökning → p-huslista → kort.

## v1.25.2 – 2026-09-05
**Sextiosju parkeringsregler hade slutat gälla, men ritades ändå.**

Stockholm sätter ibland ett slutdatum på en föreskrift: "gäller 20 maj – 1 juli 2026".
Nästan alltid handlar det om en tillfällig omreglering under ett vägarbete. När datumet
passerat har regeln upphört – men ParkSpot ritade den vidare. `VALID_TO` lästes bara för
gågator och uteserveringar, aldrig för P_TILLATEN eller P_FORBUD.

Mätt över fyra innerstadsområden: av 5 277 bilposter hade 111 ett slutdatum, och **67 av
dem hade redan gått ut** – sextio procent. Det slår åt båda hållen. En utgången förbudspost
målar rött där man faktiskt får stå; en utgången tillåten post målar grönt där den
tillfälliga p-platsen är bortplockad.

`loadParkingV2` filtrerar nu bort dem innan segmenten byggs, i båda lagren. Det som sållas
bort loggas i konsolen med beslutsnummer, gata och slutdatum, så att en tyst borttagning
går att granska i efterhand.

Stadens data var hela tiden rätt. Vi läste inte fältet.

**Vad utredningen visade på köpet**

Nio föreskrifter lästes ord för ord ur Transportstyrelsens register, sökta på *bygge,
arbete, schakt, tillfällig, entreprenad, ombyggnad, renovering, kran, etablering*. Noll
träffar. En svensk trafikföreskrift skriver vad som gäller och hur länge – aldrig varför.
Slutdatumet är därmed den enda signalen på att något är tillfälligt, och nu används den.

Kvar står ett hål vi inte kan täcka: en byggåtgärd som skrivs **utan** slutdatum rensas
aldrig. Wallingatan `0180 2024-02575` är ett sådant fall – förbud att parkera på södra
sidan, beslutat i september 2024, skrivet som permanent. Är det en byggåtgärd måste
Stockholm aktivt upphäva den. Vi kan inte se skillnaden.

Wallingatans fyra lila rutor mellan Upplandsgatan och Drottninggatan kontrollerades mot
den riktiga appkoden efter en rapport om att några kunde vara fel: tre platser för
rörelsehindrad och en MC-plats, alla permanenta beslut, inget par närmare än 25 meter –
alltså inga dubbletter. De är rätt.

## v1.25.1 – 2026-09-04
**En 30-minutersruta låg grön, och lovades trygg över natten.**

Lars fotograferade skylten vid Klädesvägen på Brommaplan: *P · 30 min 7–19 (8–16) 8–14 ·
Avgift 7–19 Taxa 5 · ⛔ Övrig tid.* Appen målade den grön. I Natt-läget stod det dessutom
"Trygg över natten" — på en ruta där skylten säger förbud nattetid.

Posten i registret (`0180 2024-01525`) har rätt platstyp, rätt klockslag och rätt taxa. Men
både tidsgränsen och meterangivelsen är tomma, och det var meterangivelsen appen lyssnade på.
Den blå varningen krävde att `VF_METER` fanns och var högst 30 meter — alltså att fickan var
kort *nog att gissa* att den är en korttidsplats. Utan den siffran fanns ingen signal.

**Antagandet som brast** stod i våra egna regler: *"normala besöksrutor har VF_METER/VF_PLATSER
null → behandlas som trygga"*. Klädesvägen har båda tomma **och** är en 30-minutersruta. Tomt
betydde "vi vet inte", inte "ingen gräns" — samma inversion som playbooken varnar för när en
ny stad ansluts, fast den satt i Stockholm hela tiden.

**En rättelse på köpet:** tidsgränsen är null i Minneberg också, på alla sex besöksposter.
Vi "ser" alltså aldrig 30 minuter någonstans. Minneberg blev blått för att en *längd i meter*
råkade vara ifylld och användes som ställföreträdare för en kort tid. Skillnaden mellan
platserna var aldrig känd gräns mot okänd gräns, utan ställföreträdare mot ingenting.

**Mätt över åtta områden** (Brommaplan, Minneberg, Vasastan, Södermalm, Kungsholmen,
Östermalm, Årsta, Kista): av 193 bilsträckor märkta "endast besök" har 5 bara meterangivelse,
26 bara tidsgräns, 2 båda — och **160, alltså 83 %, ingendera**. Tidsgränsen publiceras
nästan aldrig: 32 av 1 401 bilsträckor i fyra områden bär någon alls.

Kvar som pålitlig signal finns då bara att kommunen kallat platsen "endast besök", och det
fältet är ifyllt på alla 193. Därför räcker platstypen numera. Felet är asymmetriskt: en
onödig blå kostar en sekunds kontroll, en felaktig grön en kontrollavgift.

Rutan bär nu texten "kontrollera tidsgräns" där siffran saknas och "max 30 min" där den finns,
och räknas inte längre som en trygg plats i Natt-lägets summering.

**Uppmätt före och efter** på samma punkt, samma läge, samma procedur — Brommaplan i
Nu-läget: gröna 771 → 708, blå 15 → 78, totalt 1 798 båda gångerna. 63 sträckor bytte färg
och inget annat rördes. Göteborg (0 av 1 059) och Malmö (0 av 114) har inte platstypen alls
och kan därför inte påverkas.

Vad som **inte** är bevisat: att alla 160 är korttidsrutor. Ett foto bevisar ett fall. Vi
väljer försiktighet där vi saknar besked, och en skyltrunda får avgöra om regeln kan bli
precis igen i stället för bara försiktig.

## v1.25.0 – 2026-09-04
**Malmö städar inte på veckodagar. Den städar den 23:e.**

Tre städer hade lärt appen att en gata sopas *på onsdagar*. Malmö kallar sin städning
**miljöparkering** och skriver den så här: «Parkering förbjuden klockan 18.00–22.00 den 23:e
i månaden.» Ett datum, inte en veckodag. Den formen kunde den delade koden inte uttrycka –
och eftersom städdagen är det som gör skillnad mellan en ledig gata och en bogserad bil, gick
det inte att runda.

**Ändringen blev mindre än befarat, och det är den intressanta delen.** Alla tre ställen som
frågar "städas det här?" – idag, imorgon, och veckan framåt – går redan genom samma funktion
med ett konkret datum. Grinden ligger därför på **ett** ställe. Städer utan det nya fältet är
opåverkade: fältet finns inte, testet hoppas över, ingenting annat hinner ändras.

Två följdändringar tvingade datumformen fram:

* **Horisonten blev ett stadsvärde.** En regel som återkommer en gång i månaden ligger oftare
  än sju dygn bort. Med den gamla horisonten hade kortet svarat "ingen städning de närmaste
  8 dygnen" tre veckor av fyra – fast datumet är känt exakt. Malmö tittar 31 dygn framåt,
  övriga städer sju, precis som förut.
* **Bortom en vecka skrivs datum i stället för veckodag.** "På fredag" om 26 dygn läses som
  *denna* fredag. Gränsen är satt vid sju dygn just för att Stockholm och Göteborg aldrig kan
  nå dit – deras rader är oförändrade in på tecknet.

Kortet skriver "Servas den 11:e & 23:e varje månad 12–16". Ordningstalet böjs som Malmö själv
skriver det i föreskriften – 1:a, 21:a, 22:a men 11:e och 12:e – eftersom "den 21:e" hade sett
ut som ett stavfel bredvid kommunens egen skylt.

**Malmö är byggd men avstängd.** Staden syns inte i väljaren och ingen användare möter den.
Skälet är en lucka vi mätte i stället för att gissa: Malmö publicerar **fyra** lastplatser i
hela kommunen. En lastplats som gäller 9–18 på Stora Nygatan ligger i datan som vanlig
avgiftsparkering. Hur illa är det? Mätt mot Stockholms riktiga data är lastplats **7,4 % av
innerstadens gatulängd** – och av 713 lastplatser gäller **noll** klockan 02 eller 23. Luckan
biter alltså mitt på dagen och aldrig på natten. Det är därför svaret inte blev att måla halva
staden blå, utan att fråga kommunen och vänta.

**Bevisat mot verkligheten, inte mot antaganden.** Ett dygnssvep med appens egen testklocka
körde den riktiga koden mot riktig data över hela månadscykeln: den 22:e grön, den 23:e kl
12 orange med ljus kant, 17:30 orange, 19:00 röd medan städningen pågår, 23:00 med den
ljusgröna kanten som säger att förbudet nyss tog slut, den 24:e grön igen. Och skylten Lars
fotograferade på Stora Nygatan – «18–22, gäller den 23:a varje månad» – stämmer siffra för
siffra med vad `/malmo/schedule` svarar.

Regressionen kördes brett: Stockholm 204 gator och 771 ritade linjer, Göteborg 787 städposter
över 84 gator. Veckodagstext rakt igenom, noll datumformuleringar, horisonten kvar på sju.

**Tre brev till tre kommuner.** Varje mottagare är hämtad ur kommunens egen publicerade
information, och varje fråga är kontrollerad mot deras data först – vi ber aldrig om något de
redan publicerar. Malmö ombeds publicera sitt föreskriftsutdrag ofiltrerat. Göteborg ombeds
fylla arbetsytan `ltf`, som är deklarerad i deras egen karttjänst men innehåller noll av 102
lager. Sundbyberg får den enda blockerande frågan: **får vi använda datan alls?**

Innan Göteborgs-brevet skrevs kontrollerades den frågan bakvägen: 1 452 poster i deras
Parkeringskartan nämner "P-förbud", vilket såg ut som förbudsdata vi missat. Alla 1 427 som
gick att tolka matchade en befintlig sopsträcka på gatunamn och klockslag. Det är städförbudet
vi redan ritar – luckan finns kvar, nu bekräftad från ett andra håll.

Med i samma bunt: Sundbybergs etikett som påstod att karttjänsten inte svarade (den gör det
igen), playbooken för att ansluta en ny stad, och kodpekarnas omräkning. Arkitektursidan
räknar medvetet **inte** Malmö – sidan beskriver appen i drift, och en stad som inte är
påslagen ska inte namnges där.

**Vad som inte är gjort:** skyltrundan i Malmö, SEO-sidorna och de arkitekturtexter som
fortfarande bara känner tre städer. Inget av det påverkar någon användare så länge Malmö är
avstängd.

## v1.24.0 – 2026-09-03
**"Jag åker om en halvtimme – hur ser det ut när jag är framme?"**

Kartan svarade bara på nu. Men den som ska in till stan vill tajma en städgata eller ett
förbud som släpper – och just då säger en röd gata ingenting om att den öppnar om tio
minuter. **Framme om +30 / +60 min** visar hela kartan som den blir vid framkomsten.

**Valet bygger på en mätning, inte på en gissning.** Första idén var en nedräkning per röd
gata. Den mätningen avfärdade den: öppningar sker i KLUMP. I Vasastan öppnade **50 sträckor
i ett och samma kvartssteg** (06:00) och noll i kvarten runt omkring; i Göteborg 19 stycken
10:00. Vid 05:45 öppnade 100 % av alla röda sträckor inom 30 minuter. En etikett per gata
hade alltså tänts på nästan allt rött samtidigt – den skiljer inget åt. Informationen är
inte per gata, den är per **klockslag**, och då är rätt kontroll en tidpunkt.

Det löser dessutom båda riktningarna med samma grepp: gator som hunnit öppna blir gröna,
och gator som hunnit **stängas** blir röda. En markering på rött hade bara löst hälften.

**Glöden gör jobbet gratis.** Uppmätt Stockholm 05:45 → 06:15: lediga gator 239 → 287, och
**70 glödande** sträckor tänds – exakt de som nyss blev fria.

**Att kartan visar en annan tid än nu får aldrig kunna missförstås.** Därför ett rött band
överst med klockslaget (`Kartan visar kl 19:05 – inte läget just nu`) och en väg tillbaka i
samma band. Rött är valt med flit: appen har redan ett rött band för `?debugtid=`, så rött
där uppe betyder redan "inte verklig tid". Även lägeschipet, rubrikens datum och
antalsbadgen följer den visade tiden – en enda skärm får inte bära två påståenden om tid.

**Tre fel som testandet grävde fram, alla rättade:**
* `+15` togs bort. Skiften sker på hel timme, så steget gav oftast noll synlig skillnad
  (05:45 → 06:00: 237 mot 239 lediga). Ärligt, men det läses som att appen är trasig.
* Över midnatt visade appen torsdagens karta under rubriken "Onsdag 2 sep". Datumet följer
  nu tiden, och bandet skriver ut veckodagen när dygnet byts.
* Kartan hoppade 61 m varje gång bandet tändes (och 1 118 m i ett fall när lådan bytte
  höjd efteråt). Vyn låses nu över layoutbytet – en ändrad TID ska inte flytta kameran.

Klockan flyttas som EN klocka för hela appen, inte som ett `nuTid()` på utvalda ställen:
färgkedjan frågar efter tiden på dussintals ställen, och en karta där bara hälften är
framskjuten är det farligaste tillstånd den här appen kan hamna i.

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
