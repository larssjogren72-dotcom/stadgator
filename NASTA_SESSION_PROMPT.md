# Nästa session: Karlstad som stad sex

Skrivet 2026-09-17 när Uppsala just gått live. Läs `NY_STAD.md` (särskilt steg 1b och
avsnitt 8b «Lärdomar från Uppsala») innan något byggs.

## Startprompt att klistra in

> Bygg Karlstad som stad sex. Börja med städmodellen och en frånvarotabell enligt
> NY_STAD.md steg 1b och 2 – säg svaren till mig innan du skriver kod. Föreslå en
> skyltrunda med fem specade adresser före Go.

## Vad vi redan vet om Karlstad (inventerat 2026-09-15, inget byggt)

- **Parkering:** `gi.karlstad.se/geoserver/ows`, lagret
  `webbkartan:vy_parkab_parkeringsplatser_avgiftsbelagda` – 381 poster med `max_ptid`,
  taxa och förbudstext. Avgiftsfria ligger i ett eget lager med 401 poster.
- **Städning:** `vy_tg_tg_staddagar_parkeringsforbud` – 200 poster med veckodag,
  klockslag och jämna/udda veckor. **Det ser ut som en riktig städmodell** (som Göteborg),
  men det är INTE utrett om det är föreskrift eller skötseldata. Avgör det först:
  Helsingborg och Gävle hade «gatusopning» som bara var skötsel, och en sådan får aldrig
  ritas som förbud.
- **⚠ Koordinatfälla:** `srsName=4326` avrundas till två decimaler (~1 km fel). Hämta
  **EPSG:3008** och räkna om. Samma familj av fel som Malmös grader-i-meter-bugg.
- **Inga gatunamn i parkeringslagret.** Stockholms kontrakt kräver `STREET_NAME` (kortets
  rubrik och nyckel till städschemat). Antingen härleds namnet ur ett vägnät, som Malmö
  gör, eller så saknar korten rubrik – ta ställning tidigt.
- Förbud per gata finns inte (ingen av 21 kommuner har det utom Stockholm).

## Läget i appen när sessionen tar slut

- **Live på parkspot.se: v1.32.1** (`2957c44`). Stockholm, Göteborg och Uppsala i väljaren;
  Malmö och Sundbyberg dolda.
- **FYRA COMMITS LIGGER LOKALT, EJ PUSHADE** på grenen `nedrakning-heltal`:
  `7fd5447` v1.32.2 nedräkningen · `ef05044` + `7b133c4` brevet till Uppsala ·
  `e880bd0` v1.33.0 SEO för Uppsala. Grenen är en fast-forward från master.
  Fråga Lars om de ska pushas innan något nytt byggs ovanpå.
- **Brevet till Uppsala är skickat** 2026-09-17 (opendata@uppsala.se, åtta frågor).
  Kommer svar: för in det som `UPPSALA_SVAR.md` och rätta det appen påstår.
- Kvar sedan tidigare: Malmös fyra lastplatser visas gröna (läs Malmös föreskrifter först,
  som vi gjorde för Uppsala).
