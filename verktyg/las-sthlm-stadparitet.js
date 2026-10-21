// Läser Stockholms STÄDföreskrifter ur RDT och tar fram udda/jämn vecka.
//
//   node verktyg/las-sthlm-stadparitet.js            → läser bara nya och ändrade föreskrifter
//   node verktyg/las-sthlm-stadparitet.js --inte-las → inga RDT-anrop alls
//   node verktyg/las-sthlm-stadparitet.js --kolla    → rapport, ändrar ingenting. Exit 0 = inget
//                                                       att göra, 1 = något ändrat, 2 = fel
//
// Skriver verktyg/sthlm-stad-paritet.json. Den läses av server.js (refreshSchedule) – ingen
// generator, inget block i index.html. Servern sätter ODD_WEEKS/EVEN_WEEKS på städposterna,
// och appens befintliga weekParityMatches (byggd för Göteborg) gör resten.
//
// ── VARFÖR (2026-10-21) ──────────────────────────────────────────────────────
// Stockholms servicedagar-API har inga fält för udda/jämn vecka. Västra Kungsholmen
// (Fredhäll, Kristineberg, Marieberg) har på sommaren städning varannan vecka:
//   «Parkering är dock förbjuden onsdag klockan 09.00 - 14.00 utom under tiden udda
//    veckor 1 maj - 31 oktober.»                              (Wivalliusgatan 0180 2017:07441)
// Datan delar det i en vinterrad (1/11–30/4) och en sommarrad (1/5–31/10) med SAMMA dag och
// tid – undantaget för udda veckor finns bara i texten. Appen varnade därför varje vecka.
// Uppmätt 2026-10-21: alla ~7 170 städföreskrifter i Stockholm lästa; udda/jämn vecka finns
// BARA på västra Kungsholmen (~108 föreskrifter). Roboten läser ändå alla, så att ett nytt
// område med varannan vecka upptäcks – en datamängd kan inte bevisa sin egen fullständighet.
//
// ── SÄKERHETSSPÄRRAR ────────────────────────────────────────────────────────
// Fel paritet DÖLJER en städning som gäller = kontrollavgift. Därför:
//   · Bara EN formulering tolkas: «förbjuden <veckodag> klockan HH.MM - HH.MM utom (under
//     tiden) udda|jämna veckor <dag> <månad> - <dag> <månad>.» Allt annat → «oklar».
//   · Varje omnämnande av udda/jämna veckor i texten måste ha tolkats. Ett enda otolkat
//     (t.ex. «tillåten … udda veckor», «udda veckor och 1 maj – 31 oktober») → hela
//     föreskriften «oklar», och ingen av dess rader får paritet.
//   · Den tolkade meningen måste stämma EXAKT med en rad i datan: veckodag, klockslag och
//     säsong. Annars «oklar».
//   · Raden bär VALID_FROM; servern sätter pariteten bara om datumet stämmer.
// «oklar» = dagens beteende (varning varje vecka). Tolkningen kan bara ta bort en varning
// där texten uttryckligen säger att förbudet inte gäller den veckan.
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const HAR = __dirname;
const TEXTER = path.join(HAR, '.rdt-stadtexter.json');  // gitignorerad cache: citation → text
const UT = path.join(HAR, 'sthlm-stad-paritet.json');
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

// ── RDT – samma två funktioner som las-sthlm-fonster.js ─────────────────────
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
// PDF-utvinningen klistrar ihop ord vid radbrytning («uddaveckor», «1maj», «onsdagklockan»).
function normalisera(t) {
  return t
    .replace(/klockan(?=\d)/g, 'klockan ')
    .replace(/([a-zåäö])klockan/g, '$1 klockan')
    .replace(/\b(udda|jämna)(?=veckor)/g, '$1 ')
    .replace(/(\d)(?=(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\b)/g, '$1 ')
    .replace(/\s+/g, ' ');
}
const MANAD = { januari: 1, februari: 2, mars: 3, april: 4, maj: 5, juni: 6, juli: 7, augusti: 8,
                september: 9, oktober: 10, november: 11, december: 12 };
const OMNAMNANDE = /\b(udda|jämna) veckor/gi;
const MENING = new RegExp(
  'förbjuden (måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag) klockan (\\d{2})\\.(\\d{2}) ?- ?(\\d{2})\\.(\\d{2}),?'
  + ' utom (?:under (?:tiden )?)?(udda|jämna) veckor (?:under tiden )?(\\d{1,2}) ([a-zåäö]+) ?- ?(\\d{1,2}) ([a-zåäö]+) ?\\.', 'gi');

// → { regler:[{dag,s,e,sm,sd,em,ed,stadas}], omnamnanden, mening }
function tolka(text) {
  const t = normalisera(text);
  const omnamnanden = (t.match(OMNAMNANDE) || []).length;
  const regler = [], meningar = [];
  let x;
  MENING.lastIndex = 0;
  while ((x = MENING.exec(t))) {
    const sm = MANAD[x[8].toLowerCase()], em = MANAD[x[10].toLowerCase()];
    if (!sm || !em) continue;
    // «utom udda veckor» = förbudet gäller INTE udda veckor → städas jämna (och tvärtom).
    regler.push({ dag: x[1].toLowerCase(), s: +x[2] * 100 + +x[3], e: +x[4] * 100 + +x[5],
                  sm, sd: +x[7], em, ed: +x[9], stadas: x[6].toLowerCase() === 'udda' ? 'jamna' : 'udda' });
    meningar.push(x[0]);
  }
  return { regler, omnamnanden, mening: meningar.join(' ') };
}

// ── Data ────────────────────────────────────────────────────────────────────
const API_DAGAR = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];
async function stadrader() {
  const ut = [];
  for (const dag of API_DAGAR) {
    const p = `/LTF-Tolken/v1/servicedagar/weekday/${encodeURIComponent(dag)}?outputFormat=json&apiKey=${encodeURIComponent(API_KEY)}`;
    const j = JSON.parse((await hamta('openparking.stockholm.se', p)).toString('utf8'));
    if (!Array.isArray(j.features)) throw new Error('servicedagar utan features för ' + dag);
    for (const f of j.features) ut.push(f.properties || {});
  }
  return ut;
}
const datum = p => String(p.VALID_FROM || '').slice(0, 10);

(async () => {
  const rader = (await stadrader()).filter(p => p.CITATION);
  if (rader.length < 8000) { console.error('Misstänkt få städrader (' + rader.length + ') – avbryter.'); process.exit(2); }
  const pop = new Map();                                   // citation → rader
  for (const p of rader) { const a = pop.get(p.CITATION) || []; a.push(p); pop.set(p.CITATION, a); }
  // Föreskriftens «version» = alla dess VALID_FROM. Ändras någon ska texten läsas om.
  const version = rs => [...new Set(rs.map(datum))].sort().join(',');

  const gammal = fs.existsSync(UT) ? JSON.parse(fs.readFileSync(UT, 'utf8')) : { lasta: {}, paritet: [] };
  const gamlaLasta = gammal.lasta || {};
  const gamlaParitet = new Map();
  for (const r of gammal.paritet || []) { const a = gamlaParitet.get(r.citation) || []; a.push(r); gamlaParitet.set(r.citation, a); }
  const ateranvand = (cit, rs) => { const g = gamlaLasta[cit]; return g && g[1] !== 'olasbar' && g[0] === version(rs) ? g : null; };

  // ── --kolla ────────────────────────────────────────────────────────────────
  const nya = [], andrade = [], olasbara = [];
  for (const [cit, rs] of pop) {
    const g = gamlaLasta[cit];
    if (!g) nya.push(cit);
    else if (g[0] !== version(rs)) andrade.push(cit);
    else if (g[1] === 'olasbar') olasbara.push(cit);
  }
  const borta = Object.keys(gamlaLasta).filter(c => !pop.has(c));
  if (KOLLA) {
    const rad = (n, t) => String(n).padStart(5) + '  ' + t;
    console.log('Kontroll av sthlm-stad-paritet.json mot Stockholms städdata, ' + new Date().toISOString().slice(0, 10));
    console.log(rad(pop.size, 'städföreskrifter i datan'));
    console.log(rad(Object.keys(gamlaLasta).length, 'lästa i tabellen'));
    console.log(rad(nya.length, 'nya – aldrig lästa'));
    console.log(rad(andrade.length, 'ändrade – nytt VALID_FROM, texten måste läsas om'));
    console.log(rad(borta.length, 'borta ur datan'));
    console.log(rad(olasbara.length, 'oläsbara sedan förra gången (försöks igen vid uppdatering)'));
    const visa = (rubrik, lista) => { if (lista.length) { console.log('\n── ' + rubrik); lista.slice(0, 40).forEach(c => console.log('  ' + c + '  ' + (pop.get(c) || [{}])[0].STREET_NAME)); } };
    visa('Nya', nya); visa('Ändrade', andrade);
    if (borta.length) { console.log('\n── Borta'); borta.slice(0, 40).forEach(c => console.log('  ' + c)); }
    process.exit(nya.length + andrade.length + borta.length ? 1 : 0);
  }

  const texter = fs.existsSync(TEXTER) ? JSON.parse(fs.readFileSync(TEXTER, 'utf8')) : {};
  if (!INTE_LAS) {
    // Fyra åt gången, som las-sthlm-fonster.js – fler vore ohövligt mot Transportstyrelsen.
    const kvar = [...pop].filter(([c, rs]) => !ateranvand(c, rs)).map(([c]) => c).filter(c => !texter[c]);
    console.error('läser ' + kvar.length + ' föreskrifter i RDT');
    let n = 0;
    const arbetare = async () => {
      while (kvar.length) {
        const c = kvar.shift();
        texter[c] = await lasForeskrift(c);
        if (++n % 100 === 0) { fs.writeFileSync(TEXTER, JSON.stringify(texter)); console.error('läst', n, 'kvar', kvar.length); }
        await new Promise(r => setTimeout(r, 100));
      }
    };
    await Promise.all([arbetare(), arbetare(), arbetare(), arbetare()]);
    fs.writeFileSync(TEXTER, JSON.stringify(texter));
  }

  const lasta = {}, paritet = [], oklara = [], sum = { ingen: 0, paritet: 0, oklar: 0, olasbar: 0 };
  let ateranvanda = 0;
  for (const [cit, rs] of [...pop].sort((a, b) => a[0].localeCompare(b[0]))) {
    const v = version(rs);
    const g = !texter[cit] ? ateranvand(cit, rs) : null;
    if (g) {                                  // oförändrad, ingen text lokalt → behåll
      ateranvanda++; lasta[cit] = g; sum[g[1]]++;
      if (g[1] === 'paritet') paritet.push(...(gamlaParitet.get(cit) || []));
      continue;
    }
    const text = texter[cit];
    if (!text) { lasta[cit] = [v, 'olasbar']; sum.olasbar++; continue; }
    const t = tolka(text);
    if (!t.omnamnanden) { lasta[cit] = [v, 'ingen']; sum.ingen++; continue; }
    // Varje tolkad mening ska träffa minst en rad i datan, och varje omnämnande ska vara tolkat.
    const traffar = [];
    let orsak = '';
    if (t.regler.length !== t.omnamnanden) orsak = `${t.omnamnanden} omnämnanden men ${t.regler.length} tolkade`;
    for (const r of orsak ? [] : t.regler) {
      const hit = rs.filter(p => String(p.START_WEEKDAY || '').toLowerCase() === r.dag
        && +p.START_TIME === r.s && +p.END_TIME === r.e
        && p.START_MONTH === r.sm && p.START_DAY === r.sd && p.END_MONTH === r.em && p.END_DAY === r.ed);
      if (!hit.length) { orsak = `ingen datarad för ${r.dag} ${r.s}-${r.e} ${r.sd}/${r.sm}-${r.ed}/${r.em}`; break; }
      if (new Set(hit.map(datum)).size !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(datum(hit[0]))) { orsak = 'VALID_FROM saknas eller skiljer sig'; break; }
      traffar.push({ citation: cit, gallerFran: datum(hit[0]), gata: hit[0].STREET_NAME || '', stadsdel: hit[0].CITY_DISTRICT || '', ...r });
    }
    if (orsak) {
      lasta[cit] = [v, 'oklar']; sum.oklar++;
      oklara.push({ citation: cit, gata: rs[0].STREET_NAME || '', orsak,
                    utdrag: (normalisera(text).match(/[^.]{0,120}\b(udda|jämna) ?veckor[^.]{0,60}/i) || [''])[0].trim() });
      continue;
    }
    lasta[cit] = [v, 'paritet']; sum.paritet++;
    paritet.push(...traffar.map(r => ({ ...r, mening: t.mening })));
  }
  const idag = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(UT, JSON.stringify({
    beskrivning: 'Udda/jämn vecka ur Stockholms städföreskrifter (RDT). Läses av server.js. Se las-sthlm-stadparitet.js.',
    last: idag, sammanfattning: sum, paritet, oklara, lasta }, null, 1));
  console.log(JSON.stringify(sum, null, 1));
  console.log(paritet.length + ' rader med paritet, ' + oklara.length + ' oklara föreskrifter.');
  console.log(ateranvanda + ' återanvända utan omläsning (oförändrat VALID_FROM, ingen text i cachen).');
})().catch(e => { console.error('FEL: ' + e.message); process.exit(2); });
