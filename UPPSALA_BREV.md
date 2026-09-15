# Kontakt med Uppsala kommun

**Till:** `opendata@uppsala.se` – kommunens kontakt för öppna data

Adressen är inte gissad. Den står under «Kontakt» på uppsala.se, sidan *Öppna data
(psi-data)* (avläst 2026-09-15). Parkeringslagren beskrivs i tjänstens egen metadata som
«Uppsala Parkerings AB insamling av data», så det kan vara bolaget som i sista hand äger
svaren – be gärna att frågan skickas vidare dit.

Bilaga att skicka med: `KOMMUNBREV.md` (den fullständiga listan över vad appen behöver).

**Ingenting är skickat.** Lars avgör om och när.

---

## Förslag till mejl

**Ämne:** Fråga om parkeringslagren i kartportalen – får de användas i en gratis app?

Hej,

Jag heter Lars Sjögren och bygger **ParkSpot** (parkspot.se), en gratis karta som visar
var man får parkera lagligt just nu. Den är i drift för **Stockholm** och **Göteborg**.
Appen hittar inte på något: den visar kommunens egna uppgifter, och när en uppgift saknas
säger den det rakt ut i stället för att gissa. Inga personuppgifter, inga betalningar,
ingen inloggning.

Jag har byggt en version för Uppsala på de parkeringslager som ligger i er kartportal och
som kommunens egen parkeringskarta läser (`kartportal.uppsala.se/mapping/rest/services/
iKommunkartan/GOT_*`). Datan håller hög kvalitet. Tidsgränser, tillåten tid och avgiftstid
ligger som kodlistor i stället för fritext, vilket gör den ovanligt lätt att läsa rätt.

Innan appen visar Uppsala för allmänheten har jag några frågor.

**1. Får lagren användas?** De är öppet åtkomliga, men jag hittar dem inte på
opendata.uppsala.se och ingen licens anges i tjänsterna. Vi publicerar hellre inte än
använder data utan lov. Om det finns villkor följer vi dem, och vi anger alltid källan.

**2. Tider som står ensamma.** En tidsgräns som «4 tim 8-18» tolkar vi som skylten gör:
bara vardagar, utom dag före sön- och helgdag. «2 tim 8-18 (8-18) 8-18» tolkar vi som att
den även gäller lördagar och sön- och helgdagar. Stämmer det för er kodlista?

**3. Lastplatser utan tid.** 116 av 121 lastplatser i `GOT_Lastplats` har tomt fält för
restriktioner. Betyder det att lastplatsen gäller hela dygnet, eller att tiden inte är
inlagd? Appen visar dem i dag som «tider saknas», och det blir fel åt ena eller andra
hållet.

**4. Områdeskoder utan områdespost.** 26 koder som används på parkeringssträckor finns
inte i `GOT_Omradeskoder`, bland annat 18531 (34 sträckor), 18534 (19), 18520 och 18128
(10 vardera). Där vet appen varken priset eller om området har en tidsgräns. Kan de läggas
till?

**5. Städning och tillfälliga förbud.** Vi hittar inga fasta servicedagar. Är det rätt
att Uppsala bara skyltar tillfälligt, till exempel inför sandupptagning? Finns tillfälliga
förbud som data någonstans?

**6. Hur ofta uppdateras lagren** när ett beslut ändras?

Vi rapporterar gärna tillbaka där skylt och data inte stämmer.

Vänliga hälsningar
Lars Sjögren
parkspot.se
