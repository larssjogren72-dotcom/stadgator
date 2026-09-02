# ParkSpot Stockholm – Arkitektur

> Beslutsdokument. Grunden för att bygga vidare med nya use cases utan att bryta det som fungerar.
> Senast uppdaterad: 2026-06-01

> ⚠️ **Det här dokumentet beskriver Stockholm ensamt och är från juni 2026.** Det var
> sant då, men sedan dess har Göteborg och Sundbyberg tillkommit och delningen mellan
> delad grund och stadsspecifik kod har byggts. **Aktuell översikt:**
> [`docs/arkitektur.html`](docs/arkitektur.html) — dataflödet, integrationerna och de
> två fickor där stadsspecifik kod får finnas, med diagram.
> Resonemangen om UC1/UC2 och datalagren nedan gäller fortfarande; det som saknas är
> flerstadsmodellen.
>
> **Undantag: §7b och §7c är skrivna 2026-09-02 och beskriver nuläget i alla städer.**
> De handlar om adressöket och om diagnosflaggorna i adressraden – delar som saknades
> helt i dokumentet fram till dess.

---

## 1. Bakgrund och problem

Appen hjälper bilister i Stockholm att hitta parkering via två use cases:

- **UC1 – Kvällsparkering:** gator som städas imorgon bitti → troligen lediga kvällen innan.
- **UC2 – Nattparkering:** gator nära hemmet där det är lagligt att parkera natten.

**Problemet med nuvarande arkitektur:** dataåtkomst, regel-logik och kartritning är sammanflätade i UC1/UC2-funktionerna. Varje ny insikt (lastzon, motorcykel, parkeringsförbud) krävde kirurgi mitt i renderingsloopen. Textparsning och koordinatkonvertering upprepas på flera ställen. Därför riskerade varje fix att bryta en annan.

Dessutom byggde UC2 på **Overpass (OSM)** för gatunätet — långsamt (5–35 s, ofta timeout) och ger bara gatugeometri, inte parkeringsregler.

---

## 2. Nyckelinsikt (upptäckt 2026-06-01)

Stockholms WFS (`openstreetgs.stockholm.se`) har **dedikerade strukturerade lager** för exakt det vi mödosamt försökt härleda ur textsträngar. Alla `LTFR_*`-lager delar **samma fältschema**, vilket gör att allt kan normaliseras till ETT domänobjekt.

### Lagerkatalog (relevanta)

| Lager | Innehåll | Ersätter vår gissning |
|---|---|---|
| `LTFR_P_TILLATEN_GEOM` | **Var parkering är tillåten** (positiv sanning) | PARKING_RATE-parsning |
| `LTFR_P_FORBUD_GEOM` | Reglerad parkering (taxa/avgiftsfri/villkor) | — |
| `LTFR_LASTZON_GEOM` | Lastzoner | "lastning/lossning" i text |
| `LTFR_P_MOTORCYKEL_GEOM` | MC-platser | VEHICLE-gissning |
| `LTFR_P_RORELSEHINDRADE_GEOM` | Rörelsehindrade | — |
| `LTFR_P_BUSS_GEOM`, `LTFR_P_LASTBIL_GEOM` | Buss/lastbil | — |
| `LTFR_BOENDE` | Boendetillstånd-zoner | — |
| `LTFR_SERVICE_MAN/TIS/ONS/TOR/FRE` | Städdag per veckodag | — |
| `LTFR_SERVICEDAG(_STRETCHED)` | Servicedagar | nuvarande städdata |
| `LTFR_TAXA_VIEW`, `LTFR_TAXA_1..5_VIEW` | Avgiftszoner | — |
| `LTFR_FORESKRIFT_GEOM` | Råa föreskrifter | (sista utväg) |

### Gemensamt fältschema
`VEHICLE`, `PARKING_RATE`, `START_TIME`/`END_TIME`, `START_WEEKDAY`/`END_WEEKDAY`, `VF_PLATS_TYP`, `VF_METER`, `STREET_NAME`, `CITY_DISTRICT`, `PARKING_DISTRICT`, `CITATION`, `RDT_URL`, geometri i **SWEREF99 (EPSG:3011)**.

### Parkeringsförbud-modellen (VALIDERAD 2026-06-02)
C35 "förbud att parkera" finns **inte** som egen post med en förbudstitel. Den härleds ur två lager:

- `LTFR_P_TILLATEN_GEOM` = explicit uppräkning av **tillåtna p-platser** (korta sträckor/fickor). Svartviksslingan: 17 seg / 555m.
- `LTFR_P_FORBUD_GEOM` = **hela den reglerade gatusträckan** (båda sidor). Svartviksslingan: 16 seg / 1914m.

**Algoritm (verifierad mot verkligheten):**
> **Förbudszon = P_FORBUD-segment där ingen P_TILLATEN-punkt finns inom ~12 m.**
> Parkerbart = P_TILLATEN (eller P_FORBUD nära en P_TILLATEN).

Tröskeln ~12 m kompenserar för att lagren kan ligga på motstående trottoarkanter. Visuellt test på Svartviksslingan: de röda (förbud-utan-tillåten) sträckorna låg exakt där fastighetsägaren vet att C35-förbud gäller (motsols längs slingan); stickgator och medsols-änden blev blå (tillåtet) — bekräftat mot skylt. **Modellen håller.**

OBS: `PARKING_RATE` (taxa/avgiftsfri) finns som metadata på BÅDA lagren och säger inget om tillåten/förbjuden — det är geometriskillnaden som bär informationen.

---

## 3. Föreslagen arkitektur – 6 lager

```
┌─ 6. Vyer / UC-presenters ─ UC1, UC2, framtida UC … (tunna)
├─ 5. Regelmotor ─────────── evaluate(segment, kontext) → verdikt
├─ 4. Rumsligt index ─────── near(punkt, radie)
├─ 3. Domänmodell ────────── normalisera → ParkingSegment (EN gång)
├─ 2. Källadaptrar ───────── fetchLayer(namn, bbox)  (en generisk WFS)
└─ 1. Cache ──────────────── localStorage; lagren ändras sällan
```

**1. Cache** – strukturerad data ändras sällan. localStorage med datumstämpel → near-instant vid återbesök. Löser långsamheten permanent.

**2. Källadapter** – *en* generisk `fetchLayer(layer, bbox)`. Alla lager har identisk WFS-struktur. Parallella anrop, bbox-begränsade.

**3. Domänmodell – hjärtat.** Varje feature → ett `ParkingSegment`. All "smutsig" parsning och koordinatkonvertering sker **på ett ställe** – testbart, fixas en gång, rätt överallt.

```js
ParkingSegment = {
  kind: 'allowed' | 'forbidden' | 'loading' | 'motorcycle' |
        'disabled' | 'bus' | 'truck' | 'cleaning',
  vehicle,                         // 'fordon' | 'motorcykel' | 'rörelsehindrade' | …
  geometry: [latlng, …],           // SWEREF99 → WGS84 konverteras EN gång här
  rate: { raw, freeAtNight, residentOnly, taxa },  // PARKING_RATE parsas EN gång här
  time: { startTime, endTime, weekday, … },
  street, district, citation, rdtUrl,
  source                           // ursprungslagrets namn
}
```

**4. Rumsligt index** – `near(punkt, radie)`. Återanvänder `distPointToSegment` (SWEREF99, meter).

**5. Regelmotor** – ren funktion `evaluate(segment, kontext)` → verdikt
(`park-ok`, `betala`, `boende-endast`, `förbjudet`, `städas-snart`).
**Use case-logiken bor här**, frikopplad från data och rendering.

**6. Presenters** – UC1/UC2 blir tunna: hämta verdikt → färg. Ny UC = ny policy, inte ny datakod.

---

## 4. Use case-mappning

### Nuvarande
- **UC1 Kvällsparkering:** `LTFR_SERVICE_<veckodag>` → gator som städas imorgon.
- **UC2 Nattparkering:** `LTFR_P_TILLATEN_GEOM` filtrerat på `vehicle='fordon'` + `freeAtNight` + ej `residentOnly`, minus städgator imorgon, minus lastzon/mc/rörelsehindrade.

### UC3 – "Kan jag parkera HÄR JUST NU?" (planerad)
Visar **nuläget** i realtid: givet aktuell tid + veckodag, är gatorna parkerbara just nu?
Samma datagrund (P_TILLATEN/P_FORBUD) men `evaluate(segment, { now })` med tidskontext:
ta hänsyn till `START_TIME`/`END_TIME`, städning idag/imorgon, avgift just nu, boendetid kvar.
Naturlig påbyggnad på regelmotorn (lager 5) – ingen ny datakod. Hög prioritet efter v2.0.

### Övriga framtida (nya policys i lager 5, noll ändring i datalagren)
- 🅿️ "Var får jag parkera nu med mitt boendetillstånd?" → `residentOnly`-filter på
- 🏍️ MC / ♿ rörelsehindrad → byt `kind`-filter (egna lager finns)
- 💰 "Billigaste parkering nära X" → sortera på `rate.taxa`
- ⏱️ "Hur länge får jag stå?" → `MAX_HOURS`/`MAX_MINUTES`-fält (OBS: ofta null i datan,
  t.ex. 30-min-fickor saknar värde → kan ej filtreras; känd begränsning)
- 🕐 "Var kan jag parkera imorgon kl 14?" → tidskontext in i `evaluate`
- 🚚 Lastzon för leverans → `kind='loading'`

### Framtida: använd P_TILLATENs EGNA tidsfält (upptäckt 2026-06-03)
P_TILLATEN bär strukturerade tidsfält vi inte använder: `START_TIME`/`END_TIME`,
`DAY_TYPE`, `START_WEEKDAY`, `START/END_MONTH`+`DAY` (säsong) och `OTHER_INFO`
(t.ex. "Servicetid måndag 08:00–16:00 1 november–15 maj"). Idag hämtas städning
från separat servicedagar-API. Möjlighet: mer exakt städ-/säsong-/avgiftshantering
direkt ur P_TILLATEN → en datakälla, säsongsmedveten (t.ex. vinterstädning 1/11–15/5).

---

## 5. Domänregler (lärdomar att koda in i regelmotorn)

Verifierat mot fältdata och skyltar:

- `PARKING_RATE = "avgiftsfri"` → fri parkering (inte ett förbud).
- `PARKING_RATE` innehåller `"vardagar X-Y"` → avgift dagtid, **fri på natten** → `freeAtNight = true`.
- `"boende: … kr/månad"` i rate → **rabatterat boendekort-erbjudande**, INTE ett förbud för andra. Påverkar inte nattparkering. (Bekräftat: hela Traneberg har "boende" i rate.)
- Skylttext `"Boende <zon>"` (t.ex. "Boende Ci/Tr") → boendezon; besökare får stå **max 3 tim** utanför betaltid → visa som "kontrollera skylt", ej blå för nattparkering.
- Lastzon (`LTFR_LASTZON_GEOM`, eller föreskrift "lastning/lossning") → reserverad för leveransfordon. Kort sträcka (5–22 m). Ska INTE göra hela gatan otillgänglig – visa som egen kort markör.
- Ändamålsplats med `"övrig tid får fordon parkeras"` → parkerbar på natten.
- MC-platser (`LTFR_P_MOTORCYKEL_GEOM`) är korta (5–10 m) på vanliga bilgator – gör INTE hela gatan till mc-gata.
- C35-förbud: **frånvaro** av P_TILLATEN-segment = förbjudet.

---

## 6. Datanoter (fallgropar)

- **Geometri i SWEREF99 (EPSG:3011).** Konvertera via `proj4` / `toLatLng(x,y)` – en gång, i domänlagret.
- **`VF_METER` är ofta null** – räkna längd ur geometrin, lita inte på fältet.
- Långa gator har många korta segment – filtrera/färglägg per segment, inte per gatunamn (annars "lång gata–liten restriktion"-felet, jfr Margretelundsvägen).
- Granngators restriktioner kan ligga geometriskt nära – matcha mot `STREET_NAME`/`LOCATION_APPROX` för att undvika falska positiver.

---

## 7. Verifiering (2026-06-01)

Läs-bara konsoltester på två ytterstadsplatser:

| Plats | Typ | P_TILLATEN segment | Gator | Tid |
|---|---|---|---|---|
| Svartviksslingan 76d (hem) | Ytterstad | 281 | 24 | 330 ms |
| Lillsjövägen, Ulvsunda | Ytterstad | 262 | 36 | 299 ms |

- **Prestanda:** ~300 ms/lager, ~660 ms för fyra lager. 10–50× snabbare än Overpass (5–35 s). Godkänt.
- **Täckning ytterstad:** rik datamängd vid hemadressen där vi har verklighetskunskap. Godkänt.
- **Rumslig korrespondens / C35-detektering (2026-06-02):** algoritmen "förbud = P_FORBUD − P_TILLATEN (12 m)" ritades på kartan och bekräftades mot fastighetsägarens verklighetskunskap om Svartviksslingan. Röda sträckor = faktiskt förbud; blå = faktiskt tillåtet. **Godkänt.**

### Validerad detekterings-algoritm (kärnan i regelmotorn)
```js
// För varje P_FORBUD-segment: är någon P_TILLATEN-punkt inom 12 m (SWEREF99, meter)?
//   nej  → förbudszon (rita ej som parkerbar)
//   ja   → parkerbart (använd P_TILLATEN-villkoren: taxa/avgiftsfri/boende/vehicle)
```

---

## 7b. Adressöket – två externa tjänster, ingen egen geokodning (tillagt 2026-09-02)

Appen har aldrig geokodat själv. Det var odokumenterat fram till nu, vilket kostade en
hel felsökningsrunda: ingen kunde se att sökrutan och sökknappen använder **olika**
tjänster, och att den ena kan ligga nere medan den andra fungerar.

| | Tjänst | Används av | Fallerar den? |
|---|---|---|---|
| **Förslag medan man skriver** | Photon (`photon.komoot.io`) | `fetchSuggestions()` | Sökknappen fungerar fortfarande |
| **Slå upp en skriven adress** | Nominatim (`nominatim.openstreetmap.org`) | `searchStreet()`, `promptSetHome()` | Förslagen fungerar fortfarande |

Båda är gratis och nyckelfria – och båda är utanför vår kontroll. Det är skälet till
att felraden i förslagsrutan uttryckligen säger åt användaren att trycka på 🔍: det är
inte en artighetsfras utan en riktig utväg till en annan leverantör.

### Hur förslagen hålls inom staden

Två filter, och båda behövs:

1. **`STAD.sokRuta`** – kommungränsens omslutande rektangel, hämtad ur OSM:s kommunytor.
   Skickas som `bbox` till Photon, som filtrerar hårt på den. Utan den föreslår
   Göteborgsläget Stockholmsgator.
2. **`STAD.sokOrter`** mot Photons `city`-fält – rektangeln ensam räcker inte, eftersom
   Sundbyberg, Solna och Nacka ligger INNE i Stockholms rektangel (och Mölndal och
   Partille inne i Göteborgs). Uppmätt: "Sveavägen 10" gav **Sundbybergs** Sveavägen som
   första träff i Stockholmsläget.

### ⚠ Tre fallgropar som redan har smällt

- **`lang=default` är inte valfri.** Photon svarar på det språk webbläsaren ber om i
  `Accept-Language`. En användare med engelskt språkval får `"Gothenburg"`, filtret
  jämför mot `"Göteborg"` – och **hela sökrutan dör**. Det hände 2026-09-02. Verifiering
  med `curl` är blind för detta: curl skickar ingen `Accept-Language` alls.
- **`lang=sv` går inte att använda** tillsammans med `bbox` – Photon svarar HTTP 400.
  `default` ger de lokala namnen ändå, vilket är det vi vill ha.
- **Ett filter får aldrig radera hela svaret i tysthet.** Tar kommunfiltret bort ALLT
  medan tjänsten faktiskt svarade med träffar, visas träffarna ändå. Hellre ett förslag
  i grannkommunen – raden bär sin kommun, och stadsvakten fångar den om man väljer den
  – än en död sökruta.

### Stadsvakten

`flyToAndShow()` är den enda väg **alla** destinationer delar: sökknappen, ett valt
förslag, hemknappen, GPS-punkten och ett klick på kartan. Därför ligger kontrollen där
och ingen annanstans. Ligger destinationen i en av våra ANDRA städer ställs frågan i
stället för att en tom karta ritas – tomt betyder "vi vet inget" i appen, inte "här
finns inget". Destinationen följer med över omladdningen i `sessionStorage`, **inte** i
URL:en: en sökt adress ska inte nå webbstatistiken eller följa med i en delad länk.

Vakten mäter mot rektangeln, inte mot kommungränsen. Sundbyberg, Solna och Nacka ligger
helt inne i Stockholms rektangel och kan därför inte fällas där – medvetet, eftersom en
exakt gränskontroll hade krävt ett nätanrop före varje sökning och klick. De fångas av
kommunnamnsfiltret i stället, som är vägen de i praktiken kommer in.

**Stadsläget visar staden.** Kartan flyttar sig ALDRIG till användarens GPS-position av
sig själv (borttaget 2026-09-02: Lars satt på tåg i Norrland och fick Norrland i stället
för Göteborg). Den blå punkten ritas, men flyttar inte kartan. Platsknappen finns kvar
och är ett medvetet tryck.

---

## 7c. Diagnoslägen i adressraden

Fyra flaggor, alla helt inaktiva utan sin parameter. De finns för att fjärrfelsökning
utan utvecklarkonsol annars är ren gissningslek – varje flagga här har födts ur en
felsökning som kostade fler rundor än den borde.

| Flagga | Visar | Föddes ur |
|---|---|---|
| `?debug=1` | Stickprov på en punkt: nära, avstånd, täckningsgrad, beräknat utfall | Att göra stickprov jämförbara – samma tal, samma källa, ingen tolkning i mitten |
| `?debugtid=` | Kör appen på simulerad tid (klockan går vidare, den står inte stilla) | Tidsbestämd färgsättning går inte att testa genom att vänta till 06:59 |
| `?kartlogg=1` | Kartsynk-vakthundens utfall ur localStorage + synlig badge | Kartfrysningen på iOS (se §9) |
| `?sokdebug=1` | Rå räkning i förslagsrutan: `svar / utan namn / fel stad / dubbletter / kvar`, plus `sokOrter` och Photons `city` **tecken för tecken** | "Gothenburg"-buggen ovan. Fyra gissningsrundor gav inget; flaggan löste det på en |

Sista kolumnen i `?sokdebug=1` är själva poängen: den skriver ut både det appen jämför
och det den fick, så att två strängar som SER identiska ut ändå går att skilja åt.

`?debugtid=` och `?kartlogg=1` visar en synlig markering på sidan, av samma skäl: annars
är det lätt att glömma att man står i ett diagnostikläge och läsa det som vanlig drift.

---

## 8. Migrering – utan att bryta det som fungerar

1. Bygg lager 1–4 **bredvid** befintlig kod, bakom en flagga.
2. Validera mot kända gator: Svartviksslingan, Kammakargatan, Margretelundsvägen, Wallingatan.
3. Skär över **UC2 först** (mest trasig idag); behåll UC1 orört tills UC2 är bevisat.
4. Ta bort Overpass när UC2 går på P_TILLATEN.
5. Disclaimern ("kontrollera alltid lokala skyltar") kvar hela vägen.

---

## 9. Öppna punkter

- ✅ **Rumslig korrespondens / C35** – LÖST 2026-06-02 (se §2 + §7, algoritm validerad).
- ✅ **Skillnad P_TILLATEN vs P_FORBUD** – LÖST: P_TILLATEN = tillåtna platser, P_FORBUD = hela reglerade sträckan; förbud = differensen.
- ⬜ **Innerstadstäckning:** en `testTackning()` på Norrmalm för komplett matris (låg risk – innerstad är mest reglerad).
- ⬜ **Tröskelfinjustering:** 12 m fungerade på Svartviksslingan; verifiera på fler gator (smala/breda) innan hårdkodning.
- ⬜ **Prestanda P_FORBUD−P_TILLATEN:** O(n×m) punktjämförelse per sökning – bygg enkelt rutnäts-index om det behövs.
  (Mätt 2026-08-24 och avfärdad som frysningsorsak: isolerad loop = 3 ms i Gamla Stan, ~220k jämförelser. Kvar som teoretisk risk, inte praktisk.)
- ⬜ **Kartans storlekssynk (iOS):** vektorlagren ritas på EN canvas (`L.canvas`). Leaflet håller
  canvasen i takt med containern via `trackResize`, men korrigeringen kör inuti
  `requestAnimationFrame`. Stryper iOS rAF (tangentbord, adressfält som fälls in, minnestryck)
  kör den aldrig, och inget försöker igen → baskartan täcker hela containern medan överläggen
  bara täcker den gamla ytan, och kartan blir död för tryck där canvasen inte når.
  **Mildrat 2026-08-25** med en vakthund (`kartSynkKoll`, index.html) som jämför `map.getSize()`
  med containern var 2:a sekund + vid `visibilitychange`/`pageshow`/`orientationchange`/
  `visualViewport.resize` och rättar med `invalidateSize({pan:false})`. Utfall loggas till
  localStorage, läsbart via `?kartlogg=1`. **Grundorsaken är inte bevisad** – vakthunden är ett
  skyddsnät som dessutom samlar bevis, inte en verifierad fix.
- ✅ **`vh` vs `innerHeight` på iOS – ÅTGÄRDAD 2026-08-25.** `#bottom` fick höjd från CSS `85vh`
  medan `sheetSnaps` räknas från JS `window.innerHeight`. På iOS är `vh` den stora vyporten
  (adressfält dolt) och `innerHeight` den faktiska → två oberoende sanningar.
  **Fix:** `height: 85%` i stället för `85vh`. `#bottom` är absolutpositionerad i `#app`
  (`position:relative; height:100%`), så procenten räknas mot appens faktiska höjd – exakt det
  tal `sheetCompute()` läser som `appH`. Det initiala peek-läget gick från
  `translateY(calc(85vh - 118px))` till `calc(100% - 118px)`; procent i `translateY` syftar på
  elementets egen höjd, så det uttrycker samma sak utan vyport-beroende.
  Uppmätt: identiskt (690 px) där de redan var ense; med simulerat adressfält (app 730 av 812)
  gav gamla koden 690 px = 94,5 % av appen i stället för 85 %. Proportionsfel, inget överflöde.
- ⬜ **Legenden hamnar under lådan i `full`/`half`:** `fitLegendHeight()` har ett golv på 120 px
  (`Math.max(120, plats)`) som vinner över att få plats. Uppmätt överlapp 193 px i `full`.
  Avsiktligt (oläsligt under 120 px) och oförändrat av fixen ovan – men det är detta Lars såg
  som "legenden hoptryckt". Funktionen läser dessutom lådans LIVE-geometri
  (`getBoundingClientRect().top`) i stället för det redan kända mål-snappet `sheetSnaps[nivå]`,
  vilket ger ett mellanläge om den anropas mitt i lådans transition.
