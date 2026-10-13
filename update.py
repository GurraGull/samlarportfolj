#!/usr/bin/env python3
"""Veckouppdatering. Se README.md.
  python3 update.py list                      -> visar items, källor att kolla och senaste snapshot
  python3 update.py add ID DATE SOURCE PRICE CUR TYPE URL [NOTE]
                                              -> lägger till snapshot (TYPE: trend|listing|sold|bid)
  python3 update.py rate EUR 11.20 URL        -> uppdaterar valutakurs
  python3 update.py offer ID DATE SOURCE SELLER PRICE CUR SHIP|- SE|EU|non-EU yes|no|? URL [RATING|-] [LANG] [NOTES]
  python3 update.py threshold 15
  python3 update.py publish ["meddelande"]  -> git commit + push (sajten läser data.json)
  python3 update.py build                     -> sätter last_updated=idag och bygger HTML
Inga priser hämtas automatiskt: agenten/användaren söker fram dem och matar in här."""
import json, sys, pathlib, datetime as dt, subprocess
D = pathlib.Path(__file__).parent; F = D/"data.json"
p = json.loads(F.read_text()); a = sys.argv[1:]
def save(): F.write_text(json.dumps(p, ensure_ascii=False, indent=2))
if not a or a[0] == "list":
    for i in p["items"]:
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
elif a[0] == "publish":
    # Commit + push data.json (och ev. ändrade filer). Kräver remote 'origin' och GITHUB_TOKEN i env.
    msg = a[1] if len(a) > 1 else f"Prisuppdatering {dt.date.today()}"
    g = lambda *c: subprocess.run(["git", "-C", str(D), *c], check=True)
    g("add", "data.json", "index.html", "app.js", "style.css", "README.md", "update.py", "images")
    if subprocess.run(["git", "-C", str(D), "diff", "--cached", "--quiet"]).returncode: g("commit", "-m", msg)
    g("-c", "credential.helper=!f() { echo username=x-access-token; echo password=$GITHUB_TOKEN; }; f", "push", "origin", "main")
elif a[0] == "build":
    p["last_updated"] = dt.date.today().isoformat(); save()
    subprocess.run([sys.executable, str(D/"build.py")], check=True)
