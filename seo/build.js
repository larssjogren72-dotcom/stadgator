#!/usr/bin/env node
/* ParkSpot – programmatisk SEO-generator.
 * Genererar statiska, datadrivna sidor i seo/site/ + seo/pages.json (för sitemap).
 * Rör INTE appen (index.html). Kör: node seo/build.js
 */
const fs = require('fs');
const path = require('path');

const SITE = 'https://parkspot.se';
const OUT  = path.join(__dirname, 'site');
const TODAY = new Date().toISOString().slice(0, 10);

// ── Röst & återkommande copy ─────────────────────────────────────────────────
const TAGLINE = 'Sluta cirkla. Vet var du får stå — innan du kör.';
const PROMISE = 'ParkSpot visar lagliga gatuplatser, billigast taxa och vilka gator som städas imorgon. Kör lugnt, slipp böter.';
const DISCLAIMER = 'Informationen bygger på Stockholms stads öppna data och kan vara inaktuell. Kontrollera alltid lokala skyltar. ParkSpot ansvarar inte för p-böter eller bogsering.';

// ── Taxa-referens (Stockholms stads besöksparkering, kr/tim) ─────────────────
const TAXA = {
  1: { pris: 55, txt: '55 kr/tim alla dagar 00–24 (avgift dygnet runt)' },
  2: { pris: 31, txt: '31 kr/tim vardag 7–21, lör & helg 9–19, 20 kr/tim övrig tid (avgift dygnet runt)' },
  3: { pris: 20, txt: '20 kr/tim vardag 7–19, 15 kr/tim lör 11–17 (sön & natt fritt)' },
  4: { pris: 10, txt: '10 kr/tim vardag 7–19, 10 kr/tim lör 11–17 (sön & natt fritt)' },
  5: { pris: 5,  txt: '5 kr/tim vardag 7–19 (lör, sön & natt fritt; mc 2,50 kr/tim)' },
};
const SEASON = '1 november–15 maj';

// ── Stadsdelar (kurerat: zon, läge, säsong, distrikt-matchning för live-widget) ──
const DISTRICTS = [
  { slug:'sodermalm', name:'Södermalm', lat:59.3145, lng:18.0732, area:'inner', taxa:[2,3], match:['Södermalm','Reimersholme'], seasonal:false },
  { slug:'ostermalm', name:'Östermalm', lat:59.3370, lng:18.0865, area:'inner', taxa:[1,2], match:['Östermalm'], seasonal:false },
  { slug:'vasastan', name:'Vasastan', lat:59.3430, lng:18.0490, area:'inner', taxa:[2,3], match:['Vasastaden'], seasonal:false },
  { slug:'kungsholmen', name:'Kungsholmen', lat:59.3300, lng:18.0300, area:'inner', taxa:[2,3], match:['Kungsholmen','Stadshagen','Marieberg','Kristineberg','Fredhäll'], seasonal:false },
  { slug:'norrmalm', name:'Norrmalm & City', lat:59.3340, lng:18.0600, area:'inner', taxa:[1,2], match:['Norrmalm'], seasonal:false },
  { slug:'gamla-stan', name:'Gamla Stan', lat:59.3250, lng:18.0710, area:'inner', taxa:[1,2], match:['Gamla Stan'], seasonal:false },
  { slug:'gardet', name:'Gärdet', lat:59.3470, lng:18.1010, area:'inner', taxa:[2], match:['Ladugårdsgärdet','Norra Djurgården'], seasonal:false },
  { slug:'liljeholmen', name:'Liljeholmen', lat:59.3100, lng:18.0230, area:'outer', taxa:[3,4], match:['Liljeholmen'], seasonal:true },
  { slug:'hammarby-sjostad', name:'Hammarby Sjöstad', lat:59.3030, lng:18.0950, area:'outer', taxa:[3,4], match:['Södra Hammarbyhamnen'], seasonal:true },
  { slug:'hagersten', name:'Hägersten', lat:59.2980, lng:17.9970, area:'outer', taxa:[4,5], match:['Hägersten','Hägerstensåsen'], seasonal:true },
  { slug:'aspudden', name:'Aspudden', lat:59.3050, lng:17.9930, area:'outer', taxa:[4,5], match:['Aspudden'], seasonal:true },
  { slug:'midsommarkransen', name:'Midsommarkransen', lat:59.3010, lng:18.0140, area:'outer', taxa:[4,5], match:['Midsommarkransen'], seasonal:true },
  { slug:'bromma', name:'Bromma', lat:59.3330, lng:17.9810, area:'outer', taxa:[4,5], match:['Alvik','Stora Mossen','Abrahamsberg','Ulvsunda','Äppelviken','Ålsten'], seasonal:true },
  { slug:'traneberg', name:'Traneberg', lat:59.3360, lng:17.9870, area:'outer', taxa:[4,5], match:['Traneberg'], seasonal:true },
  { slug:'kista', name:'Kista', lat:59.4030, lng:17.9430, area:'outer', taxa:[5], match:['Kista'], seasonal:true },
  { slug:'arsta', name:'Årsta', lat:59.2980, lng:18.0430, area:'outer', taxa:[4,5], match:['Årsta'], seasonal:true },
];

// ── Destinationer (sommar-/besöksintention) ──────────────────────────────────
const DESTINATIONS = [
  { slug:'grona-lund', name:'Gröna Lund', lat:59.3236, lng:18.0967, what:'nöjesparken Gröna Lund på Djurgården' },
  { slug:'skansen', name:'Skansen', lat:59.3265, lng:18.1045, what:'friluftsmuseet Skansen på Djurgården' },
  { slug:'djurgarden', name:'Djurgården', lat:59.3260, lng:18.1100, what:'museiön Djurgården' },
  { slug:'stromkajen', name:'Strömkajen', lat:59.3290, lng:18.0760, what:'skärgårdsbåtarnas avgångar vid Strömkajen' },
  { slug:'langholmen', name:'Långholmen', lat:59.3210, lng:18.0290, what:'badklipporna och parken på Långholmen' },
  { slug:'globen', name:'Avicii Arena (Globen)', lat:59.2935, lng:18.0830, what:'evenemang och konserter vid Avicii Arena' },
  { slug:'centralstationen', name:'Centralstationen', lat:59.3300, lng:18.0580, what:'Stockholms Centralstation' },
  { slug:'slussen', name:'Slussen', lat:59.3200, lng:18.0720, what:'Slussen mellan Södermalm och Gamla Stan' },
];

// ── Garage (cachad öppen data) ───────────────────────────────────────────────
let GARAGES = [];
try {
  GARAGES = JSON.parse(fs.readFileSync(path.join(__dirname, 'garages.json'), 'utf8'))
    .filter(a => /garage/i.test(a.Anlaggningstyp || '') && a.AntalBesokPlatser > 0 && a.AdressLatitud && a.AdressLongitud)
    .map(a => ({ name: a.Name, lat: a.AdressLatitud, lng: a.AdressLongitud, spaces: a.AntalBesokPlatser,
      taxa: (a.BesokstaxaCollection || []).map(t => t && t.Taxa).filter(x => x != null)[0] }));
  console.log(`[seo] ${GARAGES.length} publika besöksgarage laddade`);
} catch { console.warn('[seo] saknar garages.json – garage-sektioner utelämnas'); }

function dist(aLat, aLng, bLat, bLng) {
  const R = 6371000, toR = x => x * Math.PI / 180;
  const dLa = toR(bLat - aLat), dLo = toR(bLng - aLng);
  const h = Math.sin(dLa/2)**2 + Math.cos(toR(aLat))*Math.cos(toR(bLat))*Math.sin(dLo/2)**2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
const nearestGarages = (lat, lng, n = 4, radius = 2000) => GARAGES
  .map(g => ({ ...g, d: dist(lat, lng, g.lat, g.lng) }))
  .filter(g => g.d <= radius).sort((a, b) => a.d - b.d).slice(0, n);

const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const km = d => d < 1000 ? `${d} m` : `${(d/1000).toFixed(1)} km`;

// ── Engelsk copy (turistsida) ────────────────────────────────────────────────
const EN = {
  sub: 'street parking map',
  cta: '📍 Open the live map — see free spots →',
  tagline: 'Stop circling. Know where you can park — before you drive.',
  promise: 'ParkSpot shows legal on-street spots, the cheapest tariff and which streets are cleaned tomorrow. Drive calm, avoid fines.',
  disclaimer: 'Based on the City of Stockholm open data and may be out of date. Always check the local signs. ParkSpot is not liable for parking fines or towing.',
  relatedTitle: 'More about parking in Stockholm',
  faqTitle: 'Frequently asked questions',
};

// ── Delad layout ─────────────────────────────────────────────────────────────
function layout({ slug, title, desc, h1, lead, sections, faq, related, lat, lng, match, en = false }) {
  const faqLd = faq && faq.length ? {
    '@context':'https://schema.org','@type':'FAQPage',
    mainEntity: faq.map(f => ({ '@type':'Question', name:f.q, acceptedAnswer:{ '@type':'Answer', text:f.a.replace(/<[^>]+>/g,'') } }))
  } : null;
  const pageLd = { '@context':'https://schema.org','@type':'WebPage', name:title, url:`${SITE}/${slug}`,
    description:desc, inLanguage:'sv', isPartOf:{ '@type':'WebSite', name:'ParkSpot Stockholm', url:SITE } };
  const widget = (lat != null && match) ? cleaningWidget(lat, lng, match, en) : '';
  const faqHtml = faq && faq.length ? `<section class="card"><h2>${en ? EN.faqTitle : 'Vanliga frågor'}</h2>${faq.map(f =>
    `<h3>${esc(f.q)}</h3><p>${f.a}</p>`).join('')}</section>` : '';
  const relHtml = related && related.length ? `<section class="card related"><h2>${en ? EN.relatedTitle : 'Mer om parkering i Stockholm'}</h2><ul>${
    related.map(r => `<li><a href="/${r.href}">${esc(r.text)}</a></li>`).join('')}</ul></section>` : '';

  return `<!DOCTYPE html><html lang="${en ? 'en' : 'sv'}"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/${slug}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="article"><meta property="og:locale" content="sv_SE">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/${slug}"><meta property="og:image" content="${SITE}/og-image-v2.png">
<meta property="og:site_name" content="ParkSpot Stockholm">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%234ade80'/%3E%3Ctext x='16' y='23' text-anchor='middle' font-size='22' font-weight='bold' font-family='Arial' fill='%23080c1c'%3EP%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<script type="application/ld+json">${JSON.stringify(pageLd)}</script>
${faqLd ? `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>` : ''}
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',sans-serif;background:#080c1c;color:#e8eef6;line-height:1.65;-webkit-font-smoothing:antialiased}
  a{color:#7dd3fc;text-decoration:none}a:hover{text-decoration:underline}
  .wrap{max-width:760px;margin:0 auto;padding:0 18px}
  header.top{background:#0b1222;border-bottom:1px solid rgba(255,255,255,.08);padding:14px 0}
  .brand{display:flex;align-items:center;gap:10px}
  .logo{width:34px;height:34px;border-radius:9px;background:rgba(74,222,128,.16);border:1px solid rgba(74,222,128,.4);display:flex;align-items:center;justify-content:center;font-weight:800;color:#4ade80}
  .brand b{font-size:15px}.brand span{display:block;font-size:11px;color:#8aa0b8}
  .hero{padding:30px 0 8px}
  h1{font-size:27px;line-height:1.18;letter-spacing:-.02em;margin-bottom:10px;font-weight:800}
  .lead{font-size:16px;color:#b9c6d6;margin-bottom:18px}
  .cta{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#22c55e,#15803d);color:#fff;font-weight:700;padding:12px 20px;border-radius:12px;box-shadow:0 4px 18px rgba(34,197,94,.32);margin:6px 0 8px}
  .cta:hover{text-decoration:none;filter:brightness(1.05)}
  .card{background:#0d1426;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:18px 18px;margin:16px 0}
  h2{font-size:19px;margin-bottom:10px;letter-spacing:-.01em}
  h3{font-size:15px;margin:14px 0 4px;color:#cfe3ff}
  p{margin-bottom:10px;color:#c4d1e0}
  ul{margin:6px 0 6px 18px}li{margin:4px 0;color:#c4d1e0}
  table{width:100%;border-collapse:collapse;margin:8px 0;font-size:14px}
  th,td{text-align:left;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.07)}
  th{color:#8aa0b8;font-weight:600}
  .pill{display:inline-block;font-size:12px;padding:3px 9px;border-radius:20px;background:rgba(125,211,252,.12);border:1px solid rgba(125,211,252,.3);color:#bae6fd;margin:2px 4px 2px 0}
  .green{color:#86efac}.muted{color:#8aa0b8;font-size:13px}
  .live{min-height:24px}
  .live .row{display:flex;gap:8px;align-items:baseline;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)}
  .live .nm{font-weight:600;color:#fde68a}
  .related ul{list-style:none;margin-left:0}
  .related li{padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)}
  footer{border-top:1px solid rgba(255,255,255,.08);margin-top:24px;padding:22px 0 40px;color:#7e90a6;font-size:12px}
  footer a{color:#9fb3c8}
</style></head>
<body>
<header class="top"><div class="wrap"><a class="brand" href="/"><span class="logo">P</span><span><b>ParkSpot Stockholm</b><span>${en ? EN.sub : 'parkering på karta'}</span></span></a></div></header>
<main class="wrap">
  <div class="hero">
    <h1>${esc(h1)}</h1>
    <p class="lead">${lead}</p>
    <a class="cta" href="/">${en ? EN.cta : '📍 Öppna kartan – se lediga platser live →'}</a>
  </div>
  ${widget}
  ${sections}
  ${faqHtml}
  ${relHtml}
</main>
<footer><div class="wrap">
  <p><b style="color:#cfe3ff">${esc(en ? EN.tagline : TAGLINE)}</b><br>${esc(en ? EN.promise : PROMISE)}</p>
  <p style="margin-top:10px"><a href="/">${en ? 'Open the ParkSpot map' : 'Öppna ParkSpot-kartan'}</a> · <a href="/parkeringstaxor-stockholm">${en ? 'Tariffs 1–5' : 'Taxor 1–5'}</a> · <a href="/stadgator-stockholm">${en ? 'Street cleaning' : 'Städgator'}</a> · <a href="/parking-in-stockholm">English</a></p>
  <p style="margin-top:10px;color:#5f7088">${esc(en ? EN.disclaimer : DISCLAIMER)}</p>
</div></footer>
</body></html>`;
}

// Live-widget: städas imorgon i området (klientsida → alltid färsk, säsongssmart).
// Inga länkar inuti scriptet (statisk länk under) → ren escaping.
function cleaningWidget(lat, lng, match, en = false) {
  const matchJson = JSON.stringify(match.map(m => m.toLowerCase()));
  const T = en
    ? { h:'🧹 Street cleaning here tomorrow?', sub:'Live from City of Stockholm open data, season-aware (winter-only streets that are out of season are excluded).', loading:'Loading…',
        none:'No street cleaning here tomorrow', noneEnd:' — often free spots.', intro:'Tomorrow', introEnd:' these are cleaned, e.g.:', link:'See exact times and the full map →' }
    : { h:'🧹 Städas här imorgon?', sub:'Live ur Stockholms öppna data, säsongsjusterat (vintergator som är ur säsong räknas bort).', loading:'Hämtar…',
        none:'Inga städgator här imorgon', noneEnd:' — ofta lediga platser.', intro:'Imorgon', introEnd:' städas bl.a.:', link:'Se exakt tid och hela kartan →' };
  return `<section class="card">
  <h2>${T.h}</h2>
  <p class="muted">${T.sub}</p>
  <div class="live" id="live">${T.loading}</div>
  <p style="margin-top:8px"><a href="/">${T.link}</a></p>
  <script>(function(){
    var match=${matchJson};
    var API=["söndag","måndag","tisdag","onsdag","torsdag","fredag","lördag"];
    var d=new Date();d.setDate(d.getDate()+1);var day=API[d.getDay()];
    function active(p){if(p.START_MONTH==null)return true;var md=function(m,dd){return m*100+(dd||1)};var cur=md(d.getMonth()+1,d.getDate());var a=md(p.START_MONTH,p.START_DAY),b=md(p.END_MONTH,p.END_DAY);return a<=b?(cur>=a&&cur<=b):(cur>=a||cur<=b);}
    var el=document.getElementById("live");
    fetch("/proxy/servicedagar/weekday/"+encodeURIComponent(day)+"?outputFormat=json").then(function(r){return r.json();}).then(function(j){
      var f=Array.isArray(j)?j:(j.features||[]);
      var seen={},rows=[];
      f.forEach(function(x){var p=x.properties||{};var cd=(p.CITY_DISTRICT||"").toLowerCase();
        if(!match.some(function(m){return cd.indexOf(m)>=0})) return;
        if(!active(p)) return; var n=p.STREET_NAME; if(!n||seen[n])return; seen[n]=1; rows.push(n);});
      if(!rows.length){el.innerHTML='<p class="green">${T.none} ('+day+')${T.noneEnd}</p>';return;}
      el.innerHTML='<p class="muted">${T.intro} ('+day+')${T.introEnd}</p>'+rows.slice(0,8).map(function(n){return '<div class="row"><span class="nm">'+n+'</span></div>';}).join('');
    }).catch(function(){el.innerHTML='<p class="muted">—</p>';});
  })();</script>
</section>`;
}

// ── Sektions-byggare ─────────────────────────────────────────────────────────
function taxaTable(zones) {
  const rows = zones.map(z => `<tr><td>Taxa ${z}</td><td><b>${TAXA[z].pris} kr/tim</b></td><td class="muted">${TAXA[z].txt}</td></tr>`).join('');
  return `<table><tr><th>Zon</th><th>Pris</th><th>Gäller</th></tr>${rows}</table>`;
}
function garageSection(d, lat, lng) {
  const gs = nearestGarages(lat, lng);
  if (!gs.length) return '';
  return `<section class="card"><h2>🅿 Närmaste parkeringshus</h2>
  <p>Är gatorna fulla? Närmaste publika besöksgarage:</p>
  <table><tr><th>Garage</th><th>Platser</th><th>Avstånd</th></tr>${
    gs.map(g => `<tr><td>${esc(g.name)}</td><td>${g.spaces}</td><td class="muted">${km(g.d)}</td></tr>`).join('')}</table>
  <p class="muted">Antal = husets kapacitet (ej live-beläggning). Kontrollera på plats.</p></section>`;
}

// ── Sidtyper ─────────────────────────────────────────────────────────────────
const pages = [];
function emit(slug, html) {
  const file = path.join(OUT, slug + '.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  pages.push({ loc: `${SITE}/${slug}`, lastmod: TODAY });
}

function districtHub(d) {
  const cheapest = Math.max(...d.taxa), pris = TAXA[cheapest].pris;
  const seasonLine = d.seasonal
    ? `I ${d.name} städas många gator <b>bara vintertid (${SEASON})</b> — på sommaren är de inte städgator, vilket ofta ger fler lediga platser.`
    : `I ${d.name} städas gator året runt — kolla alltid vilken veckodag innan du parkerar över natten.`;
  const sections = `
  <section class="card"><h2>Vad kostar det att parkera i ${esc(d.name)}?</h2>
    <p>${esc(d.name)} ligger främst i ${d.taxa.map(z => `<span class="pill">Taxa ${z} · ${TAXA[z].pris} kr/tim</span>`).join('')}.
    Billigast hittar du för runt <b class="green">${pris} kr/tim</b>. Exakt pris styrs av skylten på gatan — appen visar zonen direkt på kartan.</p>
    ${taxaTable(d.taxa)}</section>
  <section class="card"><h2>Städgator i ${esc(d.name)}</h2><p>${seasonLine}</p>
    <p>Kvällsknepet: en gata som städas imorgon bitti är ofta ledig redan ikväll — de som nattparkerar undviker den.</p></section>
  <section class="card"><h2>Parkera över natten i ${esc(d.name)}</h2>
    <p>I läget <b>Över natten</b> visar ParkSpot gröna gator nära dig där det är lagligt att stå till morgonen efter — utan städgata eller förbud. Avgift kan ändå gälla; kontrollera skylten.</p></section>
  ${garageSection(d, d.lat, d.lng)}`;
  const faq = [
    { q:`Vad kostar parkering i ${d.name}?`, a:`Från cirka <b>${pris} kr/tim</b> (${d.taxa.map(z=>'Taxa '+z).join('/')}). Priset bestäms av skylten; ParkSpot visar zonen på kartan.` },
    { q:`Får man parkera över natten i ${d.name}?`, a:`Ja, på många gator. Använd läget "Över natten" för att se var det är lagligt till morgonen efter, utan städgata eller förbud.` },
    { q:`Hur vet jag om en gata i ${d.name} städas imorgon?`, a:`ParkSpot visar morgondagens städgator på kartan${d.seasonal ? ', och räknar bort vintergator som inte gäller på sommaren' : ''}.` },
    { q:`Är ParkSpot gratis?`, a:`Ja, gratis och utan inloggning. Det bygger på Stockholms stads öppna data.` },
  ];
  const related = [
    { href:`billigare-parkering/${d.slug}`, text:`Billigare parkering i ${d.name}` },
    { href:`parkering-over-natten/${d.slug}`, text:`Parkering över natten i ${d.name}` },
    { href:`stadgator/${d.slug}`, text:`Städgator i ${d.name}` },
    { href:`sommar-parkering-stockholm`, text:`Sommarparkering i Stockholm` },
    { href:`parkeringstaxor-stockholm`, text:`Stockholms parkeringstaxor (Taxa 1–5)` },
  ];
  emit(`parkering/${d.slug}`, layout({
    slug:`parkering/${d.slug}`, title:`Parkering i ${d.name} – pris, städgator & över natten | ParkSpot`,
    desc:`Var får du parkera i ${d.name}? Se pris (zon), städgator imorgon och var du står lagligt över natten. Kör lugnt, slipp böter.`,
    h1:`Parkering i ${d.name}`, lead:`${TAGLINE} Här hittar du pris, städgator och nattparkering i ${esc(d.name)} — och en live-karta som visar var du får stå just nu.`,
    sections, faq, related, lat:d.lat, lng:d.lng, match:d.match }));
}

function billigare(d) {
  const cheap = Math.max(...d.taxa), pris = TAXA[cheap].pris;
  const sections = `
  <section class="card"><h2>Så hittar du billigast parkering i ${esc(d.name)}</h2>
    <p>Priset styrs av <b>taxezonen</b>. I Stockholm går det från Taxa 1 (dyrast, 55 kr/tim i city) ner till Taxa 5 (5 kr/tim). ${esc(d.name)} ligger i ${d.taxa.map(z=>`<span class="pill">Taxa ${z} · ${TAXA[z].pris} kr/tim</span>`).join('')} — sikta på de lägre zonerna.</p>
    ${taxaTable(d.taxa)}
    <p>💡 Knep för billigare/avgiftsfritt: många gator är <b>avgiftsfria kvällar, nätter och söndagar</b> (utanför taxetiden). Obs: <b>lördag 11–17 har ofta avgift</b> i Taxa 1–4 (Taxa 5 är fritt). ParkSpot visar zonen och tiden så du inte betalar i onödan.</p></section>
  ${d.seasonal ? `<section class="card"><h2>På sommaren: ännu fler platser</h2><p>I ${esc(d.name)} städas många gator bara vintertid (${SEASON}). På sommaren är de inte städgator — fler lediga, lagliga platser.</p></section>` : ''}
  ${garageSection(d, d.lat, d.lng)}`;
  const faq = [
    { q:`Var är parkering billigast i ${d.name}?`, a:`På gator i de lägre taxezonerna — ner mot <b>${pris} kr/tim</b>. ParkSpot färgar zonerna på kartan så du ser de billigaste direkt.` },
    { q:`När är parkering avgiftsfri i ${d.name}?`, a:`Ofta kvällar, nätter och söndagar utanför taxetiden (t.ex. vardag efter 19). Obs: lördag 11–17 har avgift i de flesta zoner (utom Taxa 5). Kontrollera skylten; appen visar tiden.` },
    { q:`Är det gratis att parkera i ${d.name}?`, a:`Sällan helt gratis dagtid, men billigt i låga zoner och ofta avgiftsfritt nattetid och söndagar. ParkSpot hjälper dig hitta det billigaste lagliga alternativet.` },
  ];
  const related = [
    { href:`parkering/${d.slug}`, text:`Parkering i ${d.name} (översikt)` },
    { href:`parkering-over-natten/${d.slug}`, text:`Parkering över natten i ${d.name}` },
    { href:`parkeringstaxor-stockholm`, text:`Alla taxor 1–5 förklarade` },
  ];
  emit(`billigare-parkering/${d.slug}`, layout({
    slug:`billigare-parkering/${d.slug}`, title:`Billigare parkering i ${d.name} – pris per zon | ParkSpot`,
    desc:`Hitta billigast parkering i ${d.name}. Jämför taxezoner (från ${pris} kr/tim) och se när det är avgiftsfritt (kvällar, nätter, söndagar). Kör lugnt, betala mindre.`,
    h1:`Billigare parkering i ${d.name}`, lead:`Betala mindre i ${esc(d.name)}. Se vilka zoner som är billigast och när det är avgiftsfritt — direkt på kartan.`,
    sections, faq, related, lat:d.lat, lng:d.lng, match:d.match }));
}

function overNatten(d) {
  const sections = `
  <section class="card"><h2>Var står du tryggt över natten i ${esc(d.name)}?</h2>
    <p>Det säkra valet över natten är en gata <b>utan städgata imorgon</b> och utan parkeringsförbud. ParkSpot:s läge "Över natten" markerar dem gröna nära din adress.</p>
    <p>${d.seasonal ? `I ${esc(d.name)} städas många gator bara vintertid (${SEASON}) — på sommaren färre städgator, fler trygga nattplatser.` : `I ${esc(d.name)} städas gator året runt — kolla veckodagen så du inte vaknar till en bortbogserad bil.`}</p></section>
  <section class="card"><h2>Avgift på natten?</h2><p>I ${d.taxa.map(z=>'Taxa '+z).join('/')}-zoner är det ofta <b>avgiftsfritt nattetid</b> (utanför taxetiden). Kontrollera alltid skylten — appen visar zon och tid.</p></section>
  ${garageSection(d, d.lat, d.lng)}`;
  const faq = [
    { q:`Får man parkera över natten i ${d.name}?`, a:`Ja, på många gator. Det säkra är en gata utan städning imorgon och utan förbud — ParkSpot visar dem.` },
    { q:`Kostar det att stå över natten i ${d.name}?`, a:`Ofta avgiftsfritt nattetid i ${d.taxa.map(z=>'Taxa '+z).join('/')}-zoner. Kontrollera skylten.` },
    { q:`Hur undviker jag städbil och böter på morgonen?`, a:`Välj en gata som inte städas imorgon bitti. ParkSpot:s "Över natten"-läge filtrerar bort morgondagens städgator${d.seasonal ? ' och vintergator som inte gäller på sommaren' : ''}.` },
  ];
  const related = [
    { href:`parkering/${d.slug}`, text:`Parkering i ${d.name} (översikt)` },
    { href:`stadgator/${d.slug}`, text:`Städgator i ${d.name}` },
    { href:`parkering-over-natten-stockholm`, text:`Parkera över natten i Stockholm (guide)` },
  ];
  emit(`parkering-over-natten/${d.slug}`, layout({
    slug:`parkering-over-natten/${d.slug}`, title:`Parkering över natten i ${d.name} – tryggt & lagligt | ParkSpot`,
    desc:`Var får du stå över natten i ${d.name} utan städgata, förbud eller böter? ParkSpot visar trygga nattgator nära dig. Sov lugnt.`,
    h1:`Parkering över natten i ${d.name}`, lead:`Sov lugnt — bilen står rätt. Se trygga nattgator i ${esc(d.name)} utan städning eller förbud imorgon bitti.`,
    sections, faq, related, lat:d.lat, lng:d.lng, match:d.match }));
}

function stadgator(d) {
  const sections = `
  <section class="card"><h2>Städgator i ${esc(d.name)} – så funkar det</h2>
    <p>Varje gata har en städdag (veckodag) då du inte får stå. ${d.seasonal
      ? `I ${esc(d.name)} gäller många gator <b>bara vintertid (${SEASON})</b> — resten av året är de inte städgator.`
      : `I ${esc(d.name)} städas gator i regel året runt.`} ParkSpot visar morgondagens städgator på kartan${d.seasonal ? ' och räknar bort vintergator som är ur säsong' : ''}.</p></section>
  <section class="card"><h2>Kvällsknepet</h2><p>En gata som städas imorgon bitti är ofta ledig redan ikväll — nattparkerare undviker den. Perfekt för ett kvällsbesök i ${esc(d.name)}.</p></section>`;
  const faq = [
    { q:`Vilka gator städas imorgon i ${d.name}?`, a:`Det syns live på ParkSpot-kartan (se rutan ovan)${d.seasonal ? ', säsongsjusterat så vintergator inte visas på sommaren' : ''}.` },
    { q:`Är städgator i ${d.name} igång på sommaren?`, a:`${d.seasonal ? `Många gäller bara ${SEASON} (vinter) och är alltså inte städgator på sommaren.` : `Ja, i ${d.name} städas gator i regel året runt.`}` },
    { q:`Vad händer om jag står på en städgata?`, a:`Du riskerar böter och bogsering. Kontrollera alltid skylten och morgondagens städning innan du parkerar.` },
  ];
  const related = [
    { href:`parkering/${d.slug}`, text:`Parkering i ${d.name} (översikt)` },
    { href:`parkering-over-natten/${d.slug}`, text:`Parkering över natten i ${d.name}` },
    { href:`stadgator-stockholm`, text:`Städgator i Stockholm (guide + säsong)` },
  ];
  emit(`stadgator/${d.slug}`, layout({
    slug:`stadgator/${d.slug}`, title:`Städgator i ${d.name} – när städas gatorna? | ParkSpot`,
    desc:`Vilka gator städas i ${d.name} och när? Se morgondagens städgator live${d.seasonal ? ' (säsongsjusterat, vinter '+SEASON+')' : ''}. Undvik böter och bogsering.`,
    h1:`Städgator i ${d.name}`, lead:`Slipp städbil och böter. Se vilka gator i ${esc(d.name)} som städas imorgon — säsongssmart och live.`,
    sections, faq, related, lat:d.lat, lng:d.lng, match:d.match }));
}

function destination(x) {
  const gs = nearestGarages(x.lat, x.lng, 5, 1500);
  const sections = `
  <section class="card"><h2>Parkera nära ${esc(x.name)}</h2>
    <p>Ska du till ${esc(x.what)}? Gatuparkering i området kan vara begränsad, särskilt sommartid. ParkSpot visar lagliga platser och pris på kartan — och närmaste garage om gatorna är fulla.</p>
    <a class="cta" href="/">📍 Se lediga platser nära ${esc(x.name)} →</a></section>
  ${gs.length ? `<section class="card"><h2>🅿 Parkeringshus nära ${esc(x.name)}</h2>
    <table><tr><th>Garage</th><th>Platser</th><th>Avstånd</th></tr>${gs.map(g=>`<tr><td>${esc(g.name)}</td><td>${g.spaces}</td><td class="muted">${km(g.d)}</td></tr>`).join('')}</table>
    <p class="muted">Antal = kapacitet (ej live). Kontrollera på plats.</p></section>` : ''}
  <section class="card"><h2>Tips för besöket</h2>
    <ul><li>Kolla städgator imorgon om du står över natten.</li><li>Kvällar, nätter och söndagar är ofta avgiftsfria i ytterzoner (lördag 11–17 har dock ofta avgift).</li><li>Kommer du på sommaren? Då vilar många vintergator — fler platser.</li></ul></section>`;
  const faq = [
    { q:`Var kan jag parkera nära ${x.name}?`, a:`På lagliga gatuplatser i området eller i närmaste garage (se ovan). ParkSpot visar var du får stå just nu.` },
    { q:`Finns parkeringshus nära ${x.name}?`, a:`${gs.length ? `Ja, t.ex. ${esc(gs[0].name)} (${km(gs[0].d)}).` : 'Använd ParkSpot för att hitta närmaste garage.'}` },
    { q:`Är det svårt att parkera vid ${x.name} på sommaren?`, a:`Det kan vara fullt vid populära mål. ParkSpot visar lediga lagliga platser och garage som sista utväg.` },
  ];
  const related = [
    { href:`parkering-nara/grona-lund`, text:`Parkering nära Gröna Lund` },
    { href:`sommar-parkering-stockholm`, text:`Sommarparkering i Stockholm` },
    { href:`parkeringshus-stockholm`, text:`Parkeringshus i Stockholm` },
  ].filter(r => r.href !== `parkering-nara/${x.slug}`);
  emit(`parkering-nara/${x.slug}`, layout({
    slug:`parkering-nara/${x.slug}`, title:`Parkering nära ${x.name} – platser & garage | ParkSpot`,
    desc:`Var parkerar du nära ${x.name}? Se lagliga gatuplatser, pris och närmaste parkeringshus. Kör lugnt till ${x.name}.`,
    h1:`Parkering nära ${x.name}`, lead:`Ska du till ${esc(x.name)}? Hitta lagliga platser och närmaste garage — utan att cirkla.`,
    sections, faq, related, lat:x.lat, lng:x.lng, match:null }));
}

// ── Pelarsidor ───────────────────────────────────────────────────────────────
function pillarSummer() {
  const outer = DISTRICTS.filter(d => d.seasonal);
  const sections = `
  <section class="card"><h2>Sommarens parkerings-hemlighet i Stockholm</h2>
    <p>Många gator i ytterstaden städas <b>bara vintertid (${SEASON})</b>. På sommaren är de alltså <b>inte städgator</b> — vilket betyder fler lediga, lagliga platser. ParkSpot vet skillnaden och visar bara städning som faktiskt gäller just nu.</p>
    <p>Dessutom lämnar många stockholmare stan på semestern → ledigare på gatorna.</p></section>
  <section class="card"><h2>Områden där vintergatorna vilar i sommar</h2>
    <ul>${outer.map(d => `<li><a href="/stadgator/${d.slug}">${esc(d.name)}</a> – många gator gäller bara ${SEASON}</li>`).join('')}</ul></section>
  <section class="card"><h2>Ska du till sommarmålen?</h2>
    <ul>${DESTINATIONS.map(x => `<li><a href="/parkering-nara/${x.slug}">Parkering nära ${esc(x.name)}</a></li>`).join('')}</ul></section>
  <section class="card"><h2>Tips för en lugn sommarparkering</h2>
    <ul><li>Står du över natten? Kolla städgator imorgon (sommar = ofta inga i ytterstaden).</li>
    <li>Sikta på låga taxezoner (Taxa 4–5, 5–10 kr/tim) och avgiftsfria tider (kvällar, nätter, söndagar).</li>
    <li>Fullt vid målet? ParkSpot visar närmaste garage med kapacitet.</li></ul></section>`;
  const faq = [
    { q:`Är det lättare att parkera i Stockholm på sommaren?`, a:`Ofta ja — många vintergator (${SEASON}) städas inte på sommaren och många bor inte i stan. ParkSpot visar var det är ledigt och lagligt.` },
    { q:`Städas gatorna i Stockholm på sommaren?`, a:`I innerstaden ofta året runt; i ytterstaden gäller många gator bara vintertid (${SEASON}) och vilar på sommaren.` },
    { q:`Var parkerar besökare billigast i sommar?`, a:`I ytterzoner (Taxa 4–5) och avgiftsfria tider. Vid sommarmål som Gröna Lund och Skansen kan garage vara enklast.` },
  ];
  const related = DISTRICTS.slice(0, 6).map(d => ({ href:`parkering/${d.slug}`, text:`Parkering i ${d.name}` }));
  emit('sommar-parkering-stockholm', layout({
    slug:'sommar-parkering-stockholm', title:'Parkering i Stockholm i sommar – billigare & fler platser | ParkSpot',
    desc:`Sommarparkering i Stockholm: vintergator (${SEASON}) städas inte på sommaren – fler lediga platser. Se var du parkerar billigast och nära sommarmålen.`,
    h1:'Parkering i Stockholm i sommar', lead:`${TAGLINE} På sommaren vilar vintergatorna och stan är ledigare — ParkSpot visar var du får stå, billigast och utan böter.`,
    sections, faq, related, lat:59.331, lng:18.064, match:['Södermalm','Östermalm','Kungsholmen','Vasastaden','Norrmalm'] }));
}

function pillarTaxa() {
  const sections = `
  <section class="card"><h2>Stockholms parkeringstaxor: Taxa 1–5</h2>
    <p>Priset på gatuparkering styrs av zonen. Dyrast i city, billigast i ytterområdena:</p>
    ${taxaTable([1,2,3,4,5])}
    <p class="muted">Motorcykel har egen, lägre taxa (serie 11–15, t.ex. 2,50 kr/tim i Taxa 5-områden).</p></section>
  <section class="card"><h2>Så betalar du minst</h2>
    <ul><li>Sikta på låga zoner (Taxa 4–5) i ytterstaden.</li><li>Kvällar, nätter och söndagar är ofta avgiftsfria. <b>Lördag 11–17 har dock avgift</b> i Taxa 1–4 (Taxa 5 fritt).</li><li>Boende kan köpa boendeparkering (rabatt per månad).</li></ul>
    <p>ParkSpot färgar zonerna på kartan så du ser priset innan du parkerar.</p></section>`;
  const faq = [
    { q:`Vad kostar parkering i Stockholm?`, a:`Från 5 kr/tim (Taxa 5) till 55 kr/tim (Taxa 1 i city). Zonen avgör — ParkSpot visar den på kartan.` },
    { q:`Vad är skillnaden mellan Taxa 1 och Taxa 5?`, a:`Taxa 1 är dyrast (55 kr/tim, city, dygnet runt). Taxa 5 är billigast (5 kr/tim vardag 7–19, gratis övrig tid).` },
    { q:`När är det avgiftsfritt?`, a:`Ofta kvällar, nätter och söndagar utanför taxetiden, särskilt i lägre zoner. Obs: lördag 11–17 har avgift i Taxa 1–4 (Taxa 5 fritt). Kontrollera skylten.` },
  ];
  const related = [
    { href:`billigare-parkering/sodermalm`, text:`Billigare parkering på Södermalm` },
    { href:`sommar-parkering-stockholm`, text:`Sommarparkering i Stockholm` },
    { href:`parkering-over-natten-stockholm`, text:`Parkera över natten` },
  ];
  emit('parkeringstaxor-stockholm', layout({
    slug:'parkeringstaxor-stockholm', title:'Stockholms parkeringstaxor: Taxa 1–5 förklarade (pris/tim) | ParkSpot',
    desc:'Vad kostar parkering i Stockholm? Taxa 1–5 förklarade: från 55 kr/tim i city till 5 kr/tim i ytterzon. Se zonen på kartan och betala minst.',
    h1:'Stockholms parkeringstaxor (Taxa 1–5)', lead:'Vad kostar det egentligen? Här är alla zoner och priser — och hur du hittar de billigaste gatorna.',
    sections, faq, related, lat:null, lng:null, match:null }));
}

function pillarStadgator() {
  const outer = DISTRICTS.filter(d => d.seasonal);
  const sections = `
  <section class="card"><h2>Städgator i Stockholm – komplett guide</h2>
    <p>Varje gata har en städdag (veckodag) då parkering är förbjuden. Står du fel blir det böter och ibland bogsering. ParkSpot visar <b>morgondagens städgator</b> på kartan.</p></section>
  <section class="card"><h2>Säsongen: varför vissa gator bara gäller vintern</h2>
    <p>Många gator i ytterstaden städas <b>bara ${SEASON}</b>. Resten av året är de inte städgator. ParkSpot är säsongssmart och räknar bort dem när de inte gäller — så du ser rätt lista, inte en felaktig.</p>
    <ul>${outer.slice(0, 8).map(d => `<li><a href="/stadgator/${d.slug}">Städgator i ${esc(d.name)}</a></li>`).join('')}</ul></section>
  <section class="card"><h2>Kvällsknepet</h2><p>En gata som städas imorgon bitti är ofta ledig redan ikväll — perfekt för kvällsbesök. ParkSpot:s läge "I kväll" bygger på just detta.</p></section>`;
  const faq = [
    { q:`Hur vet jag vilka gator som städas imorgon?`, a:`ParkSpot visar morgondagens städgator live på kartan, säsongsjusterat.` },
    { q:`Varför står det att en gata inte städas fast skylten säger städdag?`, a:`Troligen säsong: gatan städas bara ${SEASON}. Utanför den perioden gäller den inte. Kontrollera alltid skylten.` },
    { q:`Vad kostar en felparkering på en städgata?`, a:`Böter (kontrollavgift) och risk för bogsering. Det lönar sig att kolla först.` },
  ];
  const related = [
    { href:`parkering-over-natten-stockholm`, text:`Parkera över natten i Stockholm` },
    { href:`sommar-parkering-stockholm`, text:`Sommarparkering – när vintergatorna vilar` },
    { href:`parkeringstaxor-stockholm`, text:`Taxor 1–5` },
  ];
  emit('stadgator-stockholm', layout({
    slug:'stadgator-stockholm', title:'Städgator i Stockholm – vilka gator städas imorgon? | ParkSpot',
    desc:`Komplett guide till städgator i Stockholm: se morgondagens städgator live och säsongssmart (vinter ${SEASON}). Undvik böter och bogsering.`,
    h1:'Städgator i Stockholm', lead:'Slipp städbil och böter. Se vilka gator som städas imorgon — säsongssmart, så du får rätt lista.',
    sections, faq, related, lat:59.331, lng:18.064, match:['Södermalm','Östermalm','Kungsholmen','Vasastaden','Norrmalm'] }));
}

function pillarOverNatten() {
  const sections = `
  <section class="card"><h2>Parkera över natten i Stockholm – utan böter</h2>
    <p>Det trygga nattvalet är en gata <b>utan städgata imorgon</b> och utan parkeringsförbud. ParkSpot:s läge "Över natten" markerar dem gröna nära din adress — och avgift är ofta borta nattetid.</p></section>
  <section class="card"><h2>Över natten i din stadsdel</h2>
    <ul>${DISTRICTS.slice(0, 10).map(d => `<li><a href="/parkering-over-natten/${d.slug}">Parkering över natten i ${esc(d.name)}</a></li>`).join('')}</ul></section>
  <section class="card"><h2>Checklista innan du går och lägger dig</h2>
    <ul><li>Städas gatan imorgon bitti? (undvik den)</li><li>Finns parkeringsförbud eller ändamålsplats?</li><li>Gäller avgift nattetid? (ofta inte i ytterzoner)</li></ul></section>`;
  const faq = [
    { q:`Var får man parkera över natten i Stockholm?`, a:`På gator utan städning imorgon och utan förbud. ParkSpot visar dem gröna i läget "Över natten".` },
    { q:`Är det gratis att parkera på natten i Stockholm?`, a:`Ofta avgiftsfritt nattetid utanför taxetiden, särskilt i lägre zoner. Kontrollera skylten.` },
    { q:`Hur undviker jag bogsering på morgonen?`, a:`Stå inte på en gata som städas imorgon bitti. ParkSpot filtrerar bort morgondagens städgator (säsongssmart).` },
  ];
  const related = [
    { href:`stadgator-stockholm`, text:`Städgator i Stockholm` },
    { href:`parkeringstaxor-stockholm`, text:`Taxor 1–5` },
    { href:`sommar-parkering-stockholm`, text:`Sommarparkering` },
  ];
  emit('parkering-over-natten-stockholm', layout({
    slug:'parkering-over-natten-stockholm', title:'Parkera över natten i Stockholm – tryggt & lagligt | ParkSpot',
    desc:'Var får du stå över natten i Stockholm utan städgata, förbud eller böter? ParkSpot visar trygga nattgator nära dig. Sov lugnt.',
    h1:'Parkera över natten i Stockholm', lead:'Sov lugnt — bilen står rätt. Hitta trygga nattgator utan städning eller förbud imorgon bitti.',
    sections, faq, related, lat:59.331, lng:18.064, match:['Södermalm','Östermalm','Kungsholmen','Vasastaden','Norrmalm'] }));
}

function pillarGarages() {
  const top = GARAGES.slice().sort((a,b)=>b.spaces-a.spaces).slice(0, 12);
  const sections = `
  <section class="card"><h2>Parkeringshus i Stockholm – sista utväg när gatan är full</h2>
    <p>När gatorna är fulla är ett parkeringshus räddningen. ParkSpot visar närmaste publika besöksgarage med kapacitet och pris — direkt i kartan.</p></section>
  ${top.length ? `<section class="card"><h2>Några av de största besöksgaragen</h2>
    <table><tr><th>Garage</th><th>Besöksplatser</th></tr>${top.map(g=>`<tr><td>${esc(g.name)}</td><td>${g.spaces}</td></tr>`).join('')}</table>
    <p class="muted">Antal = kapacitet (ej live-beläggning). Kontrollera på plats.</p></section>` : ''}`;
  const faq = [
    { q:`Hur hittar jag närmaste parkeringshus i Stockholm?`, a:`ParkSpot visar närmaste publika besöksgarage med kapacitet när du söker en plats.` },
    { q:`Visar ParkSpot lediga platser i realtid i p-hus?`, a:`Vi visar husets kapacitet och läge ur öppna data. Live-beläggning finns inte öppet — kontrollera på plats.` },
  ];
  const related = [
    { href:`parkering-nara/grona-lund`, text:`Parkering nära Gröna Lund` },
    { href:`sommar-parkering-stockholm`, text:`Sommarparkering` },
  ];
  emit('parkeringshus-stockholm', layout({
    slug:'parkeringshus-stockholm', title:'Parkeringshus i Stockholm – närmaste garage med plats | ParkSpot',
    desc:'Hitta parkeringshus i Stockholm när gatan är full. ParkSpot visar närmaste publika besöksgarage med kapacitet och pris.',
    h1:'Parkeringshus i Stockholm', lead:'Gatan full? Hitta närmaste garage — ParkSpot visar kapacitet och läge.',
    sections, faq, related, lat:null, lng:null, match:null }));
}

function pillarEnglish() {
  const taxaEn = `<table><tr><th>Zone</th><th>Price</th><th>When</th></tr>
    <tr><td>Taxa 1</td><td><b>55 SEK/h</b></td><td class="muted">all days 00–24 (city centre)</td></tr>
    <tr><td>Taxa 2</td><td><b>31 SEK/h</b></td><td class="muted">weekdays 7–21, 20 SEK/h off-peak</td></tr>
    <tr><td>Taxa 3</td><td><b>20 SEK/h</b></td><td class="muted">weekdays 7–19</td></tr>
    <tr><td>Taxa 4</td><td><b>10 SEK/h</b></td><td class="muted">weekdays 7–19</td></tr>
    <tr><td>Taxa 5</td><td><b>5 SEK/h</b></td><td class="muted">weekdays 7–19 (free other times)</td></tr></table>`;
  const sections = `
  <section class="card"><h2>Where can visitors park in Stockholm?</h2>
    <p>You can park on most streets where there is no <b>parking ban</b> and no <b>cleaning day</b> ("städdag"). Pay by the hour via the sign's zone, or use a parking app. ParkSpot shows — on a map — exactly where you may stand right now, the price, and which streets are cleaned tomorrow.</p>
    <a class="cta" href="/">📍 Open the live map →</a></section>
  <section class="card"><h2>What does parking cost? (Tariff zones 1–5)</h2>
    <p>Street parking price depends on the zone — most expensive in the centre, cheapest in the outer areas:</p>
    ${taxaEn}
    <p class="muted">Motorcycles have a lower tariff. Evenings and weekends are often free outside the charging hours.</p></section>
  <section class="card"><h2>⚠️ Watch out: street cleaning days</h2>
    <p>Each street has a weekly <b>cleaning day</b> when parking is forbidden — park there and you risk a fine and towing. Signs are in Swedish ("Servicedag" / day + time). ParkSpot shows tomorrow's cleaning streets on the map, so you can avoid them.</p></section>
  <section class="card"><h2>Parking overnight</h2>
    <p>On many streets it is legal (and often free at night) to park until the next morning — as long as the street is not cleaned the next day. ParkSpot's "Over natten" (overnight) mode highlights safe streets near you.</p></section>
  <section class="card"><h2>Heading to the summer sights?</h2>
    <ul>${DESTINATIONS.map(x => `<li><a href="/parkering-nara/${x.slug}">Parking near ${esc(x.name)}</a></li>`).join('')}</ul>
    <p class="muted">Tip: in summer many outer-area streets are not cleaned (winter only, 1 Nov–15 May) — so there are often more free spots.</p></section>
  ${garageSection({ name:'Stockholm' }, 59.331, 18.064)}`;
  const faq = [
    { q:'Where can I park in central Stockholm as a tourist?', a:'On legal street spots (pay by zone) or in a parking garage. ParkSpot shows where you may stand right now, the price, and the nearest garage.' },
    { q:'How much is parking in Stockholm?', a:'From 5 SEK/hour (zone 5, outer) to 55 SEK/hour (zone 1, city centre). Evenings and weekends are often free.' },
    { q:'What is a "städdag" / cleaning day?', a:'A weekly day when a street is cleaned and parking is banned. Parking on a cleaning day risks a fine and towing — ParkSpot shows tomorrow’s cleaning streets.' },
    { q:'Can I park overnight in Stockholm?', a:'Yes, on many streets and often free at night — as long as the street is not cleaned the next morning. ParkSpot highlights safe overnight streets.' },
    { q:'Is ParkSpot free?', a:'Yes, free and no login. It is based on the City of Stockholm open data.' },
  ];
  const related = [
    { href:'parkering-nara/grona-lund', text:'Parking near Gröna Lund' },
    { href:'parkering-nara/skansen', text:'Parking near Skansen' },
    { href:'parkeringshus-stockholm', text:'Parking garages in Stockholm' },
    { href:'sommar-parkering-stockholm', text:'Sommarparkering (summer, in Swedish)' },
  ];
  emit('parking-in-stockholm', layout({
    slug:'parking-in-stockholm', en:true,
    title:'Parking in Stockholm — a visitor’s guide (prices, rules, map) | ParkSpot',
    desc:'Visiting Stockholm by car? Learn where to park, what it costs (tariff zones 1–5), how to avoid cleaning-day fines, and where to park near the sights. Free live map.',
    h1:'Parking in Stockholm — a visitor’s guide',
    lead:'Stop circling. Know where you can park — before you drive. Prices, rules and a live map that shows free legal spots near you.',
    sections, faq, related, lat:59.331, lng:18.064, match:['Norrmalm','Östermalm','Södermalm','Vasastaden','Kungsholmen','Gamla Stan'] }));
}

// ── Kategori-hubbar (index per kategori → samlar under-sidorna, fixar 404) ────
function linkList(items) {
  return `<ul class="hublist">${items.map(i => `<li><a href="/${i.href}">${esc(i.text)}</a></li>`).join('')}</ul>`;
}
function categoryHub({ slug, title, desc, h1, lead, intro, areaH, areaItems, moreItems, related, match, lat, lng }) {
  const sections = intro
    + `<section class="card"><h2>${esc(areaH)}</h2>${linkList(areaItems)}</section>`
    + (moreItems ? `<section class="card"><h2>Mer om parkering i Stockholm</h2>${linkList(moreItems)}</section>` : '');
  emit(slug, layout({ slug, title, desc, h1, lead, sections, related, match, lat, lng }));
}
function pillarHubs() {
  const all = DISTRICTS;
  // 1) Parkering i Stockholm – bred ingångssida
  categoryHub({
    slug:'parkering',
    title:'Parkering i Stockholm – karta, pris & städgator (alla stadsdelar) | ParkSpot',
    desc:'Var får du parkera i Stockholm? Live-karta med lagliga platser, pris per zon (Taxa 1–5) och morgondagens städgator. Hitta parkering i din stadsdel.',
    h1:'Parkering i Stockholm',
    lead:`${TAGLINE} En live-karta som visar var du får stå just nu, vad det kostar och vilka gator som städas imorgon — i hela Stockholm.`,
    intro:`<section class="card"><h2>Hitta parkering i Stockholm – så funkar det</h2>
      <p>Gatuparkering i Stockholm styrs av tre saker: <b>taxezon</b> (priset, Taxa 1–5), <b>städdag</b> (veckodag då parkering är förbjuden) och <b>parkeringsförbud</b>. ParkSpot visar alla tre på en karta så du slipper cirkla och slipper böter.</p>
      ${taxaTable([1,3,5])}
      <p class="muted">Exakt pris och tid styrs av skylten — appen visar zonen direkt på kartan.</p></section>`,
    areaH:'Parkering stadsdel för stadsdel',
    areaItems: all.map(d => ({ href:`parkering/${d.slug}`, text:`Parkering i ${d.name}` })),
    moreItems:[
      { href:'parkeringstaxor-stockholm', text:'Parkeringstaxor (Taxa 1–5)' },
      { href:'stadgator', text:'Städgator i Stockholm' },
      { href:'parkering-over-natten', text:'Parkering över natten' },
      { href:'billigare-parkering', text:'Billigare parkering' },
      { href:'parkeringshus-stockholm', text:'Parkeringshus' },
      { href:'sommar-parkering-stockholm', text:'Sommarparkering' },
      { href:'parking-in-stockholm', text:'Parking in Stockholm (English)' },
    ],
    related: all.slice(0,6).map(d => ({ href:`parkering/${d.slug}`, text:`Parkering i ${d.name}` })),
    match:['Södermalm','Östermalm','Kungsholmen','Vasastaden','Norrmalm'], lat:59.331, lng:18.064 });
  // 2) Billigare parkering
  categoryHub({
    slug:'billigare-parkering',
    title:'Billigare parkering i Stockholm – pris per zon & gratis-tider | ParkSpot',
    desc:'Betala mindre för parkering i Stockholm. Jämför taxezoner (från 5 kr/tim) och se när det är avgiftsfritt – kvällar, nätter och söndagar. Stadsdel för stadsdel.',
    h1:'Billigare parkering i Stockholm',
    lead:'Betala mindre. Se vilka zoner som är billigast och när parkering är avgiftsfri — i din stadsdel.',
    intro:`<section class="card"><h2>Så hittar du billigast parkering</h2>
      <p>Priset styrs av <b>taxezonen</b>: Taxa 1 är dyrast (55 kr/tim i city), Taxa 5 billigast (5 kr/tim). Sikta på låga zoner i ytterstaden och avgiftsfria tider. <b>Obs:</b> lördag 11–17 har avgift i Taxa 1–4 (Taxa 5 fritt).</p>
      ${taxaTable([1,3,5])}</section>`,
    areaH:'Billigare parkering per stadsdel',
    areaItems: all.map(d => ({ href:`billigare-parkering/${d.slug}`, text:`Billigare parkering i ${d.name}` })),
    moreItems:[{href:'parkeringstaxor-stockholm',text:'Alla taxor 1–5 förklarade'},{href:'sommar-parkering-stockholm',text:'Sommarparkering'},{href:'parkering-over-natten',text:'Parkering över natten (ofta gratis)'}],
    related:[{href:'parkeringstaxor-stockholm',text:'Stockholms parkeringstaxor'}],
    match:['Hägersten','Aspudden','Midsommarkransen','Bromma','Årsta'], lat:59.301, lng:18.012 });
  // 3) Parkering nära mål
  categoryHub({
    slug:'parkering-nara',
    title:'Parkering nära populära platser i Stockholm | ParkSpot',
    desc:'Var parkerar du nära Gröna Lund, Skansen, Globen och andra mål i Stockholm? Se lagliga platser, pris och närmaste parkeringshus.',
    h1:'Parkering nära populära platser i Stockholm',
    lead:'Ska du till ett populärt mål? Hitta lagliga platser och närmaste garage — utan att cirkla.',
    intro:`<section class="card"><h2>Parkera smart vid målet</h2><p>Vid populära mål kan gatuparkeringen vara begränsad, särskilt sommartid. ParkSpot visar lediga lagliga platser, pris och närmaste parkeringshus — välj ditt mål nedan.</p></section>`,
    areaH:'Populära mål',
    areaItems: DESTINATIONS.map(x => ({ href:`parkering-nara/${x.slug}`, text:`Parkering nära ${x.name}` })),
    moreItems:[{href:'parkeringshus-stockholm',text:'Parkeringshus i Stockholm'},{href:'sommar-parkering-stockholm',text:'Sommarparkering'}],
    related:[{href:'parkeringshus-stockholm',text:'Parkeringshus i Stockholm'}],
    match:null, lat:null, lng:null });
  // 4) Städgator (index per stadsdel) – väver in "servicedag"-synonymen
  categoryHub({
    slug:'stadgator',
    title:'Städgator i Stockholm – stadsdel för stadsdel (servicedagar) | ParkSpot',
    desc:'Vilka gator städas i Stockholm och när? Se morgondagens städgator (servicedagar) live, stadsdel för stadsdel. Säsongssmart – undvik böter och bogsering.',
    h1:'Städgator i Stockholm – per stadsdel',
    lead:'Slipp städbil och böter. Se vilka gator som städas imorgon – välj din stadsdel.',
    intro:`<section class="card"><h2>Städgator &amp; servicedagar – så funkar det</h2><p>Varje gata har en <b>städdag</b> (kallas även <b>servicedag</b>) – en veckodag då parkering är förbjuden för gatustädning. Står du fel blir det böter och ibland bogsering. Många gator i ytterstaden gäller <b>bara vintertid (${SEASON})</b>. ParkSpot visar morgondagens städgator live och säsongssmart.</p>
      <p><a href="/stadgator-stockholm">Läs hela guiden om städgator i Stockholm →</a></p></section>`,
    areaH:'Städgator stadsdel för stadsdel',
    areaItems: all.map(d => ({ href:`stadgator/${d.slug}`, text:`Städgator i ${d.name}` })),
    moreItems:[{href:'stadgator-stockholm',text:'Städgator – komplett guide'},{href:'parkering-over-natten',text:'Parkering över natten'},{href:'sommar-parkering-stockholm',text:'Sommarparkering'}],
    related:[{href:'stadgator-stockholm',text:'Städgator i Stockholm (guide)'}],
    match:['Södermalm','Östermalm','Kungsholmen','Vasastaden','Norrmalm'], lat:59.331, lng:18.064 });
  // 5) Parkering över natten (index per stadsdel)
  categoryHub({
    slug:'parkering-over-natten',
    title:'Parkering över natten i Stockholm – per stadsdel | ParkSpot',
    desc:'Var får du stå över natten i Stockholm utan städgata, förbud eller böter? Se trygga nattgator stadsdel för stadsdel. Ofta avgiftsfritt nattetid.',
    h1:'Parkering över natten i Stockholm – per stadsdel',
    lead:'Sov lugnt – bilen står rätt. Se trygga nattgator utan städning eller förbud, i din stadsdel.',
    intro:`<section class="card"><h2>Tryggt över natten – så väljer du gata</h2><p>Det säkra nattvalet är en gata <b>utan städgata imorgon</b> och utan parkeringsförbud — ofta avgiftsfritt nattetid. ParkSpot:s läge "Över natten" markerar dem gröna nära din adress.</p>
      <p><a href="/parkering-over-natten-stockholm">Läs hela guiden om att parkera över natten →</a></p></section>`,
    areaH:'Över natten stadsdel för stadsdel',
    areaItems: all.map(d => ({ href:`parkering-over-natten/${d.slug}`, text:`Parkering över natten i ${d.name}` })),
    moreItems:[{href:'parkering-over-natten-stockholm',text:'Över natten – komplett guide'},{href:'stadgator',text:'Städgator'},{href:'parkeringstaxor-stockholm',text:'Taxor 1–5'}],
    related:[{href:'parkering-over-natten-stockholm',text:'Parkera över natten i Stockholm (guide)'}],
    match:['Södermalm','Östermalm','Kungsholmen','Vasastaden','Norrmalm'], lat:59.331, lng:18.064 });
}

// ── Generera ─────────────────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

pillarSummer(); pillarTaxa(); pillarStadgator(); pillarOverNatten(); pillarGarages(); pillarEnglish();
pillarHubs();
DISTRICTS.forEach(d => { districtHub(d); billigare(d); overNatten(d); stadgator(d); });
DESTINATIONS.forEach(destination);

fs.writeFileSync(path.join(__dirname, 'pages.json'), JSON.stringify(pages, null, 0));
console.log(`[seo] Genererade ${pages.length} sidor i seo/site/`);
console.log(`[seo] pages.json uppdaterad (för sitemap)`);
