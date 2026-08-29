'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// STADSADAPTER: Göteborg
// ─────────────────────────────────────────────────────────────────────────────
// KONTRAKTET (samma som cities/sundbyberg.js): exportera en factory som tar de
// delade hjälparna och returnerar { id, prefix, hantera(reqUrl, req, res) -> bool }.
// hantera() returnerar true om vägen togs om hand. Allt utanför `prefix` rörs aldrig.
//
// KÄLLA: open.geodata.tkgbg.se – "Stadsmiljös öppna WFS-server". INGEN nyckel.
// ⚠ LICENS: servern är öppen och katalogen anger CC0 på ParkingService-datamängden,
// men WFS:en deklarerar varken Fees eller AccessConstraints. Lars beslut 2026-08-27:
// vi kör, kommunen får säga ifrån. Frågan är avgjord – ta inte upp den igen.
//
// ═══ TRE FÄLLOR SOM ALLA GER TYST FEL SVAR, INTE FELMEDDELANDE ═══════════════
// 1. AXELORDNING. `bbox=...,EPSG:4326` (kort form) tolkas som **lng,lat**.
//    Samma bbox med `urn:ogc:def:crs:EPSG::4326` tolkas som **lat,lng**.
//    Fel ordning ger inte fel – den ger NÄSTAN TOMT. Uppmätt 2026-08-27 på ett
//    område i centrala Göteborg: rätt ordning 178 städposter, fel ordning 2.
//    Två är precis lagom för att se rimligt ut. Använd ALLTID lng först här.
// 2. FÄLTNAMNENS SKIFTLÄGE. taxa_1..8, _a, _22, _24 skriver `SiteName`,
//    `MaxParkingTime`. Men Taxa_9, Taxa_12 och Taxa_62 skriver `sitename`,
//    `maxparkingtime`. Läser man bara CamelCase tappar man 74 segment tyst.
//    Därför går ALL fältläsning genom falt() nedan.
// 3. FEATURE-ID ÄR INTE STABILT. `taxa_1.fid-...` genereras per anrop – två
//    hämtningar av samma lager i olika projektion ger olika id OCH olika ordning.
//    Sundbybergs trick (hämta i två projektioner, para ihop på OBJECTID) går
//    alltså INTE här. Lösningen är i stället att låta servern filtrera: vi
//    skickar sökrutan i WGS84 och ber om geometrin i SWEREF99 i samma anrop.
//    Verifierat att det fungerar: 27 features, crs EPSG::3011.
//
// PRESTANDA: WFS 1.1.0 med `typeName` (singular!) tar KOMMASEPARERADE lager, så
// alla 19 parkeringslagren hämtas i ETT anrop. WFS 2.0 med `typeNames` vägrar
// ("invalid join sub-filter ... more than one feature type"). Uppmätt 1,2 s för
// ett stort område; appens verkliga sökradie är 250 m och blir långt snabbare.

module.exports = function skapaGoteborg(delade) {
  const { https, keepAliveAgent, segDistM, SCHED_API_DAYS, send } = delade;

  const HOST = 'open.geodata.tkgbg.se';
  const BAS  = '/wfs';
  const TTL  = 6 * 60 * 60 * 1000;        // städlagret ändras sällan
  const RUT_TTL = 10 * 60 * 1000;         // sökrutor: kort, bara för lägesväxling
  const RUT_MAX = 60;                     // tak på antal cachade rutor

  // ── Fälla 2: läs fältet oavsett skiftläge ──────────────────────────────────
  const falt = (p, namn) => {
    if (!p) return null;
    const v = p[namn];
    return v != null ? v : p[String(namn).toLowerCase()];
  };

  // ── HTTP ───────────────────────────────────────────────────────────────────
  function hamta(sokvag) {
    return new Promise((resolve) => {
      const bitar = [];
      const r = https.request({ hostname: HOST, port: 443, path: sokvag,
                                method: 'GET', agent: keepAliveAgent }, (resp) => {
        resp.on('data', c => bitar.push(c));
        resp.on('end', () => {
          const txt = Buffer.concat(bitar).toString('utf8');
          // WFS svarar med XML-ExceptionReport vid fel – aldrig med HTTP-felkod.
          if (txt.trimStart().startsWith('<')) {
            console.warn('[Göteborg] WFS-undantag:', txt.slice(0, 160).replace(/\s+/g, ' '));
            return resolve(null);
          }
          try { resolve(JSON.parse(txt)); } catch { resolve(null); }
        });
      });
      r.on('error', (e) => { console.warn('[Göteborg] nätfel:', e.message); resolve(null); });
      r.setTimeout(25000, () => r.destroy());
      r.end();
    });
  }

  // ⚠ Fälla 1: lng FÖRE lat, och kort CRS-form.
  const bboxParam = b => `${b[0]},${b[1]},${b[2]},${b[3]},EPSG:4326`;

  function wfsUrl(typeName, bbox, srs) {
    return `${BAS}?service=WFS&version=1.1.0&request=GetFeature`
         + `&outputFormat=application%2Fjson&srsName=${srs}`
         + `&typeName=${encodeURIComponent(typeName)}`
         + (bbox ? `&bbox=${bboxParam(bbox)}` : '');
  }

  // ── Geometri ───────────────────────────────────────────────────────────────
  // Plockar ut linjer ur LineString/MultiLineString. Ytor lämnas orörda och går
  // vidare som de är: appen ritar ytor bara för vissa platstyper (bayLines), så
  // Göteborgs ~139 ytor blir osynliga precis som Stockholms – en KÄND, befintlig
  // lucka. Att hitta på en linje ur en yta här vore att uppfinna geometri.
  function linjer(g) {
    if (!g) return [];
    if (g.type === 'LineString') return g.coordinates.length >= 2 ? [g.coordinates] : [];
    if (g.type === 'MultiLineString') return g.coordinates.filter(l => l.length >= 2);
    return [];
  }
  // Cykelparkeringarna är PUNKTER, inte linjer. Appen kräver linesSweref för att
  // överhuvudtaget se en plats (toAllowedSegment → featureLines) och använder första
  // punkten som nålens läge. Punkten är den ÄKTA uppgiften; den korta linjen är bara
  // en bärare av samma koordinat, i storleksordningen av ett faktiskt cykelställ.
  // Samma lösning som Sundbybergs cykellager. SWEREF99 är i meter → rakt av.
  const PUNKT_LANGD_M = 3;
  function punktTillLinje(g) {
    if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) return null;
    const [x, y] = g.coordinates, h = PUNKT_LANGD_M / 2;
    return isFinite(x) && isFinite(y) ? [[x - h, y], [x + h, y]] : null;
  }
  function bboxAv(ls) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const l of ls) for (const p of l) {
      if (p[0] < a) a = p[0]; if (p[0] > c) c = p[0];
      if (p[1] < b) b = p[1]; if (p[1] > d) d = p[1];
    }
    return isFinite(a) ? [a, b, c, d] : null;
  }

  // ── Maxtid: "30 min" / "2 tim" / "7 dygn" → appens MAX_*-fält ─────────────
  // Nio värden i hela staden, alla i den här formen. Verifierat 2026-08-27 mot
  // 4 042 poster: 0 tolkningsfel, och appens egen fmtMaxTid skriver tillbaka
  // exakt kommunens ordval. Okänd form → null, aldrig en gissad siffra.
  function maxTid(txt) {
    const m = /^(\d+)\s*(min|tim|dygn)$/.exec(String(txt == null ? '' : txt).trim());
    if (!m) return {};
    const v = +m[1];
    return m[2] === 'min'  ? { MAX_MINUTES: v }
         : m[2] === 'tim'  ? { MAX_HOURS: v }
                           : { MAX_DAYS: v };
  }

  // ═══ STÄDNING ══════════════════════════════════════════════════════════════
  // Hela lagret är 2 002 poster – litet nog att hämta en gång och filtrera i
  // minnet. Det ligger redan i WGS84, så ingen projektion behövs.
  const STAD_LAGER = 'general:cleaningzones_3007';
  let stadCache = null, stadTs = 0, stadInflight = null;

  function byggStad() {
    if (stadInflight) return stadInflight;
    if (stadCache && Date.now() - stadTs < TTL) return Promise.resolve(stadCache);
    stadInflight = (async () => {
      const j = await hamta(wfsUrl(STAD_LAGER, null, 'EPSG:4326'));
      const dagar = [[], [], [], [], [], [], []];
      let utan = 0;
      for (const f of (j && j.features) || []) {
        const p = f.properties || {};
        const namn = falt(p, 'sitename');
        // ⚠ VECKODAGSSKALA: Göteborg 1=måndag … 5=fredag. JS getDay() har
        // 1=måndag … 5=fredag – de SAMMANFALLER, till skillnad från Sundbyberg
        // (där 0=måndag krävde konvertering). Verifierat mot kommunens egen
        // svenska text på alla 2 002 poster. Inga helgstädningar finns.
        // Guarden är ändå kvar: ett värde utanför 1–5 ska kastas, inte tolkas.
        const dag = falt(p, 'weekday');
        const ls  = linjer(f.geometry);
        if (!namn || !(dag >= 1 && dag <= 5) || !ls.length) { utan++; continue; }
        const bb = bboxAv(ls);
        if (!bb) { utan++; continue; }

        const sh = falt(p, 'starthour'), eh = falt(p, 'endhour');
        const sm = falt(p, 'startmonth'), sd = falt(p, 'startday');
        const em = falt(p, 'endmonth'),   ed = falt(p, 'endday');
        // 1/1–31/12 ÄR året runt. Skickas det som en säsong blir det sant ändå,
        // men platskortet skulle skriva ut "1 jan–31 dec" som om det vore ett
        // villkor. Nulla i stället – då säger appen ingenting, vilket är sant.
        const aretRunt = sm === 1 && sd === 1 && em === 12 && ed === 31;

        const bas = {
          STREET_NAME: namn,
          START_TIME: sh == null ? null : sh * 100,
          END_TIME:   eh == null ? null : eh * 100,
          ADDRESS: '<Adress saknas>',
          START_MONTH: aretRunt ? null : sm, START_DAY: aretRunt ? null : sd,
          END_MONTH:   aretRunt ? null : em, END_DAY:   aretRunt ? null : ed,
          // Stadsneutrala paritetsfält – appens weekParityMatches läser dem.
          // 80 % av Göteborgs städning är varannan vecka, så utan dessa hade
          // varannan vecka blivit fel utan att synas.
          ODD_WEEKS:  falt(p, 'oddweeks')  === 'Yes',
          EVEN_WEEKS: falt(p, 'evenweeks') === 'Yes',
          GBG_LTF: falt(p, 'ltfregulationnumber') || null,
          GBG_TEXT: falt(p, 'activeperiod') || null
        };
        for (const l of ls) {
          dagar[dag].push({ type: 'Feature', properties: bas,
                            geometry: { type: 'LineString', coordinates: l }, _bb: bb });
        }
      }
      const n = dagar.reduce((s, d) => s + d.length, 0);
      console.log(`[Göteborg] städdata: ${n} segment inlästa` + (utan ? `, ${utan} kastade (saknar namn/dag/linje)` : ''));
      stadCache = dagar; stadTs = Date.now();
      return dagar;
    })().finally(() => { stadInflight = null; });
    return stadInflight;
  }

  // ═══ PARKERING ═════════════════════════════════════════════════════════════
  // Alla 19 lager i ETT anrop. Vilket lager en post kom från avgörs av id:ets
  // prefix ("taxa_1.fid-…") – det är stabilt även om själva fid:et inte är det.
  const P_LAGER = [
    'parkering:taxa_1','parkering:taxa_2','parkering:taxa_3','parkering:taxa_4',
    'parkering:taxa_5','parkering:taxa_6','parkering:taxa_7','parkering:taxa_8',
    'parkering:taxa_a','parkering:taxa_22','parkering:taxa_24',
    'parkering:Taxa_9','parkering:Taxa_12','parkering:Taxa_62',
    'parkering:tidsbegransad','parkering:boende',
    'parkering:mc','parkering:handikapp','parkering:lastplats',
    // Annan arbetsyta (cykel:), men WFS 1.1.0 tar den i SAMMA anrop - verifierat.
    'cykel:cykelparkeringar'
  ].join(',');

  const lagerAv = f => String(f && f.id || '').split('.')[0];
  const arTaxa  = l => /^taxa_/i.test(l);

  // Fordon och platstyp sätts till EXAKT de strängar appens predikat letar efter:
  //   isMcExclusive → MC_VEHICLES = motorcykel | mc | moped-klass1
  //   isRhPlats     → /rörelsehindrad/i i VF_PLATS_TYP
  //   ändamålsplats → NUMERISK VF_PLATS_TYP ('7' = Lastplats, se ANDAMAL_LABELS)
  function grund(lager, boende) {
    if (lager === 'mc')        return { VEHICLE: 'motorcykel',      VF_PLATS_TYP: 'Reserverad p-plats motorcykel' };
    if (lager === 'handikapp') return { VEHICLE: 'rörelsehindrade', VF_PLATS_TYP: 'Reserverad p-plats rörelsehindrade' };
    if (lager === 'lastplats') return { VEHICLE: 'fordon',          VF_PLATS_TYP: '7' };
    // CYKEL_VEHICLES = cykel | moped-klass2. Appen behandlar dem lika (moped klass 2
    // följer cykelns regler), så 'cykel' räcker - vi hittar inte på en undertyp
    // Göteborg inte anger.
    if (lager === 'cykelparkeringar') return { VEHICLE: 'cykel', VF_PLATS_TYP: 'Reserverad p-plats cykel' };
    // Bil: boende är ett PÅLÄGG på samma sträcka, inte en egen plats (se nedan).
    return { VEHICLE: 'fordon', VF_PLATS_TYP: boende ? 'P Avgift, boende' : (arTaxa(lager) ? 'P Avgift' : 'P') };
  }

  // ⚠ PARKING_RATE: Göteborgs taxenummer betyder INTE samma sak som Stockholms.
  // Stockholm: Taxa 1 = dyrast (55 kr/tim). Göteborg: Taxa 1 = 34 kr/tim,
  // Taxa 7 = 7 kr/tim, och nivåerna går till 62 plus "A". Skickas siffran in i
  // appens taxa-begrepp (parseRate plockar /taxa\s*(\d+)/) blir priset direkt
  // fel. Vi skickar därför kommunens PRISTEXT, som inte innehåller ordet taxa.
  function prisText(lager, p) {
    if (lager === 'tidsbegransad') return 'avgiftsfri';   // lagret är per definition utan avgift
    if (lager === 'cykelparkeringar') return 'avgiftsfri';  // kommunala cykelställ är avgiftsfria
    if (lager === 'boende')        return 'boende';
    return falt(p, 'ParkingCost') || null;
  }

  // Sökrutecache – bara för att lägesväxling (Nu ↔ Över natten) inte ska hämta om.
  const rutor = new Map();
  function ruteCache(nyckel) {
    const t = rutor.get(nyckel);
    if (t && Date.now() - t.ts < RUT_TTL) return t.data;
    if (t) rutor.delete(nyckel);
    return null;
  }
  function spara(nyckel, data) {
    if (rutor.size >= RUT_MAX) rutor.delete(rutor.keys().next().value);
    rutor.set(nyckel, { ts: Date.now(), data });
  }

  async function byggTillaten(bbox) {
    const nyckel = bboxParam(bbox);
    const cachad = ruteCache(nyckel);
    if (cachad) return cachad;

    const j = await hamta(wfsUrl(P_LAGER, bbox, 'EPSG:3011'));
    const alla = (j && j.features) || [];

    // ── Boende är ett PÅLÄGG, inte egna platser ──────────────────────────────
    // Uppmätt 2026-08-26: 348 av 379 taxa_1-segment har BYTE-IDENTISK geometri i
    // boende-lagret, alla med samma LtfRegulationNumber. Ritas lagren rakt av blir
    // varje central gata dubbelritad. Nyckeln är geometrin (fid går inte att lita
    // på, se fälla 3). De boende-poster som INTE har en tvilling är äkta egna
    // sträckor och ritas för sig.
    const boendePerGeom = new Map();
    for (const f of alla) {
      if (lagerAv(f) !== 'boende') continue;
      boendePerGeom.set(JSON.stringify(f.geometry && f.geometry.coordinates),
                        falt(f.properties || {}, 'ResidentialParking') || null);
    }
    const forbrukade = new Set();

    const ut = [];
    let ytor = 0;
    for (const f of alla) {
      const lager = lagerAv(f);
      if (lager === 'boende') continue;                 // tas via pålägget nedan
      const p = f.properties || {};
      // Cykelställen är punkter; allt annat är linjer eller ytor.
      const punktLinje = lager === 'cykelparkeringar' ? punktTillLinje(f.geometry) : null;
      const ls = punktLinje ? [punktLinje] : linjer(f.geometry);
      if (!ls.length) { ytor++; continue; }             // yta – se kommentaren vid linjer()

      const geomNyckel = JSON.stringify(f.geometry.coordinates);
      const harBoende  = boendePerGeom.has(geomNyckel);
      if (harBoende) forbrukade.add(geomNyckel);

      const bas = grund(lager, harBoende);
      const props = Object.assign({}, bas, maxTid(falt(p, 'MaxParkingTime')), {
        PARKING_RATE: prisText(lager, p),
        // VF_METER är Stockholms signal för äkta korttidsficka. Göteborg har
        // ingen motsvarighet – och maxtiden bär redan den informationen, bättre.
        // Null, aldrig ett hittepåvärde: annars utlöses besöksficke-heuristiken.
        VF_METER: null,
        // Cykellagret har egna fältnamn (adress/antal_platser) och saknar LTF-nummer.
        // Adressen skickas ORÖRD som den står hos kommunen ("Östra Hamngatan 23") –
        // den är kortets rubrik, och att klippa bort husnumret för att den ska likna
        // ett gatunamn vore att förvanska uppgiften utan att vinna något: cykel-
        // flödet slår medvetet aldrig upp bilens städschema på gatunamn.
        VF_PLATSER: falt(p, 'ParkingSpaces') || falt(p, 'TotalParkningSpaces')
                 || falt(p, 'antal_platser') || null,
        STREET_NAME: falt(p, 'SiteName') || falt(p, 'adress') || null,
        CITATION: falt(p, 'LtfRegulationNumber') || null,
        // Additiva Göteborgsfält – krockar inte med Stockholms nycklar.
        GBG_LAGER: lager,
        GBG_BOENDE: harBoende ? boendePerGeom.get(geomNyckel) : null,
        GBG_MAXTID_VILLKOR: falt(p, 'MaxParkingTimeLimitation') || null,
        GBG_STADTEXT: falt(p, 'CleaningZone') || null,
        // En lastplats UTAN villkorsmening gäller dygnet runt. Slutsatsen är inte
        // gissad ur tomrummet – den är läst i föreskriften. Uppmätt 2026-08-29 på
        // HELA staden: 339 lastplatser, varav 140 saknar mening. Fyra av dem lästes i
        // RDT, spridda över 2008/2014/2022/2026, och alla fyra säger samma sak utan ett
        // enda klockslag: «…ska vara ändamålsplats för lastning eller lossning av tungt
        // eller skrymmande gods.» Punkt. Tomt fält betyder alltså «alltid», inte
        // «okänt» – och utan flaggan ritade appen dem gröna dygnet runt, året om.
        // ⚠ Fältet är stadsneutralt men sätts BARA här. Stockholms 1 552 ändamålsplatser
        // bär alla både tid och dag (0 poster utan), och Sundbybergs tomrum är oprövat.
        // Den som sätter flaggan i en ny stad måste läsa föreskriften där först.
        ANDAMAL_ALLTID: lager === 'lastplats' && !falt(p, 'MaxParkingTimeLimitation')
      });
      for (const l of ls) ut.push({ type: 'Feature', properties: props,
                                    geometry: { type: 'LineString', coordinates: l } });
    }

    // Boende utan tvilling → egna segment.
    let egnaBoende = 0;
    for (const f of alla) {
      if (lagerAv(f) !== 'boende') continue;
      const nyckelG = JSON.stringify(f.geometry && f.geometry.coordinates);
      if (forbrukade.has(nyckelG)) continue;
      const ls = linjer(f.geometry);
      if (!ls.length) { ytor++; continue; }
      const p = f.properties || {};
      const props = Object.assign({}, grund('boende', true), {
        PARKING_RATE: 'boende',
        VF_METER: null,
        VF_PLATSER: falt(p, 'ParkingSpaces') || null,
        STREET_NAME: falt(p, 'SiteName') || null,
        CITATION: falt(p, 'LtfRegulationNumber') || null,
        // ⚠ HÄR VET VI ATT EN TIDSGRÄNS FINNS – MEN INTE VILKEN.
        // Föreskriften om boendeparkering (1480 2007-02789) säger att tillståndet
        // gäller "med avvikelse från gällande tidsbegränsning på platsen". En boendezon
        // FÖRUTSÄTTER alltså att det finns en tidsgräns; den är bara inte publicerad
        // för de här sträckorna. Uppmätt 2026-08-27: 496 av 2 095 boende-sträckor
        // saknar tvilling, och 0 av dem går att koppla via föreskriftsnumret heller.
        // Fältbevis (Lars foto, Vattugatan): skylten säger "P 2 tim / Boende V5" och
        // längre fram "30 min / Boende V5n" – ingetdera finns i datan, medan
        // grannagatorna 21 m bort HAR sina gränser publicerade. Stadens lucka, inte vår.
        // Stadsneutralt fält: Stockholm bär alltid boende ihop med "P Avgift" i samma
        // post och blir därför aldrig ensam – regeln kan inte utlösas där.
        ENDAST_BOENDE: true,
        BOENDE_ZON: falt(p, 'ResidentialParking') || null,
        GBG_LAGER: 'boende',
        GBG_BOENDE: falt(p, 'ResidentialParking') || null
      });
      for (const l of ls) ut.push({ type: 'Feature', properties: props,
                                    geometry: { type: 'LineString', coordinates: l } });
      egnaBoende++;
    }

    console.log(`[Göteborg] tillåten: ${alla.length} poster → ${ut.length} segment`
      + ` (${forbrukade.size} med boende-pålägg, ${egnaBoende} egna boende`
      + (ytor ? `, ${ytor} ytor ej ritbara` : '') + ')');
    spara(nyckel, ut);
    return ut;
  }

  // ═══ PARKERINGSANLÄGGNINGAR ("p-hus") ══════════════════════════════════════
  // Källan är den NYCKELFRIA kartdatan, inte data.goteborg.se. Det nyckelskyddade
  // ParkingService mättes 2026-08-27 och gav ingenting:
  //   • FreeSpaces (realtidslediga platser) är TOMT på alla 3 511 poster i alla tre
  //     endpoints. Fältet finns i schemat men fylls aldrig.
  //   • CurrentParkingCost är ifyllt MEN FEL: 668 av 764 jämförbara (87 %) motsäger
  //     anläggningens egna prisfönster. Kl 16:21 en torsdag – mitt i högtaxan 08–22 –
  //     svarade API:et 2 kr/tim (nattpriset) där datan säger 18, 32, 13, 20 kr/tim.
  // Här räknar vi i stället ut priset SJÄLVA ur de strukturerade fönstren, som
  // stämmer med kommunens egen pristext. Därför blir Göteborgs pris rätt, inte fel.
  const PHUS_LAGER = 'parkering:privat';
  let phusCache = null, phusTs = 0, phusInflight = null;

  function byggPhus() {
    if (phusInflight) return phusInflight;
    if (phusCache && Date.now() - phusTs < TTL) return Promise.resolve(phusCache);
    phusInflight = (async () => {
      const j = await hamta(wfsUrl(PHUS_LAGER, null, 'EPSG:4326'));
      const ut = [];
      for (const f of (j && j.features) || []) {
        const p = f.properties || {};
        const g = f.geometry;
        const c = g && g.type === 'Point' ? g.coordinates : null;
        if (!c) continue;
        ut.push({
          Name: falt(p, 'SiteName') || 'Parkering',
          Adress: falt(p, 'SiteName') || null,
          Agare: falt(p, 'Owner') || null,
          // Göteborg saknar helt ett fält för anläggningstyp. Vi hittar INTE på ett –
          // klienten filtrerar inte på typ här (STAD.phusTyp = null).
          Anlaggningstyp: null,
          AntalBesokPlatser: +falt(p, 'ParkingSpaces') || 0,
          AdressLatitud: c[1], AdressLongitud: c[0],
          GBG_TELEFONKOD: falt(p, 'PhoneParkingCode') || null,
          GBG_PRISTEXT: falt(p, 'ParkingCost') || null,
          // Rådata för prisberäkningen – priset räknas ut vid REQUEST, inte här,
          // annars hade cachen frusit gårdagens klockslag.
          _hog: +falt(p, 'HighChargePricePerHour'),
          _lag: +falt(p, 'LowChargePricePerHour'),
          _v: [falt(p, 'HighChargeWeekdayStart'), falt(p, 'HighChargeWeekdayStop')],
          _l: [falt(p, 'HighChargeSaturdayStart'), falt(p, 'HighChargeSaturdayStop')],
          _s: [falt(p, 'HighChargeSundayStart'), falt(p, 'HighChargeSundayStop')]
        });
      }
      console.log(`[Göteborg] parkeringsanläggningar: ${ut.length} inlästa`
        + ` (${ut.filter(x => x.AntalBesokPlatser > 0).length} med känt platsantal)`);
      phusCache = ut; phusTs = Date.now();
      return ut;
    })().finally(() => { phusInflight = null; });
    return phusInflight;
  }

  // Vad kostar det just NU? Fönstren är heltalstimmar ("08"/"22") i kommunens data.
  // Saknas de returneras null och klienten visar ingen prisrad alls – hellre tyst
  // än ett påhittat pris.
  function prisNu(a, d) {
    const dag = d.getDay(), tim = d.getHours();
    const f = dag === 0 ? a._s : dag === 6 ? a._l : a._v;
    const s = parseInt(f && f[0], 10), e = parseInt(f && f[1], 10);
    if (!isFinite(a._hog) || !isFinite(a._lag) || !isFinite(s) || !isFinite(e)) return null;
    const hog = s <= e ? (tim >= s && tim < e) : (tim >= s || tim < e);
    return hog ? a._hog : a._lag;
  }

  // ── Vägar ──────────────────────────────────────────────────────────────────
  function tolkaBbox(str) {
    const b = String(str || '').split(',').slice(0, 4).map(Number);
    return (b.length === 4 && b.every(v => isFinite(v))) ? b : null;
  }
  function fel(res, kod, txt) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(kod);
    res.end(JSON.stringify({ error: txt }));
  }

  function hantera(reqUrl, req, res) {
    // ── Städdata i EXAKT samma svarsform som Stockholms /servicedagar-bbox ──
    if (reqUrl.pathname === '/gbg/servicedagar-bbox') {
      const tolkaDag = s => { s = (s || '').toLowerCase().trim();
        return /^\d$/.test(s) ? +s : SCHED_API_DAYS.indexOf(s); };
      const flera = reqUrl.searchParams.has('dagar');
      const dagar = flera ? (reqUrl.searchParams.get('dagar') || '').split(',').map(tolkaDag)
                          : [tolkaDag(reqUrl.searchParams.get('dag'))];
      const bbox = tolkaBbox(reqUrl.searchParams.get('bbox'));
      if (!dagar.length || dagar.some(d => !(d >= 0 && d <= 6)) || !bbox) {
        return fel(res, 400, 'dag/dagar (0-6 eller veckodagsnamn) och bbox=minLng,minLat,maxLng,maxLat krävs'), true;
      }
      const varm = !!stadCache;
      byggStad().then(geo => {
        const [aLng, aLat, bLng, bLat] = bbox;
        // Säsong och veckoparitet filtreras INTE här – båda avgörs av klientens
        // cleaningActiveOn, som får fälten och räknar om dem vid varje rendering.
        // Filtrerade vi här skulle en vilande säsong se ut som "ingen städning".
        const utsnitt = d => ({ type: 'FeatureCollection',
          features: (geo[d] || [])
            .filter(f => !(f._bb[2] < aLng || f._bb[0] > bLng || f._bb[3] < aLat || f._bb[1] > bLat))
            .map(f => ({ type: f.type, properties: f.properties, geometry: f.geometry })) });
        const kropp = flera
          ? { dagar: Object.fromEntries(dagar.map(d => [d, utsnitt(d)])) }
          : utsnitt(dagar[0]);
        send(req, res, 200, 'application/json; charset=utf-8',
             Buffer.from(JSON.stringify(kropp)), varm ? 'HIT' : 'MISS');
      }).catch(() => fel(res, 502, 'Göteborgs städdata otillgänglig'));
      return true;
    }

    // ── Parkering i P_TILLATEN-form, SWEREF99 (EPSG:3011) ──────────────────
    if (reqUrl.pathname === '/gbg/wfs-tillaten') {
      const bbox = tolkaBbox(reqUrl.searchParams.get('BBOX') || reqUrl.searchParams.get('bbox'));
      if (!bbox) return fel(res, 400, 'BBOX=minLng,minLat,maxLng,maxLat krävs'), true;
      const varm = !!ruteCache(bboxParam(bbox));
      byggTillaten(bbox).then(features => {
        send(req, res, 200, 'application/json; charset=utf-8',
             Buffer.from(JSON.stringify({ type: 'FeatureCollection', features })), varm ? 'HIT' : 'MISS');
      }).catch(() => fel(res, 502, 'Göteborgs parkeringsdata otillgänglig'));
      return true;
    }

    // ── Parkeringsanläggningar i samma form som Stockholms /phus ────────────
    if (reqUrl.pathname === '/gbg/phus') {
      const varm = !!phusCache;
      byggPhus().then(list => {
        const nu = new Date();
        const kropp = list.map(a => {
          const kr = prisNu(a, nu);
          return {
            Name: a.Name, Adress: a.Adress, Agare: a.Agare,
            Anlaggningstyp: a.Anlaggningstyp,
            AntalBesokPlatser: a.AntalBesokPlatser,
            AdressLatitud: a.AdressLatitud, AdressLongitud: a.AdressLongitud,
            // Klientens garageTaxaText läser den här listan och skriver "N kr/tim"
            // när Tidsenhet innehåller "tim". Tomt när priset inte går att räkna ut.
            BesokstaxaCollection: kr == null ? [] : [{ Taxa: kr, Tidsenhet: 'timme' }],
            ZonkodCollection: [],
            GBG_TELEFONKOD: a.GBG_TELEFONKOD, GBG_PRISTEXT: a.GBG_PRISTEXT
          };
        });
        send(req, res, 200, 'application/json; charset=utf-8',
             Buffer.from(JSON.stringify(kropp)), varm ? 'HIT' : 'MISS');
      }).catch(() => fel(res, 502, 'Göteborgs parkeringsanläggningar otillgängliga'));
      return true;
    }

    // ── Schema-uppslag: samma kontrakt som /schedule ────────────────────────
    // { schedule:[{day,s,e,vilande?,sm?,sd?,veckor?}] }. Uppslaget sker på
    // gatunamn + 25 m, exakt som Stockholm. Uppmätt 2026-08-27: 87 % av
    // Göteborgs parkeringssegment på en städad gata hittar sin städlinje inom
    // 25 m, median 0,0 m (35 % delar geometri rakt av).
    if (reqUrl.pathname === '/gbg/schedule') {
      const lat  = parseFloat(reqUrl.searchParams.get('lat'));
      const lng  = parseFloat(reqUrl.searchParams.get('lng'));
      const name = (reqUrl.searchParams.get('name') || '').toLowerCase().trim();
      if (!isFinite(lat) || !isFinite(lng) || !name) return fel(res, 400, 'lat/lng/name krävs'), true;
      const varm = !!stadCache;
      byggStad().then(geo => {
        const idag = new Date();
        const mLng = 111320 * Math.cos(lat * Math.PI / 180);
        const dLat = 25 / 111320 + 1e-4, dLng = 25 / mLng + 1e-4;
        const seen = new Set(), schedule = [];
        for (let dag = 0; dag < 7; dag++) {
          for (const f of geo[dag] || []) {
            const p = f.properties || {};
            if ((p.STREET_NAME || '').toLowerCase().trim() !== name) continue;
            const bb = f._bb;
            if (lng < bb[0] - dLng || lng > bb[2] + dLng || lat < bb[1] - dLat || lat > bb[3] + dLat) continue;
            const linje = f.geometry.coordinates;
            let traff = false;
            for (let i = 0; i < linje.length - 1; i++) {
              if (segDistM(lat, lng, linje[i], linje[i + 1]) <= 25) { traff = true; break; }
            }
            if (!traff) continue;
            const aktiv = inomSasong(p, idag);
            const k = dag + '_' + p.START_TIME + '_' + p.END_TIME + '_' + (aktiv ? 'a' : 'v');
            if (seen.has(k)) continue;
            seen.add(k);
            // ⚠ KÄND LUCKA: `veckor` skickas med men klienten läser den inte än,
            // så kortet skriver "Servas onsdagar 09–12" även när det gäller
            // varannan vecka. Det är ofullständigt, inte farligt: felet får
            // föraren att flytta bilen en vecka i onödan, aldrig att stå kvar
            // en vecka den inte får. Egen runda – se projektminnet.
            const veckor = p.ODD_WEEKS && p.EVEN_WEEKS ? null
                         : p.ODD_WEEKS ? 'udda' : p.EVEN_WEEKS ? 'jämna' : null;
            if (aktiv) schedule.push({ day: dag, s: p.START_TIME, e: p.END_TIME, veckor });
            else schedule.push({ day: dag, s: p.START_TIME, e: p.END_TIME, veckor,
                                 vilande: true, sm: p.START_MONTH, sd: p.START_DAY });
          }
        }
        send(req, res, 200, 'application/json; charset=utf-8',
             Buffer.from(JSON.stringify({ schedule })), varm ? 'HIT' : 'MISS');
      }).catch(() => fel(res, 502, 'Göteborgs schema otillgängligt'));
      return true;
    }

    return false;
  }

  // Samma säsongslogik som klientens cleaningActiveOn, inklusive årsskiftes-wrap.
  function inomSasong(p, d) {
    if (p.START_MONTH == null) return true;
    const md = (m, dd) => m * 100 + (dd || 1);
    const nu = md(d.getMonth() + 1, d.getDate());
    const a = md(p.START_MONTH, p.START_DAY), b = md(p.END_MONTH, p.END_DAY);
    return a <= b ? (nu >= a && nu <= b) : (nu >= a || nu <= b);
  }

  return { id: 'goteborg', prefix: '/gbg/', hantera };
};
