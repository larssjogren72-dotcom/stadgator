# Kontakt med Karlstads kommun

**Till:** `karlstadskommun@karlstad.se`, kommunens allmänna adress

Adressen är inte gissad, men den är allmän. Det är den enda kontakt som står på
karlstad.se, sidan *Öppna data* (avläst 2026-09-17). Någon särskild adress för öppna
data eller geodata finns inte där. Avgiftslagret heter `vy_parkab_…` och samlas
alltså in av **Karlstads Parkerings AB**. Servicedagarna är **Teknik- och
fastighetsförvaltningens** (`tg_tg_…`). Be att frågan skickas vidare till dem.

Bilaga att skicka med: `KOMMUNBREV.md` (hela listan över vad appen behöver).

**SKICKAT 2026-09-19** av Lars (manuellt, med fråga 8 om vecka 53). Kommer svar: för in det som `KARLSTAD_SVAR.md` och rätta
det appen påstår innan något byggs vidare.

⚠ Brevet säger att staden är **i drift**. Stämmer det inte när brevet skickas (Lars har
inte pushat, eller staden är dold i väljaren) måste första stycket skrivas om.

---

## Förslag till mejl

**Ämne:** Fråga om parkeringslagren i webbkartan – får de användas i en gratis app?

Hej,

Jag heter Lars Sjögren och bygger **ParkSpot** (parkspot.se), en gratis karta som visar
var man får parkera lagligt just nu och över natten. Den finns för Stockholm, Göteborg och
Uppsala, och nu även för **Karlstad**. Appen hittar inte på något. Den visar kommunens
egna uppgifter, och när en uppgift saknas säger den det i stället för att gissa. Den har
inga personuppgifter, inga betalningar och ingen inloggning.

Karlstad-versionen bygger på lagren i er GeoServer (`gi.karlstad.se/geoserver`), samma
lager som er egen webbkarta läser: avgiftsparkeringen, servicedagarna och
parkeringspunkterna. Ert schema för servicedagar är ovanligt bra. Det är ett skyltat
förbud per gata och sida, och datan stämmer med listan på karlstad.se i alla 21 grupper
av veckodag, vecka och klockslag. Det gör att appen kan varna för servicedagen kvällen
före, också jämna och udda veckor och röda dagar.

Jag har åtta frågor. Den första är viktigast.

**1. Får vi använda lagren?**
Parkeringslagren ligger i arbetsytan `webbkartan`, inte i `oppnadata` där ni publicerar
öppna data. På Sveriges dataportal hittade jag inget parkeringsdataset från Karlstad.
Åtkomligt är inte samma sak som licensierat, så jag frågar hellre än antar. Är svaret
nej stänger vi av Karlstad samma dag.

**2. Tidsgräns saknas på nästan hälften av avgiftssträckorna.**
Fältet `max_ptid` är tomt på 178 av 381 sträckor, nästan bara i Grön, Gul och Blå zon.
Skyltarna vi har tittat på där (Vikengatan, Trädgårdsgatan) har ingen tidsgräns, så vi
läser tomt som «ingen skyltad gräns» och låter trafikförordningens allmänna regel gälla.
Stämmer det för hela zonerna, eller finns det sträckor med en gräns som inte står i datan?

**3. Två källor säger olika saker på två gator – och skylten håller med den ena.**
Avgiftslagrets fält `parkeringsforbud` och servicedagslagret är oense på Vikengatan
(«10–12» mot «08–10») och på Drottninggatan mellan Östra Torggatan och Södra Kyrkogatan
(«måndagar» mot «onsdag»). Skyltarna på plats säger **måndag** respektive **10–12**, alltså
samma som avgiftslagret, men listan på er webbplats (uppdaterad 4 september) säger som
servicedagslagret. Våra foton är från 2022 och 2024. Har tiderna ändrats sedan dess, och
är skyltarna i så fall kvar? Tills vi vet visar appen båda.

**4. Röda dagar: räknas aftnarna?**
Er sida säger att förbudet inte gäller på röda dagar. Vi räknar söndagar och helgdagar
enligt lag. Julafton, midsommarafton och nyårsafton är inte med, så där visar appen
förbudet. Stämmer det med hur ni ser på saken?

**5. Avgiftsfri gatuparkering.**
Lagret `parkab_tff_parkeringsplatser_avgiftsfria` kräver inloggning. Kan det publiceras
som avgiftslagret? I dag syns bara avgiftsbelagda platser i appen.

Samma fråga gäller **lastplatserna** (lagret `tff_mark_projekt_sophantering_lastplats` är
också spärrat) och korttidsfickor som «P 30 min» på Drottninggatan. Nu syns de inte alls i
appen.

**6. Platser för rörelsehindrade och MC som linjer.**
De finns som punkter. Appen ritar sträckor och kan inte göra en linje av en punkt utan
att hitta på längden. Finns de som linjer någonstans?

**7. Gatunamn.**
Varken avgiftslagret eller servicedagslagret har gatunamn. Vi härleder dem ur ert
adresslager, och det stämmer för 97 % av gatorna i er lista, men ett eget fält vore
säkrare.

**8. Jämna veckor vid årsskiftet – vecka 53.**
2026 har en vecka 53, så både vecka 53 och vecka 1 (4–10 januari 2027) är udda. Vi läser
«jämna veckor» bokstavligt efter veckonumret, som skylten skriver det. Då blir det
ingen servicedag på jämna-gatorna förrän vecka 2. Stämmer det, eller fortsätter ni i
stället varannan vecka rakt igenom, så att jämna-gatorna servas vecka 1? Svaret avgör
vad appen visar den veckan. Tills vi vet är vi osäkra där.

Tack för en ovanligt välskött karta.

Vänliga hälsningar
Lars Sjögren
ParkSpot · parkspot.se
