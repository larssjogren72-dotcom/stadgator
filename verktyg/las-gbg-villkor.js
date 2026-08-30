// Hämtar Göteborgs villkorsmeningar och översätter dem till NÄR tidsgränsen gäller.
// Skriver om verktyg/gbg-maxtid-villkor.json.
//
//   node verktyg/las-gbg-villkor.js            → rapport, ändrar ingenting
//   node verktyg/las-gbg-villkor.js --skriv    → skriver filen
//
// Syskon till las-gbg-lastplats.js. Skillnaden är populationen: här allt UTOM
// lastplats som bär en MaxParkingTime, eftersom appen slår upp villkoret enbart
// när det finns en gräns att stänga av (`s.maxMinutes != null`).
//
// TVÅ SAKER SOM ALDRIG FÅR GÅ FÖRLORADE när filen skrivs om:
//   1. `utelamnade` – meningar en människa medvetet lämnat utanför. De skrivs
//      tillbaka orörda. "Tillåtelsen gäller …" säger när TILLÅTELSEN gäller,
//      inte när gränsen gör det; att svara "ingen gräns" utanför fönstret vore
//      fel åt det farliga hållet.
//   2. Rader vars mening finns kvar i datan men INTE går att tolka. De hamnar
//      inte i tabellen – och då säger appen "vet inte", vilket är dagens
//      beteende. Tolkningen får aldrig hitta på en regel.
const fs = require('fs');
const path = require('path');
const https = require('https');

const HAR = path.join(__dirname);
const FIL = path.join(HAR, 'gbg-maxtid-villkor.json');
const SKRIV = process.argv.includes('--skriv');
const { P_LAGER_LISTA } = require(path.join(HAR, '..', 'cities', 'goteborg.js'));

function hamta(sokvag) {
  return new Promise((res, rej) => {
    const b = [];
    const r = https.request({ hostname: 'open.geodata.tkgbg.se', port: 443, path: sokvag }, x => {
      x.on('data', c => b.push(c));
      x.on('end', () => {
        const t = Buffer.concat(b).toString('utf8');
        if (t.trimStart().startsWith('<')) return rej(new Error('WFS-undantag: ' + t.slice(0, 200)));
        try { res(JSON.parse(t)); } catch (e) { rej(e); }
      });
    });
    r.on('error', rej);
    r.setTimeout(180000, () => r.destroy(new Error('timeout')));
    r.end();
  });
}

// Längsta först – "vardag utom vardag före sön- och helgdag" innehåller kortare former.
const DAGTYPER = [
  ['vardagar utom vardag före sön- och helgdag', 'vardag-ej-dagfore'],
  ['vardag utom vardag före sön- och helgdag',   'vardag-ej-dagfore'],
  ['vardagar utom dag före sön- och helgdag',    'vardag-ej-dagfore'],
  ['vardag utom dag före sön- och helgdag',      'vardag-ej-dagfore'],
  ['vardagar före sön- och helgdag',             'dagfore'],
  ['vardag före sön- och helgdag',               'dagfore'],
  ['dag före sön- och helgdag',                  'dagfore'],
  ['sön- och helgdagar',                         'sonhelg'],
  ['sön- och helgdag',                           'sonhelg'],
  ['vardagar',                                   'vardag'],
  ['vardag',                                     'vardag']
];
// ⚠ INGA ENSKILDA VECKODAGAR HÄR, till skillnad från lastplatstabellen.
// maxtidGallerVillkor i index.html känner bara fem dagtyper och svarar `null`
// på en okänd – alltså "vet inte". Skrev vi in 'onsdag' skulle raden tystna i
// appen utan att någon såg det. Meningar med enskild veckodag lämnas otolkade.

const MANAD = { januari:1, februari:2, mars:3, april:4, maj:5, juni:6, juli:7,
                augusti:8, september:9, oktober:10, november:11, december:12 };
const tid = s => { const m = s.match(/^(\d{1,2})\.(\d{2})$/); return m ? (+m[1]) * 100 + (+m[2]) : null; };

function tolka(mening) {
  let t = String(mening).replace(/\s+/g, ' ').trim();

  let sasong = null;
  const sm = t.match(/under tiden (\d+):[ae] ([a-zåäö]+) *- *(\d+):?[ae]? ?([a-zåäö]+)/i);
  if (sm) {
    const a = MANAD[sm[2].toLowerCase()], b = MANAD[sm[4].toLowerCase()];
    if (a && b) sasong = { fran: a * 100 + (+sm[1]), till: b * 100 + (+sm[3]) };
    t = t.replace(sm[0], ' ').trim();
  }

  t = t.replace(/^Parkering är dock tillåten under högst \d+ (min|tim|dygn) i följd( mot avgift)?( under tiden)?/i, '');
  t = t.replace(/^Tidsbegränsningen gäller/i, '');
  t = t.replace(/^Tillåtelsen gäller/i, '');
  t = t.replace(/^\s*under tiden/i, '');
  t = t.replace(/\.$/, '').trim();

  // Enskild veckodag → otolkbar för den här tabellen (se kommentaren vid DAGTYPER).
  if (/(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)/i.test(t)) return null;

  const traffar = [];
  const lag = t.toLowerCase();
  DAGTYPER.forEach(([text, kod]) => {
    let i = 0;
    while ((i = lag.indexOf(text, i)) >= 0) {
      if (!traffar.some(x => i >= x.start && i < x.slut)) traffar.push({ start: i, slut: i + text.length, kod });
      i += 1;
    }
  });
  traffar.sort((a, b) => a.start - b.start);

  const klockslag = bit => {
    const ut = []; const re = /(\d{1,2}\.\d{2})\s*-\s*(\d{1,2}\.\d{2})/g; let m;
    while ((m = re.exec(bit))) ut.push([tid(m[1]), tid(m[2])]);
    return ut;
  };

  const regler = [];
  if (!traffar.length) {
    klockslag(t).forEach(f => regler.push({ dag: 'alla', fran: f[0], till: f[1] }));
    if (!regler.length && !t) regler.push({ dag: 'alla', fran: null, till: null });
  } else {
    traffar.forEach((tr, i) => {
      const slut = i + 1 < traffar.length ? traffar[i + 1].start : t.length;
      const f = klockslag(t.slice(tr.slut, slut));
      if (f.length) f.forEach(x => regler.push({ dag: tr.kod, fran: x[0], till: x[1] }));
      else regler.push({ dag: tr.kod, fran: null, till: null });
    });
  }
  if (!regler.length) return null;

  // KONTROLL: varje klockslag i meningen måste ha blivit en regel. Fångade vi färre
  // har tolkningen tappat något, och då får meningen inte gå in i tabellen.
  const iMeningen = (String(mening).match(/\d{1,2}\.\d{2}\s*-\s*\d{1,2}\.\d{2}/g) || []).length;
  const medTid = regler.filter(r => r.fran != null).length;
  if (medTid !== iMeningen) return null;

  return { regler, sasong };
}

(async () => {
  const gammal = JSON.parse(fs.readFileSync(FIL, 'utf8'));
  const utelamnade = (gammal.utelamnade || []).map(u => String(u).replace(/\s+/g, ' ').trim());
  const utelamnadSet = new Set(utelamnade);

  const j = await hamta('/wfs?service=WFS&version=1.1.0&request=GetFeature'
    + '&outputFormat=application%2Fjson&srsName=EPSG:4326'
    + '&typeName=' + encodeURIComponent(P_LAGER_LISTA.join(',')));
  const features = j.features || [];
  if (features.length < 1000) { console.error('Bara ' + features.length + ' poster – avbryter.'); process.exit(2); }

  const falt = (p, n) => (p && (p[n] != null ? p[n] : p[String(n).toLowerCase()])) || null;
  const lagerAv = f => String(f && f.id || '').split('.')[0];

  const pop = new Map();
  for (const f of features) {
    const p = f.properties || {}, lag = lagerAv(f);
    if (lag === 'lastplats') continue;
    const m = String(falt(p, 'MaxParkingTimeLimitation') || '').replace(/\s+/g, ' ').trim();
    if (!m) continue;
    const mt = falt(p, 'MaxParkingTime');
    if (mt == null || String(mt).trim() === '') continue;
    pop.set(m, (pop.get(m) || 0) + 1);
  }

  const poster = [], otolkade = [];
  for (const [mening, antal] of pop) {
    if (utelamnadSet.has(mening)) continue;
    const r = tolka(mening);
    if (!r) { otolkade.push({ mening, strackor: antal }); continue; }
    poster.push({ mening, strackor: antal, regler: r.regler, sasong: r.sasong });
  }
  // SORTERAS PÅ MENINGEN, inte på antal sträckor. Sorterar man på antal skrivs
  // hela filen om så fort en siffra rör sig, och en robotcommit på två nya rader
  // blir 382 ändrade rader som ingen orkar granska. Uppmätt 2026-08-30.
  poster.sort((a, b) => a.mening < b.mening ? -1 : a.mening > b.mening ? 1 : 0);

  const forr = new Set(gammal.poster.map(p => String(p.mening).replace(/\s+/g, ' ').trim()));
  const nu   = new Set(poster.map(p => p.mening));
  const tillagda  = [...nu].filter(m => !forr.has(m));
  const borttagna = [...forr].filter(m => !nu.has(m));

  console.log('meningar i datan   : ' + pop.size);
  console.log('tolkade rader      : ' + poster.length);
  console.log('medvetet utelämnade: ' + utelamnade.length);
  console.log('otolkade           : ' + otolkade.length + '  (lämnas utanför → appen säger "vet inte")');
  console.log('tillagda mot filen : ' + tillagda.length);
  console.log('borttagna mot filen: ' + borttagna.length);
  otolkade.forEach(o => console.log('  otolkad (' + o.strackor + ')  ' + o.mening));
  tillagda.forEach(m => console.log('  + ' + m));
  borttagna.forEach(m => console.log('  - ' + m));

  if (!SKRIV) { console.log('\nKör om med --skriv för att skriva filen.'); process.exit(tillagda.length + borttagna.length ? 1 : 0); }

  gammal.poster = poster;
  gammal.last = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(FIL, JSON.stringify(gammal, null, 1) + '\n');
  console.log('\nSkrivet: ' + poster.length + ' rader.');
})().catch(e => { console.error('FEL: ' + e.message); process.exit(2); });
