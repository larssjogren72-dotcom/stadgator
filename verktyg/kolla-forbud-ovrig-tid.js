// Vaktar tabellen i forbud-ovrig-tid.json mot Stockholms kartdata.
//
//   node verktyg/kolla-forbud-ovrig-tid.js              → rapport, ändrar ingenting
//   node verktyg/kolla-forbud-ovrig-tid.js --uppdatera  → läser om RDT för det som
//                                                          driftat och skriver om JSON
//
// Exit 0 = allt stämmer. Exit 1 = något har ändrats och behöver ses över.
//
// VARFÖR DEN BEHÖVS: tabellen är 46 föreskrifter vars TEXT säger att parkering är
// förbjuden även utanför tidsfönstret. Texten lästes en gång. Ändrar staden en
// föreskrift slutar raden gälla — appens vakt (parkeringForbjudenOvrigTid) upptäcker
// det och faller tillbaka på gammalt beteende, alltså grönt. Det är säkert mot att
// visa fel, men tyst: sträckan slutar få rött utan att någon får veta.
//
// TVÅ FRÅGOR, INTE EN:
//   1. Har någon av de 46 ändrats?  → jämför VALID_FROM mot det sparade datumet
//   2. Har det tillkommit ärenden vi ALDRIG läst?  → jämför populationen mot
//      forbud-ovrig-tid-lasta.json (de 579 som är genomgångna)
// Fråga 2 går att ställa exakt eftersom populationen är reproducerbar ur två fält:
// VF_PLATS_TYP = "Tidsreglerat parkerings-/stoppförbud" OCH DAY_TYPE satt.
// Verifierat 2026-08-30: filtret ger 579 ärenden och 838 sträckor — exakt de tal
// genomsökningen rapporterade.
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const HAR = __dirname;
const TABELL = path.join(HAR, 'forbud-ovrig-tid.json');
const LASTA  = path.join(HAR, 'forbud-ovrig-tid-lasta.json');
const UPPDATERA = process.argv.includes('--uppdatera');

const PLATS_TYP = 'Tidsreglerat parkerings-/stoppförbud';

// ── Nyckel ──────────────────────────────────────────────────────────────────
// Samma två källor som server.js: env först (CI), annars .apikey (lokalt).
// Nyckeln får ALDRIG hamna i utskriften — den skulle följa med i CI-loggen.
let API_KEY = (process.env.STHLM_API_KEY || '').trim();
if (!API_KEY) {
  try { API_KEY = fs.readFileSync(path.join(HAR, '..', '.apikey'), 'utf8').trim(); } catch {}
}
if (!API_KEY) {
  console.error('Ingen API-nyckel. Sätt STHLM_API_KEY eller lägg en .apikey i projektroten.');
  process.exit(2);
}

function hamta(host, sokvag) {
  return new Promise((res, rej) => {
    const bitar = [];
    const r = https.request({ hostname: host, port: 443, path: sokvag, method: 'GET' }, resp => {
      resp.on('data', c => bitar.push(c));
      resp.on('end', () => res(Buffer.concat(bitar)));
    });
    r.on('error', rej);
    r.setTimeout(120000, () => r.destroy(new Error('timeout mot ' + host)));
    r.end();
  });
}

// ── Föreskriftstext ur RDT ──────────────────────────────────────────────────
// PDF:erna är FlateDecode-strömmar. Bara strömmar som innehåller Tj/TJ bär text.
function pdfText(buf) {
  let raw = '', i = 0;
  while (true) {
    const s = buf.indexOf(Buffer.from('stream'), i);
    if (s < 0) break;
    let st = s + 6;
    if (buf[st] === 13) st++;
    if (buf[st] === 10) st++;
    const e = buf.indexOf(Buffer.from('endstream'), st);
    if (e < 0) break;
    try {
      const d = zlib.inflateSync(buf.slice(st, e), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString('latin1');
      if (/\bTJ\b|\bTj\b/.test(d)) raw += d + '\n';
    } catch {}
    i = e + 9;
  }
  const ut = [];
  const re = /\((?:\\.|[^()\\])*\)/g;
  let m;
  while ((m = re.exec(raw))) {
    let s = m[0].slice(1, -1);
    s = s.replace(/\\([()\\])/g, '$1').replace(/\\(\d{1,3})/g, (a, o) => String.fromCharCode(parseInt(o, 8)));
    ut.push(s);
  }
  return ut.join('').replace(/\s+/g, ' ').trim();
}

// ⚠ KLASSA PÅ HELA TEXTEN, aldrig på en utklippt mening. Föreskrifterna saknar ibland
// punkt: "…övrig tid får fordon inte parkerasDenna författning träder i kraft…".
// Ett meningsfönster missade Torsgatan 0180 2025-02476 av precis det skälet.
// De fyra former som faktiskt förekommer i tabellen är täckta nedan.
function klassa(t) {
  if (/[ÖO]vrig tid får (fordon inte|inte fordon) (stannas eller )?parkeras/i.test(t)) return 'forbjudet';
  // "får endast utryckningsfordon parkeras" = förbjudet för alla andra (Klarabergsviadukten)
  if (/[ÖO]vrig tid får endast [^.]{0,80}parkeras/i.test(t)) return 'forbjudet';
  if (/[ÖO]vrig tid får fordon parkeras/i.test(t)) return 'tillatet';
  if (/[ÖO]vrig tid/i.test(t)) return 'annan';
  return 'ingen';
}

// Läser en föreskrift. STRIKT rubrikmatchning: en ERSÄTTANDE föreskrift nämner det
// gamla numret i brödtexten och skulle annars matcha fel dokument.
async function lasForeskrift(citation) {
  const m = citation.match(/^(\d{4})\s+(\d{4})-(\d+)$/);
  if (!m) return null;
  const url = `/rdt/AF06_View.aspx?BeslutsMyndighetKod=${m[1]}&BeslutadAr=${m[2]}&LopNr=${m[3]}`;
  let html;
  try { html = (await hamta('rdt.transportstyrelsen.se', url)).toString('utf8'); } catch { return null; }
  const ids = [...new Set([...html.matchAll(/ForeskriftId=([0-9a-f-]{36})/g)].map(x => x[1]))];
  for (const id of ids.slice(0, 4)) {
    try {
      const t = pdfText(await hamta('rdt.transportstyrelsen.se',
                 '/rdt/AF06_ViewDocument.aspx?ForeskriftId=' + id));
      const rubrik = t.slice(0, 120);
      if (rubrik.includes(`${m[1]} ${m[2]}:${m[3]}`) || rubrik.includes(`${m[1]} ${m[2]}-${m[3]}`)) return t;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  return null;
}

// Meningen ordagrant, för tabellen. Faller tillbaka på en tom sträng.
function slutmening(t) {
  const m = t.match(/[ÖO]vrig tid[^.]{0,200}(\.|(?=Denna |Dessa ))/);
  return m ? m[0].trim() : '';
}

(async () => {
  const tabell = JSON.parse(fs.readFileSync(TABELL, 'utf8'));
  const lasta  = JSON.parse(fs.readFileSync(LASTA, 'utf8'));
  const lastaSet = new Set(lasta.arenden.map(a => a.cit));

  // ── Ett anrop, hela lagret. propertyName utan geometri: 17 MB, ~6 s. ───────
  const falt = 'CITATION,VALID_FROM,VALID_TO,DAY_TYPE,VF_PLATS_TYP,STREET_NAME,CITY_DISTRICT';
  // ⚠ SÖKVÄGEN ÄR `/geoservice/api/{nyckel}/wfs`, INTE `/server/wfs`. Det senare
  // svarar 404 med en JSON-kropp – alltså inte XML, och `features` blir bara
  // undefined. Första körningen rapporterade då "46 rader finns inte kvar i lagret",
  // ett falsklarm som såg ut som ett riktigt fynd. Vakten nedan gör om tystnaden
  // till ett fel: saknas `features` är det ALLTID vi som frågat fel, aldrig ett svar.
  const sokvag = `/geoservice/api/${API_KEY}/wfs`
    + '?service=WFS&version=1.1.0&request=GetFeature'
    + '&typeName=ltfr:LTFR_P_FORBUD_GEOM&outputFormat=application/json'
    + '&propertyName=' + falt;
  const rat = await hamta('openstreetgs.stockholm.se', sokvag);
  const txt = rat.toString('utf8');
  const dolj = t => t.replace(new RegExp(API_KEY, 'g'), '***');
  if (txt.trimStart().startsWith('<')) {
    console.error('WFS svarade med XML (fel eller utgången nyckel):');
    console.error(dolj(txt.slice(0, 300)));
    process.exit(2);
  }
  let svar;
  try { svar = JSON.parse(txt); } catch { console.error('WFS-svaret gick inte att tolka:'); console.error(dolj(txt.slice(0, 300))); process.exit(2); }
  if (!Array.isArray(svar.features)) {
    console.error('WFS-svaret saknar features – frågan gick fel, datan är inte tom:');
    console.error(dolj(txt.slice(0, 300)));
    process.exit(2);
  }
  const features = svar.features.map(f => f.properties);
  // Ett tömt lager är inte en trolig verklighet – det är ett trasigt anrop. Hellre
  // avbryta än rapportera att hela tabellen försvunnit.
  if (features.length < 1000) {
    console.error('Bara ' + features.length + ' poster i lagret. Förväntat tiotusentals – avbryter.');
    process.exit(2);
  }

  // ── Populationen, exakt som genomsökningen definierade den ────────────────
  const pop = new Map();
  for (const p of features) {
    if ((p.VF_PLATS_TYP || '') !== PLATS_TYP || !p.DAY_TYPE || !p.CITATION) continue;
    if (!pop.has(p.CITATION)) pop.set(p.CITATION, { poster: [], gata: p.STREET_NAME || '', omr: p.CITY_DISTRICT || '' });
    pop.get(p.CITATION).poster.push(p);
  }

  // ── Fråga 1: har någon av de 46 driftat? ──────────────────────────────────
  // Jämför EXAKT som appen gör: String(VALID_FROM).slice(0,10). Rådatan är UTC
  // ("2017-03-08T23:00:00Z" = 9 mars lokal tid), så en egen datumtolkning här
  // skulle ge en annan dag än vakten i index.html och rapportera falsk drift.
  const drift = [], borta = [], upphavda = [], ok = [];
  const idag = new Date().toISOString().slice(0, 10);
  for (const post of tabell.poster) {
    const p = pop.get(post.citation);
    if (!p) { borta.push(post); continue; }
    const nu = String(p.poster[0].VALID_FROM || '').slice(0, 10);
    const slut = p.poster[0].VALID_TO ? String(p.poster[0].VALID_TO).slice(0, 10) : null;
    if (slut && slut < idag) { upphavda.push({ ...post, upphorde: slut }); continue; }
    if (nu !== post.gallerFran) { drift.push({ ...post, nu, strackor: p.poster.length }); continue; }
    ok.push(post);
  }

  // ── Fråga 2: finns ärenden i populationen som aldrig lästs? ───────────────
  const nya = [];
  for (const [cit, v] of pop) {
    if (!lastaSet.has(cit)) nya.push({ citation: cit, gata: v.gata, stadsdel: v.omr, strackor: v.poster.length });
  }
  const forsvunna = lasta.arenden.filter(a => !pop.has(a.cit));

  // ── Rapport ───────────────────────────────────────────────────────────────
  const rad = (n, t) => String(n).padStart(4) + '  ' + t;
  console.log('Kontroll av forbud-ovrig-tid.json mot Stockholms kartdata, ' + idag);
  console.log('');
  console.log(rad(features.length, 'poster i LTFR_P_FORBUD_GEOM'));
  console.log(rad(pop.size, 'ärenden i populationen (' + PLATS_TYP + ' + DAY_TYPE)'));
  console.log(rad(lasta.antal, 'ärenden som är lästa i RDT'));
  console.log('');
  console.log(rad(ok.length, 'rader i tabellen stämmer'));
  console.log(rad(drift.length, 'rader har ETT NYTT VALID_FROM  → texten måste läsas om'));
  console.log(rad(upphavda.length, 'rader är upphävda (VALID_TO passerat)'));
  console.log(rad(borta.length, 'rader finns inte kvar i lagret'));
  console.log(rad(nya.length, 'ärenden i populationen har ALDRIG lästs'));
  console.log(rad(forsvunna.length, 'lästa ärenden finns inte längre i populationen'));

  const visa = (rubrik, lista, fmt) => {
    if (!lista.length) return;
    console.log('\n── ' + rubrik + ' ' + '─'.repeat(Math.max(0, 60 - rubrik.length)));
    lista.forEach(x => console.log('  ' + fmt(x)));
  };
  visa('Driftade rader', drift, x => `${x.citation}  ${x.gallerFran} → ${x.nu}  ${x.gata}, ${x.stadsdel}`);
  visa('Upphävda rader', upphavda, x => `${x.citation}  upphörde ${x.upphorde}  ${x.gata}, ${x.stadsdel}`);
  visa('Borta ur lagret', borta, x => `${x.citation}  ${x.gata}, ${x.stadsdel}`);
  visa('Aldrig lästa', nya, x => `${x.citation}  ${x.strackor} sträckor  ${x.gata}, ${x.stadsdel}`);
  visa('Försvunna ur populationen', forsvunna, x => `${x.cit}  ${x.gata}, ${x.omr}`);

  const attGora = drift.length + upphavda.length + borta.length + nya.length;
  if (!attGora) {
    console.log('\nInget att göra.');
    process.exit(0);
  }

  if (!UPPDATERA) {
    console.log('\nKör om med --uppdatera för att läsa om texten för det som ändrats.');
    console.log('Skriv INTE tabellen för hand — kör verktyg/bygg-forbud-ovrig-tid.js efteråt.');
    process.exit(1);
  }

  // ── --uppdatera: läs om RDT för det som ändrats ───────────────────────────
  // Bara det som driftat eller är nytt läses. En oförändrad rad rörs aldrig —
  // Transportstyrelsens server ska inte belastas med 579 anrop varje månad.
  console.log('\nLäser om ' + (drift.length + nya.length) + ' föreskrifter i RDT…\n');
  const nyaPoster = [];
  for (const x of drift) {
    const t = await lasForeskrift(x.citation);
    if (!t) { console.log('  ? ' + x.citation + '  gick inte att läsa – raden lämnas orörd'); nyaPoster.push(x); continue; }
    const k = klassa(t);
    console.log('  ' + (k === 'forbjudet' ? '✓' : '✗') + ' ' + x.citation + '  ' + k);
    if (k === 'forbjudet') nyaPoster.push({ ...x, gallerFran: x.nu, mening: slutmening(t) || x.mening });
    // annan klass → raden ska bort, den läggs helt enkelt inte tillbaka
  }
  for (const x of nya) {
    const t = await lasForeskrift(x.citation);
    if (!t) { console.log('  ? ' + x.citation + '  gick inte att läsa'); continue; }
    const k = klassa(t);
    console.log('  ' + (k === 'forbjudet' ? '+' : '·') + ' ' + x.citation + '  ' + k + '  (ny)');
    if (k !== 'forbjudet') continue;
    const p = pop.get(x.citation).poster[0];
    nyaPoster.push({ citation: x.citation, gallerFran: String(p.VALID_FROM || '').slice(0, 10),
                     gata: x.gata, stadsdel: x.stadsdel, stracker: x.strackor, mening: slutmening(t) });
  }

  // Behåll de oförändrade, lägg till de omlästa. Upphävda och borttagna faller bort.
  const kvar = tabell.poster.filter(p => ok.some(o => o.citation === p.citation));
  const alla = kvar.concat(nyaPoster).sort((a, b) => a.citation.localeCompare(b.citation));
  tabell.poster = alla;
  tabell.last = idag;
  tabell.genomsokt = { arendenummer: pop.size, kartstrackor: alla.reduce((a, b) => a + (b.stracker || 0), 0),
                       ejLasbara: tabell.genomsokt ? tabell.genomsokt.ejLasbara : 0 };
  fs.writeFileSync(TABELL, JSON.stringify(tabell, null, 1));

  // Populationen är nu genomläst till och med i dag.
  const lastaNu = [...pop.entries()].map(([cit, v]) => ({ cit, gata: v.gata, omr: v.omr, n: v.poster.length }))
                    .sort((a, b) => a.cit.localeCompare(b.cit));
  lasta.arenden = lastaNu; lasta.antal = lastaNu.length;
  lasta.kartstrackor = lastaNu.reduce((a, b) => a + b.n, 0); lasta.last = idag;
  fs.writeFileSync(LASTA, JSON.stringify(lasta, null, 1));

  console.log('\nSkrivet: ' + alla.length + ' rader i tabellen (' + (alla.length - tabell.poster.length + nyaPoster.length) + ' omlästa).');
  console.log('Kör nu: node verktyg/bygg-forbud-ovrig-tid.js  — och granska diffen innan du committar.');
  process.exit(1);
})().catch(e => { console.error('FEL: ' + e.message); process.exit(2); });
