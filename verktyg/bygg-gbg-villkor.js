// Skriver in tabellen från gbg-maxtid-villkor.json i index.html, mellan markörerna.
// Körs för hand: node verktyg/bygg-gbg-villkor.js
// JSON-filen är källan; blocket i index.html är bara en kopia så appen slipper en extra
// nätverksbegäran. Ändra ALDRIG blocket för hand – ändra JSON och kör om.
const fs = require('fs');
const path = require('path');

const ROT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'gbg-maxtid-villkor.json'), 'utf8'));

const START = '  // ▼▼ GENERERAD TABELL – ändra inte för hand, kör verktyg/bygg-gbg-villkor.js ▼▼';
// Slutmarkören MÅSTE vara unik i filen – se samma kommentar i bygg-forbud-ovrig-tid.js.
const SLUT  = '  // ▲▲ SLUT GENERERAD TABELL (Göteborgs villkor) ▲▲';

const filPath = path.join(ROT, 'index.html');
const html = fs.readFileSync(filPath, 'utf8');
// index.html har CRLF; skriver vi LF blir blocket alltid "ändrat" och arbetskopian smutsig.
const NL = html.includes('\r\n') ? '\r\n' : '\n';

// Kompakt form: { r: [[dagtyp, från, till], …], s: [från, till] eller utelämnat }
const rader = data.poster.map(p => {
  const regler = p.regler.map(r => `['${r.dag}',${r.fran},${r.till}]`).join(',');
  const sasong = p.sasong ? `,s:[${p.sasong.fran},${p.sasong.till}]` : '';
  const nyckel = JSON.stringify(p.mening.replace(/\s+/g, ' ').trim());
  return `    ${nyckel}:` + NL + `      { r: [${regler}]${sasong} },   // ${p.strackor} sträckor`;
});

const block = [
  START,
  `  // ${data.poster.length} villkorsmeningar, ${data.poster.reduce((a, b) => a + b.strackor, 0)} kartsträckor.`,
  `  // Översatta en gång och granskade för hand ${data.last}. Uppslag på EXAKT sträng.`,
  `  // Utelämnad med flit: ${data.utelamnade.join(' / ')}`,
  '  // dag: vardag-ej-dagfore | dagfore | sonhelg | vardag | alla. s = säsong som MMDD.',
  '  const GBG_MAXTID_VILLKOR_TABELL = {',
  ...rader,
  '  };',
  SLUT
].join(NL);

const i = html.indexOf(START);
const j = html.indexOf(SLUT);
if (i >= 0 && j >= 0 && j < i) {
  console.error('Slutmarkören ligger FÖRE startmarkören – markörerna är inte unika i filen.');
  console.error('Avbryter hellre än att skriva sönder index.html.');
  process.exit(1);
}
if (i < 0 || j < 0) {
  console.error('Hittade inte markörerna i index.html.');
  process.exit(1);
}
const nytt = html.slice(0, i) + block + html.slice(j + SLUT.length);
if (nytt === html) {
  console.log('Oförändrad – tabellen i index.html stämmer redan med JSON-filen.');
} else {
  fs.writeFileSync(filPath, nytt);
  console.log('index.html uppdaterad: ' + data.poster.length + ' villkorsmeningar inskrivna.');
}
