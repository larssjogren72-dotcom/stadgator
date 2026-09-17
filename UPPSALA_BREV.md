# Kontakt med Uppsala kommun

**Till:** `opendata@uppsala.se` – kommunens kontakt för öppna data

Adressen är inte gissad. Den står under «Kontakt» på uppsala.se, sidan *Öppna data
(psi-data)* (avläst 2026-09-15). Parkeringslagren beskrivs i tjänstens egen metadata som
«Uppsala Parkerings AB insamling av data», så det kan vara bolaget som i sista hand äger
svaren – be gärna att frågan skickas vidare dit.

Bilaga att skicka med: `KOMMUNBREV.md` (den fullständiga listan över vad appen behöver).

**SKICKAT av Lars 2026-09-17** till `opendata@uppsala.se`. Väntar svar.
Kommer svaret, för in det här (som `SUNDBYBERG_SVAR.md` och `MALMO_SVAR.md`) och rätta
det appen påstår innan något byggs vidare.

⚠ Brevet skrevs 2026-09-15 medan Uppsala var dold. Staden är **live sedan 2026-09-17**
(v1.30.1), så brevet säger nu rakt ut att den är uppe och att vi stänger av den samma dag
om kommunen säger nej. Tänds eller släcks staden igen måste de två ställena följa med.

---

## Förslag till mejl

**Ämne:** Fråga om parkeringslagren i kartportalen – får de användas i en gratis app?

Hej,

Jag heter Lars Sjögren och bygger **ParkSpot** (parkspot.se), en gratis karta som visar
var man får parkera lagligt just nu. Den är i drift för **Stockholm**, **Göteborg** och
sedan den 17 september även **Uppsala**.
Appen hittar inte på något: den visar kommunens egna uppgifter, och när en uppgift saknas
säger den det rakt ut i stället för att gissa. Inga personuppgifter, inga betalningar,
ingen inloggning.

Uppsala-versionen bygger på de parkeringslager som ligger i er kartportal och som kommunens
egen parkeringskarta läser (`kartportal.uppsala.se/mapping/rest/services/iKommunkartan/GOT_*`).
Datan håller hög kvalitet. Tidsgränser, tillåten tid och avgiftstid ligger som kodlistor i
stället för fritext, vilket gör den ovanligt lätt att läsa rätt. Vi har också kontrollerat
tolkningen mot skyltar på plats och mot era föreskrifter i Transportstyrelsens register.

Nedan har jag åtta frågor. Den första är den viktigaste, och jag vill vara rak om den.

**1. Får lagren användas?** De är öppet åtkomliga, men jag hittar dem inte på
opendata.uppsala.se och ingen licens anges i tjänsterna. Appen anger källan – «Baseras på
Uppsala kommuns parkeringskarta» står under kartan – och den anropar era tjänster i samma
omfattning som er egen parkeringskarta gör, med svaren mellanlagrade i sex timmar.
**Säger ni nej, eller vill se villkor uppfyllda först, stänger jag av Uppsala samma dag.**
Om det finns en licens eller villkor följer vi dem.

**2. Tider som står ensamma.** En tidsgräns som «4 tim 8-18» tolkar vi som skylten gör:
bara vardagar, utom dag före sön- och helgdag. «2 tim 8-18 (8-18) 8-18» tolkar vi som att
den även gäller lördagar och sön- och helgdagar. Stämmer det för er kodlista?

**3. Lastplatser och på- och avstigningsplatser.** 117 av 121 lastplatser i
`GOT_Lastplats` har tomt fält för restriktioner. Vi har läst fyra av era föreskrifter
(bland annat 0380 2020:224 på Skolgatan) och ingen har klockslag, så appen visar dem som
gällande dygnet runt – säg till om det finns undantag. Däremot heter alla 121 «Lastplats»,
även där skylten säger «På- och avstigningsplats». Går det att skilja dem åt i datan?

**4. Områdeskoder utan områdespost.** 26 koder som används på parkeringssträckor finns
inte i `GOT_Omradeskoder`, bland annat 18531 (34 sträckor), 18534 (19), 18520 och 18128
(10 vardera). Där vet appen varken priset eller om området har en tidsgräns. Kan de läggas
till?

**5. Städning och tillfälliga förbud.** Vi hittar inga fasta servicedagar. Är det rätt
att Uppsala bara skyltar tillfälligt, till exempel inför sandupptagning? Finns tillfälliga
förbud som data någonstans?

**6. Parkeringen som ytor.** All bilparkering ligger som linjer längs gatan. Ytor finns
bara för lastplatser, cykelparkering, boendeområden och områdeskoder. Fälten `PPID` och
`PYID` ser ut att peka på en parkeringsplats respektive en parkeringsyta, men `PYID` är
unikt per sträcka (1 351 sträckor, 1 351 värden). Finns parkeringsytorna som polygoner
någon annanstans, och går de att publicera? Med ytor kan vi rita en parkering där den
faktiskt ligger, i stället för som ett streck i gatan.

**7. Två lager vi valt att inte visa.** I `UPAB_Parkering_visning` ligger «Avstängda
parkeringar» med två poster, båda med slutdatum 2024-12-31 men fortfarande märkta
«Pågående: Ja». Där finns också «P 5 minuter» som en enda polygon på 2,4 km². Underhålls
de lagren? Avstängningar i realtid vore värdefullt för förarna om de är aktuella.

**8. Hur ofta uppdateras lagren** när ett beslut ändras?

Vi rapporterar gärna tillbaka där skylt och data inte stämmer.

Vänliga hälsningar
Lars Sjögren
parkspot.se
