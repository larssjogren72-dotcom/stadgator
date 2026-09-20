#!/usr/bin/env node
/**
 * bygg-gbg-taxa.js – underlag till SEO-sidan «Vad kostar parkering i Göteborg?».
 *
 * Göteborg publicerar taxan som FJORTON separata WFS-lager (taxa_1…taxa_8, taxa_a,
 * taxa_22, taxa_24, Taxa_9, Taxa_12, Taxa_62), ett per prisnivå, med en linje per
 * gatusträcka. Priset står som färdig text i fältet ParkingCost, till exempel
 * «34 kr/tim 8-22 alla dagar. Övrig tid: 2 kr/tim».
 *
 * ⚠ TVÅ FÄLLOR, båda verifierade 2026-09-20:
 *  1. **Taxenumret betyder inte samma sak som i Stockholm.** Göteborgs taxa 1 är
 *     34 kr/tim och taxa 7 är 7 kr/tim – numret är ett ID, inte en rangordning.
 *     Sidan sorterar därför på PRISET, aldrig på lagrets nummer.
 *  2. **Lagernamnens skiftläge varierar** (taxa_1 men Taxa_9). Läser man bara gemener
 *     tappar man 77 sträckor tyst.
 *
 * Nivåer med samma pris slås ihop: läsaren vill veta vad det kostar, inte hur många
 * interna koder kommunen har för 34 kr/tim.
 *
 *   node verktyg/bygg-gbg-taxa.js
 *
 * Källa: open.geodata.tkgbg.se (Trafikkontorets öppna WFS, ingen nyckel).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const HOST = 'open.geodata.tkgbg.se';
const LAGER = ['taxa_1', 'taxa_2', 'taxa_3', 'taxa_4', 'taxa_5', 'taxa_6', 'taxa_7',
               'taxa_8', 'taxa_a', 'taxa_22', 'taxa_24', 'Taxa_9', 'Taxa_12', 'Taxa_62'];

function hamta(u) {
  return new Promise((ok, nej) => {
    https.get(u, r => {
      if (r.statusCode !== 200) { r.resume(); return nej(new Error('HTTP ' + r.statusCode)); }
      let s = ''; r.setEncoding('utf8');
      r.on('data', d => s += d);
      r.on('end', () => { try { ok(JSON.parse(s)); } catch (e) { nej(e); } });
    }).on('error', nej);
  });
}
const norm = o => { const m = {}; for (const k in o) m[k.toLowerCase()] = o[k]; return m; };
const lagerAv = f => String(f && f.id || '').split('.')[0];

// «34 kr/tim …» → 34 · «23 kr/30 min …» → 46. Halvtimmespriset måste räknas om, annars
// hamnar stadens DYRASTE nivå näst sist i listan.
function kronorPerTimme(text) {
  const halv = /(\d+)\s*kr\s*\/\s*30\s*min/i.exec(text);
  if (halv) return +halv[1] * 2;
  const tim = /(\d+)\s*kr\s*\/\s*tim/i.exec(text);
  return tim ? +tim[1] : null;
}

(async () => {
  const url = `https://${HOST}/wfs?service=WFS&version=1.1.0&request=GetFeature`
            + '&outputFormat=application%2Fjson&srsName=EPSG:4326&typeName='
            + LAGER.map(l => encodeURIComponent('parkering:' + l)).join(',');
  const j = await hamta(url);
  const fsx = (j && j.features) || [];

  const perLager = new Map();
  for (const f of fsx) {
    const p = norm(f.properties || {});
    const l = lagerAv(f);
    const rad = perLager.get(l) || { lager: l, strackor: 0, priser: new Map(), platser: 0 };
    rad.strackor++;
    const pris = String(p.parkingcost || '').trim();
    if (pris) rad.priser.set(pris, (rad.priser.get(pris) || 0) + 1);
    const pl = +p.totalparkningspaces;
    if (Number.isFinite(pl)) rad.platser += pl;
    perLager.set(l, rad);
  }

  // Slå ihop nivåer med IDENTISK pristext – det är priset läsaren bryr sig om.
  const perPris = new Map();
  for (const rad of perLager.values()) {
    if (!rad.priser.size) continue;
    const [text] = [...rad.priser.entries()].sort((a, b) => b[1] - a[1])[0];
    const nyckel = text;
    const s = perPris.get(nyckel) || { text, strackor: 0, platser: 0, lager: [], kr: kronorPerTimme(text) };
    s.strackor += rad.strackor;
    s.platser += rad.platser;
    s.lager.push(rad.lager);
    perPris.set(nyckel, s);
  }
  const niva = [...perPris.values()].sort((a, b) => (b.kr || 0) - (a.kr || 0));

  const ut = {
    _kommentar: 'Genererad av verktyg/bygg-gbg-taxa.js – skriv inte för hand.',
    matt: new Date().toISOString().slice(0, 10),
    strackorTotalt: fsx.length,
    lagerTotalt: perLager.size,
    nivaer: niva.map(n => ({ pris: n.text, krPerTim: n.kr, strackor: n.strackor,
                             platser: n.platser, lager: n.lager.sort() })),
  };
  const fil = path.join(__dirname, '..', 'seo', 'goteborg-taxa.json');
  fs.writeFileSync(fil, JSON.stringify(ut, null, 1));
  console.log(`[gbg-taxa] ${fsx.length} sträckor i ${perLager.size} lager → ${niva.length} prisnivåer`);
  niva.forEach(n => console.log(`  ${String(n.kr).padStart(3)} kr/tim  ${String(n.strackor).padStart(4)} sträckor  ${n.lager.join(', ')}`));
  console.log('[gbg-taxa] skrev ' + path.relative(path.join(__dirname, '..'), fil));
})().catch(e => { console.error('[gbg-taxa] FEL:', e.message); process.exit(1); });
