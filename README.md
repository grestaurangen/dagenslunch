# G Restaurangen – Lunchplanerare

En enkel statisk webbapp som visar dagens lunch och en hel veckovy, samt ett admins gränssnitt för att välja vilka rätter som ska publiceras.

## Struktur
- `index.html` – Publik startsida med dagens lunch.
- `weekly.html` – Publik vy över hela veckan (med veckoväljare).
- `x7k9m2p4.html` – Enkel adminpanel (lösenordsskyddad på klientsidan).
- `style.css` – Gemensamma stilmallar för alla sidor.
- `script.js` – All logik för att läsa lunchlistan, visa menyer och hantera adminflödet.
- `data/lunches.json` – Grunddatan med titlar, detaljer och allergener.

## Grunddata
`data/lunches.json` innehåller objekt med följande fält:
```json
{
  "id": "flaskytterfile",
  "title": "Fläskytterfilé",
  "detail": "Svampsås och kokt potatis.",
  "allergens": "Glutenfri, Laktosfri"
}
```
Uppdatera filen manuellt om du vill distribuera nya standardrätter direkt i koden. Admin kan dessutom lägga till fler luncher via formuläret – de sparas i webbläsarens `localStorage`.

## Adminpanel
- Lösenordet är `grestaurang` (byt värdet `ADMIN_PIN` i `script.js`).
- Välj en vecka via rullistan (visar föregående veckor + endast en vecka framåt) och koppla sedan rätter till måndag–fredag.
- Klicka på **Spara vecka** för att lagra valet lokalt. Både startsidan och veckosidan hämtar samma data.
- Lägg till nya luncher via formuläret längst ned. Dessa blir valbara direkt.
- Adminpanelen är nu skyddad: formulären är inaktiverade tills inloggning, och sessionen sparas i `sessionStorage` (återställs när fliken stängs).

> **Säkerhetsvarning:** Lösenordet finns fortfarande i klientkoden (`script.js`) och kan ses av någon som visar källkoden. För riktig säkerhet behöver du implementera serverless-funktioner (se nedan) eller ett riktigt backend-API. `api/`-mappen innehåller platshållare för Vercel serverless-funktioner som du kan implementera senare.

## Veckovy
- På `weekly.html` kan besökare byta vecka med samma begränsade rullista (historik + en vecka framåt) för att förhandsgranska planerade menyer. Vy defaultar till nuvarande vecka.

## Publicering
1. Publicera filerna på valfri statisk webbhotell (GitHub Pages, Netlify, Vercel osv).
2. Säkerställ att `data/lunches.json` går att hämta via HTTP(S). Lokalt krävs en enkel utvecklingsserver (t.ex. `npx serve`), eftersom `fetch` mot `file://` blockeras av säkerhetsskäl.
