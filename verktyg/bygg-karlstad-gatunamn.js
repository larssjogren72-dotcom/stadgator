'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// BYGGER GATUNAMNSTABELLEN FÖR KARLSTAD
// ─────────────────────────────────────────────────────────────────────────────
// VARFÖR: Karlstad publicerar INGET gatunamn – varken på parkeringssträckorna
// (`vy_parkab_parkeringsplatser_avgiftsbelagda`) eller på städsträckorna
// (`vy_tg_tg_staddagar_parkeringsforbud`). Kontraktet i NY_STAD.md kräver
// `STREET_NAME`: det är platskortets rubrik OCH nyckeln som binder ihop en
// parkeringssträcka med sitt städschema.
//
// METODEN: närmaste adresspunkt ur kommunens eget adresslager
// (`vy_lm_fa_adresser`, 29 105 punkter), med majoritetsröstning längs sträckan.
// Samma metod som Malmö använder mot sitt vägnät.
//
// ⚠ VARFÖR EN TABELL, INTE EN UPPSLAGNING I DRIFT:
//   1. Adresslagret är 10 MB. Att hålla det i minnet på varje instans, eller hämta
//      om det var sjätte timme, kostar mer än hela resten av staden tillsammans.
//   2. Ett namn som härleds i farten går inte att granska. Tabellen går att läsa,
//      och den är verifierad mot kommunens egen publicerade gatulista (se nedan).
//   3. Regeln i NY_STAD.md avsnitt 5: tolka fritext/geometri EN gång, utanför
//      appen, och slå upp på exakt nyckel i drift. En okänd nyckel ger inget namn
//      – aldrig ett gissat.
//
// NYCKELN ÄR GEOMETRI, INTE ID. Sträckornas `id`/`itsid` är kommunens interna
// radnummer och kan skrivas om vid nästa uppdatering utan att någon märker det.
// Mittpunkten (avrundad till hel meter i EPSG:3011) flyttar sig däremot bara om
// linjen faktiskt flyttas – och då SKA namnet falla bort.
//
// VERIFIERING: kommunen publicerar själv vilka gator som har servicedag, per
// veckodag och klockslag, på
// karlstad.se/trafik-och-gator/renhallning-och-snorojning/sopning-av-gator-och-vagar/schema-for-servicedagar
// Listan ligger i verktyg/karlstad-servicedagar-facit.json och skriptet jämför
// varje härlett namn mot den. Det är ett riktigt facit utifrån – inte datan som
// bedömer sig själv.
//
// KÖR:  node verktyg/bygg-karlstad-gatunamn.js
//       node verktyg/bygg-karlstad-gatunamn.js --kontroll   (bygger inte, bara jämför)

const https = require('https');
const fs = require('fs');
const path = require('path');

const HOST = 'gi.karlstad.se';
const SRS = 'EPSG:3011';                 // meter – samma system som adaptern levererar
const UT = path.join(__dirname, '..', 'cities', 'karlstad-gatunamn.json');
const FACIT = path.join(__dirname, 'karlstad-servicedagar-facit.json');

const LAGER_PARK = 'webbkartan:vy_parkab_parkeringsplatser_avgiftsbelagda';
const LAGER_STAD = 'webbkartan:vy_tg_tg_staddagar_parkeringsforbud';
const LAGER_ADR  = 'webbkartan:vy_lm_fa_adresser';

// Hur långt bort en adresspunkt får ligga för att räknas som «den här gatan».
// 45 m valt efter mätning: medianavståndet är 17 m, och över 60 m börjar
// tvärgatornas punkter vinna omröstningen i korsningar.
const MAX_AVSTAND = 45;
// Hur många provpunkter per sträcka. Fler punkter = stabilare majoritet.
const PROV_STEG = 10;                    // meter mellan provpunkter
const PROV_MAX = 40;

function hamta(vag) {
  return new Promise((ok, nej) => {
    const r = https.get({ hostname: HOST, path: vag, headers: { 'User-Agent': 'ParkSpot/karlstad-gatunamn' } }, resp => {
      if (resp.statusCode !== 200) { resp.resume(); return nej(new Error('HTTP ' + resp.statusCode + ' för ' + vag)); }
      let b = '';
      resp.setEncoding('utf8');
      resp.on('data', d => b += d);
      resp.on('end', () => ok(b));
    });
    r.on('error', nej);
    r.setTimeout(120000, () => r.destroy(new Error('timeout')));
  });
}

// Hämtar ett lager som GeoJSON och KONTROLLERAR antalet mot serverns egen räkning.
// Lärdomen från Uppsala: ett svar som tappat en tredjedel ser likadant ut som ett helt.
async function lager(namn) {
  const bas = `/geoserver/ows?service=WFS&version=1.1.0&typeName=${encodeURIComponent(namn)}`;
  const hits = await hamta(`${bas}&request=GetFeature&resultType=hits`);
  const vantat = +((/numberOfFeatures="(\d+)"/.exec(hits) || [])[1] || -1);
  const s = await hamta(`${bas}&request=GetFeature&outputFormat=application/json&srsName=${SRS}&maxFeatures=100000`);
  let j;
  try { j = JSON.parse(s); } catch (e) { throw new Error(namn + ': svaret var inte JSON (' + s.slice(0, 120) + ')'); }
  const f = j.features || [];
  if (vantat >= 0 && f.length !== vantat) {
    throw new Error(`${namn}: fick ${f.length} poster men servern säger ${vantat}. Avbryter hellre än bygger på en halv tabell.`);
  }
  console.log(`  ${namn}: ${f.length} poster (serverns egen räkning: ${vantat})`);
  return f;
}

// ── Gatunamn ur en adressträng ───────────────────────────────────────────────
// "DROTTNINGGATAN 24"        → "DROTTNINGGATAN"
// "DROTTNING KRISTINAS VÄG 5"→ "DROTTNING KRISTINAS VÄG"
// "Guldlistgatan"            → "Guldlistgatan"   (redan bara namnet)
function utanNummer(s) {
  return String(s || '')
    .replace(/\s+\d+\s*[A-Za-zÅÄÖåäö]?(\s*[-–]\s*\d+\s*[A-Za-zÅÄÖåäö]?)?\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Kommunens egen stavning vinner. Adresslagret bär SAMMA gata både som VERSALER
// ("DROTTNINGGATAN 24") och som skriven text ("Östra stationsgatan"); den skrivna
// formen är kommunens, den versala är registrets. Vi bygger därför en ordlista av de
// skrivna formerna och slår upp versalerna i den.
function byggStavning(adresser) {
  const ordlista = new Map();          // gemener → kommunens stavning
  for (const a of adresser) {
    const namn = utanNummer(a.namn);
    if (!namn || namn === namn.toUpperCase()) continue;   // versalform: inte kommunens skrivsätt
    const k = namn.toLowerCase();
    if (!ordlista.has(k)) ordlista.set(k, namn);
  }
  return ordlista;
}
// Reserv när ordlistan inte känner gatan: skriv om VERSALER till svensk skrivform.
// "DROTTNING KRISTINAS VÄG" → "Drottning Kristinas väg"
const SMA_ORD = new Set(['väg', 'vägen', 'gata', 'gatan', 'plan', 'torg', 'gränd', 'allé', 'allén',
                         'stig', 'stigen', 'backe', 'backen', 'park', 'parken', 'led', 'leden',
                         'kaj', 'kajen', 'bro', 'bron', 'gång', 'gången', 'slinga', 'slingan']);
function skrivOm(namn) {
  const ord = namn.toLowerCase().split(/\s+/);
  return ord.map((o, i) => (i > 0 && SMA_ORD.has(o)) ? o : o.charAt(0).toUpperCase() + o.slice(1)).join(' ');
}

// ── Rutnätsindex över adresspunkterna ────────────────────────────────────────
const RUTA = 100;                                   // meter
function byggIndex(punkter) {
  const g = new Map();
  for (const p of punkter) {
    const k = Math.floor(p.x / RUTA) + ':' + Math.floor(p.y / RUTA);
    let lista = g.get(k);
    if (!lista) g.set(k, lista = []);
    lista.push(p);
  }
  return g;
}
// Alla adresspunkter inom MAX_AVSTAND, som {gata: minsta avstand}.
// Vi tittar alltsa inte bara pa narmaste hus, utan pa VARJE gata som har hus i
// narheten av provpunkten.
function narheten(index, x, y) {
  const gx = Math.floor(x / RUTA), gy = Math.floor(y / RUTA);
  const steg = Math.ceil(MAX_AVSTAND / RUTA);
  const ut = new Map();
  for (let dx = -steg; dx <= steg; dx++) {
    for (let dy = -steg; dy <= steg; dy++) {
      for (const p of index.get((gx + dx) + ':' + (gy + dy)) || []) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d > MAX_AVSTAND) continue;
        const f = ut.get(p.gata);
        if (f == null || d < f) ut.set(p.gata, d);
      }
    }
  }
  return ut;
}

// ── Provpunkter längs en linje ───────────────────────────────────────────────
function provpunkter(koord) {
  const ut = [];
  let kvar = 0;
  for (let i = 0; i < koord.length - 1; i++) {
    const [x1, y1] = koord[i], [x2, y2] = koord[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (!len) continue;
    for (let d = kvar; d < len; d += PROV_STEG) {
      ut.push([x1 + (x2 - x1) * d / len, y1 + (y2 - y1) * d / len]);
      if (ut.length >= PROV_MAX) return ut;
    }
    kvar = (PROV_STEG - ((len - kvar) % PROV_STEG)) % PROV_STEG;
  }
  const sista = koord[koord.length - 1];
  if (sista && ut.length < PROV_MAX) ut.push([sista[0], sista[1]]);
  return ut.length ? ut : (koord[0] ? [[koord[0][0], koord[0][1]]] : []);
}

const linjerUr = g => {
  if (!g) return [];
  if (g.type === 'LineString') return g.coordinates.length >= 2 ? [g.coordinates] : [];
  if (g.type === 'MultiLineString') return g.coordinates.filter(l => l.length >= 2);
  return [];
};
// Nyckeln: mittpunkten av HELA sträckan, avrundad till hel meter.
function nyckel(linjer) {
  let sx = 0, sy = 0, n = 0;
  for (const l of linjer) for (const c of l) { sx += c[0]; sy += c[1]; n++; }
  if (!n) return null;
  return Math.round(sx / n) + ',' + Math.round(sy / n);
}

// VILKEN GATA FOLJER HELA STRACKAN?
//
// Forsta forsoket rostade pa narmaste adress per provpunkt. Det gav fel namn i
// korsningar: hornhusen ar adresserade pa tvargatan, och en kort strackas prov
// ligger mest i hornet. Kvarnbergsgatan blev "Kaserngatan" av precis det skalet,
// och att vikta rosterna med avstandet gjorde det varre - den narmaste adressen
// ar fortfarande tvargatans.
//
// Metoden som halls: for VARJE gata med hus i narheten mats medelavstandet fran
// strackans alla provpunkter till den gatans narmaste hus. En tvargata ar nara i
// ena anden och langt bort i resten, sa dess medel blir hogt. Den gata strackan
// faktiskt ligger pa har hus langs hela sin langd och vinner.
// Saknas gatan helt vid en provpunkt raknas MAX_AVSTAND som straff.
function namnFor(linjer, index, ordlista, tillatna) {
  const prov = [];
  for (const l of linjer) for (const pt of provpunkter(l)) prov.push(pt);
  if (!prov.length) return null;

  const summa = new Map();          // gata -> summerat avstand
  const traffar = new Map();        // gata -> antal provpunkter dar den fanns
  let bastAvstand = Infinity;
  for (const [x, y] of prov) {
    const nara = narheten(index, x, y);
    for (const [gata, d] of nara) {
      summa.set(gata, (summa.get(gata) || 0) + d);
      traffar.set(gata, (traffar.get(gata) || 0) + 1);
      if (d < bastAvstand) bastAvstand = d;
    }
  }
  if (!summa.size) return null;

  // ── KOMMUNENS EGEN LISTA STÅR ÖVER MIN MÄTNING ────────────────────────────
  // För en städsträcka VET vi vilka gator som har just den veckodagen, veckan och
  // klockslaget – kommunen publicerar det. `tillatna` är den gruppens gator.
  // Ligger någon av dem längs sträckan vinner den, även om en tvärgata mätte
  // närmare. Mätt effekt: Hagagatan blev «Nygatan» och Sandbäcksgatan blev
  // «Kaserngatan», och eftersom städvarningen kopplas på gatunamn TAPPADE de två
  // gatorna sin varning helt. Listan är utifrån; min mätning är inifrån.
  const kandidater = [...summa.keys()].filter(g => !tillatna || tillatna.has(g.toLowerCase()));
  const urval = kandidater.length ? kandidater : [...summa.keys()];

  let vinnare = null, bast = Infinity, tvaa = Infinity;
  for (const gata of urval) {
    const s = summa.get(gata);
    const saknas = prov.length - traffar.get(gata);
    const medel = (s + saknas * MAX_AVSTAND) / prov.length;
    if (medel < bast) { tvaa = bast; bast = medel; vinnare = gata; }
    else if (medel < tvaa) { tvaa = medel; }
  }
  const k = vinnare.toLowerCase();
  return {
    namn: ordlista.get(k) || skrivOm(vinnare),
    // Marginalen till tvaan, 0-1. Lag marginal = tva gator ligger lika nara hela
    // strackan, och da ar namnet en gissning som ska granskas.
    andel: tvaa === Infinity ? 1 : Math.max(0, (tvaa - bast) / MAX_AVSTAND),
    medel: Math.round(bast),
    narmast: Math.round(bastAvstand)
  };
}

(async () => {
  const baraKontroll = process.argv.includes('--kontroll');
  console.log('Hämtar lager …');
  const [adrF, parkF, stadF] = await Promise.all([lager(LAGER_ADR), lager(LAGER_PARK), lager(LAGER_STAD)]);

  const adresser = adrF
    .filter(f => f.geometry && f.geometry.type === 'Point')
    .map(f => ({ namn: String(f.properties.extid || ''), x: f.geometry.coordinates[0], y: f.geometry.coordinates[1] }))
    .filter(a => a.namn);
  const ordlista = byggStavning(adresser);
  const punkter = adresser.map(a => ({ x: a.x, y: a.y, gata: utanNummer(a.namn) })).filter(p => p.gata);
  const index = byggIndex(punkter);
  console.log(`  adresspunkter användbara: ${punkter.length} · kommunens egen stavning känd för ${ordlista.size} gator`);

  const tabell = {};
  const rapport = { park: { med: 0, utan: 0 }, stad: { med: 0, utan: 0 } };
  const stadNamn = [];                       // för facit-jämförelsen

  // ── Gruppens tillåtna gator ur kommunens lista ─────────────────────────────
  // En städsträcka bär veckodag, vecka och klockslag. Kommunen publicerar exakt
  // vilka gator som har just den kombinationen, så listan kan användas som filter –
  // se kommentaren i namnFor. Parkeringssträckor har ingen sådan lista och får
  // därför inget filter (undefined).
  const facitGrupper = (() => {
    const m = new Map();
    if (!fs.existsSync(FACIT)) return m;
    const f = JSON.parse(fs.readFileSync(FACIT, 'utf8'));
    const rensa = s => String(s).toLowerCase().split(',')[0]
      .replace(/^del av\s+/, '').replace(/\s+mellan\s+.*$/, '')
      .replace(/\s+(norra|södra|östra|västra|sydvästra|nordvästra|sydöstra|nordöstra)?\s*sidan?\s*.*$/, '')
      .replace(/s$/, '').replace(/\s+/g, ' ').trim();
    for (const rad of f.rader) {
      const nyckel = rad.veckodag.toLowerCase() + '|' + rad.vecka + '|' + rad.klockslag;
      // Adresslagrets gator står i VERSALER; jämförelsen sker i gemener på båda håll,
      // och genitiv-s har redan skalats bort ovan. Vi lägger in BÅDA formerna så att
      // «hagaborgsgatan» matchar både listans och registrets stavning.
      const set = m.get(nyckel) || new Set();
      for (const g of rad.gator) { const r = rensa(g); set.add(r); set.add(r + 's'); }
      m.set(nyckel, set);
    }
    return m;
  })();
  function gruppFor(p) {
    const dag = String(p.veckodag || '').toLowerCase().trim();
    const v = String(p.vecka || '').toLowerCase().trim();
    const vecka = v.startsWith('jämna') ? 'jämna' : (v.startsWith('ojämna') || v.startsWith('udda')) ? 'ojämna' : null;
    const kl = /(\d{1,2})\s*[-–]\s*(\d{1,2})/.exec(String(p.klockslag || '').replace(/kl\.?/i, ''));
    if (!dag || !vecka || !kl) return undefined;
    const tvaSiffror = n => String(+n).padStart(2, '0');
    return facitGrupper.get(dag + '|' + vecka + '|' + tvaSiffror(kl[1]) + '-' + tvaSiffror(kl[2]));
  }

  function kor(features, sort) {
    for (const f of features) {
      const ls = linjerUr(f.geometry);
      if (!ls.length) continue;
      const k = nyckel(ls);
      if (!k) continue;
      const t = namnFor(ls, index, ordlista, sort === 'stad' ? gruppFor(f.properties) : undefined);
      if (!t) { rapport[sort].utan++; continue; }
      rapport[sort].med++;
      tabell[k] = t.namn;
      if (sort === 'stad') stadNamn.push({ namn: t.namn, p: f.properties, andel: t.andel, medel: t.medel, narmast: t.narmast });
    }
  }
  kor(parkF, 'park');
  kor(stadF, 'stad');

  // ── SAMMA GATA MÅSTE HETA SAMMA SAK I BÅDA LAGREN ──────────────────────────
  // Städvarningen kopplas i appen på GATUNAMN + 25 m (nearCleaning i index.html).
  // Två oberoende härledningar på två lager ger då ett tyst fel: en parkeringsruta
  // som ligger EN METER från sin städlinje tappar hela varningen bara för att mina
  // två gissningar råkade landa olika. Uppmätt: 8 av 136 sträckor i centrum.
  //
  // Ligger linjerna praktiskt taget på varandra (≤3 m) ÄR de samma gata. Då vinner
  // städlinjens namn, av två skäl: det är verifierat mot kommunens publicerade lista
  // (97 %), och det är den sidan varningen hänger på. Skillnader på 14–24 m rörs
  // inte – där är det två riktiga gator som möts i ett hörn.
  // TÄCKNINGSGRAD, INTE EN SPETS – husregeln för all lageröverlappning i det här
  // projektet (se CLAUDE.md). Medelavståndet dög inte: en parkeringssträcka som är
  // längre än sin städlinje får högt medel fast den ligger på den. Nu räknas hur
  // STOR DEL av parkeringssträckan som följer städlinjen inom 5 m, och minst hälften
  // krävs. Ett hörn som nuddar med en punkt räcker alltså inte.
  const NARHET = 5, TACKNING = 0.5;
  let synkade = 0;
  const stadLinjer = [];
  for (const f of stadF) {
    const ls = linjerUr(f.geometry);
    const k = nyckel(ls);
    if (!ls.length || !k || !tabell[k]) continue;
    for (const l of ls) stadLinjer.push({ l, namn: tabell[k] });
  }
  const punktTillLinje = (x, y, linje) => {
    let m = Infinity;
    for (let i = 0; i < linje.length - 1; i++) {
      const [x1, y1] = linje[i], [x2, y2] = linje[i + 1];
      const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
      let t = l2 ? ((x - x1) * dx + (y - y1) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      m = Math.min(m, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
    }
    return m;
  };
  for (const f of parkF) {
    const ls = linjerUr(f.geometry);
    const k = nyckel(ls);
    if (!ls.length || !k) continue;
    let bast = null, bastTack = TACKNING;
    for (const s of stadLinjer) {
      let inom = 0, n = 0;
      for (const l of ls) for (const c of l) { if (punktTillLinje(c[0], c[1], s.l) <= NARHET) inom++; n++; }
      const tack = n ? inom / n : 0;
      if (tack >= bastTack) { bastTack = tack; bast = s.namn; }
    }
    if (bast && tabell[k] !== bast) { tabell[k] = bast; synkade++; }
  }
  console.log(`\nSynkade namn (parkering ≤${NARHET} m från sin städlinje): ${synkade} sträckor fick städlinjens namn`);

  console.log(`\nParkeringssträckor: ${rapport.park.med} fick namn, ${rapport.park.utan} utan (ingen adress inom ${MAX_AVSTAND} m)`);
  console.log(`Städsträckor:       ${rapport.stad.med} fick namn, ${rapport.stad.utan} utan`);
  console.log(`Tabellen: ${Object.keys(tabell).length} nycklar`);

  // ── Verifiering mot kommunens egen lista ───────────────────────────────────
  if (fs.existsSync(FACIT)) {
    const facit = JSON.parse(fs.readFileSync(FACIT, 'utf8'));
    // Kommunens lista beskriver ofta en DEL av en gata: "Sveagatan mellan Herrhagsgatan
    // och John Ericssonsgatan", "Del av Regementsgatan", "Hagaborgsgatans sodra sida",
    // "Tingbergsgatan, ostra sidan mellan Hooksgatan och Styrmansgatan". Datan bar bara
    // gatan. Jamforelsen skalar darfor bort avgransningen - annars ser en korrekt
    // harledning ut som ett fel.
    const norm = s => String(s)
      .toLowerCase()
      .split(',')[0]
      .replace(/^del av\s+/, '')
      .replace(/\s+mellan\s+.*$/, '')
      .replace(/\s+(norra|södra|östra|västra|sydvästra|nordvästra|sydöstra|nordöstra)?\s*sidan?\s*.*$/, '')
      .replace(/s$/, '')                       // genitiv: "Hagaborgsgatans" -> "Hagaborgsgatan"
      .replace(/\s+/g, ' ')
      .trim();
    const harletts = new Set(stadNamn.map(s => norm(s.namn)));
    const listade = new Set();
    for (const rad of facit.rader) for (const g of rad.gator) listade.add(norm(g.split(',')[0]));
    const saknas = [...listade].filter(g => !harletts.has(g));
    const extra = [...harletts].filter(g => !listade.has(g));
    const tack = listade.size - saknas.length;
    console.log(`\n── KONTROLL MOT KOMMUNENS PUBLICERADE LISTA (${facit.hamtad}) ──`);
    console.log(`  Gator i listan: ${listade.size} · härledda ur datan: ${harletts.size}`);
    console.log(`  Träffade: ${tack} av ${listade.size} (${Math.round(tack / listade.size * 100)} %)`);
    if (saknas.length) console.log('  I LISTAN MEN INTE HÄRLEDDA: ' + saknas.join(', '));
    if (extra.length) console.log('  HÄRLEDDA MEN INTE I LISTAN: ' + extra.join(', '));
    // Svaga namn: majoriteten var knapp eller närmaste adress långt bort.
    const svaga = stadNamn.filter(s => s.andel < 0.08 || s.medel > 30);
    if (svaga.length) {
      console.log(`  Svaga härledningar (liten marginal till tvåan eller medelavstånd >30 m): ${svaga.length}`);
      svaga.slice(0, 12).forEach(s => console.log(`    ${s.namn} · marginal ${s.andel.toFixed(2)} · medel ${s.medel} m`));
    }
  } else {
    console.log('\n(Inget facit hittat – lägg listan i ' + path.basename(FACIT) + ' för att kunna kontrollera.)');
  }

  if (baraKontroll) { console.log('\n--kontroll: inget skrivet.'); return; }
  const ut = {
    _kommentar: 'Gatunamn härledda ur Karlstads adresslager. Byggd av verktyg/bygg-karlstad-gatunamn.js. '
              + 'Nyckeln är sträckans mittpunkt i EPSG:3011, avrundad till hel meter. Redigera inte för hand.',
    byggd: new Date().toISOString().slice(0, 10),
    kalla: LAGER_ADR,
    maxAvstandMeter: MAX_AVSTAND,
    namn: tabell
  };
  fs.writeFileSync(UT, JSON.stringify(ut, null, 0).replace(/","/g, '",\n"'), 'utf8');
  console.log('\nSkrev ' + UT);
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
