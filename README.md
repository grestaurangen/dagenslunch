# G Restaurangen – Lunchplanerare

En enkel statisk webbapp som visar dagens lunch och en hel veckovy, samt ett admins gränssnitt för att välja vilka rätter som ska publiceras.

## Struktur
- `index.html` – Publik startsida med dagens lunch.
- `weekly.html` – Publik vy över hela veckan (med veckoväljare).
- `x7k9m2p4.html` – Adminpanel (kräver inloggning via Firebase).
- `style.css` – Gemensamma stilmallar för alla sidor.
- `script.js` – All logik för att läsa lunchlistan, visa menyer och hantera adminflödet.
- `firebaseConfig.js` – Exporterar Firebase-konfigurationen.
- `data/lunches.json` – Reservdata om Firestore inte svarar (används endast som fallback).
- `api/instagram.js` – Vercel-serverlessfunktion som hämtar senaste Instagram-inlägget.

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
- Använd sektionen **Priser** för att sätta ordinarie pris och pensionärspris (sparas i `flags/pricing`). Detta visas automatiskt på både dagens lunch och veckosidan.
- I formulären för nya/ befintliga luncher finns en bock **Visa pensionärspris** som styr om pensionärspriset ska visas för just den rätten.
- Aktivera **Stängd idag** eller **Stängt tillsvidare** för att skriva till Firestore (`closedOverrides/{datum}` respektive `flags/persistentClosed`). Dessa meddelanden ersätter helt dagens lunch på startsidan.

> **Obs:** All publik data (luncher, veckomenyer, stängningsmeddelanden) läses nu från Firestore. Den statiska JSON-filen används endast om databasen inte går att nå.

## Veckovy
- På `weekly.html` kan besökare byta vecka med samma begränsade rullista (historik + en vecka framåt) för att förhandsgranska planerade menyer. Vy defaultar till nuvarande vecka.

## Publicering
1. Publicera filerna på valfri statisk hosting (GitHub Pages, Netlify, Vercel osv). Filen `firebaseConfig.js` måste innehålla projektets publika nycklar.
2. Firestore och Authentication måste vara aktiverade i Firebase-projektet. Se till att säkerhetsreglerna endast tillåter skrivningar för inloggade användare.
3. För Instagram-flödet krävs att sajten körs på en miljö som kan köra serverless-funktionen `api/instagram.js` (t.ex. Vercel). Sätt miljövariabeln `INSTAGRAM_ACCESS_TOKEN` till en långlivad token från Instagram Basic Display/Graph API som har läsrätt till kontot `golf_restaurangenskelleftea`.
4. För lokal utveckling krävs en enkel server (t.ex. `npx serve`) eftersom `fetch` mot `file://` blockeras och Firebase-moduler behöver laddas över http/https. Instagram-flödet fungerar endast när `INSTAGRAM_ACCESS_TOKEN` finns och serverless-funktionen kan anropas.

## Instagram-flöde
- Startsidan visar automatiskt det senaste inlägget från [Instagram-kontot](https://www.instagram.com/golf_restaurangenskelleftea/).
- Data hämtas via `api/instagram.js`, som proxy:ar mot `https://graph.instagram.com`. Token hålls hemlig i servermiljön och exponeras aldrig i klientkoden.
- Embedden återanvänder Instagrams officiella inbäddningsscript. Om API:t inte svarar visas i stället ett vänligt felmeddelande.
