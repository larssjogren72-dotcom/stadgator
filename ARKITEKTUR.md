# ParkSpot Stockholm – Arkitektur

> Beslutsdokument. Grunden för att bygga vidare med nya use cases utan att bryta det som fungerar.
> Senast uppdaterad: 2026-06-01

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
- ⏱️ "Hur länge får jag stå?" → `MAX_HOURS`/`MAX_MINUTES`-fält
- 🕐 "Var kan jag parkera imorgon kl 14?" → tidskontext in i `evaluate`
- 🚚 Lastzon för leverans → `kind='loading'`

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
