#!/usr/bin/env python3
"""Games Island (games-island.eu, Tyskland) – lagerbevakning via butikens officiella, publika MCP-katalog (read-only).
  python3 gamesisland.py          -> söker, jämför mot games_island_state.json, skriver data.json['shop_stock']['games_island']
  python3 gamesisland.py --dry    -> skriver bara ut
Regler från butiken (robots.txt / llms.txt / mcp.games-island.eu/mcp-info), som vi följer:
  * Crawla INTE games-island.eu för tillgänglighet – använd MCP-servern (https://mcp.games-island.eu/mcp) eller SSE-API:t.
  * Bottar identifierar sig i User-Agent (ingen webbläsar-UA). Inga massfrågor: 3 sökningar per körning, 2 ggr/vecka.
  * KI-system ska INTE hämta/visa priser – länka till produktsidan. Därför: inga Games Island-priser och inga
    automatiska "deals" härifrån; sajten visar status + länk och Gustaf ser priset på games-island.eu.
  * Länkar pekar alltid på games-island.eu. Köper/lägger aldrig i varukorg (MCP-servern kan inte heller köpa).
Händelser som skrivs ut: RESTOCK (slut/annons -> i lager/förköp), NY (ny engelsk Collector-display/ny bevakad produkt),
SLUT (i lager -> slut). The Hobbit (engelska) märks PRIO."""
import json, re, sys, pathlib, datetime as dt, urllib.request, time
D = pathlib.Path(__file__).parent; F = D / "data.json"; S = D / "games_island_state.json"
MCP = "https://mcp.games-island.eu/mcp"; PV = "2025-06-18"
UA = "GrokBot-samlarportfolj/1.0 (AI assistant for a private collector; read-only, 2x/week; contact gurragull@mail.grokbot.com)"
QUERIES = ["Collector Booster Display", "30th Celebration", "Evolving Skies"]
LANG = {"englisch": "engelska", "deutsch": "tyska", "französisch": "franska", "franzoesisch": "franska", "japanisch": "japanska",
        "italienisch": "italienska", "spanisch": "spanska", "chinesisch": "kinesiska", "koreanisch": "koreanska", "portugiesisch": "portugisiska"}
def rpc(tool, args):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                       "params": {"name": tool, "arguments": args, "_meta": {"protocolVersion": PV, "clientCapabilities": {}}}}).encode()
    h = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "User-Agent": UA,
         "Mcp-Method": "tools/call", "Mcp-Name": tool, "MCP-Protocol-Version": PV}
    r = urllib.request.urlopen(urllib.request.Request(MCP, body, h), timeout=40)
    if "banned.games-island" in r.geturl(): raise SystemExit("Games Island har spärrat åtkomsten (banned.games-island.eu) – meddela Gustaf, mejla inte själv.")
    t = r.read().decode("utf-8", "replace"); j = None
    if t.lstrip().startswith("{"): j = json.loads(t)
    else:
        for line in t.splitlines():
            if line.startswith("data:"): j = json.loads(line[5:])
    if not j or "error" in j: raise RuntimeError(f"MCP-fel: {j and j.get('error')}")
    res = j["result"]; return res.get("structuredContent") or json.loads(res["content"][0]["text"])
def status_of(s):
    s = (s or "").strip(); low = s.lower(); d = re.search(r"\d{4}-\d{2}-\d{2}", s); d = d.group(0) if d else None
    if low.startswith("auf lager"): return "in_stock", d
    if low.startswith("vorverkauf"): return "preorder", d
    if low.startswith("ankuendigung") or low.startswith("ankündigung"): return "announced", d
    if low.startswith("ausverkauft"): return "out_of_stock", d
    return "unknown", d
def lang_of(n):
    for k, v in LANG.items():
        if re.search(r"\b" + k + r"\b", n.lower()): return v
    if re.search(r"\bEN\b", n): return "engelska"
    return "okänt"
def norm(n):
    n = n.lower().replace("’", "'").replace("'", "")
    n = re.sub(r"\(.*?\)", " ", n); n = re.sub(r"\s[-–]\s*(englisch|deutsch|französisch|franzoesisch|japanisch|italienisch|spanisch|chinesisch).*$", " ", n)
    n = re.sub(r"\b(mtg|magic|the gathering|universes beyond|collector booster|collector|display|box|booster)\b", " ", n)
    return re.sub(r"[^a-z0-9]+", " ", n).strip()
def kind_of(n):
    if re.search(r"collector booster display", n, re.I) and not re.search(r"acryl|sample|pack\b", n, re.I): return "mtg_collector_display"
    if re.search(r"pok[eé]mon", n, re.I) and not re.search(r"gem mint|psa|bgs|cgc|aog|\d+/\d+", n, re.I): return "pokemon_sealed"
    return None
def main():
    dry = "--dry" in sys.argv; p = json.loads(F.read_text())
    st = json.loads(S.read_text()) if S.exists() else {"products": {}}; prev = st.get("products", {})
    now = dt.datetime.now().astimezone().isoformat(timespec="minutes"); seen = {}
    for q in QUERIES:
        res = rpc("search_products", {"query": q, "limit": 50})["items"]
        if len(res) >= 50: print(f"  OBS: sökningen '{q}' gav 50 träffar (tak) – vissa produkter kan saknas")
        for x in res:
            k = kind_of(x.get("cName", ""))
            if k: seen[str(x["kArtikel"])] = (x, k)
        time.sleep(2)
    # matcha mot data.json (bevakade items + köplistan) via normaliserat setnamn
    targets = [(norm(i["name"]), "item", i["id"]) for i in p["items"] if i.get("status") == "watchlist"] + \
              [(norm(b["name"]), "buylist", b["id"]) for b in p.get("buylist", [])]
    out, events = {}, []
    for kid, (x, k) in seen.items():
        s, d = status_of(x.get("status")); name = x["cName"]; lang = lang_of(name); nn = norm(name)
        m_item = next((t[2] for t in targets if t[1] == "item" and t[0] == nn and lang == "engelska" and len(nn) > 3), None)
        m_bl = next((t[2] for t in targets if t[1] == "buylist" and t[0] == nn and lang == "engelska" and len(nn) > 3), None)
        o = prev.get(kid, {}); rec = {"kArtikel": int(kid), "name": name, "kind": k, "language": lang, "status": s, "status_raw": x.get("status"),
                                      "date": d, "url": x.get("url"), "item_id": m_item, "buylist_id": m_bl,
                                      "first_seen": o.get("first_seen", now), "changed_at": o.get("changed_at", now) if o.get("status") == s else now}
        out[kid] = rec; eng = lang == "engelska"; prio = "PRIO " if eng and "hobbit" in name.lower() else ""
        orderable = s in ("in_stock", "preorder")
        if o and orderable and o.get("status") not in ("in_stock", "preorder") and (eng or m_item):
            events.append(f"{prio}GAMES ISLAND RESTOCK: {name} – {x.get('status')} ({o.get('status')} → {s}) {x.get('url')}")
        elif o and o.get("status") == "in_stock" and s != "in_stock" and eng:
            events.append(f"GAMES ISLAND SLUT: {name} – {x.get('status')}")
        elif not o and prev and eng:
            events.append(f"{prio}GAMES ISLAND NY: {name} – {x.get('status')} {x.get('url')}")
    for kid in set(prev) - set(out):
        if prev[kid].get("language") == "engelska": events.append(f"GAMES ISLAND BORTA ur sökningen: {prev[kid]['name']}")
    blk = next((b for b in p.get("buylist_settings", {}).get("blackouts", []) if b["from"] <= dt.date.today().isoformat() <= b["to"]), None)
    for e in events: print(" ", e + (f"  [köpspärr: {blk.get('reason')}]" if blk and "RESTOCK" in e else ""))
    if not prev: print(f"  första körningen: {len(out)} produkter registrerade (inga händelser)")
    order = {"in_stock": 0, "preorder": 1, "announced": 2, "unknown": 3, "out_of_stock": 4}
    prods = sorted(out.values(), key=lambda r: (r["language"] != "engelska", order[r["status"]], r["kind"], r["name"]))
    eng = [r for r in prods if r["language"] == "engelska"]
    print(f"Games Island {now}: {len(out)} produkter, engelska: " + ", ".join(f"{sum(r['status'] == s for r in eng)} {s}" for s in order if any(r['status'] == s for r in eng)))
    if dry: return
    S.write_text(json.dumps({"checked_at": now, "source": f"Games Island MCP {MCP} search_products: " + ", ".join(QUERIES),
                             "rules": "Ingen prisinhämtning (butikens regel för KI). Ingen crawling av games-island.eu. Read-only.",
                             "products": out, "last_events": events or st.get("last_events", []),
                             "last_events_at": now if events else st.get("last_events_at")}, ensure_ascii=False, indent=2))
    p.setdefault("shop_stock", {})["games_island"] = {
        "name": "Games Island", "country": "DE", "checked_at": now,
        "shipping_note": "EU-frakt ca 9,90 € (DPD) / från 14,90 € (DHL) enligt tredjepartskälla – kontrollera i kassan.",
        "note": "Lagerstatus via butikens officiella katalog-API. Butiken vill inte att bottar visar priser – se priset på games-island.eu.",
        "products": [{k: r[k] for k in ("name", "kind", "language", "status", "date", "url", "item_id", "buylist_id", "changed_at")} for r in prods]}
    F.write_text(json.dumps(p, ensure_ascii=False, indent=2))
if __name__ == "__main__": main()
