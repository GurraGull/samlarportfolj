// Samlarportfölj – klientsidig app som läser data.json. Svenska.
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = (v, d = 0) => Number(v).toLocaleString("sv-SE", {minimumFractionDigits: d, maximumFractionDigits: d});
let P, R, DS, AF, ITEMS, RANGE = "all";
const sek = (p, c) => R[c] != null && p != null ? p * R[c] : null;
const kr = v => v == null ? "–" : fmt(v) + " kr";
const eur = v => v == null ? "" : "€" + fmt(v / R.EUR);
const money = (p, c) => c === "SEK" ? kr(p) : `${fmt(p, 2)} ${c}` + (sek(p, c) ? ` <span class=mut>(${kr(sek(p, c))})</span>` : "");
const pctTxt = d => (d >= 0 ? "+" : "−") + fmt(Math.abs(d), Math.abs(d) < 10 ? 1 : 0) + " %";
const vs = d => d == null ? "" : `<span class="chip ${d >= 0 ? "c-g" : "c-r"}">${d >= 0 ? "−" + fmt(d) + " % under" : "+" + fmt(-d) + " % över"} trend</span>`;
const chip = (d, inv) => d == null ? "" : `<span class="chip ${(inv ? -d : d) >= 0 ? "c-g" : "c-r"}">${(inv ? -d : d) >= 0 ? "▲" : "▼"} ${fmt(Math.abs(d))} %</span>`;
const TYPES = {trend: "trend", listing: "annons", sold: "såld", bid: "bud"};
const COL = {trend: "#8b7cf6", listing: "#3ec7f5", sold: "#22c55e", bid: "#f5b93a"};
const dnum = s => new Date(s.slice(0, 10) + "T00:00:00Z").getTime() / 864e5;
const iso = d => new Date(d * 864e5).toISOString().slice(0, 10);
const NONEN = /tysk|german|japan|fransk|ital|span|kines|korean/i;
const ago = t => { if (!t) return ""; const m = (Date.now() - new Date(t).getTime()) / 6e4; return m < 60 ? Math.max(1, Math.round(m)) + " min sedan" : m < 1440 ? Math.round(m / 60) + " h sedan" : Math.round(m / 1440) + " d sedan"; };
const stockBadge = o => o.stock_status === "in_stock" ? `<span class="chip c-g" title="${esc(o.stock_evidence || "")}">I lager ✓ kontrollerat ${ago(o.stock_checked_at)}</span>` : o.stock_status === "preorder" ? `<span class="chip c-acc">Förbeställning</span>` : o.stock_status === "out_of_stock" ? `<span class="chip c-n">${o.dead_link ? "Död länk" : "Slut i lager"}</span>` : `<span class="chip c-a" title="${esc(o.stock_evidence || "")}">⚠ Lager ej verifierat</span>`;
const PH = "images/placeholder.svg";
const img = (it, alt) => `<img src="${esc(it?.image?.src || PH)}" alt="${esc(alt || it?.name || "")}" loading="lazy" onerror="this.onerror=null;this.src='${PH}'">`;
const short = n => n.replace(/^MTG /, "").replace(/^Pokémon TCG: /, "");

// ---------- ikoner (inline SVG) ----------
const I = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  gavel: '<path d="M14 4l6 6M11 7l6 6M8.5 9.5l6 6M3 21l7-7"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 004 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chev: '<path d="M6 9l6 6 6-6"/>', gem: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3l3 18 3-18"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h5"/>',
  swap: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>', se: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18"/>'
};
const ic = (n, s = 20) => `<svg class=i viewBox="0 0 24 24" style="width:${s}px;height:${s}px">${I[n]}</svg>`;

// ---------- beräkningar ----------
const val = (i, k) => { const v = i.valuation[k] || i.valuation.mid; return sek(v.price, v.currency); };
const bench = it => { const t = it.snapshots.filter(s => s.type === "trend" && s.source.toLowerCase().includes("cardmarket") && !s.approx);
  if (!t.length) return [null, null]; const s = t.reduce((a, b) => b.date > a.date ? b : a); return [sek(s.price, s.currency), s]; };
// prisserie för ett objekt: den trendkälla som har flest olika datum (helst Cardmarket)
function series(it) {
  const by = {};
  for (const s of it.snapshots) if (s.type === "trend" && !s.approx && sek(s.price, s.currency)) {
    const sl = s.source.toLowerCase(), k = sl.includes("prisguide") ? "Cardmarket prisguide" : sl.includes("cardmarket") ? "Cardmarket" : s.source.split(" ")[0];
    (by[k] ||= []).push([dnum(s.date), sek(s.price, s.currency)]);
  }
  const nd = k => new Set(by[k].map(x => x[0])).size + (k === "Cardmarket" && new Set(by[k].map(x => x[0])).size > 1 ? 100 : 0);
  const ks = Object.keys(by).sort((a, b) => nd(b) - nd(a));
  return ks.length ? {src: ks[0], pts: by[ks[0]].sort((a, b) => a[0] - b[0])} : {src: null, pts: []};
}
const winStart = () => { const end = dnum(P.last_updated); return RANGE === "7d" ? end - 7 : RANGE === "30d" ? end - 30 : -Infinity; };
function move(it) {
  const {src, pts} = series(it), w = winStart(), end = dnum(P.last_updated);
  const inW = pts.filter(p => p[0] >= w); const before = pts.filter(p => p[0] < w).pop();
  const a = before || inW[0], b = pts.filter(p => p[0] <= end).pop();
  if (!a || !b || a[0] === b[0]) return null;
  return {src, from: a, to: b, d: (b[1] - a[1]) / a[1] * 100};
}
function holdings() { // från transaktionslogg
  const h = {}; let realised = 0;
  for (const t of [...(P.transactions || [])].sort((a, b) => (a.date || "").localeCompare(b.date || ""))) {
    const x = h[t.item_id] ||= {qty: 0, cost: 0};
    if (t.type === "buy") { x.qty += t.qty; if (t.price_sek == null) { x.unknown = true; x.uqty = (x.uqty || 0) + t.qty; } else x.cost += t.price_sek + (t.fees_sek || 0); }
    else if (t.type === "sell") { const avg = x.qty ? x.cost / x.qty : 0; realised += t.price_sek - (t.fees_sek || 0) - avg * t.qty; x.cost -= avg * t.qty; x.qty -= t.qty; }
  }
  return {h, realised};
}
function totals() {
  const {h, realised} = holdings(); let cost = 0, mid = 0, midK = 0, lo = 0, hi = 0;
  for (const [id, x] of Object.entries(h)) { const it = ITEMS[id]; if (!it || x.qty <= 0) continue;
    cost += x.cost; mid += val(it, "mid") * x.qty; if (!x.unknown) midK += val(it, "mid") * x.qty; lo += val(it, "conservative") * x.qty; hi += val(it, "high") * x.qty; }
  return {cost, mid, midK, lo, hi, realised, unreal: midK - cost};
}
function portfolioSeries() {
  const {h} = holdings(); const owned = Object.entries(h).filter(([id, x]) => x.qty > 0 && ITEMS[id]);
  const ser = owned.map(([id, x]) => ({x, s: series(ITEMS[id]).pts}));
  const days = [...new Set(ser.flatMap(o => o.s.map(p => p[0])))].sort((a, b) => a - b);
  const pts = days.map(d => [d, ser.reduce((sum, o) => { const last = o.s.filter(p => p[0] <= d).pop() || o.s[0]; return sum + (last ? last[1] * o.x.qty : 0); }, 0)]);
  const end = dnum(P.last_updated); if (pts.length && pts[pts.length - 1][0] < end) pts.push([end, totals().mid]);
  return pts;
}
const landed = o => { const r = R[o.currency]; if (r == null || o.price == null) return null; let b = (o.price * (1 + (o.fee_pct || 0) / 100) + (o.shipping || 0)) * r;
  if (o.origin === "non-EU") b = b * (1 + DS.customs_pct / 100) * (1 + DS.import_vat_pct / 100) + DS.non_eu_handling_fee_sek; return b; };
function offersOf(it) {
  const [b] = bench(it), seen = new Set(), offers = [...(it.offers || [])].sort((x, y) => y.date.localeCompare(x.date)).filter(o => !seen.has(o.url) && seen.add(o.url)); if (!offers.length) return []; // senaste per URL
  const latest = offers.map(o => o.date).sort().pop();
  return offers.map(o => { const L = landed(o), d = b && L ? (b - L) / b * 100 : null, risk = [];
    if (o.shipping == null) risk.push("frakt okänd"); if (o.in_stock == null) risk.push("lager okänt"); if (o.in_stock === false) risk.push("ej i lager");
    if (o.origin === "non-EU") risk.push("icke-EU: moms/tull"); if (["okänt", "alla språk"].includes(o.language)) risk.push("språk okänt");
    if (!o.seller_rating) risk.push("säljbetyg saknas"); if (["tradera", "ebay", "cardmarket", "aukro"].some(k => o.source.toLowerCase().includes(k))) risk.push("kolla försegling");
    if (o.stock_status === "unknown") risk.unshift("lager ej verifierat");
    return {...o, item: it, L, d, risk, current: o.date === latest, eng: !NONEN.test(o.language || ""), deal: d != null && d >= DS.threshold_pct && o.stock_status === "in_stock" && !NONEN.test(o.language || "")}; })
    .sort((a, c) => c.date.localeCompare(a.date) || (c.d ?? -999) - (a.d ?? -999));
}
function aucLanded(a) { const f = AF[a.platform] || {premium_pct: 0, fixed: 0, currency: "SEK"}; let v = sek(a.price, a.currency); if (v == null) return null;
  v = v * (1 + f.premium_pct / 100) + sek(f.fixed, f.currency) + (a.shipping ? sek(a.shipping, a.currency) : 0); if (a.platform.endsWith("UK")) v *= 1 + DS.import_vat_pct / 100; return v; }
function auctions() { return (P.auctions || []).map(a => { const it = a.item_id ? ITEMS[a.item_id] : null, L = aucLanded(a), q = a.qty || 1, per = L ? L / q : null, b = it ? bench(it)[0] : null;
  return {...a, it, L, per, d: b && per ? (b - per) / b * 100 : null, live: a.auction_status !== "ended" && new Date(a.ends_at).getTime() > Date.now()}; }).sort((a, b) => a.ends_at.localeCompare(b.ends_at)); }
function countdown(t) { const ms = new Date(t).getTime() - Date.now(); if (ms <= 0) return "avslutad"; const h = Math.floor(ms / 36e5), d = Math.floor(h / 24);
  return d >= 1 ? `${d} d ${h % 24} h` : h >= 1 ? `${h} h ${Math.floor(ms / 6e4) % 60} min` : `${Math.floor(ms / 6e4)} min`; }
function alertState(it) {
  return (it.alerts || []).map(a => { const offers = offersOf(it).filter(o => o.stock_status === "in_stock" && o.eng && o.L);
    const best = offers.length ? Math.min(...offers.map(o => o.L)) : null, cur = a.basis === "offer" ? best : val(it, "mid");
    const hit = cur != null && (a.type === "below" ? cur <= a.sek : cur >= a.sek);
    return {...a, cur, hit}; });
}
const alertChips = it => alertState(it).map(a => `<span class="chip ${a.hit ? "c-a" : "c-n"}" title="${esc(a.note || "")}">${ic("bell", 12)} ${a.type === "below" ? "≤" : "≥"} ${kr(a.sek)}${a.hit ? " · utlöst" : ""}</span>`).join("");

// ---------- grafer ----------
function lineChart(lines, {w = innerWidth < 600 ? 400 : 900, h = innerWidth < 600 ? 240 : 230, pad = 44, cost = null} = {}) {
  const all = lines.flatMap(l => l.pts); if (all.length < 2) return '<div class="empty">För få datapunkter ännu – grafen fylls på vid varje prisuppdatering.</div>';
  let x0 = Math.min(...all.map(p => p[0])), x1 = Math.max(...all.map(p => p[0])); if (x1 === x0) x0 -= 1;
  const ys = all.map(p => p[1]).concat(cost != null ? [cost] : []); const lo = Math.min(...ys) * .92, hi = Math.max(...ys) * 1.04;
  const X = d => pad + (d - x0) / (x1 - x0) * (w - pad - 8), Y = v => h - 24 - (v - lo) / (hi - lo) * (h - 36);
  let g = `<svg viewBox="0 0 ${w} ${h}"><defs><linearGradient id=gf x1=0 y1=0 x2=0 y2=1><stop offset=0 stop-color="#8b7cf6" stop-opacity=".35"/><stop offset=1 stop-color="#8b7cf6" stop-opacity="0"/></linearGradient></defs>`;
  for (let k = 0; k <= 3; k++) { const v = lo + (hi - lo) * k / 3; g += `<line x1=${pad} x2=${w - 8} y1=${Y(v)} y2=${Y(v)} stroke="#1c2436"/><text x=0 y=${Y(v) + 4} class=ax>${v >= 1e4 ? fmt(v / 1000) + "k" : fmt(v)}</text>`; }
  if (cost != null) g += `<line x1=${pad} x2=${w - 8} y1=${Y(cost)} y2=${Y(cost)} stroke="#8a96ab" stroke-dasharray="5 5" stroke-width=1.5 />`;
  for (const l of lines) { const p = l.pts.sort((a, b) => a[0] - b[0]); if (!p.length) continue;
    const path = p.map((q, i) => (i ? "L" : "M") + X(q[0]).toFixed(1) + "," + Y(q[1]).toFixed(1)).join("");
    if (l.fill) g += `<path d="${path}L${X(p[p.length - 1][0])},${h - 24}L${X(p[0][0])},${h - 24}Z" fill="url(#gf)"/>`;
    if (p.length > 1 && !l.dots) g += `<path d="${path}" fill=none stroke="${l.color}" stroke-width=2.6 stroke-linejoin=round />`;
    for (const q of p) if (l.dots || l.end) g += `<circle cx=${X(q[0])} cy=${Y(q[1])} r=${l.dots ? 3.5 : 0} fill="${l.color}"><title>${iso(q[0])}: ${kr(q[1])}${q[2] ? " · " + esc(q[2]) : ""}</title></circle>`;
    const e = p[p.length - 1]; g += `<circle cx=${X(e[0])} cy=${Y(e[1])} r=4.5 fill="${l.color}" stroke="#121826" stroke-width=2 />`; }
  return g + `<text x=${pad} y=${h - 6} class=ax>${iso(x0)}</text><text x=${w - 8} y=${h - 6} class=ax text-anchor=end>${iso(x1)}</text></svg>`;
}
function itemChart(it) {
  const lines = Object.keys(TYPES).map(t => ({color: COL[t], dots: t !== "trend", pts: it.snapshots.filter(s => s.type === t && !s.approx && sek(s.price, s.currency)).map(s => [dnum(s.date), sek(s.price, s.currency), s.source])}));
  const tr = series(it); lines[0] = {color: COL.trend, fill: true, pts: tr.pts.map(p => [...p, tr.src])};
  return `<div class=legend style="margin-bottom:6px">${Object.keys(TYPES).map(t => `<span><i style="background:${COL[t]}"></i>${TYPES[t]}</span>`).join("")}${it.purchase_price_sek ? '<span><i style="background:#8a96ab"></i>köppris</span>' : ""}</div>` + lineChart(lines, {cost: it.purchase_price_sek || null});
}
function spark(it) { const p = series(it).pts; if (new Set(p.map(x => x[0])).size < 2) return "";
  const w = 64, h = 24, xs = p.map(q => q[0]), ys = p.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const c = ys[ys.length - 1] >= ys[0] ? "#22c55e" : "#f43f5e";
  return `<svg width=${w} height=${h} viewBox="0 0 ${w} ${h}" style="display:block;margin-left:auto"><polyline fill=none stroke="${c}" stroke-width=1.8 points="${p.map(q => (2 + (q[0] - x0) / (x1 - x0) * (w - 4)) + "," + (h - 2 - (q[1] - y0) / Math.max(y1 - y0, 1) * (h - 4))).join(" ")}"/></svg>`; }

// ---------- delkomponenter ----------
const sources = (it, full) => { const G = [["Cardmarket", ["cardmarket", "packquant"]], ["TCGplayer", ["tcgplayer"]], ["Tradera", ["tradera"]], ["Svenska butiker", ["pokejakt", "dragon", "hobbykort", "kortarkivet", "manatorsk"]], ["eBay", ["ebay"]], ["Aukro", ["aukro"]], ["Övriga EU", ["butiker eu", "pokeschnapp"]]];
  return `<div class=src>${G.map(([g, k]) => { const ss = it.snapshots.filter(s => k.some(x => s.source.toLowerCase().includes(x))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, full ? 99 : 3);
    return ss.length ? `<div><b>${g}</b>${ss.map(s => `<div><a href="${esc(s.url)}" target=_blank rel=noopener>${money(s.price, s.currency)}</a> <span class=mut>${TYPES[s.type]} · ${s.date}${s.approx ? "~" : ""}</span></div>`).join("")}</div>` : ""; }).join("")}</div>`; };
function offerRow(o, withItem) {
  return `<a class="row${o.stock_status === "out_of_stock" || !o.eng ? " oos" : ""}" title="${esc(o.risk.join(" · "))}" href="${esc(o.url)}" target=_blank rel=noopener style="grid-template-columns:${withItem ? "52px " : ""}1fr auto">
    ${withItem ? `<div class=th>${img(o.item)}</div>` : ""}<div><div class=nm>${o.deal ? '<span class="chip c-g">DEAL</span> ' : ""}${esc(o.source)}${withItem ? ` <span class=mut>· ${esc(short(o.item.name))}</span>` : ""}</div>
    <div class=meta>${stockBadge(o)}${o.eng ? "" : '<span class="chip c-r">ej engelska</span>'}${o.origin} · ${o.date} · ${esc(o.language)}</div></div>
    <div class=rt><b>${kr(o.L)}</b><span class="xs mut">${o.currency !== "SEK" ? fmt(o.price, 2) + " " + o.currency : "landat"}</span><br>${chip(o.d)}</div></a>`;
}
const LIM = 5;
const itemHref = it => `#item/${it.id}`;
const more = (n, href, what = "erbjudanden") => n > LIM ? `<a class=more href="${href}">Visa alla ${n} ${what} ${ic("chev", 14)}</a>` : "";
const byDeal = (a, b) => (b.d ?? -1e9) - (a.d ?? -1e9) || (a.L ?? 1e9) - (b.L ?? 1e9);
function offerRows(list, withItem, full) {
  if (!list.length) return '<div class="empty sm">Inga sparade erbjudanden.</div>';
  const ok = list.filter(o => o.stock_status !== "out_of_stock" && o.eng).sort((a, b) => (a.stock_status === "in_stock" ? 0 : 1) - (b.stock_status === "in_stock" ? 0 : 1) || byDeal(a, b));
  const gone = list.filter(o => o.stock_status === "out_of_stock" || !o.eng);
  const shown = full ? ok : ok.slice(0, LIM), it = list[0].item;
  return `${ok.length ? `<div class=list>${shown.map(o => offerRow(o, withItem)).join("")}</div>` : '<div class="card empty sm">Inga verifierade köpbara erbjudanden.</div>'}
  ${full ? (gone.length ? `<div class="list" style="margin-top:8px">${expRow(`<div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center"><span class="sm mut">Slut i lager / ej engelska (${gone.length})</span><span class=chev>${ic("chev", 16)}</span></div>`, `<div class=oosl>${gone.map(o => offerRow(o, withItem)).join("")}</div>`)}</div>` : "")
    : more(list.length, itemHref(it))}`;
}
function aucRow(a) {
  return `<a class=row href="${esc(a.url)}" target=_blank rel=noopener><div class=th>${a.lot_analysis ? `<img class=cover src="${esc(a.lot_analysis.images[0])}" alt="">` : img(a.it, a.title)}</div>
    <div><div class=nm>${esc(a.title)}${(a.qty || 1) > 1 ? " ×" + a.qty : ""}</div><div class=meta><span class="chip c-n">${ic("clock", 12)} ${countdown(a.ends_at)}</span>${esc(a.platform)} · ${esc(a.price_kind)} ${a.currency === "SEK" ? kr(a.price) : fmt(a.price) + " " + a.currency}${a.bids ? ` · ${a.bids} bud` : ""}</div></div>
    <div class=rt><b>${kr(a.per)}</b>${a.d != null ? vs(a.d) : a.lot_analysis ? `<span class="chip ${a.lot_analysis.gems.length ? "c-g" : "c-n"}">${a.lot_analysis.gems.length ? "💎" : "analyserad"}</span>` : ""}</div></a>`;
}
const aucRows = (list, full, href) => list.length ? `<div class=list>${(full ? list : list.slice(0, LIM)).map(aucRow).join("")}</div>${full ? "" : more(list.length, href, "auktioner")}` : '<div class="empty sm">Inga pågående auktioner.</div>';
const community = (it, full) => (it.community || []).length ? (full ? it.community : it.community.slice(0, LIM)).map(c => `<div class=sm style="margin-bottom:8px"><a href="${esc(c.url)}" target=_blank rel=noopener>${esc(c.label)}</a><br><span class=mut>${esc(c.takeaway)}</span></div>`).join("") : '<div class="sm mut">Inga trådar sparade.</div>';
function details(it, full) {
  const [b, bs] = bench(it), aucs = auctions().filter(a => a.live && a.item_id === it.id).sort(byDeal);
  const src = sources(it, full);
  return `<div class=in>${full ? `<p class="sm mut">${esc(it.notes)}</p>` : ""}<h4>Prishistorik (SEK)</h4><div class=pchart>${itemChart(it)}</div>
    ${(it.alerts || []).length ? `<h4>Prisbevakning</h4>${alertState(it).map(a => `<div class=sm style="margin-bottom:6px"><span class="chip ${a.hit ? "c-a" : "c-n"}">${ic("bell", 12)} ${a.type === "below" ? "under" : "över"} ${kr(a.sek)}</span> <span class=mut>nu ${kr(a.cur)}</span></div>`).join("")}` : ""}
    <h4>Bästa erbjudanden${b ? ` · trend ${kr(b)}` : ""}</h4>${offerRows(offersOf(it), false, full)}
    ${aucs.length ? `<h4>Auktioner</h4>${aucRows(aucs, full, itemHref(it))}` : ""}
    ${it.cardmarket_url ? `<p class=sm><a href="${esc(it.cardmarket_url)}" target=_blank rel=noopener>${ic("ext", 13)} Cardmarket – engelska annonser</a></p>` : ""}
    ${full ? `<h4>Källor</h4>${src}<h4>Forum &amp; community</h4>${community(it, true)}${it.msrp ? `<p class="sm mut">MSRP <a href="${esc(it.msrp.url)}" target=_blank rel=noopener>${money(it.msrp.price, it.msrp.currency)}</a></p>` : ""}
    ${it.image ? `<p class="xs mut">Bild: <a href="${esc(it.image.source_url)}" target=_blank rel=noopener>${esc(it.image.credit)}</a></p>` : ""}` : `<a class=more href="${itemHref(it)}">Öppna objektsidan ${ic("chev", 14)}</a>`}</div>`;
}
const expRow = (head, body) => `<div class=row onclick="this.classList.toggle('open')">${head}</div><div class=exp><div>${body}</div></div>`;

// ---------- Bästa deals: ranking av enskilda köpbara erbjudanden ----------
const riseFor = h => h > 72 ? 15 : h > 24 ? 10 : h > 6 ? 5 : 2; // antagen budhöjning till slut (%)
function dealCands() {
  const c = [];
  for (const it of P.items) { const [b] = bench(it); if (!b) continue;
    for (const o of offersOf(it)) if (o.stock_status === "in_stock" && o.eng && o.L && o.d != null)
      c.push({it, kind: "offer", where: o.source, price: o.currency === "SEK" ? kr(o.price) : `${fmt(o.price, 2)} ${o.currency}`, L: o.L, d: o.d, score: o.d, url: o.url, b,
        why: (o.source.includes("Cardmarket") ? "Cardmarket billigaste (ej live-kontr.)" : "I lager ✓ kontrollerat " + ago(o.stock_checked_at)) + (o.fee_pct ? ` · inkl. ${o.fee_pct} % köparskydd` : "") + (o.shipping == null ? " · frakt okänd" : "")}); }
  for (const a of auctions()) if (a.live && a.it && a.d != null && (a.qty || 1) === 1) { const h = (new Date(a.ends_at) - Date.now()) / 36e5, r = riseFor(h);
    c.push({it: a.it, kind: "auction", where: a.platform + " auktion", price: `${a.price_kind} ${kr(a.price)}`, L: a.per, d: a.d, score: a.d - r, url: a.url, b: bench(a.it)[0], ends: a.ends_at,
      why: `Slutar om ${countdown(a.ends_at)} · ${a.bids ? a.bids + " bud" : "inga bud"} · justerat −${r} % för väntad budhöjning`}); }
  return c.sort((x, y) => y.score - x.score);
}
function restock() {
  const L = P.items.flatMap(it => offersOf(it).filter(o => o.restock_watch)).sort((a, b) => (b.d ?? -1e9) - (a.d ?? -1e9));
  if (!L.length) return "";
  return `<div class=sec><h2 style="font-size:15px">${ic("bell", 16)} Bevaka restock</h2><span>${L.filter(o => o.stock_status === "in_stock").length ? '<b class=g>I LAGER!</b>' : "alla slut"}</span></div>
  <p class="xs mut" style="margin:-4px 0 8px">Butikspris under trend – köp direkt om de kommer tillbaka. Kontrolleras i webbläsare (Webhallen blockerar automatik).</p>
  <div class=list>${L.map(o => `<a class=row href="${esc(o.url)}" target=_blank rel=noopener><div class=th>${img(o.item)}</div><div><div class=nm>${esc(short(o.item.name))}</div>
    <div class=meta><span class="chip ${o.stock_status === "in_stock" ? "c-g" : "c-n"}">${o.discontinued ? "Utgången" : o.stock_status === "in_stock" ? "I lager!" : o.stock_status === "preorder" ? "Restorder" : "Slut"}</span>${esc(o.source)}${o.members_only ? " · medlemspris" : ""} · koll ${ago(o.stock_checked_at)}</div></div>
    <div class=rt><b>${o.price != null ? kr(o.price) : "–"}</b>${o.d != null ? vs(o.d) : ""}</div></a>`).join("")}</div>`;
}
function bestOf() {
  const all = dealCands(), cnt = {}, top = all.filter(x => (cnt[x.it.id] = (cnt[x.it.id] || 0) + 1) <= 2).slice(0, 6), any = top.length && top[0].score > 0;
  const info = `<details class=info><summary>${ic("spark", 14)} Hur rankas?</summary><div class="xs mut">Varje köpbart erbjudande rankas för sig, över alla bevakade objekt, efter <b>rabatt mot Cardmarket-trend</b> i landat SEK (pris + köparavgift/köparskydd + frakt + ev. importmoms).<br>• Butiker: bara verifierat i lager (lagerkoll) och engelska.<br>• Tradera Köp nu: +5 % köparskydd.<br>• Auktioner: nuvarande bud + avgifter, minus antagen budhöjning till slut: 15 % (> 3 d kvar), 10 % (1–3 d), 5 % (6–24 h), 2 % (< 6 h).<br>• Cardmarket: billigaste annons, inte live-kontrollerad.<br>Inga poäng för att bara finnas i lager. Okänd frakt räknas som 0.</div></details>`;
  return `<div class=sec><h2>${any ? "Bästa deals just nu" : "Närmast en deal"}</h2>${info}</div>${any ? "" : `<p class="sm mut" style="margin:-4px 0 10px">Inget köpbart ligger under trend just nu (${all.length} erbjudanden/auktioner jämförda). Här är de som ligger närmast.</p>`}
  <div class=strip>${top.map(x => `<a class=hc href="${esc(x.url)}" target=_blank rel=noopener><div class=im>${img(x.it)}<span class="chip ${x.score > 0 ? "c-g" : x.score > -10 ? "c-a" : "c-r"}" style="position:absolute;top:8px;left:8px">${x.d >= 0 ? "−" + fmt(x.d) + " % under" : "+" + fmt(-x.d) + " % över"} trend</span>${x.ends ? `<span class=tl>${ic("clock", 12)} ${countdown(x.ends)}</span>` : ""}</div>
    <div class=bd><div class=t>${esc(short(x.it.name))}</div><div class="xs mut">${esc(x.where)} · ${x.price}</div><div class=p>${kr(x.L)}</div><div class="xs mut">landat · trend ${kr(x.b)}</div><div class="xs" style="margin-top:4px;color:var(--mut)">${esc(x.why)}</div></div></a>`).join("")}</div>`;
}

// ---------- vyer ----------
function vOverview() {
  const t = totals(), pts = portfolioSeries(), w = winStart(), shown = pts.filter(p => p[0] >= w);
  const before = pts.filter(p => p[0] < w).pop(), base = before || shown[0];
  const ch = base && shown.length ? (shown[shown.length - 1][1] - base[1]) : null;
  const dc = {}, deals = P.items.flatMap(offersOf).filter(o => o.deal).sort((a, b) => b.d - a.d).filter(o => (dc[o.item.id] = (dc[o.item.id] || 0) + 1) <= 2);
  const live = auctions().filter(a => a.live), gems = live.filter(a => a.lot_analysis?.gems?.length);
  const pc = {}, soon = [...gems, ...live.filter(a => !a.lot_analysis?.gems?.length).sort(byDeal)].filter(a => (pc[a.item_id || a.url] = (pc[a.item_id || a.url] || 0) + 1) <= 2).slice(0, 6);
  const fired = P.items.flatMap(it => alertState(it).filter(a => a.hit).map(a => ({...a, it})));
  const movers = P.items.map(it => ({it, m: move(it)})).filter(x => x.m && x.m.d > 0).sort((a, b) => b.m.d - a.m.d).slice(0, 4);
  const strip = [...deals.map(o => `<a class=hc href="${esc(o.url)}" target=_blank rel=noopener><div class=im>${img(o.item)}${chip(o.d) ? `<span class="chip c-g" style="position:absolute;top:8px;left:8px">−${fmt(o.d)} %</span>` : ""}<span class=tl>${ic("tag", 12)} Deal</span></div>
      <div class=bd><div class=t>${esc(short(o.item.name))}</div><div class="xs mut">${esc(o.source)} · ${esc(o.origin)}</div><div class=p>${kr(o.L)}</div><div class="xs mut">trend ${kr(bench(o.item)[0])}</div></div></a>`),
    ...soon.map(a => `<a class=hc href="${esc(a.url)}" target=_blank rel=noopener><div class=im>${a.lot_analysis ? `<img class=cover src="${esc(a.lot_analysis.images[0])}" alt="">` : img(a.it, a.title)}${a.lot_analysis?.gems?.length ? `<span class="chip c-g" style="position:absolute;top:8px;left:8px">${ic("gem", 12)} Gömt och glömt</span>` : a.d != null ? `<span class="chip ${a.d >= 0 ? "c-g" : "c-r"}" style="position:absolute;top:8px;left:8px">${a.d >= 0 ? "−" : "+"}${fmt(Math.abs(a.d))} %</span>` : ""}<span class=tl>${ic("clock", 12)} ${countdown(a.ends_at)}</span></div>
      <div class=bd><div class=t>${esc(a.title)}</div><div class="xs mut">${esc(a.platform)} · ${esc(a.price_kind)} ${a.currency === "SEK" ? kr(a.price) : fmt(a.price) + " " + a.currency}</div><div class=p>${kr(a.per)}</div><div class="xs mut">landat inkl. avgifter${(a.qty || 1) > 1 ? " · per st" : ""}</div></div></a>`)];
  return `<div class=top><div><div class=h1>Översikt</div></div><div class=upd><span class=live></span>Uppdaterad ${esc(P.last_updated)}</div></div>
  <section class=hero><div class=lbl>Portföljvärde</div><div class=val>${kr(t.mid)}</div>
    <span class="chip ${t.unreal >= 0 ? "c-g" : "c-r"}">${t.unreal >= 0 ? "▲" : "▼"} ${kr(Math.abs(t.unreal))} · ${pctTxt(t.unreal / t.cost * 100)}</span> <span class="sm mut">${eur(t.mid)} · orealiserat</span>
    <div class=kpis><div class=kpi><span>Investerat</span><b>${kr(t.cost)}</b></div><div class=kpi><span>Realiserat</span><b class="${t.realised > 0 ? "g" : ""}">${kr(t.realised)}</b></div><div class=kpi><span>Spann</span><b>${fmt(t.lo)}–${fmt(t.hi)}</b></div></div></section>
  ${bestOf()}
  ${restock()}
  <div class="card chartcard"><div class=top style="margin-bottom:8px"><div class=legend><span><i style="background:#8b7cf6"></i>Marknadsvärde</span><span><i style="background:#8a96ab"></i>Investerat</span></div>
    <div class=seg>${["7d", "30d", "all"].map(r => `<button class="${RANGE === r ? "on" : ""}" onclick="RANGE='${r}';route()">${r === "all" ? "Allt" : r.replace("d", " d")}</button>`).join("")}</div></div>
    <div class=pchart>${lineChart([{color: "#8b7cf6", fill: true, pts: shown.map(p => [...p])}], {cost: t.cost})}</div>
    <div class="xs mut" style="padding:4px 2px 6px">${ch != null ? `Förändring ${RANGE === "all" ? "sedan första mätpunkt" : "senaste " + RANGE.replace("d", " dagarna")}: <b class="${ch >= 0 ? "g" : "r"}">${ch >= 0 ? "+" : "−"}${kr(Math.abs(ch))}</b>. ` : ""}Byggd från Cardmarket-trend i dina snapshots.</div></div>
  ${fired.length ? `<div class=banner>${ic("bell")}<div><b>${fired.length} prisbevakning${fired.length > 1 ? "ar" : ""} utlöst${fired.length > 1 ? "a" : ""}</b><br>${fired.map(a => `${esc(short(a.it.name))}: ${a.type === "below" ? "≤" : "≥"} ${kr(a.sek)} (nu ${kr(a.cur)})`).join("<br>")}</div></div>` : ""}
  <div class=sec><h2>Att titta på nu</h2><span>${deals.length} deal · ${live.length} auktioner</span></div>${strip.length ? `<div class=strip>${strip.join("")}</div>` : '<div class="card empty">Inget att lyfta fram just nu.</div>'}
  <div class=two><div><div class=sec><h2 style="font-size:15px">Stiger mest</h2><span>${RANGE === "all" ? "allt" : RANGE.replace("d", " d")}</span></div>
    ${movers.length ? `<div class=list>${movers.map(({it, m}) => `<a class=row href="${itemHref(it)}"><div class=th>${img(it)}</div><div><div class=nm>${esc(short(it.name))}</div><div class=meta>${esc(m.src)} · ${iso(m.from[0])} → ${iso(m.to[0])}</div></div><div class=rt><b>${kr(m.to[1])}</b>${chip(m.d)}</div></a>`).join("")}</div>` : '<div class="card empty">Inga rörelser i perioden.</div>'}</div>
  <div><div class=sec><h2>Dina styrkor</h2></div><div class="card" style="padding:14px 16px;font-size:13.5px;line-height:1.7">${ic("se", 16)} Svenska källor: Tradera, Auctionet, svenska butiker<br>${ic("swap", 16)} Landat pris i SEK inkl. moms, frakt &amp; provision<br>${ic("gem", 16)} Bildanalys av auktionslotter</div></div></div>
  ${foot()}`;
}
function groupBlock(it, body, n, what) {
  return `<div class=grp><a class=grph href="${itemHref(it)}"><div class=th>${img(it)}</div><div><div class=nm>${esc(short(it.name))}</div><div class="xs mut">${n} ${what} · trend ${kr(bench(it)[0])}</div></div>${ic("chev", 16)}</a>${body}</div>`;
}
function vDeals() {
  const all = P.items.flatMap(offersOf), dc = {}, deals = all.filter(o => o.deal).sort((a, b) => b.d - a.d).filter(o => (dc[o.item.id] = (dc[o.item.id] || 0) + 1) <= 2);
  const items = P.items.filter(it => (it.offers || []).length).map(it => ({it, os: offersOf(it)})).sort((a, b) => (Math.max(...b.os.filter(o => o.stock_status === "in_stock" && o.eng).map(o => o.d ?? -1e9), -1e9)) - (Math.max(...a.os.filter(o => o.stock_status === "in_stock" && o.eng).map(o => o.d ?? -1e9), -1e9)));
  return `<div class=h1>Deals</div><p class=sub>≥ ${DS.threshold_pct} % under Cardmarket-trend i landat SEK. Max 5 per objekt – tryck för alla.</p>
  ${deals.length ? `<div class=strip>${deals.map(o => `<a class=hc href="${esc(o.url)}" target=_blank rel=noopener><div class=im>${img(o.item)}<span class="chip c-g" style="position:absolute;top:8px;left:8px">−${fmt(o.d)} %</span></div><div class=bd><div class=t>${esc(short(o.item.name))}</div><div class="xs mut">${esc(o.source)}</div><div class=p>${kr(o.L)}</div></div></a>`).join("")}</div>` : '<div class="card empty sm">Inga deals just nu.</div>'}
  <div class=sec><h2>Per objekt</h2><span>${all.length} erbjudanden</span></div>${items.map(({it, os}) => groupBlock(it, offerRows(os, false, false), os.length, "erbjudanden")).join("")}${foot()}`;
}
function vAuctions() {
  const live = auctions().filter(a => a.live), lots = live.filter(a => a.lot_analysis);
  const fees = Object.entries(AF).map(([k, v]) => `<a href="${esc(v.source)}" target=_blank rel=noopener>${esc(k)}</a> ${v.premium_pct} % + ${v.fixed} ${v.currency}`).join(" · ");
  return `<div class=h1>Auktioner</div><p class=sub>Tradera, Auctionet &amp; Bukowskis · landat pris inkl. köparprovision${", +25 % importmoms för UK-hus"}.</p>
  <div class=sec><h2>Per objekt</h2><span>${live.length} pågående</span></div>
  ${P.items.map(it => ({it, l: live.filter(a => a.item_id === it.id).sort(byDeal)})).filter(x => x.l.length).map(({it, l}) => groupBlock(it, aucRows(l, false, itemHref(it)), l.length, "auktioner")).join("")}
  ${lots.length ? `<div class=sec><h2>Lotter – bildanalys</h2><span>${ic("gem", 14)} dyrgripar / gömt och glömt</span></div><div class=list>${(location.hash === "#lotter" ? lots : lots.slice(0, LIM)).map(a => { const x = a.lot_analysis;
    return expRow(`<div class=th><img class=cover src="${esc(x.images[0])}" alt=""></div><div><div class=nm>${esc(a.title)}</div><div class=meta>${x.gems.length ? x.gems.map(g => `<span class="chip c-g">💎 ${esc(g)}</span>`).join("") : '<span class="chip c-n">Inga dyrgripar</span>'}${x.flags.map(f => `<span class="chip c-a">${esc(f)}</span>`).join("")}</div></div><div class=rt><b>${kr(a.L)}</b><span class="xs mut">${countdown(a.ends_at)}</span><br><span class=chev>${ic("chev", 16)}</span></div>`,
      `<div class=in><p class=sm><b>Bedömning:</b> ${esc(x.verdict)}</p><p class="sm mut">${esc(x.value_note)}${x.value_range ? " Uppskattat värde: " + esc(x.value_range) : ""}</p><h4>Hittat i bilderna</h4>
       ${x.identified.map(i => `<div class=sm style="margin-bottom:8px"><b>${esc(i.what)}</b><br><span class=mut>${esc(i.notes || "")}</span>${i.price ? `<br>${i.url ? `<a href="${esc(i.url)}" target=_blank rel=noopener>${esc(i.price)}</a>` : esc(i.price)}` : ""}</div>`).join("")}
       <h4>Bilder</h4><div class=gal>${x.images.map(u => `<a href="${esc(u)}" target=_blank><img src="${esc(u)}" loading=lazy alt=""></a>`).join("")}</div><p class="xs mut">Analyserad ${esc(x.analyzed)} · <a href="${esc(a.url)}" target=_blank rel=noopener>Öppna auktionen ${ic("ext", 12)}</a></p></div>`); }).join("")}</div>${location.hash === "#lotter" ? "" : more(lots.length, "#lotter", "lotter")}` : ""}
  <div class=sec><h2>Övrigt att bevaka</h2></div><div class=list>${(P.market_watch || []).slice(0, LIM).map(m => `<a class=row href="${esc(m.url)}" target=_blank rel=noopener style="grid-template-columns:1fr auto"><div><div class=nm>${esc(m.title)}</div><div class=meta>${esc(m.platform)} · ${m.date_seen} · ${esc(m.notes)}</div></div><div class=rt><b>${m.price ? kr(sek(m.price, m.currency)) : "–"}</b></div></a>`).join("")}</div>
  <p class="xs mut" style="margin-top:10px">Avgifter: ${fees}. Tradera-procenten är observerad, ej officiell.</p>${foot()}`;
}
function vCollection() {
  const {h} = holdings(); const owned = P.items.filter(i => i.status === "owned" || i.status === "ordered");
  const tx = [...(P.transactions || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return `<div class=h1>Samling</div><p class=sub>${owned.length} objekt · tryck för detaljer.</p>
  ${(() => { const row = it => { const x = h[it.id], q = x?.qty ?? it.quantity, unk = x ? x.unknown : it.purchase_price_sek == null, c = x?.cost ?? it.purchase_price_sek, m = val(it, "mid") * q, g = m - c;
    return `<a class=row href="${itemHref(it)}"><div class=th>${img(it)}</div><div><div class=nm>${esc(short(it.name))}</div><div class=meta>${esc(it.category)} · ${esc(it.language)} · ${q} st · ${unk ? '<span class="chip c-n">inköpspris okänt</span>' : `köpt ${kr(c)}`}${it.purchase_price_estimated ? ' <span class="chip c-n">uppskattat</span>' : ""}${it.condition ? ` <span class="chip c-n">${esc(it.condition)}</span>` : ""}</div><div class=alerts>${it.order && !it.order.delivered ? `<span class="chip c-acc">${ic("clock", 12)} ${esc(it.order.badge)}</span>` : ""}${alertChips(it)}</div></div>
      <div class=rt><b>${kr(m)}</b>${unk ? "" : chip(g / c * 100)}${spark(it)}</div></a>`; };
    const allCards = owned.filter(i => i.kind === "card"), rest = owned.filter(i => i.kind !== "card"), all = location.hash === "#kort";
    const BULK = P.bulk_threshold_sek || 20, bulk = allCards.filter(i => val(i, "mid") < BULK), cards = allCards.filter(i => val(i, "mid") >= BULK).sort((x, y) => val(y, "mid") * (h[y.id]?.qty ?? y.quantity) - val(x, "mid") * (h[x.id]?.qty ?? x.quantity));
    const bq = bulk.reduce((s, i) => s + (h[i.id]?.qty ?? i.quantity), 0), bv = bulk.reduce((s, i) => s + val(i, "mid") * (h[i.id]?.qty ?? i.quantity), 0);
    const bulkRow = bulk.length ? `<details class=row style="display:block;cursor:pointer"><summary style="display:flex;justify-content:space-between;align-items:center;list-style:none"><div><div class=nm>Bulk (under ${BULK} kr/st)</div><div class=meta>${bq} kort · ${bulk.length} olika · inköpspris okänt</div></div><div class=rt><b>${kr(bv)}</b></div></summary><div class=list style="margin-top:8px">${bulk.map(row).join("")}</div></details>` : "";
    return `<div class=list>${rest.map(row).join("")}</div>${allCards.length ? `<div class=sec><h2>Kort</h2><span>${allCards.length} st${cards.length > LIM ? ` · <a href="#${all ? "samling" : "kort"}">${all ? "Visa färre" : "Visa alla"}</a>` : ""}</span></div><div class=list>${(all ? cards : cards.slice(0, LIM)).map(row).join("")}${bulkRow}</div>` : ""}`; })()}
  <div class=sec><h2>Transaktioner</h2><span>${tx.length}</span></div>
  <div class=list>${tx.map(t => { const it = ITEMS[t.item_id]; return `<div class=row style="cursor:default"><div class=th>${img(it)}</div><div><div class=nm>${t.type === "buy" ? "Köp" : "Sälj"} · ${esc(short(it?.name || t.item_id))}</div><div class=meta>${t.date || "datum okänt"} · ${esc(t.platform)} · ${t.qty} st${t.fees_sek ? " · avgifter " + kr(t.fees_sek) : ""}${t.note ? " · " + esc(t.note) : ""}</div></div><div class=rt><b class="${t.type === "sell" ? "g" : ""}">${t.type === "buy" ? "−" : "+"}${kr(t.price_sek)}</b></div></div>`; }).join("")}</div>
  ${(() => { const t = totals(); return `<div class=kpis><div class=kpi><span>Orealiserat</span><b class="${t.unreal >= 0 ? "g" : "r"}">${t.unreal >= 0 ? "+" : "−"}${kr(Math.abs(t.unreal))}</b></div><div class=kpi><span>Realiserat</span><b>${kr(t.realised)}</b></div><div class=kpi><span>Investerat</span><b>${kr(t.cost)}</b></div></div>`; })()}${foot()}`;
}
function vWatch() {
  const w = P.items.filter(i => i.status === "watchlist");
  return `<div class=h1>Bevakning</div><p class=sub>Ej ägda · marknadsvärde (Cardmarket) · prisbevakningar.</p>
  <div class=list>${w.map(it => { const m = move(it), deals = offersOf(it).filter(o => o.deal).length;
    return `<a class=row href="${itemHref(it)}"><div class=th>${img(it)}</div><div><div class=nm>${esc(short(it.name))}</div><div class=meta>${esc(it.category)}${deals ? ` · <span class="chip c-g">${deals} deal</span>` : ""}</div><div class=alerts>${alertChips(it)}</div></div>
      <div class=rt><b>${kr(val(it, "mid"))}</b>${m ? chip(m.d) : `<span class="xs mut">${eur(val(it, "mid"))}</span>`}${spark(it)}</div></a>`; }).join("")}</div>${foot()}`;
}
function vItem(id) {
  const it = ITEMS[id]; if (!it) return '<div class="card empty">Objektet finns inte.</div>';
  const {h} = holdings(), x = h[it.id], m = val(it, "mid"), back = it.status === "watchlist" ? "bevakning" : "samling";
  return `<a class=back href="#${back}" onclick="if(history.length>1){history.back();return false}">${ic("chev", 16)} Tillbaka</a>
  <div class="card big"><div class=th>${img(it)}</div><div><div class="xs mut">${esc(it.category)} · ${esc(it.language)}${it.condition ? " · Skick: " + esc(it.condition) : ""} · ${it.status === "owned" ? "Ägd" : it.status === "ordered" ? "Beställd" : "Bevakning"}</div><div class=nm style="font-weight:700;font-size:17px;line-height:1.3">${esc(short(it.name))}</div><div class=v>${kr(m)}</div>
    ${x && x.qty > 0 && x.unknown ? `<span class="chip c-n">inköpspris okänt</span>` : x && x.qty > 0 ? chip((m * x.qty - x.cost) / x.cost * 100) + ` <span class="xs mut">köpt ${kr(x.cost)}</span>` : `<span class="xs mut">${eur(m)} · ${esc(it.valuation.mid.basis)}</span>`}<div class=alerts>${it.order && !it.order.delivered ? `<span class="chip c-acc">${esc(it.order.badge)}</span>` : ""}${alertChips(it)}</div></div></div>
  ${it.valuation.conservative ? `<div class=range style="padding:10px 0 0">${[["conservative", "Försiktig"], ["mid", "Mitten"], ["high", "Hög"]].map(([k, l]) => `<div><span>${l}</span><b>${kr(val(it, k))}</b></div>`).join("")}</div>` : ""}
  <div class="card" style="margin-top:14px">${details(it, true)}</div>${foot()}`;
}
const foot = () => `<p class=foot>Valutor (ECB-referens): ${Object.entries(P.rates).map(([k, v]) => `1 ${k} = ${v} SEK`).join(" · ")}. Värden är uppskattningar från annonser och trender, inte bekräftade försäljningar. Produktbilder tillhör respektive rättighetsinnehavare.</p>`;

// ---------- routing ----------
const VIEWS = {oversikt: ["Översikt", "home", vOverview], deals: ["Deals", "tag", vDeals], auktioner: ["Auktioner", "gavel", vAuctions], samling: ["Samling", "box", vCollection], bevakning: ["Bevakning", "eye", vWatch]};
function nav() {
  const cur = (location.hash.slice(1) || "oversikt"), cnt = {deals: P.items.flatMap(offersOf).filter(o => o.deal).length, auktioner: auctions().filter(a => a.live).length};
  const links = (cls) => Object.entries(VIEWS).map(([k, [n, i]]) => `<a href="#${k}" class="${cur === k ? "on" : ""}">${ic(i, cls ? 22 : 20)}<span>${n}</span>${!cls && cnt[k] ? `<span class=cnt>${cnt[k]}</span>` : cls && k === "deals" && cnt[k] ? `<span class=dot>${cnt[k]}</span>` : ""}</a>`).join("");
  document.getElementById("tabbar").innerHTML = links(true);
  document.getElementById("side").innerHTML = `<div class=brand><span class=logo>${ic("box", 18)}</span>Samlarportfölj</div>` + links(false);
}
function route() {
  if (!P) return; const hsh = location.hash.slice(1);
  if (hsh.startsWith("item/")) { nav(); document.getElementById("app").innerHTML = `<div class=view>${vItem(decodeURIComponent(hsh.slice(5)))}</div>`; return; }
  const k = VIEWS[hsh] ? hsh : hsh === "lotter" ? "auktioner" : hsh === "kort" ? "samling" : "oversikt"; nav();
  document.getElementById("app").innerHTML = `<div class=view>${VIEWS[k][2]()}</div>`;
}
window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });
fetch("data.json?v=" + Date.now(), {cache: "no-store"}).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
  .then(d => { P = d; R = {SEK: 1, ...P.rates}; DS = P.deal_settings; AF = P.auction_fees || {}; ITEMS = Object.fromEntries(P.items.map(i => [i.id, i])); route(); })
  .catch(e => { document.getElementById("app").innerHTML = `<div class="card empty r">Kunde inte ladda data.json (${esc(e.message)}).</div>`; });
