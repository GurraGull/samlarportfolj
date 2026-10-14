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

## Design & bilder
- Sajten: hero (portföljvärde) → "Att titta på nu" (deals + auktioner som slutar snart, med nedräkning) → "Mina samlarobjekt" → "Bevakning" → "Detaljer" (hopfällbara tabeller). Mobil först.
- Produktbilder ligger lokalt i `images/<id>.webp` (max 600 px, nedladdade – ingen hotlinking). Varje item i `data.json` har `image: {src, credit, source_url, downloaded}`. Saknas bild visas `images/placeholder.svg`.
- Nytt objekt: ladda ner bild (t.ex. og:image från butikssidan), konvertera med Pillow till webp, lägg till `image`-fältet.
- Förhandsgranska: `python3 -m http.server 8765` + headless Chrome i 390 px och 1280 px (`preview-mobile.png`, `preview-desktop.png`).

## Bildanalys av auktionslotter (mån & tors)
För varje ny lot (Auctionet, Tradera, Bukowskis) med blandade kort/samlarobjekt:
1. Hämta alla lotbilder (Auctionet: `curl` föremålssidan, plocka `https://images.auctionet.com/thumbs/large_item_<id>_*.jpg`), spara som webp (max 900 px) i `images/lots/<plattform>-<id>-<n>.webp`.
2. Titta på varje bild (Read-verktyget) och notera: kortnamn, set/nummer, holo/1st edition/shadowless, språk, graderingar (PSA/BGS/CGC + betyg), förseglade produkter, skick (bucklor, kantslitage, öppnad plast).
3. Slå upp pris för identifierade kort av värde (Cardmarket/TCGplayer/PriceCharting) – källa + datum. Var ärlig om osäkerhet (suddigt, edition ej bekräftad). Hitta aldrig på priser.
4. Lägg in `lot_analysis` i auktionsposten i `data.json`: `images`, `identified[] {what, notes, price?, url?}`, `flags[]`, `gems[]` (dyrgripar; markera "gömt och glömt" om titeln/beskrivningen inte nämner dem), `value_range` (null om ej tillförlitligt), `value_note`, `verdict`, `analyzed`.
5. Lotter med `gems` lyfts först i "Att titta på nu".

## Prisbevakningar, transaktioner och portföljgraf (okt 2026)

**Prisbevakningar** (`items[].alerts`): `{"type": "below"|"above", "sek": 1100, "basis": "offer"|"value", "note": "..."}`.
`basis=offer` jämför med bästa *landade* pris bland senaste sökdatumets erbjudanden i lager; `basis=value` jämför med mittvärdet.
Utlösta bevakningar visas som gula badges på korten och som banner på Översikt. De tre befintliga är **exempel** – justera.
```
python3 update.py alert pkm-30c-etb below 1100 offer "köp en till"
python3 update.py alert-rm pkm-30c-etb 0
python3 update.py check
```
**Mån & tors-rutinen:** efter att snapshots/erbjudanden/auktioner lagts in, kör `python3 update.py check` och rapportera varje `UTLÖST` rad till Gustaf (objekt, gräns, nuvarande pris, länk till erbjudandet).

**Transaktionslogg** (`transactions`): `{date|null, type buy|sell, item_id, qty, price_sek, fees_sek, platform, note}`.
Investerat/realiserat/orealiserat beräknas från loggen (snittkostnad). Orealiserat = mittvärde − kvarvarande kostnad.
```
python3 update.py tx buy pkm-30c-etb - 999 0 okänd 1 "Köpdatum okänt"
python3 update.py tx sell pkm-30c-etb 2026-11-02 1500 75 Tradera
python3 update.py txs
```
Uppdatera även `status`/`quantity` på objektet när innehavet ändras.

**Portföljgraf & största rörelser:** byggs i webbläsaren från trend-snapshots (Cardmarket när det finns ≥2 datum, annars den trendkälla med flest datum) × innehav från transaktionsloggen. 7 d / 30 d / Allt räknas mot `last_updated`. Fler dagliga/regelbundna Cardmarket-trendpunkter ger en tätare graf – lägg därför alltid till en Cardmarket-trend-snapshot per objekt i rutinen.

**Design:** appen har flikar (Översikt, Deals, Auktioner, Samling, Bevakning) via `#hash`, bottenflikar på mobil och sidomeny på desktop. Ikoner är inline-SVG; inga externa resurser eller typsnitt (systemtypsnitt).

## Lagerkontroll (obligatorisk före deal-rapport, mån & tors)
`python3 update.py stock` (= `stockcheck.py`) hämtar varje erbjudandes produktsida och sätter `stock_status` (in_stock / out_of_stock / preorder / unknown), `stock_checked_at`, `stock_evidence`, `http_status`, `dead_link` (404/410). Ordning: Shopify `/products/<handle>.js` → schema.org `availability` → synlig text (Slut i lager, Ej i lager, Bevaka, Notify me, Sold out …). Sök-/listsidor (Tradera-sök, Pokejakt) = unknown. Cardmarket blockerar bottar → markeras in_stock (marknadsplats, annonser är i lager) men priset är inte live-kontrollerat. Auktioner får `auction_status` active/ended.
Sajten räknar **bara** `in_stock` + engelska som deal, och bara aktiva auktioner i "Att titta på nu". Slut i lager / ej engelska visas utfällbart och gråat; unknown får en varningsbadge. Rapportera aldrig en deal eller utlöst bevakning utan att `stock` körts samma dag.
Ordning i rutinen: lägg in priser/erbjudanden → `update.py stock` → `update.py check` → rapportera → `update.py publish`.

## Språkfilter & MTG-bevakning
Globalt språkfilter: engelska (`language_filter` i data.json). Erbjudanden med annat språk (t.ex. tyska) räknas aldrig som deals. Cardmarket-länkar har `language=1`.
MTG Collector-boxar: riktmärke = Cardmarkets officiella prisguide (`https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json`, produktlista `.../productList/products_nonsingles_1.json`, kategori "Magic Display"). Slå upp `cardmarket_id` per objekt och lägg till trend som snapshot. Prisguiden är inte språkfiltrerad; ignorera `low` (ofta fel språk). Nya köpbara erbjudanden: skanna Shopify-butikernas `/products.json` (dragonslair.se, nordic-legends.com, cardcosmos.de, paperdealer.eu, manatorsk.com) efter "Collector Booster Box/Display" med `available: true` och engelsk titel.

## Bästa deals (Översikt, överst)
Ranking av **enskilda köpbara erbjudanden** över alla objekt (app.js `dealCands`): rabatt mot Cardmarket-trend i landat SEK. Med: verifierat i lager + engelska butiksannonser, Tradera Köp nu (+5 % köparskydd, fält `fee_pct`), Cardmarket-billigast (ej live-kontrollerad), aktiva auktioner (bud + avgifter, minus antagen budhöjning: 15 % >3 d, 10 % 1–3 d, 5 % 6–24 h, 2 % <6 h). Inga poäng för att bara finnas i lager. Om inget ligger under trend visas "Närmast en deal". "Stiger mest" ligger som mindre sektion längre ned.

### Bredda deal-sökningen (mån & tors)
1. Shopify-butiker: `/products.json?limit=250&page=N` på dragonslair.se, blindbox.se, hobbykort.se, kortarkivet.se, manatorsk.com, nordic-legends.com, paperdealer.eu, cardcosmos.de, totalcards.net (UK = icke-EU). Filtrera titlar "Collector Booster Box/Display" resp. "30th … Elite Trainer Box", `available: true`, engelska.
2. Alphaspel: `https://www.alphaspel.se/search/?query=<set> collector booster display` → produktsidan har schema.org availability.
3. Tradera: söksidans HTML innehåller JSON (`"items":[...]` före `"relatedItems"`) med itemUrl, itemType (Auction/AuctionBin/PureBin/ShopItem), price, totalBids, endDate (UTC), buyNowPrice. Lägg Köp nu som offer (fee_pct 5) och auktioner i `auctions` med item-URL. Ta bort Tradera-auktioner utan /item/-URL.
4. Ej åtkomliga utan webbläsare (okt 2026): Cardmarket (Cloudflare 403), Webhallen, Inet, Spelexperten, Worlds of Wonder, Magic Madhouse, Fantasia, Spellbound, Fanatics – kolla manuellt/i webbläsare vid behov.
5. `update.py stock` → `update.py check` → rapportera topp 3 i "Bästa deals" → `publish`.

## Bevaka restock – Webhallen (manuell webbläsarkoll, mån & tors)
Webhallen blockerar curl/automatik. Erbjudanden med `manual_stock_check: "browser"` hoppas över av `stockcheck.py` och ska **kontrolleras i webbläsaren (computerUse)** varje rutin: öppna varje Webhallen-URL med `restock_watch: true`, läs lagerstatus för webb och butik, uppdatera `stock_status`, `stock_checked_at`, `stock_evidence` (och pris) i data.json.
**Om något är i lager (webb eller butik): meddela Gustaf omedelbart** (produkt, pris, länk, ev. köpbegränsning/medlemskrav) – vänta inte på rutinrapporten.
Sajten visar dessa i sektionen "Bevaka restock" på Översikt (butikspris under trend, t.ex. 30th ETB 999 kr, Hobbit 4 999 kr).
