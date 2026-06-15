# ParkSpot Stockholm — projektregler

Parkeringskarta för Stockholm (live på **parkspot.se** via Railway). Visar var man får parkera
lagligt i tre lägen: **Nu / I kväll / Över natten**, + parkeringshus som sista utväg.
(Globala arbetssättet gäller utöver detta — se ~/.claude/CLAUDE.md.)

## Struktur
- `index.html` — hela appen (HTML+CSS+JS i ett). `server.js` — proxy/statisk server, port 3456.
- `seo/` — programmatisk SEO-generator (`build.js`) + genererade sidor (`site/`) + `pages.json`.
- `.apikey` (gitignorerad) — Stockholms API-nyckel. **COMMITTA ALDRIG.**
- Docs: `ARKITEKTUR.md`, `UX_DESIGN.md`.

## Köra & testa (gör ALLTID efter ändring)
- Server: `node server.js` (port 3456). Startas i bakgrunden; svarar på localhost:3456.
- JS-syntax: extrahera `<script>`-blocken ur index.html → `node --check` (det finns inga byggsteg).
- Verifiera mot **riktig data** via proxyn (`/proxy/servicedagar/weekday/{dag}`, `/wfs/server/wfs?...`, `/phus`).
- SEO: `node seo/build.js` regenererar alla sidor; verifiera + committa de genererade filerna.

## Workflow
- Bygg lokalt → testa → **committa lokalt** → **pusha till Railway endast på explicit "pusha"**.
- Railway deployar från GitHub `master`. Live-deploy = Lars beslut.
- SEO byggdes additivt (rör ej app-routes); appen (index.html) ska aldrig brytas av sidoprojekt.

## Datafakta att minnas (annars blir analyser fel)
- ⚠️ **Koordinatsystem:** WFS/P_TILLATEN/P_FORBUD = **SWEREF99** (EPSG:3011, meter, abs>1000).
  Servicedagar = **WGS84** (grader, [lng,lat]). `toLatLng(c[0],c[1])` i appen hanterar båda —
  analys-skript måste göra det med (anta inte fel CRS).
- **Taxa-zoner (LTFR_TAXA_VIEW):** Taxa **1–5 = bil** (55/31/20/10/5 kr/tim), **11–15 = mc/reducerad**
  (ligger ovanpå bil-zonerna). Visa bara 1–5; vid zon-gräns välj lägst nr (dyrast, konservativt).
- **Taxetider:** "vardagar"=mån–fre; "dag före (sön-/)helgdag"=lördag/helgafton. **Lördag 11–17 har
  avgift i Taxa 1–4** (Taxa 5 fritt). Visa "lör/helgafton" (`clarifyTaxa`), inte rå jargong.
- **Städgator:** servicedagar har säsong (START/END_MONTH+DAY); `cleaningActiveOn` filtrerar ur säsong
  (årsskifts-wrap för vinter 1/11–15/5). Innerstadsgator kan ha TVÅ säsonger (vinter + sommar).
- **P-hus-API** (api.stockholmparkering.se:8084) är MYCKET långsamt (~30s) → förvärmd cache i server.js;
  kall ~30s efter varje deploy. Bara kapacitet, ingen realtid.
- **Besöksfickor:** "endast besök" finns i två former. Äkta korta tids-/meter-fickor bär **`VF_METER`**
  ("X meter", t.ex. Svartviksslingan 10/15 m) → blå "kontrollera tid", ej "trygg över natten".
  Normala besöksrutor (t.ex. Hammarby Allé) har `VF_METER`/`VF_PLATSER` **null** → behandlas som trygga.
  Signalen är `VF_METER`, INTE geometrisk längd (markerade rutor är också korta → falsklarm).
  `MAX_MINUTES/HOURS` är null även på äkta fickor → exakt minutgräns finns EJ i datan (ärlig etikett).
  OBS fordon-filtret ligger FÖRE visitorShort → MC-fickor (VF_METER satt) blir lila, ej blå.

- **Gågator (sommargågator):** beslut finns i `LTFR_FORESKRIFT(_GEOM)` (TITLE "gågata på …",
  FORESKRIFTSTEXT, VALID_FROM/VALID_TO) – bättre än `od_gis:NVDB_Gagata`. Aktiv nu = VALID_FROM≤idag
  och (VALID_TO tom el. ≥idag). Sommargågator HAR ofta VALID_TO (sep/okt); en del (Rörstrandsgatan)
  saknar slut = permanent som skrivet. Appen flaggar överlappande p-segment rosa "Gågata – endast
  markerad plats" (ej "trygg"). Flaggning: **vinkelrät** linje-distans, **ändpunktsgräns**, och
  **täckningsgrad ≥50 %** (ej en spets). Tolerans 10 m interiört / 6 m vid änden (gågator är smala).

## Återanvändbart vid kart-överlappning (alla lager)
Vinkelrät distans (ej närmaste punkt) · strängare vid linjens ände · flagga på täckningsgrad ej en spets ·
tolerans per gatutyp (smal ≤10 m, bred ~15 m) · testa HELA pipelinen (även förbud-härlett) · index.html no-cache.

## Designprinciper
- **Gatufärg = laglighet, inte pris** (pris visas av zoner + kort). Undvik falsk trygghet.
- **Destinationen = ankaret; lägena = linser.** Lådan stannar nere (peek), val sker på kartan.
- **Verifiera brett — särskilt att innerstan inte bryts** vid varje ändring.
- Uppdatera projektminnet (`project_stadgator.md`) efter varje ändring.
