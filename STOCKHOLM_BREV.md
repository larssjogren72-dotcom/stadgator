# Kontakt med Stockholms stad

**Till:** `funktionsbrevlada.tk.open.data@stockholm.se`

Adressen är inte gissad. Den står som kontakt på **openparking.stockholm.se** — samma
sida som delar ut API-nyckeln appen använder, och som drivs av Trafikkontoret ("tk" i
adressen). Kontrollerat 2026-09-05.

## Varför det här brevet är kortare än de andra tre

Malmö, Göteborg och Sundbyberg fick långa brev för att deras data har flera hål.
Stockholms data är den **bästa vi arbetar med** — platstypen är ifylld på 98,9 %, det
finns förbudsdata, taxezoner, gågator och städscheman med säsong. Därför bara en fråga,
och den är smal.

Bilaga behövs inte. `KOMMUNBREV.md` är skriven för kommuner som saknar det mesta; den
skulle läsas som nedlåtande här.

---

## Förslag till mejl

**Ämne:** Fråga om tidsgränser (MAX_MINUTES) i LTFR_P_TILLATEN

Hej,

Jag heter Lars Sjögren och driver **ParkSpot** (parkspot.se), en gratis karta som visar var
man får parkera lagligt. Den bygger på er öppna data och har funnits för Stockholm i drygt
ett år.

Först: er data är den rikaste jag arbetar med. Platstyp, förbud, taxezoner, gågator och
städscheman med säsong — det finns inte i någon annan kommun jag anslutit. Det mesta i
appen är möjligt tack vare det.

Jag har en enda fråga, om fälten `MAX_MINUTES` / `MAX_HOURS` i `LTFR_P_TILLATEN_GEOM`.

**De är nästan alltid tomma.** Mätt igår över sex områden — Vasastan, Södermalm, Östermalm,
Brommaplan, Kista och Årsta — bär **107 av 3 272** bilsträckor någon tidsgräns, alltså
3,3 %. Bland platserna märkta "P-avgift endast besök" har **187 av 242** varken tidsgräns
eller meterangivelse.

Ett konkret fall: Klädesvägen vid Brommaplan, föreskrift **0180 2024-01525**. Skylten säger
*30 min 7–19 (8–16) 8–14*. Posten har rätt platstyp, rätt klockslag och rätt taxa — men
`MAX_MINUTES`, `MAX_HOURS` och `VF_METER` är alla tomma. Min app visade platsen som ledig
över natten tills en användare fotograferade skylten. Jag har rättat det genom att sluta
lova något om besöksplatser alls, men det gör svaret trubbigare än det behöver vara.

**Min fråga:** finns tidsgränsen registrerad någonstans hos er — i ett fält jag inte hittat,
eller i ett underlag bakom `LTFR_P_TILLATEN` — och går den i så fall att exponera? Jag
behöver inte fler lager, bara den siffra som redan står på skylten.

En liten sak till, om den är enkel: föreskrifternas PDF:er hos Transportstyrelsen verkar
sakna textlager (0180 2024-01525 innehåller en bild på 1707×849 punkter och ingen läsbar
text). Går de att publicera med text skulle jag kunna verifiera enskilda fall för hand i
stället för att fråga er.

Om jag har missat något som redan finns tar jag tacksamt emot en pekare — det vore det
bästa utfallet.

Vänliga hälsningar
Lars Sjögren
lars.sjogren72@gmail.com
parkspot.se

---

## Om de svarar nej eller inte alls

Ingenting förändras. Sedan v1.25.1 målas varje plats märkt "endast besök" blå med texten
"kontrollera tidsgräns" i stället för grön. Det är ärligt men trubbigt: **52 av de 242**
platserna har faktiskt en publicerad gräns och skulle kunna få ett exaktare svar.

## Vad jag INTE tog med, och varför

* **Att tidsgränsens fönster saknas.** Jag trodde det, men mätte om (Vasastan, Södermalm,
  Östermalm, Kista): av **56** sträckor med en gräns anger **52** också vilka dagar den
  gäller och **44** vilka klockslag. Invändningen höll inte, så den ströks.
  ⚠️ Rättar därmed [[reference_maxtid_fonster_saknas]], som säger att fönstret saknas.
* **ODD_EVEN-förbuden** (195 poster). Datan finns — det är appen som inte hanterar jämna
  och udda veckor. Vår lucka, inte deras.
* **Att skylt och register glider isär** (Kungstensgatan 28A). Där hade registret rätt och
  skylten var 16 år gammal. Inget att klaga på.
