# Kontakt med Sundbybergs stad

**Till:** `kommunstyrelsen@sundbyberg.se` (be att bli vidarekopplad till den som ansvarar för
stadens kartdata och trafikföreskrifter)

Till skillnad från Malmö och Göteborg publicerar Sundbyberg **ingen katalog över öppna data**,
och `gis.sundbyberg.se` bär inga kontaktuppgifter. Den enda adress staden själv publicerar är
den ovan, på sin kontaktsida. Växeln är 08-706 80 00. Kontrollerat 2026-09-04.

Det gör att brevet måste vara självförklarande: mottagaren vet troligen inte att kartservern
är öppen mot internet, och ska inte behöva veta vad en WFS är.

🔑 **Det här brevet skiljer sig från de andra två.** För Göteborg och Malmö frågar vi efter
mer data. Här är den **första frågan om lov**. Sundbybergs kartserver är åtkomlig, men
åtkomlig är inte samma sak som tillåten — och därför är staden byggd i appen men **avstängd**.
Det är den frågan som avgör om det blir något alls.

Bilaga att skicka med: `KOMMUNBREV.md`.

---

## Förslag till mejl

**Ämne:** Får jag använda Sundbybergs parkeringsdata i en gratis parkeringskarta?

Hej,

Jag heter Lars Sjögren och bygger **ParkSpot** (parkspot.se), en gratis karta som visar var
man får parkera lagligt. Den är i drift för **Stockholm** och **Göteborg** och bygger helt på
kommunernas egna publicerade beslut. Jag använder inga sensorer, samlar inga personuppgifter
och hanterar inga betalningar. När en uppgift saknas säger appen det rakt ut i stället för att
gissa.

Jag skriver av två skäl: ett som gäller lov, och ett som gäller innehåll.

### 1. Får jag använda datan?

Sundbybergs karttjänster på `gis.sundbyberg.se` svarar öppet på internet, utan inloggning
eller nyckel. Där ligger bland annat stadens parkeringszoner, lastplatser, MC- och
RH-platser och servicedagar.

Att en tjänst är **åtkomlig** är dock inte samma sak som att den är **avsedd att användas**,
och jag vill inte utgå från att tystnad betyder ja. Jag har därför byggt färdigt stödet för
Sundbyberg men **stängt av det** — ingen användare ser er data i dag, och den slås inte på
förrän ni säger att det är i sin ordning.

Så: **är det okej att jag använder er öppna kartdata på det här sättet?** Om ni hellre vill se
en formell överenskommelse, en licensangivelse eller ett omnämnande av staden som källa, säg
till så ordnar jag det. Vill ni att jag låter bli, gör jag det utan invändning.

### 2. En uppgift saknas, och den avgör halva nyttan

Om ni säger ja finns en lucka jag behöver berätta om, eftersom den märks direkt för
användaren.

Appens mest ställda fråga är "kan jag lämna bilen här över natten?". För att svara ja på den
behöver jag veta **hur länge** man får stå. Jag har gått igenom stadens samtliga kartlager –
811 lager med sammanlagt 4 210 fält, avläst 4 september 2026 – och hittar bara ett enda fält
som anger en tidsgräns:

* **`P_30_Min`** på parkeringszonerna, ifyllt på **18 av 810** poster.

Det finns alltså inget fält för 1-, 2-, 4- eller 24-timmarsparkering. Fältet
`Typ_av_parkering` beskriver hur rutorna ligger (längsgående eller vinkel), inte vad slags
plats det är. `Avgift` (ja/nej) och `Boende_parkering` (åtta områden) finns och är
användbara — men ingenting säger "korttidsparkering".

Följden blir att appen **aldrig** kan visa grönt "trygg över natten" någonstans i Sundbyberg.
Den måste svara "kontrollera skylten" på varje plats i hela kommunen, även där det egentligen
är helt fritt. Det är halva produkten.

Att gränserna finns i verkligheten vet jag: vid vändplanen på Brunnsgatan står en skylt med
"2 tim". Den uppgiften finns bara på stolpen, inte i datan.

**Finns tidsgränserna registrerade någonstans hos er** – i föreskrifterna, i ett underlag som
inte publiceras, eller i något system jag inte hittat? Gärna som fält (till exempel "120
minuter, vardag 08–18"), men även en fil skulle hjälpa mig att förstå omfattningen.

### 3. Två mindre saker, om det ändå tas upp

* **Parkeringsförbud.** Jag hittar inga i datan. Appen kan alltså säga var man får stå, aldrig
  var man inte får, och en gata utan färg betyder "ingen uppgift".
* **Parkeringsanläggningar.** Jag hittar inga p-hus eller större parkeringsytor. De är
  användarens sista utväg när gatan är full.

Jag vill avsluta med att säga att er servicedagsdata är ovanligt bra: både säsong och
klockslag finns som fält, och lastplatser, MC- och RH-platser ligger som egna lager. Det är
mer än flera större kommuner publicerar.

Vill ni hellre ta det muntligt ställer jag gärna upp på ett kort samtal och visar hur appen
fungerar i Stockholm och Göteborg i dag.

Vänliga hälsningar
Lars Sjögren
lars.sjogren72@gmail.com
parkspot.se

---

## Om de svarar nej eller inte alls

Sundbyberg förblir avstängd. Koden ligger kvar i huvudversionen så att den inte halkar efter
när resten av appen utvecklas, men ingen användare ser den. Inget behöver rivas.

Svarar de ja på lovet men nej på tidsgränserna kan staden slås på med `skiljerKorttid:false`
— då visas allt i blått "kontrollera tidsgränsen", aldrig grönt. Det är ärligt, men det är en
halv produkt, och det är värt att säga innan förväntningarna sätts.
