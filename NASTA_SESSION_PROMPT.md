# Prompt för nästa session — professionell testare för ParkSpot

Jag vill att du agerar som en **professionell testare/QA-ingenjör specialiserad på
kartbaserade, geodata-drivna appar** — inte bara som utvecklare. ParkSpot Stockholm visar
var man får parkera lagligt, baserat på Stockholms stads öppna trafikdata (WFS). Läs
`CLAUDE.md` och minnesfilerna (särskilt de som börjar `feedback_` och `project_stadgator_`)
innan du gör något — de innehåller hårt förvärvade lärdomar från gårdagens och dagens
sessioner som du INTE ska upprepa misstagen från.

## Arbetssätt jag kräver (icke förhandlingsbart)

1. **Gruppera och resonera innan du fixar.** Punktfixa aldrig en enskild plats utan att
   först fråga: vilket mönster tillhör den här, hur många andra poster matchar samma mönster,
   och vad betyder en ändring för HELA appen — inte bara det jag råkar titta på just nu.

2. **Verifiera mot äkta källa, aldrig mot mönstergissning.** Varje post i Stockholms data
   har ett `CITATION`-fält och en `RDT_URL` som pekar på Transportstyrelsens officiella
   föreskriftsregister — den faktiska juridiska texten, samma källa som avgör om en
   p-bot håller i domstol. Se `reference_rdt_transportstyrelsen_verifiering.md` för exakt
   hur du läser den (hämta PDF:en, inte bara metadata-sidan — en AI-sammanfattning av
   metadata räcker INTE, det gav fel svar en gång redan). Innan du säger "det här är
   bekräftat", ha faktiskt läst den fulla texten. Minst 2–3 oberoende exempel innan du
   litar på ett mönster i stor skala.

3. **Exakta GPS-koordinater, inte gatunamn.** Ett gatunamn kan ge 30+ överlappande
   registreringar. Använd koordinater (långtryck i appen, eller Google Maps
   höger-klick/långtryck) så att verifieringen gäller exakt rätt punkt.

4. **Testa i bred skala innan du committar en logikändring.** Innan en fix i
   sväljningsmodellen (`isParkingForbud`, `bodyCoverage`, etc.) någonsin föreslås som klar:
   kör den mot ett helt sökområde (inte bara det enskilda fallet) och räkna hur många andra
   poster som byter klassificering. Om det är fler än en handfull — stanna, förklara
   omfattningen, och vänta på klartecken innan något committas.

5. **Lita inte på en förorenad testmiljö.** Om du reverterar en kodändring, ladda om
   webbläsarsidan innan du testar igen — annars kör du gammal JS i minnet och drar fel
   slutsatser (hände redan en gång, kostade en hel utredningsomgång).

6. **Var ärlig om konfidensgrad.** Säg aldrig "bekräftat" om det egentligen är "sannolikt
   utifrån mönster". De är olika saker och blandas lätt ihop under tidspress.

## Verktyg som redan finns, byggda för det här

- **`?debug=1`** på parkspot.se (eller lokalt `localhost:3456`) — klicka var som helst på
  kartan så visas en panel med exakt vilka `P_TILLATEN`/`P_FORBUD`-poster som låg nära,
  avstånd, täckningsgrad, och det beräknade utfallet. Byggd specifikt för stickprov.
- WFS-proxyn (`/wfs/server/wfs?...&typeNames=ltfr:LAGERNAMN&...`) kan hämtas direkt, även
  hela stadens dataset i ett anrop (`count=40000` fungerade för P_FORBUD, 39 287 poster).

## Var vi lämnade det (2026-08-26, kvällen)

**Allt är pushat. Live på parkspot.se är v1.11.2.** Inget ligger och väntar lokalt.

⚠️ Den här filen påstod tidigare "19 commits lokalt, live v1.8.5". Det var sant när det
skrevs mitt på dagen men blev fel samma kväll — arbetet fortsatte och pushades. Läs
alltid `git rev-list --count origin/master..master` och `package.json` innan du litar
på en statusrad i ett dokument.

### Dagens kedja, i ordning
| version | vad |
|---|---|
| v1.9.0  | Sundbyberg flyttades in i huvudversionen, avstängd i drift |
| v1.10.0 | Föraren väljer kartapp: Google Maps, Apple Kartor eller Waze |
| v1.11.0 | Inget grönt i städer som inte kan skilja korttid från långtid |
| v1.11.1 | Debug-klockan kan resa till ett annat datum, och fryser inte längre |
| v1.11.2 | "Nyss städad" syns även när hela staden är blå |

### Sundbyberg: läget nu
Koden bor i `cities/sundbyberg.js` bakom kontraktet `{ id, prefix, hantera }` och tänds
med en env-variabel i Railway (`STADER=sundbyberg`). I drift är den **av** — Railway
sätter `RAILWAY_GIT_COMMIT_SHA`, och då laddas adaptern inte ens, så inga anrop går mot
Sundbybergs server. På Lars dator är den på utan handpåläggning.

🔴 **Licensen är fortfarande obesvarad.** Mejlet ligger färdigt men är INTE skickat
(`stadsmiljoochtrafiknamnden@sundbyberg.se`). Inget av Sundbyberg får publiceras innan
de svarat ja. Det är den enda spärren som återstår.

Regeln heter numera **`STAD.skiljerKorttid`** (hette `harMaxtid` under förmiddagen) och
gäller **båda lägena** — Sundbyberg är blått dag och natt. Skälet är skarpare formulerat
än det jag först skrev: alla 808 bilsegment i kommunens data bär en enda platstyp,
"P Avgift", så appen kan inte skilja en tvåtimmarsficka från en långtidsplats. Stockholm
klarar det via `VF_PLATS_TYP` (98,9 % ifyllt) och `VF_METER` (34,1 %) — inte via
`MAX_MINUTES`/`MAX_HOURS`, som är ifyllda på bara 1,4 % och alltså inte är skälet.

### Öppet
- Licensen ovan.
- ODD_EVEN-förbud (195 poster) hanteras fortfarande inte — blockerar Solna, som kör
  jämna/udda veckor.
- Solna: datan finns men allt är stängt utåt (ingen WFS, WMS `queryable="0"`, REST 401).
  Kräver kontakt med kommunen.
- Sekundär text i Sundbyberg-läget: bannern säger "ingen förbudsdata" fast slutsatsen
  blev att förbud uttrycks genom segmentets frånvaro; sidfoten listar Stockholms
  stadsdelar; sökrutan föreslår "Hornsgatan 10".
- 17 gamla lokala grenar kvar att städa.

### Tre mätfällor från i dag som inte får upprepas
1. **Ett nollresultat kan bevisa att metoden är blind.** Sökning efter maxtid gav 0 av
   2 040 Sundbyberg-föreskrifter i RDT — men ordet finns 0 gånger i RDT:s egen
   datakatalog också, så textsökning kan aldrig hitta det. Värdena ligger som
   frastkoder (`Fras121_Q=13`). Säg "finns inte i något fält jag kan läsa", aldrig
   "finns inte".
2. **Kontrollera att testvägarna ger innehåll.** Fyra jämförelsevägar gav tomma svar
   respektive 404 och rapporterade "identiska" — de jämförde ingenting med ingenting.
   Plocka testpunkter ur systemets egen data.
3. **En frusen klocka ser ut som en trasig app.** `?debugtid=` höll `Date.now()` stilla,
   och då blev Leaflets animeringar aldrig klara → kartan ritade inget. Jag rapporterade
   det som "fick inte debugtid att fungera" utan att hitta orsaken; den satt i
   debugverktyget, inte i appen. Fixat i v1.11.1.
