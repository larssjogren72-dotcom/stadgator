// Hämtar Göteborgs lastplatser och översätter varje villkorsmening till NÄR lastplatsen
// gäller. Skriver verktyg/gbg-lastplats-tider.json och skriver ut allt för granskning.
//
// Körs för hand:  node verktyg/las-gbg-lastplats.js
//
// VARFÖR EN TABELL OCH INTE TOLKNING I APPEN: meningen är föreskriftens egen text och
// kan skrivas om när som helst. Tolkas den i appen förvandlas en ny formulering tyst
// till fel tider. Slås den upp på EXAKT sträng ger en okänd mening "vet inte", och då
// rör appen inte segmentet – samma försiktighetsprincip som för Göteborgs maxtid.
const https = require('https');
const fs = require('fs');
const path = require('path');

const LAGER = 'parkering:lastplats';

function hamta(sokvag) {
  return new Promise((res, rej) => {
    const bitar = [];
    const r = https.request({ hostname: 'open.geodata.tkgbg.se', port: 443,
                              path: sokvag, method: 'GET' }, resp => {
      resp.on('data', c => bitar.push(c));
      resp.on('end', () => {
        const t = Buffer.concat(bitar).toString('utf8');
        if (t.trimStart().startsWith('<')) return rej(new Error('WFS-undantag: ' + t.slice(0, 200)));
        try { res(JSON.parse(t)); } catch (e) { rej(e); }
      });
    });
    r.on('error', rej);
    r.setTimeout(120000, () => r.destroy(new Error('timeout')));
    r.end();
  });
}

// ── Tolkning ────────────────────────────────────────────────────────────────
// Längsta först: "vardag utom vardag före sön- och helgdag" innehåller både
// "vardag före sön- och helgdag" och "vardag". Träffar som ligger inuti en redan
// hittad träff kastas, så den längsta vinner.
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
  ['måndag', 'mandag'], ['tisdag', 'tisdag'], ['onsdag', 'onsdag'],
  ['torsdag', 'torsdag'], ['fredag', 'fredag'],
  ['lördag', 'lordag'], ['söndag', 'sondag'],
  ['vardagar', 'vardag'], ['vardag', 'vardag']
];

const MANAD = { januari:1, februari:2, mars:3, april:4, maj:5, juni:6, juli:7,
                augusti:8, september:9, oktober:10, november:11, december:12 };

const tid = s => { const m = s.match(/^(\d{1,2})\.(\d{2})$/);
                   return m ? (+m[1]) * 100 + (+m[2]) : null; };

function tolka(mening) {
  let t = mening.replace(/\s+/g, ' ').trim();

  // Säsong: "under tiden 1:a oktober - 1:a maj"
  let sasong = null;
  const sm = t.match(/under tiden (\d+):[ae] ([a-zåäö]+) *- *(\d+):[ae] ([a-zåäö]+)/i);
  if (sm) {
    const a = MANAD[sm[2].toLowerCase()], b = MANAD[sm[4].toLowerCase()];
    if (a && b) sasong = { fran: a * 100 + (+sm[1]), till: b * 100 + (+sm[3]) };
    t = t.replace(sm[0], ' ').trim();
  }

  t = t.replace(/^Lastplats/i, '').replace(/\.$/, '').trim();
  if (!t) return { regler: [], sasong };

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
    const ut = [];
    const re = /(\d{1,2}\.\d{2})\s*-\s*(\d{1,2}\.\d{2})/g;
    let m;
    while ((m = re.exec(bit))) ut.push([tid(m[1]), tid(m[2])]);
    return ut;
  };
  // "…och onsdag klockan 02.00 - 07.00 jämna veckor" – pariteten hör till SITT block.
  const paritet = bit => /udda vecko/i.test(bit) ? 'udda' : (/jämna vecko/i.test(bit) ? 'jamn' : null);

  const regler = [];
  if (!traffar.length) {
    klockslag(t).forEach(f => regler.push({ dag: 'alla', fran: f[0], till: f[1], vecka: paritet(t) }));
  } else {
    traffar.forEach((tr, i) => {
      const slut = i + 1 < traffar.length ? traffar[i + 1].start : t.length;
      const bit = t.slice(tr.slut, slut);
      const v = paritet(bit);
      const f = klockslag(bit);
      if (f.length) f.forEach(x => regler.push({ dag: tr.kod, fran: x[0], till: x[1], vecka: v }));
      else regler.push({ dag: tr.kod, fran: null, till: null, vecka: v });
    });
  }
  return { regler, sasong };
}

(async () => {
  const url = '/wfs?service=WFS&version=1.1.0&request=GetFeature'
            + '&outputFormat=application%2Fjson&srsName=EPSG:4326'
            + '&typeName=' + encodeURIComponent(LAGER);
  const j = await hamta(url);
  const features = j.features || [];

  const men = new Map();
  let tomma = 0;
  for (const f of features) {
    const m = ((f.properties || {}).MaxParkingTimeLimitation || '').replace(/\s+/g, ' ').trim();
    if (!m) { tomma++; continue; }
    men.set(m, (men.get(m) || 0) + 1);
  }

  const poster = [], utelamnade = [];
  for (const [mening, antal] of men) {
    const r = tolka(mening);
    // ANTAL KLOCKSLAG SOM KONTROLL: hittade vi färre regler med tid än meningen har
    // klockslag har tolkningen tappat något, och då får den inte gå in i tabellen.
    const iMeningen = (mening.match(/\d{1,2}\.\d{2}\s*-\s*\d{1,2}\.\d{2}/g) || []).length;
    const medTid = r.regler.filter(x => x.fran != null);
    if (!r.regler.length || !medTid.length || medTid.length !== iMeningen) {
      utelamnade.push({ mening, strackor: antal,
                        skal: !iMeningen ? 'inga klockslag i meningen'
                                         : 'tolkningen fångade ' + medTid.length + ' av ' + iMeningen + ' klockslag' });
      continue;
    }
    poster.push({ mening, strackor: antal, regler: medTid, sasong: r.sasong });
  }
  poster.sort((a, b) => b.strackor - a.strackor);

  const ut = {
    beskrivning: 'Göteborgs lastplatsmeningar (MaxParkingTimeLimitation på lagret '
      + 'parkering:lastplats) översatta till NÄR lastplatsen gäller. Meningen är '
      + 'föreskriftens egen text, ordagrant. Uppslag sker på EXAKT sträng – en mening '
      + 'som inte finns här ger "vet inte", och då rör appen inte segmentet.',
    kalla: 'open.geodata.tkgbg.se, lagret ' + LAGER + ' (nyckelfritt WFS).',
    verifiering: 'Meningen är en ordagrann avskrift av föreskriftens tidsklausul – '
      + 'kontrollerat mot RDT-PDF för 1480 2009-02158, 1480 2013-00616 och '
      + '1480 2021-02709 (3 av 3 identiska).',
    dagtyper: {
      'vardag-ej-dagfore': 'vardag som inte är dag före sön- eller helgdag',
      'dagfore': 'dag före sön- eller helgdag',
      'sonhelg': 'söndag eller helgdag',
      'vardag': 'vardag',
      'alla': 'alla dagar',
      'mandag..sondag': 'exakt den veckodagen'
    },
    lastplatserTotalt: features.length,
    utanMening: tomma,
    utanMeningBetyder: 'Dygnet runt. Läst i RDT för fyra av dem (2008/2014/2022/2026) – '
      + 'ingen nämner klockslag. Hanteras av ANDAMAL_ALLTID i cities/goteborg.js, inte här.',
    utelamnade,
    last: new Date().toISOString().slice(0, 10),
    poster
  };
  fs.writeFileSync(path.join(__dirname, 'gbg-lastplats-tider.json'), JSON.stringify(ut, null, 1));

  const strackor = poster.reduce((a, b) => a + b.strackor, 0);
  console.log('lastplatser totalt : ' + features.length);
  console.log('utan mening        : ' + tomma + '  (dygnet runt – hanteras i adaptern)');
  console.log('olika meningar     : ' + men.size);
  console.log('i tabellen         : ' + poster.length + ' meningar, ' + strackor + ' sträckor');
  console.log('utelämnade         : ' + utelamnade.length + ' meningar, '
              + utelamnade.reduce((a, b) => a + b.strackor, 0) + ' sträckor');
  console.log('med säsong         : ' + poster.filter(p => p.sasong).length);
  console.log('med veckoparitet   : ' + poster.filter(p => p.regler.some(r => r.vecka)).length);
  console.log('vändande fönster   : ' + poster.filter(p => p.regler.some(r => r.fran >= r.till)).length);
  console.log('');
  utelamnade.forEach(u => console.log('UTELÄMNAD (' + u.strackor + ') ' + u.skal + '\n   ' + u.mening));
  console.log('');
  poster.forEach((p, i) => {
    console.log(String(i + 1).padStart(3) + '. ' + String(p.strackor).padStart(3) + '  '
      + p.regler.map(r => r.dag + ' ' + r.fran + '-' + r.till + (r.vecka ? ' [' + r.vecka + ']' : '')).join(' | ')
      + (p.sasong ? '  {säsong ' + p.sasong.fran + '-' + p.sasong.till + '}' : ''));
    console.log('      ' + p.mening);
  });
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
