// Testgrind för de tre uppslagstabellerna. Ingen automatisk ändring får committas
// utan att den här går igenom.
//
//   node verktyg/prova-tabeller.js
//
// Exit 0 = godkänt. Exit 1 = underkänt, ändringen får INTE gå live.
//
// VAD DEN SKYDDAR MOT. En robot som skriver om tabellerna kan fela på fyra sätt,
// och alla fyra är tysta i appen:
//   1. En dagtyp appen inte känner → maxtidGallerVillkor svarar null och raden
//      tystnar utan att någon ser det. Därför vitlistas dagtyperna här.
//   2. Ett trasigt klockslag (25.00, negativa värden) → fönstret träffar aldrig.
//   3. Generatorn och JSON-filen glider isär → blocket i index.html säger något
//      annat än källan. Därför körs generatorerna två gånger: andra gången ska
//      inget ändras.
//   4. En massborttagning – ett trasigt anrop som ser ut som "allt försvann".
//      Därför jämförs radantalet mot det som ligger i git.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROT = path.join(__dirname, '..');
const fel = [], varning = [];
const kolla = (villkor, text) => { if (!villkor) fel.push(text); };

// ── Dagtyper appen faktiskt förstår ─────────────────────────────────────────
// Hämtade ur index.html, inte avskrivna: glider koden isär från den här listan
// ska testet säga till, inte tiga. Villkorstabellen och lastplatstabellen har
// OLIKA uppsättningar – lastplats kan bära enskilda veckodagar, villkor kan inte.
const html = fs.readFileSync(path.join(ROT, 'index.html'), 'utf8');
const VILLKOR_DAGAR = ['alla', 'vardag-ej-dagfore', 'dagfore', 'sonhelg', 'vardag'];
const LASTPLATS_DAGAR = VILLKOR_DAGAR.concat(['mandag','tisdag','onsdag','torsdag','fredag','lordag','sondag']);
// Läs funktionskroppen, inte hela filen: ett strängfynd någon annanstans ska inte kunna
// dölja att funktionen tappat en dagtyp.
function kropp(namn) {
  const i = html.indexOf('function ' + namn + '(');
  if (i < 0) { fel.push('hittar inte ' + namn + ' i index.html'); return ''; }
  const j = html.indexOf('\n}', i);
  return html.slice(i, j < 0 ? undefined : j);
}
// ⚠ Förr letade testet efter «r[0] === 'vardag'» i hela filen. maxtidGallerVillkor skrevs
// om till att fråga maxtidDagOk(r[0], d), strängen försvann – och testet underkände
// fungerande kod varje gång, så roboten committade aldrig något (upptäckt 2026-09-27).
const dagOkKropp = kropp('maxtidDagOk');
for (const d of VILLKOR_DAGAR) {
  kolla(dagOkKropp.includes("typ === '" + d + "'"), `maxtidDagOk känner inte dagtypen "${d}"`);
}
const fonsterKropp = kropp('gbgLastplatsFonster');
for (const d of VILLKOR_DAGAR) {
  kolla(fonsterKropp.includes("dag === '" + d + "'"), `gbgLastplatsFonster känner inte dagtypen "${d}"`);
}
// Veckodagarna i Stockholms tabell står med å/ö («måndag», «lördag») och slås upp mot
// SV_WEEKDAYS – läs listan ur index.html i stället för att skriva av den.
const svVeckodagar = ((html.match(/const SV_WEEKDAYS = \[([^\]]*)\]/) || [])[1] || '')
  .split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
kolla(svVeckodagar.length === 7, 'hittar inte SV_WEEKDAYS (sju veckodagar) i index.html');
kolla(fonsterKropp.includes('SV_WEEKDAYS[d.getDay()] === dag'), 'gbgLastplatsFonster slår inte längre upp veckodagar i SV_WEEKDAYS');
const STHLM_DAGAR = VILLKOR_DAGAR.concat(svVeckodagar);

function las(fil) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, fil), 'utf8')); }
  catch (e) { fel.push(fil + ' gick inte att läsa: ' + e.message); return null; }
}

// ── Struktur ────────────────────────────────────────────────────────────────
function provaRegeltabell(namn, fil, dagar, nyckel) {
  const j = las(fil);
  if (!j) return null;
  kolla(Array.isArray(j.poster) && j.poster.length > 0, namn + ': inga poster');
  const sedda = new Set();
  (j.poster || []).forEach((p, i) => {
    const var_ = namn + ' rad ' + i + ' (' + String(p.mening).slice(0, 50) + '…)';
    kolla(typeof p.mening === 'string' && p.mening.trim(), var_ + ': tom mening');
    const m = String(p.mening).replace(/\s+/g, ' ').trim();
    kolla(!sedda.has(m), var_ + ': dubblerad mening');
    sedda.add(m);
    kolla(Array.isArray(p.regler) && p.regler.length > 0, var_ + ': inga regler');
    (p.regler || []).forEach(r => {
      kolla(dagar.includes(r.dag), var_ + ': okänd dagtyp "' + r.dag + '"');
      const tider = [r.fran, r.till];
      const badaNull = r.fran == null && r.till == null;
      const badaSatta = r.fran != null && r.till != null;
      kolla(badaNull || badaSatta, var_ + ': halvt klockslag (' + tider.join('-') + ')');
      tider.forEach(t => {
        if (t == null) return;
        kolla(Number.isInteger(t) && t >= 0 && t <= 2400 && (t % 100) < 60,
              var_ + ': ogiltigt klockslag ' + t);
      });
      if (r.vecka != null) kolla(['udda', 'jamn'].includes(r.vecka), var_ + ': okänd veckoparitet "' + r.vecka + '"');
    });
    if (p.sasong) {
      kolla(Number.isInteger(p.sasong.fran) && Number.isInteger(p.sasong.till), var_ + ': trasig säsong');
    }
  });
  return { namn, fil, antal: (j.poster || []).length, nyckel };
}

const tabeller = [
  provaRegeltabell('Villkorstabellen', 'gbg-maxtid-villkor.json', VILLKOR_DAGAR, 'GBG_MAXTID_VILLKOR_TABELL'),
  provaRegeltabell('Lastplatstabellen', 'gbg-lastplats-tider.json', LASTPLATS_DAGAR, 'GBG_LASTPLATS_TIDER')
].filter(Boolean);

// Förbudstabellen har en annan form: ärendenummer → datum.
const forbud = las('forbud-ovrig-tid.json');
if (forbud) {
  kolla(Array.isArray(forbud.poster) && forbud.poster.length > 0, 'Förbudstabellen: inga poster');
  const sedda = new Set();
  (forbud.poster || []).forEach((p, i) => {
    const var_ = 'Förbudstabellen rad ' + i + ' (' + p.citation + ')';
    kolla(/^\d{4}\s+\d{4}-\d+$/.test(String(p.citation || '')), var_ + ': ärendenumret ser fel ut');
    kolla(/^\d{4}-\d{2}-\d{2}$/.test(String(p.gallerFran || '')), var_ + ': gallerFran är inte ett datum');
    kolla(!sedda.has(p.citation), var_ + ': dubblerat ärendenummer');
    sedda.add(p.citation);
  });
  tabeller.push({ namn: 'Förbudstabellen', fil: 'forbud-ovrig-tid.json',
                  antal: (forbud.poster || []).length, nyckel: 'FORBUD_OVRIG_TID' });
}

// Stockholms fönster (sthlm-fonster.json): en post per föreskrift och lager.
const sthlm = las('sthlm-fonster.json');
let sthlmUrval = null;
if (sthlm) {
  const poster = sthlm.poster || [];
  kolla(poster.length > 1000, 'Stockholms fönster: misstänkt få poster (' + poster.length + ')');
  const sedda = new Set();
  poster.forEach((p, i) => {
    const var_ = 'Stockholms fönster rad ' + i + ' (' + p.citation + ')';
    kolla(/^\d{4}\s+\d{4}-\d+$/.test(String(p.citation || '')), var_ + ': ärendenumret ser fel ut');
    kolla(['forbud', 'andamal'].includes(p.lager), var_ + ': okänt lager "' + p.lager + '"');
    kolla(['lika', 'dolda', 'oklar', 'avvikelse', 'olasbar'].includes(p.klass), var_ + ': okänd klass "' + p.klass + '"');
    const nyckel = p.lager + '|' + p.citation;
    kolla(!sedda.has(nyckel), var_ + ': dubblerad');
    sedda.add(nyckel);
    if (p.klass === 'dolda' || p.klass === 'lika') {
      kolla(/^\d{4}-\d{2}-\d{2}$/.test(String(p.gallerFran || '')), var_ + ': gallerFran är inte ett datum');
    }
    if (p.klass === 'dolda') {
      kolla(Array.isArray(p.regler) && p.regler.length > 0, var_ + ': dolda utan regler');
      (p.regler || []).forEach(r => {
        kolla(Array.isArray(r) && r.length === 3, var_ + ': trasig regel ' + JSON.stringify(r));
        kolla(STHLM_DAGAR.includes(r[0]), var_ + ': okänd dagtyp "' + r[0] + '"');
        [r[1], r[2]].forEach(t => kolla(Number.isInteger(t) && t >= 0 && t <= 2400 && (t % 100) < 60,
                                        var_ + ': ogiltigt klockslag ' + t));
      });
    }
  });
  // Samma urval som generatorn gör – hämtat ur generatorn, inte avskrivet.
  sthlmUrval = require('./bygg-sthlm-fonster.js').urval(sthlm);
  tabeller.push({ namn: 'Stockholms fönster', fil: 'sthlm-fonster.json', antal: poster.length,
                  nyckel: 'STHLM_FONSTER', iBlocket: sthlmUrval.length });
}

// ── Massborttagning ─────────────────────────────────────────────────────────
// Verkligheten ändrar några rader i månaden. Försvinner en femtedel på en gång är
// det ett trasigt anrop, inte en förändring – och då ska ingenting committas.
for (const t of tabeller) {
  let forr;
  try {
    // maxBuffer: standardgränsen är 1 MB och sthlm-fonster.json är större. Utan den kastade
    // anropet, catch-grenen nedan tolkade det som «filen är ny» – och massborttagningsspärren
    // var tyst avstängd för just den största tabellen (upptäckt med ett avsiktligt fel 2026-09-27).
    const gammal = cp.execSync('git show HEAD:verktyg/' + t.fil, { cwd: ROT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore','pipe','ignore'] });
    forr = (JSON.parse(gammal).poster || []).length;
  } catch { continue; }             // filen är ny i det här bygget – inget att jämföra med
  t.forr = forr;
  if (forr > 0 && t.antal < forr * 0.8) {
    fel.push(`${t.namn}: ${forr} → ${t.antal} rader. Mer än en femtedel borta i ett svep – stoppar.`);
  } else if (t.antal !== forr) {
    varning.push(`${t.namn}: ${forr} → ${t.antal} rader`);
  }
}

// ── Generatorerna ska vara idempotenta ──────────────────────────────────────
// Körs två gånger. Andra gången måste de säga "Oförändrad" – annars stämmer inte
// blocket i index.html med JSON-filen, och appen visar något annat än källan.
const generatorer = ['bygg-gbg-villkor.js', 'bygg-gbg-lastplats.js', 'bygg-forbud-ovrig-tid.js', 'bygg-sthlm-fonster.js'];
for (const g of generatorer) {
  try {
    cp.execSync('node verktyg/' + g, { cwd: ROT, encoding: 'utf8' });
    const andra = cp.execSync('node verktyg/' + g, { cwd: ROT, encoding: 'utf8' });
    kolla(/Oförändrad/.test(andra), g + ' är inte idempotent – andra körningen ändrade index.html igen');
  } catch (e) { fel.push(g + ' kraschade: ' + String(e.message).split('\n')[0]); }
}

// ── index.html måste fortfarande vara giltig JavaScript ─────────────────────
const html2 = fs.readFileSync(path.join(ROT, 'index.html'), 'utf8');
const block = [];
const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html2))) {
  if (/src=/.test(m[1]) || /application\/ld\+json/.test(m[1])) continue;
  block.push(m[2]);
}
kolla(block.length > 0, 'hittade inga script-block i index.html');
const tmp = path.join(require('os').tmpdir(), 'parkspot-syntax-' + process.pid + '.js');
fs.writeFileSync(tmp, block.join('\n;\n'));
try { cp.execSync('node --check "' + tmp + '"', { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); }
catch (e) { fel.push('index.html är inte giltig JavaScript: ' + String(e.stderr || e.message).split('\n').slice(0,3).join(' ')); }
finally { try { fs.unlinkSync(tmp); } catch {} }

// ── Blocket i index.html måste ha lika många rader som JSON-filen ───────────
for (const t of tabeller) {
  const i = html2.indexOf('const ' + t.nyckel);
  if (i < 0) { fel.push(t.namn + ': hittar inte ' + t.nyckel + ' i index.html'); continue; }
  const slut = html2.indexOf('\n  };', i);
  if (slut < 0) { fel.push(t.namn + ': hittar inte slutet på ' + t.nyckel); continue; }
  const blockText = html2.slice(i, slut);
  if (t.iBlocket != null) {
    // Stockholms fönster: fem poster per rad, och bara ett urval av JSON-posterna.
    const n = (blockText.match(/'\d{4}-\d+':\[/g) || []).length;
    kolla(n === t.iBlocket, `${t.namn}: ${t.iBlocket} poster i urvalet men ${n} i index.html`);
    continue;
  }
  // Räkna nycklar: en rad per post, antingen "…": eller '…':
  const n = (blockText.match(/^\s*['"]/gm) || []).length;
  kolla(n === t.antal, `${t.namn}: ${t.antal} rader i JSON men ${n} i index.html`);
}

// ── Utfall ──────────────────────────────────────────────────────────────────
console.log('Testgrind för uppslagstabellerna');
console.log('');
tabeller.forEach(t => console.log('  ' + t.namn.padEnd(20) + String(t.antal).padStart(4) + ' rader'
  + (t.forr != null && t.forr !== t.antal ? '   (var ' + t.forr + ')' : '')));
if (varning.length) { console.log('\nAtt notera:'); varning.forEach(v => console.log('  · ' + v)); }
if (fel.length) {
  console.log('\nUNDERKÄNT – ' + fel.length + ' fel:');
  fel.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('\nGodkänt.');
