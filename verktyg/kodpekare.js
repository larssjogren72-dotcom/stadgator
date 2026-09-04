#!/usr/bin/env node
/**
 * kodpekare.js - haller siffrorna och radhanvisningarna i docs/arkitektur.html
 * i takt med koden.
 *
 * VARFOR: sidan pastod "0 av 7 613 rader" och "9 552 rader i tre filer" langt efter
 * att bada siffrorna slutat stamma. Handpassning ar inte ett problem med disciplin -
 * det ar ett problem med att pekare blir tysta lognare vid varje commit. Uppmatt
 * 2026-09-02: sex av femton siffror pa sidan var fel, och en av dem var fel i en
 * SVG-etikett som ingen tittar pa.
 *
 * MEN OCKSA: sidan bar PASTAENDEN som kan bli falska, inte bara siffror. Skriptet
 * kontrollerar darfor ocksa att "inte en enda regel fragar vilken stad det ar"
 * fortfarande ar sant - och skriver om meningen om det inte ar det. Ett pastaende
 * som tyst blir falskt ar farligare an en siffra som slutar stamma.
 *
 * Kor:
 *   node verktyg/kodpekare.js           -> KONTROLL. Rapporterar drift, avslutar 1.
 *   node verktyg/kodpekare.js --skriv   -> skriver in de aktuella siffrorna.
 *
 * Kontrollen ar det som gor det har varaktigt: den kan sta som grind, och da kan
 * pekarna inte glida isar utan att nagon far veta.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROT = path.join(__dirname, '..');
const SIDA = path.join(ROT, 'docs', 'arkitektur.html');

const SKRIV = process.argv.includes('--skriv');

// ─────────────────────────────────────────────────────────────────────────────
// 1. MAT FAKTA UR ARBETSMAPPEN
// ─────────────────────────────────────────────────────────────────────────────

function las(rel) {
  return fs.readFileSync(path.join(ROT, rel), 'utf8');
}

// Radantal raknas som `wc -l` gor det: antal radbrytningar. En fil utan avslutande
// radbrytning raknas da en for lagt - det ar samma matt sidan alltid anvant, och
// att byta matt nu hade sett ut som en kodandring i diffen.
function radantal(rel) {
  return las(rel).split('\n').length - 1;
}

// Radnummer for en funktion. Kravet ar EXAKT trafft pa deklarationen, inte forsta
// forekomsten av namnet: `fetchSuggestions` namns ocksa dar den anropas, och en
// pekare till anropsstallet hade varit fel utan att se fel ut.
function radFor(rel, monster) {
  const rader = las(rel).split('\n');
  const i = rader.findIndex(r => monster.test(r));
  if (i < 0) throw new Error(`Hittar inte ${monster} i ${rel}. Har den bytt namn?`);
  return i + 1;
}

function siffra(n) {
  // Svenskt tusentalsmellanrum, samma som sidan redan anvander.
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Stallen dar klienten fragar vilken stad det ar. Pastaendet pa sidan bygger pa att
// detta ar noll i REGELMOTORN. Trafffar utanfor den ar inte automatiskt fel - dela-
// lanken maste veta staden - men de ska synas, inte forsvinna.
function stadsfragor() {
  const rader = las('index.html').split('\n');
  const monster = /STAD\.id\s*===|STAD\.id\s*==|===\s*'(goteborg|sundbyberg|stockholm)'/;
  const traffar = [];
  rader.forEach((r, i) => {
    if (monster.test(r)) traffar.push({ rad: i + 1, text: r.trim().slice(0, 90) });
  });
  return traffar;
}

// Stader vars kod finns i huvudversionen men som INTE ar lanserade. Arkitektursidan
// beskriver appen som den ar i drift, sa deras rader raknas inte - och deras filnamn
// namns darfor inte heller pa sidan. Utan den har listan hade Malmos 52 rader
// konfiguration hamnat i "stadsspecifikt" medan cities/malmo.js inte gjorde det, och
// sidan hade publicerat en summa som inte gick ihop.
// Vid lansering: ta bort staden harifran och lagg till dess adapter i mat() nedan.
const EJ_LANSERADE = ['malmo'];

// Hur manga rader upptar en stads block i STADER_CFG? Blocket borjar pa
// "STADER_CFG.<id> =" och slutar dar nasta block (eller STAD-raden) borjar.
function konfigBlockRader(id) {
  const rader = las('index.html').split('\n');
  const start = rader.findIndex(r => new RegExp(`^STADER_CFG\\.${id}\\s*=`).test(r));
  if (start < 0) return 0;                       // staden finns inte langre - inget att dra av
  let slut = rader.length;
  for (let i = start + 1; i < rader.length; i++) {
    if (/^STADER_CFG\./.test(rader[i]) || /^const STAD = STADER_CFG\[/.test(rader[i])) { slut = i; break; }
  }
  return slut - start;
}

function mat() {
  // TVA olika tal om index.html, med flit:
  //   index      = filens FAKTISKA langd. Sidan pastar "index.html ar N rader i en
  //                fil", och det pastaendet ska vara sant om filen pa disk.
  //   indexRakn  = samma minus de ej lanserade stadernas konfiguration. Anvands i
  //                delad/stadsspecifik-uppdelningen, dar de raderna varken hor hemma
  //                som delade (mest missvisande) eller som stadsspecifika (skulle
  //                namna en stad som inte finns i drift).
  const ejLanseradeRader = EJ_LANSERADE.reduce((s, id) => s + konfigBlockRader(id), 0);
  const index = radantal('index.html');
  const indexRakn = index - ejLanseradeRader;
  const server = radantal('server.js');
  const gbg = radantal('cities/goteborg.js');
  const sbg = radantal('cities/sundbyberg.js');

  const konfigStart = radFor('index.html', /^const STADER_CFG = \{\};/);
  const konfigSlut = radFor('index.html', /^const STAD = STADER_CFG\[/);
  const konfig = konfigSlut - konfigStart + 1 - ejLanseradeRader;

  const adaptrar = gbg + sbg;
  const stadsspec = konfig + adaptrar;
  const alla = indexRakn + server + gbg + sbg;
  const delad = alla - stadsspec;

  const paket = JSON.parse(las('package.json'));
  const nu = new Date();
  const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun',
               'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const MAN_LANG = ['januari', 'februari', 'mars', 'april', 'maj', 'juni',
                    'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

  return {
    index, server, gbg, sbg, alla, konfig, konfigStart, konfigSlut,
    adaptrar, stadsspec, delad,
    deladProcent: Math.round((delad / alla) * 100),
    stadsProcent: Math.round((stadsspec / alla) * 100),
    version: paket.version,
    datumKort: `${nu.getDate()} ${MAN[nu.getMonth()]} ${nu.getFullYear()}`,
    datumLangt: `${nu.getDate()} ${MAN_LANG[nu.getMonth()]} ${nu.getFullYear()}`,
    radFetch: radFor('index.html', /^async function fetchSuggestions\(/),
    radSok: radFor('index.html', /^async function searchStreet\(/),
    radFly: radFor('index.html', /^function flyToAndShow\(/),
    fragor: stadsfragor(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. VAD VARJE MARKERING SKA INNEHALLA
// ─────────────────────────────────────────────────────────────────────────────

// Ar den enda traffen dela-lanken? Det ar det ENDA undantag sidan far namna vid
// namn. Kanns den inte igen ber sidan om mansklig kontroll i stallet.
function baraDelalanken(fragor) {
  return fragor.every(t => /delaUrl|parkspot\.se\//.test(t.text));
}

function texter(f) {
  const fr = f.fragor.length;
  return {
    version_text: `Live: v${f.version} · parkspot.se`,
    datum_text: `Beskriver koden ${f.datumKort}`,
    alla_rader_text: `${siffra(f.alla)} rader i fyra filer`,

    index_rader_text: `${siffra(f.index)} rader`,
    gbg_rader_text: `prefix /gbg/ · ${siffra(f.gbg)} rader`,
    sbg_rader_text: `prefix /sbg/ · ${siffra(f.sbg)} rader`,

    delad_text: `Delad grund · ${siffra(f.delad)} rader · ${f.deladProcent} %`,
    stadsspec_text: `Per stad · ${siffra(f.stadsspec)} rader · ${f.stadsProcent} %`,
    stadsspec_rader_text: `${siffra(f.stadsspec)} rader`,
    uppdelning_text: `STADER_CFG ${f.konfig} + cities/*.js ${siffra(f.adaptrar)}`,

    // Pastaendet foljer matningen. Blir det fler traffar an dela-lanken ska sidan
    // saga det rakt ut i stallet for att fortsatta pasta noll.
    //
    // ⚠ SKRIPTET FAR ALDRIG PASTA VAR TRAFFARNA SITTER. Att en rad namner staden
    // sager ingenting om huruvida den ar en REGEL - och det ar regler pastaendet
    // handlar om. Bara det kanda undantaget (dela-lanken, som maste veta staden for
    // att bygga adressen) far namnas vid namn, och bara nar det ar den enda traffen.
    // I alla andra lagen ber sidan om mansklig kontroll i stallet for att gissa.
    stadsfragor_text: fr === 0
      ? `0 av ${siffra(f.index)} rader i klienten frågar «är det här Göteborg?»`
      : `${fr} av ${siffra(f.index)} rader i klienten frågar vilken stad det är`,
    stadsfragor_mening: fr === 0
      ? 'i hela <code>index.html</code> finns inte en enda regel som frågar vilken stad det är'
      : (fr === 1 && baraDelalanken(f.fragor))
        ? 'i hela <code>index.html</code> frågar en enda rad vilken stad det är, och den '
          + 'sitter inte i regelmotorn utan i dela-länken, som måste veta staden för att '
          + 'kunna bygga adressen'
        : `i <code>index.html</code> frågar ${siffra(fr)} rader vilken stad det är — `
          + 'kontrollera att ingen av dem sitter i regelmotorn',

    rad_fetchSuggestions: `fetchSuggestions() · rad ${f.radFetch}`,
    rad_searchStreet: `searchStreet() · rad ${f.radSok}`,
    rad_flyToAndShow: `rad ${f.radFly}`,
    konfig_rader_text: `index.html · rad ${f.konfigStart}–${f.konfigSlut}`,

    index_en_fil_text: `index.html är ${siffra(f.index)} rader i en fil.`,
    fot_text: `Kodpekarna är verifierade mot arbetsmappen ${f.datumLangt} · `
      + `index.html ${siffra(f.index)} rader · server.js ${f.server} · `
      + `cities/goteborg.js ${f.gbg} · cities/sundbyberg.js ${f.sbg}`,
  };
}

function ariatexter(f) {
  return {
    delning: `Av ${siffra(f.alla)} rader kod är ${siffra(f.delad)} delad grund och `
      + `${siffra(f.stadsspec)} stadsspecifika: ${siffra(f.konfig)} rader konfiguration `
      + `i klienten plus ${siffra(f.adaptrar)} rader adaptrar på servern. Den `
      + 'stadsspecifika delen innehåller bara översättning, inga regler.',
  };
}

// Stapeldiagrammet: BREDDEN kodar andelen. Uppdateras inte den ljuger bilden medan
// etiketterna stammer - varre an att bada ar gamla, for da ser felet ratt ut.
// Hela layouten foljer av en enda siffra: hur bred den delade stapeln ar.
function geometri(f) {
  const X0 = 40, X1 = 720, BREDD = X1 - X0;
  const delad = Math.round(BREDD * (f.delad / f.alla));
  const stadX = X0 + delad;
  const stadBredd = X1 - stadX;
  return {
    delad_stapel: { width: String(delad) },
    stad_stapel: { x: String(stadX), width: String(stadBredd) },
    delad_etikett: { x: String(X0 + Math.round(delad / 2)) },
    stad_streck: { d: `M ${stadX + Math.round(stadBredd / 2)} 106 V 126 H ${X1}` },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. LAS UT, SKRIV IN
// ─────────────────────────────────────────────────────────────────────────────

function elementRegex(nyckel) {
  // Fangar <tagg ... data-kod="nyckel" ...>INNEHALL</tagg>. Bakreferensen pa
  // taggnamnet gor att ratt slut-tagg traffas aven nar flera element ligger nara.
  return new RegExp(`(<(\\w+)([^>]*\\bdata-kod="${nyckel}"[^>]*)>)([\\s\\S]*?)(</\\2>)`);
}

function lasUt(html, nyckel) {
  const m = html.match(elementRegex(nyckel));
  return m ? m[4] : null;
}

function skrivIn(html, nyckel, text) {
  return html.replace(elementRegex(nyckel), (_, oppna, tagg, attr, gammal, stang) =>
    oppna + text + stang);
}

function lasAria(html, namn) {
  const m = html.match(new RegExp(`<[^>]*\\bdata-kod-aria="${namn}"[^>]*>`));
  if (!m) return null;
  const a = m[0].match(/\baria-label="([^"]*)"/);
  return a ? a[1] : null;
}

function skrivAria(html, namn, text) {
  return html.replace(new RegExp(`<[^>]*\\bdata-kod-aria="${namn}"[^>]*>`), tagg =>
    tagg.replace(/\baria-label="[^"]*"/, `aria-label="${text}"`));
}

function lasGeom(html, namn, attr) {
  const m = html.match(new RegExp(`<[^>]*\\bdata-kod-geom="${namn}"[^>]*>`));
  if (!m) return null;
  const a = m[0].match(new RegExp(`\\b${attr}="([^"]*)"`));
  return a ? a[1] : null;
}

function skrivGeom(html, namn, attr, varde) {
  return html.replace(new RegExp(`<[^>]*\\bdata-kod-geom="${namn}"[^>]*>`), tagg =>
    tagg.replace(new RegExp(`\\b${attr}="[^"]*"`), `${attr}="${varde}"`));
}

// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const f = mat();
  const vantat = texter(f);
  const aria = ariatexter(f);
  const geom = geometri(f);

  let html = fs.readFileSync(SIDA, 'utf8');
  const avvikelser = [];
  const saknade = [];

  for (const [nyckel, text] of Object.entries(vantat)) {
    const nu = lasUt(html, nyckel);
    if (nu === null) { saknade.push(nyckel); continue; }
    if (nu !== text) {
      avvikelser.push({ nyckel, nu, text });
      html = skrivIn(html, nyckel, text);
    }
  }

  for (const [namn, text] of Object.entries(aria)) {
    const nu = lasAria(html, namn);
    if (nu === null) { saknade.push(`aria:${namn}`); continue; }
    if (nu !== text) {
      avvikelser.push({ nyckel: `aria:${namn}`, nu, text });
      html = skrivAria(html, namn, text);
    }
  }

  for (const [namn, attrar] of Object.entries(geom)) {
    for (const [attr, varde] of Object.entries(attrar)) {
      const nu = lasGeom(html, namn, attr);
      if (nu === null) { saknade.push(`geom:${namn}.${attr}`); continue; }
      if (nu !== varde) {
        avvikelser.push({ nyckel: `geom:${namn}.${attr}`, nu, text: varde });
        html = skrivGeom(html, namn, attr, varde);
      }
    }
  }

  console.log('Kodpekare i docs/arkitektur.html\n');
  console.log(`  index.html ${siffra(f.index)} · server.js ${f.server} `
            + `· goteborg ${f.gbg} · sundbyberg ${f.sbg}  =  ${siffra(f.alla)} rader`);
  console.log(`  delad grund ${siffra(f.delad)} (${f.deladProcent} %) `
            + `· per stad ${siffra(f.stadsspec)} (${f.stadsProcent} %)`);
  console.log(`  STADER_CFG rad ${f.konfigStart}-${f.konfigSlut} (${f.konfig} rader)\n`);

  if (f.fragor.length) {
    console.log(`  ⚠ ${f.fragor.length} ställe(n) i index.html frågar vilken stad det är:`);
    f.fragor.forEach(t => console.log(`      rad ${t.rad}: ${t.text}`));
    console.log('    Sitter någon av dem i regelmotorn har gränsen brutits, och');
    console.log('    sidans mening behöver skrivas om för hand.\n');
  }

  if (saknade.length) {
    console.log('  ⚠ Markeringar som inte hittades på sidan:');
    saknade.forEach(n => console.log(`      ${n}`));
    console.log('    Antingen har de tagits bort, eller så har sidan skrivits om.\n');
  }

  if (!avvikelser.length && !saknade.length) {
    console.log('Allt stämmer med koden.');
    return 0;
  }

  // JSON.stringify, inte rå text: en rapport som inte kan visa skillnaden mellan
  // ett vanligt mellanslag och ett hårt hade varit precis lika blind som den
  // handpassning den ersätter. Två rader som ser identiska ut ÄR olika om de
  // hamnat här, och då ska man kunna se var.
  avvikelser.forEach(a => {
    console.log(`  ${a.nyckel}`);
    console.log(`      står:  ${JSON.stringify(a.nu)}`);
    console.log(`      ska:   ${JSON.stringify(a.text)}`);
  });

  if (SKRIV) {
    fs.writeFileSync(SIDA, html);
    console.log(`\n${avvikelser.length} värde(n) uppdaterade i docs/arkitektur.html.`);
    return saknade.length ? 1 : 0;
  }

  console.log(`\n${avvikelser.length} värde(n) stämmer inte med koden. `
            + 'Kör med --skriv för att rätta.');
  return 1;
}

process.exit(main());
