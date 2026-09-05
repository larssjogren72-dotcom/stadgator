/**
 * ParkSpot – feedbackmejl och månadssummering
 * =============================================================================
 * Det här är INTE en del av appen. Koden körs inne i Google, bunden till
 * KALKYLARKET som tar emot feedbackformulärets svar. Den ligger i repot enbart
 * för att den annars bara skulle finnas på ett ställe ingen kan granska.
 *
 * VAR DEN SKA KLISTRAS IN
 *   1. Öppna kalkylarket med formulärsvaren (inte formuläret).
 *   2. Tillägg → Apps Script.
 *   3. Ersätt allt innehåll med den här filen. Spara.
 *   4. Kör funktionen `installera` en gång och godkänn behörigheterna.
 *      Den städar bort skriptets egna gamla schemaläggningar och sätter upp två:
 *      en som lyssnar på nya svar, en som mejlar summeringen den 1:a varje månad.
 *   5. Kör `skickaSummeringNuSedanStart` en gång för det första utskicket.
 *
 * ⚠️ OM DU REDAN FÅR MEJL PÅ RENA TUMMAR
 * `installera` kan bara ta bort schemaläggningar som tillhör DET HÄR
 * skriptprojektet. Finns ett annat, äldre skript någon annanstans (t.ex. bundet
 * till formuläret i stället för arket) fortsätter det skicka. Får du dubbla mejl
 * efter installationen är det förklaringen – då behöver det gamla stängas av för
 * hand under Tillägg → Apps Script i formuläret.
 */

var MOTTAGARE = 'lars.sjogren72@gmail.com';

// Exakt de strängar appen skickar vid ett rent tumme-klick. Ändras texten i
// index.html måste den ändras här också – annars slutar räkningen fungera TYST.
// Det är den enda kopplingen som inte kan verifieras automatiskt.
var KLICK_UPP  = '👍 Gillade appen';
var KLICK_NER  = '👎 Inte helt';
var KOMM_UPP   = '👍💬';
var KOMM_NER   = '👎💬';
// Kommentar utan vald tumme. Uppstår bara via länken "Skicka feedback", där
// tummen är frivillig. Räknas som kommentar men varken som gillad eller ogillad.
var KOMM_UTAN  = '💬';

// =============================================================================
// Tolkning av en rad
// =============================================================================
/**
 * Varje rad är en text som appen byggt ihop:  <meddelande>  ·  läge: <kontext>
 * Returnerar { kansla: 'upp'|'ner'|'okand', arKommentar: bool, text, kontext }
 * eller null om raden inte går att tolka.
 *
 * Sex former, och den sista är historisk:
 *   "👍 Gillade appen …"  → klick, ingen kommentar
 *   "👎 Inte helt …"      → klick, ingen kommentar
 *   "👍💬 <ord> …"        → kommentar från en nöjd användare
 *   "👎💬 <ord> …"        → kommentar från en missnöjd (prefix infört 2026-09-05)
 *   "💬 <ord> …"          → kommentar UTAN vald tumme (direktrutan, 2026-09-05)
 *   "<ord> …"             → GAMMAL data: prefixlös kommentar. Den kunde bara
 *                           uppstå i 👎-flödet, så den räknas som 👎-kommentar.
 *
 * ⚠️ Ordningen spelar roll: "👍💬" och "👎💬" innehåller också "💬", men börjar
 * inte med det. De måste därför prövas FÖRE KOMM_UTAN.
 */
function tolkaRad(raa) {
  var hel = String(raa == null ? '' : raa).trim();
  if (!hel) return null;

  // Kontexten ligger sist, tillagd av appen som "  ·  läge: …".
  var text = hel, kontext = '';
  var brytIndex = hel.indexOf('  ·  läge: ');
  if (brytIndex !== -1) {
    text = hel.slice(0, brytIndex).trim();
    kontext = hel.slice(brytIndex + '  ·  läge: '.length).trim();
  }

  if (text.indexOf(KOMM_UPP) === 0)
    return { kansla: 'upp', arKommentar: true,  text: text.slice(KOMM_UPP.length).trim(), kontext: kontext };
  if (text.indexOf(KOMM_NER) === 0)
    return { kansla: 'ner', arKommentar: true,  text: text.slice(KOMM_NER.length).trim(), kontext: kontext };
  if (text.indexOf(KOMM_UTAN) === 0)
    return { kansla: 'okand', arKommentar: true, text: text.slice(KOMM_UTAN.length).trim(), kontext: kontext };
  if (text.indexOf(KLICK_UPP) === 0)
    return { kansla: 'upp', arKommentar: false, text: '', kontext: kontext };
  if (text.indexOf(KLICK_NER) === 0)
    return { kansla: 'ner', arKommentar: false, text: '', kontext: kontext };

  return { kansla: 'ner', arKommentar: true, text: text, kontext: kontext };
}

/**
 * Plockar tidsstämpel och meddelande ur en rad utan att låsa fast kolumnbokstäver.
 * Tidsstämpeln är den första cellen som är ett datum; meddelandet den längsta
 * textcellen. Formuläret har en enda fråga, så "längst" är entydigt – och det
 * fortsätter fungera om du lägger till ett fält senare.
 */
function plockaUrRad(rad) {
  var nar = null, text = '';
  for (var i = 0; i < rad.length; i++) {
    var v = rad[i];
    if (v instanceof Date) { if (!nar) nar = v; continue; }
    var s = String(v == null ? '' : v);
    if (s.length > text.length) text = s;
  }
  return { nar: nar, text: text };
}

// =============================================================================
// 1. Mejl vid nytt svar – BARA när det finns en kommentar
// =============================================================================
function vidNyttSvar(e) {
  try {
    var rad = (e && e.values) ? e.values : null;
    if (!rad) return;
    var bit = plockaUrRad(rad);
    var tolkad = tolkaRad(bit.text);

    // Rena tummar mejlas inte. De räknas i månadssummeringen i stället.
    if (!tolkad || !tolkad.arKommentar || !tolkad.text) return;

    var symbol = tolkad.kansla === 'upp' ? '👍' : tolkad.kansla === 'ner' ? '👎' : '💬';
    var rubrik = symbol + ' Kommentar i ParkSpot';

    var kansloText = tolkad.kansla === 'upp' ? 'nöjd (tumme upp)'
                   : tolkad.kansla === 'ner' ? 'missnöjd (tumme ner)'
                   : 'ingen tumme vald (skrev bara)';
    var kropp =
      tolkad.text + '\n\n' +
      '— — —\n' +
      'Känsla:  ' + kansloText + '\n' +
      'Kontext: ' + (tolkad.kontext || 'okänd') + '\n' +
      'Tid:     ' + formateraTid(bit.nar || new Date()) + '\n\n' +
      'Skickas bara när någon skrivit något. Antalet tummar kommer i månadssummeringen.';

    MailApp.sendEmail(MOTTAGARE, rubrik, kropp);
  } catch (fel) {
    // Ett trasigt mejl får aldrig hindra att svaret sparas i arket.
    console.error('vidNyttSvar: ' + fel);
  }
}

// =============================================================================
// 2. Månadssummering
// =============================================================================
function manadsSummering() { skickaSummering(false); }
function skickaSummeringNuSedanStart() { skickaSummering(true); }

function skickaSummering(arForsta) {
  var ark = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var varden = ark.getDataRange().getValues();
  if (varden.length < 2) {
    MailApp.sendEmail(MOTTAGARE, 'ParkSpot – ingen feedback ännu',
      'Arket är tomt. Inget att summera.');
    return;
  }

  var perManad = {};      // "2026-09" → { upp, ner }
  var kommentarer = [];   // alla kommentarer, nyast först
  var utanTid = 0;

  for (var i = 1; i < varden.length; i++) {
    var bit = plockaUrRad(varden[i]);
    var tolkad = tolkaRad(bit.text);
    if (!tolkad) continue;

    if (!bit.nar) { utanTid++; continue; }
    var nyckel = Utilities.formatDate(bit.nar, Session.getScriptTimeZone(), 'yyyy-MM');
    if (!perManad[nyckel]) perManad[nyckel] = { upp: 0, ner: 0 };

    // ⚠️ Bara KLICK-raderna räknas. En kommentar skickas som en EGEN rad ovanpå
    // klicket, så att räkna alla rader hade dubbelräknat alla som skrev något.
    // Ett klick är alltid 'upp' eller 'ner' – 'okand' kan bara vara en kommentar.
    if (!tolkad.arKommentar) {
      if (tolkad.kansla === 'upp' || tolkad.kansla === 'ner') perManad[nyckel][tolkad.kansla]++;
    } else {
      kommentarer.push({ nar: bit.nar, kansla: tolkad.kansla, text: tolkad.text, kontext: tolkad.kontext });
    }
  }

  var manader = Object.keys(perManad).sort();
  if (!manader.length) {
    MailApp.sendEmail(MOTTAGARE, 'ParkSpot – inga tummar att summera',
      'Det finns rader i arket men inga tumme-klick med tidsstämpel.');
    return;
  }

  kommentarer.sort(function (a, b) { return b.nar - a.nar; });

  var totUpp = 0, totNer = 0;
  manader.forEach(function (m) { totUpp += perManad[m].upp; totNer += perManad[m].ner; });

  // Senaste hela månaden = den vi rapporterar om i det löpande utskicket.
  var senaste = manader[manader.length - 1];
  var naest   = manader.length > 1 ? manader[manader.length - 2] : null;

  var rader = manader.map(function (m) {
    var r = perManad[m], sum = r.upp + r.ner;
    var andel = sum ? Math.round(100 * r.upp / sum) : 0;
    return '<tr>' +
      '<td style="padding:4px 10px 4px 0">' + m + '</td>' +
      '<td style="padding:4px 10px 4px 0;text-align:right">' + r.upp + '</td>' +
      '<td style="padding:4px 10px 4px 0;text-align:right">' + r.ner + '</td>' +
      '<td style="padding:4px 10px 4px 0;text-align:right">' + (sum ? andel + ' %' : '–') + '</td>' +
      '</tr>';
  }).join('');

  var andelTot = (totUpp + totNer) ? Math.round(100 * totUpp / (totUpp + totNer)) : 0;
  var riktning = '';
  if (naest) {
    var a = andelFor(perManad[naest]), b = andelFor(perManad[senaste]);
    if (a !== null && b !== null) {
      var diff = b - a;
      riktning = '<p>Andelen nöjda gick från <b>' + a + ' %</b> i ' + naest +
                 ' till <b>' + b + ' %</b> i ' + senaste + ' (' +
                 (diff > 0 ? '+' : '') + diff + ' procentenheter).</p>';
    }
  }

  var senasteKomm = kommentarer.filter(function (k) {
    return Utilities.formatDate(k.nar, Session.getScriptTimeZone(), 'yyyy-MM') === senaste;
  });
  var visaKomm = arForsta ? kommentarer.slice(0, 30) : senasteKomm;

  var kommHtml = visaKomm.length
    ? visaKomm.map(function (k) {
        var ikon = k.kansla === 'upp' ? '👍' : k.kansla === 'ner' ? '👎' : '💬';
        return '<p style="margin:0 0 10px 0">' +
          ikon + ' <i>' + escapeHtml(k.text) + '</i><br>' +
          '<span style="color:#666;font-size:12px">' + formateraTid(k.nar) +
          (k.kontext ? ' · ' + escapeHtml(k.kontext) : '') + '</span></p>';
      }).join('')
    : '<p style="color:#666">Inga kommentarer den här perioden.</p>';

  var rubrik = arForsta
    ? 'ParkSpot – feedback sedan start: ' + totUpp + ' 👍 / ' + totNer + ' 👎'
    : 'ParkSpot – feedback ' + senaste + ': ' + perManad[senaste].upp + ' 👍 / ' + perManad[senaste].ner + ' 👎';

  var html =
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;color:#111">' +
    '<h2 style="margin:0 0 4px 0">' + (arForsta ? 'Feedback sedan start' : 'Feedback ' + senaste) + '</h2>' +
    '<p style="color:#666;margin:0 0 16px 0">' + manader.length + ' månader · ' +
      (totUpp + totNer) + ' tummar totalt · ' + kommentarer.length + ' kommentarer</p>' +
    '<p><b>' + totUpp + '</b> gillade, <b>' + totNer + '</b> ogillade — <b>' + andelTot + ' %</b> nöjda totalt.</p>' +
    riktning +
    '<table style="border-collapse:collapse;margin:12px 0">' +
      '<tr style="text-align:left;border-bottom:1px solid #ddd">' +
        '<th style="padding:4px 10px 4px 0">Månad</th>' +
        '<th style="padding:4px 10px 4px 0;text-align:right">👍</th>' +
        '<th style="padding:4px 10px 4px 0;text-align:right">👎</th>' +
        '<th style="padding:4px 10px 4px 0;text-align:right">Nöjda</th>' +
      '</tr>' + rader +
    '</table>' +
    '<h3 style="margin:20px 0 8px 0">' + (arForsta ? 'Senaste kommentarerna' : 'Kommentarer i ' + senaste) + '</h3>' +
    kommHtml +
    '<hr style="border:none;border-top:1px solid #eee;margin:20px 0">' +
    '<p style="color:#666;font-size:12px">' +
      'Talen är ett <b>golv, inte ett facit</b>: appen skickar formuläret utan att kunna se om det kom fram, ' +
      'så en blockerad eller avbruten sändning försvinner tyst.' +
      (utanTid ? ' ' + utanTid + ' rader saknade tidsstämpel och är inte medräknade.' : '') +
      '<br>Kommentarer mejlas löpande när de kommer in. Rena tummar gör det inte – de räknas här.' +
    '</p></div>';

  MailApp.sendEmail({ to: MOTTAGARE, subject: rubrik, htmlBody: html });
}

function andelFor(r) {
  var sum = r.upp + r.ner;
  return sum ? Math.round(100 * r.upp / sum) : null;
}

function formateraTid(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// =============================================================================
// 3. Installation
// =============================================================================
function installera() {
  var bok = SpreadsheetApp.getActiveSpreadsheet();

  // Ta bort skriptets EGNA gamla schemaläggningar så att inget dubbleras vid omkörning.
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('vidNyttSvar')
    .forSpreadsheet(bok).onFormSubmit().create();

  ScriptApp.newTrigger('manadsSummering')
    .timeBased().onMonthDay(1).atHour(8).create();

  var kvar = ScriptApp.getProjectTriggers().length;
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Klart: ' + kvar + ' schemaläggningar. Kör skickaSummeringNuSedanStart för första utskicket.',
    'ParkSpot', 10);
}

/** Läser arket och skriver ut hur raderna tolkas – utan att mejla något. */
function provtolkning() {
  var varden = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].getDataRange().getValues();
  var summa = { klickUpp: 0, klickNer: 0, kommUpp: 0, kommNer: 0, kommUtanTumme: 0,
                otolkade: 0, utanTid: 0 };
  for (var i = 1; i < varden.length; i++) {
    var bit = plockaUrRad(varden[i]);
    var t = tolkaRad(bit.text);
    if (!t) { summa.otolkade++; continue; }
    if (!bit.nar) summa.utanTid++;
    if (t.arKommentar) {
      summa[t.kansla === 'upp' ? 'kommUpp' : t.kansla === 'ner' ? 'kommNer' : 'kommUtanTumme']++;
    } else {
      summa[t.kansla === 'upp' ? 'klickUpp' : 'klickNer']++;
    }
  }
  console.log('Rader totalt (utan rubrik): ' + (varden.length - 1));
  console.log(JSON.stringify(summa, null, 2));
  console.log('Gillade/ogillade i summeringen = klickUpp/klickNer. Kommentarer mejlas löpande.');
}
