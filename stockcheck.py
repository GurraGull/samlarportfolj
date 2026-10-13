#!/usr/bin/env python3
"""Lagerkontroll för alla erbjudanden och auktioner i data.json.
  python3 stockcheck.py            -> kontrollerar och skriver stock_status/stock_checked_at/stock_evidence/http_status
  python3 stockcheck.py --dry      -> skriver bara ut
Ordning: Shopify /products/<handle>.js ('available' per variant) -> schema.org JSON-LD/microdata availability
-> synlig text ('Slut i lager', 'Ej i lager', 'Bevaka', 'Notify me', 'Sold out', 'Köp' / 'Lägg i varukorg'...).
Söksidor/listsidor (Tradera-sök, Pokejakt-set) kan inte verifieras per produkt -> unknown.
Cardmarket blockerar bottar (403) -> 'unknown' om inte sidan går att läsa; Cardmarket-annonser är per definition i lager när de listas.
404/410 -> dead_link (räknas som out_of_stock)."""
import json, re, sys, html, pathlib, datetime as dt, urllib.request, urllib.error, urllib.parse, time
D = pathlib.Path(__file__).parent; F = D / "data.json"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8"}
def get(url, t=10):
    url = urllib.parse.quote(url, safe=":/?&=%#+,;@!$'()*~")
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=t)
        return r.status, r.read().decode("utf-8", "replace"), r.geturl()
    except urllib.error.HTTPError as e: return e.code, "", url
    except Exception as e: return None, str(e), url
OUT = [r"slut i lager", r"ej i lager", r"tillfälligt slut", r"\bslutsåld", r"sold out", r"out of stock", r"ausverkauft", r"nicht verfügbar", r"currently unavailable", r"esgotado", r"agotado", r"notify me when", r"bevaka produkt", r"meddela mig när"]
INS = [r"i lager", r"in stock", r"auf lager", r"lägg i varukorg", r"add to cart", r"in den warenkorb", r"köp nu", r"sofort lieferbar", r"em stock"]
PRE = [r"förbeställ", r"pre-?order", r"vorbestell"]
def text_of(h):
    h = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", h); return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h))).lower()
def check(url):
    now = dt.datetime.now().astimezone().isoformat(timespec="minutes")
    if "cardmarket.com" in url:
        return dict(stock_status="in_stock", http_status=None, stock_checked_at=now, stock_evidence="Cardmarket-marknadsplats: listade annonser är i lager per definition (sidan blockerar bottar, priset ej live-kontrollerat)")
    if re.search(r"/search|[?&]q=|/set/|/collections/", url):
        st, _, _ = get(url)
        if st in (404, 410): return dict(stock_status="out_of_stock", dead_link=True, http_status=st, stock_checked_at=now, stock_evidence=f"HTTP {st} – död länk")
        return dict(stock_status="unknown", http_status=st, stock_checked_at=now, stock_evidence="Sök-/listsida – inte en specifik produkt, kan inte verifieras")
    m = re.match(r"(https?://[^/]+(?:/[a-z]{2}(?:-[a-z]{2})?)?/products/[^/?#]+)", url)
    if m:  # Shopify
        st, body, _ = get(m.group(1) + ".js")
        if st == 200 and body.lstrip().startswith("{"):
            j = json.loads(body); v = j.get("variants", [])
            av = j.get("available"); price = (v[0]["price"] / 100) if v else None
            return dict(stock_status="in_stock" if av else "out_of_stock", http_status=200, stock_checked_at=now,
                        stock_evidence=f"Shopify .js available={av}" + (f", pris {price:g}" if price else ""), checked_price=price)
    st, body, final = get(url)
    if st in (404, 410): return dict(stock_status="out_of_stock", dead_link=True, http_status=st, stock_checked_at=now, stock_evidence=f"HTTP {st} – död länk")
    if st != 200: return dict(stock_status="unknown", http_status=st, stock_checked_at=now, stock_evidence=f"Kunde inte läsa sidan (HTTP {st or body[:60]})")
    av = re.findall(r'schema\.org/(InStock|OutOfStock|PreOrder|SoldOut|Discontinued|LimitedAvailability|BackOrder)', body)
    if av:
        a = av[0]; s = {"InStock": "in_stock", "LimitedAvailability": "in_stock", "PreOrder": "preorder", "BackOrder": "preorder"}.get(a, "out_of_stock")
        return dict(stock_status=s, http_status=st, stock_checked_at=now, stock_evidence=f"schema.org availability={a}")
    t = text_of(body)
    for k, pats in (("out_of_stock", OUT), ("preorder", PRE), ("in_stock", INS)):
        for p in pats:
            mm = re.search(p, t)
            if mm: return dict(stock_status=k, http_status=st, stock_checked_at=now, stock_evidence=f"text: '…{t[max(0, mm.start() - 40):mm.end() + 40]}…'")
    return dict(stock_status="unknown", http_status=st, stock_checked_at=now, stock_evidence="Ingen lagerinfo hittad på sidan")
def check_auction(a):
    now = dt.datetime.now().astimezone()
    ended = dt.datetime.fromisoformat(a["ends_at"]).replace(tzinfo=now.tzinfo) <= now
    st, body, _ = get(a["url"]); t = text_of(body) if body else ""
    if st in (404, 410): return dict(auction_status="ended", http_status=st, stock_checked_at=now.isoformat(timespec="minutes"), stock_evidence=f"HTTP {st} – borttagen")
    if re.search(r"auktionen (är )?avslutad|avslutad auktion|this auction has ended|har avslutats|objektet är sålt|sold for", t): ended = True
    return dict(auction_status="ended" if ended else "active", http_status=st, stock_checked_at=now.isoformat(timespec="minutes"),
                stock_evidence=("sluttid passerad/sidan säger avslutad" if ended else f"sluttid {a['ends_at']} i framtiden, HTTP {st}"))
if __name__ == "__main__":
    p = json.loads(F.read_text()); dry = "--dry" in sys.argv; cnt = {}
    for i in p["items"]:
        for o in i.get("offers", []):
            r = check(o["url"]); cnt[r["stock_status"]] = cnt.get(r["stock_status"], 0) + 1
            print(f'{r["stock_status"]:13} {i["id"][:12]:12} {o["source"][:22]:22} {o["price"]:>8} {o["currency"]} {r["stock_evidence"][:90]}{" DÖD LÄNK" if r.get("dead_link") else ""}')
            if not dry:
                o.update(r); o["in_stock"] = {"in_stock": True, "out_of_stock": False}.get(r["stock_status"])
    for a in p.get("auctions", []):
        r = check_auction(a); print(f'{r["auction_status"]:13} auktion      {a["platform"][:22]:22} {a["title"][:40]} {r["stock_evidence"][:60]}')
        if not dry: a.update(r)
    print("Erbjudanden:", cnt)
    if not dry: F.write_text(json.dumps(p, ensure_ascii=False, indent=2))
