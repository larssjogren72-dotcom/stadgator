// PILOT-verktyg: bygger gatunamnstabell för Sundbyberg.
//
// VARFÖR: Sundbybergs öppna data saknar helt namnfält, men ParkSpots tre städmatchare
// (buildCleaningMatcher.near, buildNextCleaningWeek.sok, buildNextCleaningLookup) är alla
// nycklade på STREET_NAME och returnerar null utan det. Mätt i appen: 55 av 55 städposter
// kastades, 0 träffar. Med ett gemensamt namn injicerat: 38 träffar. Namnet är alltså enda
// hindret – geometrin matchar redan.
//
// HUR: kommunens städlager (70, 169) och zonlager (166) är vyer på SAMMA features – de delar
// både OBJECTID och geometri (verifierat: 507/539 resp 50/57 OID återfinns i 166, och OID 225
// har identiska koordinater i båda). Därför geokodas varje OID EN gång, och både städ- och
// zonsegmentet får samma namn. Det ger en exakt koppling utan risk att fånga grannagatan.
//
// Körs sällan och manuellt:  node pilot/bygg-sbg-gatunamn.js
// Resultatet committas (pilot/sbg-gatunamn.json) så servern slipper anropa Nominatim i drift.
// Skriptet är ÅTERUPPTAGBART: redan hämtade OID hoppas över, så ett avbrott kostar inget.

const fs = require('fs');
const path = require('path');
const https = require('https');

const UT = path.join(__dirname, 'sbg-gatunamn.json');
const HOST = 'gis.sundbyberg.se';
const BAS  = '/arcgis/rest/services/Sundbybergskartan_trafik/MapServer';
const LAGER = [166, 70, 169];        // 166 först: dess geometri vinner vid delad OID
const PAUS_MS = 1100;                // Nominatims policy: max 1 anrop/sekund
const UA = 'ParkSpot-pilot/1.0 (kontakt: lars.sjogren72@gmail.com)';

function hamtaJson(host, vag, headers) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const r = https.request({ hostname: host, port: 443, path: vag, method: 'GET', headers: headers || {} }, resp => {
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error('ogiltig JSON från ' + host)); }
      });
    });
    r.on('error', reject);
    r.setTimeout(30000, () => { r.destroy(new Error('timeout mot ' + host)); });
    r.end();
  });
}

const paus = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1. Samla en representativ punkt per OID.
  const punkter = new Map();          // OID → [lng, lat]
  for (const id of LAGER) {
    const j = await hamtaJson(HOST, `${BAS}/${id}/query?where=1%3D1&outFields=OBJECTID&returnGeometry=true&outSR=4326&f=json`);
    let nya = 0;
    for (const f of (j && j.features) || []) {
      const oid = f.attributes && f.attributes.OBJECTID;
      const bana = f.geometry && f.geometry.paths && f.geometry.paths[0];
      if (oid == null || !bana || !bana.length) continue;
      if (punkter.has(oid)) continue;               // 166 vann redan – samma geometri ändå
      punkter.set(oid, bana[Math.floor(bana.length / 2)]);
      nya++;
    }
    console.log(`lager ${id}: ${((j && j.features) || []).length} features, ${nya} nya OID`);
  }
  console.log(`\nUnika OID att geokoda: ${punkter.size}`);

  // 2. Läs in redan hämtade namn (återupptagbart).
  let namn = {};
  if (fs.existsSync(UT)) {
    try { namn = JSON.parse(fs.readFileSync(UT, 'utf8').replace(/^﻿/, '')); } catch {}
    console.log(`Befintlig tabell: ${Object.keys(namn).length} namn – hoppar över dem.`);
  }

  const kvar = [...punkter.keys()].filter(oid => !(oid in namn));
  console.log(`Kvar att hämta: ${kvar.length}  (~${Math.ceil(kvar.length * PAUS_MS / 60000)} min)\n`);

  let ok = 0, miss = 0, i = 0;
  for (const oid of kvar) {
    const [lng, lat] = punkter.get(oid);
    i++;
    try {
      const j = await hamtaJson('nominatim.openstreetmap.org',
        `/reverse?format=json&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`,
        { 'User-Agent': UA });
      const a = (j && j.address) || {};
      const gata = a.road || a.pedestrian || a.footway || a.residential || null;
      if (gata) { namn[oid] = gata; ok++; } else { namn[oid] = null; miss++; }
    } catch (e) {
      namn[oid] = null; miss++;
      console.warn(`  OID ${oid}: ${e.message}`);
    }
    if (i % 25 === 0 || i === kvar.length) {
      fs.writeFileSync(UT, JSON.stringify(namn, null, 0), 'utf8');   // spara löpande
      console.log(`  ${i}/${kvar.length} · träff ${ok} · utan namn ${miss}`);
    }
    await paus(PAUS_MS);
  }

  fs.writeFileSync(UT, JSON.stringify(namn, null, 0), 'utf8');
  const unika = [...new Set(Object.values(namn).filter(Boolean))];
  console.log(`\nKLART. ${Object.keys(namn).length} OID · ${ok} med namn · ${miss} utan.`);
  console.log(`Unika gator: ${unika.length}`);
  console.log(unika.slice(0, 25).sort((a, b) => a.localeCompare(b, 'sv')).join(', '));
})().catch(e => { console.error('AVBRÖT:', e.message); process.exit(1); });
