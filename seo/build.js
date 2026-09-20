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
// Boendeparkering (kr/dygn resp kr/30 dagar) – parkering.stockholm/betala-parkering/taxeomraden-avgifter
// (uppdaterat 10 feb 2026). OBS: kräver folkbokföring + fordonsägande i zonen – inget en besökare kan köpa.
const TAXA = {
  1: { pris: 55, txt: '55 kr/tim alla dagar 00–24 (avgift dygnet runt)', boendeDygn: 90, boendeMan: 1600, boendeMcDygn: '22,50', boendeMcMan: 400 },
  2: { pris: 31, txt: '31 kr/tim vardag 7–21, lör & helg 9–19, 20 kr/tim övrig tid (avgift dygnet runt)', boendeDygn: 90, boendeMan: 1600, boendeMcDygn: '22,50', boendeMcMan: 400 },
  3: { pris: 20, txt: '20 kr/tim vardag 7–19, 15 kr/tim lör 11–17 (sön & natt fritt)', boendeDygn: 90, boendeMan: 1600, boendeMcDygn: '22,50', boendeMcMan: 400 },
  4: { pris: 10, txt: '10 kr/tim vardag 7–19, 10 kr/tim lör 11–17 (sön & natt fritt)', boendeDygn: 35, boendeMan: 500, boendeMcDygn: '8,75', boendeMcMan: 125 },
  5: { pris: 5,  txt: '5 kr/tim vardag 7–19 (lör, sön & natt fritt; mc 2,50 kr/tim)', boendeDygn: 20, boendeMan: 300, boendeMcDygn: 5, boendeMcMan: 75 },
};
const SEASON = '1 november–15 maj';

// ── Framåt-läget (v1.24.0) ────────────────────────────────────────────────────
// EN källa för texten, återanvänd på varje sida som bär den. Skrivs den av för hand
// per sida glider städerna isär vid nästa ändring, och då säger sajten två olika
// saker om samma funktion (regel 13 i arbetssättet: sekundärtext synkas aldrig själv).
//
// Klockslagen är MÄTTA, inte antagna: Stockholms kvällsöppningar sker kl 19 och
// Göteborgs kl 18, och de sker i klump – 50 sträckor i ett enda kvartssteg i Vasastan,
// 19 i Göteborg. Det är hela skälet till att funktionen är en tidpunkt och inte en
// nedräkning per gata.
const FRAMAT_KL = { stockholm: '19', goteborg: '18' };
function framatFaq(stad = 'stockholm') {
  const kl = FRAMAT_KL[stad];
  return {
    q: 'Kan jag se hur parkeringen ser ut när jag kommer fram?',
    a: 'Ja. Välj <b>+30 min</b> eller <b>+60 min</b> i appen, så visar kartan hela läget som det '
     + 'blir vid framkomsten i stället för som det är nu. Gator där städningen eller lastplatsen '
     + 'hunnit ta slut blir gröna och lyser upp, och gator som hunnit stängas blir röda. '
     + 'Användbart när du ska in till stan och vill tajma en gata som släpper – många öppnar '
     + 'samtidigt kl ' + kl + ', så en halvtimme kan ändra hela kartan. Ett rött band överst '
     + 'visar vilket klockslag kartan gäller för. Kontrollera alltid skylten på plats.'
  };
}

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
  { slug:'grona-lund', name:'Gröna Lund', lat:59.3236, lng:18.0967, what:'nöjesparken Gröna Lund på Djurgården', note:'Gröna Lund har öppet på sommarhalvåret och konserter många kvällar – då är gatorna nära Djurgården ofta fulla. Kom i god tid, sikta direkt på ett garage (nedan), eller ta spårvagn 7 / Djurgårdsfärjan. På sommaren vilar dessutom många vintergator i ytterstaden, vilket kan ge fler platser en bit bort.' },
  { slug:'skansen', name:'Skansen', lat:59.3265, lng:18.1045, what:'friluftsmuseet Skansen på Djurgården' },
  { slug:'djurgarden', name:'Djurgården', lat:59.3260, lng:18.1100, what:'museiön Djurgården' },
  { slug:'stromkajen', name:'Strömkajen', lat:59.3290, lng:18.0760, what:'skärgårdsbåtarnas avgångar vid Strömkajen' },
  { slug:'langholmen', name:'Långholmen', lat:59.3210, lng:18.0290, what:'badklipporna och parken på Långholmen' },
  { slug:'globen', name:'Avicii Arena (Globen)', lat:59.2935, lng:18.0830, what:'evenemang och konserter vid Avicii Arena' },
  { slug:'centralstationen', name:'Centralstationen', lat:59.3300, lng:18.0580, what:'Stockholms Centralstation' },
  { slug:'slussen', name:'Slussen', lat:59.3200, lng:18.0720, what:'Slussen mellan Södermalm och Gamla Stan' },
  { slug:'kista-galleria', name:'Kista Galleria', lat:59.4032, lng:17.9443, what:'köpcentret Kista Galleria', district:'kista', en:false },
  { slug:'kistamassan', name:'Kistamässan', lat:59.4062, lng:17.9572, what:'mässor och event på Kistamässan', district:'kista', en:false },
];

// ── Parkeringsanläggningar (cachad öppen data) ───────────────────────────────
// Fram till v1.28.0 filtrerade den här filen med sitt EGET /garage/i och kände
// varken till de 403 ytparkeringarna eller villkoren i fritexten. Sidorna sa
// "Närmaste parkeringshus" och var tomma i hela ytterstaden, där appen numera
// har flest träffar.
//
// ⚠ LOGIKEN KOPIERAS INTE HIT. `taxaArBesok`, `maxtidUr` och `garageVillkor`
// LÄSES UT UR index.html vid bygget. En kopia hade glidit isär från appen tyst,
// och då hade sidan och kartan sagt olika saker om samma parkering – precis den
// sortens skuld som fick arkitektursidan att räknas automatiskt (kodpekare.js).
// Saknas markörerna kraschar bygget med flit i stället för att tyst tappa villkor.
const APP_HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function appLogik() {
  const start = APP_HTML.indexOf('function taxaArBesok');
  const slut  = APP_HTML.indexOf('async function fetchNearbyGarages');
  if (start < 0 || slut < 0 || slut <= start) {
    throw new Error('[seo] hittar inte villkorslogiken i index.html – har funktionerna '
      + 'döpts om? Bygget stoppas hellre än att generera sidor utan maxtid och villkor.');
  }
  const kod = APP_HTML.slice(start, slut);
  for (const namn of ['taxaArBesok', 'taxaArMc', 'taxaArLangtid', 'maxtidUr', 'garageVillkor', 'garageArForBesok']) {
    if (!kod.includes('function ' + namn)) throw new Error('[seo] saknar ' + namn + ' i utsnittet');
  }
  const STAD = { phusMcTaxa: true };           // används bara av garageTaxa, som vi inte kallar
  return eval(kod + '\n({ garageVillkor, garageArForBesok, maxtidUr, taxaArBesok })');
}
const { garageVillkor, garageArForBesok } = appLogik();

// Priset utelämnas med flit på de HÄR sidorna: appens `garageTaxa` svarar på vad
// det kostar JUST NU, och en statisk sida kan inte bära ett svar som byter värde
// klockan 18. Sidan hänvisar till kartan för priset.
const ANL_TYP = /^(garage|ytparkering)$/i;
let GARAGES = [];
try {
  GARAGES = JSON.parse(fs.readFileSync(path.join(__dirname, 'garages.json'), 'utf8'))
    .filter(a => ANL_TYP.test(a.Anlaggningstyp || '') && a.AntalBesokPlatser > 0 && a.AdressLatitud && a.AdressLongitud
              && garageArForBesok(a, 'bil'))
    .map(a => ({ name: a.Name, lat: a.AdressLatitud, lng: a.AdressLongitud, spaces: a.AntalBesokPlatser,
      sort: /ytparkering/i.test(a.Anlaggningstyp || '') ? 'Yta' : 'Garage',
      villkor: garageVillkor(a) }))
    // Anläggningar bara för rörelsehindrade hör inte hemma i en allmän sidlista.
    // Appen visar dem i RH-läget; sidorna har inget lägesval att visa dem i.
    .filter(a => !(a.villkor && a.villkor.baraRh));
  const yt = GARAGES.filter(g => g.sort === 'Yta').length;
  console.log(`[seo] ${GARAGES.length} publika besöksanläggningar laddade `
    + `(${GARAGES.length - yt} garage, ${yt} ytparkeringar, `
    + `${GARAGES.filter(g => g.villkor && g.villkor.maxtid).length} med maxtid)`);
} catch (e) { console.warn('[seo] kunde inte läsa garages.json – anläggningssektioner utelämnas:', e.message); }

// ── Gator (top per stadsdel ur P_TILLATEN, cachat) ───────────────────────────
let STREETS = [];
try {
  STREETS = JSON.parse(fs.readFileSync(path.join(__dirname, 'streets.json'), 'utf8'));
  console.log(`[seo] ${STREETS.length} gatu-sidor laddade`);
} catch { console.warn('[seo] saknar streets.json – gatu-sidor utelämnas'); }

function dist(aLat, aLng, bLat, bLng) {
  const R = 6371000, toR = x => x * Math.PI / 180;
  const dLa = toR(bLat - aLat), dLo = toR(bLng - aLng);
  const h = Math.sin(dLa/2)**2 + Math.cos(toR(aLat))*Math.cos(toR(bLat))*Math.sin(dLo/2)**2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
// Samma sorteringsregel som appen: avstånd, men anläggningar med färre än sex
// platser sjunker sist. Utan den hamnar en parkering med EN plats överst på en
// sida som ska svara "var ställer jag bilen".
const SMA_PLATSER = 6;
const nearestGarages = (lat, lng, n = 4, radius = 2000) => GARAGES
  .map(g => ({ ...g, d: dist(lat, lng, g.lat, g.lng) }))
  .filter(g => g.d <= radius)
  .sort((a, b) => (a.spaces < SMA_PLATSER) - (b.spaces < SMA_PLATSER) || a.d - b.d)
  .slice(0, n);

// Villkorscellen i tabellerna. Maxtiden först – den är det man faktiskt planerar
// efter – sedan en varning när fritexten säger att platsen inte är för vem som helst.
const villkorCell = g => {
  const v = g.villkor;
  if (!v) return '<span class="muted">–</span>';
  const bitar = [];
  if (v.maxtid)  bitar.push(`<b>${esc(v.maxtid.text)}</b>`);
  if (v.etikett) bitar.push(`⚠️ ${esc(v.etikett)}`);
  return bitar.length ? bitar.join(' · ') : '<span class="muted">–</span>';
};
const anlTabell = rader => `<table><tr><th>Anläggning</th><th>Typ</th><th>Platser</th>`
  + `<th>Villkor</th><th>Avstånd</th></tr>${rader.map(g => `<tr><td>${esc(g.name)}</td>`
  + `<td class="muted">${g.sort}</td><td>${g.spaces}</td><td>${villkorCell(g)}</td>`
  + `<td class="muted">${km(g.d)}</td></tr>`).join('')}</table>`;

const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const km = d => d < 1000 ? `${d} m` : `${(d/1000).toFixed(1)} km`;

// ── Engelsk copy (turistsida) ────────────────────────────────────────────────
const EN = {
  sub: 'street parking map',
  // Samma rättelse som den svenska texten: appen visar inte lediga platser.
  cta: '📍 Open the map — see where you may park →',
  tagline: 'Stop circling. Know where you can park — before you drive.',
  promise: 'ParkSpot shows legal on-street spots, the cheapest tariff and which streets are cleaned tomorrow. Drive calm, avoid fines.',
  disclaimer: 'Based on the City of Stockholm open data and may be out of date. Always check the local signs. ParkSpot is not liable for parking fines or towing.',
  relatedTitle: 'More about parking in Stockholm',
  faqTitle: 'Frequently asked questions',
};

// ── Delad layout ─────────────────────────────────────────────────────────────
// `stad` läggs till med Stockholm som default: alla befintliga anrop saknar den och
// får därför EXAKT samma utdata som förut (byte-verifierat på 211 sidor). Göteborgs
// sidor skickar in sitt eget namn i stället för att vi skriver om varumärket överallt.
const STADSNAMN_DEF = { namn: 'ParkSpot Stockholm', relText: 'Mer om parkering i Stockholm', karta: '/' };
// ⚠ CTA-texten löd tidigare "se lediga platser live" (engelska: "see free spots") på
// 213 sidor. Appen har INGA sensorer för beläggning – det står uttryckligen i llms.txt
// och i appens egen ansvarstext. Marknadsföringen lovade alltså något produkten
// förnekar, vilket är det snabbaste sättet att förlora förtroende för allt annat.
// Knappens länk följer dessutom staden: en Göteborgssida ska inte leda till Stockholm.
// Google kapar titeln vid ungefär 60 tecken på mobil, och 82 % av klicken är mobila
// (uppmätt i Search Console 2026-09-20). Mallar med ett namn i sig – gatunamn plus
// stadsdel – spränger gränsen för de längsta namnen men inte för de korta. Ta därför
// den fylliga varianten när den ryms och den korta annars, i stället för att låta alla
// sidor betala för de längsta namnen.
const TITEL_MAX = 60;
function kortTitel(lang, kort) { return lang.length <= TITEL_MAX ? lang : kort; }

function layout({ slug, title, desc, h1, lead, sections, faq, related, lat, lng, match, en = false, alts = [], extraLd = null, stad = STADSNAMN_DEF }) {
  const hreflang = alts.length
    ? alts.map(a => `<link rel="alternate" hreflang="${a.lang}" href="${SITE}/${a.slug}">`).join('')
      + `<link rel="alternate" hreflang="x-default" href="${SITE}/${(alts.find(a => a.lang === 'sv') || alts[0]).slug}">`
    : '';
  const faqLd = faq && faq.length ? {
    '@context':'https://schema.org','@type':'FAQPage',
    mainEntity: faq.map(f => ({ '@type':'Question', name:f.q, acceptedAnswer:{ '@type':'Answer', text:f.a.replace(/<[^>]+>/g,'') } }))
  } : null;
  const pageLd = { '@context':'https://schema.org','@type':'WebPage', name:title, url:`${SITE}/${slug}`,
    description:desc, inLanguage: en ? 'en' : 'sv',
    isPartOf:{ '@type':'WebSite', '@id':`${SITE}/#website`, name:stad.namn, url:SITE },
    publisher:{ '@type':'Organization', '@id':`${SITE}/#organization`, name:'ParkSpot' } };
  const widget = (lat != null && match) ? cleaningWidget(lat, lng, match, en) : '';
  const faqHtml = faq && faq.length ? `<section class="card"><h2>${en ? EN.faqTitle : 'Vanliga frågor'}</h2>${faq.map(f =>
    `<h3>${esc(f.q)}</h3><p>${f.a}</p>`).join('')}</section>` : '';
  const relHtml = related && related.length ? `<section class="card related"><h2>${en ? EN.relatedTitle : stad.relText}</h2><ul>${
    related.map(r => `<li><a href="/${r.href}">${esc(r.text)}</a></li>`).join('')}</ul></section>` : '';

  return `<!DOCTYPE html><html lang="${en ? 'en' : 'sv'}"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/${slug}">${hreflang}
<meta name="robots" content="index, follow">
<meta property="og:type" content="article"><meta property="og:locale" content="sv_SE">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/${slug}"><meta property="og:image" content="${SITE}/og-image-v2.png">
<meta property="og:site_name" content="${esc(stad.namn)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%234ade80'/%3E%3Ctext x='16' y='23' text-anchor='middle' font-size='22' font-weight='bold' font-family='Arial' fill='%23080c1c'%3EP%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<script type="application/ld+json">${JSON.stringify(pageLd)}</script>
${faqLd ? `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>` : ''}
${extraLd ? `<script type="application/ld+json">${JSON.stringify(extraLd)}</script>` : ''}
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',sans-serif;background:#f4f6f9;color:#0f172a;line-height:1.65;-webkit-font-smoothing:antialiased}
  a{color:#16a34a;text-decoration:none}a:hover{text-decoration:underline}
  .wrap{max-width:760px;margin:0 auto;padding:0 18px}
  header.top{background:#ffffff;border-bottom:1px solid rgba(15,23,42,.10);padding:14px 0}
  .brand{display:flex;align-items:center;gap:10px}
  .logo{width:34px;height:34px;border-radius:9px;background:rgba(22,163,74,.10);border:1px solid rgba(22,163,74,.28);display:flex;align-items:center;justify-content:center;font-weight:800;color:#16a34a}
  .brand b{font-size:15px}.brand span{display:block;font-size:11px;color:rgba(15,23,42,.55)}
  .hero{padding:30px 0 8px}
  h1{font-size:27px;line-height:1.18;letter-spacing:-.02em;margin-bottom:10px;font-weight:800}
  .lead{font-size:16px;color:rgba(15,23,42,.70);margin-bottom:18px}
  .cta{display:inline-flex;align-items:center;gap:8px;background:#16a34a;color:#fff;font-weight:700;padding:12px 20px;border-radius:12px;box-shadow:0 1px 3px rgba(15,23,42,.15);margin:6px 0 8px}
  .cta:hover{text-decoration:none;background:#15803d}
  .card{background:#ffffff;border:1px solid rgba(15,23,42,.10);border-radius:14px;padding:18px 18px;margin:16px 0}
  h2{font-size:19px;margin-bottom:10px;letter-spacing:-.01em}
  h3{font-size:15px;margin:14px 0 4px;color:#334155}
  p{margin-bottom:10px;color:#334155}
  ul{margin:6px 0 6px 18px}li{margin:4px 0;color:#334155}
  table{width:100%;border-collapse:collapse;margin:8px 0;font-size:14px}
  th,td{text-align:left;padding:7px 8px;border-bottom:1px solid rgba(15,23,42,.10)}
  th{color:rgba(15,23,42,.55);font-weight:600}
  .pill{display:inline-block;font-size:12px;padding:3px 9px;border-radius:20px;background:rgba(15,23,42,.05);border:1px solid rgba(15,23,42,.14);color:#0f172a;margin:2px 4px 2px 0}
  .green{color:#16a34a}.muted{color:rgba(15,23,42,.55);font-size:13px}
  .live{min-height:24px}
  .live .row{display:flex;gap:8px;align-items:baseline;padding:4px 0;border-bottom:1px solid rgba(15,23,42,.08)}
  .live .nm{font-weight:600;color:#b45309}
  .related ul{list-style:none;margin-left:0}
  .related li{padding:6px 0;border-bottom:1px solid rgba(15,23,42,.08)}
  footer{border-top:1px solid rgba(15,23,42,.10);margin-top:24px;padding:22px 0 40px;color:rgba(15,23,42,.55);font-size:12px}
  footer a{color:#16a34a}
</style></head>
<body>
<header class="top"><div class="wrap"><a class="brand" href="/"><span class="logo">P</span><span><b>${esc(stad.namn)}</b><span>${en ? EN.sub : 'parkering på karta'}</span></span></a></div></header>
<main class="wrap">
  <div class="hero">
    <h1>${esc(h1)}</h1>
    <p class="lead">${lead}</p>
    <a class="cta" href="${stad.karta}">${en ? EN.cta : '📍 Öppna kartan – se var du får parkera →'}</a>
  </div>
  ${widget}
  ${sections}
  ${faqHtml}
  ${relHtml}
</main>
<footer><div class="wrap">
  <p><b style="color:#0f172a">${esc(en ? EN.tagline : TAGLINE)}</b><br>${esc(en ? EN.promise : PROMISE)}</p>
  <p style="margin-top:10px"><a href="/">${en ? 'Open the ParkSpot map' : 'Öppna ParkSpot-kartan'}</a> · <a href="/parkeringstaxor-stockholm">${en ? 'Tariffs 1–5' : 'Taxor 1–5'}</a> · <a href="/stadgator-stockholm">${en ? 'Street cleaning' : 'Städgator'}</a> · <a href="/om-parkspot">${en ? 'About' : 'Om ParkSpot'}</a> · <a href="/parking-in-stockholm">English</a></p>
  <p style="margin-top:10px;color:rgba(15,23,42,.45)">${esc(en ? EN.disclaimer : DISCLAIMER)}</p>
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
function boendeTable(zones) {
  const rows = zones.map(z => { const t = TAXA[z];
    return `<tr><td>Taxa ${z}</td><td><b>${t.boendeDygn} kr/dygn</b> eller <b>${t.boendeMan} kr/30 dagar</b></td><td class="muted">MC: ${t.boendeMcDygn} kr/dygn · ${t.boendeMcMan} kr/30 dagar</td></tr>`; }).join('');
  return `<table><tr><th>Zon</th><th>Boendeparkering</th><th>Boende-MC</th></tr>${rows}</table>`;
}
const BOENDE_CAVEAT = 'Boendeparkering är <b>inte något en besökare kan köpa i stunden</b> – tillståndet kräver att du är folkbokförd och äger/leasar fordonet inom zonen. Priserna ovan gäller den som redan har eller ansöker om tillstånd.';
// Gratis/avgift – ÄRLIGT per zon: bara Taxa 3–5 har avgiftsfri natt/söndag. Taxa 1–2 (city)
// är avgift DYGNET RUNT → påstå aldrig "gratis nattetid" på rena innerstadssidor (falsk trygghet → böter).
const hasFreeZone = taxa => taxa.some(z => z >= 3);
function freeTimesLine(taxa) {
  return hasFreeZone(taxa)
    ? 'Ofta <b>avgiftsfritt kvällar, nätter och söndagar</b> i de lägre zonerna (obs: lördag 11–17 har avgift i Taxa 3–4; Taxa 5 är fritt).'
    : 'Här gäller <b>avgift dygnet runt</b> (Taxa 1–2 i city) – kontrollera skylten.';
}
function garageSection(d, lat, lng) {
  const gs = nearestGarages(lat, lng);
  if (!gs.length) return '';
  return `<section class="card"><h2>🅿 Garage och parkeringsytor nära</h2>
  <p>Är gatorna fulla? Närmaste publika besöksparkeringar utanför gatan:</p>
  ${anlTabell(gs)}
  <p class="muted">Antal = anläggningens kapacitet (ej live-beläggning). Priset varierar
  över dygnet och visas i kartan. Kontrollera alltid skylten på plats.</p></section>`;
}

// ── Sidtyper ─────────────────────────────────────────────────────────────────
const pages = [];
const rakn = { andrade: 0, oforandrade: 0 };   // vad som faktiskt hände i den här körningen
// `lastmod` i sitemap betyder "den här sidan har ändrats". Tidigare stämplades dagens
// datum på ALLA 225 sidor vid varje bygge – även de 220 som var byte-identiska. Det är
// inte bara slöseri: Google slutar lita på signalen från en sajt som påstår att allt ändras
// varje gång, och då förlorar de sidor som FAKTISKT ändrats sin knuff.
//
// Nu jämförs den nygenererade sidan med den som redan ligger på disk:
//   identisk  → behåll det gamla datumet ur pages.json (sidan har inte ändrats)
//   ändrad    → dagens datum
// Saknas tidigare datum (ny sida) blir det också dagens, vilket är sant.
const TIDIGARE_LASTMOD = (function () {
  try {
    const gammal = JSON.parse(fs.readFileSync(path.join(__dirname, 'pages.json'), 'utf8'));
    return new Map(gammal.map(x => [x.loc, x.lastmod]));
  } catch (e) { return new Map(); }   // första bygget, eller trasig fil – allt blir dagens
})();

// ⚠ KOPIAN MÅSTE TAS HÄR, INTE I emit(). Bygget tömmer hela seo/site längre ner
// (fs.rmSync), så när emit körs finns ingen tidigare fil kvar att jämföra med – ett
// försök att läsa från disk där svarar alltid "fanns inte", och då stämplas varenda
// sida som ändrad igen. Modulen körs uppifrån och ner, så den här raden hinner före.
const TIDIGARE_HTML = (function () {
  const ut = new Map();
  const gaIgenom = katalog => {
    let poster = [];
    try { poster = fs.readdirSync(katalog, { withFileTypes: true }); } catch (e) { return; }
    for (const post of poster) {
      const full = path.join(katalog, post.name);
      if (post.isDirectory()) gaIgenom(full);
      else if (post.name.endsWith('.html')) {
        const slug = path.relative(OUT, full).replace(/\\/g, '/').replace(/\.html$/, '');
        try { ut.set(slug, fs.readFileSync(full, 'utf8')); } catch (e) {}
      }
    }
  };
  gaIgenom(OUT);
  return ut;
})();

function emit(slug, html) {
  const file = path.join(OUT, slug + '.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const loc = `${SITE}/${slug}`;
  // Vagnretur bort före jämförelsen: git skriver arbetsträdet med CRLF på Windows
  // medan generatorn skriver LF. En rå strängjämförelse såg då skillnad på ALLA 225
  // sidor, och hela poängen med kontrollen föll (uppmätt 2026-09-03).
  const utanCR = t => t == null ? null : t.split(String.fromCharCode(13)).join('');
  const fore = TIDIGARE_HTML.has(slug) ? TIDIGARE_HTML.get(slug) : null;
  const oforandrad = fore != null && utanCR(fore) === utanCR(html);
  fs.writeFileSync(file, html);
  if (oforandrad) rakn.oforandrade++; else rakn.andrade++;
  pages.push({ loc, lastmod: (oforandrad && TIDIGARE_LASTMOD.get(loc)) || TODAY });
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
  <section class="card"><h2>Vad kostar boendeparkering i ${esc(d.name)}?</h2>
    <p>Den som är folkbokförd i zonen och äger/leasar fordonet kan ansöka om boendeparkeringstillstånd:</p>
    ${boendeTable(d.taxa)}
    <p class="muted">${BOENDE_CAVEAT}</p></section>
  <section class="card"><h2>Städgator i ${esc(d.name)}</h2><p>${seasonLine}</p>
    <p>Kvällsknepet: en gata som städas imorgon bitti är ofta ledig redan ikväll — de som nattparkerar undviker den. Läget <b>Nu</b> visar direkt om en gata nyss städats eller snart städas.</p></section>
  <section class="card"><h2>Parkera över natten i ${esc(d.name)}</h2>
    <p>I läget <b>Över natten</b> visar ParkSpot gröna gator nära dig där det är lagligt att stå till morgonen efter — utan städgata eller förbud. Avgift kan ändå gälla; kontrollera skylten.</p></section>
  ${(() => { const st = STREETS.filter(x => x.districtSlug === d.slug);
    return st.length ? `<section class="card"><h2>Populära gator i ${esc(d.name)}</h2>
    <p>Hitta pris och städdag för en specifik gata:</p>${linkList(st.map(x => ({ href:`parkering/${x.slug}`, text:`Parkering på ${x.name}` })))}</section>` : ''; })()}
  ${(() => { const dd = DESTINATIONS.filter(x => x.district === d.slug);
    return dd.length ? `<section class="card"><h2>Parkering vid mål i ${esc(d.name)}</h2>${linkList(dd.map(x => ({ href:`parkering-nara/${x.slug}`, text:`Parkering vid ${x.name}` })))}</section>` : ''; })()}
  ${garageSection(d, d.lat, d.lng)}`;
  const faq = [
    { q:`Vad kostar parkering i ${d.name}?`, a:`Från cirka <b>${pris} kr/tim</b> (${d.taxa.map(z=>'Taxa '+z).join('/')}). Priset bestäms av skylten; ParkSpot visar zonen på kartan.` },
    { q:`Får man parkera över natten i ${d.name}?`, a:`Ja, på många gator. Använd läget "Över natten" för att se var det är lagligt till morgonen efter, utan städgata eller förbud.` },
    { q:`Hur vet jag om en gata i ${d.name} städas imorgon?`, a:`ParkSpot visar morgondagens städgator på kartan${d.seasonal ? ', och räknar bort vintergator som inte gäller på sommaren' : ''}.` },
    { q:`Är ParkSpot gratis?`, a:`Ja, gratis och utan inloggning. Det bygger på Stockholms stads öppna data.` },
    { q:`Vad kostar boendeparkering i ${d.name}?`, a:`${d.taxa.map(z => `Taxa ${z}: <b>${TAXA[z].boendeDygn} kr/dygn</b> eller <b>${TAXA[z].boendeMan} kr/30 dagar</b>`).join(' · ')}. Kräver folkbokföring och fordonsägande i zonen – går inte att köpa spontant som besökare.` },
  ];
  const related = [
    { href:`billigare-parkering/${d.slug}`, text:`Billigare parkering i ${d.name}` },
    { href:`parkering-over-natten/${d.slug}`, text:`Parkering över natten i ${d.name}` },
    { href:`stadgator/${d.slug}`, text:`Städgator i ${d.name}` },
    { href:`sommar-parkering-stockholm`, text:`Sommarparkering i Stockholm` },
    { href:`parkeringstaxor-stockholm`, text:`Stockholms parkeringstaxor (Taxa 1–5)` },
  ];
  emit(`parkering/${d.slug}`, layout({
    slug:`parkering/${d.slug}`, title:`Parkering på ${d.name} – pris, städgator och natten`,
    desc:`Var får du stå på ${d.name}? Se pris per zon, morgondagens städgator och vilka gator som håller hela natten.`,
    h1:`Parkering i ${d.name}`, lead:`${TAGLINE} Här hittar du pris, städgator och nattparkering i ${esc(d.name)} — och en live-karta som visar var du får stå just nu.`,
    sections, faq, related, lat:d.lat, lng:d.lng, match:d.match }));
}

function billigare(d) {
  const cheap = Math.max(...d.taxa), pris = TAXA[cheap].pris;
  const sections = `
  <section class="card"><h2>Så hittar du billigast parkering i ${esc(d.name)}</h2>
    <p>Priset styrs av <b>taxezonen</b>. I Stockholm går det från Taxa 1 (dyrast, 55 kr/tim i city) ner till Taxa 5 (5 kr/tim). ${esc(d.name)} ligger i ${d.taxa.map(z=>`<span class="pill">Taxa ${z} · ${TAXA[z].pris} kr/tim</span>`).join('')} — sikta på de lägre zonerna.</p>
    ${taxaTable(d.taxa)}
    <p>💡 ${freeTimesLine(d.taxa)} ParkSpot visar zonen och tiden så du inte betalar i onödan.</p></section>
  ${d.seasonal ? `<section class="card"><h2>På sommaren: ännu fler platser</h2><p>I ${esc(d.name)} städas många gator bara vintertid (${SEASON}). På sommaren är de inte städgator — fler lediga, lagliga platser.</p></section>` : ''}
  ${garageSection(d, d.lat, d.lng)}`;
  const faq = [
    { q:`Var är parkering billigast i ${d.name}?`, a:`På gator i de lägre taxezonerna — ner mot <b>${pris} kr/tim</b>. ParkSpot färgar zonerna på kartan så du ser de billigaste direkt.` },
    { q:`När är parkering avgiftsfri i ${d.name}?`, a:`${hasFreeZone(d.taxa) ? 'Ofta kvällar, nätter och söndagar i de lägre zonerna. Obs: lördag 11–17 har avgift i Taxa 3–4 (Taxa 5 fritt).' : `Sällan – ${d.name} ligger i city-zoner (Taxa 1–2) med avgift dygnet runt.`} Kontrollera skylten; appen visar tiden.` },
    { q:`Är det gratis att parkera i ${d.name}?`, a:`${hasFreeZone(d.taxa) ? 'Sällan helt gratis dagtid, men ofta avgiftsfritt nattetid och söndagar i de lägre zonerna.' : `Nej – ${d.name} ligger i city-zoner (Taxa 1–2) med avgift dygnet runt.`} ParkSpot hjälper dig hitta det billigaste lagliga alternativet.` },
  ];
  const related = [
    { href:`parkering/${d.slug}`, text:`Parkering i ${d.name} (översikt)` },
    { href:`parkering-over-natten/${d.slug}`, text:`Parkering över natten i ${d.name}` },
    { href:`parkeringstaxor-stockholm`, text:`Alla taxor 1–5 förklarade` },
  ];
  emit(`billigare-parkering/${d.slug}`, layout({
    slug:`billigare-parkering/${d.slug}`, title:`Billigast parkering på ${d.name} – från ${pris} kr/tim`,
    desc:`Jämför taxezonerna i ${d.name}, från ${pris} kr/tim${hasFreeZone(d.taxa) ? ', och se när det är avgiftsfritt (kvällar, nätter och söndagar)' : ''}. Betala mindre för samma gata.`,
    h1:`Billigare parkering i ${d.name}`, lead:`Betala mindre i ${esc(d.name)}. Se vilka zoner som är billigast${hasFreeZone(d.taxa) ? ' och när det är avgiftsfritt' : ''} — direkt på kartan.`,
    sections, faq, related, lat:d.lat, lng:d.lng, match:d.match }));
}

function overNatten(d) {
  const sections = `
  <section class="card"><h2>Var står du tryggt över natten i ${esc(d.name)}?</h2>
    <p>Det säkra valet över natten är en gata <b>utan städgata imorgon</b> och utan parkeringsförbud. ParkSpot:s läge "Över natten" markerar dem gröna nära din adress.</p>
    <p>${d.seasonal ? `I ${esc(d.name)} städas många gator bara vintertid (${SEASON}) — på sommaren färre städgator, fler trygga nattplatser.` : `I ${esc(d.name)} städas gator året runt — kolla veckodagen så du inte vaknar till en bortbogserad bil.`}</p></section>
  <section class="card"><h2>Avgift på natten?</h2><p>${freeTimesLine(d.taxa)} ParkSpot visar zon och tid på kartan.</p></section>
  ${garageSection(d, d.lat, d.lng)}`;
  const faq = [
    { q:`Får man parkera över natten i ${d.name}?`, a:`Ja, på många gator. Det säkra är en gata utan städning imorgon och utan förbud — ParkSpot visar dem.` },
    { q:`Kostar det att stå över natten i ${d.name}?`, a:`${hasFreeZone(d.taxa) ? 'Ofta avgiftsfritt nattetid i de lägre zonerna (Taxa 3–5).' : `${d.name} ligger i city-zoner (Taxa 1–2) med avgift dygnet runt.`} Kontrollera skylten.` },
    { q:`Hur undviker jag städbil och böter på morgonen?`, a:`Välj en gata som inte städas imorgon bitti. ParkSpot:s "Över natten"-läge filtrerar bort morgondagens städgator${d.seasonal ? ' och vintergator som inte gäller på sommaren' : ''}.` },
  ];
  const related = [
    { href:`parkering/${d.slug}`, text:`Parkering i ${d.name} (översikt)` },
    { href:`stadgator/${d.slug}`, text:`Städgator i ${d.name}` },
    { href:`parkering-over-natten-stockholm`, text:`Parkera över natten i Stockholm (guide)` },
  ];
  emit(`parkering-over-natten/${d.slug}`, layout({
    slug:`parkering-over-natten/${d.slug}`, title:`Parkera över natten i ${d.name} – vad som gäller`,
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
  <section class="card"><h2>Kvällsknepet</h2><p>En gata som städas imorgon bitti är ofta ledig redan ikväll — nattparkerare undviker den. Perfekt för ett kvällsbesök i ${esc(d.name)}. Läget <b>Nu</b> visar direkt vilka gator som nyss städats eller snart städas.</p></section>`;
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
    slug:`stadgator/${d.slug}`, title:`Städgator på ${d.name} – vilka gator städas i morgon?`,
    desc:`Se morgondagens städgator på ${d.name}, gata för gata${d.seasonal ? ' och med rätt säsong (vinter '+SEASON+')' : ''}. Flytta bilen i tid och slipp böter.`,
    h1:`Städgator i ${d.name}`, lead:`Slipp städbil och böter. Se vilka gator i ${esc(d.name)} som städas imorgon — säsongssmart och live.`,
    sections, faq, related, lat:d.lat, lng:d.lng, match:d.match }));
}

function destination(x) {
  const gs = nearestGarages(x.lat, x.lng, 5, 1500);
  const inD = x.district ? DISTRICTS.find(d => d.slug === x.district) : null;
  const priceSection = inD ? `<section class="card"><h2>Vad kostar parkering vid ${esc(x.name)}?</h2>
    <p>${esc(x.name)} ligger i ${esc(inD.name)} – gatuparkering här är ${inD.taxa.map(z=>`<span class="pill">Taxa ${z} · ${TAXA[z].pris} kr/tim</span>`).join('')}. ${freeTimesLine(inD.taxa)} Garagen och parkeringsytorna har egna taxor som står utanför zonerna (se nedan).</p>${taxaTable(inD.taxa)}</section>` : '';
  const sections = `
  <section class="card"><h2>Parkera nära ${esc(x.name)}</h2>
    <p>Ska du till ${esc(x.what)}? Gatuparkering i området kan vara begränsad, särskilt sommartid. ParkSpot visar lagliga platser och pris på kartan — och närmaste garage om gatorna är fulla.</p>
    <a class="cta" href="/">📍 Se lediga platser nära ${esc(x.name)} →</a></section>
  ${x.note ? `<section class="card"><h2>Bra att veta inför besöket</h2><p>${x.note}</p></section>` : ''}
  ${priceSection}
  ${gs.length ? `<section class="card"><h2>🅿 Garage och parkeringsytor nära ${esc(x.name)}</h2>
    ${anlTabell(gs)}
    <p class="muted">Antal = kapacitet (ej live). Priset varierar över dygnet och visas i kartan. Kontrollera på plats.</p></section>` : ''}
  <section class="card"><h2>Tips för besöket</h2>
    <ul><li>Kolla städgator imorgon om du står över natten.</li><li>Kvällar, nätter och söndagar är ofta avgiftsfria i ytterzoner (lördag 11–17 har dock ofta avgift).</li><li>Kommer du på sommaren? Då vilar många vintergator — fler platser.</li></ul></section>`;
  const faq = [
    { q:`Var kan jag parkera nära ${x.name}?`, a:`På lagliga gatuplatser i området, eller i närmaste garage eller parkeringsyta (se ovan). ParkSpot visar var du får stå just nu.` },
    { q:`Finns parkeringshus nära ${x.name}?`, a:`${gs.length ? `Ja, närmast är ${esc(gs[0].name)} (${gs[0].sort === 'Yta' ? 'parkeringsyta' : 'garage'}, ${km(gs[0].d)}${gs[0].villkor && gs[0].villkor.maxtid ? `, ${esc(gs[0].villkor.maxtid.text)}` : ''}).` : 'Använd ParkSpot för att hitta närmaste anläggning.'}` },
    { q:`Är det svårt att parkera vid ${x.name} på sommaren?`, a:`Det kan vara fullt vid populära mål. ParkSpot visar lediga lagliga platser och garage som sista utväg.` },
  ];
  const related = [
    ...(inD ? [{ href:`parkering/${inD.slug}`, text:`Parkering i ${inD.name}` }] : []),
    { href:`parkering-nara/grona-lund`, text:`Parkering nära Gröna Lund` },
    { href:`sommar-parkering-stockholm`, text:`Sommarparkering i Stockholm` },
    { href:`parkeringshus-stockholm`, text:`Parkeringshus i Stockholm` },
  ].filter(r => r.href !== `parkering-nara/${x.slug}`);
  emit(`parkering-nara/${x.slug}`, layout({
    slug:`parkering-nara/${x.slug}`, title:kortTitel(`Parkering vid ${x.name} – pris, platser och garage`,
                    `Parkering vid ${x.name} – pris och garage`),
    desc:`Var du får stå närmast ${x.name}, vad timmen kostar och vilket garage som ligger närmast. Se lediga gator på kartan innan du åker.`,
    h1:`Parkering nära ${x.name}`, lead:`Ska du till ${esc(x.name)}? Hitta lagliga platser och närmaste garage — utan att cirkla.`,
    sections, faq, related, lat:x.lat, lng:x.lng, match:null,
    alts:[{lang:'sv',slug:`parkering-nara/${x.slug}`},{lang:'en',slug:`en/parking-near-${x.slug}`}] }));
}
function destinationEN(x) {
  const gs = nearestGarages(x.lat, x.lng, 5, 1500);
  const whatEN = { 'grona-lund':'the Gröna Lund amusement park on Djurgården', 'skansen':'the Skansen open-air museum on Djurgården',
    'djurgarden':'the museum island of Djurgården', 'stromkajen':'the archipelago boats at Strömkajen', 'langholmen':'the cliffs and park on Långholmen',
    'globen':'events and concerts at the Avicii Arena (Globen)', 'centralstationen':'Stockholm Central Station', 'slussen':'Slussen between Södermalm and Gamla Stan' }[x.slug] || x.name;
  const sections = `
  <section class="card"><h2>Parking near ${esc(x.name)}</h2>
    <p>Heading to ${whatEN}? On-street parking nearby can be limited, especially in summer. ParkSpot shows legal spots and the price on a map — plus the nearest garage if the streets are full.</p>
    <a class="cta" href="/">📍 See free spots near ${esc(x.name)} →</a></section>
  ${gs.length ? `<section class="card"><h2>🅿 Car parks near ${esc(x.name)}</h2>
    <table><tr><th>Car park</th><th>Type</th><th>Spaces</th><th>Max stay</th><th>Distance</th></tr>${gs.map(g=>`<tr><td>${esc(g.name)}</td><td class="muted">${g.sort === 'Yta' ? 'Surface' : 'Garage'}</td><td>${g.spaces}</td><td>${g.villkor && g.villkor.maxtid ? esc(g.villkor.maxtid.text.replace('max ','').replace(' tim',' h').replace(' dygn',' days')) : '<span class="muted">–</span>'}</td><td class="muted">${km(g.d)}</td></tr>`).join('')}</table>
    <p class="muted">Number = capacity (not live occupancy). Prices vary by time of day — see the map. Check the sign on site.</p></section>` : ''}
  <section class="card"><h2>Good to know</h2>
    <ul><li>Staying overnight? Check tomorrow's <b>cleaning day</b> ("städdag") — parking is banned then.</li>
    <li>Evenings, nights and Sundays are often free in outer zones (Saturday 11–17 usually has a charge).</li>
    <li>Visiting in summer? Many outer-area streets are cleaned in winter only — so there are often more free spots.</li></ul></section>`;
  const faq = [
    { q:`Where can I park near ${x.name}?`, a:`On legal street spots in the area or in the nearest garage (see above). ParkSpot shows where you may stand right now and the price.` },
    { q:`Is there a parking garage near ${x.name}?`, a:`${gs.length ? `Yes, e.g. ${esc(gs[0].name)} (${km(gs[0].d)}).` : 'Use ParkSpot to find the nearest garage.'}` },
    { q:`Is it hard to park near ${x.name} in summer?`, a:`It can be busy at popular sights. ParkSpot shows free legal spots and garages as a backup.` },
  ];
  const related = [
    { href:'parking-in-stockholm', text:'Parking in Stockholm — visitor’s guide' },
    { href:'en', text:'Parking near Stockholm’s sights (overview)' },
    { href:'parkeringshus-stockholm', text:'Parking garages in Stockholm' },
  ].filter(r => r.href !== `en/parking-near-${x.slug}`);
  emit(`en/parking-near-${x.slug}`, layout({
    slug:`en/parking-near-${x.slug}`, en:true,
    title:kortTitel(`Parking near ${x.name}, Stockholm: spots and garages`,
                    `Parking near ${x.name}: spots and garages`),
    desc:`Where to park near ${x.name} in Stockholm? See legal street spots, the price and the nearest parking garage. Drive calm — free live map.`,
    h1:`Parking near ${x.name}`, lead:`Driving to ${esc(x.name)}? Find legal spots and the nearest garage — without circling.`,
    sections, faq, related, lat:x.lat, lng:x.lng, match:null,
    alts:[{lang:'sv',slug:`parkering-nara/${x.slug}`},{lang:'en',slug:`en/parking-near-${x.slug}`}] }));
}
function englishHub() {
  const sections = `
  <section class="card"><h2>Parking near Stockholm’s sights</h2>
    <p>Driving to a popular destination? Pick your target below to see legal street parking, the price and the nearest garage.</p>
    ${linkList(DESTINATIONS.map(x => ({ href:`en/parking-near-${x.slug}`, text:`Parking near ${x.name}` })))}</section>
  <section class="card"><h2>More for visitors</h2>
    ${linkList([{ href:'parking-in-stockholm', text:'Parking in Stockholm — full visitor’s guide (prices, rules, map)' }, { href:'parkeringshus-stockholm', text:'Parking garages in Stockholm' }])}</section>`;
  const faq = [
    { q:'What is ParkSpot?', a:'A free live map that shows where you may legally park on the street in Stockholm — plus prices, street-cleaning days and overnight parking. Based on the City of Stockholm open data.' },
    { q:'Where can I park near Stockholm’s main sights?', a:'Choose a destination below — Gröna Lund, Skansen, Djurgården, Slussen, Centralstationen and more — to see legal streets, the price and the nearest garage.' },
    { q:'Does ParkSpot show real-time space availability?', a:'No — ParkSpot shows which streets are legal to park on right now, the price and cleaning days, based on official city data. It does not have sensors for individual parking spaces.' },
    { q:'Is ParkSpot free to use?', a:'Yes, completely free and no login required.' },
  ];
  emit('en', layout({
    slug:'en', en:true,
    title:'Parking in Stockholm: sights, prices and a free map',
    desc:'Visiting Stockholm by car? Find parking near Gröna Lund, Skansen, Djurgården and more — legal spots, prices (zones 1–5) and the nearest garage. Free live map.',
    h1:'Parking in Stockholm — for visitors', lead:'Stop circling. Find parking near the sights, prices and a live map of free legal spots.',
    sections, faq, related:null, lat:59.328, lng:18.09, match:['Norra Djurgården','Östermalm','Norrmalm'] }));
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
    slug:'sommar-parkering-stockholm', title:'Parkering i Stockholm i sommar – billigare zoner',
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
    <ul><li>Sikta på låga zoner (Taxa 4–5) i ytterstaden.</li><li>Kvällar, nätter och söndagar är ofta avgiftsfria. <b>Lördag 11–17 har dock avgift</b> i Taxa 1–4 (Taxa 5 fritt).</li><li>Boende kan ansöka om boendeparkering (rabatterat pris, se nedan).</li></ul>
    <p>ParkSpot färgar zonerna på kartan så du ser priset innan du parkerar.</p></section>
  <section class="card"><h2>Vad kostar boendeparkering?</h2>
    <p>Den som är folkbokförd i zonen och äger/leasar fordonet kan ansöka om boendeparkeringstillstånd:</p>
    ${boendeTable([1,2,3,4,5])}
    <p class="muted">${BOENDE_CAVEAT}</p></section>
  <section class="card"><h2>Pris per zon i detalj</h2>
    <p>Djupdyk i en specifik taxa – pris, tider och var den gäller:</p>
    ${linkList([1,2,3,4,5].map(z => ({ href:`parkeringstaxor-stockholm/taxa-${z}`, text:`Taxa ${z} – ${TAXA[z].pris} kr/tim` })))}</section>`;
  const faq = [
    { q:`Vad kostar Taxa 1, 2, 3, 4 och 5 i Stockholm?`, a:`Taxa 1: <b>55 kr/tim</b> · Taxa 2: <b>31 kr/tim</b> · Taxa 3: <b>20 kr/tim</b> · Taxa 4: <b>10 kr/tim</b> · Taxa 5: <b>5 kr/tim</b> (pris per timme, besöksparkering). Se tabellen ovan för exakta tider per zon.` },
    { q:`Vilken taxa är billigast – och vilken är dyrast?`, a:`Billigast är <b>Taxa 5</b> (5 kr/tim vardag 7–19, gratis övrig tid). Dyrast är <b>Taxa 1</b> (55 kr/tim dygnet runt i city).` },
    { q:`Finns det Taxa 6, 7, 8 eller 9 i Stockholm?`, a:`Nej – bilparkeringen i Stockholm har <b>taxa 1–5</b>. Det finns en lägre taxa för <b>motorcykel</b> (ca 2,50–13,75 kr/tim beroende på zon), som även gäller <b>moped klass 1</b>. Står du i en mc-ruta gäller mc-taxan.` },
    { q:`När är parkering avgiftsfri i Stockholm?`, a:`Ofta kvällar, nätter och söndagar utanför taxetiden, särskilt i lägre zoner. Obs: lördag 11–17 har avgift i Taxa 1–4 (Taxa 5 fritt). Kontrollera skylten.` },
    { q:`Vad kostar boendeparkering i Stockholm?`, a:`I Taxa 1–3: <b>90 kr/dygn</b> eller <b>1 600 kr/30 dagar</b>. Taxa 4: 35 kr/dygn eller 500 kr/30 dagar. Taxa 5: 20 kr/dygn eller 300 kr/30 dagar. Kräver folkbokföring och fordonsägande i zonen.` },
  ];
  const related = [
    { href:`billigare-parkering`, text:`Billigare parkering i Stockholm` },
    { href:`parkering`, text:`Parkering i Stockholm (alla stadsdelar)` },
    { href:`parkering-over-natten`, text:`Parkera över natten` },
  ];
  emit('parkeringstaxor-stockholm', layout({
    slug:'parkeringstaxor-stockholm', title:'Vad kostar parkering i Stockholm? 5–55 kr/tim per zon',
    desc:'Taxa 1: 55 kr/tim · Taxa 2: 31 · Taxa 3: 20 · Taxa 4: 10 · Taxa 5: 5 kr/tim. Se vilken zon som gäller på din gata, när det är gratis och vad mc kostar.',
    h1:'Parkeringstaxor i Stockholm – Taxa 1–5 (pris per timme)', lead:'Vad kostar det egentligen? Här är alla zoner och priser per timme — och hur du hittar de billigaste gatorna.',
    sections, faq, related, lat:null, lng:null, match:null }));
}

// Per-taxa-sidor: fokuserat svar på "taxa N stockholm pris" (snippet-vänligt). Undersidor till
// taxa-pelaren → matchar serverns SEO-route utan ändring. All data ur TAXA (sanning, ej gissat).
function taxaPage(n) {
  const t = TAXA[n], free = n >= 3;
  const inDistricts = DISTRICTS.filter(d => d.taxa.includes(n));
  const freeTxt = n >= 3
    ? (n === 5 ? 'Lördag, söndag och natt är det <b>gratis</b> – Taxa 5 är billigast.'
               : 'Söndag och natt är <b>avgiftsfritt</b> (men lördag 11–17 har avgift, vardag 7–19 avgift).')
    : 'Här gäller <b>avgift dygnet runt</b> – det blir aldrig gratis (city-zon).';
  const sections = `
  <section class="card"><h2>Vad kostar Taxa ${n} i Stockholm?</h2>
    <p><b>Taxa ${n} kostar ${t.pris} kr/tim</b> — ${t.txt}. ${freeTxt}</p>
    ${taxaTable([n])}
    <a class="cta" href="/">📍 Se var Taxa ${n} gäller på kartan →</a></section>
  <section class="card"><h2>Vad kostar boendeparkering i Taxa ${n}?</h2>
    <p>Den som är folkbokförd i zonen och äger/leasar fordonet kan ansöka om boendeparkeringstillstånd:</p>
    ${boendeTable([n])}
    <p class="muted">${BOENDE_CAVEAT}</p></section>
  <section class="card"><h2>Jämför med övriga zoner</h2>
    <p>Stockholm har fem bil-taxor: Taxa 1 dyrast (city), Taxa 5 billigast (ytterstad).</p>
    ${taxaTable([1,2,3,4,5])}
    <p class="muted">Motorcykel har egen, lägre taxa (serie 11–15).</p></section>
  ${inDistricts.length ? `<section class="card"><h2>Var i Stockholm gäller Taxa ${n}?</h2>
    <p>Stadsdelar som helt eller delvis ligger i Taxa ${n}:</p>
    ${linkList(inDistricts.slice(0, 12).map(d => ({ href:`parkering/${d.slug}`, text:`Parkering i ${d.name}` })))}
    <p class="muted">Exakt zon styrs av skylten – ParkSpot färgar zonen på kartan.</p></section>` : ''}`;
  const faq = [
    { q:`Vad kostar Taxa ${n} i Stockholm?`, a:`<b>${t.pris} kr/tim</b> — ${t.txt}.` },
    free
      ? { q:`När är Taxa ${n} gratis?`, a:`${n === 5 ? 'Lördag, söndag och natt (avgift bara vardag 7–19).' : 'Söndag och natt är avgiftsfritt; lördag 11–17 och vardag 7–19 har avgift.'} Kontrollera alltid skylten.` }
      : { q:`Är Taxa ${n} någonsin gratis?`, a:`Nej – Taxa ${n} ligger i city och har <b>avgift dygnet runt</b>. Kontrollera skylten.` },
    { q:`Vilken taxa är billigast respektive dyrast?`, a:`Billigast är <b>Taxa 5</b> (5 kr/tim), dyrast är <b>Taxa 1</b> (55 kr/tim, dygnet runt).` },
    { q:`Vad kostar boendeparkering i Taxa ${n}?`, a:`<b>${t.boendeDygn} kr/dygn</b> eller <b>${t.boendeMan} kr/30 dagar</b> (MC: ${t.boendeMcDygn} kr/dygn · ${t.boendeMcMan} kr/30 dagar). Kräver folkbokföring och fordonsägande i zonen – går inte att köpa spontant som besökare.` },
  ];
  const related = [
    { href:`parkeringstaxor-stockholm`, text:`Alla parkeringstaxor (Taxa 1–5)` },
    ...(n > 1 ? [{ href:`parkeringstaxor-stockholm/taxa-${n-1}`, text:`Taxa ${n-1} (dyrare zon)` }] : []),
    ...(n < 5 ? [{ href:`parkeringstaxor-stockholm/taxa-${n+1}`, text:`Taxa ${n+1} (billigare zon)` }] : []),
    { href:`billigare-parkering`, text:`Billigare parkering i Stockholm` },
  ];
  emit(`parkeringstaxor-stockholm/taxa-${n}`, layout({
    slug:`parkeringstaxor-stockholm/taxa-${n}`,
    title:`Taxa ${n} Stockholm: ${t.pris} kr/tim – tider och karta | ParkSpot`,
    desc:`${t.txt}. Se var Taxa ${n} gäller på kartan${free ? ' och när det är gratis' : ''}, och vad zonerna intill kostar.`,
    h1:`Taxa ${n} i Stockholm – ${t.pris} kr/tim`,
    lead:`Vad kostar Taxa ${n}? Här är priset, tiderna och var zonen gäller — plus en karta som visar den live.`,
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
  <section class="card"><h2>Kvällsknepet</h2><p>En gata som städas imorgon bitti är ofta ledig redan ikväll — perfekt för kvällsbesök. Läget <b>Nu</b> visar direkt vilka gator som nyss städats eller snart städas, så du hittar dem.</p></section>`;
  const faq = [
    { q:`Hur vet jag vilka gator som städas imorgon?`, a:`ParkSpot visar morgondagens städgator live på kartan, säsongsjusterat.` },
    { q:`Varför står det att en gata inte städas fast skylten säger städdag?`, a:`Troligen säsong: gatan städas bara ${SEASON}. Utanför den perioden gäller den inte. Kontrollera alltid skylten.` },
    { q:`Vad kostar en felparkering på en städgata?`, a:`Böter (kontrollavgift) och risk för bogsering. Det lönar sig att kolla först.` },
    framatFaq('stockholm'),
  ];
  const related = [
    { href:`parkering-over-natten-stockholm`, text:`Parkera över natten i Stockholm` },
    { href:`sommar-parkering-stockholm`, text:`Sommarparkering – när vintergatorna vilar` },
    { href:`parkeringstaxor-stockholm`, text:`Taxor 1–5` },
  ];
  emit('stadgator-stockholm', layout({
    slug:'stadgator-stockholm', title:'Städdagar i Stockholm – så funkar de, gata för gata',
    desc:`Så fungerar städgatorna: tider, säsonger (vinter ${SEASON}) och vad som händer om bilen står kvar. Se morgondagens städning live på kartan.`,
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
    framatFaq('stockholm'),
  ];
  const related = [
    { href:`stadgator-stockholm`, text:`Städgator i Stockholm` },
    { href:`parkeringstaxor-stockholm`, text:`Taxor 1–5` },
    { href:`sommar-parkering-stockholm`, text:`Sommarparkering` },
  ];
  emit('parkering-over-natten-stockholm', layout({
    slug:'parkering-over-natten-stockholm', title:'Parkera över natten i Stockholm – vad som gäller',
    desc:'Var får du stå över natten i Stockholm utan städgata, förbud eller böter? ParkSpot visar trygga nattgator nära dig. Sov lugnt.',
    h1:'Parkera över natten i Stockholm', lead:'Sov lugnt — bilen står rätt. Hitta trygga nattgator utan städning eller förbud imorgon bitti.',
    sections, faq, related, lat:59.331, lng:18.064, match:['Södermalm','Östermalm','Kungsholmen','Vasastaden','Norrmalm'] }));
}

function pillarGarages() {
  const top = GARAGES.slice().sort((a,b)=>b.spaces-a.spaces).slice(0, 12);
  const ytor   = GARAGES.filter(g => g.sort === 'Yta');
  const medMax = GARAGES.filter(g => g.villkor && g.villkor.maxtid);
  const sections = `
  <section class="card"><h2>Parkeringshus och parkeringsytor – sista utväg när gatan är full</h2>
    <p>När gatorna är fulla finns ${GARAGES.length} publika besöksanläggningar i Stockholms stads öppna data: ${GARAGES.length - ytor.length} parkeringshus och ${ytor.length} parkeringsytor. Ytorna ligger till stor del i ytterstaden, där det ofta inte finns något garage alls. ParkSpot visar den närmaste med kapacitet och aktuellt pris — direkt i kartan.</p></section>
  ${top.length ? `<section class="card"><h2>Några av de största besöksanläggningarna</h2>
    <table><tr><th>Anläggning</th><th>Typ</th><th>Besöksplatser</th><th>Villkor</th></tr>${top.map(g=>`<tr><td>${esc(g.name)}</td><td class="muted">${g.sort}</td><td>${g.spaces}</td><td>${villkorCell(g)}</td></tr>`).join('')}</table>
    <p class="muted">Antal = kapacitet (ej live-beläggning). Kontrollera på plats.</p></section>` : ''}
  <section class="card"><h2>Tidsgräns – ${medMax.length} anläggningar har en</h2>
    <p>På ${medMax.length} av anläggningarna publicerar staden en <b>längsta tillåtna parkeringstid</b>, från 30 minuter till flera dygn. Den syns i ParkSpot på både listan och platskortet, så att du vet innan du kör. Övriga anläggningar publicerar ingen gräns — det betyder inte att det säkert saknas en, bara att den inte står i datan. Skylten på plats gäller alltid.</p></section>`;
  const faq = [
    { q:`Hur hittar jag närmaste parkeringshus i Stockholm?`, a:`ParkSpot visar närmaste publika besöksanläggning — parkeringshus eller parkeringsyta — med kapacitet, pris och eventuell tidsgräns när du söker en plats.` },
    { q:`Vad är skillnaden på parkeringshus och parkeringsyta?`, a:`Ett parkeringshus är ett garage eller p-däck, en parkeringsyta är en öppen asfaltsyta. Båda ligger utanför gatumarken och har egen taxa. I Stockholms ytterstad är ytorna ofta det enda alternativet till gatan.` },
    { q:`Finns det en tidsgräns i parkeringshusen?`, a:`På ${medMax.length} av anläggningarna publicerar staden en längsta parkeringstid, och den visar ParkSpot. Saknas uppgiften vet vi inte om en gräns finns — läs skylten på plats.` },
    { q:`Visar ParkSpot lediga platser i realtid i p-hus?`, a:`Vi visar anläggningens kapacitet och läge ur öppna data. Live-beläggning finns inte öppet — kontrollera på plats.` },
  ];
  const related = [
    { href:`parkering-nara/grona-lund`, text:`Parkering nära Gröna Lund` },
    { href:`sommar-parkering-stockholm`, text:`Sommarparkering` },
  ];
  // SLUGGEN RÖRS INTE. `parkeringshus-stockholm` är indexerad sedan juni och ligger
  // i sju interna länkar; rubriken får bli bredare, adressen får inte byta.
  emit('parkeringshus-stockholm', layout({
    slug:'parkeringshus-stockholm', title:'Parkeringshus i Stockholm – pris, platser och maxtid',
    desc:'Närmaste garage eller parkeringsyta när gatan är full: antal platser, pris per timme och hur länge du får stå. Alla anläggningar på kartan.',
    h1:'Parkeringshus och parkeringsytor i Stockholm',
    lead:'Gatan full? Hitta närmaste anläggning — ParkSpot visar kapacitet, pris och tidsgräns.',
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
  <section class="card"><h2>Heading to the sights?</h2>
    <ul>${DESTINATIONS.map(x => `<li><a href="/en/parking-near-${x.slug}">Parking near ${esc(x.name)}</a></li>`).join('')}</ul>
    <p class="muted">Tip: in summer many outer-area streets are not cleaned (winter only, 1 Nov–15 May) — so there are often more free spots.</p></section>
  ${garageSection({ name:'Stockholm' }, 59.331, 18.064)}`;
  const faq = [
    { q:'Where can I park in central Stockholm as a tourist?', a:'On legal street spots (pay by zone) or in a parking garage. ParkSpot shows where you may stand right now, the price, and the nearest garage.' },
    { q:'How much is parking in Stockholm?', a:'From 5 SEK/hour (zone 5, outer) to 55 SEK/hour (zone 1, city centre). Evenings and weekends are often free.' },
    { q:'What is a "städdag" / cleaning day?', a:'A weekly day when a street is cleaned and parking is banned. Parking on a cleaning day risks a fine and towing — ParkSpot shows tomorrow’s cleaning streets.' },
    { q:'Can I park overnight in Stockholm?', a:'Yes, on many streets and often free at night — as long as the street is not cleaned the next morning. ParkSpot highlights safe overnight streets.' },
    { q:'Is parking free on Sundays in Stockholm?', a:'In many zones yes — tariff zones 3–5 are usually free on Sundays and at night (note: Saturday 11–17 is charged in zones 3–4; zone 5 is free). City zones (1–2) charge around the clock. Always check the sign.' },
    { q:'Is ParkSpot free?', a:'Yes, free and no login. It is based on the City of Stockholm open data.' },
  ];
  const related = [
    { href:'en', text:'Parking near Stockholm’s sights (overview)' },
    { href:'en/parking-near-grona-lund', text:'Parking near Gröna Lund' },
    { href:'en/parking-near-skansen', text:'Parking near Skansen' },
    { href:'parkeringshus-stockholm', text:'Parking garages in Stockholm' },
  ];
  emit('parking-in-stockholm', layout({
    slug:'parking-in-stockholm', en:true,
    title:'Parking in Stockholm: prices, rules and a free map',
    desc:'What it costs (5–55 SEK/hour), how street cleaning works, and where to park near Gamla Stan, Skansen and Gröna Lund. Live map, no sign-up, no app.',
    h1:'Parking in Stockholm — a visitor’s guide',
    lead:'Stop circling. Know where you can park — before you drive. Prices, rules and a live map that shows free legal spots near you.',
    sections, faq, related, lat:59.331, lng:18.064, match:['Norrmalm','Östermalm','Södermalm','Vasastaden','Kungsholmen','Gamla Stan'] }));
}

// ── Kategori-hubbar (index per kategori → samlar under-sidorna, fixar 404) ────
function linkList(items) {
  return `<ul class="hublist">${items.map(i => `<li><a href="/${i.href}">${esc(i.text)}</a></li>`).join('')}</ul>`;
}
function categoryHub({ slug, title, desc, h1, lead, intro, areaH, areaItems, moreItems, related, match, lat, lng, faq }) {
  const sections = intro
    + `<section class="card"><h2>${esc(areaH)}</h2>${linkList(areaItems)}</section>`
    + (moreItems ? `<section class="card"><h2>Mer om parkering i Stockholm</h2>${linkList(moreItems)}</section>` : '');
  emit(slug, layout({ slug, title, desc, h1, lead, sections, faq, related, match, lat, lng }));
}
function pillarHubs() {
  const all = DISTRICTS;
  // 1) Parkering i Stockholm – bred ingångssida
  categoryHub({
    slug:'parkering',
    title:'Parkering i Stockholm – karta över var du får stå nu',
    desc:'Live-karta med lagliga platser, pris per zon och morgondagens städgator. Välj din stadsdel och se var bilen står lagligt just nu.',
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
    match:['Södermalm','Östermalm','Kungsholmen','Vasastaden','Norrmalm'], lat:59.331, lng:18.064,
    faq:[
      { q:'Hur funkar parkering i Stockholm?', a:'Tre saker styr: <b>taxezon</b> (pris, Taxa 1–5), <b>städdag</b> (veckodag med parkeringsförbud för städning) och eventuellt <b>parkeringsförbud</b>. ParkSpot visar alla tre på kartan.' },
      { q:'Täcker ParkSpot hela Stockholm?', a:'ParkSpot täcker Stockholms stad där Stockholms öppna data finns — välj din stadsdel nedan för pris, städdag och nattparkering.' },
      { q:'Är parkering i Stockholm gratis?', a:'Sällan helt gratis dagtid i innerstan (Taxa 1–2 har avgift dygnet runt), men ofta avgiftsfritt kvällar, nätter och söndagar i de lägre zonerna (Taxa 3–5).' },
      { q:'Var får jag parkera med MC eller moped klass 1 i Stockholm?', a:'Motorcykel och moped klass 1 räknas i Stockholms trafikföreskrifter som samma fordonskategori – båda får parkera på dedikerade MC-rutor och på vanliga bilplatser. Öppna ParkSpots karta och välj MC-läget för lagliga platser, städdagar och pris i realtid.' },
    ] });
  // 2) Billigare parkering
  categoryHub({
    slug:'billigare-parkering',
    title:'Billigast parkering i Stockholm – zon för zon',
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
    match:['Hägersten','Aspudden','Midsommarkransen','Bromma','Årsta'], lat:59.301, lng:18.012,
    faq:[
      { q:'Var är parkering billigast i Stockholm?', a:'I ytterstadens zoner, ner mot <b>5 kr/tim (Taxa 5)</b>. Dyrast är city (Taxa 1, 55 kr/tim). ParkSpot färgar zonerna på kartan så du ser priset innan du parkerar.' },
      { q:'Är innerstaden alltid dyrast?', a:'Ja — Taxa 1–2 (city) har avgift dygnet runt, ingen gratistid. Ytterzonerna (Taxa 3–5) har ofta avgiftsfria kvällar, nätter och söndagar.' },
      { q:'Kan jag få rabatt som boende?', a:'Den som är folkbokförd och äger/leasar fordonet i zonen kan ansöka om boendeparkeringstillstånd — går inte att köpa spontant som besökare.' },
    ] });
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
    match:null, lat:null, lng:null,
    faq:[
      { q:'Vilka mål har ParkSpot parkeringsguider för?', a:'Bland annat Gröna Lund, Skansen, Djurgården, Globen, Slussen och Centralstationen — välj mål nedan för pris, lagliga gator och närmaste garage.' },
      { q:'Är det svårt att hitta parkering vid populära mål?', a:'Ofta ja, särskilt kvällar och sommarhalvåret vid Djurgården-området. ParkSpot visar lediga lagliga gator och närmaste parkeringshus som reserv.' },
      { q:'Vad gör jag om gatorna vid målet är fulla?', a:'ParkSpot visar närmaste publika besöksgarage med kapacitet direkt på kartan.' },
    ] });
  // 4) Städgator (index per stadsdel) – väver in "servicedag"-synonymen
  categoryHub({
    slug:'stadgator',
    title:'Städgator Stockholm – karta över morgondagens städning',
    desc:'Vilka gator städas i morgon? Se morgondagens städgator stadsdel för stadsdel, med rätt säsong (vinter 1 nov–15 maj). Flytta bilen i tid.',
    h1:'Städgator i Stockholm – per stadsdel',
    lead:'Slipp städbil och böter. Se vilka gator som städas imorgon – välj din stadsdel.',
    intro:`<section class="card"><h2>Städgator &amp; servicedagar – så funkar det</h2><p>Varje gata har en <b>städdag</b> (kallas även <b>servicedag</b>) – en veckodag då parkering är förbjuden för gatustädning. Står du fel blir det böter och ibland bogsering. Många gator i ytterstaden gäller <b>bara vintertid (${SEASON})</b>. ParkSpot visar morgondagens städgator live och säsongssmart.</p>
      <p><a href="/stadgator-stockholm">Läs hela guiden om städgator i Stockholm →</a></p></section>`,
    areaH:'Städgator stadsdel för stadsdel',
    areaItems: all.map(d => ({ href:`stadgator/${d.slug}`, text:`Städgator i ${d.name}` })),
    moreItems:[{href:'stadgator-stockholm',text:'Städgator – komplett guide'},{href:'parkering-over-natten',text:'Parkering över natten'},{href:'sommar-parkering-stockholm',text:'Sommarparkering'}],
    related:[{href:'stadgator-stockholm',text:'Städgator i Stockholm (guide)'}],
    match:['Södermalm','Östermalm','Kungsholmen','Vasastaden','Norrmalm'], lat:59.331, lng:18.064,
    faq:[
      { q:'Vad är skillnaden på städdag och servicedag?', a:'Samma sak — två namn för samma veckodag då en gata städas och parkering är förbjuden.' },
      { q:'Städas alla stadsdelar i Stockholm likadant?', a:`Nej. Innerstan städas oftast året runt, medan många gator i ytterstaden bara gäller vintertid (${SEASON}) — på sommaren är de inte städgator.` },
      { q:'Var hittar jag städdagen för min gata?', a:'Välj din stadsdel nedan, eller sök gatan direkt i appen — ParkSpot visar morgondagens städgator live.' },
    ] });
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
    match:['Södermalm','Östermalm','Kungsholmen','Vasastaden','Norrmalm'], lat:59.331, lng:18.064,
    faq:[
      { q:'Är det säkert att parkera över natten i alla stadsdelar?', a:'Det säkra valet är alltid detsamma oavsett stadsdel: en gata utan städgata imorgon och utan parkeringsförbud. ParkSpot markerar dem gröna i läget "Över natten".' },
      { q:'Skiljer sig risken mellan innerstan och ytterstad på natten?', a:'Ja — ytterstadens städgator är ofta säsongsbundna (vinter) och vilar på sommaren, medan innerstan oftast städas året runt.' },
      { q:'Kostar det att stå över natten?', a:'Ofta avgiftsfritt nattetid i de lägre zonerna (Taxa 3–5). Taxa 1–2 (city) har avgift dygnet runt.' },
    ] });
}

// ── Gatu-sidor ───────────────────────────────────────────────────────────────
// Live-widget: hela veckans städschema för EN gata (matchar STREET_NAME, alla veckodagar).
function streetCleaningWidget(name) {
  const nameJson = JSON.stringify(name.toLowerCase());
  return `<section class="card">
  <h2>🧹 När städas ${esc(name)}?</h2>
  <p class="muted">Live ur Stockholms öppna data, säsongsjusterat (vintergator ur säsong räknas bort).</p>
  <div class="live" id="live">Hämtar…</div>
  <p style="margin-top:8px"><a href="/">Se ${esc(name)} på kartan →</a></p>
  <script>(function(){
    var street=${nameJson};
    var API=["söndag","måndag","tisdag","onsdag","torsdag","fredag","lördag"];
    var now=new Date();
    function active(p){if(p.START_MONTH==null)return true;var md=function(m,dd){return m*100+(dd||1)};var cur=md(now.getMonth()+1,now.getDate());var a=md(p.START_MONTH,p.START_DAY),b=md(p.END_MONTH,p.END_DAY);return a<=b?(cur>=a&&cur<=b):(cur>=a||cur<=b);}
    function fc(t){t=+t||0;var h=Math.floor(t/100),m=t%100;return (h<10?'0':'')+h+(m?':'+(m<10?'0':'')+m:'');}
    var el=document.getElementById("live");
    Promise.all(API.map(function(day){return fetch("/proxy/servicedagar/weekday/"+encodeURIComponent(day)+"?outputFormat=json").then(function(r){return r.json();}).then(function(j){return {day:day,feats:(Array.isArray(j)?j:(j.features||[]))};}).catch(function(){return {day:day,feats:[]};});})).then(function(all){
      var rows=[],seen={};
      all.forEach(function(o){o.feats.forEach(function(x){var p=x.properties||{};if((p.STREET_NAME||"").toLowerCase()!==street)return;if(!active(p))return;var k=o.day+"_"+p.START_TIME+"_"+p.END_TIME;if(seen[k])return;seen[k]=1;rows.push({day:o.day,s:p.START_TIME,e:p.END_TIME});});});
      if(!rows.length){el.innerHTML='<p class="green">Ingen registrerad städdag på '+street+' just nu (säsong kan påverka) — kontrollera alltid skylten.</p>';return;}
      el.innerHTML=rows.map(function(w){return '<div class="row"><span class="nm">'+w.day.charAt(0).toUpperCase()+w.day.slice(1)+'</span> <span>'+fc(w.s)+'–'+fc(w.e)+'</span></div>';}).join('');
    }).catch(function(){el.innerHTML='<p class="muted">—</p>';});
  })();</script></section>`;
}
function streetPage(s) {
  const cheapest = Math.max(...s.taxa), pris = TAXA[cheapest].pris;
  const siblings = STREETS.filter(x => x.districtSlug === s.districtSlug && x.slug !== s.slug).slice(0, 4);
  const sections = `
  ${streetCleaningWidget(s.name)}
  <section class="card"><h2>Vad kostar det att parkera på ${esc(s.name)}?</h2>
    <p>${esc(s.name)} ligger i ${esc(s.districtName)} – ${s.taxa.map(z=>`<span class="pill">Taxa ${z} · ${TAXA[z].pris} kr/tim</span>`).join('')}. Exakt pris och tid styrs av skylten; ParkSpot visar zonen direkt på kartan.</p>
    ${taxaTable(s.taxa)}
    <p class="muted">💡 ${freeTimesLine(s.taxa)}</p></section>
  <section class="card"><h2>Parkera över natten på ${esc(s.name)}</h2>
    <p>Vill du stå över natten? Det säkra är att gatan <b>inte städas imorgon bitti</b> och saknar parkeringsförbud. ParkSpot:s läge "Över natten" visar om ${esc(s.name)} är ett tryggt val just ikväll.</p></section>
  ${garageSection({ name:s.name }, s.lat, s.lng)}`;
  const faq = [
    { q:`Får man parkera på ${s.name}?`, a:`Ja, på de delar utan parkeringsförbud. Pris enligt zon (${s.taxa.map(z=>'Taxa '+z).join('/')}). Kontrollera skylten och städdagen — ParkSpot visar allt på kartan.` },
    { q:`Vad kostar parkering på ${s.name}?`, a:`Från cirka <b>${pris} kr/tim</b> (${s.taxa.map(z=>'Taxa '+z).join('/')}). ${hasFreeZone(s.taxa) ? 'Ofta avgiftsfritt kvällar, nätter och söndagar i de lägre zonerna.' : 'Avgift dygnet runt i city-zonerna (Taxa 1–2) – kontrollera skylten.'}` },
    { q:`Vilken städdag har ${s.name}?`, a:`Det visas live i rutan ovan (veckodag + tid), säsongsjusterat. Står du på städdagen riskerar du böter och bogsering.` },
    { q:`Får man stå över natten på ${s.name}?`, a:`Ofta ja, om gatan inte städas imorgon bitti och saknar förbud. Använd läget "Över natten" i ParkSpot.` },
  ];
  const related = [
    { href:`parkering/${s.districtSlug}`, text:`Parkering i ${s.districtName} (översikt)` },
    { href:`stadgator/${s.districtSlug}`, text:`Städgator i ${s.districtName}` },
  ].concat(siblings.map(x => ({ href:`parkering/${x.slug}`, text:`Parkering på ${x.name}` })));
  emit(`parkering/${s.slug}`, layout({
    slug:`parkering/${s.slug}`,
    title:kortTitel(`Parkering på ${s.name}, ${s.districtName} – pris och städdag`,
                    `Parkering på ${s.name} – pris och städdag`),
    desc:`Var får du parkera på ${s.name} i ${s.districtName}? Se pris (Taxa ${s.taxa.join('/')}), vilken dag gatan städas och om du får stå över natten. Gratis live-karta.`,
    h1:`Parkering på ${s.name}`,
    lead:`Ska du parkera på ${esc(s.name)} i ${esc(s.districtName)}? Se pris, städdag och nattparkering — plus en live-karta som visar lediga platser.`,
    sections, faq, related, lat:s.lat, lng:s.lng, match:null }));
}

// ── Generera ─────────────────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ── Om ParkSpot – entitetssida (talar om för AI/Google VAD ParkSpot är) ──────
function aboutPage() {
  const sections = `
  <section class="card"><h2>Vad är ParkSpot?</h2>
    <p><b>ParkSpot</b> är en <b>gratis webb-app</b> som visar var du får <b>parkera lagligt i Stockholm</b> – just nu eller över natten. Appen färgar gatorna på en karta efter om du får stå, visar <b>pris per taxazon (Taxa 1–5)</b>, <b>städdagar per gata</b> och när det är <b>gratis eller avgiftsfritt</b>. Utöver bil finns egna lägen för <b>motorcykel (även moped klass 1), cykel/moped klass 2 och rörelsehindrade med parkeringstillstånd</b>. Allt bygger på <b>Stockholms stads öppna data</b>.</p>
    <a class="cta" href="/">📍 Öppna kartan →</a></section>
  <section class="card"><h2>Vad gör ParkSpot unikt?</h2>
    <ul>
      <li><b>Städdagar per gata</b> – se exakt vilken veckodag och tid en specifik gata servas, säsongsjusterat.</li>
      <li><b>Två lägen</b> – Nu (inklusive vad som händer snart) och Över natten – anpassat efter när du parkerar.</li>
      <li><b>Framme om 30 eller 60 minuter</b> – se kartan som den blir när du är framme, inte som den är nu. Gator som hunnit öppna lyser upp, gator som hunnit stängas blir röda.</li>
      <li><b>Fyra fordonstyper</b> – bil, motorcykel (även moped klass 1), cykel/moped klass 2 och rörelsehindrade med parkeringstillstånd, varje med egna platser och regler.</li>
      <li><b>Pris innan du parkerar</b> – taxazonen visas direkt på kartan.</li>
      <li><b>Ingen inloggning, inga konton – helt gratis.</b></li>
    </ul></section>
  <section class="card"><h2>ParkSpot vs andra parkeringsappar</h2>
    <p>ParkSpot <b>tar inte betalt för parkering</b> och ersätter inte betal-appar som EasyPark eller Parkster. ParkSpot svarar på en annan fråga: <b>var får jag stå – lagligt, billigt och utan att bli bogserad?</b> Själva betalningen sköter du som vanligt.</p>
    <p class="muted">Obs: ParkSpot Stockholm är en tjänst för <b>gatuparkering i Stockholm</b> och är inte kopplad till flygplatsparkeringstjänster med liknande namn i andra länder.</p></section>
  <section class="card"><h2>Datakälla &amp; ansvar</h2>
    <p>ParkSpot bygger på <b>Stockholms stads öppna data</b> (parkeringsregler, servicedagar, taxazoner). Data kan vara inaktuell eller ha luckor – <b>kontrollera alltid skylten på plats</b>. ParkSpot ansvarar inte för p-böter eller bogsering.</p></section>`;
  const faq = [
    { q:'Vad är ParkSpot?', a:'En gratis webb-app som visar var du får parkera lagligt i Stockholm – pris per zon, städdagar per gata och nattparkering – på en live-karta, baserat på Stockholms stads öppna data.' },
    { q:'Fungerar ParkSpot för MC, moped och rörelsehindrade?', a:'Ja. Utöver bil har ParkSpot egna lägen för motorcykel (samma läge gäller moped klass 1), cykel/moped klass 2 och rörelsehindrade med parkeringstillstånd – varje läge visar de platser och regler som gäller just det fordonet.' },
    { q:'Är ParkSpot gratis?', a:'Ja, helt gratis och utan inloggning. ParkSpot tar inte betalt och visar ingen reklam för parkering.' },
    { q:'Vilken data bygger ParkSpot på?', a:'Stockholms stads öppna data: parkeringsregler, servicedagar (städdagar) och taxazoner. Kontrollera alltid skylten på plats.' },
    { q:'Vad skiljer ParkSpot från EasyPark och Parkster?', a:'De är betal-appar för själva avgiften. ParkSpot visar i stället VAR du får stå lagligt, vad det kostar och när det städas – du betalar som vanligt via din vanliga app.' },
    { q:'Täcker ParkSpot hela Stockholm?', a:'ParkSpot täcker Stockholms stad där öppna data finns – från innerstaden (Taxa 1–2) till ytterområden (Taxa 4–5).' },
    framatFaq('stockholm'),
  ];
  const related = [
    { href:'parkeringstaxor-stockholm', text:'Stockholms parkeringstaxor (Taxa 1–5)' },
    { href:'stadgator-stockholm', text:'Städgator i Stockholm' },
    { href:'parkering-over-natten-stockholm', text:'Parkera över natten' },
    { href:'parking-in-stockholm', text:'Parking in Stockholm (English)' },
    // Enda länken från Stockholms sidor till Göteborg. Utan en intern länk är de nya
    // sidorna föräldralösa: sitemap räcker för att bli hittad, men indexeras långsamt.
    // Om-sidan är rätt ställe – det är där tjänsten beskrivs som helhet.
    { href:'parkering-goteborg', text:'Parkering i Göteborg' },
    { href:'parkering-uppsala', text:'Parkering i Uppsala' },
    { href:'parkering-karlstad', text:'Parkering i Karlstad' },
  ];
  const extraLd = { '@context':'https://schema.org', '@graph':[
    // SYSKONMODELLEN (Lars beslut 2026-08-28): 'ParkSpot' är moderorganisationen och
    // betjänar båda städerna. 'ParkSpot Stockholm' och 'ParkSpot Göteborg' är sajt-
    // identiteterna, alltså syskon – inte två organisationer. Ett nationellt varumärke
    // valdes bort för att 212 sidor redan rankar på det gamla namnet; additivt före
    // omskrivning. Ändra inte det här utan att fråga.
    { '@type':'Organization', '@id':`${SITE}/#organization`, name:'ParkSpot', alternateName:['ParkSpot Stockholm','ParkSpot Göteborg','ParkSpot Uppsala','ParkSpot Karlstad'], url:SITE, logo:`${SITE}/og-image-v2.png`,
      description:'ParkSpot är en gratis svensk webb-app som visar var du får parkera lagligt i Stockholm – för bil, motorcykel, cykel/moped och rörelsehindrade. Pris per taxazon, städdagar per gata, gratis- och nattparkering – baserat på Stockholms stads öppna data.',
      areaServed:[{ '@type':'City', name:'Stockholm', sameAs:'https://sv.wikipedia.org/wiki/Stockholm' },
                  { '@type':'City', name:'Göteborg', sameAs:'https://sv.wikipedia.org/wiki/G%C3%B6teborg' },
                  { '@type':'City', name:'Uppsala', sameAs:'https://sv.wikipedia.org/wiki/Uppsala' },
                  { '@type':'City', name:'Karlstad', sameAs:'https://sv.wikipedia.org/wiki/Karlstad' }] },
    { '@type':'WebApplication', '@id':`${SITE}/#app`, name:'ParkSpot Stockholm', alternateName:'ParkSpot', url:SITE,
      applicationCategory:'TravelApplication', applicationSubCategory:'Parking', operatingSystem:'Web', inLanguage:'sv', isAccessibleForFree:true,
      offers:{ '@type':'Offer', price:'0', priceCurrency:'SEK' }, areaServed:[{ '@type':'City', name:'Stockholm' },{ '@type':'City', name:'Göteborg' },{ '@type':'City', name:'Uppsala' },{ '@type':'City', name:'Karlstad' }], publisher:{ '@id':`${SITE}/#organization` },
      description:'Visar var du får parkera lagligt just nu i Stockholm – för bil, motorcykel, cykel/moped och rörelsehindrade. Pris per zon, städdagar per gata, gratis- och nattparkering. Gratis, ingen inloggning.' } ] };
  emit('om-parkspot', layout({
    slug:'om-parkspot', title:'Om ParkSpot – gratis parkeringsapp för Stockholm | ParkSpot',
    desc:'Vad är ParkSpot? Gratis app som visar var du får parkera lagligt i Stockholm – bil, MC, moped, rörelsehindrade. Pris, städdagar och nattparkering.',
    h1:'Om ParkSpot', lead:'ParkSpot är en gratis app som visar var du får parkera lagligt i Stockholm – för bil, MC, cykel/moped och rörelsehindrade, nu eller över natten. Här förklarar vi vad appen gör och varför.',
    sections, faq, related, lat:null, lng:null, match:null, extraLd }));
}

// ═══════════════════════════════════════════════════════════════════════════
// KARLSTAD
// ═══════════════════════════════════════════════════════════════════════════
// Tre sidor, additiva som Uppsalas. Siffrorna ur seo/karlstad.json, uppmätt genom
// cities/karlstad.js av verktyg/bygg-karlstad-seo.js. ⚠ TRE SAKER SOM MÅSTE STÅ:
//   1. Servicedagarna ÄR ett skyltat parkeringsförbud – Karlstads starkaste sida.
//   2. De gäller INTE på röda dagar (kommunens egna ord). Stockholms gör det.
//   3. Inga andra parkeringsförbud i datan, och ingen tidsgräns på nära hälften.
const KSD = { namn: 'ParkSpot Karlstad', relText: 'Mer om parkering i Karlstad', karta: '/?stad=karlstad' };
const KSD_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'karlstad.json'), 'utf8'));
const KSD_FORBEHALL = 'Karlstads kommun publicerar inga parkeringsförbud utöver servicedagarna, och inga platser för motorcykel eller rörelsehindrade som sträckor. En gata utan färg i ParkSpot betyder därför «ingen uppgift», inte «fritt». Kontrollera alltid skylten.';
const ksdTal = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const KSD_GRANS = Object.fromEntries(KSD_DATA.granser.map(g => [g.namn, g.antal]));

function ksdRelated(utom) {
  return [
    { href:'parkering-karlstad', text:'Parkering i Karlstad – översikt' },
    { href:'parkeringsavgifter-karlstad', text:'Vad kostar parkering i Karlstad?' },
    { href:'servicedagar-karlstad', text:'Servicedagar i Karlstad – gata för gata' },
    { href:'parkering-over-natten-karlstad', text:'Parkera över natten i Karlstad' },
  ].filter(r => r.href !== utom);
}

// ── Vad kostar det? ─────────────────────────────────────────────────────────
// Den mest sökta frågan om en stads parkering, och Karlstad har ett ovanligt rakt
// svar: fyra gatuzoner som HETER färger och ligger i prisordning. Siffrorna kommer
// ur samma fält som appens prisstege (seo/karlstad.json, mätt vid bygget) – ingen
// prislista skrivs för hand, för då skiljer sig sidan från appen vid nästa höjning.
const KSD_GATUZONER = ['Röd zon', 'Gul zon', 'Grön zon', 'Blå zon'];
function ksdAvgifter() {
  const gatu = KSD_GATUZONER
    .map(n => KSD_DATA.zoner.find(z => z.zon === n))
    .filter(z => z && z.priser && z.priser.length);
  const ovriga = KSD_DATA.zoner
    .filter(z => z.zon && z.zon !== 'Okänt område' && !KSD_GATUZONER.includes(z.zon) && z.priser && z.priser.length)
    .sort((a, b) => b.platser - a.platser);
  const rad = z => `<li><b>${esc(z.zon)}</b> – ${esc(z.priser[0])} · ${z.stracker} sträckor, ${ksdTal(z.platser)} platser</li>`;
  const sections =
    '<section class="card"><h2>Fyra gatuzoner, i prisordning</h2>' +
    '<p>Karlstads gatuparkering är indelad i fyra zoner, och kommunen har döpt dem efter färg. ' +
    'Ordningen är enkel att minnas: <b>röd är dyrast och blå billigast</b>. Zonen står på skylten och styr timpriset.</p>' +
    '<ul>' + gatu.map(rad).join('') + '</ul>' +
    '<p>Klockslagen läses som på skylten: en tid utan parentes gäller vardagar, och en tid ' +
    '<b>inom parentes</b> gäller dag före sön- och helgdag, alltså oftast lördag. Står det ' +
    '«fritt övrig tid» kostar det inget utanför de tiderna – men parkeringen kan ändå ha en ' +
    'tidsgräns, och servicedagen gäller oavsett pris.</p>' +
    '<p>' + KSD_FORBEHALL + '</p></section>' +
    (ovriga.length ? '<section class="card"><h2>Parkeringsområden med egen taxa</h2>' +
      `<p>Utanför gatuzonerna har ${ovriga.length} namngivna parkeringar sin egen prislista, ofta med dygns- och veckopris. ` +
      'De ligger som egna öar inne i zonerna, så priset kan skilja sig från gatan tvärs över:</p><ul>' +
      ovriga.slice(0, 14).map(rad).join('') + '</ul></section>' : '') +
    '<section class="card"><h2>Så ser du priset i appen</h2>' +
    '<p>Tryck på en gata i <a href="https://parkspot.se/?stad=karlstad">ParkSpot Karlstad</a> så står zonen och priset på platskortet, ' +
    'tillsammans med tidsgränsen och nästa servicedag. Öppnar du Förklaring visas hela prisstegen från röd till blå. ' +
    'Färgen på själva gatan handlar däremot aldrig om pris – den visar om du får stå just nu.</p>' +
    '<p>Kvällar och nätter är ofta gratis i gatuzonerna, medan de namngivna parkeringarna oftast tar 2 kr i timmen dygnet runt. ' +
    'Ska bilen stå länge är dygns- eller veckopriset där nästan alltid billigare än timtaxan på gatan.</p></section>';
  const faq = [
    { q:'Vilken zon är billigast i Karlstad?', a: gatu.length ? `Blå zon, ${esc((gatu[gatu.length - 1].priser[0] || '').split('·')[0].trim())}. Dyrast är Röd zon, ${esc((gatu[0].priser[0] || '').split('·')[0].trim())}. Däremellan ligger Gul och Grön zon.` : 'Blå zon är billigast och Röd zon dyrast.' },
    { q:'Är det gratis att parkera på kvällen i Karlstad?', a:'I gatuzonerna står det ofta «fritt övrig tid», alltså utanför de skyltade avgiftstiderna. De namngivna parkeringarna, som Sundstabadet och Sandgrund, tar däremot oftast 2 kr i timmen även på natten. Kontrollera alltid skylten.' },
    { q:'Vad betyder klockslag inom parentes?', a:'Att tiden gäller dag före sön- och helgdag, alltså oftast lördag. En tid utan parentes gäller vardagar. Söndagar och helgdagar saknas i regel helt, och då är det avgiftsfritt.' },
    { q:'Kostar det något att stå på en servicedag?', a:'Servicedagen är ett parkeringsförbud, inte ett pris. Under de timmarna får bilen inte stå kvar alls, oavsett om du betalat eller inte.' },
  ];
  emit('parkeringsavgifter-karlstad', layout({
    slug:'parkeringsavgifter-karlstad',
    title:'Vad kostar parkering i Karlstad? Zoner och priser | ParkSpot',
    desc:'Röd, gul, grön och blå zon – så mycket kostar gatuparkering i Karlstad per timme. Se priserna per zon, vad parentesen på skylten betyder och när det är gratis.',
    h1:'Parkeringsavgifter i Karlstad',
    lead:'Fyra zoner med färgnamn, från röd dyrast till blå billigast. Här är priserna – och när det är gratis.',
    sections, faq, related: ksdRelated('parkeringsavgifter-karlstad'), lat:null, lng:null, match:null, stad:KSD }));
}

function ksdPillar() {
  const zoner = KSD_DATA.zoner.filter(z => z.zon && z.zon !== 'Okänt område');
  const sections =
    '<section class="card"><h2>Parkering i Karlstad på karta</h2>' +
    `<p>ParkSpot visar var det är lagligt att parkera på gatan i Karlstad – <b>just nu</b> eller <b>över natten</b>. Underlaget är Karlstads kommuns webbkarta: <b>${ksdTal(KSD_DATA.strackorTotalt)} avgiftssträckor</b> med tillsammans <b>${ksdTal(KSD_DATA.platserTotalt)} platser</b>, servicedagarna gata för gata och ${KSD_DATA.anlaggningar.totalt} parkeringsanläggningar.</p>` +
    '<p>' + KSD_FORBEHALL + '</p></section>' +
    '<section class="card"><h2>Servicedagar – varannan vecka, inte på röda dagar</h2>' +
    `<p>På ${KSD_DATA.servicedagar.gator} gator i centrala Karlstad är det <b>parkeringsförbud några timmar varannan vecka</b> så att kommunen kan sopa eller ploga. Kommunen kallar det servicedagar (förr städdagar), och förbudet står på skylten vid varje berörd gata.</p>` +
    '<ul><li><b>Jämna eller udda veckor.</b> De flesta gator städas jämna veckor, några udda. ParkSpot räknar veckonumret åt dig.</li>' +
    '<li><b>Ingen säsong.</b> Samma dagar hela året – sopning på sommaren, plogning på vintern.</li>' +
    '<li><b>Inte på röda dagar.</b> Infaller servicedagen på en helgdag gäller inte förbudet. Det är en skillnad mot Stockholm, där städförbudet gäller även på helgdagar.</li></ul>' +
    '<p><a href="/servicedagar-karlstad">Se alla gator med servicedag, dag för dag →</a></p></section>' +
    '<section class="card"><h2>Hur länge får du stå?</h2>' +
    `<p>Karlstad anger tidsgränsen på en stor del av avgiftssträckorna: <b>${KSD_GRANS['Högst 1 vecka']}</b> sträckor har en vecka, <b>${KSD_GRANS['Högst 1 dygn']}</b> ett dygn och <b>${KSD_GRANS['Högst 120 minuter']}</b> högst 120 minuter. På <b>${KSD_GRANS['Ingen gräns i datan']}</b> sträckor, nästan alla i Grön, Gul och Blå zon, står ingen tidsgräns i datan. Skyltarna vi har kontrollerat där visar heller ingen gräns, och då gäller trafikförordningens allmänna regel: högst 24 timmar i följd på vardagar. Står det något annat på skylten gäller skylten.</p></section>` +
    '<section class="card"><h2>Zoner och avgifter</h2><p>Priset följer zonen eller parkeringsområdet. Så här skriver kommunen det, per område (klockslag inom parentes gäller dag före sön- och helgdag, oftast lördag):</p><ul>' +
    zoner.slice(0, 16).map(z => `<li><b>${esc(z.zon)}</b> – ${z.priser.length ? esc(z.priser[0]) : 'pris saknas i datan'} · ${z.stracker} sträckor, ${ksdTal(z.platser)} platser</li>`).join('') +
    '</ul></section>' +
    '<section class="card"><h2>Parkeringsanläggningar</h2>' +
    `<p>Är gatan full visar ParkSpot närmaste anläggning: ${KSD_DATA.anlaggningar.garage.length} parkeringshus (${KSD_DATA.anlaggningar.garage.map(esc).join(', ')}) och ${KSD_DATA.anlaggningar.ytor} parkeringsområden. Kommunen publicerar inte hur många platser de har, så appen skriver inte ut någon siffra.</p></section>`;
  const faq = [
    { q:'Har Karlstad städdagar?', a:'Ja. De heter servicedagar och är ett skyltat parkeringsförbud några timmar varannan vecka på ungefär 90 gator i centrala Karlstad. ParkSpot visar dem på kartan och räknar ut om det är jämn eller udda vecka.' },
    { q:'Gäller servicedagen på helgdagar?', a:'Nej. Enligt Karlstads kommun gäller inte parkeringsförbudet om servicedagen infaller på en röd dag. ParkSpot tar hänsyn till det. Julafton, midsommarafton och nyårsafton är inte röda dagar i lagens mening, och där visar appen förbudet.' },
    { q:'Kan ParkSpot visa var jag inte får parkera i Karlstad?', a:'Bara under servicedagarna. Kommunen publicerar inga andra parkeringsförbud, så en gata utan färg betyder att uppgift saknas – inte att det är fritt.' },
    { q:'Kostar ParkSpot något?', a:'Nej, gratis och utan inloggning. Karlstad bygger på kommunens webbkarta.' },
  ];
  emit('parkering-karlstad', layout({
    slug:'parkering-karlstad', title:'Parkering i Karlstad – var får du parkera? | ParkSpot',
    desc:'Se på karta var du får parkera i Karlstad – nu eller över natten. Servicedagar med jämna och udda veckor, zoner, avgifter, tidsgränser och parkeringshus.',
    h1:'Parkering i Karlstad',
    lead:'Var får du stå, hur länge, och när är det servicedag? ParkSpot visar det på karta – byggt på Karlstads kommuns webbkarta.',
    sections, faq, related: ksdRelated('parkering-karlstad'), lat:null, lng:null, match:null, stad:KSD }));
}

// ── Servicedagarna, dag för dag ─────────────────────────────────────────────
// Gatorna skrivs ut ORDAGRANT ur kommunens egen lista – inklusive «östra sidan»
// och «mellan X och Y». Det är den avgränsning skylten har; våra härledda namn i
// appen bär bara gatan och får aldrig ersätta kommunens formulering här.
function ksdServicedagar() {
  const SD = KSD_DATA.servicedagar;
  const DAGAR = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'];
  const block = DAGAR.map(dag => {
    const rader = SD.grupper.filter(g => g.veckodag === dag);
    if (!rader.length) return '';
    return `<section class="card"><h2>${dag}</h2>` + rader.map(g =>
      `<h3>${g.vecka === 'jämna' ? 'Jämna' : 'Udda'} veckor, klockan ${esc(g.klockslag.replace('-', '–'))}</h3><ul>` +
      g.gator.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>').join('') + '</section>';
  }).join('');
  const sections =
    '<section class="card"><h2>Så fungerar servicedagarna</h2>' +
    `<p>På gator där kommunens sopmaskiner och plogar har svårt att komma fram är det <b>parkeringsförbud några timmar varannan vecka</b>. Förbudet står på vägmärket vid varje berörd gata. I dag gäller det ${SD.gator} gatuavsnitt, ${String(SD.km).replace('.', ',')} km gata i centrala Karlstad.</p>` +
    '<ul><li><b>Varannan vecka.</b> Titta på veckonumret: jämn eller udda. ParkSpot räknar det åt dig.</li>' +
    '<li><b>Olika tider på gatans två sidor.</b> Många gator sopas på olika dagar på östra och västra sidan. Zooma in i appen så ser du båda.</li>' +
    '<li><b>Inte på röda dagar.</b> Infaller servicedagen på en helgdag gäller inte förbudet.</li>' +
    '<li><b>Året runt.</b> Samma dagar sommar som vinter.</li></ul>' +
    `<p>Listan nedan är kommunens egen, uppdaterad ${esc(SD.sidanUppdaterad)}. Står din gata inte med sopas den enligt det vanliga schemat, utan parkeringsförbud.</p>` +
    // Skyltrundan 2026-09-18: på två gator säger skylten något annat än listan, och
    // kommunens eget avgiftslager håller med skylten. Sidan får inte framställa listan
    // som säkrare än skylten – det är skylten som gäller juridiskt.
    '<p><b>Skylten gäller.</b> På två ställen har vi sett skyltar som säger något annat än listan: Vikengatan (skylten: måndag 10–12, listan: 08–10) och Drottninggatan mellan Östra Torggatan och Södra Kyrkogatan (skylten: måndag, listan: onsdag). I appen visas båda tiderna där.</p></section>' +
    block +
    '<section class="card"><h2>Källa</h2><p>Karlstads kommun, <a href="' + esc(SD.kalla) + '" rel="nofollow">Schema för servicedagar och parkeringsförbud</a>. ' + KSD_FORBEHALL + '</p></section>';
  const faq = [
    { q:'Vad är en servicedag i Karlstad?', a:'Ett tillfälligt parkeringsförbud några timmar varannan vecka på gator där kommunen behöver sopa eller ploga. Det hette tidigare städdag, och det står på skylten vid gatan.' },
    { q:'Är det jämn eller udda vecka nu?', a:'Det avgör veckonumret. ParkSpot räknar ut det och visar bara servicedagar som faktiskt gäller den här veckan.' },
    { q:'Gäller servicedagen på röda dagar?', a:'Nej, enligt kommunen gäller inte förbudet om servicedagen infaller på en röd dag.' },
    { q:'Min gata finns inte i listan – vad gäller?', a:'Då sopas den enligt kommunens vanliga schema för underhållssopning, utan parkeringsförbud. Andra skyltar på gatan gäller förstås som vanligt.' },
  ];
  emit('servicedagar-karlstad', layout({
    slug:'servicedagar-karlstad', title:'Servicedagar i Karlstad – städdagar gata för gata | ParkSpot',
    desc:'Alla gator med servicedag i Karlstad, dag för dag: jämna och udda veckor, klockslag och vad som gäller på röda dagar. Se dem på karta.',
    h1:'Servicedagar i Karlstad',
    lead:'Parkeringsförbud några timmar varannan vecka – här är varje gata, dag för dag, som kommunen själv listar dem.',
    sections, faq, related: ksdRelated('servicedagar-karlstad'), lat:null, lng:null, match:null, stad:KSD }));
}

// ── Över natten ──────────────────────────────────────────────────────────────
function ksdNatt() {
  const tidiga = KSD_DATA.servicedagar.grupper.filter(g => g.klockslag.startsWith('05'))
    .reduce((s, g) => s + g.gator.length, 0);
  const sections =
    '<section class="card"><h2>Tre saker avgör om bilen kan stå kvar till morgonen</h2><ul>' +
    `<li><b>Servicedagen i morgon bitti.</b> ${tidiga} gatuavsnitt har servicedag redan klockan <b>05–07</b>. Då hinner du inte flytta bilen på morgonen, och ParkSpot visar gatan som olämplig kvällen före. Börjar förbudet 08 eller senare står det när du måste flytta.</li>` +
    `<li><b>Tidsgränsen.</b> ${KSD_GRANS['Högst 1 vecka']} sträckor tillåter en vecka och ${KSD_GRANS['Högst 1 dygn']} ett dygn. ${KSD_GRANS['Högst 120 minuter']} har högst 120 minuter och räcker inte för en natt.</li>` +
    `<li><b>Ingen gräns på skylten.</b> På ${KSD_GRANS['Ingen gräns i datan']} sträckor, mest i Grön, Gul och Blå zon, finns ingen tidsgräns i kommunens data, och skyltarna vi kontrollerat där har ingen heller. Då gäller trafikförordningens regel om högst 24 timmar i följd på vardagar, vilket räcker för en natt. Läs ändå skylten.</li>` +
    '</ul></section>' +
    '<section class="card"><h2>Helgdagar</h2><p>Infaller servicedagen på en röd dag gäller inte förbudet. Kvällen före en helgdag kan alltså en gata med servicedag vara trygg. ParkSpot räknar med det, men bara för de dagar som är helgdagar enligt lag – inte julafton, midsommarafton eller nyårsafton.</p>' +
    '<p>' + KSD_FORBEHALL + '</p></section>';
  const faq = [
    { q:'Får jag stå kvar över natten i Karlstad?', a:'Ofta, men kontrollera två saker: att det inte är servicedag tidigt nästa morgon, och att tidsgränsen räcker. Natt-läget i ParkSpot väger in båda.' },
    { q:'Vad händer om servicedagen är klockan 05–07?', a:'Då måste bilen vara borta innan fem på morgonen. ParkSpot visar gatan som olämplig för natten kvällen före.' },
    { q:'Är parkeringen gratis på natten?', a:'I flera zoner tar avgiften slut klockan 18, i några parkeringsområden kostar natten 2 kr i timmen. Priset per område står på översiktssidan.' },
  ];
  emit('parkering-over-natten-karlstad', layout({
    slug:'parkering-over-natten-karlstad', title:'Parkera över natten i Karlstad – vad som gäller',
    desc:'Kan bilen stå kvar till morgonen i Karlstad? Servicedagar klockan 05–07, tidsgränser och avgifter avgör. Se lagliga nattplatser på karta.',
    h1:'Parkera över natten i Karlstad',
    lead:'Servicedagen tidigt nästa morgon och tidsgränsen – det är de två sakerna som avgör.',
    sections, faq, related: ksdRelated('parkering-over-natten-karlstad'), lat:null, lng:null, match:null, stad:KSD }));
}

// ═══════════════════════════════════════════════════════════════════════════
// UPPSALA
// ═══════════════════════════════════════════════════════════════════════════
// En enda översiktssida, additiv som Göteborgs. Siffrorna är uppmätta 2026-09-15 mot
// cities/uppsala.js (hela kommunen). ⚠ TRE SAKER SOM MÅSTE STÅ:
//   1. «Parkeringskarta», aldrig «öppna data» – lagren finns inte på opendata.uppsala.se.
//   2. Inga städdagar och inga parkeringsförbud i datan.
//   3. Ensam tid på skylten = vardagar (T6), bekräftat på Hagundagatan.
const UPS = { namn: 'ParkSpot Uppsala', relText: 'Mer om parkering i Uppsala', karta: '/?stad=uppsala' };
const UPS_FORBEHALL = 'Uppsala kommun publicerar inga städdagar och inga parkeringsförbud utanför parkeringsplatserna. ParkSpot visar därför var du <b>får</b> parkera – inte var du inte får, och aldrig när gatan städas. En gata utan färg betyder «ingen uppgift», inte «fritt». Kontrollera alltid skylten.';
// Uppmätt underlag, skrivet av verktyg/bygg-uppsala-seo.js. Sidorna räknar aldrig själva:
// ett nätfel vid byggtid skulle annars bli en sida med noll i stället för en sida som inte
// byggs. Kör om verktyget när siffrorna ska uppdateras.
const UPS_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'uppsala.json'), 'utf8'));
const upsTal = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function upsRelated(utom) {
  return [
    { href:'parkering-uppsala', text:'Parkering i Uppsala – översikt' },
    { href:'parkeringsavgifter-uppsala', text:'Parkeringsavgifter i Uppsala – zoner och priser' },
    { href:'parkering-over-natten-uppsala', text:'Parkera över natten i Uppsala' },
    { href:'parkeringshus-uppsala', text:'Parkeringsgarage i Uppsala' },
  ].filter(r => r.href !== utom);
}

function upsPillar() {
  const sections =
    '<section class="card"><h2>Parkering i Uppsala på karta</h2>' +
    `<p>ParkSpot visar var det är lagligt att parkera på gatan i Uppsala – <b>just nu</b> eller <b>över natten</b>. Underlaget är Uppsala kommuns parkeringskarta: <b>${upsTal(UPS_DATA.strackorTotalt)} parkeringssträckor</b> med tillsammans <b>${upsTal(UPS_DATA.platserTotalt)} platser</b> för bil i hela kommunen, plus lastplatser, MC-platser, platser för rörelsehindrade och kommunens parkeringsgarage.</p>` +
    '<p>' + UPS_FORBEHALL + '</p></section>' +
    '<section class="card"><h2>Tidsgränsen – och vad klockslagen på skylten betyder</h2>' +
    '<p>Uppsala anger hur länge du får stå, både på sträckan och i områdets avgiftstext («Max-P 4 tim»). Därför kan appen skilja en plats med fyra timmars gräns från en där du kan lämna bilen över natten.</p>' +
    '<p>Klockslagen läses som skylten gör: <b>«4 tim 8-18»</b> utan parentes gäller vardagar, utom dag före sön- och helgdag. En tid <b>inom parentes</b> gäller dag före sön- och helgdag (oftast lördag), och en <b>röd</b> tid sön- och helgdagar.</p></section>' +
    '<section class="card"><h2>Lastplatser gäller dygnet runt</h2>' +
    '<p>De flesta lastplatser i Uppsala har ingen tid på skylten. Då gäller förbudet att parkera <b>hela dygnet, alla dagar</b> – de lokala trafikföreskrifterna för dem anger inget klockslag. ParkSpot visar dem röda i alla lägen.</p></section>' +
    // Städningen: kommunens egna sidor om sandupptagning, lövsopning och fordonsflytt,
    // lästa 2026-09-15. Inga fasta städdagar – därför inga klockslag här, och inga
    // årsdatum som blir gamla: bara mönstret och det som alltid gäller (skylten).
    '<section class="card"><h2>Städning: inga fasta städdagar – håll utkik efter skyltar</h2>' +
    '<p>Uppsala har <b>inga fasta städdagar</b> per gata, till skillnad från till exempel Stockholm och Göteborg. Den städning som kräver att du flyttar bilen är <b>vårens sandupptagning</b>, som brukar börja i mars och vara klar i mitten av maj. Kommunen sopar flera områden parallellt, och det tar normalt fem till sju veckor.</p>' +
    '<ul>' +
    '<li><b>Tillfälliga skyltar sätts upp 24 timmar före</b> och anger vilken dag det sopas.</li>' +
    '<li>Så länge skylten står får du <b>varken stanna eller parkera</b> – även om gatan redan ser färdigsopad ut. När skylten är borta gäller vanliga regler igen.</li>' +
    '<li>En felparkerad bil som hindrar snöröjning eller städning kan flyttas, och ägaren betalar kostnaden.</li>' +
    '</ul>' +
    '<p>Lövsopningen på hösten pågår två till tre veckor i hela kommunen samtidigt. Kommunen publicerar en preliminär plan per område och vecka inför sandupptagningen, men det som gäller är skylten på plats.</p>' +
    '<p>Eftersom förbudet bara finns på en tillfällig skylt säger ParkSpot <b>ingenting om städning i Uppsala</b> – varken att gatan städas eller att den inte gör det. Står du i Uppsala under våren: titta efter skyltarna.</p></section>' +
    '<section class="card"><h2>Skolor: tillstånd dagtid</h2>' +
    '<p>Vid många skolor står «7-16 Tillstånd erfordras». Dagtid på vardagar är platsen bara för den som har tillstånd; kvällar och helger får alla stå där. Appen växlar färg efter klockan.</p></section>' +
    '<section class="card"><h2>Stadsdel för stadsdel</h2>' +
    `<p>Så många parkeringssträckor kommunens karta har per stadsdel (${UPS_DATA.stadsdelar.length} med egen sida; ${UPS_DATA.stadsdelarUtanSida} mindre stadsdelar finns också i appen):</p><ul>` +
    UPS_DATA.stadsdelar.map(s =>
      `<li><a href="/parkering-uppsala/${s.slug}">${esc(s.namn)}</a> – ${s.stracker} sträckor, ${upsTal(s.platser)} platser</li>`).join('') +
    '</ul></section>';
  const faq = [
    { q:'Visar ParkSpot städdagar i Uppsala?', a:'Nej. Uppsala har inga fasta städdagar per gata. Vårens sandupptagning skyltas tillfälligt 24 timmar i förväg, och så länge skylten står får du varken stanna eller parkera. Appen säger därför ingenting om städning i Uppsala, inte heller att det inte städas.' },
    { q:'När är sandupptagningen i Uppsala?', a:'På våren, normalt från mars till mitten av maj, område för område. Exakt dag för din gata står på den tillfälliga skylt som sätts upp 24 timmar innan.' },
    { q:'Gäller «4 tim 8-18» på lördagar?', a:'Nej, inte om tiden står utan parentes. Enligt vägmärkesförordningen gäller en sådan tid vardagar utom dag före sön- och helgdag. Lördagens tid står inom parentes, sön- och helgdagens i rött.' },
    { q:'Får jag stanna på en lastplats på kvällen?', a:'Inte om skylten saknar tid. Då gäller lastplatsen hela dygnet. Står en tid på skylten gäller den bara då.' },
    { q:'Kostar ParkSpot något?', a:'Nej, gratis och utan inloggning. Uppsala bygger på kommunens parkeringskarta.' },
  ];
  emit('parkering-uppsala', layout({
    slug:'parkering-uppsala', title:'Parkering i Uppsala – var får du parkera? | ParkSpot',
    desc:'Se på karta var du får parkera i Uppsala – nu eller över natten. Tidsgränser, avgiftsområden, lastplatser och parkeringsgarage ur kommunens parkeringskarta.',
    h1:'Parkering i Uppsala',
    lead:'Var får du stå, hur länge, och vad betyder klockslagen på skylten? ParkSpot visar det på karta – byggt på Uppsala kommuns parkeringskarta.',
    sections, faq, related: upsRelated('parkering-uppsala'), lat:null, lng:null, match:null, stad:UPS }));
}

// ── Avgifterna: områdeskoden på skylten ──────────────────────────────────────
// Uppsalas pris hänger inte på gatan utan på ett OMRÅDE, och koden står på skylten.
// Avgiftstexterna skrivs ut ordagrant ur kommunens lager – att skriva om «8-18 (8-18)
// 20kr/tim i 2 timmar därefter 35kr/tim» till egna ord vore att tolka, och parentesen
// betyder dag före sön- och helgdag (se tidsavsnittet på översiktssidan).
function upsAvgifter() {
  const besok = UPS_DATA.omraden.filter(o => o.sort === 'Besöksparkering' && o.namn);
  const zoner = UPS_DATA.omraden.filter(o => !o.sort && o.namn && o.namn.length <= 3);
  const rad = o => `<li><b>${esc(o.kod)}</b>${o.namn ? ' · ' + esc(o.namn) : ''} – ${esc(o.avgiftstext)}</li>`;
  const sections =
    '<section class="card"><h2>Priset sitter på området, inte på gatan</h2>' +
    `<p>Uppsala delar in gatuparkeringen i <b>${UPS_DATA.omraden.length} avgiftsområden</b>. Koden står på skylten, till exempel <b>18114</b> eller en bokstav som <b>C</b>, och den avgör både timpriset och hur länge du får stå. ParkSpot läser området under den gata du tittar på och visar priset och tidsgränsen på kortet.</p>` +
    '<p>Klockslagen läses som på skylten: en tid utan parentes gäller vardagar utom dag före helgdag, en tid <b>inom parentes</b> gäller dag före sön- och helgdag. «Max-P 4tim» betyder att du får stå högst fyra timmar.</p>' +
    '<p>' + UPS_FORBEHALL + '</p></section>' +
    // Fem av de 95 områdena är STADSZONER som täcker hela Uppsala, och de är det folk
    // söker på («vad kostar parkering i Uppsala centrum»). De ligger i prisordning
    // A→E och ritas numera som färgade zoner på kartan (v1.35.0). Priserna hämtas ur
    // samma avgiftstext som appen visar – ingen prislista skriven för hand.
    (() => {
      const ORDNING = ['A', 'B', 'C', 'D', 'E'];
      const stads = ORDNING.map(b => UPS_DATA.omraden.find(o => o.namn === b)).filter(Boolean);
      if (!stads.length) return '';
      return '<section class="card"><h2>Fem områden, från dyrast till billigast</h2>' +
        '<p>Uppsala delar staden i fem avgiftsområden. <b>A är innerstadskärnan och dyrast</b>, ' +
        'sedan faller priset utåt till <b>E</b>, som täcker resten av tätorten. ' +
        'I ParkSpot ritas de som färgade zoner på kartan, rött för A och blått för E, så att du ser ' +
        'var det blir billigare att gå några kvarter.</p><ul>' +
        stads.map(o => `<li><b>Område ${esc(o.namn)}</b> (kod ${esc(o.kod)}) – ${esc(o.avgiftstext)}</li>`).join('') +
        '</ul>' +
        '<p>Två saker är lätta att missa. Mellan 18 och 24 kostar det <b>5 kr i timmen i alla fem områdena</b>, ' +
        'och i område A gäller det högre priset först efter två timmar. Söndagar och helgdagar är avgiftsfria, ' +
        'eftersom avgiftstiderna bara gäller vardagar och dagen före sön- och helgdag.</p>' +
        '<p>Zonen är en huvudregel, inte hela sanningen: inne i områdena ligger enskilda parkeringar med ' +
        '<b>egen taxa</b> – Stadshusgatan kostar till exempel 36 kr i timmen mitt i de centrala områdena. ' +
        'Därför visar <a href="https://parkspot.se/?stad=uppsala">ParkSpot</a> alltid gatans eget pris på platskortet, ' +
        'inte zonens.</p></section>';
    })() +
    (zoner.length ? '<section class="card"><h2>Alla områdeskoder</h2><ul>' + zoner.map(rad).join('') + '</ul></section>' : '') +
    (besok.length ? `<section class="card"><h2>Besöksparkeringar med egen taxa</h2><p>${besok.length} platser har sin egen prislista, ofta torg och centrala lägen:</p><ul>` + besok.map(rad).join('') + '</ul></section>' : '');
  const faq = [
    { q:'Var hittar jag områdeskoden?', a:'På parkeringsskylten, som en sifferkod (till exempel 18114) eller en bokstav. Samma kod styr priset i betalappen.' },
    { q:'Vad betyder klockslag inom parentes?', a:'Att tiden gäller dag före sön- och helgdag, alltså oftast lördag. En tid utan parentes gäller vardagar utom dag före helgdag.' },
    { q:'Är kvällen billigare?', a:'Ofta. Många områden har ett lägre pris mellan 18 och 24 – till exempel 20 kr i timmen dagtid och 5 kr på kvällen. Kontrollera skylten, priserna skiljer sig mellan områden.' },
  ];
  emit('parkeringsavgifter-uppsala', layout({
    slug:'parkeringsavgifter-uppsala', title:'Vad kostar parkering i Uppsala? Område A–E',
    desc:'Så fungerar parkeringsavgifterna i Uppsala: områdeskoden på skylten avgör priset. Se zonerna, timpriserna och tidsgränserna – och vad klockslagen betyder.',
    h1:'Parkeringsavgifter i Uppsala',
    lead:'Priset hänger på området, inte på gatan. Koden står på skylten – här är vad den betyder.',
    sections, faq, related: upsRelated('parkeringsavgifter-uppsala'), lat:null, lng:null, match:null, stad:UPS }));
}

// ── Över natten ──────────────────────────────────────────────────────────────
// Den vanligaste frågan i alla städer, och i Uppsala har den ett ovanligt tydligt svar:
// ingen städning att ta hänsyn till, men en tidsgräns som kan vakna på morgonen.
function upsNatt() {
  const dygn = UPS_DATA.granser.filter(g => /dygn|24 tim|48 tim/.test(g.namn)).reduce((s, g) => s + g.antal, 0);
  const korta = UPS_DATA.granser.filter(g => /\b(15|30) min\b|^[1-4] tim/.test(g.namn)).reduce((s, g) => s + g.antal, 0);
  const sections =
    '<section class="card"><h2>Tre saker avgör om bilen kan stå kvar till morgonen</h2><ul>' +
    '<li><b>Tidsgränsen.</b> Är den kortare än ett dygn räcker den inte för en natt – står du från 18 till 08 är det fjorton timmar. ParkSpot visar då platsen som blå i stället för grön, även om du får parkera där just nu.</li>' +
    '<li><b>Gränsens klockslag.</b> En gräns som bara gäller dagtid vilar på natten men vaknar på morgonen. Kortet skriver ut fönstret, till exempel «Max 30 min vardagar 07–18», så att du vet när bilen måste flyttas.</li>' +
    '<li><b>Avgiften.</b> Många områden tar betalt till klockan 24, en del dygnet runt. Avgiftsfritt är inte samma sak som obegränsat.</li>' +
    '</ul></section>' +
    `<section class="card"><h2>Vad datan säger</h2><p>Av Uppsalas parkeringssträckor bär <b>${upsTal(dygn)}</b> en tidsgräns på ett dygn eller mer – de kan räcka för en natt. <b>${upsTal(korta)}</b> har en gräns på några timmar eller mindre. Resten har ingen gräns i datan, och då gäller trafikförordningens 24 timmar på vardagar.</p></section>` +
    '<section class="card"><h2>Ingen städning att passa – men skyltar på våren</h2>' +
    '<p>Uppsala har inga fasta städdagar, så till skillnad från Stockholm och Göteborg finns ingen städnatt att undvika. Under vårens sandupptagning sätts däremot tillfälliga skyltar upp 24 timmar i förväg, och då får du varken stanna eller parkera. Appen visar inte de skyltarna.</p>' +
    '<p>' + UPS_FORBEHALL + '</p></section>';
  const faq = [
    { q:'Får jag stå gratis över natten i Uppsala?', a:'På många sträckor tar avgiften slut vid midnatt, men tidsgränsen kan finnas kvar och en del områden har avgift dygnet runt. Öppna Natt-läget i ParkSpot och läs kortet för den gata du tittar på.' },
    { q:'Vad gäller om ingen tidsgräns står i datan?', a:'Då gäller trafikförordningens regel: högst 24 timmar i följd på vardagar, utom dag före sön- och helgdag. Appen säger aldrig att en plats saknar gräns – den säger att uppgift saknas.' },
    { q:'Behöver jag flytta bilen för städning?', a:'Inte för någon fast städdag – de finns inte i Uppsala. Men vid sandupptagning och gatuarbeten skyltas det tillfälligt, med 24 timmars varsel.' },
  ];
  emit('parkering-over-natten-uppsala', layout({
    slug:'parkering-over-natten-uppsala', title:'Parkera över natten i Uppsala – vad som gäller | ParkSpot',
    desc:'Kan bilen stå kvar till morgonen i Uppsala? Tidsgränsen, gränsens klockslag och avgiften avgör. Se lagliga nattplatser på karta.',
    h1:'Parkera över natten i Uppsala',
    lead:'Ingen städnatt att undvika – men en tidsgräns som kan vakna klockan sju.',
    sections, faq, related: upsRelated('parkering-over-natten-uppsala'), lat:null, lng:null, match:null, stad:UPS }));
}

// ── Garagen ──────────────────────────────────────────────────────────────────
function upsGarage() {
  const g = UPS_DATA.garage;
  const platser = g.reduce((s, x) => s + (parseInt(x.platser, 10) || 0), 0);
  const ladd = g.reduce((s, x) => s + (parseInt(x.ladd, 10) || 0), 0);
  const rader = g.map(x => {
    const bit = [x.platser ? `${x.platser} platser` : null, x.rh ? `${x.rh} för rörelsehindrade` : null,
                 x.ladd ? `${x.ladd} laddplatser` : null, x.maxtid ? `max ${x.maxtid}` : null,
                 x.hojd ? `takhöjd ${x.hojd}` : null].filter(Boolean).join(' · ');
    // Ett garage saknar områdespost i kommunens data. Namnet kommer då ur kommunens egen
    // webbadress för garaget (samma källa som appen använder) och raden säger det rakt ut,
    // i stället för att låta ett hämtat namn se ut som ett registrerat.
    const kalla = x.namn && x.namnKalla !== 'omradeslagret' ? ' <i>(namnet ur kommunens webbadress – garaget saknar områdespost i datan)</i>' : '';
    return `<li><b>${esc(x.namn || 'Garage utan namn i datan')}</b> – ${esc(bit)}${kalla}</li>`;
  }).join('');
  const sections =
    `<section class="card"><h2>Fyra kommunala garage</h2>` +
    `<p>När gatan är full driver Uppsala Parkerings AB fyra garage med tillsammans <b>${upsTal(platser)} besöksplatser</b> och <b>${ladd} laddplatser</b>. ParkSpot visar dem som reserv när ingen gatuplats duger.</p><ul>${rader}</ul></section>` +
    '<section class="card"><h2>Priset står i områdestexten</h2>' +
    // Siffrorna är plockade ur regeltexterna i seo/uppsala.json, inte avrundade:
    // Dansmästaren 15 kr/tim dagtid, Kvarnengaraget 30 kr dygnet runt, Centralgaraget
    // 36 kr 05–19 och 9 kr på natten. Dygnspriset 220 kr står på två av garagen, inte alla.
    '<p>Garagen bär samma sorts områdeskod som gatan. Dagtid kostar timmen 15 kr i Dansmästaren, 30 kr i Kvarnengaraget och 36 kr i Centralgaraget, som samtidigt är billigast på natten (9 kr i timmen mellan 19 och 05). Två av garagen har ett dygnspris på 220 kr. Tre av fyra har dessutom de tre första timmarna avgiftsfria i ett eget område – vad som gäller står på skylten vid infarten. Det fjärde garaget saknar prisuppgift i kommunens data, och då skriver vi ingen.</p></section>' +
    '<section class="card"><h2>Ingen realtid på lediga platser</h2>' +
    '<p>Siffran är antalet platser, inte hur många som är lediga. Uppsala publicerar ingen beläggning, och ParkSpot visar därför aldrig «X lediga just nu» – den uppgiften finns inte.</p>' +
    '<p>' + UPS_FORBEHALL + '</p></section>';
  const faq = [
    { q:'Visar ParkSpot lediga platser i garagen?', a:'Nej. Talet är antalet platser. Uppsala publicerar ingen uppgift om beläggning.' },
    { q:'Hur högt är taket?', a:'1,9 meter i de två centrala garagen och 2,1 meter i de södra. Står du i en högre bil är gatan ofta enda alternativet.' },
    { q:'Finns laddplatser?', a:'Ja, i alla fyra garagen – flest i Dansmästaren med 60 platser.' },
  ];
  emit('parkeringshus-uppsala', layout({
    slug:'parkeringshus-uppsala', title:'Parkeringsgarage i Uppsala – pris och takhöjd',
    desc:'Uppsalas fyra kommunala parkeringsgarage: antal platser, laddplatser, takhöjd och maxtid. Se dem på karta när gatan är full.',
    h1:'Parkeringsgarage i Uppsala',
    lead:'Fyra garage, deras storlek, takhöjd och vad de kostar.',
    sections, faq, related: upsRelated('parkeringshus-uppsala'), lat:null, lng:null, match:null, stad:UPS }));
}

// ── En sida per stadsdel ─────────────────────────────────────────────────────
// Samma modell som Göteborgs områdessidor, men Uppsalas stadsdel står som kodlista på
// varje sträcka – siffrorna är alltså räknade ur kommunens egen indelning, inte ur en
// gräns vi dragit själva. Stadsdelar under 25 sträckor får ingen sida: de skulle bli
// tre rader text, vilket är sämre än ingen sida.
function upsStadsdel(s) {
  const granser = Object.entries(s.granser).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sections =
    `<section class="card"><h2>Parkering i ${esc(s.namn)}</h2>` +
    `<p>${esc(s.namn)} är en av Uppsalas stadsdelar. Kommunens parkeringskarta har <b>${s.stracker} parkeringssträckor</b> här med tillsammans <b>${upsTal(s.platser)} platser</b>: ${s.avgift} avgiftsbelagda, ${s.avgiftsfri} avgiftsfria${s.samnyttjad ? ` och ${s.samnyttjad} samnyttjade` : ''}.</p>` +
    (granser.length
      ? `<p>Tidsgränser som förekommer här: ${granser.map(([n, a]) => `<b>${esc(n)}</b> (${a} sträckor)`).join(', ')}. ${s.medGrans} av ${s.stracker} sträckor har en gräns i datan.</p>`
      : '<p>Ingen av sträckorna här bär en tidsgräns i datan. Då gäller trafikförordningens 24 timmar på vardagar – och skylten på plats.</p>') +
    '<p>' + UPS_FORBEHALL + '</p></section>';
  const faq = [
    { q:`Är parkeringen avgiftsbelagd i ${s.namn}?`, a: s.avgift > s.avgiftsfri
        ? `Övervägande ja: ${s.avgift} av ${s.stracker} sträckor är avgiftsbelagda. Priset styrs av områdeskoden på skylten.`
        : `Delvis: ${s.avgiftsfri} av ${s.stracker} sträckor är avgiftsfria. Kontrollera skylten, tidsgräns kan gälla ändå.` },
    { q:`Städas gatorna i ${s.namn}?`, a:'Uppsala har inga fasta städdagar. Vårens sandupptagning skyltas tillfälligt 24 timmar i förväg.' },
  ];
  emit('parkering-uppsala/' + s.slug, layout({
    slug:'parkering-uppsala/' + s.slug,
    title:kortTitel(`Parkering i ${s.namn} – avgifter och tidsgränser`,
                    `Parkering i ${s.namn} – avgifter`),
    desc:`Parkering i ${s.namn}: ${s.stracker} sträckor med ${upsTal(s.platser)} platser, avgifter och tidsgränser ur kommunens parkeringskarta.`,
    h1:`Parkering i ${s.namn}`,
    lead:`${s.stracker} parkeringssträckor och ${upsTal(s.platser)} platser enligt kommunens karta – och vad som gäller på dem.`,
    sections, faq, related: upsRelated(''), lat:null, lng:null, match:null, stad:UPS }));
}

// ═══════════════════════════════════════════════════════════════════════════
// GÖTEBORG
// ═══════════════════════════════════════════════════════════════════════════
// Egna sidor byggda på Göteborgs öppna data (samma källa som appen). Allt är
// ADDITIVT: Stockholms 211 sidor rörs inte – verifierat byte-identiskt i git.
//
// ⚠ TVÅ SAKER SOM MÅSTE STÅ PÅ VARJE GÖTEBORGSSIDA:
//   1. Staden publicerar INGA parkeringsförbud. Sidorna får aldrig antyda att
//      appen kan visa var man inte får stå – det kan den bara i Stockholm.
//   2. Städningen går på JÄMNA/UDDA VECKOR. Inte ett kantfall utan hur Göteborg
//      städar: 1 597 av 2 002 sträckor. Utelämnas det blir guiden fel varannan vecka.
const GBG = { namn: 'ParkSpot Göteborg', relText: 'Mer om parkering i Göteborg', karta: '/?stad=goteborg' };
const GBG_OMR = JSON.parse(fs.readFileSync(path.join(__dirname, 'goteborg.json'), 'utf8'));
const GBG_FORBEHALL = 'Göteborg publicerar inga parkeringsförbud i sin öppna data. ParkSpot visar därför var du <b>får</b> parkera – aldrig var du inte får. En gata utan färg betyder «ingen uppgift», inte «fritt». Kontrollera alltid skylten.';

function gbgRelated(utom) {
  return [
    { href:'parkering-goteborg', text:'Parkering i Göteborg – översikt' },
    { href:'parkering-over-natten-goteborg', text:'Parkera över natten i Göteborg' },
    { href:'stadgator-goteborg', text:'Städdagar i Göteborg – jämna och udda veckor' },
    { href:'boendeparkering-goteborg', text:'Boendeparkering i Göteborg – zoner och regler' },
    { href:'parkeringsanlaggningar-goteborg', text:'Parkeringsanläggningar i Göteborg' },
  ].filter(r => r.href !== utom);
}

// ── Över natten ─────────────────────────────────────────────────────────────
// Den mest sökta frågan i varje stad, och den saknades helt för Göteborg (Stockholm,
// Uppsala och Karlstad hade sin sida sedan tidigare). Siffrorna kommer ur
// seo/goteborg-natt.json, som verktyg/bygg-gbg-natt.js räknar fram ur kommunens WFS –
// skriv dem aldrig för hand här, se skriptets huvud.
const GBG_NATT = JSON.parse(fs.readFileSync(path.join(__dirname, 'goteborg-natt.json'), 'utf8'));
const GBG_VECKODAG = { 1:'måndagar', 2:'tisdagar', 3:'onsdagar', 4:'torsdagar', 5:'fredagar' };
function gbgNatt() {
  const N = GBG_NATT, S = N.stad;
  const gTal = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const nattandel = Math.round(S.nattstad / S.poster * 100);
  const varannan = S.uddaBara + S.jamnBara;
  const varannanAndel = Math.round(varannan / S.poster * 100);
  const toppDag = Object.entries(S.dagar).sort((a, b) => b[1] - a[1])[0];
  const natttid = (S.tider.find(t => /^2–/.test(t.tid)) || S.tider[1] || {});
  const morgon  = S.tider[0] || {};
  const dygn = (N.granser.find(g => g.namn === '24 tim') || {}).antal || 0;
  const halvtimme = (N.granser.find(g => g.namn === '30 min') || {}).antal || 0;
  const sections =
    '<section class="card"><h2>Kan bilen stå kvar till i morgon?</h2>' +
    '<p>I Göteborg avgörs det av två saker: <b>städningen</b> och <b>tidsgränsen</b> på platsen. ' +
    `Appens Natt-läge räknar ihop båda och färgar bara de gator som håller hela natten. ` +
    `<a href="https://parkspot.se/?stad=goteborg">Öppna kartan</a>, välj <b>Natt</b> och sök på din adress.</p>` +
    '<p>' + GBG_FORBEHALL + '</p></section>' +
    '<section class="card"><h2>Städningen: mitt på dagen för de flesta – men inte för alla</h2>' +
    `<p>Kommunen har <b>${gTal(S.poster)} städsträckor</b>. De allra flesta städas mitt på dagen – ` +
    `<b>${gTal(morgon.antal || 0)}</b> sträckor klockan ${esc(morgon.tid || '')} – och dem hinner du flytta bilen ifrån på morgonen. ` +
    `Men <b>${gTal(S.nattstad)} sträckor (${nattandel} %) börjar före klockan 8</b>, och den vanligaste nattiden är ` +
    `<b>klockan ${esc(natttid.tid || '')}</b> med ${gTal(natttid.antal || 0)} sträckor. Står bilen kvar då är den i vägen ` +
    'mitt i natten, inte på morgonen.</p>' +
    `<p>Städningen går dessutom oftast <b>varannan vecka</b>: ${gTal(varannan)} av sträckorna (${varannanAndel} %) städas bara jämna ` +
    `eller bara udda veckor, medan ${gTal(S.varjeVecka)} städas varje vecka. Vanligaste veckodagen är ` +
    `<b>${GBG_VECKODAG[toppDag[0]] || 'tisdagar'}</b> (${gTal(toppDag[1])} sträckor). ParkSpot räknar veckonumret åt dig, ` +
    'så du slipper räkna ut om det är jämn vecka på söndag kväll.</p>' +
    '<p><a href="/stadgator-goteborg">Mer om städdagarna i Göteborg →</a></p></section>' +
    '<section class="card"><h2>Tidsgränsen kan ta slut medan du sover</h2>' +
    `<p>Av de <b>${gTal(N.tidsbegransade)} tidsbegränsade sträckorna</b> har ${gTal(halvtimme)} bara <b>30 minuter</b> – ` +
    `det är ärenden, inte nattparkering. Bara <b>${gTal(dygn)} sträckor tillåter ett helt dygn</b>. ` +
    'Däremellan ligger en, två och fyra timmar, som alla tar slut före morgonen om du ställer bilen på kvällen.</p>' +
    `<p>En viktig nyans: på <b>${gTal(N.villkorVardag)} sträckor gäller tidsgränsen bara vardagar</b>, ofta «vardag utom dag före ` +
    'sön- och helgdag». Där är natten och helgen alltså fria trots att skylten visar en siffra. ' +
    'ParkSpot läser villkoret och visar nedräkningen bara när gränsen faktiskt gäller.</p></section>' +
    '<section class="card"><h2>Boendeparkering är ett undantag, inte ett förbud</h2>' +
    `<p>Göteborg har <b>${gTal(N.boende)} sträckor med boendeparkering</b>. Zonen är inget förbud för dig som gäst: utan tillstånd ` +
    'gäller skyltens vanliga tid, med tillstånd får den boende stå upp till 14 dygn. Ett <b>n</b> efter zonkoden ' +
    '(till exempel V5n) betyder att tillståndet bara gäller kvällar och nätter, ungefär 18–09.</p>' +
    '<p><a href="/boendeparkering-goteborg">Så fungerar boendeparkeringen →</a></p></section>' +
    '<section class="card"><h2>Tre råd för natten</h2>' +
    '<ul><li><b>Välj en gata utan städning de närmaste dygnen.</b> Appen skriver ut nästa städdag på platskortet.</li>' +
    '<li><b>Kolla veckoparitet på söndag kväll.</b> Natten mot måndag tillhör den nya veckan – där byter jämn och udda plats.</li>' +
    '<li><b>Är gatan tidsbegränsad, läs villkoret.</b> Gäller gränsen bara vardagar är fredag kväll till måndag morgon ofta fri.</li></ul>' +
    `<p>Ska bilen stå flera dygn är en <a href="/parkeringsanlaggningar-goteborg">parkeringsanläggning</a> nästan alltid tryggare än gatan.</p></section>`;
  const faq = [
    { q:'Får man parkera gratis på natten i Göteborg?', a:`Ofta, men inte alltid – avgiftstiden står på skylten och skiljer sig mellan gator. Det som avgör om bilen kan stå kvar är städningen och tidsgränsen, inte priset. ${gTal(S.nattstad)} städsträckor börjar före klockan 8.` },
    { q:'Hur vet jag om det är jämn eller udda vecka?', a:`ParkSpot räknar ut veckonumret och visar bara städningar som gäller den vecka du frågar om. ${gTal(S.uddaBara + S.jamnBara)} av ${gTal(S.poster)} sträckor städas varannan vecka, så det är regel snarare än undantag i Göteborg.` },
    { q:'Hur länge får jag stå på en tidsbegränsad plats över natten?', a:`Det beror på villkoret. Bara ${gTal(dygn)} sträckor tillåter ett helt dygn, men på ${gTal(N.villkorVardag)} sträckor gäller gränsen bara vardagar – då är natten fri. Appen visar nedräkningen bara när gränsen faktiskt gäller.` },
    { q:'Kan ParkSpot visa var jag inte får stå i Göteborg?', a:'Nej. Staden publicerar inga parkeringsförbud i sin öppna data. Appen visar var du får stå enligt kommunens parkeringsdata, och en gata utan färg betyder att uppgift saknas.' },
    { q:'Behöver jag flytta bilen före klockan 7?', a:`Bara om gatan har en nattstädning. Den vanligaste nattiden är klockan ${esc(natttid.tid || '')}, och ${gTal(natttid.antal || 0)} sträckor har just den. Appens Natt-läge undviker dem åt dig.` },
  ];
  emit('parkering-over-natten-goteborg', layout({
    slug:'parkering-over-natten-goteborg',
    title:'Parkera över natten i Göteborg – städning och tider',
    desc:'Kan bilen stå kvar till i morgon? Se vilka gator i Göteborg som städas på natten, hur jämna och udda veckor fungerar och var tidsgränsen tar slut.',
    h1:'Parkera över natten i Göteborg',
    lead:'Städningen och tidsgränsen avgör – här är siffrorna, och hur du hittar en gata som håller hela natten.',
    sections, faq, related: gbgRelated('parkering-over-natten-goteborg'), lat:null, lng:null, match:null, stad:GBG }));
}

function gbgPillar() {
  const tot = GBG_OMR.reduce((s, o) => s + o.stracker, 0);
  const omrLista = GBG_OMR.map(o =>
    '<li><a href="/parkering-goteborg/' + o.slug + '">' + esc(o.namn) + '</a> – zon ' + esc(o.zoner.join(', ')) + ', ' + o.gator + ' gator</li>').join('');
  const sections =
    '<section class="card"><h2>Parkering i Göteborg på karta</h2>' +
    '<p>ParkSpot visar var det är lagligt att parkera på gatan i Göteborg – <b>just nu</b> eller <b>över natten</b>. Underlaget är Göteborgs Stads öppna data: städdagar per gata, tidsgränser, boendezoner, taxor och parkeringsanläggningar.</p>' +
    '<p>' + GBG_FORBEHALL + '</p></section>' +
    '<section class="card"><h2>Tre saker som skiljer Göteborg från Stockholm</h2><ul>' +
    '<li><b>Städningen går på jämna och udda veckor.</b> I Stockholm städas en gata samma veckodag varje vecka. I Göteborg städas de flesta gator <b>varannan</b> vecka – och vilken vecka det är avgör om du får stå kvar.</li>' +
    '<li><b>Tidsgränsen står i registret.</b> Göteborg anger hur länge du får stå, från 30 minuter till 7 dygn. Det gör att appen kan skilja en halvtimmesficka från en plats du kan lämna bilen på över natten.</li>' +
    '<li><b>Inga förbudsuppgifter.</b> Stockholm publicerar var man <i>inte</i> får stå. Göteborg gör inte det.</li>' +
    '</ul></section>' +
    '<section class="card"><h2>Boendeparkeringsområden</h2><p>Göteborg har ' + GBG_OMR.length + ' boendeparkeringsområden med totalt ' + tot + ' registrerade gatusträckor. Zonkoden på skylten – till exempel <b>Ö6</b> – består av områdets bokstav och ett taxenummer.</p><ul>' + omrLista + '</ul></section>';
  const faq = [
    { q:'Visar ParkSpot var man inte får parkera i Göteborg?', a:'Nej. Göteborg publicerar inga parkeringsförbud i sin öppna data. Appen visar var du får stå enligt registret – en gata utan färg betyder att uppgift saknas, inte att det är fritt.' },
    { q:'Vad betyder jämna och udda veckor?', a:'De flesta gator i Göteborg städas varannan vecka. Skylten anger vilken. ParkSpot räknar ut vilken vecka det är och visar bara den städning som faktiskt gäller.' },
    { q:'Kostar ParkSpot något?', a:'Nej, gratis och utan inloggning. Bygger på Göteborgs Stads öppna data.' },
  ];
  emit('parkering-goteborg', layout({
    slug:'parkering-goteborg', title:'Parkering i Göteborg – var får du parkera? | ParkSpot',
    desc:'Se på karta var du får parkera i Göteborg – nu eller över natten. Städdagar med jämna och udda veckor, tidsgränser, boendezoner och parkeringsanläggningar.',
    h1:'Parkering i Göteborg',
    lead:'Var får du stå, hur länge, och när städas gatan? ParkSpot visar det på karta – byggt på Göteborgs Stads öppna data.',
    sections, faq, related: gbgRelated('parkering-goteborg'), lat:null, lng:null, match:null, stad:GBG }));
}

function gbgStadgator() {
  const sections =
    '<section class="card"><h2>Städdagar i Göteborg – och varför veckan avgör</h2>' +
    '<p>Göteborg städar de flesta gator <b>varannan vecka</b>. Skylten säger till exempel «Onsdag 09–12 udda veckor». Står du där en udda vecka blir det böter; en jämn vecka händer ingenting.</p>' +
    '<p>Det gör Göteborg svårare än Stockholm att hålla reda på – veckodagen räcker inte, du måste veta vilket veckonummer det är. ParkSpot räknar ut det och visar bara den städning som gäller den här veckan.</p></section>' +
    '<section class="card"><h2>Vanliga tidsfönster</h2><p>Tre fönster täcker nästan all städning i Göteborg:</p><ul>' +
    '<li><b>09–12</b> – vanligast, oftast i bostadsområden</li>' +
    '<li><b>02–07</b> – nattstädning, framför allt i centrala lägen</li>' +
    '<li><b>08–10</b> – morgonstädning</li></ul>' +
    '<p>Ett fönster som börjar före klockan sju är det som gör en gata olämplig att lämna bilen på över natten – du hinner inte flytta den.</p></section>' +
    '<section class="card"><h2>Säsong</h2><p>En del gator städas bara delar av året, till exempel 1 oktober–30 april eller 15 mars–30 april. Utanför den perioden är de inte städgator. ParkSpot räknar bort dem när de vilar, och skriver ut när de vaknar igen.</p></section>' +
    '<section class="card"><h2>Att tänka på</h2><p>' + GBG_FORBEHALL + '</p></section>';
  const faq = [
    { q:'Hur vet jag om det är jämn eller udda vecka?', a:'ParkSpot räknar ut veckonumret enligt svensk standard och visar bara den städning som gäller. På platskortet står det till exempel «Servas onsdagar 09–12 udda veckor».' },
    { q:'Gäller boendetillstånd under städningen?', a:'Nej. Är parkering förbjuden en viss tid för städning gäller inte boendetillståndet under den tiden – det står uttryckligen i Göteborgs föreskrift om boendeparkering.' },
    { q:'Städas alla gator i Göteborg?', a:'Nej. Registret innehåller cirka 470 gator med städdagar. En gata utan städuppgift kan ändå ha en skylt – kontrollera på plats.' },
    framatFaq('goteborg'),
  ];
  emit('stadgator-goteborg', layout({
    slug:'stadgator-goteborg', title:'Städdagar i Göteborg – jämna och udda veckor | ParkSpot',
    desc:'Så fungerar städdagar i Göteborg: de flesta gator städas varannan vecka. Se vilka gator som städas den här veckan på karta.',
    h1:'Städdagar i Göteborg',
    lead:'Göteborg städar varannan vecka. Veckodagen räcker inte – du måste veta vilken vecka. ParkSpot räknar ut det.',
    sections, faq, related: gbgRelated('stadgator-goteborg'), lat:null, lng:null, match:null, stad:GBG }));
}

function gbgBoende() {
  const omrLista = GBG_OMR.map(o =>
    '<li><a href="/parkering-goteborg/' + o.slug + '">' + esc(o.namn) + '</a> – ' + esc(o.zoner.join(', ')) + '</li>').join('');
  const sections =
    '<section class="card"><h2>Vad boendeparkering betyder i Göteborg</h2>' +
    '<p>Ett boendetillstånd är ett <b>undantag från tidsgränsen</b> på platsen – inte ett förbud för alla andra. Står det «P 2 tim» och «Boende Ö6» på skylten gäller:</p><ul>' +
    '<li><b>Utan tillstånd:</b> 2 timmar</li>' +
    '<li><b>Med Ö6-tillstånd</b> (eller ett med högre taxenummer): upp till 14 dygn i följd</li></ul>' +
    '<p>Zonkoden består av områdets bokstav och ett taxenummer. Ö6 betyder område Öster, taxa 6.</p></section>' +
    '<section class="card"><h2>Bokstaven n – tillståndet som bara gäller på natten</h2>' +
    '<p>Står det ett <b>n</b> efter taxenumret, till exempel <b>V5n</b>, gäller tillståndet bara kvällar och nätter: från klockan 18 till 09 påföljande dag, och från klockan 15 dagen före sön- och helgdag.</p>' +
    '<p>Dagtid har den boende alltså <b>samma tidsgräns som alla andra</b>. Det är lätt att missa, och det gäller ungefär var fjärde boendesträcka i staden.</p></section>' +
    '<section class="card"><h2>Städning slår ut tillståndet</h2><p>Är parkering förbjuden en viss tid för städning gäller boendetillståndet inte under den tiden. Det står uttryckligen i föreskriften.</p></section>' +
    '<section class="card"><h2>Områden och zoner</h2><ul>' + omrLista + '</ul></section>' +
    '<section class="card"><h2>Att tänka på</h2><p>' + GBG_FORBEHALL + '</p></section>';
  const faq = [
    { q:'Får jag parkera på en boendeparkering utan tillstånd?', a:'Ja, men bara så länge skyltens tidsgräns säger. Boendetillståndet är ett undantag från den gränsen för den som har det – inte ett förbud för övriga.' },
    { q:'Vad betyder n i till exempel M4n?', a:'Att tillståndet bara gäller kvällar och nätter, ungefär 18–09, samt från klockan 15 dagen före sön- och helgdag. Dagtid gäller platsens vanliga tidsgräns även för boende.' },
    { q:'Hur länge får jag stå med tillstånd?', a:'Högst 14 dygn i följd på samma plats.' },
    framatFaq('goteborg'),
  ];
  emit('boendeparkering-goteborg', layout({
    slug:'boendeparkering-goteborg', title:'Boendeparkering Göteborg – zoner, pris och n-koden',
    desc:'Zonkoder som Ö6 och V5n, vad som gäller utan tillstånd och varför n betyder kväll och natt. Med tillstånd får du stå upp till 14 dygn.',
    h1:'Boendeparkering i Göteborg',
    lead:'Ö6, M4n, V5 – vad betyder koderna på skylten, och vad gäller för dig som inte har tillstånd?',
    sections, faq, related: gbgRelated('boendeparkering-goteborg'), lat:null, lng:null, match:null, stad:GBG }));
}

function gbgAnlaggningar() {
  const sections =
    '<section class="card"><h2>Parkeringsanläggningar i Göteborg</h2>' +
    '<p>När gatan är full finns drygt 900 avgiftsbelagda anläggningar i Göteborg – p-hus och parkeringsytor. De allra flesta drivs av Göteborgs Stads Parkering.</p>' +
    '<p>ParkSpot visar kapacitet, vem som driver anläggningen och <b>vad det kostar just nu</b>. Priset räknas ut ur stadens egna prisfönster, eftersom det växlar över dygnet: många anläggningar har ett högre pris mellan 08 och 22 och ett lågt pris övrig tid.</p></section>' +
    '<section class="card"><h2>Ingen realtid på lediga platser</h2>' +
    '<p>Siffran som visas är <b>kapacitet</b>, inte lediga platser. Göteborg publicerar inget realtidsvärde för beläggning – fältet finns i stadens API men är tomt. ParkSpot visar därför aldrig «X lediga just nu», eftersom den uppgiften inte existerar.</p></section>' +
    '<section class="card"><h2>Att tänka på</h2><p>' + GBG_FORBEHALL + '</p></section>';
  const faq = [
    { q:'Visar ParkSpot lediga platser i realtid?', a:'Nej. Siffran är anläggningens kapacitet. Göteborg publicerar ingen realtidsuppgift om beläggning.' },
    { q:'Varför skiljer sig priset mot skylten?', a:'Priset som visas gäller den aktuella timmen. De flesta anläggningar har ett högre dagpris 08–22 och ett lägre pris övrig tid.' },
  ];
  emit('parkeringsanlaggningar-goteborg', layout({
    slug:'parkeringsanlaggningar-goteborg', title:'Parkering i garage i Göteborg – pris och platser',
    desc:'Drygt 900 avgiftsparkeringar i Göteborg med kapacitet, operatör och aktuellt timpris. Se dem på karta när gatan är full.',
    h1:'Parkeringsanläggningar i Göteborg',
    lead:'När gatan är full. Kapacitet, operatör och vad det kostar just nu.',
    sections, faq, related: gbgRelated('parkeringsanlaggningar-goteborg'), lat:null, lng:null, match:null, stad:GBG }));
}

function gbgOmrade(o) {
  const natt = o.zoner.filter(z => /n$/.test(z));
  const dag  = o.zoner.filter(z => !/n$/.test(z));
  const gatuLista = o.toppgator.length
    ? '<section class="card"><h2>Gator i ' + esc(o.namn) + '</h2><p>Ett urval av gatorna med registrerad parkering här:</p><ul>' +
      o.toppgator.map(g => '<li>' + esc(g) + '</li>').join('') + '</ul></section>'
    : '';
  const nattText = natt.length
    ? ' samt nattvarianterna <b>' + esc(natt.join(', ')) + '</b>'
    : '';
  const nattForklaring = natt.length
    ? '<p>Ett <b>n</b> efter taxenumret betyder att tillståndet bara gäller mellan klockan 18 och 09, samt från klockan 15 dagen före sön- och helgdag. Dagtid gäller platsens vanliga tidsgräns även för boende.</p>'
    : '';
  const sections =
    '<section class="card"><h2>Parkering i ' + esc(o.namn) + '</h2><p>' + esc(o.namn) + ' är ett av Göteborgs boendeparkeringsområden. Registret innehåller ' + o.stracker + ' gatusträckor fördelade på ' + o.gator + ' gator, varav ' + o.medStadning + ' har registrerade städdagar.</p></section>' +
    '<section class="card"><h2>Zoner här</h2><p>Zonkoderna i ' + esc(o.namn) + ' är <b>' + esc(dag.join(', ')) + '</b>' + nattText + '.</p>' + nattForklaring +
    '<p>Utan tillstånd gäller den tid som står på skylten. Med tillstånd för zonen får du stå upp till 14 dygn i följd.</p></section>' +
    gatuLista +
    '<section class="card"><h2>Att tänka på</h2><p>' + GBG_FORBEHALL + '</p></section>';
  const faq = [
    { q: 'Vilka boendezoner finns i ' + o.namn + '?', a: o.zoner.join(', ') + '. Bokstaven anger området och siffran taxenumret; ett n betyder att tillståndet bara gäller kvällar och nätter.' },
    { q: 'Städas gatorna i ' + o.namn + ' varje vecka?', a: 'De flesta gator i Göteborg städas varannan vecka – jämna eller udda. Skylten anger vilken, och ParkSpot räknar ut om det gäller den här veckan.' },
  ];
  emit('parkering-goteborg/' + o.slug, layout({
    slug:'parkering-goteborg/' + o.slug,
    title:'Parkering i ' + o.namn + ' – zoner och städdagar',
    desc:'Parkering i ' + o.namn + ': boendezoner ' + o.zoner.join(', ') + ', ' + o.gator + ' gator med registrerad parkering och ' + o.medStadning + ' med städdagar. Se på karta.',
    h1:'Parkering i ' + o.namn,
    lead:'Boendezoner, städdagar och tidsgränser i ' + o.namn + ' – på karta.',
    sections, faq, related: gbgRelated(null), lat:o.lat, lng:o.lng, match:null, stad:GBG }));
}

aboutPage();
pillarSummer(); pillarTaxa(); [1,2,3,4,5].forEach(taxaPage); pillarStadgator(); pillarOverNatten(); pillarGarages(); pillarEnglish();
pillarHubs(); englishHub();
DISTRICTS.forEach(d => { districtHub(d); billigare(d); overNatten(d); stadgator(d); });
DESTINATIONS.forEach(destination);
DESTINATIONS.forEach(destinationEN);
STREETS.forEach(streetPage);

gbgPillar(); gbgNatt(); gbgStadgator(); gbgBoende(); gbgAnlaggningar();
GBG_OMR.forEach(gbgOmrade);
upsPillar(); upsAvgifter(); upsNatt(); upsGarage();
UPS_DATA.stadsdelar.forEach(upsStadsdel);
ksdPillar(); ksdAvgifter(); ksdServicedagar(); ksdNatt();

fs.writeFileSync(path.join(__dirname, 'pages.json'), JSON.stringify(pages, null, 0));
console.log(`[seo] Genererade ${pages.length} sidor i seo/site/`);
// Räkna ut hur många sidor som faktiskt ändrades. Utan den här raden märker man inte
// att lastmod-kontrollen slutat fungera – den felar tyst genom att stämpla allt som nytt,
// vilket är exakt det beteende den skulle ta bort.
console.log(`[seo] pages.json uppdaterad – ${rakn.andrade} sida(or) ändrades och fick dagens `
          + `lastmod, ${rakn.oforandrade} var oförändrade och behöll sitt datum`);
