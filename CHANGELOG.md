# Changelog – ParkSpot Stockholm

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
