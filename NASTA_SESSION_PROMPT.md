# Nästa session

Skrivet 2026-09-18 när Karlstad byggts som stad sex.

## Läget

- **Live på parkspot.se: v1.33.0** (`1a5d320`).
- **Karlstad är byggd, testad och committad lokalt som v1.34.0 på grenen `karlstad`.
  EJ pushad.** Allt om staden står i `KARLSTAD.md`: städmodellen, frånvarotabellen,
  konflikten mellan kommunens två källor, skyltrundan och kända begränsningar.
- Staden är **synlig i väljaren** (`visaIVal:true`) och går alltså live samma sekund som
  grenen pushas till master.

## Innan push – Lars beslut

1. **Licensen.** Karlstads parkeringslager ligger i kommunens `webbkartan`, inte i
   `oppnadata`. Samma läge som Uppsala, som gick live med frågan öppen. Brevet är klart i
   `KARLSTAD_BREV.md` men **inte skickat**.
2. **Skyltrundan** (fem platser i `KARLSTAD.md` §4). Två av dem avgör vilken av
   kommunens källor som stämmer på Vikengatan och Drottninggatan.

## Startprompt att klistra in

> Läs KARLSTAD.md och NASTA_SESSION_PROMPT.md. Jag har [gjort skyltrundan / skickat
> brevet / fått svar]. Uppdatera det appen påstår och säg om Karlstad är redo att pushas.

## Kvar sedan tidigare

- Malmös fyra lastplatser visas gröna. Läs Malmös föreskrifter först, som för Uppsala.
- **Priset syns inte på platskortet utanför Stockholm.** Kortet visar pris bara via
  Stockholms zonkarta, så sträckans egen pristext (`PARKING_RATE`) når aldrig kortet i
  Göteborg, Uppsala eller Karlstad. Upptäckt 2026-09-18. En delad UX-fråga, så visa en
  skiss innan något byggs.
- Svar väntas från Uppsala (17/9) och Stockholms trafikkontor (5/9).
