// Skriver in tabellen från gbg-lastplats-tider.json i index.html, mellan markörerna.
// Körs för hand: node verktyg/bygg-gbg-lastplats.js
// JSON-filen är källan; blocket i index.html är bara en kopia så appen slipper en extra
// nätverksbegäran. Ändra ALDRIG blocket för hand – kör om las-gbg-lastplats.js i stället.
const fs = require('fs');
const path = require('path');

const ROT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'gbg-lastplats-tider.json'), 'utf8'));

const START = '  // ▼▼ GENERERAD TABELL – ändra inte för hand, kör verktyg/bygg-gbg-lastplats.js ▼▼';
// Slutmarkören MÅSTE vara unik i filen. Det finns flera genererade tabeller i index.html,
// och när två delade markör hittade generatorn den ANDRA tabellens slut – då hamnade
// slutet före starten och 125 rader dubblerades tyst. Spärren nedan fångar det nu.
const SLUT  = '  // ▲▲ SLUT GENERERAD TABELL (Göteborgs lastplatstider) ▲▲';

const filPath = path.join(ROT, 'index.html');
const html = fs.readFileSync(filPath, 'utf8');
// index.html har CRLF. Skriver vi LF blir blocket alltid "ändrat" och arbetskopian smutsig.
const NL = html.includes('\r\n') ? '\r\n' : '\n';

// Kompakt form: { r: [[dagtyp, från, till] eller [dagtyp, från, till, 'udda'|'jamn'], …] }
const rader = data.poster.map(p => {
  const regler = p.regler.map(r =>
    "['" + r.dag + "'," + r.fran + "," + r.till + (r.vecka ? ",'" + r.vecka + "'" : '') + ']').join(',');
  const nyckel = JSON.stringify(p.mening.replace(/\s+/g, ' ').trim());
  return '    ' + nyckel + ':' + NL + '      { r: [' + regler + '] },   // ' + p.strackor + ' sträckor';
});

const block = [
  START,
  '  // ' + data.poster.length + ' lastplatsmeningar, '
    + data.poster.reduce((a, b) => a + b.strackor, 0) + ' kartsträckor.',
  '  // Läst ur Göteborgs WFS ' + data.last + ' och granskad för hand. Uppslag på EXAKT sträng:',
  '  // en mening som inte står här ger "vet inte", och då rör appen inte segmentet.',
  '  // De ' + data.utanMening + ' lastplatser som saknar mening finns INTE här – de gäller dygnet',
  '  // runt och flaggas som ANDAMAL_ALLTID redan i cities/goteborg.js.',
  '  // Utelämnade med flit (saknar klockslag, ' + data.utelamnade.reduce((a, b) => a + b.strackor, 0)
    + ' sträckor): ' + data.utelamnade.map(u => u.mening).join(' / '),
  '  // dag: vardag-ej-dagfore | dagfore | sonhelg | vardag | alla | måndag…söndag.',
  "  // Fjärde värdet, när det finns, är veckoparitet: 'udda' eller 'jamn'.",
  '  const GBG_LASTPLATS_TIDER = {',
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
  console.error('Hittade inte markörerna i index.html. Lägg in dem först:');
  console.error(START);
  console.error(SLUT);
  process.exit(1);
}
const nytt = html.slice(0, i) + block + html.slice(j + SLUT.length);
if (nytt === html) {
  console.log('Oförändrad – tabellen i index.html stämmer redan med JSON-filen.');
} else {
  fs.writeFileSync(filPath, nytt);
  console.log('index.html uppdaterad: ' + data.poster.length + ' lastplatsmeningar inskrivna.');
}
