// Vaktar Göteborgs två uppslagstabeller mot stadens öppna data.
//
//   node verktyg/kolla-gbg-tabeller.js
//
// Exit 0 = allt stämmer. Exit 1 = något har ändrats. Exit 2 = kontrollen gick inte att köra.
//
// VARFÖR DEN SER ANNORLUNDA UT ÄN STOCKHOLMS: Göteborgs kartdata har INGA
// giltighetsdatum. Det finns inget VALID_FROM att jämföra mot, alltså inget datum
// som kan drifta. Det staden ger oss i stället är föreskriftens TEXT, ordagrant
// (kontrollerat mot beslutet i RDT sju gånger, sju av sju identiska). Meningen är
// därför både nyckeln och larmet: ändrar staden en formulering hittas den inte
// längre, och då säger appen "vet inte" i stället för att tillämpa fel tider.
//
// Säkert — men tyst. Den här kontrollen gör tystnaden hörbar, och ställer två frågor
// per tabell:
//   1. Finns alla våra rader kvar i datan?      → annars är raden död
//   2. Finns meningar i datan som saknar rad?   → då gäller inte funktionen där
// Fråga 2 är den intressanta: en sådan sträcka visar sin tidsgräns hela tiden, även
// när gränsen vilar. Det är åt det försiktiga hållet, men det är inte sant.
//
// ⚠ INGEN NYCKEL BEHÖVS. Göteborgs WFS är öppen.
const fs = require('fs');
const path = require('path');
const https = require('https');

const HAR = __dirname;
const VILLKOR   = path.join(HAR, 'gbg-maxtid-villkor.json');
const LASTPLATS = path.join(HAR, 'gbg-lastplats-tider.json');

// Lagerlistan hämtas ur ADAPTERN, inte skriven av här. En avskrift hade kunnat glida
// isär från appens verkliga fråga utan att någon märkte det – och då hade vakten
// vaktat fel mängd.
const { P_LAGER_LISTA } = require(path.join(HAR, '..', 'cities', 'goteborg.js'));

const HOST = 'open.geodata.tkgbg.se';

function hamta(sokvag) {
  return new Promise((res, rej) => {
    const bitar = [];
    const r = https.request({ hostname: HOST, port: 443, path: sokvag, method: 'GET' }, resp => {
      resp.on('data', c => bitar.push(c));
      resp.on('end', () => {
        const t = Buffer.concat(bitar).toString('utf8');
        // WFS svarar med XML-ExceptionReport vid fel, ALDRIG med HTTP-felkod.
        if (t.trimStart().startsWith('<')) return rej(new Error('WFS-undantag: ' + t.slice(0, 200).replace(/\s+/g, ' ')));
        try { res(JSON.parse(t)); } catch (e) { rej(e); }
      });
    });
    r.on('error', rej);
    r.setTimeout(180000, () => r.destroy(new Error('timeout mot ' + HOST)));
    r.end();
  });
}

// Fältnamn i olika skiftlägen – samma fälla som adaptern hanterar.
const falt = (p, namn) => (p && (p[namn] != null ? p[namn] : p[String(namn).toLowerCase()])) || null;
const lagerAv = f => String(f && f.id || '').split('.')[0];
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

(async () => {
  const villkor   = JSON.parse(fs.readFileSync(VILLKOR, 'utf8'));
  const lastplats = JSON.parse(fs.readFileSync(LASTPLATS, 'utf8'));

  const url = '/wfs?service=WFS&version=1.1.0&request=GetFeature'
            + '&outputFormat=application%2Fjson&srsName=EPSG:4326'
            + '&typeName=' + encodeURIComponent(P_LAGER_LISTA.join(','));
  const svar = await hamta(url);
  const features = svar.features || [];
  // Ett tomt svar är inte en trolig verklighet – det är ett trasigt anrop.
  // (Stockholmsvakten larmade en gång "46 rader borta" av precis det skälet.)
  if (features.length < 1000) {
    console.error('Bara ' + features.length + ' poster från Göteborgs WFS. Förväntat tusentals – avbryter.');
    process.exit(2);
  }

  // ── Två populationer ──────────────────────────────────────────────────────
  // VILLKOR: allt UTOM lastplats som bär en maxtid. Avgränsningen är inte vald på
  // känsla – appen slår upp villkoret enbart när `s.maxMinutes != null` (se de tre
  // anropen till maxtidGallerVillkor i index.html). En mening på en post utan maxtid
  // har ingen gräns att stänga av, och hör alltså inte hit.
  // LASTPLATS: lastplatslagret. Tomma meningar räknas separat – de betyder
  // "dygnet runt" och hanteras av ANDAMAL_ALLTID i adaptern, inte av tabellen.
  const vPop = new Map(), lPop = new Map();
  let lastplatsUtanMening = 0, lastplatsTotalt = 0;
  for (const f of features) {
    const p = f.properties || {}, lag = lagerAv(f);
    const mening = norm(falt(p, 'MaxParkingTimeLimitation'));
    if (lag === 'lastplats') {
      lastplatsTotalt++;
      if (!mening) { lastplatsUtanMening++; continue; }
      lPop.set(mening, (lPop.get(mening) || 0) + 1);
      continue;
    }
    if (!mening) continue;
    const mt = falt(p, 'MaxParkingTime');
    if (mt == null || String(mt).trim() === '') continue;
    vPop.set(mening, (vPop.get(mening) || 0) + 1);
  }

  function jamfor(namn, tabell, pop) {
    const rader = new Map(tabell.poster.map(p => [norm(p.mening), p.strackor]));
    const utelamnade = new Set((tabell.utelamnade || []).map(u => norm(typeof u === 'string' ? u : u.mening)));
    // ⚠ ANTALET STRÄCKOR JÄMFÖRS INTE. Tabellernas `strackor` räknades på appens egen
    // sammanslagna endpoint, som släpper ytor och slår ihop boende-tvillingar; här räknas
    // råa WFS-poster. Första versionen jämförde dem ändå och rapporterade "11 rader har
    // ändrat antal sträckor" dagen efter att tabellen byggdes – två olika mätningar, inte
    // en förändring. En vakt som ropar varg är värre än ingen vakt.
    const doda = [], utanRad = [];
    rader.forEach((n, m) => { if (!pop.has(m)) doda.push({ mening: m }); });
    utelamnade.forEach(m => { if (!pop.has(m)) doda.push({ mening: m, utelamnad: true }); });
    pop.forEach((n, m) => { if (!rader.has(m) && !utelamnade.has(m)) utanRad.push({ mening: m, strackor: n }); });
    utanRad.sort((a, b) => b.strackor - a.strackor);
    return { namn, rader: rader.size, utelamnade: utelamnade.size, iDatan: pop.size, doda, utanRad,
             strackorIDatan: [...pop.values()].reduce((a, b) => a + b, 0) };
  }

  const res = [jamfor('Villkorstabellen', villkor, vPop),
               jamfor('Lastplatstabellen', lastplats, lPop)];

  const idag = new Date().toISOString().slice(0, 10);
  console.log('Kontroll av Göteborgs tabeller mot stadens öppna data, ' + idag);
  console.log('');
  console.log(String(features.length).padStart(6) + '  poster i ' + P_LAGER_LISTA.length + ' lager');
  console.log(String(lastplatsTotalt).padStart(6) + '  lastplatser, varav ' + lastplatsUtanMening
              + ' utan mening (= dygnet runt, hanteras i adaptern)');

  let attGora = 0;
  for (const r of res) {
    console.log('\n── ' + r.namn + ' ' + '─'.repeat(Math.max(0, 58 - r.namn.length)));
    console.log(String(r.rader).padStart(6) + '  rader i tabellen (+ ' + r.utelamnade + ' medvetet utelämnade)');
    console.log(String(r.iDatan).padStart(6) + '  meningar i datan, ' + r.strackorIDatan + ' sträckor');
    console.log(String(r.doda.length).padStart(6) + '  rader utan träff i datan  → meningen är omskriven eller borta');
    console.log(String(r.utanRad.length).padStart(6) + '  meningar UTAN rad         → funktionen gäller inte där');
    attGora += r.doda.length + r.utanRad.length;

    const visa = (rubrik, lista, fmt, tak = 12) => {
      if (!lista.length) return;
      console.log('  ' + rubrik + ':');
      lista.slice(0, tak).forEach(x => console.log('    ' + fmt(x)));
      if (lista.length > tak) console.log('    … och ' + (lista.length - tak) + ' till');
    };
    visa('Utan träff i datan', r.doda, x => (x.utelamnad ? '(utelämnad) ' : '') + x.mening);
    // Meningar som börjar med "Avgiftsplikten gäller" handlar om NÄR DET KOSTAR, inte om
    // när tidsgränsen gäller. De hör inte hemma i villkorstabellen och ska inte nagga –
    // men de döljs inte heller, för den dagen någon vill bygga på dem finns de listade.
    const arGrans = x => !/^Avgiftsplikten/i.test(x.mening);
    visa('Utan rad – handlar om tidsgränsen', r.utanRad.filter(arGrans),
         x => String(x.strackor).padStart(4) + ' sträckor  ' + x.mening);
    visa('Utan rad – handlar om avgiften, inte gränsen', r.utanRad.filter(x => !arGrans(x)),
         x => String(x.strackor).padStart(4) + ' sträckor  ' + x.mening, 6);
  }

  if (!attGora) { console.log('\nInget att göra.'); process.exit(0); }

  console.log('\n── Att göra ' + '─'.repeat(50));
  console.log('  Meningar utan rad:  node verktyg/las-gbg-lastplats.js  (lastplats)');
  console.log('                      villkorstabellen byggs ur verktyg/gbg-maxtid-villkor.json');
  console.log('  Skriv sedan in dem: node verktyg/bygg-gbg-lastplats.js  /  bygg-gbg-villkor.js');
  console.log('  Granska diffen. En rad som försvinner betyder att en sträcka slutar');
  console.log('  dölja sin tidsgräns när den vilar – alltså mer varning, inte mindre.');
  process.exit(1);
})().catch(e => { console.error('FEL: ' + e.message); process.exit(2); });
