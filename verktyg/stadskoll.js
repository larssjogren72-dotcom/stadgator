#!/usr/bin/env node
/**
 * stadskoll.js — läser av vilken data en stad publicerar och matchar mot vad ParkSpot behöver.
 *
 * Syftet är att svara på EN fråga innan någon utvecklar något:
 *   "Vilka påståenden kan appen göra i den här staden, och vilka måste den tiga om?"
 *
 * Tre led per datatyp, inte ett (lärdomen från Sundbyberg 2026-08-24):
 *   1. FINNS fältet?              → går att svara på maskinellt, det är vad skriptet gör
 *   2. BETYDER det samma sak?     → kräver mänsklig kontroll, skriptet FLAGGAR var risken finns
 *   3. Vad säger appen om det saknas? → det farliga ledet, se KONTRAKT.faraVidFranvaro
 *
 * Led 3 är hela poängen. Saknad data ger inte en tom skärm — den ger ett självsäkert
 * felaktigt svar. Sundbyberg saknar maxtid helt, och appen svarar då "Trygg över natten"
 * på en ruta som sitter en meter från en 2-timmarsskylt.
 *
 * Kör:  node verktyg/stadskoll.js [stad]
 *       node verktyg/stadskoll.js            → alla konfigurerade städer
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// KONTRAKTET: vad appen PÅSTÅR, och vad varje påstående kräver.
// Organiserat efter påstående, inte efter datalager — användaren bryr sig om
// "får jag stå här?", inte om vilka lager kommunen råkar publicera.
// ─────────────────────────────────────────────────────────────────────────────
const KONTRAKT = [
  {
    pastaende: 'Får stå nu',
    kraver: ['tillaten', 'stad', 'forbud'],
    faraVidFranvaro: 'Utan förbudsdata kan appen visa grönt där parkering är förbjuden.',
  },
  {
    pastaende: 'Trygg över natten',
    kraver: ['tillaten', 'stad', 'forbud', 'maxtid'],
    faraVidFranvaro: 'KRITISK: utan maxtid blir en 2-timmarsruta grön "trygg över natten". '
                   + 'Går INTE att tiga sig ur — grönt är ett aktivt löfte. Stäng läget eller degradera till blått.',
  },
  { pastaende: 'Servas <dag> <tid>', kraver: ['stad'],
    faraVidFranvaro: 'Utan städdata vet appen inte när gatan sopas. Kan tigas.' },
  { pastaende: 'Pris / taxa',        kraver: ['taxa'],
    faraVidFranvaro: 'Kan tigas — prisrutan döljs (harTaxaZoner:false).' },
  { pastaende: 'MC-platser',         kraver: ['mc'],
    faraVidFranvaro: 'Kan tigas — MC-läget visar inga dedikerade platser.' },
  { pastaende: 'Cykelplatser',       kraver: ['cykel'],
    faraVidFranvaro: 'Kan tigas.' },
  { pastaende: 'RH-platser',         kraver: ['rh'],
    faraVidFranvaro: 'Kan tigas.' },
  { pastaende: 'Parkeringshus',      kraver: ['phus'],
    faraVidFranvaro: 'Kan tigas (harPhus:false).' },
];

// Vad varje datatyp heter på svenska kommun-språk. Matchas mot lagernamn.
// Sundbyberg lärde oss att aldrig lita på tjänstens NAMN — vi måste titta på lagren inuti.
const DATATYPER = {
  tillaten: { rubrik: 'Tillåten parkering', re: /p[- _]?tillaten|parkeringsplats|parkering(?!szon)|p-plats|parkeringsyta/i },
  stad:     { rubrik: 'Städ / servicedag',  re: /servicedag|st[aä]dgat|st[aä]dning|renh[aå]lln|sopning|datumparker|gaturenh/i },
  forbud:   { rubrik: 'Parkeringsförbud',   re: /f[oö]rbud|p[- _]?forbud|stannandef/i },
  maxtid:   { rubrik: 'Tidsbegränsning',    re: /tidsbegr[aä]ns|maxtid|max[- _]?tim|p[- _]?tid|tidsz/i },
  taxa:     { rubrik: 'Taxa / avgiftszon',  re: /taxa|avgiftszon|parkeringszon|p[- _]?zon|taxez/i },
  mc:       { rubrik: 'MC-platser',         re: /motorcykel|\bmc\b/i },
  cykel:    { rubrik: 'Cykelplatser',       re: /cykelparkering|cykelst[aä]ll|\bcykel\b/i },
  rh:       { rubrik: 'RH-platser',         re: /r[oö]relsehind|handikapp|\brh\b/i },
  phus:     { rubrik: 'Parkeringshus',      re: /parkeringshus|p[- _]?hus|garage/i },
};

// ─────────────────────────────────────────────────────────────────────────────
// STÄDERNA. Lägg till en ny stad här — inget annat behöver ändras.
// ─────────────────────────────────────────────────────────────────────────────
const STADER = {
  stockholm: {
    namn: 'Stockholm', kommunkod: '0180',
    prober: [{ typ: 'wfs', url: 'https://openparking.stockholm.se/LTF-Tolken/v1/', anm: 'kräver API-nyckel' }],
    anm: 'Referensstaden. Kontraktet är definierat efter den.',
  },
  sundbyberg: {
    namn: 'Sundbyberg', kommunkod: '0183',
    prober: [
      { typ: 'arcgis', url: 'https://gis.sundbyberg.se/arcgis/rest/services' },
    ],
  },
  solna: {
    namn: 'Solna', kommunkod: '0184',
    prober: [
      { typ: 'arcgis', url: 'https://gis.solna.se/arcgis/rest/services' },
      { typ: 'wfs',    url: 'https://karta.solna.se/wfs' },
      { typ: 'sokigo', url: 'https://karta.solna.se' },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Hjälpare
// ─────────────────────────────────────────────────────────────────────────────
const FARG = { gron: '\x1b[32m', gul: '\x1b[33m', rod: '\x1b[31m', dim: '\x1b[2m', fet: '\x1b[1m', av: '\x1b[0m' };
const f = (farg, s) => FARG[farg] + s + FARG.av;

async function hamta(url, ms = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, redirect: 'follow' });
    return { status: r.status, txt: await r.text() };
  } catch (e) {
    return { status: 0, fel: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally { clearTimeout(t); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prober — en per servertyp. Alla returnerar { lager: [{namn, falt[], geom}], anm }
// ─────────────────────────────────────────────────────────────────────────────

// ArcGIS REST: tjänstkatalog → tjänster → lager → fält.
// OBS: gå ALLTID ner till lagren. Sundbyberg 2026-08-24: jag läste bara tjänsternas
// NAMN och drog slutsatsen "ingen städdata". Städdatan låg i lager 70/169 inuti en
// tjänst som hette något helt annat. Aldrig igen.
async function probeArcGIS(bas) {
  const rot = await hamta(`${bas}?f=json`);
  if (rot.status !== 200) return { fel: `HTTP ${rot.status || rot.fel}` };
  let katalog;
  try { katalog = JSON.parse(rot.txt); } catch { return { fel: 'ej JSON' }; }

  const tjanster = [];
  const mappar = katalog.folders || [];
  for (const t of katalog.services || []) tjanster.push(t);
  for (const m of mappar) {
    const r = await hamta(`${bas}/${m}?f=json`);
    if (r.status === 200) { try { (JSON.parse(r.txt).services || []).forEach(t => tjanster.push(t)); } catch {} }
  }

  const lager = [];
  for (const t of tjanster) {
    if (t.type !== 'MapServer' && t.type !== 'FeatureServer') continue;
    const r = await hamta(`${bas}/${t.name}/${t.type}?f=json`, 25000);
    if (r.status !== 200) continue;
    let tj; try { tj = JSON.parse(r.txt); } catch { continue; }
    for (const l of (tj.layers || []).concat(tj.tables || [])) {
      lager.push({ namn: l.name, id: l.id, tjanst: t.name, typ: t.type, geom: l.geometryType || null, falt: null });
    }
  }
  return { lager, anm: `${tjanster.length} tjänster, ${mappar.length} mappar` };
}

// WFS: GetCapabilities → FeatureTypes
async function probeWFS(bas) {
  const url = bas + (bas.includes('?') ? '&' : '?') + 'service=WFS&request=GetCapabilities';
  const r = await hamta(url, 25000);
  if (r.status !== 200) return { fel: `HTTP ${r.status || r.fel}` };
  if (!/WFS_Capabilities/i.test(r.txt)) return { fel: 'svarar, men inte med WFS-capabilities' };
  const lager = [...r.txt.matchAll(/<(?:wfs:)?FeatureType>[\s\S]*?<(?:wfs:)?Name>([^<]+)<[\s\S]*?<\/(?:wfs:)?FeatureType>/g)]
    .map(m => ({ namn: m[1], geom: null, falt: null }));
  return { lager, anm: `${lager.length} feature types` };
}

// Sokigo SpatialMap (Solna m.fl.): temakatalogen ligger bakom en session som bara
// deras egen klient kan skapa. Vi konstaterar det, vi kringgår det inte.
async function probeSokigo(bas) {
  const r = await hamta(`${bas}/rest/profile/csm_standard_profile/themes/active?publiconly=false`, 20000);
  if (r.status === 401 || r.status === 403) {
    return { fel: `HTTP ${r.status} – temakatalogen kräver en sessionstoken som portalens egen klient skapar. `
                + `Datan finns men är inte öppen. Detta är en LICENSFRÅGA att ta med kommunen, inte ett tekniskt hinder att kringgå.` };
  }
  if (r.status !== 200) return { fel: `HTTP ${r.status || r.fel}` };
  let data; try { data = JSON.parse(r.txt); } catch { return { fel: 'ej JSON' }; }
  const lager = [];
  const gaIn = (nod, stig) => {
    const s = stig.concat(nod.displayname || nod.name || '?');
    if (nod.type === 'Theme') lager.push({ namn: nod.displayname || nod.name, stig: s.slice(0, -1).join(' > '),
                                           geom: nod.primarygeometrytype || null, falt: null });
    (nod.elements || []).forEach(e => gaIn(e, s));
  };
  gaIn(data, []);
  return { lager, anm: `${lager.length} teman` };
}

const PROBER = { arcgis: probeArcGIS, wfs: probeWFS, sokigo: probeSokigo };

// ─────────────────────────────────────────────────────────────────────────────
// Analys
// ─────────────────────────────────────────────────────────────────────────────
function matcha(lager) {
  const funna = {};
  for (const [nyckel, def] of Object.entries(DATATYPER)) {
    funna[nyckel] = lager.filter(l => def.re.test(l.namn || ''));
  }
  return funna;
}

function skrivMatris(stad, funna, lagerTotalt) {
  console.log('\n' + f('fet', '  PÅSTÅENDE-MATRIS') + f('dim', '   (vad appen kan säga i ' + stad.namn + ')'));
  console.log('  ' + '─'.repeat(76));
  let blockerare = 0;
  for (const rad of KONTRAKT) {
    const saknas = rad.kraver.filter(k => !funna[k] || funna[k].length === 0);
    const status = saknas.length === 0 ? f('gron', '● KAN SÄGAS')
                 : saknas.length < rad.kraver.length ? f('gul', '● DELVIS   ')
                 : f('rod', '● MÅSTE TIGA');
    console.log('  ' + status + '  ' + rad.pastaende.padEnd(24)
      + f('dim', saknas.length ? 'saknar: ' + saknas.map(s => DATATYPER[s].rubrik).join(', ') : 'allt finns'));
    if (saknas.length) {
      const kritisk = /KRITISK/.test(rad.faraVidFranvaro);
      if (kritisk) blockerare++;
      console.log('           ' + f(kritisk ? 'rod' : 'dim', rad.faraVidFranvaro));
    }
  }
  console.log('  ' + '─'.repeat(76));
  console.log('\n' + f('fet', '  DATATYPER') + f('dim', `   (${lagerTotalt} lager avlästa)`));
  for (const [nyckel, def] of Object.entries(DATATYPER)) {
    const tr = funna[nyckel] || [];
    const märke = tr.length ? f('gron', '✓') : f('rod', '✗');
    console.log(`    ${märke} ${def.rubrik.padEnd(22)} ${tr.length ? tr.length + ' lager' : '—'}`);
    tr.slice(0, 4).forEach(l => console.log(f('dim', `        ${l.namn}${l.geom ? '  [' + l.geom + ']' : ''}${l.tjanst ? '  (' + l.tjanst + ')' : ''}`)));
    if (tr.length > 4) console.log(f('dim', `        … och ${tr.length - 4} till`));
  }
  return blockerare;
}

// ─────────────────────────────────────────────────────────────────────────────
async function kollaStad(nyckel) {
  const stad = STADER[nyckel];
  console.log('\n' + '═'.repeat(80));
  console.log(f('fet', ` ${stad.namn.toUpperCase()}`) + f('dim', `   kommunkod ${stad.kommunkod}`));
  if (stad.anm) console.log(f('dim', ` ${stad.anm}`));
  console.log('═'.repeat(80));

  let allaLager = [];
  for (const p of stad.prober) {
    process.stdout.write(f('dim', `  prob ${p.typ.padEnd(7)} ${p.url} … `));
    if (p.anm) { console.log(f('dim', 'hoppas över (' + p.anm + ')')); continue; }
    const res = await PROBER[p.typ](p.url);
    if (res.fel) { console.log(f('rod', res.fel)); continue; }
    console.log(f('gron', `OK – ${res.anm}`));
    allaLager = allaLager.concat(res.lager || []);
  }

  if (!allaLager.length) {
    console.log('\n  ' + f('rod', 'Inga lager kunde läsas av.') +
      f('dim', ' Det betyder INTE att data saknas — bara att ingen öppen väg hittades.'));
    return { stad: stad.namn, lager: 0, blockerare: null };
  }
  const funna = matcha(allaLager);
  const blockerare = skrivMatris(stad, funna, allaLager.length);
  return { stad: stad.namn, lager: allaLager.length, blockerare };
}

(async () => {
  const arg = (process.argv[2] || '').toLowerCase();
  const koll = arg && STADER[arg] ? [arg] : Object.keys(STADER);
  if (arg && !STADER[arg]) { console.log('Okänd stad. Välj: ' + Object.keys(STADER).join(', ')); process.exit(1); }

  const resultat = [];
  for (const k of koll) resultat.push(await kollaStad(k));

  console.log('\n' + '═'.repeat(80));
  console.log(f('fet', ' SAMMANFATTNING'));
  console.log('═'.repeat(80));
  for (const r of resultat) {
    const dom = r.blockerare === null ? f('rod', 'ingen öppen data hittad')
              : r.blockerare > 0 ? f('rod', `${r.blockerare} blockerare — får INTE gå live som den är`)
              : f('gron', 'inga blockerare');
    console.log(`  ${r.stad.padEnd(14)} ${String(r.lager).padStart(4)} lager   ${dom}`);
  }
  console.log('');
  console.log(f('dim', '  Led 1 (finns fältet) är besvarat maskinellt ovan.'));
  console.log(f('dim', '  Led 2 (betyder det samma sak) kräver ögon: enheter, skalor, koordinatsystem, kodlistor.'));
  console.log(f('dim', '  Led 3 (vad säger appen om det saknas) är rödmarkerat där det är farligt.'));
  console.log('');
})();
