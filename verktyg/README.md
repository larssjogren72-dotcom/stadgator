# Verktygen och roboten

Tre uppslagstabeller styr vad appen påstår om verkligheten. De läses ur stadens
öppna data och ur Transportstyrelsens föreskrifter, och de **åldras**. Roboten
håller dem aktuella; den här filen säger hur, och vad som krävs av dig.

| Tabell | Vad den avgör |
|---|---|
| `forbud-ovrig-tid.json` | 46 föreskrifter där parkering är förbjuden dygnet runt (Stockholm) |
| `gbg-maxtid-villkor.json` | När Göteborgs tidsgränser gäller – och när de vilar |
| `gbg-lastplats-tider.json` | När Göteborgs lastplatser gäller |

## Roboten

`.github/workflows/datatabeller.yml`, den 1:e varje månad.

```
kontroll → hämta om → skriv om tabellerna → TESTGRIND → committa → pusha → kvitto
```

Faller testgrinden (`prova-tabeller.js`) committas **ingenting**. Roboten rör bara
de tre JSON-filerna, de genererade blocken i `index.html` och arkitektursidans
räknade siffror – aldrig logik.

Kör den för hand från fliken Actions. Kryssa i **Torrkör** för att se vad den
*hade* gjort utan att något committas.

## Tre larmvägar, som täcker olika fel

| Vad som gick fel | Vad som säger till |
|---|---|
| Roboten hittade något, eller stoppade sig själv | Issue som **tilldelas dig** → GitHub mejlar |
| Roboten slutade köra helt | **Larmklockan** – se nedan |
| Vill bara veta hur det står till | `curl https://parkspot.se/datastatus` |

Den mittersta är den viktiga. En vakt som slutat gå ser likadan ut som en vakt
som inget hittat, och GitHub stänger **självt** av schemalagda jobb i repon som
legat stilla. Då tystnar körningen och issuet på en gång.

## Två hemligheter du behöver lägga in

Settings → Secrets and variables → Actions → New repository secret.

### `STHLM_API_KEY` *(annars körs bara Göteborg)*
Stockholms API-nyckel – samma som i `.apikey`. Göteborgs data är öppen och
behöver ingen. Saknas nyckeln hoppas Stockholmsdelen över, och det syns i loggen.

### `HEARTBEAT_URL` *(annars finns ingen larmklocka)*
En adress som roboten pingar när den kört klart. Hör tjänsten inget på utsatt tid
mejlar **den** dig – det är hela poängen: klockan måste hänga utanför GitHub.

Så här sätter du upp den med healthchecks.io (gratis, räcker gott):

1. Skapa konto på <https://healthchecks.io> med den adress du vill ha larmen till.
2. Skapa en check. Sätt **Period** till 1 månad och **Grace Time** till 3 dygn.
   Då larmar den om roboten inte hört av sig i tid, men inte för en sen körning.
3. Kopiera checkens ping-URL.
4. Lägg den som hemligheten `HEARTBEAT_URL`.

Roboten pingar adressen när allt gick bra, och `.../fail` när testgrinden föll –
då larmar klockan direkt i stället för att vänta ut tystnaden.

Utan hemligheten skriver jobbet ut en varning i loggen i stället för att tiga, så
luckan syns. Men den mejlar dig inte – och det är just det larmklockan finns för.

## Verktygen var för sig

| Fil | Vad den gör |
|---|---|
| `kolla-forbud-ovrig-tid.js` | Stockholm: driftade rader + aldrig lästa ärenden. `--uppdatera` läser om RDT |
| `kolla-gbg-tabeller.js` | Göteborg: rader utan träff + meningar utan rad |
| `las-gbg-villkor.js` | Läser om Göteborgs villkorsmeningar. `--skriv` skriver filen |
| `las-gbg-lastplats.js` | Läser om Göteborgs lastplatsmeningar |
| `prova-tabeller.js` | Testgrinden. Exit 1 = ändringen får inte gå live |
| `bygg-*.js` | Skriver in JSON-tabellen i `index.html`. Kör aldrig blocket för hand |
| `kodpekare.js` | Räknar om arkitektursidans siffror. Utan flagga = kontroll, exit 1 vid drift. `--skriv` rättar |
| `stadskoll.js` | Vilka påståenden appen kan göra i en stad, och vilka den måste tiga om |

Alla utom Stockholms två behöver ingen nyckel.

## Kodpekarna på arkitektursidan

`docs/arkitektur.html` är full av siffror som kommer ur koden: radantal, radhänvisningar,
och diagrammens proportioner. De **åldras vid varje commit** — uppmätt 2026-09-02 hade sex
av femton hunnit bli fel, varav en i en SVG-etikett som ingen tittar på.

Varje sådant värde bär därför en markering i HTML:en — `data-kod`, `data-kod-aria` eller
`data-kod-geom` — och `kodpekare.js` räknar om dem ur arbetsmappen. **Ändra dem inte för hand.**

```
node verktyg/kodpekare.js           # kontroll: exit 1 om något glidit
node verktyg/kodpekare.js --skriv   # rätta
```

Två saker som gör det varaktigt:

- **`.github/workflows/kodpekare.yml`** faller vid push när något glidit. Den committar
  ingenting — Railway deployar master, och en robot som ändrar filer vid varje push är
  inte värd risken. Den säger till; rättningen är ett kommando.
- **Tabellroboten** kör `--skriv` efter att den byggt om blocken, så att den aldrig
  lämnar felaktiga radhänvisningar efter sig när den flyttat rader i `index.html`.

Skriptet vaktar också ett **påstående**, inte bara siffror: sidan säger att ingen regel i
klienten frågar vilken stad det är. Blir det osant skrivs meningen om — och känner
skriptet inte igen träffen som det kända undantaget (dela-länken) ber sidan om mänsklig
kontroll i stället för att gissa var raden sitter. Ett påstående som tyst blir falskt är
farligare än en siffra som slutar stämma.

## Om något ser fel ut i en robotcommit

`git revert` på commiten. Tabellerna är data, inte logik – en återställning kan
inte gå sönder på något annat sätt än att gamla siffror kommer tillbaka.
