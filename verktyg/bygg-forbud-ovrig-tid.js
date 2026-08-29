// Skriver in tabellen från forbud-ovrig-tid.json i index.html, mellan markörerna
//   // ▼▼ GENERERAD TABELL … ▼▼   och   // ▲▲ SLUT GENERERAD TABELL ▲▲
//
// Körs för hand: node verktyg/bygg-forbud-ovrig-tid.js
// JSON-filen är källan; blocket i index.html är bara en kopia så appen slipper
// en extra nätverksbegäran. Ändra ALDRIG blocket för hand – ändra JSON och kör om.
const fs = require('fs');
const path = require('path');

const ROT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'forbud-ovrig-tid.json'), 'utf8'));

const START = '  // ▼▼ GENERERAD TABELL – ändra inte för hand, kör verktyg/bygg-forbud-ovrig-tid.js ▼▼';
const SLUT  = '  // ▲▲ SLUT GENERERAD TABELL ▲▲';

const rader = data.poster.map(p => {
  const kommentar = [p.gata, p.stadsdel].filter(Boolean).join(', ');
  return `    '${p.citation}': '${p.gallerFran}',`.padEnd(46) + ` // ${kommentar}`;
});

const block = [
  START,
  `  // ${data.poster.length} föreskrifter, ${data.poster.reduce((a, b) => a + b.stracker, 0)} kartsträckor.`,
  `  // Läst ur föreskriftstexten i RDT ${data.last}. Genomsökt: ${data.genomsokt.arendenummer} ärendenummer`,
  `  // i hela ${data.stad}, varav ${data.genomsokt.ejLasbara} inte gick att läsa (de saknas här → dagens beteende).`,
  '  // Värdet är postens VALID_FROM när texten lästes – vakten nedan jämför mot kartdatan.',
  '  const FORBUD_OVRIG_TID = {',
  ...rader,
  '  };',
  SLUT
].join('\n');

const filPath = path.join(ROT, 'index.html');
const html = fs.readFileSync(filPath, 'utf8');
const i = html.indexOf(START);
const j = html.indexOf(SLUT);
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
  console.log('index.html uppdaterad: ' + data.poster.length + ' föreskrifter inskrivna.');
}
