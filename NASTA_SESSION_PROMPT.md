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

## Var vi lämnade det (2026-08-26)

**19 commits ligger LOKALT på master, inget pushat. Live är fortfarande v1.8.5.**
Pusha bara på Lars uttryckliga "pusha" — det är en skarp driftsättning.

### Vad som gjordes i dag
1. **Sundbyberg flyttades in i huvudversionen** (v1.9.0), men **avstängd i drift**.
   Strömbrytare i `server.js`: Railway sätter `RAILWAY_GIT_COMMIT_SHA` → av. Lars dator
   → på. `STADER=sundbyberg` tvingar på, `STADER=av` tvingar av. Är den av laddas
   adaptern inte ens, så inga anrop går mot Sundbybergs server från drift.
   Stadskoden bor i **`cities/sundbyberg.js`** bakom kontraktet `{ id, prefix, hantera }`.
   Stockholm bevisat orört: 21 vägar mätta före/efter, 20 byte-identiska (den 21:a är
   `index.html` som växer med den avstängda stadskoden).
2. **Sundbyberg säger inte längre "Trygg över natten".** Lars gick Brunnsgatan med
   skylt i handen; vid vändplanen (59.363734, 17.968813) står **2 tim** medan appen
   ritade grönt. Ny flagga `STAD.harMaxtid` fäller grönt till blått
   "Får parkera – kontrollera tidsgräns". Fällningen ligger EFTER färgkedjan, så
   Stockholm kan inte påverkas och framtida gröna grenar fångas automatiskt.

### Öppna trådar
- **Licensen med Sundbyberg är obesvarad.** Mejlet ligger färdigt (scratchpad
  `mejl_sundbyberg.txt`, adress `stadsmiljoochtrafiknamnden@sundbyberg.se`) men är
  INTE skickat. Inget av Sundbyberg får publiceras innan de svarat ja.
- **`?debugtid=HH:MM` fick jag inte att fungera** — kartan ritade inget med den
  påslagen. Ej felsökt, ej bekräftat trasig. Utan parametern fungerar allt.
- **Glow-effekterna ("nyss städad", "gott om tid") är INTE verifierade i dag** —
  de kräver att städningen ligger 2–7 h bort och det inföll inte. Hänger ihop med
  `debugtid` ovan.
- **Sekundär text i Sundbyberg-läget skaver:** bannern säger "ingen förbudsdata"
  fast slutsatsen blev att Sundbyberg uttrycker förbud genom segmentets frånvaro;
  sidfoten listar Stockholms stadsdelar; sökrutan föreslår "Hornsgatan 10";
  taxaskalan 1–5 visas fast Sundbyberg använder A–E.
- Sedan tidigare: ODD_EVEN-förbud (195 poster) ej hanterade; legenden under lådan
  i full/half; 17 gamla lokala grenar.

### Två mätfällor från i dag som inte får upprepas
- **Ett nollresultat kan bevisa att metoden är blind.** Sökning efter maxtid gav
  0 träffar i 2 040 Sundbyberg-föreskrifter i RDT — men ordet finns 0 gånger i
  RDT:s egen datakatalog också, alltså kan textsökning aldrig hitta det. Värdena
  ligger som frastkoder (`Fras121_Q=13`). Säg "finns inte i något fält jag kan
  läsa", aldrig "finns inte".
- **Kontrollera att testvägarna ger innehåll.** Fyra av mina jämförelsevägar gav
  tomma svar respektive 404 och rapporterade glatt "identiska" — de jämförde
  ingenting med ingenting. Plocka testpunkter ur systemets egen data.
