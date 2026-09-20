'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// STADSADAPTER: Uppsala
// ─────────────────────────────────────────────────────────────────────────────
// KONTRAKTET (samma som cities/goteborg.js och cities/malmo.js): exportera en
// factory som tar de delade hjälparna och returnerar
// { id, prefix, hantera(reqUrl, req, res) -> bool }.
// hantera() svarar true om vägen togs om hand. Allt utanför `prefix` rörs aldrig.
//
// KÄLLA: kartportal.uppsala.se/mapping (ArcGIS Enterprise). INGEN nyckel, ingen
// inloggning. Tjänsterna heter GOT_* och är samma lager som kommunens egen
// parkeringskarta på uppsala.se läser. Inventerat 2026-09-15: 283 tjänster, 1 385
// lager genomgångna ner på fältnivå (se projektminnet project_stadgator_stadsinventering_21).
// ⚠ LICENS: portalen märker lagren «public», men de står INTE i kommunens öppna
// dataportal (opendata.uppsala.se – sökningen «parkering» ger bara badplatser).
// Datan samlas in av Uppsala Parkerings AB. Åtkomligt ≠ licensierat – samma fråga som
// Sundbyberg. Därför skriver appen «parkeringskarta», aldrig «öppna data», och frågan
// står först i UPPSALA_BREV.md. Beslutet om drift är Lars.
//
// ═══ DET SOM SKILJER UPPSALA FRÅN ANDRA STÄDER ════════════════════════════════
// **Allt är kodlistor, inte fritext.** Tidsgränsen, tillåten tid, avgiftstiden och
// restriktionen är heltal med en domän i tjänstens metadata ("Tidsbegransning 6" =
// «2 tim»). Domänerna läses ur tjänsten vid start – vi skriver aldrig av koderna,
// för en kod som byter betydelse ska inte kunna ljuga i appen.
//
// **Tiderna följer skyltkonventionen.** «2 tim 8-18 (8-18) 8-18» betyder:
//   8-18   vardag utom dag före sön- och helgdag   → 'vardag-ej-dagfore'
//   (8-18) vardag före sön- och helgdag (lördag)   → 'dagfore'
//   8-18   sön- och helgdag (röd siffra på skylten) → 'sonhelg'
// En ensam tid utan parentes gäller alltså BARA vardagar. Det är inte gissat ur
// tomrummet: kodlistan skiljer uttryckligen «2 tim 8-18» (kod 13) från «2 tim 8-18
// (8-18) 8-18» (kod 12), och områdestexterna skriver «16-24 (8-24)» där lördagen
// börjar tidigare än vardagen. ⚠️ Det är ändå det första en skyltrunda ska pröva –
// ett lördagsfoto på en sträcka med ensam tid.
//
// **Tidsgränsen bor på TVÅ ställen.** Sträckan bär `Tidsbegransning`, men många
// avgiftssträckor saknar den och har i stället gränsen i OMRÅDETS avgiftstext
// («… Max-P 4tim» vid S:t Eriks torg och Fyristorg). Skolområden bär dessutom
// «7-16 Tillstånd erfordras» enbart i områdestexten. Läste vi bara sträckan blev
// en skolparkering grön mitt på skoldagen. Områdestexterna är översatta EN gång,
// för hand, i OMRADESTEXTER nedan – uppslag på exakt sträng, okänd text ger
// «kontrollera skylten», aldrig en tolkning.
//
// ═══ FÄLLOR (alla ger tyst fel svar, inte felmeddelande) ═════════════════════
// 1. AXELORDNING. `inSR=4326` + envelope = **lng,lat**. Uppmätt 2026-09-15 kring
//    Svartbäcksgatan: rätt ordning 42 avgiftssträckor, omvänd ordning 0.
// 2. f=geojson GER KODERNA RÅA. Domänerna följer inte med i GeoJSON-svaret, bara
//    i lagrets metadata. Därför hämtas `?f=json` på varje lager och cachas.
// 3. MapServer-lagren i iExternaKartan/Trafik (216–218) SVARAR UTAN GEOMETRI på
//    query – attributen kommer, linjerna inte. Använd GOT_*-tjänsterna.
// 4. 26 OMRÅDESKODER SAKNAR OMRÅDESPOST (138 sträckor, mätt 2026-09-15). Där vet vi
//    varken priset eller om området har en tidsgräns → «kontrollera skylten».
//
// ═══ VAD UPPSALA INTE PUBLICERAR (kontrollerat 2026-09-15) ═══════════════════
//   · PARKERINGSFÖRBUD som eget lager. Förbud finns bara som restriktion på en
//     parkeringssträcka («Parkeringsförbud 23-06 alla dagar») – de tas med.
//   · STÄDDAGAR. Kommunen skyltar tillfälligt inför sandupptagning; inga fasta
//     servicedagar finns i någon tjänst. Appen säger därför ingenting om städning
//     i Uppsala – varken att det städas eller att det inte gör det.
//   · LASTPLATSERNAS TIDER på 117 av 121 lastplatser (fältet tomt). Föreskrifterna
//     visar att tomt betyder dygnet runt (4 av 4 lästa) → ANDAMAL_ALLTID, se lastplatsgrenen.
//   · OREGLERADE GATOR. Bara reglerade sträckor finns; resten ritas inte.

module.exports = function skapaUppsala(delade) {
  const { https, keepAliveAgent, send } = delade;

  const HOST = 'kartportal.uppsala.se';
  const BAS  = '/mapping/rest/services/iKommunkartan';
  const TTL  = 6 * 60 * 60 * 1000;          // domäner, områden och p-hus ändras sällan
  const RUT_TTL = 10 * 60 * 1000;           // sökrutor: kort, bara för lägesväxling
  const RUT_MAX = 60;
  const TAK = 2000;

  const LAGER = {
    avgift:     'GOT_Avgiftsparkeringar/FeatureServer/0',       // 1 351 sträckor
    avgiftsfri: 'GOT_Avgiftsfri_parkering/FeatureServer/1',     //   325
    samnyttjad: 'GOT_Samnyttjad_parkering/FeatureServer/1',     //   212
    rh:         'GOT_R%C3%B6relsehindrad/FeatureServer/0',      //   258
    mc:         'GOT_MC_parkering/FeatureServer/0',             //     7
    buss:       'GOT_Bussparkering/FeatureServer/1',            //    10
    lastbil:    'GOT_Lastbilsplats/FeatureServer/0',            //     4
    lastplats:  'GOT_Lastplats/FeatureServer/406'               //   121 ytor
  };
  const OMRADE_LAGER = 'GOT_Omradeskoder/FeatureServer/415';     //    95 områden
  // Fem av de 95 områdena är STADSZONER (A–E, dyrast→billigast) och täcker hela staden.
  // De övriga 90 är enskilda p-områden med eget pris – de ligger som HÅL i zonerna och
  // ska förbli hål (uppmätt 2026-09-19: 79 av 470 avgiftssträckor i centrum låg i ett hål,
  // t.ex. Stadshusgatan 36 kr/tim mitt i A–B). Fyller man hålen ljuger kartan om priset.
  const ZONKODER = [
    { kod: 18100, zon: 'A', ordning: 1 },
    { kod: 18200, zon: 'B', ordning: 2 },
    { kod: 18300, zon: 'C', ordning: 3 },
    { kod: 18400, zon: 'D', ordning: 4 },
    { kod: 18500, zon: 'E', ordning: 5 },
  ];
  const PHUS_LAGER   = 'GOT_Parkeringshus/FeatureServer/397';    //     4 garage

  // ── HTTP ───────────────────────────────────────────────────────────────────
  function hamtaJson(vag) {
    return new Promise((ok, nej) => {
      const r = https.request({ hostname: HOST, path: vag, method: 'GET', agent: keepAliveAgent },
        resp => {
          if (resp.statusCode !== 200) { resp.resume(); return nej(new Error('HTTP ' + resp.statusCode)); }
          let bit = '';
          resp.setEncoding('utf8');
          resp.on('data', d => bit += d);
          resp.on('end', () => {
            try {
              const j = JSON.parse(bit);
              // ArcGIS svarar med HTTP 200 även vid fel – felet ligger i kroppen.
              if (j && j.error) return nej(new Error('ArcGIS ' + (j.error.code || '') + ' ' + (j.error.message || '')));
              ok(j);
            } catch (e) { nej(e); }
          });
        });
      r.on('error', nej);
      r.setTimeout(20000, () => r.destroy(new Error('timeout')));
      r.end();
    });
  }

  // outSR: parkeringen i SWEREF 99 TM (EPSG:3011, meter) – samma som Stockholm och Göteborg
  // levererar. Klientens klippning, 12 m-närhet och täckningsgrad räknar i METER; får de
  // grader blir toleransen 12 GRADER och varje grön linje klipps bort av närmaste lastplats.
  // Uppmätt 2026-09-15 i första provet: 37 sträckor i centrum i stället för flera hundra.
  // Lagren är lagrade i 3011, så ingen omprojicering sker. P-husen vill ha lat/lng → 4326.
  function fragaLager(lager, bbox, outSR = 3011) {
    const q = `f=geojson&where=1%3D1&outFields=*&outSR=${outSR}&returnGeometry=true`
            + (bbox ? `&geometry=${bbox.join(',')}&geometryType=esriGeometryEnvelope&inSR=4326`
                    + '&spatialRel=esriSpatialRelIntersects' : '')
            + `&resultRecordCount=${TAK}`;
    return hamtaJson(`${BAS}/${lager}/query?${q}`).then(d => {
      const f = (d && d.features) || [];
      if (f.length >= TAK) console.warn(`[Uppsala] ${lager}: svaret nådde taket ${TAK} – sökrutan är för stor`);
      return f;
    });
  }

  // ── Domäner (fälla 2) ──────────────────────────────────────────────────────
  let domaner = null, domanTs = 0, domanInflight = null;
  function lasDomaner() {
    if (domaner && Date.now() - domanTs < TTL) return Promise.resolve(domaner);
    if (domanInflight) return domanInflight;
    domanInflight = Promise.all(Object.entries(LAGER).map(([namn, lager]) =>
      hamtaJson(`${BAS}/${lager}?f=json`).then(info => {
        const d = {};
        for (const f of (info.fields || []))
          if (f.domain && f.domain.codedValues)
            d[f.name] = new Map(f.domain.codedValues.map(c => [String(c.code), String(c.name)]));
        return [namn, d];
      })
    )).then(par => {
      domaner = Object.fromEntries(par); domanTs = Date.now();
      return domaner;
    }).finally(() => { domanInflight = null; });
    return domanInflight;
  }
  // Kod → text. Ett fält utan domän är redan text. En kod som INTE finns i domänen
  // blir null – den får aldrig passera som siffra och tolkas av någon parser.
  function avkoda(dom, falt, v) {
    if (v == null || v === '') return null;
    const d = dom && dom[falt];
    if (!d) return String(v).trim() || null;
    const t = d.get(String(v));
    return t == null ? null : t.trim();
  }

  // ═══ TOLKNING ══════════════════════════════════════════════════════════════
  const KLASSER = ['vardag-ej-dagfore', 'dagfore', 'sonhelg'];

  // «8» / «08» / «24» → 800 / 800 / 2400. Minuter förekommer inte i Uppsalas koder.
  function klock(s) {
    const n = +s;
    return Number.isInteger(n) && n >= 0 && n <= 24 ? n * 100 : null;
  }
  // «8-18» → [800, 1800]
  function fonster(s) {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const a = klock(m[1]), b = klock(m[2]);
    return a == null || b == null ? null : [a, b];
  }
  // Skyltformen «A (B) C», där B och C kan saknas. Svar: { vardag-ej-dagfore:[a,b], … }
  // eller null om texten inte har exakt den formen. En klass som saknas finns inte i
  // svaret – vad det BETYDER avgör anroparen, inte den här funktionen.
  function klassFonster(s) {
    const m = /^(\d{1,2}-\d{1,2})?(?:\s*\((\d{1,2}-\d{1,2})\))?(?:\s+(\d{1,2}-\d{1,2}))?$/.exec(String(s || '').trim());
    if (!m || !(m[1] || m[2])) return null;
    const ut = {};
    for (let i = 0; i < 3; i++) {
      if (!m[i + 1]) continue;
      const f = fonster(m[i + 1]);
      if (!f) return null;
      ut[KLASSER[i]] = f;
    }
    return ut;
  }
  const regler = kf => KLASSER.filter(k => kf[k]).map(k => [k, kf[k][0], kf[k][1]]);

  // «2 tim 8-18 (8-18) 8-18» → { min: 120, regler: {r:[…]} | null }
  // «5 min övrig tid»         → { ovrigTid: 5 }  (se byggPost)
  function tolkaTidsgrans(txt) {
    if (!txt) return null;
    const m = /^(\d+)\s*(min|tim)(?:\s+(.+))?$/.exec(txt.trim());
    if (!m) return { okand: txt };
    const min = +m[1] * (m[2] === 'tim' ? 60 : 1);
    if (!m[3]) return { min, regler: null };
    if (/^övrig tid$/i.test(m[3].trim())) return { ovrigTid: min };
    const kf = klassFonster(m[3]);
    if (!kf) return { okand: txt };
    // «24 tim 00-24» = hela dygnet alla dagar som skrivits – ingen fönsterbegränsning.
    return { min, regler: { r: regler(kf) } };
  }

  // Tillåten parkering «18-07 (00-24) 00-24» → förbudsfönstret per dagklass.
  // null = gäller dygnet runt (inget förbud) · 'okand' = formen går inte att läsa.
  // En klass som SAKNAS i en tillåtelse går inte att tolka säkert – tillåten ingen gång
  // den dagen, eller inte angiven? Då läses posten inte alls.
  function forbudUrTillaten(txt) {
    if (!txt) return 'okand';
    const kf = klassFonster(txt);
    if (!kf || KLASSER.some(k => !kf[k])) return 'okand';
    const r = [];
    for (const k of KLASSER) {
      const [a, b] = kf[k];
      if (a === 0 && b === 2400) continue;           // hela dygnet tillåtet
      if (a === b) return 'okand';
      // Komplementet till [a,b) är [b,a) – vänder över midnatt när a < b.
      r.push([k, b === 2400 ? 0 : b, a]);
    }
    return r.length ? { r } : null;
  }

  // ── Restriktioner: exakt sträng → vad den gör ─────────────────────────────
  // Hela domänen (37 värden) plus fritextvarianter som ligger i `Restriktioner`.
  // Läst och översatt för hand 2026-09-15. Tre sorters svar:
  //   fordon   – platsen gäller bara ett annat fordon → lila «ej för dig»
  //   andamal  – ett fönster då platsen inte är vanlig parkering (VF_PLATS_TYP-kod)
  //   hoppa    – kan inte uttryckas säkert → sträckan ritas INTE (tystnad = vet inte)
  // En restriktion som inte står här ger också `hoppa`, och loggas.
  const A_LAST = '7', A_FORBUD = '901', A_TILLSTAND = '902', A_KORT = '903';
  const alla = (a, b) => ({ r: [['alla', a, b]] });
  const RESTRIKTIONER = {
    'Endast personbil klass I': {},
    'Endast personbil klass |': {},                                  // så står det i områdeslagret
    '4 tim eller tillstånd': { min: 240 },
    'Bilpool': { fordon: 'bilpool' },
    'Endast buss': { fordon: 'buss' },
    'Endast buss i linjetrafik': { fordon: 'buss' },
    'Endast foodtruck': { fordon: 'foodtruck' },
    'Endast lastbil': { fordon: 'lastbil' },
    'Endast tung lastbil och släpkärra': { fordon: 'lastbil' },
    'Endast verksamhetsfordon': { fordon: 'verksamhetsfordon' },
    'Personbil klass II': { fordon: 'personbil klass II' },
    'Endast personbil klass II': { fordon: 'personbil klass II' },
    'Personbil med släp': { fordon: 'personbil med släp' },
    'Endast personbil med släp': { fordon: 'personbil med släp' },
    'Skoltaxi': { fordon: 'skoltaxi' },
    'Skoltaxi 7-16. Parkeringsförbud övrig tid': { fordon: 'skoltaxi' },
    'Tillstånd A': { fordon: 'tillstånd A' },
    'Tillstånd B': { fordon: 'tillstånd B' },
    'Tillstånd C': { fordon: 'tillstånd C' },
    // Lastplats med tider. «alla dagar» uttryckligen → alla. Utan det: skyltkonventionen.
    'Lastplats 06-18':            { andamal: A_LAST, regler: { r: [['vardag-ej-dagfore', 600, 1800]] } },
    'Lastplats 7-17':             { andamal: A_LAST, regler: { r: [['vardag-ej-dagfore', 700, 1700]] } },
    'Lastplats 7-19':             { andamal: A_LAST, regler: { r: [['vardag-ej-dagfore', 700, 1900]] } },
    'Lastplats 7-18 (7-18)':      { andamal: A_LAST, regler: { r: [['vardag-ej-dagfore', 700, 1800], ['dagfore', 700, 1800]] } },
    'Lastplats 6-16 alla dagar':  { andamal: A_LAST, regler: alla(600, 1600) },
    'Lastplats 06-16 alla dagar': { andamal: A_LAST, regler: alla(600, 1600) },
    'Parkeringsförbud 23-06 alla dagar': { andamal: A_FORBUD, regler: alla(2300, 600) },
    'Parkeringsförbud 5-18':      { andamal: A_FORBUD, regler: { r: [['vardag-ej-dagfore', 500, 1800]] } },
    'Parkeringsförbud 8-18':      { andamal: A_FORBUD, regler: { r: [['vardag-ej-dagfore', 800, 1800]] } },
    'Parkeringsförbud tisdagar 6-18': { andamal: A_FORBUD, regler: { r: [['tisdag', 600, 1800]] } },
    'P-förbud tisdagar 6-18':     { andamal: A_FORBUD, regler: { r: [['tisdag', 600, 1800]] } },
    'Tillstånd 7-16': { andamal: A_TILLSTAND, regler: { r: [['vardag-ej-dagfore', 700, 1600]] } },
    'Parkering får endast ske med giltigt tillstånd och erlagd avgift mellan 7-16':
                      { andamal: A_TILLSTAND, regler: { r: [['vardag-ej-dagfore', 700, 1600]] } },
    // Förbud utanför tillåten tid – fönstret kommer redan ur `Tillatenparkering`.
    'Parkeringsförbud övrig tid': { kraverTillaten: true },
    // Kan inte uttryckas säkert (säsong, fordon i ett fönster, inte för allmänheten).
    'Endast besökande till brandstationen': { hoppa: 'inte för allmänheten' },
    'Endast media': { hoppa: 'inte för allmänheten' },
    'Endast personal': { hoppa: 'inte för allmänheten' },
    'Personalparkering': { hoppa: 'inte för allmänheten' },
    'Förhyrd': { hoppa: 'förhyrd' },
    'Reserverad': { hoppa: 'reserverad' },
    'Endast buss 9-15': { hoppa: 'fordonskrav i ett fönster' },
    'Taxiplats övrig tid': { hoppa: 'taxiplats med okänt fönster' },
    'Parkering endast tillåten mellan 1/4 - 31/10. Parkeringsförbud övrig tid': { hoppa: 'säsong' },
    'Parkeringsförbud 1/5 - 31/9': { hoppa: 'säsong' },
    'Under tiden 1 april - 30 september får endast tvåhjulig motorcykel och moped klass I utan sidvagn parkeras under högst 4 tim i följd.': { hoppa: 'säsong' },
    'Under tiden 1 april - 30 september får endast tvåhjulig motorcykel och moped klass I utan sidvagn parkeras under högst 4 tim i följd': { hoppa: 'säsong' }
  };
  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  // ── Områdestexter: exakt sträng → tidsgräns / tillståndsfönster ────────────
  // Alla 58 texter i GOT_Omradeskoder 2026-09-15, lästa för hand. Priset står kvar
  // ordagrant på kortet (kommunens formulering), här översätts bara det som ändrar
  // FÄRGEN: en «Max-P» och ett fönster då bara tillståndshavare får stå.
  // {} = bara pris, inget som påverkar lagligheten.
  const MAX24 = { min: 1440 };
  const TILLST_7_16 = { tillstand: { r: [['vardag-ej-dagfore', 700, 1600]] } };
  const OMRADESTEXTER = {
    '8-18 (8-18) 20kr/tim i 2 timmar därefter 35kr/tim; 18-24 (18-24) 5kr/tim; Max-P 4tim': { min: 240 },
    '8-18 (8-18) 20kr/tim; 18-24 (18-24) 5kr/tim; Max-P 24tim': MAX24,
    '8-18 (8-18) 15kr/tim; 18-24 (18-24) 5kr/tim; Max-P 24tim': MAX24,
    'Alla dagar 9-24 5kr/tim; 20kr/dygn; 100kr/7dygn; Max-P 7 dygn': { min: 10080 },
    'Alla dagar 7-23 9kr/tim; 23-7 2kr/tim; Max-P 24tim': MAX24,
    'Alla dagar 9-24 5kr/tim; Max-P 24tim': MAX24,
    'Måndag-Fredag 20kr/dygn; Månadsbiljett 400kr; 1200kr/90dagar; 2400kr/180dagar; Årsbiljett 4400kr': {},
    'Måndag-Fredag 5-24 30kr/tim i 2 timmar därefter 40kr/tim; Lördag-Söndag 5-24 30kr/tim. Max-P 24tim': MAX24,
    'Måndag-Fredag 5-15 20kr/tim; 15-24 10kr/tim; Lördag-Söndag 8-24 10kr/tim; Max-P 24tim': MAX24,
    '3 timmar 0kr därefter ordinarie taxa: Alla dagar 05-19 36kr/tim; 19-05 9kr/tim; 220kr/dygn; Max-P 14 dygn': { min: 20160 },
    'Alla dagar 0-24 30kr/tim; 220kr/dygn; Max-P 3 dygn': { min: 4320 },
    '3 timmar 0kr därefter ordinarie taxa;': {},
    '8-24 (8-24) 5kr/tim; Max-P 24tim': MAX24,
    '8-18 15kr/tim; 18-8 5kr/tim; Max-P 7 dygn': { min: 10080 },
    'Alla dagar 8-18 27kr/tim; 18-8 12 kr/tim; Max-P 24tim': MAX24,
    'Alla dagar 5-19 36kr/tim; 19-5 9kr/tim; 220kr/dygn; Max-P 14 dygn': { min: 20160 },
    '8-18 (8-18) 10kr/tim; Max-P 24tim': MAX24,
    'Alla dagar 0-24 48 kr/tim i 4 timmar därefter 12 kr/tim; Max-P 7 dygn': { min: 10080 },
    '8-18 (8-18) 36 kr/tim; 18-24 (18-24) 9 kr/tim; Max-P 24tim': MAX24,
    '8-18 (8-18) 10kr/tim; 18-24 (18-24) 5kr/tim; Max-P 24tim': MAX24,
    'Alla dagar 0-24 10kr/tim; 80kr/dygn; 685kr/30 dygn': {},
    '3 timmar 0kr därefter ordinarie taxa': {},
    '8-18 15kr/tim; 18-8 5kr/tim; Max-P 24tim': MAX24,
    '7-16 Tillstånd erfodras; 16-18 (8-18) 20 kr/tim i 2 tim Därefter 35 kr/tim 18-24 (18-24) 5kr/tim': TILLST_7_16,
    '8-18 (8-18) 20 kr/ timme i 2 timmar därefter 35 kr/timme; 18-24 (18-24) 5 kr/timme; Max-P 24tim': MAX24,
    '3 timmar 0kr; Därefter 8-18 (8-18) 20 kr/tim 18-24 (18-24) 5kr/tim': {},
    '7-16 Tillstånd erfodras; 16-18 (8-18) 20kr/tim; 18-24 (18-24) 5kr/tim': TILLST_7_16,
    '7-16 Tillstånd erfodras; 16-18 (8-18) 15kr/tim; 18-24 (18-24) 5kr/tim': TILLST_7_16,
    '3 timmar 0kr; Därefter 8-18 (8-18) 15 kr/tim; 18-24 (18-24) 5kr/tim;': {},
    '7-16 Tillstånd erfodras; 16-18 (8-18) 10kr/tim; 18-24 (18-24) 5kr/tim': TILLST_7_16,
    '3 timmar 0kr; Därefter 8-18 (8-18) 10 kr/tim; 18-24 (18-24) 5kr/tim': {},
    'Alla dagar 8-18 10kr/tim; 18-8 5kr/tim; Max-P 24 tim.': MAX24,
    // «15 min eller tillstånd» är en TIDSGRÄNS i fönstret, inte ett förbud: den som
    // saknar tillstånd får stå 15 minuter.
    '7-16 15 min eller tillstånd erfodras; 16-18 (8-18) 10kr/tim; 18-24 (18-24) 5kr/tim':
      { min: 15, regler: { r: [['vardag-ej-dagfore', 700, 1600]] } },
    '6-18 Endast skolverksamhet; 18-24 (18-24) 5kr/tim; (8-18) 10kr/tim;':
      { tillstand: { r: [['vardag-ej-dagfore', 600, 1800]] } },
    'Alla dagar 00-24 5kr/tim': {},
    '8-18 (8-18) 10 kr/timme 18-24 (18-24) 5 kr/timme': {},
    'Alla dagar; 3 timmar 0kr; Därefter 0-24 10 kr/tim;': {},
    'Alla dagar; 0-24 10 kr/tim; 12-18 1 timmes parkering': { min: 60, regler: { r: [['alla', 1200, 1800]] } },
    'Alla dagar; 0-24 10 kr/tim': {},
    'Alla dagar; 3 timmar 0kr; Därefter 0-24 10 kr/tim': {},
    'Alla dagar; 0-24 10 kr/tim;': {},
    'alla dagar 00-24 5 kr/tim': {},
    '7-16 Tillstånd erfodras; 16-18 (8-18) 20kr/tim 18-24 (18-24) 5kr/tim': TILLST_7_16,
    '5kr/tim 8-24 (8-24)': {},
    '8-18 10 kr/tim 18-8 5 kr/tim; Avgift dygnet runt.': {},
    '8-18 (8-18) 10 kr/tim; 18-24 (18-24) 5 kr/tim': {},
    '8-18 (8-18) 20 kr/tim; 18-24 (18-24) 5 kr/tim': {},
    '5 kr/tim 8-24 (8-24)': {},
    '8-18 (8-18) 15 kr/tim; 18-24 (18-24) 5 kr/tim': {},
    '7-16 Tillstånd erfordras; 16-24 (8-24) 5kr/tim': TILLST_7_16,
    '3 timmar 0kr; Därefter 8-18 (8-18) 5 kr/tim; 18-24 (18-24) 5kr/tim': {},
    '5 kr/timme': {},
    '3 timmar 0kr; Därefter ordinarie taxa; Max-P 24tim': MAX24,
    '3 timmar 0kr därefter ordinarie taxa: Alla dagar 00-24 30kr/tim; 220kr/dygn; Max-P 3 dygn': { min: 4320 },
    'Alla dagar 00-24 5kr/tim; 20kr/dygn; 100kr/7 dygn; Max-P 7 dygn': { min: 10080 },
    '(06-16)': {}
  };

  // ── Områden (cachas) ───────────────────────────────────────────────────────
  let omraden = null, omradeTs = 0, omradeInflight = null;
  function lasOmraden() {
    if (omraden && Date.now() - omradeTs < TTL) return Promise.resolve(omraden);
    if (omradeInflight) return omradeInflight;
    omradeInflight = fragaLager(OMRADE_LAGER, null).then(fs => {
      const m = new Map();
      let okanda = 0;
      for (const f of fs) {
        const p = f.properties || {};
        if (p.Omradeskod == null) continue;
        const text = norm(p.Avgiftstext);
        const tolk = OMRADESTEXTER[text];
        if (!tolk) okanda++;
        // Samma kod förekommer två gånger (18503, 182111, 182117) med identisk text.
        if (!m.has(String(p.Omradeskod))) m.set(String(p.Omradeskod), { text, tolk: tolk || null, namn: norm(p.Omradesnamn) });
      }
      console.log(`[Uppsala] områden: ${m.size} inlästa` + (okanda ? `, ${okanda} med OKÄND avgiftstext → kontrollera skylten` : ''));
      omraden = m; omradeTs = Date.now();
      return m;
    }).finally(() => { omradeInflight = null; });
    return omradeInflight;
  }

  // ── Geometri ───────────────────────────────────────────────────────────────
  const linjerUr = g => {
    if (!g) return [];
    if (g.type === 'LineString') return g.coordinates.length >= 2 ? [g.coordinates] : [];
    if (g.type === 'MultiLineString') return g.coordinates.filter(l => l.length >= 2);
    return [];
  };
  // Lastplatserna är YTOR. Appen ritar bara linjer för dem, så ytan blir sin långsida:
  // minsta omskrivna rektangel, mittlinjen längs den långa sidan. Samma metod som
  // klientens bayLines/minAreaRect, flyttad hit för att en lastplats annars inte ritas
  // alls – och då klipps heller inte den gröna gatan runt den. Koordinaterna är meter.
  function ytaTillLinje(g) {
    const ring = g && (g.type === 'Polygon' ? g.coordinates[0]
                     : g.type === 'MultiPolygon' ? g.coordinates[0] && g.coordinates[0][0] : null);
    if (!ring || ring.length < 4) return null;
    const mx = 1, my = 1;
    const p = ring.map(c => [(c[0] - ring[0][0]) * mx, (c[1] - ring[0][1]) * my]);
    let bast = null;
    for (let i = 0; i < p.length - 1; i++) {
      const ang = Math.atan2(p[i + 1][1] - p[i][1], p[i + 1][0] - p[i][0]);
      const c = Math.cos(ang), s = Math.sin(ang);
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const q of p) {
        const u = q[0] * c + q[1] * s, v = -q[0] * s + q[1] * c;
        if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
      const yta = (u1 - u0) * (v1 - v0);
      if (!bast || yta < bast.yta) bast = { yta, ang, u0, u1, v0, v1 };
    }
    if (!bast) return null;
    const { ang, u0, u1, v0, v1 } = bast;
    const lang = (u1 - u0) >= (v1 - v0);
    const c = Math.cos(ang), s = Math.sin(ang);
    const tillGrad = (u, v) => [ring[0][0] + (u * c - v * s) / mx, ring[0][1] + (u * s + v * c) / my];
    const [a, b] = lang
      ? [tillGrad(u0, (v0 + v1) / 2), tillGrad(u1, (v0 + v1) / 2)]
      : [tillGrad((u0 + u1) / 2, v0), tillGrad((u0 + u1) / 2, v1)];
    if (Math.hypot((b[0] - a[0]) * mx, (b[1] - a[1]) * my) < 2) return null;
    return [a, b];
  }

  // ═══ BYGG P_TILLATEN-POSTER ════════════════════════════════════════════════
  // Slår ihop två regelsamlingar till en utan dubbletter.
  const slaIhop = (a, b) => {
    if (!a) return b; if (!b) return a;
    const sett = new Set(), r = [];
    for (const x of a.r.concat(b.r)) { const k = x.join('|'); if (!sett.has(k)) { sett.add(k); r.push(x); } }
    return { r };
  };
  const statistik = () => ({ in: 0, ut: 0, hoppade: {} });

  function byggPost(lagerNamn, f, dom, omr, stat) {
    stat.in++;
    const p = f.properties || {};
    const hoppa = orsak => { stat.hoppade[orsak] = (stat.hoppade[orsak] || 0) + 1; return null; };
    const ls = lagerNamn === 'lastplats' ? [ytaTillLinje(f.geometry)].filter(Boolean) : linjerUr(f.geometry);
    if (!ls.length) return hoppa('ingen ritbar geometri');

    const d = dom[lagerNamn] || {};
    const tidTxt   = avkoda(d, 'Tidsbegransning', p.Tidsbegransning);
    const tillTxt  = avkoda(d, 'Tillatenparkering', p.Tillatenparkering);
    const avgTxt   = avkoda(d, 'Avgiftsplikt', p.Avgiftsplikt);
    const typTxt   = avkoda(d, 'Parkeringstyp', p.Parkeringstyp);
    // Kodad restriktion först; saknas den, fritextfältet (samma innehåll i praktiken).
    const restrTxt = norm(avkoda(d, 'Restriktion', p.Restriktion) || p.Restriktioner || '');

    const props = {
      STREET_NAME: norm(p.Adress || p.Gatunamn || ''),
      VEHICLE: 'fordon',
      VF_PLATS_TYP: 'P',
      PARKING_RATE: '',
      MAX_MINUTES: null, MAX_HOURS: null, MAX_DAYS: null,
      // Stockholms fält för tid/dag lämnas tomma: Uppsalas fönster bär flera dagklasser
      // och går i MAXTID_REGLER / ANDAMAL_REGLER (se toAllowedSegment i index.html).
      START_TIME: null, END_TIME: null, START_WEEKDAY: '', DAY_TYPE: '',
      START_MONTH: null, START_DAY: null, END_MONTH: null, END_DAY: null,
      VF_METER: null,
      VF_PLATSER: p.AntalPlatser != null ? p.AntalPlatser : null,
      CITATION: '',
      UPPSALA_LAGER: lagerNamn
    };
    let maxMin = null, maxRegler = null, andamal = null, andamalRegler = null, kontrollera = null;

    // ── Lager → fordon och platstyp ──────────────────────────────────────────
    if (lagerNamn === 'rh')      { props.VEHICLE = 'rörelsehindrade'; props.VF_PLATS_TYP = 'Reserverad p-plats rörelsehindrade'; }
    if (lagerNamn === 'mc')      { props.VEHICLE = 'motorcykel';      props.VF_PLATS_TYP = 'Reserverad p-plats motorcykel'; }
    if (lagerNamn === 'buss')    { props.VEHICLE = 'buss';            props.VF_PLATS_TYP = 'Reserverad p-plats buss'; }
    if (lagerNamn === 'lastbil') { props.VEHICLE = 'lastbil';         props.VF_PLATS_TYP = 'Reserverad p-plats lastbil'; }
    if (lagerNamn === 'samnyttjad' && /laddplats/i.test(typTxt || '')) return hoppa('samnyttjad laddplats');

    // ── Lastplatsytorna ──────────────────────────────────────────────────────
    if (lagerNamn === 'lastplats') {
      props.STREET_NAME = norm(p.Gatunamn || '');
      props.VF_PLATS_TYP = A_LAST;
      const r = norm(p.Restriktio);
      const LASTPLATS_TIDER = {
        '8-18':        { r: [['vardag-ej-dagfore', 800, 1800]] },
        '7-18':        { r: [['vardag-ej-dagfore', 700, 1800]] },
        '7-18 (7-18)': { r: [['vardag-ej-dagfore', 700, 1800], ['dagfore', 700, 1800]] },
        '7-17. Parkering övrig tid 1 tim.': { r: [['vardag-ej-dagfore', 700, 1700]] }
      };
      if (!r) {
        // 117 av 121 saknar tid. Tomt betyder «dygnet runt» – LÄST i föreskrifterna, inte
        // gissat. 2026-09-15, fyra föreskrifter i tre stadsdelar och tre årtal, alla utan
        // klockslag: 0380 2016-00593 (Väktargatan), 0380 2020:224 (Skolgatan),
        // 0380 2025:424 och 0380 2025:450 (Rosendalsvägen). Samma dag två skyltar på
        // Skolgatan (Lars, Street View): «Lastplats» respektive «På- och avstigningsplats»,
        // båda med förbud att stanna och parkera och utan tid.
        // ⚠ Lagret kallar ALLA 121 «Lastplats» – även på- och avstigningsplatser. Färgen
        // blir rätt (ingen av dem är parkering), men kortets ord kan vara fel sort.
        props.ANDAMAL_ALLTID = true;
      } else if (LASTPLATS_TIDER[r]) {
        props.ANDAMAL_REGLER = LASTPLATS_TIDER[r];
        if (/övrig tid 1 tim/.test(r)) props.MAX_MINUTES = 60;
      } else {
        return hoppa('lastplats med okänd tid: ' + r);
      }
      stat.ut++;
      return ls.map(l => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: l } }));
    }

    // ── Tillåten tid → förbudsfönster ────────────────────────────────────────
    const fb = forbudUrTillaten(tillTxt);
    if (fb === 'okand') return hoppa('tillåten tid går inte att läsa: ' + tillTxt);

    // ── Tidsgräns på sträckan ────────────────────────────────────────────────
    const tg = tolkaTidsgrans(tidTxt);
    if (tg && tg.okand) return hoppa('tidsgräns går inte att läsa: ' + tg.okand);
    if (tg && tg.ovrigTid != null) {
      // «5 min övrig tid»: utanför tillåten tid får man stå några minuter. För appen är
      // fönstret ändå inte en plats att lämna bilen – en egen etikett säger vad det är.
      if (!fb) return hoppa('övrig tid utan fönster');
      andamal = A_KORT; andamalRegler = fb;
    } else if (tg) {
      maxMin = tg.min; maxRegler = tg.regler;
    }

    // ── Restriktion ──────────────────────────────────────────────────────────
    if (restrTxt) {
      const rr = RESTRIKTIONER[restrTxt];
      if (!rr) return hoppa('okänd restriktion: ' + restrTxt);
      if (rr.hoppa) return hoppa(rr.hoppa);
      if (rr.kraverTillaten && !fb) return hoppa('förbud övrig tid utan tillåtet fönster');
      if (rr.fordon) props.VEHICLE = rr.fordon;
      if (rr.min != null && maxMin == null) maxMin = rr.min;
      if (rr.andamal) {
        if (andamal && andamal !== rr.andamal) return hoppa('två olika ändamål');
        andamal = rr.andamal; andamalRegler = slaIhop(andamalRegler, rr.regler);
      }
    }
    // Förbud ur tillåten tid som inte redan bärs av ett ändamål ovan.
    if (fb) {
      if (andamal) andamalRegler = slaIhop(andamalRegler, fb);
      else { andamal = A_FORBUD; andamalRegler = fb; }
    }

    // ── Område: pris, tidsgräns, tillståndsfönster ──────────────────────────
    const harOmrade = p.Omradeskod != null && p.Omradeskod !== '';
    if (harOmrade) {
      const o = omr.get(String(p.Omradeskod));
      if (!o) {
        kontrollera = 'Villkoren för det här området står inte i stadens data – läs skylten.';
      } else {
        props.PARKING_RATE = o.text;
        if (!o.tolk) {
          kontrollera = 'Områdets villkor kunde inte läsas – läs skylten.';
        } else {
          if (maxMin == null && o.tolk.min != null) { maxMin = o.tolk.min; maxRegler = o.tolk.regler || null; }
          if (o.tolk.tillstand) {
            // Har sträckan en tidsgräns i SAMMA fönster är fönstret en korttidsgräns
            // («30 min 7-16»), inte ett förbud – då gäller den, inte tillståndskravet.
            const sammaFonster = maxRegler && JSON.stringify(maxRegler) === JSON.stringify(o.tolk.tillstand);
            if (!sammaFonster) {
              if (andamal && andamal !== A_TILLSTAND) return hoppa('tillstånd och annat ändamål');
              andamal = A_TILLSTAND; andamalRegler = slaIhop(andamalRegler, o.tolk.tillstand);
            }
          }
        }
      }
    }
    // Samma princip för sträckans egen «Tillstånd 7-16» som för områdets.
    if (andamal === A_TILLSTAND && maxRegler && JSON.stringify(maxRegler) === JSON.stringify(andamalRegler)) {
      andamal = null; andamalRegler = null;
    }

    if (!props.PARKING_RATE) {
      if (lagerNamn === 'avgiftsfri' || typTxt === 'Avgiftsfri') props.PARKING_RATE = 'avgiftsfri';
      else if (avgTxt && avgTxt !== 'Ingen') props.PARKING_RATE = /^avgiftsplikt/i.test(avgTxt) ? 'Avgift under tillåten tid' : 'Avgift ' + avgTxt;
    }
    if (lagerNamn === 'avgift') {
      props.VF_PLATS_TYP = avkoda(d, 'Boendetaxa', p.Boendetaxa) === 'Ja' ? 'P Avgift, boende' : 'P Avgift';
    }
    if (andamal && props.VF_PLATS_TYP === 'P' || andamal && /^P Avgift/.test(props.VF_PLATS_TYP)) {
      props.VF_PLATS_TYP = andamal;
      props.ANDAMAL_REGLER = andamalRegler;
    } else if (andamal) {
      // Reserverade platser (RH, MC, buss, lastbil) behåller sin platstyp – de är redan
      // lila för den som inte får stå där. Fönstret skulle inte ändra färgen.
    }
    if (maxMin != null) {
      if (maxMin % 1440 === 0) props.MAX_DAYS = maxMin / 1440;
      else if (maxMin % 60 === 0) props.MAX_HOURS = maxMin / 60;
      else props.MAX_MINUTES = maxMin;
      if (maxRegler) props.MAXTID_REGLER = maxRegler;
    }
    if (kontrollera) props.KONTROLLERA_SKYLT = kontrollera;

    stat.ut++;
    return ls.map(l => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: l } }));
  }

  // ── Sökrute-cache ──────────────────────────────────────────────────────────
  const rutor = new Map();
  const nyckelFor = b => b.map(v => v.toFixed(5)).join(',');
  function ruteCache(k) {
    const t = rutor.get(k);
    if (!t) return null;
    if (Date.now() - t.nar > RUT_TTL) { rutor.delete(k); return null; }
    return t.data;
  }
  function spara(k, data) {
    if (rutor.size >= RUT_MAX) rutor.delete(rutor.keys().next().value);
    rutor.set(k, { nar: Date.now(), data });
  }

  async function byggTillaten(bbox) {
    const k = nyckelFor(bbox);
    const traff = ruteCache(k);
    if (traff) return { features: traff, varm: true };
    const [dom, omr] = await Promise.all([lasDomaner(), lasOmraden()]);
    const namn = Object.keys(LAGER);
    const svar = await Promise.all(namn.map(n => fragaLager(LAGER[n], bbox)));
    const ut = [], stat = statistik();
    namn.forEach((n, i) => {
      for (const f of svar[i]) {
        const poster = byggPost(n, f, dom, omr, stat);
        if (poster) ut.push(...poster);
      }
    });
    const hopp = Object.entries(stat.hoppade).map(([o, c]) => `${c}× ${o}`).join('; ');
    console.log(`[Uppsala] tillåten: ${stat.in} poster → ${stat.ut} ritade (${ut.length} linjer)` + (hopp ? ` · ej ritade: ${hopp}` : ''));
    spara(k, ut);
    return { features: ut, varm: false };
  }

  // ═══ PARKERINGSHUS ═════════════════════════════════════════════════════════
  // Fyra kommunala garage. Lagret saknar namnfält. Namnet hämtas ur OMRÅDESLAGRET via
  // första områdeskoden i `Regler` («Område 18511: …» → «Besöksparkering - Dansmästaren
  // | 18511» → «Dansmästaren»). Webbadressen bär också namnet men utan å/ä/ö
  // («dansmastaren») – den används bara när området saknas, och då står den med versal
  // som den är. Priset står i fritext per område och räknas INTE ut här – då visar
  // kortet ingen prisrad hellre än en gissad.
  let phusCache = null, phusTs = 0, phusInflight = null;
  function omradesNamn(omr, kod) {
    const namnFalt = omr && omr.get(String(kod)) && omr.get(String(kod)).namn;
    if (!namnFalt) return null;
    return namnFalt.split('|')[0].replace(/^\s*(Besöksparkering|Rörelsehindrad)\s*-\s*/i, '').trim() || null;
  }
  function byggPhus() {
    if (phusCache && Date.now() - phusTs < TTL) return Promise.resolve(phusCache);
    if (phusInflight) return phusInflight;
    phusInflight = Promise.all([fragaLager(PHUS_LAGER, null, 4326), lasOmraden()]).then(([fs, omr]) => {
      const ut = [];
      for (const f of fs) {
        const p = f.properties || {};
        const c = f.geometry && f.geometry.type === 'Point' ? f.geometry.coordinates : null;
        if (!c) continue;
        const koder = [...String(p.Regler || '').matchAll(/Område\s+(\d+)/g)].map(m => m[1]);
        const slug = (/\/([a-z0-9åäö-]+)\/?$/i.exec(String(p.Lank || '')) || [])[1] || '';
        const namn = koder.map(k => omradesNamn(omr, k)).find(Boolean)
                  || (slug ? slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ') : 'Parkeringshus');
        ut.push({
          Name: namn, Adress: null, Agare: 'Uppsala Parkerings AB',
          Anlaggningstyp: 'Garage',
          AntalBesokPlatser: +p.AntAP || 0,
          AdressLatitud: c[1], AdressLongitud: c[0],
          BesokstaxaCollection: [], ZonkodCollection: [],
          UPPSALA_REGLER: norm(p.Regler) || null,
          UPPSALA_MAXPTID: p.MaxPTid || null
        });
      }
      console.log(`[Uppsala] parkeringshus: ${ut.length} inlästa`);
      phusCache = ut; phusTs = Date.now();
      return ut;
    }).finally(() => { phusInflight = null; });
    return phusInflight;
  }

  // ── Zoner (cachas) ─────────────────────────────────────────────────────────
  // Klienten kan inte hämta kartportalen själv: den skickar ingen CORS-header, så
  // webbläsaren blockerar svaret (prövat 2026-09-19). Därför denna väg.
  // outSR 4326: zonerna används bara för att RITA, aldrig för prisuppslag – Uppsalas
  // pris kommer per sträcka (PARKING_RATE). Klientens toLatLng klarar båda systemen.
  let zonCache = null, zonTs = 0, zonInflight = null;
  function byggZoner() {
    if (zonCache && Date.now() - zonTs < TTL) return Promise.resolve({ zoner: zonCache, varm: true });
    if (zonInflight) return zonInflight;
    const koder = ZONKODER.map(z => z.kod).join(',');
    zonInflight = hamtaJson(`${BAS}/${OMRADE_LAGER}/query?f=geojson&where=`
        + encodeURIComponent(`Omradeskod IN (${koder})`)
        + '&outFields=Omradeskod,Omradesnamn,Avgiftstext&outSR=4326&returnGeometry=true')
      .then(d => {
        const ut = [];
        for (const f of (d && d.features) || []) {
          const rad = ZONKODER.find(z => z.kod === +(f.properties || {}).Omradeskod);
          if (!rad || !f.geometry) continue;
          ut.push({ type: 'Feature', geometry: f.geometry,
                    properties: { ZON: rad.zon, ORDNING: rad.ordning, PRIS: norm(f.properties.Avgiftstext) } });
        }
        // Saknas en zon ritar vi hellre inga alls än fyra av fem: en stad där B saknas
        // ser ut som att B är gratis. Tomt svar = appen ritar bara gatorna, som förut.
        if (ut.length !== ZONKODER.length) {
          console.warn(`[Uppsala] zoner: fick ${ut.length} av ${ZONKODER.length} – ritar inga`);
          return { zoner: [], varm: false };
        }
        console.log(`[Uppsala] zoner: ${ut.length} inlästa`);
        zonCache = ut; zonTs = Date.now();
        return { zoner: ut, varm: false };
      }).finally(() => { zonInflight = null; });
    return zonInflight;
  }

  // ── Vägar ──────────────────────────────────────────────────────────────────
  const fel = (res, kod, txt) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: txt }));
  };
  function tolkaBbox(s) {
    const d = String(s || '').split(',').map(Number).slice(0, 4);
    return d.length === 4 && d.every(Number.isFinite) ? d : null;
  }

  function hantera(reqUrl, req, res) {
    if (reqUrl.pathname === '/uppsala/wfs-tillaten') {
      const bbox = tolkaBbox(reqUrl.searchParams.get('BBOX') || reqUrl.searchParams.get('bbox'));
      if (!bbox) return fel(res, 400, 'BBOX=minLng,minLat,maxLng,maxLat krävs'), true;
      byggTillaten(bbox).then(({ features, varm }) => {
        send(req, res, 200, 'application/json; charset=utf-8',
             Buffer.from(JSON.stringify({ type: 'FeatureCollection', features })), varm ? 'HIT' : 'MISS');
      }).catch(e => { console.warn('[Uppsala] tillåten:', e.message); fel(res, 502, 'Uppsalas parkeringsdata otillgänglig'); });
      return true;
    }
    if (reqUrl.pathname === '/uppsala/zoner') {
      byggZoner().then(({ zoner, varm }) => {
        send(req, res, 200, 'application/json; charset=utf-8',
             Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: zoner })), varm ? 'HIT' : 'MISS');
      }).catch(e => { console.warn('[Uppsala] zoner:', e.message); fel(res, 502, 'Uppsalas avgiftsområden otillgängliga'); });
      return true;
    }
    if (reqUrl.pathname === '/uppsala/phus') {
      const varm = !!phusCache;
      byggPhus().then(list => {
        send(req, res, 200, 'application/json; charset=utf-8', Buffer.from(JSON.stringify(list)), varm ? 'HIT' : 'MISS');
      }).catch(e => { console.warn('[Uppsala] p-hus:', e.message); fel(res, 502, 'Uppsalas parkeringshus otillgängliga'); });
      return true;
    }
    return false;
  }

  return { id: 'uppsala', prefix: '/uppsala/', hantera };
};

// Tolkningsfunktionerna exporteras inte – de lever i factoryn och prövas genom
// /uppsala/wfs-tillaten mot riktig data, inte mot en kopia (se test/uppsala-prov.js).
