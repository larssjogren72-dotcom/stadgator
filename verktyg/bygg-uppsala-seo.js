#!/usr/bin/env node
/**
 * bygg-uppsala-seo.js - hamtar Uppsalas parkeringslager och skriver seo/uppsala.json,
 * underlaget for SEO-sidorna. Samma monster som seo/goteborg.json: sidorna far ALDRIG
 * rakna sjalva vid byggtid, for da hade en natverkstimeout blivit en tom sida i drift.
 *
 * Kor:  node verktyg/bygg-uppsala-seo.js
 *
 * VARFOR EN FIL OCH INTE LIVE-ANROP: seo/build.js kors for hand och i CI, och sidorna
 * ska kunna byggas om utan natet. Filen ar dessutom granskningsbar - siffrorna pa sidan
 * gar att spara till en rad har.
 *
 * ⚠ ALLT HAR AR MATT, INGET AR HARLETT. Skriptet skriver bara det lagren sager:
 * antal strackor, antal platser (kommunens eget falt), vilka tidsgranser som forekommer
 * och omradenas avgiftstexter ordagrant. Saknas en uppgift blir den null, aldrig en
 * uppskattning - se avsnitt 2 i NY_STAD.md om varfor tomt maste betyda tomt.
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const HOST = 'kartportal.uppsala.se';
const BAS = '/mapping/rest/services/iKommunkartan';
const LAGER = {
  avgift:     'GOT_Avgiftsparkeringar/FeatureServer/0',
  avgiftsfri: 'GOT_Avgiftsfri_parkering/FeatureServer/1',
  samnyttjad: 'GOT_Samnyttjad_parkering/FeatureServer/1'
};
const OMRADEN = 'GOT_Omradeskoder/FeatureServer/415';
const GARAGE  = 'GOT_Parkeringshus/FeatureServer/397';
// En stadsdel far egen sida forst nar den har nog med stracker att beskriva. Under det
// blir sidan en rubrik med tre rader - samre an ingen sida alls for bade lasare och sok.
const MIN_STRACKOR = 25;

function hamta(vag) {
  return new Promise((ok, nej) => {
    const r = https.request({ hostname: HOST, path: vag, method: 'GET' }, resp => {
      if (resp.statusCode !== 200) { resp.resume(); return nej(new Error('HTTP ' + resp.statusCode)); }
      let bit = ''; resp.setEncoding('utf8');
      resp.on('data', d => bit += d);
      resp.on('end', () => {
        let j;
        try { j = JSON.parse(bit); } catch (e) { return nej(e); }
        // ⚠ ArcGIS svarar HTTP 200 MED ett error-objekt nar ett faltnamn inte finns.
        // Utan den har raden gav avgiftsfri-lagret noll poster helt tyst: skriptet
        // rapporterade 1 563 av 1 888 strackor och sag lyckat ut (upptackt 2026-09-17,
        // samma sorts fel som avsnitt 2 i NY_STAD handlar om).
        if (j && j.error) return nej(new Error('ArcGIS: ' + (j.error.message || 'okant fel')));
        ok(j);
      });
    });
    r.on('error', nej);
    r.setTimeout(30000, () => r.destroy(new Error('timeout')));
    r.end();
  });
}

// Domanerna (kodlistorna) ligger i lagrets ?f=json, inte i svaren pa query.
async function domaner(lager) {
  const j = await hamta(`${BAS}/${lager}?f=json`);
  const ut = {};
  for (const f of j.fields || []) {
    if (f.domain && f.domain.codedValues) {
      ut[f.name] = {};
      for (const c of f.domain.codedValues) ut[f.name][String(c.code)] = c.name;
    }
  }
  return ut;
}

// Hur manga poster lagret SAGER att det har. Facit att jamfora hamtningen mot.
async function antal(lager) {
  const j = await hamta(`${BAS}/${lager}/query?where=1%3D1&returnCountOnly=true&f=json`);
  return j.count;
}
// Alla poster, sida for sida: tjansten ger hogst 1 000 per svar. Kontrollerar mot
// facit och KASTAR om det skiljer - ett underlag som tappar poster i tysthet ar
// varre an inget underlag, for sidan ser lika trovardig ut.
async function allaPoster(lager, falt) {
  const ut = [];
  for (let offset = 0; ; offset += 1000) {
    const q = `${BAS}/${lager}/query?where=1%3D1&outFields=${encodeURIComponent(falt)}`
            + `&returnGeometry=false&resultOffset=${offset}&resultRecordCount=1000&f=json`;
    const j = await hamta(q);
    const rad = (j.features || []).map(f => f.attributes);
    ut.push(...rad);
    if (rad.length < 1000) break;
  }
  const facit = await antal(lager);
  if (ut.length !== facit) throw new Error(`${lager}: hamtade ${ut.length} av ${facit} poster`);
  return ut;
}

const slugga = s => String(s).toLowerCase()
  .replace(/å|ä/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

(async () => {
  const stadsdelar = {};
  const granser = {};
  let platserTotalt = 0, strackorTotalt = 0;

  for (const [namn, lager] of Object.entries(LAGER)) {
    const dom = await domaner(lager);
    const falt = 'Stadsdel,AntalPlatser,Tidsbegransning,Omradeskod,Adress';
    let poster;
    try { poster = await allaPoster(lager, falt); }
    catch (e) {                                  // samnyttjad saknar Omradeskod i vissa lager
      poster = await allaPoster(lager, 'Stadsdel,AntalPlatser,Tidsbegransning,Adress');
    }
    for (const p of poster) {
      strackorTotalt++;
      const sd = (dom.Stadsdel && dom.Stadsdel[String(p.Stadsdel)]) || null;
      const grans = (dom.Tidsbegransning && dom.Tidsbegransning[String(p.Tidsbegransning)]) || null;
      const platser = Number.isFinite(+p.AntalPlatser) ? +p.AntalPlatser : 0;
      platserTotalt += platser;
      if (grans) granser[grans] = (granser[grans] || 0) + 1;
      if (!sd) continue;
      const s = stadsdelar[sd] || (stadsdelar[sd] = {
        namn: sd, slug: slugga(sd), stracker: 0, platser: 0,
        avgift: 0, avgiftsfri: 0, samnyttjad: 0, granser: {}
      });
      s.stracker++;
      s.platser += platser;
      s[namn]++;
      if (grans) s.granser[grans] = (s.granser[grans] || 0) + 1;
    }
  }

  // Omradena: koden pa skylten plus kommunens avgiftstext ORDAGRANT (den bar bade pris
  // och Max-P, och att skriva om den hade varit att tolka).
  const omrRad = await allaPoster(OMRADEN, 'Omradeskod,Omradesnamn,Avgiftstext,Restriktioner');
  const omrDom = await domaner(OMRADEN);
  // Namnet star som "Besöksparkering - Fyristorg | 18114" i lagret: rubrik, namn och koden
  // igen. Koden finns redan i egna faltet, sa den trimmas bort - men sorten (besok/boende/
  // rorelsehindrad) sparas, for den avgor vem omradet ar till for.
  const omrDel = namn => {
    const s = String(namn || '').trim();
    const m = /^(Besöksparkering|Boendeparkering|Rörelsehindrad|Tillståndsparkering|Område)\s*-\s*/i.exec(s);
    return {
      sort: m && !/^område$/i.test(m[1]) ? m[1] : null,
      namn: s.replace(/^[^-]*-\s*/, m ? '' : '$&').replace(/\s*\|\s*\d+\s*$/, '').trim() || null
    };
  };
  const omraden = omrRad.map(o => ({
    kod: (omrDom.Omradeskod && omrDom.Omradeskod[String(o.Omradeskod)]) || String(o.Omradeskod || ''),
    ...omrDel(o.Omradesnamn),
    avgiftstext: (o.Avgiftstext || '').trim() || null,
    restriktioner: (o.Restriktioner || '').trim() || null
  })).filter(o => o.avgiftstext);

  const garageRad = await allaPoster(GARAGE, 'Regler,AntAP,AntRH,AntLadd,MaxPTid,MaxFordonshojd');
  // Garagelagret bar INGET namn. Namnet star i omradeslagret, pa den forsta omradeskod
  // som regeltexten namner ("Område 18112: …" → "Besöksparkering - Kvarnengaraget").
  // Samma uppslag som cities/uppsala.js gor for kortet, sa sidan och appen sager samma sak.
  const garageNamn = regler => {
    for (const m of String(regler || '').matchAll(/Område\s+(\d+)/g)) {
      const o = omraden.find(x => x.kod === m[1]);
      // Omradesnamnet ar skrivet "Besöksparkering - Kvarnengaraget | 18112": bade en
      // rubrik och koden igen. Sidan vill ha bara namnet.
      if (o && o.namn) return o.namn
        .replace(/^(Besöksparkering|Rörelsehindrad|Boendeparkering)\s*-\s*/i, '')
        .replace(/\s*\|\s*\d+\s*$/, '').trim() || null;
    }
    return null;
  };
  // Ett av garagen (område 18512) saknas i omradeslagret och far darfor inget namn har.
  // Appen visar «Brandmastaren», hamtat ur kommunens webbadress for garaget (se
  // cities/uppsala.js). Samma namn anvands pa sidan, men med kallan angiven i texten -
  // vi hittar inte pa namn, och vi later inte heller en tom rad sta kvar.
  const RESERVNAMN = { '18512': 'Brandmästaren' };
  const garage = garageRad.map(g => ({
    namn: garageNamn(g.Regler)
       || RESERVNAMN[(String(g.Regler || '').match(/Område\s+(\d+)/) || [])[1]] || null,
    namnKalla: garageNamn(g.Regler) ? 'omradeslagret' : 'kommunens webbadress',
    regler: (g.Regler || '').trim() || null,
    platser: (g.AntAP || '').trim() || null,
    rh: (g.AntRH || '').trim() || null,
    ladd: (g.AntLadd || '').trim() || null,
    maxtid: (g.MaxPTid || '').trim() || null,
    hojd: (g.MaxFordonshojd || '').trim() || null
  }));

  const lista = Object.values(stadsdelar)
    .map(s => {
      const topp = Object.entries(s.granser).sort((a, b) => b[1] - a[1])[0];
      return { ...s, vanligasteGrans: topp ? topp[0] : null, medGrans: Object.values(s.granser).reduce((a, v) => a + v, 0) };
    })
    .sort((a, b) => b.stracker - a.stracker);

  const ut = {
    matt: new Date().toISOString().slice(0, 10),
    strackorTotalt, platserTotalt,
    granser: Object.entries(granser).sort((a, b) => b[1] - a[1]).map(([namn, antal]) => ({ namn, antal })),
    stadsdelar: lista.filter(s => s.stracker >= MIN_STRACKOR),
    stadsdelarUtanSida: lista.filter(s => s.stracker < MIN_STRACKOR).length,
    omraden, garage
  };
  fs.writeFileSync(path.join(__dirname, '..', 'seo', 'uppsala.json'), JSON.stringify(ut, null, 1));
  console.log(`[uppsala-seo] ${strackorTotalt} strackor, ${platserTotalt} platser, `
            + `${ut.stadsdelar.length} stadsdelar med egen sida (+${ut.stadsdelarUtanSida} for sma), `
            + `${omraden.length} omraden med avgiftstext, ${garage.length} garage`);
})().catch(e => { console.error('[uppsala-seo] MISSLYCKADES:', e.message); process.exit(1); });
