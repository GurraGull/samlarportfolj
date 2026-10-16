#!/usr/bin/env python3
"""Bygger dashboard.html från portfolio.json. Kör: python3 build.py
SEK räknas ut från EUR via 'rates'. USD visas i originalvaluta tills en USD-kurs läggs i 'rates'."""
import json, html, pathlib, datetime as dt
D = pathlib.Path(__file__).parent
p = json.loads((D/"portfolio.json").read_text())
RATES = {"SEK": 1.0, **p["rates"]}
e = html.escape
def sek(price, cur): return price*RATES[cur] if (cur in RATES and price is not None) else None
def kr(v): return "–" if v is None else f"{v:,.0f}".replace(",", " ") + " kr"
def money(price, cur):
    s = f"{price:,.2f}".replace(",", " ") + " " + cur if cur != "SEK" else kr(price)
    v = sek(price, cur)
    return s + (f' <span class=m>({kr(v)})</span>' if cur != "SEK" and v else "")
def pct(a, b): return f"{(a-b)/b*100:+.0f} %"
TYPES = {"trend": "trend", "listing": "annons", "sold": "såld", "bid": "bud"}
COLORS = {"trend": "#38bdf8", "listing": "#a78bfa", "sold": "#4ade80", "bid": "#fbbf24"}

def chart(item, w=520, h=170, pad=38):
    pts = [(dt.date.fromisoformat(s["date"]), sek(s["price"], s["currency"]), s) for s in item["snapshots"]
           if not s.get("approx") and sek(s["price"], s["currency"])]
    if len(pts) < 2: return '<div class=m>För få daterade SEK/EUR-punkter för graf ännu.</div>'
    d0 = min(x[0] for x in pts); d1 = max(x[0] for x in pts); span = max((d1-d0).days, 1)
    vals = [x[1] for x in pts]
    if item.get("purchase_price_sek"): vals.append(item["purchase_price_sek"])
    lo, hi = min(vals)*0.9, max(vals)*1.05
    X = lambda d: pad + (d-d0).days/span*(w-pad-10); Y = lambda v: h-22 - (v-lo)/(hi-lo)*(h-34)
    g = [f'<svg viewBox="0 0 {w} {h}" width="{w}" height="{h}" role=img>']
    for v in (lo, (lo+hi)/2, hi):
        g.append(f'<line x1={pad} x2={w-10} y1={Y(v):.1f} y2={Y(v):.1f} stroke="#334155"/><text x=2 y={Y(v)+4:.1f} class=ax>{v/1000:.1f}k</text>')
    if item.get("purchase_price_sek"):
        y = Y(item["purchase_price_sek"]); g.append(f'<line x1={pad} x2={w-10} y1={y:.1f} y2={y:.1f} stroke="#f87171" stroke-dasharray="4 4"/><text x={w-90} y={y-4:.1f} class=ax fill="#f87171">köpt {item["purchase_price_sek"]} kr</text>')
    for t in TYPES:
        ser = sorted([x for x in pts if x[2]["type"] == t], key=lambda x: x[0])
        if len(ser) > 1 and t == "trend":
            g.append('<polyline fill=none stroke-width=2 stroke="%s" points="%s"/>' % (COLORS[t], " ".join(f"{X(a):.1f},{Y(b):.1f}" for a, b, _ in ser)))
        for a, b, s in ser:
            g.append(f'<circle cx={X(a):.1f} cy={Y(b):.1f} r=4 fill="{COLORS[t]}"><title>{s["date"]} {e(s["source"])} {TYPES[t]}: {kr(b)}</title></circle>')
    g.append(f'<text x={pad} y={h-4} class=ax>{d0}</text><text x={w-80} y={h-4} class=ax>{d1}</text></svg>')
    return "".join(g)

GROUPS = [("Cardmarket", ["cardmarket", "packquant"]), ("TCGplayer", ["tcgplayer"]), ("Tradera", ["tradera"]),
          ("Svenska butiker", ["pokejakt", "dragon", "hobbykort", "kortarkivet", "manatorsk"]), ("eBay", ["ebay"]),
          ("Aukro", ["aukro"]), ("Övriga EU-butiker", ["butiker eu", "pokeschnapp"])]
def compare(item):
    head = "".join(f"<th>{g}</th>" for g, _ in GROUPS) + "<th>Forum &amp; community</th>"
    cells = []
    for g, keys in GROUPS:
        ss = [s for s in item["snapshots"] if any(k in s["source"].lower() for k in keys)]
        ss = sorted(ss, key=lambda s: s["date"], reverse=True)[:4]
        cells.append("<td>" + ("".join(f'<div><a href="{e(s["url"])}">{money(s["price"], s["currency"])}</a> <span class=m>{TYPES[s["type"]]} · {s["date"]}{"~" if s.get("approx") else ""}{" · "+e(s["note"]) if s.get("note") else ""}</span></div>' for s in ss) or '<span class=m>ingen data</span>') + "</td>")
    com = "".join(f'<div><a href="{e(c["url"])}">{e(c["label"])}</a><br><span class=m>{e(c["takeaway"])}</span></div>' for c in item["community"]) or '<span class=m>inga relevanta trådar hittade</span>'
    return f'<div class=scroll><table class=cmp><tr>{head}</tr><tr>{"".join(cells)}<td>{com}</td></tr></table></div>'

def val(i, k): v = i["valuation"].get(k, i["valuation"]["mid"]); return sek(v["price"], v["currency"])
owned = [i for i in p["items"] if i["status"] == "owned"]; watch = [i for i in p["items"] if i["status"] == "watchlist"]
cost = sum((i.get("purchase_price_sek") or 0)*i["quantity"] for i in owned)
tot = {k: sum(val(i, k)*i["quantity"] for i in owned) for k in ("conservative", "mid", "high")}
eur = lambda v: f"€{v/RATES['EUR']:,.0f}".replace(",", " ")
card = lambda t, v, s="": f'<div class=card><div class=m>{t}</div><div class=big>{v}</div><div class=m>{s}</div></div>'

def section(i):
    own = i["status"] == "owned"; c = i.get("purchase_price_sek")
    vs = "".join(f'<div class=card><div class=m>{lbl} · {e(i["valuation"].get(k, i["valuation"]["mid"])["basis"])}</div><div class=big>{kr(val(i,k))}</div><div class=m>{eur(val(i,k))}{" · <b class=%s>%s</b>" % ("g" if val(i,k) >= c else "r", pct(val(i,k), c)) if c else ""}</div></div>'
                 for k, lbl in (("conservative", "Försiktig"), ("mid", "Mitten"), ("high", "Hög")) if own or k == "mid")
    msrp = f' · MSRP <a href="{e(i["msrp"]["url"])}">{money(i["msrp"]["price"], i["msrp"]["currency"])}</a>' if i.get("msrp") else ""
    legend = " ".join(f'<span style="color:{COLORS[t]}">● {TYPES[t]}</span>' for t in TYPES)
    return f'''<section class=item><h3>{e(i["name"])}</h3><div class=m>{e(i["category"])} · språk: {e(i["language"])} · antal {i["quantity"]}{" · köpt för "+kr(c) if c else ""}{msrp}</div>
<p>{e(i["notes"])}</p><div class=row><div class=vals>{vs}</div><div><div class=m>Prishistorik i SEK (EUR omräknat; USD och ungefärliga datum visas bara i tabellen) {legend}</div>{chart(i)}</div></div>{compare(i)}{offers_html(i)}</section>'''

DS = p["deal_settings"]
def landed(o):
    r = RATES.get(o["currency"])
    if r is None or o.get("price") is None: return None
    base = (o["price"] + (o["shipping"] or 0)) * r
    if o["origin"] == "non-EU":
        base = base*(1+DS["customs_pct"]/100)*(1+DS["import_vat_pct"]/100) + DS["non_eu_handling_fee_sek"]
    return base
def bench(i):
    t = [s for s in i["snapshots"] if s["type"] == "trend" and "cardmarket" in s["source"].lower() and not s.get("approx")]
    if not t: return None, None
    s = max(t, key=lambda s: s["date"]); return sek(s["price"], s["currency"]), s
def offer_rows(i, only_deals):
    b, bs = bench(i); rows = []
    if not i.get("offers") or b is None: return rows
    latest = max(o["date"] for o in i["offers"])
    for o in sorted(i["offers"], key=lambda o: o["date"], reverse=True):
        L = landed(o); d = (b-L)/b*100 if L else None
        is_deal = d is not None and d >= DS["threshold_pct"] and o["date"] == latest and o["in_stock"] is not False
        if only_deals and not is_deal: continue
        risk = []
        if o["shipping"] is None: risk.append("frakt okänd (räknad som 0)")
        if o["in_stock"] is None: risk.append("lagerstatus okänd")
        if o["in_stock"] is False: risk.append("ej i lager")
        if o["origin"] == "non-EU": risk.append("icke-EU: moms/tull/avgift")
        if o["language"] in ("okänt", "alla språk"): risk.append("språk okänt")
        if not o["seller_rating"]: risk.append("säljbetyg ej synligt")
        if any(k in o["source"].lower() for k in ("tradera", "ebay", "cardmarket", "aukro")): risk.append("privatsäljare möjlig: kontrollera försegling (reseal/fake)")
        flag = "<b class=g>DEAL</b> " if is_deal else ""
        dtxt = "–" if d is None else (f"{d:.0f} % under" if d >= 0 else f"{-d:.0f} % över")
        ship = f"<br><span class=m>+frakt {money(o['shipping'], o['currency'])}</span>" if o["shipping"] else ""
        note = "<br>" + e(o["notes"]) if o["notes"] else ""
        rows.append(f'<tr><td>{flag}<a href="{e(o["url"])}">{e(o["source"])}</a><br><span class=m>{e(o["seller"])} · {o["origin"]} · {o["date"]}</span></td>'
                    f'<td>{e(i["name"]) if only_deals else ""}</td><td>{money(o["price"], o["currency"])}{ship}</td><td>{kr(L)}</td>'
                    f'<td class="{"g" if d and d > 0 else "r"}">{dtxt}</td><td>{e(o["seller_rating"] or "–")}</td><td class=m>{e(o["language"])}</td>'
                    f'<td class=m>{e(", ".join(risk))}{note}</td></tr>')
    return rows
OH = "<tr><th>Erbjudande</th><th>Objekt</th><th>Pris</th><th>Landat (SEK)</th><th>Mot CM-trend</th><th>Säljbetyg</th><th>Språk</th><th>Risk &amp; noter</th></tr>"
def deals_html():
    rows = [r for i in p["items"] for r in offer_rows(i, True)]
    body = f"<table class=cmp>{OH}{''.join(rows)}</table>" if rows else "<p>Inga erbjudanden under tröskeln just nu.</p>"
    return f'<section class="item deals"><h2 style="margin-top:0">Deals (≥ {DS["threshold_pct"]} % under Cardmarket-trend)</h2>{body}<p class=m>{e(DS["notes"])}</p></section>'
def offers_html(i):
    rows = offer_rows(i, False)
    if not rows: return '<div class=m style="margin-top:10px">Inga sparade erbjudanden.</div>'
    b, bs = bench(i)
    return f'<details open style="margin-top:12px"><summary>Erbjudanden ({len(rows)}) · riktmärke {kr(b)} (CM-trend {bs["date"]})</summary><div class=scroll><table class=cmp>{OH}{"".join(rows)}</table></div></details>'

AF = p.get("auction_fees", {})
def auc_landed(a):
    f = AF.get(a["platform"], {"premium_pct": 0, "fixed": 0, "currency": "SEK"})
    v = sek(a["price"], a["currency"])
    if v is None: return None
    v = v*(1+f["premium_pct"]/100) + sek(f["fixed"], f["currency"]) + (sek(a["shipping"], a["currency"]) if a.get("shipping") else 0)
    if a["platform"].endswith("UK"): v *= 1 + DS["import_vat_pct"]/100
    return v
def auctions_html():
    now = p["last_updated"]
    items = {i["id"]: i for i in p["items"]}
    live = sorted([a for a in p.get("auctions", []) if a["ends_at"][:10] >= now], key=lambda a: a["ends_at"])
    rows = []
    for a in live:
        L = auc_landed(a); per = L/a.get("qty", 1) if L else None
        b = bench(items[a["item_id"]])[0] if a.get("item_id") else None
        cmp_ = "–" if not (b and per) else (f'<span class=g>{(b-per)/b*100:.0f} % under</span>' if per < b else f'<span class=r>{(per-b)/b*100:.0f} % över</span>')
        est = money(a["estimate"], a["currency"]) if a.get("estimate") else "–"
        soon = " <b class=r>snart</b>" if a["ends_at"][:10] <= (dt.date.fromisoformat(now)+dt.timedelta(days=2)).isoformat() else ""
        rows.append(f'<tr><td>{a["ends_at"].replace("T"," ")}{soon}</td><td><b>{e(a["platform"])}</b></td><td><a href="{e(a["url"])}">{e(a["title"])}</a>{" ×"+str(a["qty"]) if a.get("qty",1)>1 else ""}</td>'
                    f'<td>{money(a["price"], a["currency"])}<br><span class=m>{e(a["price_kind"])}</span></td><td>{est}</td><td>{kr(L)}{"<br><span class=m>"+kr(per)+"/st</span>" if a.get("qty",1)>1 else ""}</td><td>{cmp_}</td><td class=m>{e(a["notes"])}</td></tr>')
    fees = " · ".join(f'<a href="{e(v["source"])}">{e(k)}</a>: {v["premium_pct"]:g} % + {v["fixed"]:g} {v["currency"]}' for k, v in AF.items())
    mw = "".join(f'<li><b>{e(m["platform"])}</b>: <a href="{e(m["url"])}">{e(m["title"])}</a>{" – "+kr(sek(m["price"],m["currency"])) if m.get("price") else ""} <span class=m>· {m["date_seen"]} · {e(m["notes"])}</span></li>' for m in p.get("market_watch", []))
    tbl = (f'<table class=cmp><tr><th>Slutar</th><th>Plattform</th><th>Objekt</th><th>Aktuellt</th><th>Värdering</th><th>Landat inkl. avgifter</th><th>Mot CM-trend</th><th>Noter</th></tr>{"".join(rows)}</table>' if rows else '<p>Inga pågående auktioner hittade.</p>')
    return f'<section class=item><h2 style="margin-top:0">På auktion nu</h2><div class=m>Sett {now}. Bud ändras – kontrollera innan budgivning. Landat = bud × (1+provision) + fast avgift + ev. frakt (+25 % importmoms för UK-hus). Frakt ej inräknad om okänd.</div>{tbl}<p class=m>Avgifter: {fees}. Tradera-procenten är observerad, ej officiell.</p><h3>Övrigt att bevaka</h3><ul>{mw}</ul></section>'

out = f"""<!doctype html><html lang=sv><meta charset=utf-8><title>Samlarportfölj</title><style>
body{{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:32px;max-width:1500px}}
h1{{margin:0 0 4px}}h2{{margin-top:36px}}h3{{margin:0}}.m{{color:#94a3b8;font-size:12.5px}}.g{{color:#4ade80}}.r{{color:#f87171}}a{{color:#7dd3fc}}
.cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:20px}}.card{{background:#1e293b;border-radius:12px;padding:14px 16px}}
.big{{font-size:24px;font-weight:700;margin:4px 0}}.item{{background:#162033;border:1px solid #273449;border-radius:14px;padding:20px;margin:18px 0}}
.row{{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}}.vals{{display:grid;gap:10px;min-width:260px}}.ax{{fill:#94a3b8;font-size:10px}}
.scroll{{overflow-x:auto;margin-top:14px}}table.cmp{{border-collapse:collapse;width:100%;font-size:12.5px}}.cmp th,.cmp td{{border:1px solid #334155;padding:8px;vertical-align:top;text-align:left}}
.cmp th{{background:#273449;color:#94a3b8;text-transform:uppercase;font-size:11px}}.deals{{border-color:#4ade80}}summary{{cursor:pointer;color:#7dd3fc}}.cmp td div{{margin-bottom:6px}}</style>
<h1>Samlarportfölj</h1><div class=m>Senast uppdaterad {e(p["last_updated"])} · 1 EUR = {RATES["EUR"]} SEK · 1 USD = {RATES["USD"]} SEK · 1 GBP = {RATES["GBP"]} SEK (ECB-referens 12 okt) · endast källbelagda priser · ~ = ungefärligt datum</div>
<div class=cards>{card("Anskaffningsvärde", kr(cost), eur(cost))}{card("Värde (mitten)", kr(tot["mid"]), eur(tot["mid"]))}
{card("Vinst (mitten)", f'<span class=g>{kr(tot["mid"]-cost)}</span>', pct(tot["mid"], cost))}{card("Värdespann", f'{kr(tot["conservative"])} – {kr(tot["high"])}', "försiktig – hög")}</div>
{deals_html()}{auctions_html()}<h2>Innehav</h2>{"".join(section(i) for i in owned)}<h2>Bevakningslista</h2>{"".join(section(i) for i in watch)}
<p class=m>Värden är uppskattningar från annonser/trender, inte bekräftade försäljningar. Avgifter och frakt ej avdragna. Sweclockers/Flashback ej genomsökta ännu.</p></html>"""
(D/"dashboard.html").write_text(out); print("wrote", D/"dashboard.html")
