Lunchplanerare

En enkel statisk webbapp som visar dagens lunch och en hel veckovy, samt ett admins gränssnitt för att välja vilka rätter som ska publiceras.

## Struktur
- `index.html` – Publik startsida med dagens lunch.
- `weekly.html` – Publik vy över hela veckan (med veckoväljare).
- `x7k9m2p4.html` – Adminpanel (kräver inloggning via Firebase).
- `style.css` – Gemensamma stilmallar för alla sidor.
- `script.js` – All logik för att läsa lunchlistan, visa menyer och hantera adminflödet.
- `firebaseConfig.js` – Exporterar Firebase-konfigurationen.
- `data/lunches.json` – Reservdata om Firestore inte svarar (används endast som fallback).

## Grunddata
`data/lunches.json` innehåller objekt med följande fält och speglar strukturen i Firestore-samlingen `lunches`:
```json
{
  "id": "flaskytterfile",
  "title": "Fläskytterfilé",
  "detail": "Svampsås och kokt potatis.",
  "allergens": "Glutenfri, Laktosfri"
}
```
Uppdatera filen om du vill ha en fallback-lista när databasen inte svarar. Alla skarpa ändringar sparas i Firestore (samlingarna `lunches` och `customLunches`).

## Adminpanel
- Logga in med ett Firebase Auth-konto (E-post/Lösenord).
- Välj en vecka via rullistan (visar föregående vecka, aktuell vecka och nästa vecka) och koppla sedan rätter till måndag–fredag.
- Klicka på **Spara vecka** för att skriva data till Firestore (`weekSelections/{vecka}`).
- Lägg till nya luncher via formuläret längst ned. De sparas i `customLunches` och blir valbara direkt.
- Aktivera **Stängd idag** eller **Stängt tillsvidare** för att skriva till Firestore (`closedOverrides/{datum}` respektive `flags/persistentClosed`). Dessa meddelanden ersätter helt dagens lunch på startsidan.

> **Obs:** All publik data (luncher, veckomenyer, stängningsmeddelanden) läses nu från Firestore. Den statiska JSON-filen används endast om databasen inte går att nå.

## Veckovy
- På `weekly.html` kan besökare byta vecka med samma begränsade rullista (historik + en vecka framåt) för att förhandsgranska planerade menyer. Vy defaultar till nuvarande vecka.
