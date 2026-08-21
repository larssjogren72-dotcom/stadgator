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
