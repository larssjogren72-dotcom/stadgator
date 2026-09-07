# Svar till Ann-Marie, Sundbybergs stad

Skickas manuellt av Lars.

Omskrivet 2026-09-07 — tredje versionen. De två första ställde frågor och bad om data.
Den här meddelar i stället att vi pausar Sundbyberg, och lämnar en tydlig lista över vad
som skulle krävas om staden vill ta upp frågan igen. Ingen press, ingen skuld.

Bakgrund till beslutet: appens huvudfråga är "kan jag lämna bilen här över natten?", och
den kan aldrig besvaras med ja i Sundbyberg. Se `project_stadgator_stadsdata_jamforelse`.

---

**Ämne:** Vi pausar Sundbyberg – och vad som skulle behövas

Hej Ann-Marie,

Tack för ditt svar. Det var ärligt och konkret, och det gav mig mer klarhet än flera
veckors letande i datan hade gjort. Jag vill återkoppla vad jag landat i.

**Jag pausar Sundbyberg tills vidare.**

Skälet är inte något ni gjort fel. Det handlar om vad min app försöker svara på.

Den ställer i grunden en enda fråga: *kan jag lämna bilen här över natten?* För att svara
ja behöver jag kunna utesluta att platsen är tidsbegränsad. Det kan jag inte göra i
Sundbyberg — inte för att gatorna är tidsbegränsade, utan för att inget i datan skiljer
en tidsbegränsad ruta från en oreglerad. Alla 808 bilsegment bär samma platstyp.

Följden är att appen måste svara "kontrollera skylten" på varenda gata i kommunen, även
på de gator där det troligen är helt fritt. Det är, som du förstår, ungefär vad någon
hade gjort utan appen. Då tillför den inte tillräckligt för att jag ska vilja släppa
den skarpt.

Jag vill vara tydlig med en sak: **det här betyder inte att Sundbyberg är svårt att
parkera i.** Om din bild stämmer — att tidsgränser i praktiken bara finns vid vissa
skolor och vissa platser för rörelsehindrade — så är det tvärtom fritt på det mesta.
Problemet är att jag inte kan bevisa det, inte att verkligheten är krånglig.

**Det som är bra i er data, och som jag gärna säger högt**

Era servicedagar är bland det bästa jag sett. Både säsong och klockslag ligger som egna
fält, vilket flera större kommuner inte publicerar. Zonerna med priser är kompletta, och
lastplatserna ligger som eget lager med villkoren i klartext.

Jag hittade också ett fält jag missat tidigare, `Avgift_tid`, som anger när avgiften
gäller — "08:00-21:00 och lördag 10:00-17:00" och liknande. Det hade jag förbisett när
jag skrev till dig första gången, och det var mitt fel, inte er brist. Den uppgiften är
användbar och kommer med om vi startar om.

**Om ni någon gång kommer på andra tankar**

Tre saker skulle förändra läget. De står i den ordning som ger mest effekt per insats.

*1. En markering på de få rutor som faktiskt har en tidsgräns.*
Inte gränsen i sig — bara ett ja eller nej. Du skrev att det rör sig om vissa skolor och
vissa RH-platser. Om de rutorna märks ut betyder tystnaden på alla andra att de är
oreglerade, och appen kan säga "här går det bra att stå över natten" i hela resten av
kommunen. Det här är den enskilt största skillnaden, och sannolikt den minsta insatsen.

*2. Parkeringsförbuden, även grovt.*
Både de enstaka sträckorna och förbudsområdena i Lilla Ursvik och Duvbo. I dag finns
inga förbud alls i datan, vilket gör att en gata utan uppgift ritas färglös — och inne i
ett förbudsområde betyder tystnad ju i själva verket förbjudet. Även en skiss av
områdesgränserna skulle hjälpa.

Ett konkret exempel, inte som kritik utan för att visa vad jag menar: på Brunnsgatans
västra sida, en bit nedanför vändplanen, står en förbudsskylt. Jag har letat igenom
samtliga 60 karttjänster på gis.sundbyberg.se och det finns inget lager alls för
parkeringsförbud, så den skylten har ingen motsvarighet i datan. Den är en av de
sträckor "här och där" du nämnde.

*3. Vilken sida av gatan en sträcka ligger på.*
Den här är minst brådskande men värd att nämna: även om jag fick förbuden skulle jag
inte kunna placera dem rätt, eftersom det inte framgår om en sträcka avser östra eller
västra sidan. Stockholm har det fältet.

**Ingen brådska, och inga förväntningar**

Jag skriver det här för att du var hjälpsam och förtjänar ett rakt besked, inte för att
be om något. Skulle lagret ses över och något av ovanstående komma på plats hör jag
gärna av mig igen — arbetet finns kvar och kan tas upp när som helst.

Tack för att du tog dig tid att svara ordentligt.

Vänliga hälsningar
Lars Sjögren
parkspot.se
