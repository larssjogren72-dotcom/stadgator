'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// SEO-UNDERLAG FÖR KARLSTAD → seo/karlstad.json
// ─────────────────────────────────────────────────────────────────────────────
// Samma mönster som verktyg/bygg-uppsala-seo.js: siffrorna MÄTS här, en gång, och
// sidorna i seo/build.js läser dem. Sidorna får aldrig anropa nätet vid byggtid –
// ett nätfel blir annars en sida med nollor i drift.
//
// ⚠ Underlaget hämtas genom ADAPTERN (cities/karlstad.js), inte direkt ur kommunens
// server. Då beskriver sidorna exakt det appen visar – samma normalisering, samma
// bortfall av tomma rader, samma namn. En egen hämtning här hade kunnat glida isär.
//
// Servicedagarna per gata tas ur kommunens EGEN publicerade lista
// (verktyg/karlstad-servicedagar-facit.json), inte ur våra härledda gatunamn. Det
// kommunen skriver ut ordagrant är säkrare på en sida som folk läser som ett svar.
//
// KÖR: node verktyg/bygg-karlstad-seo.js

const https = require('https');
const fs = require('fs');
const path = require('path');
const rot = path.join(__dirname, '..');

const SCHED_API_DAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
const agent = new https.Agent({ keepAlive: true, maxSockets: 8 });
const stad = require(path.join(rot, 'cities', 'karlstad.js'))({
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

(async () => {
  // Hela Karlstads tätort och mer. Adaptern frågar kommunen utan tak, så rutan kan
  // vara stor; avgiftssträckorna finns bara i centralorten.
  const BBOX = '13.30,59.30,13.75,59.50';
  const park = await anropa('/karlstad/wfs-tillaten?BBOX=' + BBOX);
  const stadData = await anropa('/karlstad/servicedagar-bbox?dagar=1,2,3,4,5&bbox=' + BBOX);
  const phus = await anropa('/karlstad/phus');
  const facit = JSON.parse(fs.readFileSync(path.join(__dirname, 'karlstad-servicedagar-facit.json'), 'utf8'));

  const F = park.features;
  // Samma sträcka kan komma som flera linjer; räkna poster, inte linjer, när det gäller platser.
  const unika = new Map();
  for (const f of F) {
    const c = f.geometry.coordinates;
    const k = c[0].join(',') + '|' + c[c.length - 1].join(',');
    if (!unika.has(k)) unika.set(k, f.properties);
  }
  const P = [...unika.values()];
  const platserTotalt = P.reduce((s, p) => s + (p.VF_PLATSER || 0), 0);

  // Tidsgränser
  const grans = { 'Högst 120 minuter': 0, 'Högst 1 dygn': 0, 'Högst 1 vecka': 0, 'Ingen gräns i datan': 0 };
  for (const p of P) {
    const min = p.MAX_MINUTES != null ? p.MAX_MINUTES : p.MAX_HOURS != null ? p.MAX_HOURS * 60
              : p.MAX_DAYS != null ? p.MAX_DAYS * 1440 : null;
    if (min == null) grans['Ingen gräns i datan']++;
    else if (min <= 120) grans['Högst 120 minuter']++;
    else if (min <= 1440) grans['Högst 1 dygn']++;
    else grans['Högst 1 vecka']++;
  }

  // Vilken tidsgränsklass hör en sträcka till? Samma trappa som `grans` ovan, utbruten
  // så att zonsidorna kan räkna per zon utan att definitionen skrivs två gånger.
  const gransKlass = p => {
    const min = p.MAX_MINUTES != null ? p.MAX_MINUTES : p.MAX_HOURS != null ? p.MAX_HOURS * 60
              : p.MAX_DAYS != null ? p.MAX_DAYS * 1440 : null;
    return min == null ? 'Ingen gräns i datan'
         : min <= 120 ? 'Högst 120 minuter'
         : min <= 1440 ? 'Högst 1 dygn' : 'Högst 1 vecka';
  };

  // Zoner och deras prisrader (ordagrant som adaptern skriver dem)
  const zoner = new Map();
  for (const p of P) {
    const rate = p.PARKING_RATE || '';
    const i = rate.indexOf(':');
    const zon = i > 0 ? rate.slice(0, i).trim() : (rate || 'Okänt område');
    const pris = i > 0 ? rate.slice(i + 1).trim() : '';
    const z = zoner.get(zon) || { zon, stracker: 0, platser: 0, priser: new Map(),
                                  gator: new Set(), granser: {} };
    z.stracker++;
    z.platser += p.VF_PLATSER || 0;
    if (pris) z.priser.set(pris, (z.priser.get(pris) || 0) + 1);
    // Gatunamnen är HÄRLEDDA (se tabellen i cities/karlstad.js): 304 av 381 sträckor har
    // ett namn, resten lämnas utan. En sida får därför aldrig påstå att listan är
    // fullständig – den visar de gator vi kan namnge, inte alla gator i zonen.
    const namn = (p.STREET_NAME || '').trim();
    if (namn) z.gator.add(namn);
    const k = gransKlass(p);
    z.granser[k] = (z.granser[k] || 0) + 1;
    zoner.set(zon, z);
  }
  const zonLista = [...zoner.values()]
    .sort((a, b) => b.stracker - a.stracker)
    .map(z => ({
      zon: z.zon, stracker: z.stracker, platser: z.platser,
      // Vanligaste prisraden först. Ett område kan ha flera, t.ex. dag- och helgtaxa.
      priser: [...z.priser.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 3),
      gator: [...z.gator].sort((a, b) => a.localeCompare(b, 'sv')),
      granser: z.granser
    }));

  const stadSegment = Object.values(stadData.dagar).reduce((s, fc) => s + fc.features.filter(f => f.properties.KARLSTAD_KALLA === 'servicedagar').length, 0);
  let stadMeter = 0;
  for (const fc of Object.values(stadData.dagar)) {
    for (const f of fc.features) {
      // Bara städlagrets egna linjer: konfliktregelns tillägg ligger ovanpå samma gata
      // och skulle annars räknas två gånger i kilometertalet.
      if (f.properties.KARLSTAD_KALLA !== 'servicedagar') continue;
      const c = f.geometry.coordinates;
      for (let i = 1; i < c.length; i++) {
        const dx = (c[i][0] - c[i - 1][0]) * 111320 * Math.cos(c[i][1] * Math.PI / 180);
        const dy = (c[i][1] - c[i - 1][1]) * 111320;
        stadMeter += Math.hypot(dx, dy);
      }
    }
  }

  const ut = {
    _kommentar: 'Uppmätt underlag för Karlstads SEO-sidor. Byggt av verktyg/bygg-karlstad-seo.js genom adaptern. Redigera inte för hand.',
    matt: new Date().toISOString().slice(0, 10),
    strackorTotalt: P.length,
    platserTotalt,
    granser: Object.entries(grans).map(([namn, antal]) => ({ namn, antal })),
    zoner: zonLista,
    servicedagar: {
      segment: stadSegment,
      km: Math.round(stadMeter / 100) / 10,
      grupper: facit.rader.map(r => ({ veckodag: r.veckodag, vecka: r.vecka, klockslag: r.klockslag, gator: r.gator })),
      gator: facit.rader.reduce((s, r) => s + r.gator.length, 0),
      kalla: facit.kalla,
      sidanUppdaterad: facit.sidanUppdaterad
    },
    anlaggningar: {
      totalt: phus.length,
      garage: phus.filter(a => a.Anlaggningstyp === 'Garage').map(a => a.Name).sort(),
      ytor: phus.filter(a => a.Anlaggningstyp !== 'Garage').length
    }
  };

  // Rimlighetsvakt: ett underlag med nollor ska aldrig skrivas.
  if (ut.strackorTotalt < 300) throw new Error('för få sträckor (' + ut.strackorTotalt + ') – avbryter');
  if (ut.servicedagar.segment < 150) throw new Error('för få städsegment (' + ut.servicedagar.segment + ') – avbryter');
  if (ut.anlaggningar.totalt < 20) throw new Error('för få anläggningar (' + ut.anlaggningar.totalt + ') – avbryter');

  const fil = path.join(rot, 'seo', 'karlstad.json');
  fs.writeFileSync(fil, JSON.stringify(ut, null, 1), 'utf8');
  console.log(`Skrev ${fil}`);
  console.log(`  ${ut.strackorTotalt} sträckor · ${ut.platserTotalt} platser · ${zonLista.length} områden`);
  console.log(`  tidsgränser: ` + ut.granser.map(g => g.namn + ' ' + g.antal).join(' · '));
  console.log(`  servicedagar: ${stadSegment} segment, ${ut.servicedagar.km} km, ${ut.servicedagar.gator} gator i kommunens lista`);
  console.log(`  anläggningar: ${ut.anlaggningar.totalt} (${ut.anlaggningar.garage.length} garage)`);
  process.exit(0);
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
