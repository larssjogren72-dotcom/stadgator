# Karlstad — stad sex

Byggd 2026-09-17–18 enligt `NY_STAD.md`. Koden: `cities/karlstad.js`. Proven:
`node test/karlstad-prov.js` (33 prov mot riktig data, alla gröna 2026-09-18).

---

## 1. Städmodellen — det första som ska sägas

**Karlstad har städgator, och det är den starka sorten.** Kommunen kallar dem
**servicedagar** (tidigare städdagar). Servicedagen är ett **skyltat parkeringsförbud**
några timmar **varannan vecka**. Kommunens egna ord (karlstad.se, *Schema för
servicedagar*, uppdaterad 2026-09-04):

> «Servicedagarna innebär att det är parkeringsförbud på gatan under ett antal timmar.
> Om servicedag med parkeringsförbud gäller står det på vägmärket vid varje berörd gata.»

| | Karlstad |
|---|---|
| Rytm | Veckodag + klockslag + **jämna/udda veckor** (Göteborgs modell) |
| Fönster | 05–07, 08–10, 10–12, 12–14, 13–15 |
| Per gatsida | Ja, många gator har olika dag på var sida |
| Säsong | **Ingen.** Gäller året runt: sopning på sommaren, plogning på vintern |
| Omfattning | 92 gatuavsnitt i kommunens lista, 184 linjer, 20,8 km, centrala Karlstad |
| Övriga gator | Underhållssopning **utan** förbud, och de färgas inte |
| **Röda dagar** | **Förbudet gäller inte.** Tvärtemot Stockholm, där det gäller även på helgdagar |

Det här gör appen i Karlstad till vad den är i Stockholm och Göteborg: städvarning,
«trygg över natten» och glöd när städningen slutat.

---

## 2. Frånvarotabell — vad ett tomt fält betyder

Tre svar är möjliga (`NY_STAD.md` steg 2): **Alltid**, **Vet inte** eller
**Finns inte**. Källan står per rad.

| Fält / lager | Hur tomt | Betyder | Appen gör | Källa |
|---|---|---|---|---|
| Städlagret: dag, tid och vecka | 16 av 200 rader helt tomma | **Vet inte.** 9 ligger ovanpå en rad med schema, 7 (på 4 linjer) har inget schema någonstans | Ritas inte. Aldrig «inget förbud» | Mätt 2026-09-17. De 21 grupperna i kommunens lista finns alla i datan (21/21) |
| Städlagret: säsong | Fältet finns inte | **Finns inte, gäller året runt** | `START_MONTH` = null | Kommunens sida nämner både sopning och plogning. Ingen säsong står någonstans |
| Gatunamn (båda lagren) | Fältet finns inte | **Finns inte** | Härlett ur adresslagret. 97 % träff mot kommunens lista (77/79) | `verktyg/bygg-karlstad-gatunamn.js` |
| `max_ptid` (tidsgräns) | 178 av 381 | **Vet inte** | Blått «kontrollera tidsgräns», aldrig grönt över natten | Står i brevet. Ingen föreskrift läst ännu |
| `parkeringstyp` | 381 av 381 | **Finns inte** | Alla blir «P Avgift» | Mätt |
| `parkeringsforbud` (fritext på sträckan) | 332 av 381 | **Vet inte**, fältet är ofullständigt: 71 sträckor utan text ligger på en städlinje | Städlagret är grunden. Texten läggs till där den är oense | Mätt |
| `timtaxa_natt` | 123 av 381 | **Vet inte** | Ingen «fritt övrig tid» skrivs ut | Mätt |
| Avgiftsfri gatuparkering | Lagret spärrat (HTTP 401) | **Finns inte för oss** | Ritas inte. «Ingen uppgift», inte «fritt» | ⚠ Inventeringen 2026-09-15 skrev «401 poster». Det var HTTP-koden |
| Rörelsehindrade, MC | Bara punkter (70 och 4) | **Finns inte som sträckor** | RH- och MC-lägena är tomma. Disclaimern säger det | En punkt har ingen längd, och att rita en linje vore att hitta på |
| Parkeringsförbud utanför servicedagar | Inget lager av 623 | **Finns inte** | En gata utan färg = «ingen uppgift» | GetCapabilities 2026-09-17 |
| Anläggningarnas kapacitet | Fältet finns inte | **Finns inte** | Ingen platssiffra | Mätt |
| Anläggningarnas pris | 40 av 147 är «Se taxa» (länk) | **Vet inte** | Ingen prisrad | Mätt |

---

## 3. Konflikt mellan två av kommunens egna källor

49 avgiftssträckor bär förbudstexten i eget fält. **I tre fall säger den något annat än
städlinjen 1 m bort**, och en sträcka har ingen städlinje alls:

| Plats | Parkeringslagret säger | Städlagret (och kommunens lista) säger |
|---|---|---|
| Vikengatan (två sträckor) | måndagar jämna veckor **10–12** | måndag jämna veckor **08–10** |
| Drottninggatan vid 59.37913, 13.50522 | **måndagar** jämna veckor 05–07 | **onsdag** jämna veckor 05–07 |

**Appen väljer inte.** Båda fönstren visas. Att visa ett fönster för mycket kostar en
onödig flytt, men att dölja ett riktigt kostar en bot. Provet `Vikengatan: båda
källornas fönster visas` vaktar regeln.

Kommunens publicerade lista säger 08–10 för Vikengatan, så parkeringslagrets text är
troligen gammal. Det avgörs av skylten, se rundan nedan.

---

## 4. Skyltrunda — fem platser före Go

Ta ett foto av skylten och notera datum. Varje punkt prövar något som datan inte kan
bevisa om sig själv.

| # | Plats | Vad fotot avgör |
|---|---|---|
| 1 | **Vikengatan**, 59.37724, 13.49434 | Står det **08–10** eller **10–12**? Avgör vilken av kommunens två källor som stämmer (konflikten ovan) |
| 2 | **Drottninggatan** vid Grevgatan/Fredsgatan, 59.37913, 13.50522 | **Måndag** eller **onsdag**? Här möts två avsnitt med olika dag |
| 3 | **Tingbergsgatan**, båda sidor, 59.37525, 13.48896 | Östra sidan måndag 08–10, västra tisdag 13–15. Stämmer **sidorna**? |
| 4 | **Hagaborgsgatan**, södra sidan, 59.38795, 13.51733 | Den enda gatan med **udda** vecka en tisdag. Står «udda» eller «ojämna» på skylten? Och nämns röda dagar på någon skylt? |
| 5 | **Trädgårdsgatan**, Grön zon, 59.37720, 13.50197 | Datan har **ingen tidsgräns**, så appen visar blått. Står en gräns på skylten? Och vad kostar det efter 18? |

Punkt 5 prövar den största luckan: 47 % av sträckorna saknar tidsgräns.

---

## 5. Kända begränsningar

- **Priset syns inte på platskortet**, bara på SEO-sidorna. Kortet visar pris enbart
  via Stockholms zonkarta, så sträckans egen pristext når inte kortet i *någon*
  stad utanför Stockholm (Göteborg och Uppsala har samma lucka). En delad UX-fråga,
  ej byggd.
- **Namnen är härledda**, inte kommunens. 73 av 364 sträckor i centrum saknar namn:
  parkeringsområden långt från adresser. Ingen av dem ligger nära en städlinje, så
  ingen städvarning går förlorad (mätt).
- **Julafton, midsommarafton och nyårsafton** räknas *inte* som röda dagar. Det är
  lagens definition och det försiktiga valet: på de dagarna visas servicedagen. Frågan
  står i brevet.
- **Skalan i SWEREF 99 18 00.** Karlstad ligger 4,5° från zonens mittmeridian. Positionerna
  är exakta (under 1 mm mot proj4), men avstånd i planet är 0,8 % för långa. En tolerans
  på 12 m blir 12,1 m.
- **Licens.** Lagren ligger i kommunens `webbkartan`, inte i `oppnadata`. Därför skriver
  appen «webbkarta», aldrig «öppna data». Se `KARLSTAD_BREV.md`.

---

## 6. Så uppdateras staden

```bash
node verktyg/bygg-karlstad-gatunamn.js     # gatunamnen, med kontroll mot kommunens lista
node verktyg/bygg-karlstad-seo.js          # SEO-underlaget
node seo/build.js                          # sidorna
node test/karlstad-prov.js                 # 33 prov mot riktig data
```

När kommunen uppdaterar sin lista över servicedagar: för in den i
`verktyg/karlstad-servicedagar-facit.json` (samma form) och kör de tre första stegen.
