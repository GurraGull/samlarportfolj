// Samlarportfölj – renderar allt klientsidigt från data.json.
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = (v, d = 0) => Number(v).toLocaleString("sv-SE", {minimumFractionDigits: d, maximumFractionDigits: d});
let P, R, DS, AF, ITEMS;
const sek = (p, c) => R[c] != null && p != null ? p * R[c] : null;
const kr = v => v == null ? "–" : fmt(v) + " kr";
const eur = v => v == null ? "" : "€" + fmt(v / R.EUR);
const money = (p, c) => c === "SEK" ? kr(p) : `${fmt(p, 2)} ${c}` + (sek(p, c) ? ` <span class=muted>(${kr(sek(p, c))})</span>` : "");
const signPct = (a, b) => (a >= b ? "+" : "−") + fmt(Math.abs((a - b) / b * 100)) + " %";
const TYPES = {trend: "trend", listing: "annons", sold: "såld", bid: "bud"};
const COL = {trend: "#38bdf8", listing: "#a78bfa", sold: "#34d399", bid: "#fbbf24"};
const dnum = s => new Date(s.slice(0, 10) + "T00:00:00").getTime() / 864e5;
const PH = "images/placeholder.svg";
const img = (it, alt) => `<img src="${esc(it?.image?.src || PH)}" alt="${esc(alt || it?.name || "")}" loading="lazy" onerror="this.onerror=null;this.src='${PH}'">`;

function countdown(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "avslutad";
  const h = Math.floor(ms / 36e5), d = Math.floor(h / 24);
  return d >= 1 ? `${d} d ${h % 24} h kvar` : h >= 1 ? `${h} h ${Math.floor(ms / 6e4) % 60} min kvar` : `${Math.floor(ms / 6e4)} min kvar`;
}
const val = (i, k) => { const v = i.valuation[k] || i.valuation.mid; return sek(v.price, v.currency); };
const bench = it => { const t = it.snapshots.filter(s => s.type === "trend" && s.source.toLowerCase().includes("cardmarket") && !s.approx);
  if (!t.length) return [null, null]; const s = t.reduce((a, b) => b.date > a.date ? b : a); return [sek(s.price, s.currency), s]; };

// --- grafer ---
function points(it) { return it.snapshots.filter(s => !s.approx && sek(s.price, s.currency)).map(s => [dnum(s.date), sek(s.price, s.currency), s]); }
function spark(it) {
  const pts = points(it).filter(p => p[2].type === "trend").sort((a, b) => a[0] - b[0]);
  if (new Set(pts.map(p => p[0])).size < 2) return "";
  const w = 220, h = 36, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = x => 2 + (x - x0) / Math.max(x1 - x0, 1) * (w - 4), Y = y => h - 3 - (y - y0) / Math.max(y1 - y0, 1) * (h - 6);
  const up = ys[ys.length - 1] >= ys[0], c = up ? "#34d399" : "#f87171";
  return `<svg class=spark viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline fill=none stroke="${c}" stroke-width=2 points="${pts.map(p => X(p[0]) + "," + Y(p[1])).join(" ")}"/></svg>`;
}
function chart(it, w = 560, h = 190, pad = 40) {
  const pts = points(it);
  if (pts.length < 2) return '<p class="muted small">För få daterade punkter för graf ännu.</p>';
  const d0 = Math.min(...pts.map(p => p[0])), d1 = Math.max(...pts.map(p => p[0])), span = Math.max(d1 - d0, 1);
  const vals = pts.map(p => p[1]); if (it.purchase_price_sek) vals.push(it.purchase_price_sek);
  const lo = Math.min(...vals) * .9, hi = Math.max(...vals) * 1.05;
  const X = d => pad + (d - d0) / span * (w - pad - 10), Y = v => h - 22 - (v - lo) / (hi - lo) * (h - 34);
  let g = `<svg viewBox="0 0 ${w} ${h}">`;
  for (const v of [lo, (lo + hi) / 2, hi]) g += `<line x1=${pad} x2=${w - 10} y1=${Y(v)} y2=${Y(v)} stroke="#26324a"/><text x=2 y=${Y(v) + 4} class=ax>${(v / 1000).toFixed(1)}k</text>`;
  if (it.purchase_price_sek) { const y = Y(it.purchase_price_sek); g += `<line x1=${pad} x2=${w - 10} y1=${y} y2=${y} stroke="#f87171" stroke-dasharray="4 4"/><text x=${w - 100} y=${y - 4} class=ax fill="#f87171">köpt ${fmt(it.purchase_price_sek)} kr</text>`; }
  for (const t in TYPES) {
    const ser = pts.filter(p => p[2].type === t).sort((a, b) => a[0] - b[0]);
    if (t === "trend" && ser.length > 1) g += `<polyline fill=none stroke-width=2.5 stroke="${COL[t]}" points="${ser.map(p => X(p[0]) + "," + Y(p[1])).join(" ")}"/>`;
    for (const [a, b, s] of ser) g += `<circle cx=${X(a)} cy=${Y(b)} r=4 fill="${COL[t]}"><title>${s.date} ${esc(s.source)} ${TYPES[t]}: ${kr(b)}</title></circle>`;
  }
  const iso = d => new Date(d * 864e5).toISOString().slice(0, 10);
  return `<div class=legend>${Object.keys(TYPES).map(t => `<span style="color:${COL[t]}">● ${TYPES[t]}</span>`).join("")}</div>` + g + `<text x=${pad} y=${h - 4} class=ax>${iso(d0)}</text><text x=${w - 80} y=${h - 4} class=ax>${iso(d1)}</text></svg>`;
}

// --- erbjudanden & auktioner ---
const landed = o => { const r = R[o.currency]; if (r == null) return null; let b = (o.price + (o.shipping || 0)) * r;
  if (o.origin === "non-EU") b = b * (1 + DS.customs_pct / 100) * (1 + DS.import_vat_pct / 100) + DS.non_eu_handling_fee_sek; return b; };
function offersOf(it) {
  const [b] = bench(it), offers = it.offers || []; if (!offers.length) return [];
  const latest = offers.map(o => o.date).sort().pop();
  return offers.map(o => {
    const L = landed(o), d = b && L ? (b - L) / b * 100 : null;
    const risk = [];
    if (o.shipping == null) risk.push("frakt okänd"); if (o.in_stock == null) risk.push("lager okänt"); if (o.in_stock === false) risk.push("ej i lager");
    if (o.origin === "non-EU") risk.push("icke-EU: moms/tull"); if (["okänt", "alla språk"].includes(o.language)) risk.push("språk okänt");
    if (!o.seller_rating) risk.push("säljbetyg saknas");
    if (["tradera", "ebay", "cardmarket", "aukro"].some(k => o.source.toLowerCase().includes(k))) risk.push("kolla försegling");
    return {...o, item: it, L, d, risk, deal: d != null && d >= DS.threshold_pct && o.date === latest && o.in_stock !== false};
  }).sort((a, c) => c.date.localeCompare(a.date) || (c.d ?? -999) - (a.d ?? -999));
}
function aucLanded(a) {
  const f = AF[a.platform] || {premium_pct: 0, fixed: 0, currency: "SEK"}; let v = sek(a.price, a.currency); if (v == null) return null;
  v = v * (1 + f.premium_pct / 100) + sek(f.fixed, f.currency) + (a.shipping ? sek(a.shipping, a.currency) : 0);
  if (a.platform.endsWith("UK")) v *= 1 + DS.import_vat_pct / 100; return v;
}
function auctions() {
  return (P.auctions || []).map(a => {
    const it = a.item_id ? ITEMS[a.item_id] : null, L = aucLanded(a), q = a.qty || 1, per = L ? L / q : null, b = it ? bench(it)[0] : null;
    return {...a, it, L, per, d: b && per ? (b - per) / b * 100 : null, live: new Date(a.ends_at).getTime() > Date.now()};
  }).sort((a, b) => a.ends_at.localeCompare(b.ends_at));
}
const dBadge = d => d == null ? "" : d >= 0 ? `<span class="badge b-g">−${fmt(d)} %</span>` : `<span class="badge b-r">+${fmt(-d)} %</span>`;

// --- sektioner ---
function hero() {
  const owned = P.items.filter(i => i.status === "owned");
  const cost = owned.reduce((s, i) => s + i.purchase_price_sek * i.quantity, 0), tot = k => owned.reduce((s, i) => s + val(i, k) * i.quantity, 0);
  const mid = tot("mid"), gain = mid - cost, cls = gain >= 0 ? "b-g" : "b-r";
  return `<section class=hero id=top><div class=lbl>Portföljvärde (mitten)</div><div class=val>${kr(mid)}</div>
    <div class=row><span class="badge ${cls}">${gain >= 0 ? "+" : "−"}${kr(Math.abs(gain))} · ${signPct(mid, cost)}</span><span class="muted small">${eur(mid)} · uppdaterad ${esc(P.last_updated)}</span></div>
    <div class=stats><div class=stat><span>Köpt för</span><b>${kr(cost)}</b></div><div class=stat><span>Försiktigt</span><b>${kr(tot("conservative"))}</b></div><div class=stat><span>Högt</span><b>${kr(tot("high"))}</b></div></div></section>`;
}
function focus() {
  const deals = P.items.flatMap(offersOf).filter(o => o.deal).sort((a, b) => b.d - a.d);
  const liveA = auctions().filter(a => a.live);
  const soon = [...liveA.filter(a => a.lot_analysis?.gems?.length), ...liveA.filter(a => !a.lot_analysis?.gems?.length)].slice(0, 8);
  const cards = [
    ...deals.map(o => `<a class=hcard href="${esc(o.url)}" target=_blank rel=noopener><div class=img>${img(o.item)}${dBadge(o.d)}<span class=tag>DEAL</span></div>
      <div class=body><div class=t>${esc(o.item.name)}</div><div class="muted small">${esc(o.source)} · ${esc(o.risk.slice(0, 2).join(", "))}</div><div class=p>${kr(o.L)}</div><div class="muted small">vs trend ${kr(bench(o.item)[0])}</div></div></a>`),
    ...soon.map(a => `<a class=hcard href="${esc(a.url)}" target=_blank rel=noopener><div class=img>${a.lot_analysis ? `<img src="${esc(a.lot_analysis.images[0])}" alt="" loading=lazy style="max-width:100%;max-height:100%;object-fit:cover">` : img(a.it, a.title)}${a.d != null ? dBadge(a.d) : ""}${a.lot_analysis?.gems?.length ? '<span class="badge b-g">💎 Gömt och glömt</span>' : ""}<span class=tag>⏱ ${countdown(a.ends_at)}</span></div>
      <div class=body><div class=t>${esc(a.title)}${(a.qty || 1) > 1 ? " ×" + a.qty : ""}</div><div class="muted small">${esc(a.platform)} · ${esc(a.price_kind)} ${money(a.price, a.currency)}</div>
      <div class=p>${kr(a.per)}${(a.qty || 1) > 1 ? "<span class='muted small'> /st</span>" : ""}</div><div class="muted small">inkl. avgifter${a.estimate ? " · värdering " + money(a.estimate, a.currency) : ""}</div></div></a>`)];
  return `<h2 id=fokus>Att titta på nu</h2><p class=sub>${deals.length} deal${deals.length === 1 ? "" : "s"} · ${soon.length} auktioner som slutar snart. Pris = landat inkl. avgifter; badge = mot Cardmarket-trend.</p>
    ${cards.length ? `<div class=strip>${cards.join("")}</div>` : '<p class=muted>Inget att lyfta fram just nu.</p>'}`;
}
function sources(it) {
  const G = [["Cardmarket", ["cardmarket", "packquant"]], ["TCGplayer", ["tcgplayer"]], ["Tradera", ["tradera"]], ["Svenska butiker", ["pokejakt", "dragon", "hobbykort", "kortarkivet", "manatorsk"]], ["eBay", ["ebay"]], ["Aukro", ["aukro"]], ["Övriga EU", ["butiker eu", "pokeschnapp"]]];
  return `<div class=src>${G.map(([g, k]) => { const ss = it.snapshots.filter(s => k.some(x => s.source.toLowerCase().includes(x))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    return ss.length ? `<div><b>${g}</b>${ss.map(s => `<div><a href="${esc(s.url)}" target=_blank rel=noopener>${money(s.price, s.currency)}</a> <span class=muted>${TYPES[s.type]} · ${s.date}${s.approx ? "~" : ""}</span></div>`).join("")}</div>` : ""; }).join("")}</div>`;
}
function offerTable(list, withItem) {
  if (!list.length) return '<p class="muted small">Inga sparade erbjudanden.</p>';
  return `<div class=scroll><table><tr><th>Källa</th>${withItem ? "<th>Objekt</th>" : ""}<th>Pris</th><th>Landat</th><th>Mot trend</th><th>Risk</th></tr>${list.map(o => `<tr>
    <td>${o.deal ? '<span class="badge b-g">DEAL</span> ' : ""}<a href="${esc(o.url)}" target=_blank rel=noopener>${esc(o.source)}</a><br><span class=muted>${o.origin} · ${o.date} · ${esc(o.language)}</span></td>
    ${withItem ? `<td>${esc(o.item.name)}</td>` : ""}<td>${money(o.price, o.currency)}${o.shipping ? `<br><span class=muted>+frakt ${money(o.shipping, o.currency)}</span>` : ""}</td><td>${kr(o.L)}</td><td>${dBadge(o.d) || "–"}</td>
    <td class=muted>${esc(o.risk.join(", "))}${o.notes ? "<br>" + esc(o.notes) : ""}</td></tr>`).join("")}</table></div>`;
}
const community = it => (it.community || []).length ? it.community.map(c => `<div class=small style="margin-bottom:8px"><a href="${esc(c.url)}" target=_blank rel=noopener>${esc(c.label)}</a><br><span class=muted>${esc(c.takeaway)}</span></div>`).join("") : '<p class="muted small">Inga trådar sparade.</p>';
const credit = it => it.image ? `<p class="muted small">Bild: <a href="${esc(it.image.source_url)}" target=_blank rel=noopener>${esc(it.image.credit)}</a></p>` : "";
function details(it) {
  const [b, bs] = bench(it);
  return `<details class=more><summary>Visa detaljer</summary><div class=inner><p class=small>${esc(it.notes)}</p>
    <h4>Prishistorik (SEK)</h4><div class=chart>${chart(it)}</div><h4>Källor</h4>${sources(it)}
    <h4>Erbjudanden${b ? ` · riktmärke ${kr(b)} (CM-trend ${bs.date})` : ""}</h4>${offerTable(offersOf(it), false)}<h4>Forum &amp; community</h4>${community(it)}
    ${it.msrp ? `<p class="muted small">MSRP <a href="${esc(it.msrp.url)}" target=_blank rel=noopener>${money(it.msrp.price, it.msrp.currency)}</a></p>` : ""}${credit(it)}</div></details>`;
}
function mine() {
  const owned = P.items.filter(i => i.status === "owned");
  return `<h2 id=mina>Mina samlarobjekt</h2><p class=sub>${owned.length} objekt · tryck på "Visa detaljer" för graf, källor och erbjudanden.</p><div class=grid>${owned.map(i => {
    const m = val(i, "mid"), c = i.purchase_price_sek, g = m - c;
    return `<article class=mine><div class=top><div class=thumb>${img(i)}</div><div><h3>${esc(i.name)}</h3><div class="muted small">${esc(i.category)} · ${esc(i.language)} · ${i.quantity} st</div>
      <div class=v>${kr(m)}</div><span class="badge ${g >= 0 ? "b-g" : "b-r"}">${g >= 0 ? "+" : "−"}${kr(Math.abs(g))} · ${signPct(m, c)}</span> <span class="muted small">köpt ${kr(c)}</span>${spark(i)}</div></div>
      <div class=range>${[["conservative", "Försiktig"], ["mid", "Mitten"], ["high", "Hög"]].map(([k, l]) => `<div><span>${l}</span><b>${kr(val(i, k))}</b></div>`).join("")}</div>${details(i)}</article>`; }).join("")}</div>`;
}
function watch() {
  const w = P.items.filter(i => i.status === "watchlist");
  return `<h2 id=bevakning>Bevakning</h2><p class=sub>Ej ägda – marknadsvärde (Cardmarket).</p><div class=watch>${w.map(i => {
    const deals = offersOf(i).filter(o => o.deal).length;
    return `<article class=wcard><div class=img>${img(i)}</div><div class=body><div class=t>${esc(i.name.replace(/^MTG /, ""))}</div><div class=p>${kr(val(i, "mid"))}</div>
      <div class="muted small">${eur(val(i, "mid"))}</div>${spark(i)}${deals ? `<span class="badge b-g">${deals} deal</span>` : ""}</div>${details(i)}</article>`; }).join("")}</div>`;
}
function more() {
  const all = P.items.flatMap(offersOf), auc = auctions(), live = auc.filter(a => a.live);
  const fees = Object.entries(AF).map(([k, v]) => `<a href="${esc(v.source)}" target=_blank rel=noopener>${esc(k)}</a> ${v.premium_pct} % + ${v.fixed} ${v.currency}`).join(" · ");
  const aucRows = live.map(a => `<tr><td>${a.ends_at.replace("T", " ")}<br><span class=muted>${countdown(a.ends_at)}</span></td><td>${esc(a.platform)}</td><td><a href="${esc(a.url)}" target=_blank rel=noopener>${esc(a.title)}</a>${(a.qty || 1) > 1 ? " ×" + a.qty : ""}</td>
    <td>${money(a.price, a.currency)}<br><span class=muted>${esc(a.price_kind)}</span></td><td>${a.estimate ? money(a.estimate, a.currency) : "–"}</td><td>${kr(a.L)}</td><td>${dBadge(a.d) || "–"}</td><td class=muted>${esc(a.notes)}</td></tr>`).join("");
  const mw = (P.market_watch || []).map(m => `<li class=small><b>${esc(m.platform)}</b>: <a href="${esc(m.url)}" target=_blank rel=noopener>${esc(m.title)}</a>${m.price ? " – " + kr(sek(m.price, m.currency)) : ""} <span class=muted>· ${m.date_seen} · ${esc(m.notes)}</span></li>`).join("");
  const rates = Object.entries(P.rates).map(([k, v]) => `1 ${k} = ${v} SEK`).join(" · ");
  return `<h2 id=detaljer>Detaljer</h2><p class=sub>Fullständiga tabeller och antaganden.</p>
    <details class=panel><summary>Alla erbjudanden (${all.length})</summary><div class=inner>${offerTable(all, true)}<p class="muted small">${esc(DS.notes)}</p></div></details>
    <details class=panel><summary>Pågående auktioner (${live.length})</summary><div class=inner>${live.length ? `<div class=scroll><table><tr><th>Slutar</th><th>Plattform</th><th>Objekt</th><th>Aktuellt</th><th>Värdering</th><th>Landat</th><th>Mot trend</th><th>Noter</th></tr>${aucRows}</table></div>` : '<p class="muted small">Inga pågående auktioner.</p>'}<p class="muted small">Avgifter: ${fees}. Tradera-procenten är observerad, ej officiell.</p></div></details>
    <details class=panel><summary>Övrigt att bevaka (${(P.market_watch || []).length})</summary><div class=inner><ul style="padding-left:18px">${mw}</ul></div></details>
    <p class=foot>Valutakurser: ${rates} (ECB-referens). Värden är uppskattningar från annonser/trender, inte bekräftade försäljningar; avgifter och frakt ej avdragna i portföljvärdet. Produktbilder tillhör respektive rättighetsinnehavare.</p>`;
}

function lots() {
  const L = auctions().filter(a => a.lot_analysis && a.live);
  if (!L.length) return "";
  return `<h2 id=lotter>Auktionslotter – bildanalys</h2><p class=sub>Alla lotbilder granskade manuellt. 💎 = dyrgrip, "gömt och glömt" = värdefullt som inte nämns i beskrivningen.</p><div class=grid>${L.map(a => { const x = a.lot_analysis;
    return `<article class=mine><div class=top><div class=thumb style="background:#000"><img src="${esc(x.images[0])}" alt="" loading=lazy style="max-width:100%;max-height:100%;object-fit:cover"></div><div>
      <h3>${esc(a.title)}</h3><div class="muted small">${esc(a.platform)} · ${countdown(a.ends_at)} · slutar ${a.ends_at.replace("T", " ")}</div>
      <div class=v style="font-size:20px">${kr(a.L)} <span class="muted small">landat vid ${esc(a.price_kind)} ${money(a.price, a.currency)}</span></div>
      ${a.estimate ? `<div class="muted small">Husets värdering ${money(a.estimate, a.currency)}</div>` : ""}
      <div style="margin-top:6px">${x.gems.length ? x.gems.map(g => `<span class="badge b-g">💎 ${esc(g)}</span>`).join(" ") : '<span class="badge b-n">Inga dyrgripar hittade</span>'} ${x.flags.map(g => `<span class="badge b-a">${esc(g)}</span>`).join(" ")}</div></div></div>
      <div class=inner><p class=small><b>Bedömning:</b> ${esc(x.verdict)}</p><p class="muted small">${esc(x.value_note)}${x.value_range ? " Uppskattat värde: " + esc(x.value_range) : ""}</p></div>
      <details class=more><summary>Hittat i bilderna (${x.identified.length})</summary><div class=inner><ul style="padding-left:18px;margin:0">${x.identified.map(i => `<li class=small style="margin-bottom:6px"><b>${esc(i.what)}</b><br><span class=muted>${esc(i.notes || "")}</span>${i.price ? `<br>${i.url ? `<a href="${esc(i.url)}" target=_blank rel=noopener>${esc(i.price)}</a>` : esc(i.price)}` : ""}</li>`).join("")}</ul>
      <div class=src style="margin-top:10px">${x.images.map(u => `<a href="${esc(u)}" target=_blank><img src="${esc(u)}" loading=lazy style="width:100%;border-radius:8px"></a>`).join("")}</div>
      <p class="muted small">Analyserad ${esc(x.analyzed)} · <a href="${esc(a.url)}" target=_blank rel=noopener>Öppna auktionen</a></p></div></details></article>`; }).join("")}</div>`;
}
function render() {
  R = {SEK: 1, ...P.rates}; DS = P.deal_settings; AF = P.auction_fees || {}; ITEMS = Object.fromEntries(P.items.map(i => [i.id, i]));
  document.getElementById("app").innerHTML = hero() + focus() + mine() + lots() + watch() + more();
}
fetch("data.json?v=" + Date.now(), {cache: "no-store"}).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
  .then(d => { P = d; render(); }).catch(e => { document.getElementById("app").innerHTML = `<p class="r pad">Kunde inte ladda data.json (${esc(e.message)}).</p>`; });
