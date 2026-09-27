// Läser Stockholms föreskrifter ur RDT och tar fram ALLA deras tidsfönster.
//
//   node verktyg/las-sthlm-fonster.js            → läser bara nya och ändrade föreskrifter
//   node verktyg/las-sthlm-fonster.js --inte-las → inga RDT-anrop alls
//   node verktyg/las-sthlm-fonster.js --kolla    → rapport, ändrar ingenting. Exit 0 = inget
//                                                  att göra, 1 = något ändrat, 2 = fel
//
// STEGVIS (månadsroboten har ingen textcache): en föreskrift vars VALID_FROM är densamma
// som i sthlm-fonster.json behåller sin gamla klassning utan att läsas om. Bara nya,
// ändrade och tidigare oläsbara läses – några i månaden i stället för 1 969.
// Finns texten i cachen (lokalt) klassas den om ändå, så en förbättrad tolkning slår igenom.
//
// Skriver verktyg/sthlm-fonster.json (granskningsbar, meningen i klartext). Kör sedan
// verktyg/bygg-sthlm-fonster.js för att föra in tabellen i index.html.
//
// ── VARFÖR (2026-09-27) ──────────────────────────────────────────────────────
// Stockholms WFS har ofta EN tidsrad per föreskrift fast föreskriften har flera fönster.
// Uppmätt: 322 av 568 lästa tidsreglerade förbud säger «Förbudet gäller … vardag före sön-
// och helgdag klockan 11.00 - 17.00» (lördag) men datan har bara «vardag utom vardag före…
// 07-19». Appen visade grönt lördag 11-17 där parkering är förbjuden. Och 3 av 40 lästa
// lastplatser gäller även helgen (Tjärhovsgatan, Åsögatan, Sirapsvägen) utan att datan
// säger det – helgfyndet lovade fel där. Datan kan inte avslöja sin egen lucka; bara texten.
//
// ── SÄKERHETSSPÄRRAR ────────────────────────────────────────────────────────
//   · Textens fönster används bara om de TÄCKER alla datans rader (klass «dolda» eller
//     «lika»). Missar tolkningen ett fönster som datan har → «avvikelse» → dagens beteende.
//   · Säsong, udda/jämn vecka, undantag med klockslag («gäller inte …») → «oklar» → dagens beteende.
//   · Tabellen bär VALID_FROM; appen litar bara på raden om datumet stämmer.
// Tolkningen kan alltså bara lägga TILL fönster som datan saknar, aldrig ta bort ett.
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const HAR = __dirname;
const TEXTER = path.join(HAR, '.rdt-texter.json');     // gitignorerad cache: citation → text
const UT = path.join(HAR, 'sthlm-fonster.json');
const INTE_LAS = process.argv.includes('--inte-las');
const KOLLA = process.argv.includes('--kolla');

let API_KEY = (process.env.STHLM_API_KEY || '').trim();
if (!API_KEY) { try { API_KEY = fs.readFileSync(path.join(HAR, '..', '.apikey'), 'utf8').trim(); } catch {} }
if (!API_KEY) { console.error('Ingen API-nyckel (STHLM_API_KEY eller .apikey).'); process.exit(2); }

function hamta(host, sokvag) {
  return new Promise((res, rej) => {
    const bitar = [];
    const r = https.request({ hostname: host, port: 443, path: sokvag, method: 'GET' }, resp => {
      resp.on('data', c => bitar.push(c)); resp.on('end', () => res(Buffer.concat(bitar)));
    });
    r.on('error', rej); r.setTimeout(120000, () => r.destroy(new Error('timeout mot ' + host))); r.end();
  });
}

// ── RDT – samma två funktioner som kolla-forbud-ovrig-tid.js ─────────────────
function pdfText(buf) {
  let raw = '', i = 0;
  while (true) {
    const s = buf.indexOf(Buffer.from('stream'), i); if (s < 0) break;
    let st = s + 6; if (buf[st] === 13) st++; if (buf[st] === 10) st++;
    const e = buf.indexOf(Buffer.from('endstream'), st); if (e < 0) break;
    try {
      const d = zlib.inflateSync(buf.slice(st, e), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString('latin1');
      if (/\bTJ\b|\bTj\b/.test(d)) raw += d + '\n';
    } catch {}
    i = e + 9;
  }
  const ut = []; const re = /\((?:\\.|[^()\\])*\)/g; let m;
  while ((m = re.exec(raw))) {
    let s = m[0].slice(1, -1);
    s = s.replace(/\\([()\\])/g, '$1').replace(/\\(\d{1,3})/g, (a, o) => String.fromCharCode(parseInt(o, 8)));
    ut.push(s);
  }
  return ut.join('').replace(/\s+/g, ' ').trim();
}
async function lasForeskrift(citation) {
  const m = citation.match(/^(\d{4})\s+(\d{4})-(\d+)$/); if (!m) return null;
  const url = `/rdt/AF06_View.aspx?BeslutsMyndighetKod=${m[1]}&BeslutadAr=${m[2]}&LopNr=${m[3]}`;
  let html; try { html = (await hamta('rdt.transportstyrelsen.se', url)).toString('utf8'); } catch { return null; }
  const ids = [...new Set([...html.matchAll(/ForeskriftId=([0-9a-f-]{36})/g)].map(x => x[1]))];
  for (const id of ids.slice(0, 4)) {
    try {
      const t = pdfText(await hamta('rdt.transportstyrelsen.se', '/rdt/AF06_ViewDocument.aspx?ForeskriftId=' + id));
      const rubrik = t.slice(0, 120);
      if (rubrik.includes(`${m[1]} ${m[2]}:${m[3]}`) || rubrik.includes(`${m[1]} ${m[2]}-${m[3]}`)) return t;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  return null;
}

// ── Tolkning ────────────────────────────────────────────────────────────────
// PDF-utvinningen klistrar ihop ord vid radbrytning («klockan07.00», «onsdagklockan»,
// «sön-och», «föresön-»). Normalisera innan något matchas.
function normalisera(t) {
  return t
    .replace(/klockan(?=\d)/g, 'klockan ')
    .replace(/([a-zåäö])klockan/g, '$1 klockan')
    .replace(/sön-\s*och\s*helgdag/gi, 'sön- och helgdag')
    .replace(/sön-och/gi, 'sön- och')
    .replace(/före(?=sön)/g, 'före ')
    .replace(/(vardag|dag)(?=före)/g, '$1 ')
    .replace(/\bska(?=vara)/g, 'ska ').replace(/\bvara(?=ändamålsplats)/g, 'vara ')
    .replace(/vardagarutom/g, 'vardagar utom').replace(/vardagutom/g, 'vardag utom')
    .replace(/(\d{2}\.\d{2})(?=[a-zåäö])/g, '$1 ')
    // «19.00 ochvardag före …» – utan mellanslaget missas lördagsfönstret och motorn hittade
    // «sön- och helgdag» inuti frasen i stället: ett SÖNDAGSfönster där texten säger lördag
    // (Dalagatan 0180 2017-06251, andra körningen).
    .replace(/\boch(?=(vardag|dag|sön|mån|tis|ons|tors|fre|lör|alla))/g, 'och ')
    // «utomvardag», «godsvardagar», «tidenvardagar», «tidenmåndag» – samma radbrytningslim.
    // Inget svenskt ord i de här texterna har «vardag» eller ett veckodagsnamn inuti sig.
    .replace(/([a-zåäö])(?=(vardag|måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag))/g, '$1 ')
    .replace(/\s+/g, ' ');
}
// Dela i meningar på punkt följd av versal – «07.00» följs av siffror och delas aldrig.
function meningar(t) {
  let s = t;
  const i = s.indexOf('följande.'); if (i >= 0) s = s.slice(i + 9);
  s = s.replace(/(Denna|Dessa) (författning|föreskrifter?) (träder|skall|ska).*$/i, '');
  return s.split(/\.(?=\s*[A-ZÅÄÖ])/).map(x => x.trim()).filter(Boolean);
}
// Meningar som säger när parkering INTE får ske. «Övrig tid får fordon parkeras (mot
// avgift …)» är en tillåtelse/avgift och tas aldrig med – det var den som gav två falsklarm
// i stickprovet när en naiv regex klippte vid punkten i «07.00».
const FORBUDSMENING = /(får (fordon )?inte (fordon )?(stannas eller )?parkeras|förbudet gäller|ska vara ändamålsplats|får dock fordon inte)/i;
// ⚠ «(?:vardag|dag)», inte «(?:vardag )?dag»: det senare matchar inte «utom VARDAG före»,
// och då hittade motorn i stället «dag före sön- och helgdag» INUTI vardagsfrasen – ett
// vardagsfönster lästes som ett lördagsfönster (första körningen, 605 «avvikelser»; spärren
// mot datan höll dem ute ur tabellen). \b först så att «dag» aldrig matchar mitt i ett ord.
const DAG = '\\b(vardag(?:ar)? utom (?:vardag|dag) före sön- och helgdag|(?:vardag|dag)(?:ar)? före sön- och helgdag|(?<!före )sön- och helgdag(?:ar)?|alla dagar|vardag(?:ar)?|måndag(?:ar)?|tisdag(?:ar)?|onsdag(?:ar)?|torsdag(?:ar)?|fredag(?:ar)?|lördag(?:ar)?|söndag(?:ar)?)';
const TID = '(\\d{1,2})\\.(\\d{2}) ?- ?(\\d{1,2})\\.(\\d{2})';
function dagKod(d) {
  d = d.toLowerCase();
  if (/utom/.test(d)) return 'vardag-ej-dagfore';
  if (/före/.test(d)) return 'dagfore';
  if (/^sön- och helgdag/.test(d)) return 'sonhelg';
  if (d === 'alla dagar') return 'alla';
  if (/^vardag/.test(d)) return 'vardag';
  return d.replace(/ar$/, '');                         // måndagar → måndag
}
// lager 'andamal': bara meningen «ska vara ändamålsplats …» ger lastplatsens tider. Meningar
// som «Under tiden tisdag klockan 00.00 - 06.00 får dock fordon inte parkeras» är gatans
// städnatt – ett ANNAT förbud som appen redan visar ur städdatan. Läggs de i lastplatsens
// regler säger kortet «Lastplats» där det ska stå «Städas nu». De hamnar i `dock` i stället.
function tolka(text, lager) {
  const t = normalisera(text);
  const oklar = [];
  const regler = [], dock = [], kallor = [];
  for (const m of meningar(t)) {
    if (/^[ÖO]vrig tid/i.test(m)) continue;
    if (!FORBUDSMENING.test(m)) continue;
    const mal = (lager === 'andamal' && !/ändamålsplats/i.test(m)) ? dock : regler;
    // Bara i förbudsmeningen – «beslutade den 24 maj 2017» står i varje föreskrift.
    if (/\b(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\b/i.test(m)) oklar.push('säsong');
    // «udda/jämn VECKA» – inte «Sveavägens udda sida», som står i platsbeskrivningen.
    if (/\b(udda|jämna?) (vecka|veckor|veckonummer|datum)/i.test(m)) oklar.push('udda/jämn vecka');
    if (/gäller (dock )?inte\b[^.]*klockan/i.test(m)) oklar.push('undantag med klockslag');
    kallor.push(m);
    const re = new RegExp(DAG + '\\s*,?\\s*(?:under tiden\\s*)?klockan\\s*' + TID + '((?:\\s*(?:,|och)\\s*' + TID + ')*)', 'gi');
    let x;
    while ((x = re.exec(m))) {
      const dag = dagKod(x[1]);
      mal.push([dag, +x[2] * 100 + +x[3], +x[4] * 100 + +x[5]]);
      const extra = x[6] || '';
      const re2 = new RegExp(TID, 'g'); let y;
      while ((y = re2.exec(extra))) mal.push([dag, +y[1] * 100 + +y[2], +y[3] * 100 + +y[4]]);
    }
  }
  const unik = a => [...new Map(a.map(r => [r.join('|'), r])).values()];
  return { regler: unik(regler), dock: unik(dock), oklar: [...new Set(oklar)], mening: kallor.join('. ') };
}
// Kan ett «dock»-förbud falla på en lördag, söndag eller helgdag? Då får platsen aldrig bli
// helgfynd – «vardag» (juridiskt mån–lör) räknas också hit.
const HELGDAGTYPER = new Set(['dagfore', 'sonhelg', 'alla', 'vardag', 'lördag', 'söndag']);
// Datans rad i samma form som regeln.
function dataRegel(p) {
  if (p.START_TIME == null || p.END_TIME == null) return null;
  const dt = (p.DAY_TYPE || '').toLowerCase();
  let dag = null;
  if (/utom/.test(dt)) dag = 'vardag-ej-dagfore';
  else if (/före/.test(dt)) dag = 'dagfore';
  else if (/sön/.test(dt)) dag = 'sonhelg';
  else if (/vardag/.test(dt)) dag = 'vardag';
  else if (p.START_WEEKDAY) dag = String(p.START_WEEKDAY).toLowerCase();
  if (!dag) return null;
  return [dag, +p.START_TIME, +p.END_TIME];
}

async function wfs(lager, falt, cql) {
  const q = `/geoservice/api/${API_KEY}/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=ltfr:${lager}`
          + `&outputFormat=application/json&propertyName=${falt}` + (cql ? '&CQL_FILTER=' + encodeURIComponent(cql) : '');
  const txt = (await hamta('openstreetgs.stockholm.se', q)).toString('utf8');
  const j = JSON.parse(txt);
  if (!Array.isArray(j.features)) throw new Error('WFS utan features – frågan gick fel');
  return j.features.map(f => f.properties);
}

(async () => {
  const falt = 'CITATION,VALID_FROM,VALID_TO,DAY_TYPE,START_WEEKDAY,START_TIME,END_TIME,START_MONTH,ODD_EVEN,VF_PLATS_TYP,STREET_NAME,CITY_DISTRICT';
  const forbud = (await wfs('LTFR_P_FORBUD_GEOM', falt))
    .filter(p => p.VF_PLATS_TYP === 'Tidsreglerat parkerings-/stoppförbud' && p.DAY_TYPE && p.CITATION);
  const andamal = await wfs('LTFR_P_TILLATEN_GEOM', falt, "VF_PLATS_TYP IN ('7','17','18','20','22')");
  if (forbud.length < 300 || andamal.length < 1000) { console.error('Misstänkt få poster – avbryter.'); process.exit(2); }

  // Nyckel lager|citation: samma ärendenummer kan i princip finnas i båda lagren, och då får
  // raderna aldrig blandas – jämförelsen mot datan gäller ett lager i taget.
  const pop = new Map();                      // lager|citation → { lager, cit, rader }
  for (const [lager, lista] of [['forbud', forbud], ['andamal', andamal]]) {
    for (const p of lista) {
      if (!p.CITATION) continue;
      const nyckel = lager + '|' + p.CITATION;
      const k = pop.get(nyckel) || { lager, cit: p.CITATION, rader: [] };
      k.rader.push(p); pop.set(nyckel, k);
    }
  }
  const texter = fs.existsSync(TEXTER) ? JSON.parse(fs.readFileSync(TEXTER, 'utf8')) : {};
  const gammal = fs.existsSync(UT) ? JSON.parse(fs.readFileSync(UT, 'utf8')) : { poster: [] };
  const gamla = new Map(gammal.poster.map(p => [p.lager + '|' + p.citation, p]));
  const datumFor = rader => String(rader[0].VALID_FROM || '').slice(0, 10);
  // Kan den gamla klassningen återanvändas utan att texten läses?
  const ateranvand = (nyckel, rader) => {
    const g = gamla.get(nyckel);
    return g && g.klass !== 'olasbar' && g.gallerFran === datumFor(rader) ? g : null;
  };

  // ── --kolla: vad skulle behöva läsas? ─────────────────────────────────────
  const nya = [], andrade = [], olasbara = [];
  for (const [nyckel, v] of pop) {
    const g = gamla.get(nyckel);
    if (!g) nya.push(v);
    else if (g.gallerFran !== datumFor(v.rader)) andrade.push(v);
    else if (g.klass === 'olasbar') olasbara.push(v);
  }
  const borta = [...gamla.keys()].filter(k => !pop.has(k));
  if (KOLLA) {
    const rad = (n, t) => String(n).padStart(5) + '  ' + t;
    console.log('Kontroll av sthlm-fonster.json mot Stockholms kartdata, ' + new Date().toISOString().slice(0, 10));
    console.log(rad(pop.size, 'föreskrifter i populationen (tidsreglerade förbud + ändamålsplatser)'));
    console.log(rad(gamla.size, 'föreskrifter i tabellen'));
    console.log(rad(nya.length, 'nya – aldrig lästa'));
    console.log(rad(andrade.length, 'ändrade – nytt VALID_FROM, texten måste läsas om'));
    console.log(rad(borta.length, 'borta ur kartdatan'));
    console.log(rad(olasbara.length, 'oläsbara sedan förra gången (försöks igen vid uppdatering)'));
    const visa = (rubrik, lista) => { if (lista.length) { console.log('\n── ' + rubrik); lista.slice(0, 40).forEach(v => console.log('  ' + v.cit + '  ' + (v.rader[0].STREET_NAME || ''))); } };
    visa('Nya', nya); visa('Ändrade', andrade);
    if (borta.length) { console.log('\n── Borta'); borta.slice(0, 40).forEach(k => console.log('  ' + k)); }
    process.exit(nya.length + andrade.length + borta.length ? 1 : 0);
  }

  if (!INTE_LAS) {
    // Fyra åt gången: en i taget tog ~4 s per föreskrift (1 400 st ≈ 1,5 tim). Fler än så
    // vore ohövligt mot Transportstyrelsens server. Bara det som inte kan återanvändas.
    const kvar = [...new Set([...pop].filter(([k, v]) => !ateranvand(k, v.rader)).map(([, v]) => v.cit))]
      .filter(c => !texter[c]);
    console.error('läser ' + kvar.length + ' föreskrifter i RDT');
    let n = 0;
    const arbetare = async () => {
      while (kvar.length) {
        const c = kvar.shift();
        texter[c] = await lasForeskrift(c);
        if (++n % 50 === 0) { fs.writeFileSync(TEXTER, JSON.stringify(texter)); console.error('läst', n, 'kvar', kvar.length); }
        await new Promise(r => setTimeout(r, 100));
      }
    };
    await Promise.all([arbetare(), arbetare(), arbetare(), arbetare()]);
    fs.writeFileSync(TEXTER, JSON.stringify(texter));
  }

  const poster = [], sum = {};
  let ateranvanda = 0;
  for (const [nyckel, { cit, lager, rader }] of pop) {
    const p0 = rader[0];
    const bas = { citation: cit, lager, gata: p0.STREET_NAME || '', stadsdel: p0.CITY_DISTRICT || '',
                  gallerFran: String(p0.VALID_FROM || '').slice(0, 10), stracker: rader.length };
    // Ingen text här men en oförändrad gammal klassning → behåll den (se STEGVIS ovan).
    const g = !texter[cit] ? ateranvand(nyckel, rader) : null;
    if (g) {
      ateranvanda++;
      sum[lager + ' ' + g.klass] = (sum[lager + ' ' + g.klass] || 0) + 1;
      poster.push({ ...g, gata: bas.gata, stadsdel: bas.stadsdel, stracker: bas.stracker });
      continue;
    }
    // Olika VALID_FROM inom samma ärende → vi vet inte vilken rad texten gäller.
    const datum = new Set(rader.map(r => String(r.VALID_FROM || '').slice(0, 10)));
    let klass, regler = null, mening = '', orsak = '';
    const text = texter[cit];
    if (!text) { klass = 'olasbar'; }
    else if (datum.size > 1) { klass = 'oklar'; orsak = 'olika VALID_FROM'; }
    // Utan datum kan vakten i appen inte se att föreskriften ändrats («» === «» släpper igenom
    // allt). Testgrinden fångade två sådana (Munkbroleden, Pippi Långstrumps Gata, 2026-09-27).
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(bas.gallerFran)) { klass = 'oklar'; orsak = 'VALID_FROM saknas'; }
    else if (rader.some(r => r.START_MONTH != null || r.ODD_EVEN != null)) { klass = 'oklar'; orsak = 'säsong/udda-jämn i datan'; }
    else {
      const t = tolka(text, lager);
      mening = t.mening;
      if (t.dock.length) bas.dock = t.dock;
      if (t.dock.some(r => HELGDAGTYPER.has(r[0]))) bas.dockHelg = true;
      const data = rader.map(dataRegel);
      if (t.oklar.length) { klass = 'oklar'; orsak = t.oklar.join(', '); }
      else if (!t.regler.length) { klass = 'oklar'; orsak = 'inga fönster i texten'; }
      else if (data.some(d => d === null)) { klass = 'oklar'; orsak = 'rad utan tolkbart fönster i datan'; }
      else {
        const nyckel = r => r.join('|');
        const textSet = new Set(t.regler.map(nyckel));
        const dataSet = new Set(data.map(nyckel));
        const saknasITexten = [...dataSet].filter(k => !textSet.has(k));
        const saknasIData = [...textSet].filter(k => !dataSet.has(k));
        if (saknasITexten.length) { klass = 'avvikelse'; orsak = 'texten saknar ' + saknasITexten.join('; '); }
        else if (saknasIData.length) { klass = 'dolda'; regler = t.regler; orsak = 'datan saknar ' + saknasIData.join('; '); }
        else { klass = 'lika'; }
      }
    }
    sum[lager + ' ' + klass] = (sum[lager + ' ' + klass] || 0) + 1;
    poster.push({ ...bas, klass, ...(regler ? { regler } : {}), ...(orsak ? { orsak } : {}), ...(mening ? { mening } : {}) });
  }
  poster.sort((a, b) => a.citation.localeCompare(b.citation));
  const idag = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(UT, JSON.stringify({
    beskrivning: 'Stockholms föreskrifter lästa i RDT och jämförda med kartdatans tidsrader. Se las-sthlm-fonster.js.',
    last: idag, sammanfattning: sum, poster }, null, 1));
  console.log(JSON.stringify(sum, null, 1));
  console.log(ateranvanda + ' återanvända utan omläsning (oförändrat VALID_FROM, ingen text i cachen).');
})().catch(e => { console.error('FEL: ' + e.message); process.exit(2); });
