#!/usr/bin/env node
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// SEO-UNDERLAG: GÖTEBORGS BOENDEZONER → seo/goteborg-zoner.json
// ─────────────────────────────────────────────────────────────────────────────
// VARFÖR: Search Console 2026-09-22 visar att folk söker ZONKODEN rakt av –
// «m4n parkering» 41 visningar, «m4n göteborg» 26, «boende m4n» 20, «ä9» 15,
// «boende m5 göteborg» 11, «v6n», «g9n», «s7n» … tillsammans ~170 visningar och
// nästan noll klick. Sajtens Göteborgssidor är indelade efter OMRÅDE (Mellanstaden,
// Väster), så ingen sida svarar på koden någon har läst på skylten.
//
// Samma mönster som verktyg/bygg-karlstad-seo.js: allt MÄTS här, en gång, genom
// ADAPTERN (cities/goteborg.js). Sidorna i seo/build.js läser bara filen, och
// beskriver därför exakt det appen visar – samma normalisering, samma bortfall.
//
// ⚠ n-SUFFIXET ÄR INTE EN EGEN ZON. «M4n» är samma geografi som «M4», men
// tillståndet gäller bara kvällar och nätter (18–09). Därför grupperas de ihop:
// en sida per zonnummer, med båda koderna. Se reference_goteborg_boendeparkering.
//
// KÖR:  node verktyg/bygg-gbg-zoner.js

const https = require('https');
const fs = require('fs');
const path = require('path');
const rot = path.join(__dirname, '..');

const SCHED_API_DAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
const agent = new https.Agent({ keepAlive: true, maxSockets: 8 });
const stad = require(path.join(rot, 'cities', 'goteborg.js'))({
  https, keepAliveAgent: agent, SCHED_API_DAYS, segDistM: () => 0,
  send: (rq, rs, kod, typ, buf) => rs.end(buf), fs, path, rot
});

function anropa(vag) {
  return new Promise((klar, nej) => {
    const res = { setHeader() {}, writeHead() {}, end(b) {
      try {
        const j = JSON.parse(String(b));
        if (j && j.error) return nej(new Error(vag + ': ' + j.error));
        klar(j);
      } catch (e) { nej(e); }
    } };
    const u = new URL('http://x' + vag);
    if (!stad.hantera({ pathname: u.pathname, searchParams: u.searchParams }, { headers: {} }, res)) {
      nej(new Error('vägen togs inte om hand: ' + vag));
    }
  });
}

// Hela Göteborg i fyra rutor: en enda ruta över hela staden ger ett svar som
// tar minuter och riskerar serverns egen gräns. Rutorna överlappar med flit –
// dubbletter räknas bort på geometri nedan.
const RUTOR = [
  '11.75,57.63,11.98,57.72',   // väster + centrum söder
  '11.90,57.66,12.10,57.75',   // centrum + öster
  '11.80,57.70,12.05,57.82',   // Hisingen
  '11.90,57.60,12.15,57.70'    // söder/sydost
];

(async () => {
  const sedda = new Map();
  for (const bbox of RUTOR) {
    const svar = await anropa('/gbg/wfs-tillaten?BBOX=' + bbox);
    for (const f of svar.features) {
      const c = f.geometry && f.geometry.coordinates;
      if (!c || !c.length) continue;
      const nyckel = String(c[0]) + '|' + String(c[c.length - 1]);
      if (!sedda.has(nyckel)) sedda.set(nyckel, f.properties);
    }
    console.log(`  ruta ${bbox}: ${svar.features.length} segment, totalt unika ${sedda.size}`);
  }

  // Gruppera på zonNUMMER (M4 och M4n hör ihop), men spara båda koderna.
  const zoner = new Map();
  for (const p of sedda.values()) {
    const kod = (p.GBG_BOENDE || '').trim();
    if (!kod) continue;
    const bas = kod.replace(/n$/i, '');
    const z = zoner.get(bas) || {
      zon: bas, koder: new Set(), stracker: 0, gator: new Set(),
      taxor: new Map(), staddagar: new Map(), maxtid: new Map(), medStadning: 0
    };
    z.koder.add(kod);
    z.stracker++;
    // ⚠ INGEN PLATSSUMMA. VF_PLATSER bär ZONENS totalsiffra på varje segment i
    // zonlagret – «Zon Änggården» står med 272 på var och en av sina poster, och en
    // summering gav 10 897 platser på 60 sträckor. Uppmätt 2026-09-22. Fältet går
    // alltså inte att addera, och en siffra vi inte kan lita på ska inte publiceras.
    const namn = (p.STREET_NAME || '').trim();
    // Samma poster bär zonens NAMN i gatufältet («Zon Landala Egnahem») – det är
    // ingen gata och ska inte stå i en gatulista.
    if (namn && !/^Zon /i.test(namn)) z.gator.add(namn);
    const taxa = (p.PARKING_RATE || '').trim();
    if (taxa && taxa !== 'avgiftsfri') z.taxor.set(taxa, (z.taxor.get(taxa) || 0) + 1);
    const stadtext = (p.GBG_STADTEXT || '').trim();
    if (stadtext) { z.medStadning++; z.staddagar.set(stadtext, (z.staddagar.get(stadtext) || 0) + 1); }
    const mv = (p.GBG_MAXTID_VILLKOR || '').trim();
    if (mv) z.maxtid.set(mv, (z.maxtid.get(mv) || 0) + 1);
    zoner.set(bas, z);
  }

  const topp = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([t, antal]) => ({ text: t, antal }));
  const lista = [...zoner.values()]
    .sort((a, b) => b.stracker - a.stracker)
    .map(z => ({
      zon: z.zon,
      koder: [...z.koder].sort(),
      harNatt: [...z.koder].some(k => /n$/i.test(k)),
      stracker: z.stracker,
      gator: [...z.gator].sort((a, b) => a.localeCompare(b, 'sv')),
      medStadning: z.medStadning,
      taxor: topp(z.taxor, 3),
      staddagar: topp(z.staddagar, 5),
      maxtid: topp(z.maxtid, 2)
    }));

  const ut = {
    _kommentar: 'Uppmätt underlag för Göteborgs zonsidor. Byggt av verktyg/bygg-gbg-zoner.js genom adaptern. Redigera inte för hand.',
    matt: new Date().toISOString().slice(0, 10),
    segmentTotalt: sedda.size,
    zoner: lista
  };

  // Rimlighetsvakt: hellre inget underlag än ett tomt (se NY_STAD.md).
  if (lista.length < 10) throw new Error('för få zoner (' + lista.length + ') – avbryter');
  if (ut.segmentTotalt < 3000) throw new Error('för få segment (' + ut.segmentTotalt + ') – avbryter');

  const fil = path.join(rot, 'seo', 'goteborg-zoner.json');
  fs.writeFileSync(fil, JSON.stringify(ut, null, 1), 'utf8');
  console.log(`Skrev ${fil}`);
  console.log(`  ${ut.segmentTotalt} unika segment · ${lista.length} zoner`);
  lista.slice(0, 8).forEach(z => console.log(`  ${z.zon} (${z.koder.join(', ')}): ${z.stracker} sträckor, ${z.gator.length} gator`));
  process.exit(0);
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
