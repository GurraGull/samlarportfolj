#!/usr/bin/env python3
"""Veckouppdatering. Se README.md.
  python3 update.py list                      -> visar items, källor att kolla och senaste snapshot
  python3 update.py add ID DATE SOURCE PRICE CUR TYPE URL [NOTE]
                                              -> lägger till snapshot (TYPE: trend|listing|sold|bid)
  python3 update.py rate EUR 11.20 URL        -> uppdaterar valutakurs
  python3 update.py offer ID DATE SOURCE SELLER PRICE CUR SHIP|- SE|EU|non-EU yes|no|? URL [RATING|-] [LANG] [NOTES]
  python3 update.py threshold 15
  python3 update.py alert ID below|above SEK [offer|value] ["notering"]  -> lägger till prisbevakning
  python3 update.py alert-rm ID INDEX         -> tar bort bevakning nr INDEX (0-baserat, se 'check')
  python3 update.py check                     -> kontrollerar alla prisbevakningar (körs mån & tors)
  python3 update.py tx buy|sell ID DATE|- PRICE_SEK FEES_SEK PLATFORM [QTY] ["notering"]
  python3 update.py txs                       -> visar transaktionslogg + realiserat/orealiserat
  python3 update.py stock [--dry]            -> lagerkontroll av alla länkar (stockcheck.py), flaggar döda länkar
  python3 update.py publish ["meddelande"]  -> git commit + push (sajten läser data.json)
  python3 update.py build                     -> sätter last_updated=idag och bygger HTML
  python3 update.py cmguide [--dry]           -> hämtar Cardmarkets prisguide och uppdaterar alla items med
                                                 price_source=cardmarket_guide via cardmarket_id (trend / trend-foil),
                                                 bevakade (watchlist) items med cardmarket_id, samt köplistan (buylist)
  python3 update.py buylist                   -> visar köplistan med köpfönster/flaggor (ingen nedladdning)
Inga priser hämtas automatiskt: agenten/användaren söker fram dem och matar in här."""
import json, sys, pathlib, datetime as dt, subprocess
D = pathlib.Path(__file__).parent; F = D/"data.json"
p = json.loads(F.read_text()); a = sys.argv[1:]
def save(): F.write_text(json.dumps(p, ensure_ascii=False, indent=2))
def _win(b):  # köpfönster "ÅÅÅÅ-MM[-DD]..ÅÅÅÅ-MM[-DD]" -> (från, till) som datum
    w = b.get("buy_window")
    if not w or ".." not in w: return None, None
    f_, t_ = w.split("..")
    fr = dt.date.fromisoformat(f_ + "-01" if len(f_) == 7 else f_)
    if len(t_) == 7: y, m = map(int, t_.split("-")); to = dt.date(y + m // 12, m % 12 + 1, 1) - dt.timedelta(days=1)
    else: to = dt.date.fromisoformat(t_)
    return fr, to
def buylist_status(b, today=None):
    """Returnerar (i_fönster, spärrad_av, ändring_% mot tillagt)."""
    today = today or dt.date.today(); fr, to = _win(b)
    block = next((x for x in p.get("buylist_settings", {}).get("blackouts", []) if dt.date.fromisoformat(x["from"]) <= today <= dt.date.fromisoformat(x["to"])), None)
    inw = bool(fr and fr <= today <= to)
    ch = (b["trend_eur"] / b["added_trend_eur"] - 1) * 100 if b.get("trend_eur") and b.get("added_trend_eur") else None
    return inw, block, ch
def buylist_refresh(guides, day):
    """Uppdaterar köplistans trend_eur/sek via idProduct och sätter flaggor (köpfönster öppnat, −10 % sedan tillagd)."""
    rate = p["rates"]["EUR"]; today = dt.date.today()
    for b in p["buylist"]:
        x = guides.get(b.get("game", 1), {}).get(b.get("idProduct")); t = x.get("trend") if x else None
        if not t: print("köplista saknar pris:", b["id"]); continue
        b["trend_eur"] = t; b["sek"] = round(t * rate); b["trend_date"] = day
        h = b.setdefault("history", [])
        if not any(e["date"] == day for e in h): h.append({"date": day, "trend_eur": t})
        inw, block, ch = buylist_status(b, today); fl = b.setdefault("flags", {})
        if inw and not block and not fl.get("window_open_since"):
            fl["window_open_since"] = today.isoformat()
            if b["group"] == "wait": print(f"  KÖPFÖNSTER ÖPPET: {b['name']} ({b['buy_window']}) {t} € – dags att titta på köp")
        if not inw and fl.get("window_open_since") and b["group"] == "wait": fl.pop("window_open_since")
        if ch is not None and ch <= -10:
            if not fl.get("dropped_10_since"): fl["dropped_10_since"] = today.isoformat(); print(f"  −10 %: {b['name']} {b['added_trend_eur']} → {t} € ({ch:.0f} %)")
        else: fl.pop("dropped_10_since", None)
    print(f"köplista: {len(p['buylist'])} uppdaterade")
if not a or a[0] == "list":
    auto = [i for i in p["items"] if i.get("price_source") == "cardmarket_guide"]
    if auto: print(f"{len(auto)} items uppdateras automatiskt via 'update.py cmguide' (Cardmarket-prisguiden, idProduct) och listas inte här.")
    for i in p["items"]:
        if i.get("price_source") == "cardmarket_guide": continue
        urls = sorted({s["url"] for s in i["snapshots"]})
        last = max(i["snapshots"], key=lambda s: s["date"])
        print(f'\n[{i["id"]}] {i["name"]} ({i["status"]})  senaste: {last["date"]}')
        for u in urls: print("   ", u)
elif a[0] == "add":
    iid, date, src, price, cur, typ, url = a[1:8]; note = a[8] if len(a) > 8 else None
    assert typ in ("trend", "listing", "sold", "bid"); dt.date.fromisoformat(date)
    item = next(i for i in p["items"] if i["id"] == iid)
    snap = {"date": date, "source": src, "price": float(price), "currency": cur.upper(), "type": typ, "url": url}
    if note: snap["note"] = note
    if any(all(s.get(k) == snap[k] for k in ("date", "source", "price", "type")) for s in item["snapshots"]): print("dubblett, hoppar över")
    else: item["snapshots"].append(snap); save(); print("tillagd")
elif a[0] == "rate":
    p["rates"][a[1].upper()] = float(a[2]); p.setdefault("rate_sources", {})[a[1].upper()] = a[3]; save()
elif a[0] == "offer":
    # offer ID DATE SOURCE SELLER PRICE CUR SHIPPING|- ORIGIN(SE|EU|non-EU) INSTOCK(yes|no|?) URL [RATING|-] [LANG] [NOTES]
    iid, date, src, seller, price, cur, ship, origin, stock, url = a[1:11]
    rating = a[11] if len(a) > 11 and a[11] != "-" else None
    lang = a[12] if len(a) > 12 else "okänt"; notes = a[13] if len(a) > 13 else ""
    assert origin in ("SE", "EU", "non-EU"); dt.date.fromisoformat(date)
    item = next(i for i in p["items"] if i["id"] == iid)
    o = dict(date=date, source=src, seller=seller, price=float(price), currency=cur.upper(), shipping=None if ship == "-" else float(ship),
             origin=origin, in_stock={"yes": True, "no": False}.get(stock), url=url, seller_rating=rating, language=lang, notes=notes)
    item.setdefault("offers", [])
    if any(x["date"] == date and x["url"] == url and x["price"] == o["price"] for x in item["offers"]): print("dubblett")
    else: item["offers"].append(o); save(); print("erbjudande tillagt")
elif a[0] == "threshold":
    p["deal_settings"]["threshold_pct"] = float(a[1]); save()
elif a[0] == "alert":
    iid, typ, kr = a[1], a[2], float(a[3]); assert typ in ("below", "above")
    basis = a[4] if len(a) > 4 else ("offer" if typ == "below" else "value"); assert basis in ("offer", "value")
    item = next(i for i in p["items"] if i["id"] == iid)
    item.setdefault("alerts", []).append({"type": typ, "sek": kr, "basis": basis, "note": a[5] if len(a) > 5 else ""}); save(); print("bevakning tillagd")
elif a[0] == "alert-rm":
    item = next(i for i in p["items"] if i["id"] == a[1]); print("borttagen:", item["alerts"].pop(int(a[2]))); save()
elif a[0] == "check":
    R = {"SEK": 1, **p["rates"]}; DS = p["deal_settings"]
    def landed(o):
        if o["currency"] not in R: return None
        b = (o["price"] + (o.get("shipping") or 0)) * R[o["currency"]]
        if o["origin"] == "non-EU": b = b * (1 + DS["customs_pct"] / 100) * (1 + DS["import_vat_pct"] / 100) + DS["non_eu_handling_fee_sek"]
        return b
    hits = 0
    for i in p["items"]:
        mv = i["valuation"]["mid"]; mid = mv["price"] * R[mv["currency"]]
        offs = i.get("offers", []); latest = max((o["date"] for o in offs), default=None)
        cur_offers = [landed(o) for o in offs if o["date"] == latest and o.get("in_stock") is not False and landed(o)]
        best = min(cur_offers) if cur_offers else None
        for n, al in enumerate(i.get("alerts", [])):
            cur = best if al["basis"] == "offer" else mid
            hit = cur is not None and (cur <= al["sek"] if al["type"] == "below" else cur >= al["sek"])
            hits += hit
            print(f'{"UTLÖST " if hit else "       "}[{i["id"]} #{n}] {al["type"]} {al["sek"]:.0f} kr ({al["basis"]}) nu: {"–" if cur is None else f"{cur:.0f} kr"}  {al.get("note","")}')
    print(f"\n{hits} utlösta bevakningar")
elif a[0] == "tx":
    typ, iid, date, price, fees, plat = a[1:7]; assert typ in ("buy", "sell"); assert any(i["id"] == iid for i in p["items"])
    if date != "-": dt.date.fromisoformat(date)
    t = {"id": f"t{len(p.setdefault('transactions', [])) + 1}", "item_id": iid, "type": typ, "date": None if date == "-" else date,
         "qty": int(a[7]) if len(a) > 7 else 1, "price_sek": None if price in ("?", "okänt") else float(price), "fees_sek": float(fees), "platform": plat, "note": a[8] if len(a) > 8 else ""}
    p["transactions"].append(t); save(); print("transaktion tillagd", t["id"])
    print("OBS: uppdatera även item.status/quantity om innehavet ändrats (t.ex. status=owned vid köp av bevakat objekt).")
elif a[0] == "txs":
    R = {"SEK": 1, **p["rates"]}; h = {}; real = 0
    for t in sorted(p.get("transactions", []), key=lambda t: t["date"] or ""):
        x = h.setdefault(t["item_id"], [0, 0.0]); print(t["date"] or "okänt", t["type"], t["item_id"], t["qty"], t["price_sek"], "kr, avgift", t["fees_sek"], t["platform"])
        if t["type"] == "buy":
            x[0] += t["qty"]
            if t["price_sek"] is None: x.append("unknown")
            else: x[1] += t["price_sek"] + t["fees_sek"]
        else: avg = x[1] / x[0] if x[0] else 0; real += t["price_sek"] - t["fees_sek"] - avg * t["qty"]; x[1] -= avg * t["qty"]; x[0] -= t["qty"]
    items = {i["id"]: i for i in p["items"]}
    unreal = sum(items[k]["valuation"]["mid"]["price"] * R[items[k]["valuation"]["mid"]["currency"]] * q - c for k, (q, c, *u) in h.items() if q > 0 and not u)
    print(f"Realiserat: {real:.0f} kr  Orealiserat (mittvärde): {unreal:.0f} kr")
elif a[0] == "stock":
    subprocess.run([sys.executable, str(D/"stockcheck.py"), *a[1:]], check=True)
elif a[0] == "publish":
    # Commit + push data.json (och ev. ändrade filer). Kräver remote 'origin' och GITHUB_TOKEN i env.
    msg = a[1] if len(a) > 1 else f"Prisuppdatering {dt.date.today()}"
    g = lambda *c: subprocess.run(["git", "-C", str(D), *c], check=True)
    g("add", "data.json", "index.html", "app.js", "style.css", "README.md", "update.py", "stockcheck.py", "images", ".gitignore")
    if subprocess.run(["git", "-C", str(D), "diff", "--cached", "--quiet"]).returncode: g("commit", "-m", msg)
    g("-c", "credential.helper=!f() { echo username=x-access-token; echo password=$GITHUB_TOKEN; }; f", "push", "origin", "main")
elif a[0] == "cmguide":
    # Cardmarkets officiella prisguide (publik JSON, uppdateras dagligen). Rör bara items med price_source=cardmarket_guide.
    import urllib.request
    URL = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json"
    g = json.loads(urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"}), timeout=120).read())
    day = g["createdAt"][:10]; pg = {x["idProduct"]: x for x in g["priceGuides"]}; n = miss = 0
    for i in p["items"]:
        if i.get("price_source") != "cardmarket_guide": continue
        x = pg.get(i.get("cardmarket_id")); k = "trend-foil" if i.get("foil") else "trend"
        t = x.get(k) if x else None
        if not t: miss += 1; print("saknar pris:", i["id"], i.get("cardmarket_id")); continue
        old = i["valuation"]["mid"]["price"]
        i["valuation"]["mid"] = {"price": t, "currency": "EUR", "basis": f"Cardmarket-{k} (prisguide {day}), per st"}
        if not any(s["date"] == day and s["source"] == "Cardmarket prisguide" for s in i["snapshots"]):
            i["snapshots"].append({"date": day, "source": "Cardmarket prisguide", "price": t, "currency": "EUR", "type": "trend", "url": URL,
                                   "note": f"idProduct {i['cardmarket_id']}, {k} (avg30 {x.get('avg30-foil' if i.get('foil') else 'avg30')})"})
        n += 1
        if abs(t - old) / max(old, 0.01) >= 0.2 and t * p["rates"]["EUR"] * i["quantity"] >= 100: print(f"  {i['name']}: {old} → {t} €")
    # Bevakade objekt (watchlist) med cardmarket_id: håll valuation.mid i takt med prisguiden
    w = 0
    for i in p["items"]:
        if i.get("status") != "watchlist" or not i.get("cardmarket_id") or i.get("price_source") == "cardmarket_guide": continue
        x = pg.get(i["cardmarket_id"]); t = x.get("trend") if x else None
        if not t: print("bevakning saknar pris:", i["id"]); continue
        old = i["valuation"]["mid"]["price"]
        i["valuation"]["mid"] = {"price": t, "currency": "EUR", "basis": f"Cardmarket-trend (prisguide {day})"}
        if not any(s["date"] == day and s["source"] == "Cardmarket prisguide" for s in i["snapshots"]):
            i["snapshots"].append({"date": day, "source": "Cardmarket prisguide", "price": t, "currency": "EUR", "type": "trend", "url": URL,
                                   "note": f"Officiell Cardmarket-prisguide (idProduct {i['cardmarket_id']}), ej språkfiltrerad."})
        if abs(t - old) / max(old, 0.01) >= 0.1: print(f"  bevakning {i['name']}: {old} → {t} €")
        w += 1
    print(f"prisguide {g['createdAt']}: {n} uppdaterade, {miss} utan pris, {w} bevakade")
    if p.get("buylist"):
        guides = {1: pg}
        for gm in sorted({b.get("game", 1) for b in p["buylist"]} - {1}):
            u = URL.replace("price_guide_1", f"price_guide_{gm}")
            gg = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=120).read())
            guides[gm] = {x["idProduct"]: x for x in gg["priceGuides"]}
        buylist_refresh(guides, day)
    if "--dry" not in a: save()
elif a[0] == "buylist":
    for b in sorted(p.get("buylist", []), key=lambda b: (b["group"] != "buy", b["rank"])):
        inw, block, ch = buylist_status(b)
        st = "SPÄRR (" + block["reason"] + ")" if block and b["group"] == "buy" else "I FÖNSTER" if inw else "vänta"
        print(f'{b["group"]:4} #{b["rank"]:<2} {b["name"][:45]:45} {b.get("trend_eur")} € ({b.get("sek")} kr)  {b.get("buy_window")}  {st}'
              + (f"  {ch:+.0f} % sedan {b['added_date']}" if ch is not None else "") + (f"  flaggor: {b['flags']}" if b.get("flags") else ""))
elif a[0] == "build":
    p["last_updated"] = dt.date.today().isoformat(); save()
    subprocess.run([sys.executable, str(D/"build.py")], check=True)
