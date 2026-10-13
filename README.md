# Samlarportfölj

Statisk sajt: `index.html` + `app.js` + `style.css` hämtar `data.json` (cache-bustad) och renderar allt i webbläsaren (deals, auktioner, grafer, källtabeller). Uppdateringar ändrar bara `data.json`.
`portfolio.json` är en symlänk till `data.json`. `build.py`/`dashboard.html` är den äldre offline-versionen (fungerar fortfarande).

## Måndag/torsdag-rutin
1. `python3 update.py list` för källor.
2. Priser, erbjudanden och auktioner läggs in i `data.json` (via `update.py add`, `offer`, `rate` eller handredigering av `auctions`/`market_watch`) enligt avsnitten nedan. Hitta aldrig på siffror.
3. Sätt `last_updated` (`python3 update.py build` gör det och bygger även offline-HTML).
4. Förhandsgranska: `python3 -m http.server 8765` → http://localhost:8765, skärmdump med headless Chrome (`--virtual-time-budget=3000`).
5. `python3 update.py publish "Prisuppdatering ÅÅÅÅ-MM-DD"` → commit + push till `origin main` (token från `GITHUB_TOKEN` via credential helper, skrivs aldrig ut). GitHub Pages uppdateras inom någon minut.
## Veckoprocedur (för agent)
1. `python3 update.py list` → för varje item visas käll-URL:er.
2. Hämta aktuella priser med WebFetch/WebSearch (Cardmarket: från/trend/30d; TCGplayer via PokeFocus/Tickermint/MythicHub; Tradera-sökning; Pokejakt + svenska butiker; PackQuant för MTG). Cardmarket blockerar ibland — prova igen eller använd sökresultatets utdrag.
3. För varje *faktiskt sett* pris: `python3 update.py add <id> <YYYY-MM-DD> "<källa>" <pris> <EUR|SEK|USD> <trend|listing|sold|bid> <url> ["notis"]`. Hitta aldrig på siffror; saknas data, lägg inte till något.
4. Valutakurs: hämta ECB EUR/SEK (t.ex. fx.initask.com/eur-sek/<datum>) → `python3 update.py rate EUR <kurs> <url>`.
5. Uppdatera vid behov `valuation` och `notes` i JSON för hand (t.ex. ny trend som mitten-värde).
6. `python3 update.py build`, rendera PNG, rapportera förändringar (± mot förra veckan).

## Deal-jakt (mån & tors)
Riktmärke = senaste Cardmarket-trend i `snapshots`. Tröskel och antaganden i `deal_settings` (portfolio.json): `threshold_pct` (15), `import_vat_pct` (25), `customs_pct` (0, antagande för samlarkort – verifiera), `non_eu_handling_fee_sek` (okänd, 0).
1. Uppdatera först Cardmarket-trend (snapshot) och kurser (`update.py rate EUR|USD|GBP <kurs> <url>`; GBP = ECB EUR/SEK ÷ EUR/GBP).
2. För varje item, sök erbjudanden: eBay (.de/.se/.com/.co.uk, kontrollera att frakt till Sverige finns), Tradera Köp nu (ej pågående bud), svenska butiker (Pokejakt, Dragon's Lair, Hobbykort, Blindbox …), EU-butiker, Aukro.
3. Lägg till varje sett erbjudande: `python3 update.py offer <id> <datum> "<källa>" "<säljare>" <pris> <valuta> <frakt|-> <SE|EU|non-EU> <yes|no|?> <url> [betyg|-] [språk] ["noter"]`. Ange `-` för okänd frakt, `?` för okänd lagerstatus. Hitta aldrig på värden.
4. `python3 update.py build` + rendera PNG. Deals = erbjudanden från senaste datum, ej "slut", landat pris ≥ tröskel under trend. Äldre erbjudanden ligger kvar som historik.
5. Rapportera flaggade deals med länk, landat pris, rabatt och riskflaggor. Kontrollera alltid manuellt innan köp.

## Auktioner (mån & tors): Tradera, Auctionet, Bukowskis
Avgifter i `auction_fees` (källa per hus). Landat = bud × (1+premium_pct) + fixed (+ frakt om angiven; +25 % importmoms för UK-hus via Auctionet).
- Tradera: köparskydd ≈5 % (observerat, ej officiellt) – uppdatera om Tradera publicerar annat.
- Auctionet: SE max 25 % + 80 kr; UK max 33,6 % + £5; övriga 25 % + €8 (https://auctionet.com/sv/help/22-buyer-fees). Exakt avgift står på föremålssidan.
- Bukowskis: 25 % + 80 kr (https://www.bukowskis.com/sv/price_list).
Steg:
1. Tradera: WebFetch `https://www.tradera.com/search?q=<objekt>` – notera sluttid, ledande bud/utrop, Köp nu.
2. Auctionet: sökningen är JS-renderad; använd `curl -sL -A Mozilla/5.0 https://auctionet.com/sv/search?q=pokemon` och plocka `/sv/<id>-...`-länkar, hämta varje föremålssida och läs `ends_at`, `estimate`, `next_bid_amount`, `original_currency` ur inbäddad JSON (beloppen visas i boxens valuta, ofta USD – notera originalvalutan). Sök även "magic the gathering", "booster", "trading cards".
3. Bukowskis: `https://www.bukowskis.com/sv/search?q=pokemon` (och magic). Hittills inga TCG-objekt.
4. Lägg in i `auctions` i portfolio.json (item_id om objektet spåras, annars null; platform måste matcha en nyckel i `auction_fees`; price_kind = bud|utrop|lägsta nästa bud; ends_at ISO lokal tid). Ta inte bort avslutade – de blir historik och döljs i "På auktion nu".
5. Fasta annonser (Blocket m.fl.) som är intressanta men inte spåras: `market_watch`.
