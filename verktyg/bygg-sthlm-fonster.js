// Skriver in tabellen från sthlm-fonster.json i index.html, mellan markörerna
//   // ▼▼ GENERERAD TABELL … bygg-sthlm-fonster.js ▼▼   och   // ▲▲ SLUT GENERERAD TABELL (Stockholms fönster) ▲▲
//
// Körs för hand: node verktyg/bygg-sthlm-fonster.js   (efter las-sthlm-fonster.js)
// Körs också av månadsroboten (.github/workflows/datatabeller.yml).
// Ändra ALDRIG blocket för hand – ändra källan och kör om.
//
// Vad som kommer med:
//   · förbud  med klass «dolda»  → textens alla fönster (datan saknar några)
//   · lastplats med klass «dolda» → textens fönster för ÄNDAMÅLET (inte «dock»-förbuden)
//   · lastplats med klass «lika»  → 0: texten är läst och stämmer med datan. Behövs för att
//     helgfynd i Stockholm bara ska visas där föreskriften är kontrollerad.
// Allt annat (oklar, avvikelse, oläsbar, dock-förbud på helgdag) utelämnas → dagens beteende.
const fs = require('fs');
const path = require('path');

const ROT = path.join(__dirname, '..');
const START = '  // ▼▼ GENERERAD TABELL – ändra inte för hand, kör verktyg/bygg-sthlm-fonster.js ▼▼';
const SLUT  = '  // ▲▲ SLUT GENERERAD TABELL (Stockholms fönster) ▲▲';

// Urvalet exporteras så att testgrinden (prova-tabeller.js) räknar med exakt samma regel
// i stället för en avskriven kopia som kan glida isär.
function urval(data) {
  const med = data.poster.filter(p => {
    if (!/^0180 \d{4}-\d+$/.test(p.citation)) return false;
    if (p.lager === 'forbud')  return p.klass === 'dolda';
    if (p.lager === 'andamal') return (p.klass === 'dolda' || p.klass === 'lika') && !p.dockHelg;
    return false;
  });
  // Samma ärendenummer i båda lagren: lastplatsen vinner inte över förbudet eller tvärtom –
  // hoppa hellre över än gissa.
  const antal = {};
  med.forEach(p => { antal[p.citation] = (antal[p.citation] || 0) + 1; });
  return med.filter(p => antal[p.citation] === 1);
}
module.exports = { urval };

if (require.main === module) {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'sthlm-fonster.json'), 'utf8'));
  const valda = urval(data);
  // Kompakt, utan gatunamn: 1 600+ poster i index.html, och varje byte laddas av varje besökare.
  // Gata och mening står i sthlm-fonster.json – slå upp ärendenumret där vid granskning.
  // Fem poster per rad håller blocket läsbart i en diff utan att bli 1 600 rader långt.
  const poster = valda.map(p => {
    const r = p.klass === 'dolda' ? JSON.stringify(p.regler).replace(/"/g, "'") : '0';
    return `'${p.citation.slice(5)}':['${p.gallerFran}','${p.lager === 'forbud' ? 'f' : 'a'}',${r}]`;
  });
  const rader = [];
  for (let k = 0; k < poster.length; k += 5) rader.push('    ' + poster.slice(k, k + 5).join(',') + ',');
  const sum = k => valda.filter(k).length;

  const filPath = path.join(ROT, 'index.html');
  const html = fs.readFileSync(filPath, 'utf8');
  const NL = html.includes('\r\n') ? '\r\n' : '\n';       // ärv filens radslut (se bygg-forbud-ovrig-tid.js)
  const block = [
    START,
    `  // Läst ur föreskriftstexten i RDT ${data.last}. ${sum(p => p.lager === 'forbud')} förbud och`
    + ` ${sum(p => p.lager === 'andamal' && p.klass === 'dolda')} lastplatser har fönster som kartdatan saknar;`,
    `  // ${sum(p => p.lager === 'andamal' && p.klass === 'lika')} lastplatser är lästa och stämmer (0).`,
    "  // Form: 'år-löpnr': [VALID_FROM när texten lästes, 'f'örbud/'a'ndamål, regler eller 0].",
    '  const STHLM_FONSTER = {',
    ...rader,
    '  };',
    SLUT
  ].join(NL);

  const i = html.indexOf(START), j = html.indexOf(SLUT);
  if (i >= 0 && j >= 0 && j < i) { console.error('Slutmarkören ligger före startmarkören – avbryter.'); process.exit(1); }
  if (i < 0 || j < 0) { console.error('Hittade inte markörerna i index.html. Lägg in dem först:\n' + START + '\n' + SLUT); process.exit(1); }
  const nytt = html.slice(0, i) + block + html.slice(j + SLUT.length);
  if (nytt === html) console.log('Oförändrad.');
  else { fs.writeFileSync(filPath, nytt); console.log('index.html uppdaterad: ' + poster.length + ' föreskrifter på ' + rader.length + ' rader.'); }
}
