'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// PROV FÖR KARLSTAD — körs mot RIKTIG data, inte mot en kopia
// ─────────────────────────────────────────────────────────────────────────────
// Kör:  node test/karlstad-prov.js            (alla prov)
//       node test/karlstad-prov.js koord      (bara ett)
//
// Proven svarar på fyra frågor som alla har kostat tid i tidigare städer:
//   koord   Är koordinatmatematiken exakt? (proj4 är facit, men finns inte i drift)
//   stad    Ger städlagret rätt schema, och matchar det kommunens publicerade sida?
//   park    Får parkeringssträckorna rimliga fält – och hamnar de i METER?
//   svep    Vilka färger uppstår i appens riktiga kod, timme för timme, en vecka?
//
// ⚠ Provet startar INGEN server. Adaptern laddas som modul och anropas direkt –
// samma kod som drift kör, inte en ombyggd kopia (regel 12 i arbetssättet).

const path = require('path');
const https = require('https');
const rot = path.join(__dirname, '..');

const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });
const SCHED_API_DAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
const stad = require(path.join(rot, 'cities', 'karlstad.js'))({
  https, keepAliveAgent, send: () => {}, segDistM: () => 0, SCHED_API_DAYS,
  fs: require('fs'), path, rot
});

let fel = 0;
const ok = (namn, villkor, detalj) => {
  console.log((villkor ? '  OK   ' : '  FEL  ') + namn + (detalj ? '  ·  ' + detalj : ''));
  if (!villkor) fel++;
};

// Hämtar via adapterns egen väg, utan HTTP-server: vi kallar hantera() med en
// låtsas-res som samlar kroppen.
function anropa(vag) {
  return new Promise((klar, nej) => {
    const bitar = [];
    const res = {
      setHeader() {}, writeHead() {},
      end(b) { try { klar(JSON.parse(String(b))); } catch (e) { nej(e); } }
    };
    const req = { headers: {} };
    // send() i servern skriver kroppen; här kortsluter vi den.
    const deladeSend = (rq, rs, kod, typ, buf) => { rs.end(buf); };
    const s = require(path.join(rot, 'cities', 'karlstad.js'))({
      https, keepAliveAgent, send: deladeSend, segDistM: () => 0, SCHED_API_DAYS,
      fs: require('fs'), path, rot
    });
    const u = new URL('http://x' + vag);
    if (!s.hantera({ pathname: u.pathname, searchParams: u.searchParams }, req, res)) nej(new Error('vägen togs inte om hand: ' + vag));
    setTimeout(() => nej(new Error('timeout: ' + vag)), 60000).unref();
  });
}

// ── 1. KOORDINATER ──────────────────────────────────────────────────────────
// Karlstads GeoServer avrundar grader till två decimaler (~1 km), så adaptern
// räknar själv. Här prövas den matematiken mot proj4 – som finns lokalt men INTE
// i drift, och därför aldrig får användas av adaptern.
async function provKoord() {
  console.log('\n── koordinater (facit: proj4) ──');
  let proj4;
  try { proj4 = require('proj4'); }
  catch (e) { console.log('  HOPPAS ÖVER: proj4 saknas lokalt'); return; }
  proj4.defs('EPSG:3011', '+proj=tmerc +lat_0=0 +lon_0=18 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +units=m +no_defs');

  const punkter = [
    ['Stora torget', 13.5028, 59.3793],
    ['Karlstad C', 13.4899, 59.3830],
    ['Kronoparken', 13.5765, 59.3949],
    ['Stockholm (kontroll)', 18.0686, 59.3293],
    ['Göteborg (kontroll)', 11.9668, 57.7009]
  ];
  let varst = 0;
  for (const [namn, lon, lat] of punkter) {
    const [x, y] = stad._tillTM(lon, lat);
    const [px, py] = proj4('WGS84', 'EPSG:3011', [lon, lat]);
    const dFram = Math.hypot(x - px, y - py);
    const [lon2, lat2] = stad._franTM(x, y);
    // Tillbaka till grader: jämför i meter, inte i grader.
    const dTill = Math.hypot((lon2 - lon) * 111320 * Math.cos(lat * Math.PI / 180), (lat2 - lat) * 111320);
    varst = Math.max(varst, dFram, dTill);
    ok(namn, dFram < 0.01 && dTill < 0.01,
       'mot proj4 ' + dFram.toFixed(4) + ' m · fram och tillbaka ' + dTill.toFixed(4) + ' m');
  }
  ok('största avvikelse under 1 cm', varst < 0.01, varst.toFixed(4) + ' m');
}

// ── 2. STÄDNING ─────────────────────────────────────────────────────────────
async function provStad() {
  console.log('\n── servicedagar ──');
  // Hela centrala Karlstad
  const bbox = '13.44,59.36,13.56,59.41';
  const alla = await anropa('/karlstad/servicedagar-bbox?dagar=0,1,2,3,4,5,6&bbox=' + bbox);
  const per = {};
  let n = 0;
  for (const [d, fc] of Object.entries(alla.dagar)) { per[d] = fc.features.length; n += fc.features.length; }
  // 184 = 200 rader i städlagret minus 16 tomma. Därtill kommer parkeringslagrets
  // egna förbudstexter där de är oense med städlagret (konfliktregeln).
  const urStad = Object.values(alla.dagar).reduce((s, fc) => s + fc.features.filter(f => f.properties.KARLSTAD_KALLA === 'servicedagar').length, 0);
  const urText = Object.values(alla.dagar).reduce((s, fc) => s + fc.features.filter(f => f.properties.KARLSTAD_KALLA === 'parkeringstext').length, 0);
  ok('städsegment ur städlagret', urStad === 184, urStad + ' (väntat 184 = 200 rader minus 16 tomma)');
  ok('konfliktregeln lade till parkeringslagrets avvikande texter', urText > 0 && urText < 20, urText + ' segment');
  ok('bara vardagar har städning', !per['0'] && !per['6'], 'lör ' + (per['6'] || 0) + ', sön ' + (per['0'] || 0));

  const enDag = await anropa('/karlstad/servicedagar-bbox?dag=torsdag&bbox=' + bbox);
  const f = enDag.features[0];
  ok('geometrin är GRADER, inte meter', !!f && Math.abs(f.geometry.coordinates[0][0]) < 180,
     f ? 'första x = ' + f.geometry.coordinates[0][0].toFixed(5) : '');
  ok('geometrin ligger i Karlstad', !!f && f.geometry.coordinates[0][0] > 13.3 && f.geometry.coordinates[0][0] < 13.7
     && f.geometry.coordinates[0][1] > 59.3 && f.geometry.coordinates[0][1] < 59.45,
     f ? f.geometry.coordinates[0].map(v => v.toFixed(4)).join(', ') : '');
  ok('ingen säsong sätts', enDag.features.every(x => x.properties.START_MONTH === null), 'året runt');
  ok('veckoparitet finns', enDag.features.some(x => x.properties.EVEN_WEEKS || x.properties.ODD_WEEKS));
  ok('klockslag är heltal (HHMM)', enDag.features.every(x => Number.isInteger(x.properties.START_TIME) && x.properties.START_TIME % 100 === 0));

  // Facit: kommunens egen publicerade lista, per veckodag/vecka/klockslag.
  const facit = require(path.join(rot, 'verktyg', 'karlstad-servicedagar-facit.json'));
  const DAG_NR = { 'Måndag': 1, 'Tisdag': 2, 'Onsdag': 3, 'Torsdag': 4, 'Fredag': 5 };
  let grupperRatt = 0;
  for (const rad of facit.rader) {
    const d = DAG_NR[rad.veckodag];
    const jamn = rad.vecka === 'jämna';
    const [s, e] = rad.klockslag.split('-').map(v => +v * 100);
    const traff = (alla.dagar[d] || { features: [] }).features.filter(x =>
      x.properties.START_TIME === s && x.properties.END_TIME === e &&
      x.properties.EVEN_WEEKS === jamn && x.properties.ODD_WEEKS === !jamn);
    if (traff.length) grupperRatt++;
    else console.log('    saknad grupp: ' + rad.veckodag + ' ' + rad.vecka + ' ' + rad.klockslag);
  }
  ok('alla 21 grupper i kommunens lista finns i datan', grupperRatt === facit.rader.length,
     grupperRatt + ' av ' + facit.rader.length);
}

// ── 3. PARKERING ────────────────────────────────────────────────────────────
async function provPark() {
  console.log('\n── parkering ──');
  const fc = await anropa('/karlstad/wfs-tillaten?BBOX=13.44,59.36,13.56,59.41');
  const F = fc.features;
  ok('sträckor levererade', F.length > 300, F.length + ' linjer');
  const c = F[0].geometry.coordinates[0];
  ok('geometrin är METER (EPSG:3011)', Math.abs(c[0]) > 1000,
     'första x = ' + c[0] + ' (klientens toLatLng kräver abs > 1000)');
  ok('alla har platstyp', F.every(f => f.properties.VF_PLATS_TYP === 'P Avgift'));
  const medNamn = F.filter(f => f.properties.STREET_NAME).length;
  ok('de flesta har gatunamn', medNamn / F.length > 0.7, medNamn + ' av ' + F.length);
  const medTid = F.filter(f => f.properties.MAX_MINUTES != null || f.properties.MAX_HOURS != null || f.properties.MAX_DAYS != null);
  ok('tidsgräns finns på ungefär hälften', medTid.length > 100, medTid.length + ' av ' + F.length);
  ok('ingen VF_METER hittas på', F.every(f => f.properties.VF_METER === null));
  ok('prisrad finns', F.filter(f => f.properties.PARKING_RATE).length / F.length > 0.9);
  ok('ingen rå HTML i prisraden', F.every(f => !/[<>]/.test(f.properties.PARKING_RATE || '')));
  const ex = F.find(f => f.properties.STREET_NAME && f.properties.MAX_DAYS);
  if (ex) console.log('    exempel: ' + ex.properties.STREET_NAME + ' · ' + ex.properties.PARKING_RATE
    + ' · max ' + ex.properties.MAX_DAYS + ' dygn · ' + (ex.properties.VF_PLATSER || '?') + ' platser');

  console.log('\n── anläggningar ──');
  const phus = await anropa('/karlstad/phus');
  ok('anläggningar levererade', phus.length > 20, phus.length + ' st');
  ok('alla har koordinater i Karlstad', phus.every(a => a.AdressLatitud > 59.2 && a.AdressLatitud < 59.5
     && a.AdressLongitud > 13.3 && a.AdressLongitud < 13.8));
  ok('ingen rå HTML i namn eller pristext', phus.every(a => !/[<>]/.test(a.Name + (a.KARLSTAD_PRISTEXT || ''))));

  console.log('\n── schema-uppslag ──');
  // ⚠ PUNKTEN TAS UR DATAN, inte ur minnet. Första försöket skrev en handplockad
  // koordinat som låg 310 m fel, och provet gick ändå igenom eftersom det bara
  // frågade om svaret var en lista. Ett prov som kan lyckas med tomt svar provar inget.
  const mandag = await anropa('/karlstad/servicedagar-bbox?dag=måndag&bbox=13.44,59.36,13.56,59.41');
  const linje = mandag.features.find(x => x.properties.STREET_NAME) || mandag.features[0];
  const mitt = linje.geometry.coordinates[Math.floor(linje.geometry.coordinates.length / 2)];
  const sch = await anropa('/karlstad/schedule?lat=' + mitt[1] + '&lng=' + mitt[0]
                         + '&name=' + encodeURIComponent(linje.properties.STREET_NAME || ''));
  ok('schemat hittar städningen på en punkt ur datan', sch.schedule.length > 0,
     (linje.properties.STREET_NAME || 'namnlös') + ' → ' + JSON.stringify(sch.schedule));
  ok('rätt dag och tid tillbaka', sch.schedule.some(x => x.day === 1
     && x.s === linje.properties.START_TIME && x.e === linje.properties.END_TIME));
  ok('schemat bär veckoparitet', sch.schedule.every(s => s.veckor === 'jämna' || s.veckor === 'udda' || s.veckor === null));
  // KONFLIKTREGELN, end-to-end: på Vikengatan säger parkeringslagret «måndagar jämna
  // veckor kl. 10-12» medan städlagret och kommunens publicerade lista säger 08-10.
  // Appen ska varna för BÅDA fönstren. Punkten är sträckans egen, uppmätt 2026-09-17.
  const viken = await anropa('/karlstad/schedule?lat=59.37724&lng=13.49434&name=Vikengatan');
  const vikenMandag = viken.schedule.filter(x => x.day === 1).map(x => x.s + '-' + x.e).sort();
  ok('Vikengatan: båda källornas fönster visas', vikenMandag.includes('800-1000') && vikenMandag.includes('1000-1200'),
     'måndag: ' + vikenMandag.join(', '));
  // En punkt långt från varje städgata ska ge tomt schema, inte närmaste gata.
  const langtBort = await anropa('/karlstad/schedule?lat=59.3450&lng=13.4300&name=');
  ok('långt från en städgata ger tomt schema', langtBort.schedule.length === 0);
}

// ── 4. DYGNSSVEP ────────────────────────────────────────────────────────────
// Vilka färger uppstår, timme för timme, under en hel vecka? Provet kör appens
// EGNA regler (samma villkor som index.html) mot adapterns riktiga svar.
async function provSvep() {
  console.log('\n── dygnssvep: vilka städfönster är aktiva när ──');
  const alla = await anropa('/karlstad/servicedagar-bbox?dagar=0,1,2,3,4,5,6&bbox=13.44,59.36,13.56,59.41');
  // Samma paritetsregel som index.html weekParityMatches.
  const isoWeek = d => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dag = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dag);
    return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
  };
  const paritetOk = (p, d) => {
    if (p.ODD_WEEKS && p.EVEN_WEEKS) return true;
    if (!p.ODD_WEEKS && !p.EVEN_WEEKS) return true;
    return (isoWeek(d) % 2 === 1) ? !!p.ODD_WEEKS : !!p.EVEN_WEEKS;
  };
  const start = new Date();
  const rader = [];
  for (let dagOffset = 0; dagOffset < 14; dagOffset++) {
    const d = new Date(start); d.setDate(d.getDate() + dagOffset);
    const fc = alla.dagar[d.getDay()] || { features: [] };
    const aktiva = fc.features.filter(f => paritetOk(f.properties, d));
    rader.push({ datum: d.toISOString().slice(0, 10), vecka: isoWeek(d), dag: SCHED_API_DAYS[d.getDay()], antal: aktiva.length });
  }
  rader.forEach(r => console.log('    ' + r.datum + ' v' + r.vecka + ' ' + r.dag.padEnd(8) + String(r.antal).padStart(4) + ' städsträckor'));
  const total = rader.reduce((s, r) => s + r.antal, 0);
  ok('städning uppstår under två veckor', total > 0, total + ' sträckdagar');
  const uddaVecka = rader.filter(r => r.vecka % 2 === 1).reduce((s, r) => s + r.antal, 0);
  const jamnVecka = rader.filter(r => r.vecka % 2 === 0).reduce((s, r) => s + r.antal, 0);
  ok('jämna och udda veckor skiljer sig', uddaVecka !== jamnVecka, 'udda ' + uddaVecka + ' · jämna ' + jamnVecka);
}

(async () => {
  const bara = process.argv[2];
  const prov = { koord: provKoord, stad: provStad, park: provPark, svep: provSvep };
  for (const [namn, fn] of Object.entries(prov)) {
    if (bara && bara !== namn) continue;
    try { await fn(); }
    catch (e) { console.log('  FEL  ' + namn + ' kastade: ' + e.message); fel++; }
  }
  console.log('\n' + (fel ? fel + ' PROV MISSLYCKADES' : 'Alla prov gick igenom'));
  process.exit(fel ? 1 : 0);
})();
