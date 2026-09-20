#!/usr/bin/env node
/**
 * bygg-gbg-natt.js – underlag till SEO-sidan «Parkera över natten i Göteborg».
 *
 * Sidan måste svara på en enda fråga: kan bilen stå kvar till i morgon? I Göteborg
 * avgörs det av TVÅ saker, och båda finns i kommunens öppna data:
 *   1. Städningen – när på dygnet, vilken veckodag och vilken veckoparitet.
 *   2. Tidsgränsen – och om den ens gäller på natten (villkorstexten).
 *
 * Siffrorna får ALDRIG skrivas för hand i seo/build.js: kommunen lägger till och tar
 * bort sträckor löpande, och en sida som påstår «512 sträckor städas på natten» måste
 * gå att räkna om. Kör om skriptet och committa seo/goteborg-natt.json.
 *
 *   node verktyg/bygg-gbg-natt.js
 *
 * Källa: open.geodata.tkgbg.se (Trafikkontorets öppna WFS, ingen nyckel).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const HOST = 'open.geodata.tkgbg.se';
const url = lager => `https://${HOST}/wfs?service=WFS&version=1.1.0&request=GetFeature`
  + `&outputFormat=application%2Fjson&srsName=EPSG:4326&typeName=${encodeURIComponent(lager)}`;

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

// Fältnamnen skiftar i versaler mellan lagren (SiteName/sitename) – läs okänsligt.
const norm = o => { const m = {}; for (const k in o) m[k.toLowerCase()] = o[k]; return m; };
const lagerAv = f => String(f && f.id || '').split('.')[0];

(async () => {
  const [stad, park] = await Promise.all([
    hamta(url('general:cleaningzones_3007')),
    hamta(url('parkering:tidsbegransad,parkering:boende')),
  ]);

  // Bara poster appen faktiskt använder: veckodag 1–5. En post saknar veckodag helt och
  // kastas av adaptern (cities/goteborg.js) – den ska inte räknas här heller, annars
  // säger den här sidan 2 003 medan resten av sajten säger 2 002.
  const S = (stad.features || []).map(f => norm(f.properties || {}))
    .filter(x => x.weekday >= 1 && x.weekday <= 5);
  const tider = {}, dagar = {};
  let uddaBara = 0, jamnBara = 0, varjeVecka = 0, nattstad = 0;
  for (const x of S) {
    const t = `${x.starthour}–${x.endhour}`;
    tider[t] = (tider[t] || 0) + 1;
    if (x.weekday >= 1 && x.weekday <= 5) dagar[x.weekday] = (dagar[x.weekday] || 0) + 1;
    const u = x.oddweeks === 'Yes', j = x.evenweeks === 'Yes';
    if (u && j) varjeVecka++; else if (u) uddaBara++; else if (j) jamnBara++;
    // NATTSTÄDNING = börjar före klockan 8. Det är gränsen som betyder något för
    // frågan «kan bilen stå kvar till i morgon»: en städning 09–12 hinner man flytta
    // sig ifrån efter frukost, en 02–07 gör det inte.
    if (x.starthour != null && x.starthour < 8) nattstad++;
  }

  const P = (park.features || []);
  const tb = P.filter(f => lagerAv(f) === 'tidsbegransad').map(f => norm(f.properties || {}));
  const boende = P.filter(f => lagerAv(f) === 'boende').length;
  const granser = {};
  let villkorVardag = 0, medVillkor = 0;
  for (const x of tb) {
    const g = String(x.maxparkingtime || '').trim() || '(tom)';
    granser[g] = (granser[g] || 0) + 1;
    const v = String(x.maxparkingtimelimitation || '').trim();
    if (v) { medVillkor++; if (/vardag/i.test(v)) villkorVardag++; }
  }

  const ut = {
    _kommentar: 'Genererad av verktyg/bygg-gbg-natt.js – skriv inte för hand.',
    matt: new Date().toISOString().slice(0, 10),
    stad: {
      poster: S.length, nattstad, uddaBara, jamnBara, varjeVecka,
      dagar,
      tider: Object.entries(tider).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([tid, antal]) => ({ tid, antal })),
    },
    tidsbegransade: tb.length,
    granser: Object.entries(granser).sort((a, b) => b[1] - a[1])
      .map(([namn, antal]) => ({ namn, antal })),
    villkorVardag, medVillkor, boende,
  };
  const fil = path.join(__dirname, '..', 'seo', 'goteborg-natt.json');
  fs.writeFileSync(fil, JSON.stringify(ut, null, 1));
  console.log(`[gbg-natt] ${S.length} städposter, varav ${nattstad} börjar före kl 8`);
  console.log(`[gbg-natt] ${tb.length} tidsbegränsade sträckor, ${boende} boendeposter`);
  console.log(`[gbg-natt] skrev ${path.relative(path.join(__dirname, '..'), fil)}`);
})().catch(e => { console.error('[gbg-natt] FEL:', e.message); process.exit(1); });
