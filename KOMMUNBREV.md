# Vad ParkSpot behöver av en kommun

Underlag inför kontakt med en kommun. Skrivet så att någon som aldrig sett appen ska
förstå varje punkt: *vad* vi ber om, *varför*, och *vad som händer om det saknas*.

Kort om oss: ParkSpot är en gratis karta som visar var man får parkera lagligt just nu.
Vi hittar inte på något — vi visar kommunens egna beslut, och när vi inte vet något
säger vi det rakt ut. Vi vill inte ha personuppgifter, inte betalflöden och inte
realtidssensorer. Vi vill ha kommunens **beslut om gatorna**, maskinläsbara.

---

## Hur vi helst vill ha det

En **öppen karttjänst** (WFS eller ArcGIS REST) som svarar med geometri och attribut,
utan inloggning, och som uppdateras när besluten ändras.

- Filer (en Excel eller shapefil på mejl) fungerar för en engångsanalys men **inte för
  drift** — de åldras utan att någon märker det, och då börjar appen ljuga.
- Ett API med nyckel går bra. En nyckel är inget hinder.
- Vi behöver inga bakgrundskartor eller flygfoton — bara parkeringsbesluten.

---

## De sju uppgifterna, i fallande ordning av betydelse

### 1. Var får man parkera? *(utan denna finns ingen app)*

Varje sträcka eller yta där parkering är tillåten, som linje eller polygon, med:

| Uppgift | Varför vi behöver den |
|---|---|
| Gatunamn | Blir rubriken på kortet användaren ser, och kopplar ihop platsen med städschemat |
| Vad slags plats det är | Avgörande. "Avgiftsparkering", "boendeparkering", "lastplats", "taxiplats", "korttidsparkering" — se punkt 3 |
| Vilket fordon platsen gäller | Bil, motorcykel, moped, cykel, rörelsehindrade. Utan detta hamnar en MC-ruta i bilistens sökning |
| Beslutsnummer (LTF/föreskrift) | Vår spårbarhet. Ser något konstigt ut vill vi kunna gå till originalbeslutet i stället för att gissa |

**Om det saknas:** appen kan inte byggas för kommunen alls.

### 2. Hur länge får man stå? *(utan denna kan vi aldrig säga "ok över natten")*

Tidsgränsen på platsen — "30 min", "2 tim", "24 tim", "7 dygn" — **och när den gäller**
(t.ex. bara vardagar 07–20).

**Varför det är den näst viktigaste uppgiften:** appens mest använda fråga är "kan jag
lämna bilen här över natten?". Utan en tidsgräns i datan har vi två val — svara "ja" och
riskera att skicka någon att stå fel i tio timmar på en 2-timmarsruta, eller svara "vet
inte" på **varje** plats i hela kommunen. Vi väljer alltid det andra.

**Detta är exakt vad som saknas i Sundbyberg**, och det är därför kartan där är halverad
i praktiken.

Ett önskemål: gärna som **fält** ("120 minuter", "vardag 07–20"), inte som en mening i
fritext. En mening måste vi översätta för hand och läsa om varje gång kommunen skriver
om den.

### 3. Var får man **inte** parkera?

Parkeringsförbud och stannandeförbud, med geometri och tidsfönster.

**Varför:** det är den enda uppgift som gör att en gata utan färg kan betyda "här är det
tillåtet" i stället för "här vet vi ingenting". Både Göteborg och Sundbyberg saknar den,
och vi skriver därför rakt ut i appen att en ofärgad gata inte betyder "fritt".

Vi vill särskilt veta om ett förbud gäller **dygnet runt** eller bara ett fönster —
skillnaden avgör om appen får måla grönt utanför fönstret.

### 4. När städas gatan?

Servicedagar / datumparkering, med geometri och:

| Uppgift | Varför |
|---|---|
| Veckodag | Grunden |
| Klockslag, från och till | Så att appen kan säga "flytta bilen före 09" |
| Varannan vecka: jämn eller udda | 80 % av Göteborgs städning är varannan vecka. Utan detta blir varningen fel varannan gång, osynligt |
| Säsong (från- och tilldatum) | Många gator städas bara vintertid. På sommaren är de fler lediga platser — vi vill inte varna i onödan |

**Om det saknas:** appen tiger om städning. Det är ofarligt men mycket sämre — en
bortbogserad bil är den vanligaste anledningen till att folk söker.

### 5. Vad kostar det?

Taxenivåer med geometri, och prislistan (kr/timme) med de tidsfönster som gäller —
vardag, lördag, söndag, natt.

**Varför:** priset ska inte styra vilken färg gatan får (färgen betyder laglighet), men
det är det andra folk vill veta.

Två önskemål ur erfarenhet:
- **Zonerna som ytor**, inte bara som linjer per nivå. Ytor kan ritas ut på kartan.
- Skicka gärna **er egen pristext**. Taxenummer betyder olika saker i olika städer —
  "Taxa 1" är 55 kr/tim i Stockholm och 34 kr/tim i Göteborg. Vi skickar därför alltid
  er formulering vidare i stället för siffran.

### 6. Boendeparkering

Vilka sträckor som omfattas, och vilken zon de tillhör.

**En sak vi särskilt behöver veta:** om ett boendetillstånd innebär ett *undantag från
en tidsgräns på platsen*, behöver vi den tidsgränsen också. I Göteborg saknas den på
496 sträckor — beslutet förutsätter att en gräns finns, men den är inte publicerad, och
då kan appen bara säga "kontrollera skylten".

### 7. Parkeringsanläggningar

P-hus och parkeringsytor, med läge, antal platser, ägare och pris.

| Uppgift | Varför |
|---|---|
| Typ (p-hus / öppen yta / infartsparkering) | Göteborg saknar detta, och vi kan därför inte skilja ett garage från en grusplan |
| Antal platser | Vi visar kapacitet |
| Pris med tidsfönster | Vi räknar ut priset just nu själva |

**Realtidslediga platser behöver vi inte** — och vi vill hellre ha inget än ett fält som
finns i beskrivningen men aldrig fylls i. Göteborgs API har ett sådant fält på alla
3 511 poster; det är tomt i varenda en.

---

## Fyra frågor vi alltid ställer, och varför

**1. Vad betyder ett tomt fält?**
Betyder en lastplats utan klockslag att den gäller *alltid*, eller att någon inte fyllt i
tiden? De två svaren ger motsatta färger på kartan. Vi läser hellre er föreskrift än
gissar. *(I Göteborg gällde det 140 lastplatser — vi läste fyra beslut från 2008 till
2026 och alla sa "dygnet runt". Då kunde vi rita rätt.)*

**2. Vilket koordinatsystem, och i vilken ordning?**
SWEREF99 eller WGS84 — och om axlarna är lng/lat eller lat/lng. Fel ordning ger inte ett
felmeddelande, den ger *nästan tomt*, vilket ser rimligt ut. Det har vi gått på en gång.

**3. Vad heter fälten, exakt?**
Vi har sett samma tjänst skriva `SiteName` i elva lager och `sitename` i tre. Det tappade
74 sträckor tyst innan vi upptäckte det.

**4. Hur ofta uppdateras tjänsten när ett beslut ändras?**
En karta som visar fjolårets beslut är sämre än ingen karta.

---

## Vad kommunen får ut av det

- Er data blir använd av invånare, inte bara av er själva
- Ni får återkoppling när verkligheten och registret glider isär. Vi har redan hittat
  konkreta fall — en skylt i Stockholm som var 16 år och två omregleringar gammal, och
  gator i Göteborg där tidsgränsen finns på skylten men inte i datan
- Färre felparkeringar och färre bogseringar
- Vi tar inte betalt av invånarna och kräver ingen inloggning

## Vad vi lovar

- Vi visar alltid källan och uppmanar alltid att kontrollera skylten på plats
- Vi hittar aldrig på en uppgift. Saknas den säger appen "vet inte" — den gissar aldrig
- Vi respekterar er licens. Är villkoren oklara frågar vi hellre än antar
