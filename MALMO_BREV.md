# Kontakt med Malmö stad

**Till:** `gis.fgk@malmo.se` — Fastighets- och gatukontoret, GIS
**Kopia:** `opendata@malmo.se` — Malmö stads öppna dataportal

Adresserna är inte gissade. De står som `contactPoint` på datamängderna
*Parkeringsavgifter* och *Miljöparkering* i Malmös egen DCAT-katalog
(`opendata-api.malmo.se/catalog.jsonld`, avläst 2026-09-04). Samma team äger båda
filerna — alltså exakt de som kan svara på frågan.

Kontaktcenter (`malmostad@malmo.se`) är rätt väg om GIS-gruppen inte svarar, men det
är ett steg längre bort från den som faktiskt gör exporten.

Bilaga att skicka med: `KOMMUNBREV.md` (den fullständiga listan över vad appen behöver).

---

## Förslag till mejl

**Ämne:** Fråga om parkeringsdata — ofiltrerat utdrag ur ert föreskriftsregister

Hej,

Jag heter Lars Sjögren och bygger **ParkSpot** (parkspot.se), en gratis karta som visar
var man får parkera lagligt just nu. Den är i drift för **Stockholm** och **Göteborg**.

Appen hittar inte på något. Den visar kommunens egna beslut, och när uppgiften saknas
säger den det rakt ut i stället för att gissa. Kartan färgar gatorna efter vad som är
lagligt — grönt, blått, orange eller rött — och användaren växlar mellan två frågor:
**Nu** (vad gäller just den här stunden) och **Natt** (kan bilen stå till i morgon
bitti). I Nu-läget går det dessutom att ställa fram klockan **30 eller 60 minuter**, för
den som vill se hur gatan ser ut när hen är framme. Städdagarna räknas in i allt detta.

Allt bygger på öppna karttjänster från respektive kommun. Jag använder inga sensorer,
samlar inga personuppgifter och hanterar inga betalningar.

Jag har nu gått igenom Malmös öppna data, och jag vill börja med att säga att den håller
hög klass. *Parkeringsavgifter* och *Miljöparkering* är väldokumenterade, har tydliga
attributbeskrivningar och uppdaterades senast den 3 september 2026. Det är bättre än de
flesta kommuner jag stött på. Miljöparkeringen är dessutom ovanligt användbar, eftersom
dag och tidsintervall ligger som egna fält och inte bara som text.

Min fråga gäller en avgränsad lucka.

Filen `miljoparkeringar.geojson` verkar vara ett utdrag ur ert föreskriftsregister — den
bär både föreskriftens id (`gid_ltf`), ikraftträdandedatum och platstypen (`value`). Där
ser jag att registret skiljer på "Parkering, avgift", "Parkering, tidsbegränsad",
"Parkering, motorcykel" och "Förbud mot att parkera fordon". Men eftersom filen är
filtrerad till just miljöparkering kommer bara de sträckor med som också städas.

**Går det att publicera samma utdrag ofiltrerat?**

Det jag framför allt saknar i dag är:

1. **Ändamålsplatser, särskilt lastplatser.** Vid en stickprovsrunda på Stora Nygatan
   såg jag en lastplats som gäller 9–18 (9–14 lördagar). I datan ligger samma sträcka som
   vanlig avgiftsparkering. Jag vill inte visa den som ledig parkering mitt på dagen.
2. **Tidsgränsens värde.** Registret vet att 37 sträckor är "Parkering, tidsbegränsad",
   men inte om det är 30 minuter eller 2 timmar. Finns siffran som fält någonstans?
3. **Parkeringsförbud på gator som inte omfattas av miljöparkering.**

Om något av detta redan finns i en tjänst jag inte hittat tar jag tacksamt emot en
pekare. Jag har tittat i `gis.malmo.se/arcgis`, `stadsatlas.malmo.se`, `geo.malmo.se`
och opendata-portalen.

Skulle ni hellre diskutera det muntligt ställer jag gärna upp på ett kort samtal och
visar hur Stockholm och Göteborg fungerar i appen i dag.

Vänliga hälsningar
Lars Sjögren
lars.sjogren72@gmail.com
parkspot.se

---

## Om de svarar nej eller inte alls

Då bygger jag ändå, med lastplatsluckan skriven rakt ut i ansvarsfriskrivningen — precis
som Göteborgs saknade förbudsdata står där i dag. Mätningen som motiverar det finns i
projektminnet (`project_stadgator_malmo_utredning`): lastplatser utgör omkring 7 % av
innerstadens gatulängd och **noll** av dem gäller nattetid.
