# ParkSpot – UX-design: en app, tre behov, inga flikar

> Designförslag 2026-06-02. Hur UC1/UC2/UC3 smälter samman till EN professionell
> upplevelse. Ingen kod – beslutsunderlag att godkänna innan utveckling.

---

## 1. Kärninsikten

Användaren tänker aldrig i "lägen" eller flikar. Hon tänker:
**"Jag behöver parkera – när, och hur länge?"**

Alla tre use cases är **samma fråga besvarad för olika tidpunkter**. Det enda som
skiljer dem åt är *när du står på platsen i förhållande till städningen*:

| Behov | Tidsfönster | Städgata imorgon betyder |
|---|---|---|
| **UC3 Nu** | Just nu, kort | Spelar mindre roll – gäller *nuvarande* laglighet |
| **UC1 I kväll** | Ikväll, borta före morgonen | **Möjlighet** – ofta ledig (andra undviker den) |
| **UC2 Över natten** | Står kvar i morgon bitti | **Fara** – du får böter/bogsering |

→ Slutsats: appen ska inte ha **lägen** – den ska ha **ETT svar som anpassas efter
ett enda "när"-val.** Det är så vi blir av med flikkänslan.

---

## 2. Designprinciper (rangordnade)

1. **Enkelhet först.** Ett svar syns direkt vid öppning, noll tryck. Allt annat är förfining.
2. **Tid är en egenskap av sökningen – inte en flik.** Man byter inte "app", man justerar "när".
3. **Sannolikhet styr ordningen.** Resultat *rankas* alltid efter chans att hitta plats.
4. **Faktum och rekommendation är två lager.** Kartan visar vad som är lagligt (stabilt);
   en grön framhävning visar vad som är *bäst för dig just nu* (intent-relativt).
5. **Planera och på plats är samma flöde.** Sök adress (innan) eller tryck GPS (på plats).
6. **Trygghet/ansvar alltid synligt.** "Kontrollera alltid skylt"-disclaimer kvar.

---

## 3. Det enande gränssnittet

### 3.1 Layout – karta som hjälte + bottensheet (Apple/Google Maps-mönstret)
Helskärmskarta. En **draggbar bottensheet** håller sökning, "när"-väljare och rankad
lista. Inga flikar – allt bor i ett sammanhängande ark som dras upp/ner.

```
┌──────────────────────────┐
│ 🅿 ParkSpot         ⚙    │
│ ┌──────────────────────┐ │
│ │ 🔍 Vart ska du?      │ │   destination ELLER tryck GPS
│ └──────────────────────┘ │
│                          │
│         [ KARTA ]        │
│   gröna = bäst för dig   │
│   blå = lagligt          │
│   gul = villkor/städas   │
│   röd = undvik      ◉GPS │
│                          │
│ ╭────────────────────────╮│  ← bottensheet
│ │ ▁▁▁                    ││
│ │ Parkerar  ⟨ Nu ▾ ⟩     ││  ← "när"-väljare (INTE flik)
│ │ 8 platser – hög chans  ││
│ │ ─────────────────────  ││
│ │ 🟢 Tabergsvägen  60 m ↗││
│ │ 🟢 Bengt Tranas  80 m ↗││
│ │ 🔵 Glimmerbacken 120m ↗││
│ ╰────────────────────────╯│
└──────────────────────────┘
```

### 3.2 "När"-väljaren – tabless kärna
Inspirerad av kollektivtrafik-appars *"Avgår nu ▾"*. En enda kontroll som läses som
en mening och fäller ut tre val – inte tre flikar:

```
⟨ Nu ▾ ⟩  tryck →
  ● Nu             Var får jag stå just nu?
  ○ I kväll        Störst chans till plats
  ○ Över natten    Tryggt till imorgon bitti
```

När man byter "när" **omfärgas kartan mjukt** (animerat) och listan rankas om. Samma
karta, samma plats – bara svaret ändras. Det är detta som gör att det känns som *ett*
verktyg, inte tre.

### 3.3 Smart standard (noll tryck)
Appen gissar rätt "när" vid öppning, så svaret oftast redan stämmer:
- Dagtid + i rörelse → **Nu**
- Kväll (efter ~18) → **Över natten** om nära sparad hemadress, annars **I kväll**
- Användaren kan alltid justera med ett tryck.

---

## 4. Ett enhetligt färgspråk (gäller alla tre behov)

Färgen betyder alltid samma sak – "för din parkering just nu":

| Färg | Betydelse | 
|---|---|
| 🟢 **Grön** | Bäst för dig (högst chans / tryggast) – rekommenderad |
| 🔵 **Blå** | Laglig/OK |
| 🟡 **Gul** | Villkor – kontrollera skylt / städas i ditt tidsfönster |
| 🔴 **Röd** | Undvik / förbjudet |

Samma gata kan vara **grön i "I kväll"** (städas imorgon = ledig) men **röd i "Över
natten"** (städas imorgon = bogsering). Färgen är intent-relativ, men *innebörden*
är konstant: grön = gör så här. Det är kraftfullt och begripligt.

> Tekniskt: faktalagret (blå=tillåten, röd=förbud från v2-grunden) ligger kvar som
> bas. "Grön rekommendation" och "gul varning" läggs på *ovanpå* utifrån vald intent.

---

## 5. Vad varje "när" visar (samma motor, olika policy)

### Nu (UC3)
- **Mål:** var är det lagligt att stå *just nu* (och hur länge).
- Karta: 🟢 lagliga + lång tillåten tid · 🔵 lagliga · 🟡 avgift/kort tid · 🔴 förbud/städas nu.
- Lista rankad på: laglig nu → närhet → längst tillåten tid.
- Badge: "Laglig nu · 2 tim" / "Avgift 25 kr/tim".
- Använder tidskontext: `START_TIME/END_TIME`, dagens städning, avgift just nu.

### I kväll (UC1)
- **Mål:** störst chans till plats inför kvällsbesök.
- 🟢 = gator som städas imorgon bitti (ofta lediga) – *prioriteras högst*.
- Badge: "Hög chans – städas 06–07" + påminnelse "flytta innan kl 06".
- Lista rankad på: chans (städas imorgon) → närhet.

### Över natten (UC2)
- **Mål:** stå tryggt tills imorgon utan böter.
- 🟢 = lagliga gator UTAN städning imorgon · 🔴/🟡 städgator markeras som undvik.
- Badge: "Trygg till imorgon" / "Boende – max 3 tim".
- Bygger direkt på v2-grunden (P_TILLATEN/P_FORBUD + städning).

---

## 6. Sannolikhet i förgrunden (användarens uttalade krav)

Resultaten *rankas alltid* efter chans – inte bara visas. Konkret:
- **Sammanfattningsrad** överst i arket: "8 platser med hög chans nära dig".
- **Chans-badge** per gata (Hög/Medel) baserat på intent + närhet + (för UC1) städning.
- **Auto-framhävt** bästa val (grön puls på kartan + överst i listan).
- Vid få träffar: "Få platser inom 300 m – visa inom 600 m?" (utöka istället för tom skärm).

---

## 7. Planera vs på plats (sömlöst, samma flöde)

- **Innan du åker:** sök destination → kartan flyger dit → svar för vald intent.
- **På plats:** tryck blå GPS-punkten (redan byggt) → svar runt din faktiska position.
- Liten kontextknapp "📍 Min plats" alltid nåbar. UC3 lyser extra på plats ("du verkar
  vara här – visa parkering nu?").

---

## 8. Professionell finputs (det som lyfter från bra till formidabelt)

- Mjuk omfärgnings-animation vid byte av "när".
- Draggbar sheet med tre lägen (peek / halv / full) – Apple Maps-känsla.
- Tomt-läge och fel-läge med konstruktiva nästa steg.
- Subtil haptik vid val (mobil).
- Zon/taxa som diskret underlag, inte i vägen (auto-kollaps – redan byggt).
- En enda, konsekvent legend som matchar färgspråket ovan.
- Tillgänglighet: färg + ikon/text (inte bara färg), stora träffytor.

---

## 8.1 Navigeringsknappen – delad knapp, ett minne (2026-08-26)

Kortet har **en** huvudhandling, inte tre likvärdiga. Knappen är därför delad:
vänstra delen kör igång i den app användaren redan valt, en smal högerdel (44 px,
pil nedåt) öppnar en liten bottenlåda med Google Maps, Apple Kartor och Waze.
Ett tryck i lådan både väljer och startar navigeringen; valet sparas i webbläsaren.

- **Standard är Google Maps** för alla nya användare – ingen tyst plattformsgissning.
- **Etiketten avslöjar vilken app som startar** ("Navigera hit" = Google, annars
  "Navigera med Waze" / "Navigera med Apple Kartor"). Den som aldrig rör pilen ser
  exakt samma knapp som tidigare.
- **Listornas små ↗-knappar följer samma val, utan egen meny.** En dold långtryckning
  på en 38 px-knapp skulle vara både osynlig och lätt att träffa fel – man byter app
  på kortet, inte i listan.
- **Apple Kartor visas bara på Apple-enheter.** `maps.apple.com` öppnar ingen app på
  Android/Windows, och en knapp som ibland leder till en tom sida är falsk trygghet.
  Sparat "apple"-val faller tillbaka till Google om enheten byts.
- **Ärlig gräns:** en webbsida kan inte se om Waze är installerat. Länken öppnar appen
  om den finns, annars Wazes webbkarta.

---

## 9. Vad detta INTE ska bli (medvetna nej)

- ❌ Inga flikar / lägesväljare som delar appen i "appar".
- ❌ Ingen 24h-tidsscrubber i v1 (kraftfullt men för komplext – spara till senare).
- ❌ Inga inställningssidor man måste konfigurera. Smart standard istället.

---

## 10. Föreslagen fasning

1. **Enande skal:** byt mode-pill → "när"-väljare (Nu/I kväll/Över natten) + bottensheet + enhetligt färgspråk. UC1/UC2 kopplas in oförändrade bakom.
2. **Rankning & chans-badges:** sannolikhetssortering + sammanfattningsrad + grön rekommendation.
3. **UC3 "Nu":** bygg nulägespolicyn på v2-grunden (tidskontext i regelmotorn).
4. **Finputs:** animationer, sheet-lägen, tomt/fel-lägen, haptik.

UC2 ligger redan på v2-grunden; UC1 migreras till samma grund under fas 1–3.

---

## 11. Beslutade designval (2026-06-02, godkända av Lars)

1. **Namn med underrubrik** (val A):
   ```
   ● Nu             Var får jag stå just nu?
   ○ I kväll        Störst chans till plats
   ○ Över natten    Tryggt till imorgon bitti
   ```
2. **Grön rekommendationslager** (val A): kartan visar fakta i blå/röd; grön läggs på
   de platser som är bäst för vald intent → sannolikheten syns direkt på kartan.
3. **Bottensheet** (val A): draggbart ark (peek/halv/full), telefon-först. Börja enkelt,
   förfina gestlägena stegvis.
4. **Smart standard vid öppning** (val A): gissa intent (dagtid→Nu, kväll→Över natten/
   I kväll), alltid justerbar med ett tryck. Ingen tvångsfråga.
   > **REVERSERAT 2026-08-18** (Lars beslut): automatiken gjorde det lätt att av misstag
   > testa/använda appen i fel läge utan att märka det (kvällstid → Natt-läge, där t.ex.
   > "nyss städad"/"gott om tid" inte visas eftersom de bara finns i Nu-läget – lätt att
   > misstolka som ett fel). Appen startar nu alltid i Nu-läget, oavsett tid på dygnet.

### Färgavstämning mot v2-koden (konsekvens av beslut 2)
Idag är blå = "säker/bäst". Det skiftar till:
- 🟢 **grön** = bäst för dig (rekommenderad) — NY topp-positiv
- 🔵 **blå** = laglig/OK (men inte topp-pick)
- 🟡 **gul** = villkor / städas i ditt tidsfönster / kontrollera skylt
- 🟠 **orange** = avgift dygnet runt (kan ev. vävas in i gul "villkor")
- 🟣 **lila** = ej för bil
- 🔴 **röd** = undvik / förbud
