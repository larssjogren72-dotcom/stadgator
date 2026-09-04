# Kontakt med Göteborgs Stad

**Till:** `support.digitalakanaler@goteborg.se`

Adressen är inte gissad. `data.goteborg.se` presenterar sig uttryckligen som
**Stadsmiljöförvaltningens** portal för öppna data och anger den adressen som sin kontakt.
Samma förvaltning äger `open.geodata.tkgbg.se` ("Stadsmiljös öppna WFS-server") som appen
läser, och står som `owner` på posterna i Parkeringskartan. Kontrollerat 2026-09-04.

Växeln är 031-365 00 00 om mejlet inte går fram.

⚠️ **Ta inte upp licensfrågan.** WFS:en deklarerar varken `Fees` eller `AccessConstraints`,
och det är avgjort sedan 2026-08-27: vi kör, kommunen får säga ifrån. Att väcka frågan i ett
mejl bjuder in ett nej vi inte behöver.

📌 **Öppen tråd:** Lars mejlade Trafikkontoret (numera Stadsmiljöförvaltningen) 2026-08-25 om
vad som gäller för städning på cykelplatser. Inget svar ännu; appen har en provisorisk
formulering så länge. Påminnelsen ligger sist i brevet.

Bilaga att skicka med: `KOMMUNBREV.md`.

---

## Förslag till mejl

**Ämne:** Frågor om parkeringsdatan i er öppna WFS – särskilt ltf-arbetsytan

Hej,

Jag heter Lars Sjögren och bygger **ParkSpot** (parkspot.se), en gratis karta som visar var
man får parkera lagligt. Den är i drift för **Stockholm** och **Göteborg**.

Appen hittar inte på något. Den visar kommunens egna beslut, och när uppgiften saknas säger
den det rakt ut i stället för att gissa. Kartan färgar gatorna efter vad som är lagligt, och
användaren växlar mellan två frågor: **Nu** (vad gäller den här stunden) och **Natt** (kan
bilen stå till i morgon bitti). I Nu-läget går det att ställa fram klockan 30 eller 60
minuter, för den som vill se hur gatan ser ut när hen är framme. Jag använder inga sensorer,
samlar inga personuppgifter och hanterar inga betalningar.

Er WFS är den enklaste datakälla jag har arbetat med. Ingen nyckel, alla lager i ett enda
anrop, och tidsgränsen finns på 4 051 av de 6 525 poster jag läser. Det är bättre än de
flesta kommuner. Jag har fem frågor, i fallande ordning av betydelse för användaren.

### 1. Arbetsytan `ltf` är deklarerad men tom

I er GetCapabilities finns namnrymden `ltf` (`http:/open.geodata.tkgbg.se/ltf`) uppräknad,
men noll av de 102 publicerade lagren ligger i den.

Det är den enskilt viktigaste luckan för mig, eftersom **Göteborg i dag inte publicerar några
generella parkeringsförbud**. Jag har kontrollerat det två gånger, från olika håll:

* Inget av de 102 lagren handlar om förbud.
* Parkeringskartan har 1 452 poster vars `extrainfo` nämner "P-förbud". Jag jämförde alla
  som gick att tolka mot `parkering:sopzoner` på gatunamn och klockslag: **1 427 av 1 427
  matchade en sopsträcka.** De beskriver alltså städförbudet, som jag redan har – inte ett
  generellt förbud.

Följden i appen är att jag kan visa var man **får** stå, aldrig var man **inte** får. En
gata utan färg betyder "ingen uppgift", och det står i min ansvarsfriskrivning. Går det att
publicera lokala trafikföreskrifter om parkerings- och stannandeförbud i den arbetsytan?

### 2. Boendeparkeringarna saknar tidsgräns – 0 av 1 303

I `parkering:pkartan_parkering_alla_p` bär varje kategori sin tidsgräns utom en:

| Kategori | Antal | Har `maxparkingtime` |
|---|---|---|
| Parkering rörelsehindrade | 191 | 100 % |
| Bussparkering | 40 | 100 % |
| Lastbilsparkering | 4 | 100 % |
| Motorcykelparkering | 95 | 96 % |
| Bilparkering | 1 659 | 49 % |
| **Boendeparkering** | **1 303** | **0 %** |

Skylten vid Vattugatan säger "P 2 tim / Boende V5". Datan säger ingenting om tiden. Jag
väljer då att visa blått "kontrollera skylten" i stället för grönt, vilket är ärligt men
sämre än det kunde vara. Finns tidsgränsen någonstans för boendeplatserna?

### 3. Villkoren står som meningar, inte som fält

`maxparkingtimelimitation` och lastplatsernas tider är prosa, ordagrant ur föreskriften:

> "Tidsbegränsningen gäller vardag utom dag före sön- och helgdag klockan 00.00 – 24.00."

För att inte bygga gissningslogik läser jag meningarna **en gång**, granskar dem för hand och
slår sedan upp på exakt sträng – en okänd mening ger "vet inte", aldrig en tolkning. Det
kräver två handgjorda tabeller och ett robotjobb som läser om dem varje månad och larmar när
en ny formulering dyker upp.

Det fungerar, men det är den dyraste delen av hela Göteborgs-integrationen. **Går samma
uppgift att leverera som fält** – starttid, sluttid, veckodagar – vid sidan av meningen?
Meningen får gärna vara kvar; det är fälten jag saknar.

### 4. Fältnamnen har olika skiftläge mellan lager

`SiteName` och `MaxParkingTime` i elva lager, `sitename` och `maxparkingtime` i tre
(`Taxa_9`, `Taxa_12`, `Taxa_62`). Jag läser båda varianterna, men jag hittade det först efter
att 74 sträckor försvunnit tyst ur kartan. Nästa utvecklare hittar det kanske inte alls. Det
ser ut som ett förbiseende snarare än ett beslut, och borde vara billigt att rätta.

### 5. Två mindre saker

* **Anläggningstyp.** Inget fält skiljer p-hus från öppen parkeringsyta, och bara 71 av 923
  avslöjar det i namnet. Jag kallar därför listan "Parkeringsanläggningar" i stället för att
  gissa.
* **Realtidsdata.** I det nyckelskyddade ParkingService-API:et är `FreeSpaces` tomt på
  samtliga 3 511 poster, och `CurrentParkingCost` stämde inte i 87 % av mina stickprov (det
  svarade nattpriset mitt i högtaxan). Jag använder därför den nyckelfria WFS:en i stället.
  Är fälten tänkta att fyllas, eller bör de märkas som inte avsedda för produktion?

Slutligen en påminnelse: jag skrev till Trafikkontoret den 25 augusti och frågade om gatans
städdagsförbud gäller på en utmärkt cykelparkering. Appen har en försiktig formulering under
tiden. Har frågan hamnat rätt?

Om något av ovanstående redan finns i en tjänst jag inte hittat tar jag tacksamt emot en
pekare. Vill ni hellre ta det muntligt ställer jag gärna upp på ett kort samtal och visar hur
appen använder er data i dag.

Vänliga hälsningar
Lars Sjögren
lars.sjogren72@gmail.com
parkspot.se

---

## Om de svarar nej eller inte alls

Ingenting slutar fungera – Göteborg är live och förblir det. Ansvarsfriskrivningen säger
redan att staden inte publicerar parkeringsförbud och att en färglös gata betyder "ingen
uppgift". Boendeplatserna fortsätter visas blå i stället för gröna, och tabellroboten
fortsätter läsa meningarna varje månad.
