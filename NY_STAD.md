# Att ansluta en ny stad

Skrivet efter Stockholm, Sundbyberg och Göteborg — 2026-09-04.
Den här filen finns för att stad nummer fyra ska kosta en bråkdel av vad Göteborg kostade.

---

## 0. Kort sammanfattning

Att skriva stadens datakoppling är **inte** det som tar tid. Göteborgs hela koppling
(`cities/goteborg.js`, 582 rader) skrevs i **en** commit.

Det som tog tid var att upptäcka, en bugg i taget, att den **gemensamma** appen antog
Stockholm. I fönstret 26 aug – 3 sep gjordes 98 committar. **7** rörde stadsfilerna.
**67** rörde `index.html` — den delade koden och texten. (Alla 67 var inte Göteborg;
Framåt-läget byggdes samtidigt. Men proportionen är ändå svaret.)

Slutsats: nästa stad blir billig om vi flyttar arbetet **framåt** — från buggjakt efter
lansering till en ifylld blankett före. Hur det görs står i avsnitt 6.

---

## 1. Ärlig bokföring: vad de tre städerna kostade

| | Stockholm | Sundbyberg | Göteborg |
|---|---|---|---|
| Datakälla | Eget API, nyckel | ArcGIS, 48 karttjänster | En öppen WFS, ingen nyckel |
| Hämtningar per sökning | flera | flera | **1** (alla 19 lager på en gång) |
| Har förbudsdata | Ja | Nej | Nej |
| Kan skilja korttid från långtid | Ja | **Nej** | Ja |
| Kan appen säga "Trygg över natten" | Ja | **Aldrig** | Ja |
| Verifierad mot skylt i verkligheten | Ja, flera | 1 foto (som hittade en bugg) | 4 av 10 platser |
| Status idag | Live | Avstängd i drift | Live, ej pilot |

### Varför Göteborg blev bättre än Sundbyberg

Två skäl, och det är viktigt att inte blanda ihop dem:

**Skäl 1 — källan var bättre (60 % av skillnaden).**
Göteborg publicerar tidsgränsen ("2 tim") på 3 641 av 3 755 bilsträckor. Sundbyberg
publicerar den **ingenstans** — kontrollerat mot alla 48 karttjänster. Utan den
uppgiften får appen aldrig säga grönt, och då är halva produkten borta. Det är inte
ett fel vi gjorde; det är en lucka hos kommunen.

**Skäl 2 — plattformen hade hunnit mogna (40 %).**
Sundbyberg byggdes *medan* strukturen uppfanns. Göteborg byggdes *efter* att
`cities/`-mappen fanns och efter att stadsskillnaderna flyttat ut i konfiguration.
En sak i den ordningen var avgörande: den 27 aug ändrades `harPhus: true/false` till
`phusUrl: '/gbg/phus'`. Med ja/nej-flaggan hade en ny stad som satte `true` fått
**Stockholms garage och Stockholms taxezoner presenterade som sina egna** — tyst, utan
att någon kodrad såg fel ut. Som adress kan felet inte uppstå: en stad utan källa har
ingen adress att peka på.

**Regeln att ta med:** en stadsskillnad ska bäras av en *adress* eller ett *värde*,
aldrig av ett ja/nej som lånar någon annans data när det är sant.

---

## 2. Den enda regel som hade sparat mest tid

> **Tyst ska betyda "vet inte", inte "får stå".**

Nästan varje farlig bugg i Göteborg och Sundbyberg hade samma form: ett fält var tomt,
och appen tolkade tomrummet som "inga hinder" och målade grönt.

- Sundbyberg: ingen maxtid i datan → grön "Trygg över natten" 14 m från en 2-timmarsskylt.
- Göteborg: 140 lastplatser utan villkorsmening → gröna dygnet runt, året om.
- Göteborg: 496 boendesträckor utan publicerad tidsgräns → gröna, fast tillståndet
  förutsätter att en gräns finns.

Alla tre är samma fel. Ingen av dem syntes i koden — koden gjorde precis vad den sa.

**Motmedlet är att vända grundinställningen.** Idag upptäcker varje ny stad, en bugg i
taget, vilka påståenden den inte har rätt att göra. I stället ska staden ha en
**rättighetslista**: varje påstående är **avstängt tills stadens fil slår på det**.
Då blir en ny stads värsta utfall "för tyst" — aldrig "självsäkert fel".

Det är den enskilt viktigaste ändringen för att stad fyra ska bli billig, och den är
inte byggd än. Se avsnitt 6, punkt 4.

---

## 3. Trappan — sex steg för en ny stad

### Steg 1. Finns datan? *(en halvdag, maskinellt)*

```bash
node verktyg/stadskoll.js <stad>
```

Lägg in stadens kartservrar överst i filen. Skriptet letar igenom katalogen och
svarar på vilka påståenden appen skulle kunna göra.

**Fällan här är redan betald en gång:** gå alltid ner till **lagren**, aldrig bara till
tjänsternas namn. Sundbybergs städdata låg i lager 70 av 169, inuti en tjänst som hette
något helt annat. Att läsa tjänstenamnen gav svaret "ingen städdata" — vilket var fel.

### Steg 2. Frånvarotabellen *(en dag, kräver en människa — hoppa aldrig över)*

Det här är steget som avgör om staden blir en Göteborg eller en Sundbyberg.

För **varje** fält som saknas eller är tomt: skriv ner vad tomrummet **betyder**, och
var du läste det. Tre svar är möjliga:

| Svar | Vad appen får göra | Exempel |
|---|---|---|
| **Alltid** — regeln gäller dygnet runt | Rita regeln jämt | Göteborgs lastplatser utan mening (fyra föreskrifter lästa, 2008–2026, inget klockslag) |
| **Vet inte** | Tiga, eller degradera grönt till blått | Göteborgs boendezoner utan tidsgräns |
| **Finns inte** — dimensionen saknas i hela kommunen | Stäng av påståendet för hela staden | Sundbybergs maxtid → `skiljerKorttid:false` |

Svaret finns **inte i datan**. Det står i föreskriften (Transportstyrelsens RDT) eller
i ett telefonsamtal med kommunen. Att gissa här är exakt det som gör appen farlig.

### Steg 3. Kopplingen `cities/<stad>.js` *(en dag, mekaniskt)*

Kontraktet är tre rader:

```js
module.exports = delade => ({ id, prefix, hantera(reqUrl, req, res) -> bool });
```

`hantera()` svarar `true` om den tog hand om vägen. Allt utanför `prefix` rör den aldrig.
Filen ska erbjuda samma tre adresser som de andra städerna — se avsnitt 4.

**De fem tysta fällorna.** Ingen av dem ger ett felmeddelande. Alla ger fel svar.

1. **Axelordning.** `bbox=…,EPSG:4326` betyder **lng,lat**. Samma ruta med
   `urn:ogc:def:crs:EPSG::4326` betyder **lat,lng**. Fel ordning ger inte tomt — den ger
   *nästan* tomt. Uppmätt i Göteborg: rätt ordning 178 poster, fel ordning 2. Två ser
   precis lagom rimligt ut för att man ska tro på dem.
2. **Skiftläge i fältnamn.** Göteborg skriver `SiteName` i elva lager och `sitename` i
   tre. Läser man bara det ena tappar man 74 sträckor tyst. Läs alltid via en
   hjälpfunktion som prövar båda.
3. **Veckodagsskalan.** Göteborg: 1 = måndag (sammanfaller med JavaScript). Sundbyberg:
   0 = måndag (gör det inte). Verifiera mot stadens **egen svenska text**, inte mot en
   gissning — och kasta värden utanför skalan i stället för att tolka dem.
4. **Id är inte stabilt.** Göteborgs `fid` genereras per anrop. Sundbybergs trick — hämta
   i två projektioner och para ihop på id — fungerar inte där. Lösningen: låt servern
   göra jobbet, skicka sökrutan i ett koordinatsystem och be om geometrin i ett annat i
   **samma** anrop.
5. **Koordinatsystem.** Stockholms parkeringsdata är SWEREF99 (meter), städdatan WGS84
   (grader). Appens `toLatLng` klarar båda, men analysskript som antar fel system ger
   svar som ser rimliga ut.

### Steg 4. Konfigurationen `STADER_CFG` i `index.html` *(en timme)*

Här finns inga if-satser om städer. Varje skillnad är ett värde. Kopiera Göteborgs
block och fyll i. Fälten står i avsnitt 4.

### Steg 5. Bevisa mot verkligheten *(en dag — får inte hoppas över)*

Två prov, som svarar på olika frågor:

- **Dygnssvepet.** Kör den riktiga koden mot riktig data för varje timme i veckan och
  spela in vilka färger som ritas. Fångar att en färg aldrig uppstår, eller uppstår vid
  fel klockslag. Metoden finns beskriven i projektminnet
  (`project_stadgator_fargvaxlingar_bevisade.md`).
- **Skyltrundan.** Minst fem platser i verkligheten, foto med datum. Bara den kan svara
  på om registret *saknar* något. Ett dataset kan aldrig bevisa sin egen fullständighet.

Sundbybergs enda foto hittade en bugg direkt. Det är ingen slump.

### Steg 6. Sekundärtexten *(en halvdag — glöms alltid)*

Ingenting av det här uppdateras av sig självt när koden ändras:

- Ansvarsfriskrivningen under platskorten (`disclaimer` i konfigurationen)
- FAQ:n i appen
- SEO-sidorna (`seo/build.js`) — idag hårt knutna till Stockholm, se avsnitt 6 punkt 5
- `ARKITEKTUR.md`, `docs/arkitektur.html`, `llms.txt`, `CHANGELOG.md`

Göteborg hade tre separata committar bara för texter som fortfarande sa "Stockholm"
efter att kartan varit rätt i flera dagar: dela-knappen, cykelläget, adressexemplen.

---

## 4. Kontraktet — exakt vad appen läser

### Tre adresser stadsfilen måste erbjuda

| Adress | Vad den svarar med |
|---|---|
| `/<stad>/wfs-tillaten?BBOX=…` | Tillåtna p-sträckor i sökrutan, som GeoJSON-linjer |
| `/<stad>/servicedagar-bbox?dag=&bbox=` | Städsträckor för en veckodag |
| `/<stad>/schedule?lat=&lng=&name=` | Städschemat för en gata: `{schedule:[{day,s,e,…}]}` |

Har staden parkeringsanläggningar tillkommer `/<stad>/phus`.

### Fälten på varje sträcka

Kopplingen ska översätta stadens fältnamn till **de här** namnen. De är stadsneutrala —
en stad som hittar på egna namn tvingar fram if-satser i den delade koden, och det är
precis det vi inte vill.

| Fält | Betyder | Om det saknas |
|---|---|---|
| `STREET_NAME` | Gatunamn — kortets rubrik och nyckeln till städschemat | Kortet blir namnlöst |
| `VEHICLE` | `fordon` / `motorcykel` / `cykel` / `rörelsehindrade` | Allt hamnar i billäget |
| `VF_PLATS_TYP` | Vad slags plats: `P`, `P Avgift`, `P Avgift, boende`, eller en sifferkod för ändamålsplats (`7` lastplats, `20` taxi …) | Appen kan inte skilja platstyper — **inget grönt** |
| `PARKING_RATE` | Pristext, ordagrant som kommunen skriver den | Ingen prisrad visas |
| `MAX_MINUTES` / `MAX_HOURS` / `MAX_DAYS` | Tidsgränsen, som tal | Grönt fälls till blått |
| `START_TIME` / `END_TIME` | Klockslag som heltal, `0900` = 09:00 | Regeln kan inte tidsättas |
| `START_WEEKDAY` / `DAY_TYPE` | Vilka dagar regeln gäller | Regeln antas gälla jämt |
| `START_MONTH` / `START_DAY` / `END_MONTH` / `END_DAY` | Säsong. Året runt ska vara **null**, inte 1/1–31/12 | Kortet skriver ut en säsong som inte är ett villkor |
| `ODD_WEEKS` / `EVEN_WEEKS` | Varannan vecka | 80 % av Göteborgs städning blir fel, osynligt |
| `VF_METER` | Stockholms signal för äkta korttidsficka | Sätt **null** i andra städer, aldrig ett hittepåvärde |
| `CITATION` | Föreskriftens nummer — spårbarheten tillbaka till originalet | Går inte att kontrollera |
| `ANDAMAL_ALLTID` | Ändamålsplats utan klockslag **som är läst i föreskriften** | Sätt bara efter steg 2 |
| `ENDAST_BOENDE` | Boendezon utan publicerad tidsgräns | — |

Stadsegna fält är tillåtna med prefix (`GBG_…`). De får bara läsas via en
uppslagstabell, aldrig tolkas i farten. Se nästa avsnitt.

---

## 5. Fritextfält: den dolda kostnaden

Göteborg skriver inte lastplatsens tider som klockslagsfält. Det står som en mening,
ordagrant ur föreskriften:

> «Lastplats vardag utom vardag före sön- och helgdag klockan 09.00 - 18.00…»

Att tolka en sådan mening i appen är att bygga gissningslogik. Lösningen som fungerade:

1. Läs meningarna **en gång**, utanför appen (`verktyg/las-gbg-*.js`)
2. Granska för hand och skriv en tabell (`verktyg/*.json`)
3. Slå upp på **exakt sträng** — en okänd mening ger "vet inte", aldrig en tolkning
4. Låt en robot läsa om varje månad, med testgrind och larmklocka
   (`.github/workflows/datatabeller.yml`, se `verktyg/README.md`)

Kostnaden är verklig: två tabeller, fyra verktyg, en robot, tre larmvägar. **Fråga
därför tidigt om staden kan leverera samma uppgift som fält i stället för mening.**
Det är den ena frågan som sparar mest tid av alla.

---

## 6. Vägen till ett klick — vad som ska byggas, i ordning

Visionen är rimlig för den **mekaniska** halvan. Här är vad som återstår, med den mest
lönsamma först.

**1. Kontraktet som fil, inte som kunskap.** Fältlistan i avsnitt 4 finns idag bara i
kommentarer och i mitt huvud. Gör den till `cities/kontrakt.js` med en validator som
varje stadsfil körs igenom: okända fältnamn, fel typer, klockslag som inte är heltal,
säsong satt till 1/1–31/12. *Vinst: fångar en hel klass av tysta fel innan de ritas.*

**2. Generera skelettet.** Bygg ut `stadskoll.js` med `--skelett`, som skriver ett
utkast till `cities/<stad>.js` och ett `STADER_CFG`-block ur det den hittade. Utkastet
är inte klart — men det är ifyllt, och då blir arbetet granskning i stället för
skrivande. *Vinst: en dag blir en timme.*

**3. Stadens acceptanstest.** Dygnssvepet från steg 5 ska vara ett kommando,
`node verktyg/stadsprov.js <stad>`, som kör den riktiga koden mot riktig data och skriver
en tabell: vilka färger uppstår, vid vilka klockslag, på hur många sträckor. Kör det
även för Stockholm vid varje ändring — det är samma prov som bevisar att den nya staden
inte förstörde den gamla. *Vinst: "testa brett" slutar vara en ambition och blir ett
kommando.*

**4. Rättighetslistan (den viktigaste, och den jobbigaste).** Vänd grundinställningen
enligt avsnitt 2: varje påstående av tills stadens fil slår på det, med en rad som säger
*varför* det är påslaget och var det lästes. Då kan steg 2 levereras som en ifylld
blankett i stället för upptäckas som buggar. *Vinst: ny stad kan aldrig bli farlig, bara
tyst.*

**5. SEO per stad ur konfigurationen.** `seo/build.js` har idag Stockholms taxor,
stadsdelar och texter inbyggda, och Göteborg fick en egen `goteborg.json` bredvid. Bryt
ut det stadsspecifika till en fil per stad, som appens `STADER_CFG` redan är.
*Vinst: steg 6 slutar vara handarbete.*

### Vad som aldrig kan bli ett klick

Steg 2 — frånvarotabellen. Om ett tomt fält betyder "alltid", "vet inte" eller "finns
inte" står i föreskriften, inte i datan. Ingen maskin kan läsa det åt oss, och varje
gång vi hoppat över det har appen ljugit självsäkert. **Det steget ska förbli
långsamt och mänskligt.** Allt annat runtomkring får gärna gå på en knapptryckning.

---

## 7. Vad vi behöver av en kommun

Se `KOMMUNBREV.md` — samma lista, skriven för att kunna skickas till någon som inte
kan appen.

---

## 8. Vad som saknas i Göteborg och Sundbyberg idag

### Göteborg (live)

| Lucka | Följd i appen | Allvar |
|---|---|---|
| **Ingen förbudsdata alls** — ordet "förbud" finns bara i städbeskrivningar | Appen kan säga var man **får** stå, aldrig var man **inte** får. En färglös gata betyder "ingen uppgift" | **Stor.** Står i ansvarsfriskrivningen |
| **Boendezoner utan tidsgräns** — 496 av 2 095 sträckor | Blått "kontrollera" i stället för grönt. Skylt vid Vattugatan säger "P 2 tim / Boende V5"; datan säger ingenting | Medel — vi tiger rätt, men tappar precision |
| **Ingen taxezon som yta** — taxan är linjer per nivå | Ingen prisyta på kartan; priset visas per sträcka i stället | Litet |
| **Inget fält för anläggningstyp** | Kan inte skilja p-hus från öppen parkeringsyta; bara 71 av 923 avslöjar det i namnet. Vi kallar listan "Parkeringsanläggningar" | Litet |
| **~139 ytor ritas inte** (bara linjer ritas) | Vissa parkeringar är osynliga. Samma kända lucka som i Stockholm | Litet |
| **Varannan vecka syns inte på kortet** | Kortet skriver "Servas onsdagar 09–12" även när det gäller varannan vecka. Felet får dig att flytta bilen i onödan — aldrig att stå kvar | Litet, men **ofixat** |
| **Väldigt korta sträckor** (median 6 m på Lindholmen) | Färgen blir svår att se. Sammanslagning ej byggd | Medel för UX |
| Inga realtidslediga platser | Vi visar kapacitet, inte beläggning. Stadens eget API har fältet men fyller det aldrig | Litet — samma i alla städer |

### Sundbyberg (pilot, avstängd i drift)

| Lucka | Följd i appen | Allvar |
|---|---|---|
| **Ingen maxtid någonstans** — kontrollerat mot alla 48 karttjänster | `skiljerKorttid:false` → **inget grönt i hela kommunen**, varken dag eller natt. Halva produkten saknas | **Avgörande** |
| **Ingen förbudsdata** | Samma som Göteborg | Stor |
| **Registret skiljer inte platstyper** — alla 808 bilsträckor bär samma typ, "P Avgift" | Appen kan inte veta vad slags plats det är | Avgörande, och roten till raden ovan |
| **Inga parkeringsanläggningar** | Ingen sista utväg när gatan är full | Medel |
| **Ingen taxezon** | Ingen prisyta | Litet |

**En sak att rätta nu:** konfigurationen säger `visaIVal:false` med texten
*"Pilot – karttjänsten svarar inte"*. Det stämde 27 aug. **Kontrollerat 2026-09-04:
`gis.sundbyberg.se` svarar igen** (HTTP 200 på både katalogen och trafikkartan).
Texten ljuger alltså live. Det finns redan en färdig rättelse på en gren (`dd4bdb2`)
som inte gått in i master.

---

## 9. Snabbchecklista

```
[ ] node verktyg/stadskoll.js <stad>          — finns datan?
[ ] Frånvarotabell ifylld, med källa per rad  — MÄNSKLIGT, hoppa aldrig över
[ ] cities/<stad>.js — fem fällorna avbockade
[ ] STADER_CFG-block — adresser, inte ja/nej
[ ] Dygnssvep: nya staden OCH Stockholm
[ ] Skyltrunda: minst fem platser, foto med datum
[ ] Sekundärtext: disclaimer, FAQ, SEO, ARKITEKTUR.md, llms.txt, CHANGELOG
[ ] Versionsbump
[ ] Projektminnet uppdaterat
```
