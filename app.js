// Renderar dashboarden från data.json (klientsidan). Svenska UI.
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = (v, d = 0) => v.toLocaleString("sv-SE", {minimumFractionDigits: d, maximumFractionDigits: d});
let P, R, DS, AF;
const sek = (pr, cur) => R[cur] != null ? pr * R[cur] : null;
const kr = v => v == null ? "–" : fmt(v) + " kr";
const eur = v => "€" + fmt(v / R.EUR);
const pct = (a, b) => `${a >= b ? "+" : "−"}${fmt(Math.abs((a - b) / b * 100))} %`;
const money = (pr, cur) => cur === "SEK" ? kr(pr) : `${fmt(pr, 2)} ${cur}` + (sek(pr, cur) ? ` <span class=m>(${kr(sek(pr, cur))})</span>` : "");
const TYPES = {trend: "trend", listing: "annons", sold: "såld", bid: "bud"};
const COL = {trend: "#38bdf8", listing: "#a78bfa", sold: "#4ade80", bid: "#fbbf24"};
const day = s => new Date(s + "T00:00:00").getTime() / 864e5;

function chart(it, w = 520, h = 170, pad = 38) {
  const pts = it.snapshots.filter(s => !s.approx && sek(s.price, s.currency)).map(s => [day(s.date), sek(s.price, s.currency), s]);
  if (pts.length < 2) return '<div class=m>För få daterade punkter för graf ännu.</div>';
  const d0 = Math.min(...pts.map(p => p[0])), d1 = Math.max(...pts.map(p => p[0])), span = Math.max(d1 - d0, 1);
  const vals = pts.map(p => p[1]); if (it.purchase_price_sek) vals.push(it.purchase_price_sek);
  const lo = Math.min(...vals) * .9, hi = Math.max(...vals) * 1.05;
  const X = d => pad + (d - d0) / span * (w - pad - 10), Y = v => h - 22 - (v - lo) / (hi - lo) * (h - 34);
  let g = `<svg viewBox="0 0 ${w} ${h}">`;
  for (const v of [lo, (lo + hi) / 2, hi]) g += `<line x1=${pad} x2=${w - 10} y1=${Y(v)} y2=${Y(v)} stroke="#334155"/><text x=2 y=${Y(v) + 4} class=ax>${(v / 1000).toFixed(1)}k</text>`;
  if (it.purchase_price_sek) { const y = Y(it.purchase_price_sek); g += `<line x1=${pad} x2=${w - 10} y1=${y} y2=${y} stroke="#f87171" stroke-dasharray="4 4"/><text x=${w - 95} y=${y - 4} class=ax fill="#f87171">köpt ${it.purchase_price_sek} kr</text>`; }
  for (const t in TYPES) {
    const ser = pts.filter(p => p[2].type === t).sort((a, b) => a[0] - b[0]);
    if (t === "trend" && ser.length > 1) g += `<polyline fill=none stroke-width=2 stroke="${COL[t]}" points="${ser.map(p => X(p[0]) + "," + Y(p[1])).join(" ")}"/>`;
    for (const [a, b, s] of ser) g += `<circle cx=${X(a)} cy=${Y(b)} r=4 fill="${COL[t]}"><title>${s.date} ${esc(s.source)} ${TYPES[t]}: ${kr(b)}</title></circle>`;
  }
  const iso = d => new Date(d * 864e5).toISOString().slice(0, 10);
  return g + `<text x=${pad} y=${h - 4} class=ax>${iso(d0)}</text><text x=${w - 80} y=${h - 4} class=ax>${iso(d1)}</text></svg>`;
}

const GROUPS = [["Cardmarket", ["cardmarket", "packquant"]], ["TCGplayer", ["tcgplayer"]], ["Tradera", ["tradera"]],
  ["Svenska butiker", ["pokejakt", "dragon", "hobbykort", "kortarkivet", "manatorsk"]], ["eBay", ["ebay"]], ["Aukro", ["aukro"]], ["Övriga EU-butiker", ["butiker eu", "pokeschnapp"]]];
function compare(it) {
  const cells = GROUPS.map(([g, keys]) => {
    const ss = it.snapshots.filter(s => keys.some(k => s.source.toLowerCase().includes(k))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
    return "<td>" + (ss.map(s => `<div><a href="${esc(s.url)}">${money(s.price, s.currency)}</a> <span class=m>${TYPES[s.type]} · ${s.date}${s.approx ? "~" : ""}${s.note ? " · " + esc(s.note) : ""}</span></div>`).join("") || "<span class=m>ingen data</span>") + "</td>";
  }).join("");
  const com = (it.community || []).map(c => `<div><a href="${esc(c.url)}">${esc(c.label)}</a><br><span class=m>${esc(c.takeaway)}</span></div>`).join("") || "<span class=m>inga relevanta trådar hittade</span>";
  return `<div class=scroll><table><tr>${GROUPS.map(g => `<th>${g[0]}</th>`).join("")}<th>Forum &amp; community</th></tr><tr>${cells}<td>${com}</td></tr></table></div>`;
}

const landed = o => { const r = R[o.currency]; if (r == null) return null; let b = (o.price + (o.shipping || 0)) * r;
  if (o.origin === "non-EU") b = b * (1 + DS.customs_pct / 100) * (1 + DS.import_vat_pct / 100) + DS.non_eu_handling_fee_sek; return b; };
const bench = it => { const t = it.snapshots.filter(s => s.type === "trend" && s.source.toLowerCase().includes("cardmarket") && !s.approx);
  if (!t.length) return [null, null]; const s = t.reduce((a, b) => b.date > a.date ? b : a); return [sek(s.price, s.currency), s]; };
const OH = "<tr><th>Erbjudande</th><th>Objekt</th><th>Pris</th><th>Landat (SEK)</th><th>Mot CM-trend</th><th>Säljbetyg</th><th>Språk</th><th>Risk &amp; noter</th></tr>";
function offerRows(it, onlyDeals) {
  const [b] = bench(it); const offers = it.offers || []; if (!offers.length || b == null) return [];
  const latest = offers.map(o => o.date).sort().pop();
  return [...offers].sort((a, c) => c.date.localeCompare(a.date)).flatMap(o => {
    const L = landed(o), d = L ? (b - L) / b * 100 : null;
    const deal = d != null && d >= DS.threshold_pct && o.date === latest && o.in_stock !== false;
    if (onlyDeals && !deal) return [];
    const risk = [];
    if (o.shipping == null) risk.push("frakt okänd (räknad som 0)");
    if (o.in_stock == null) risk.push("lagerstatus okänd"); if (o.in_stock === false) risk.push("ej i lager");
    if (o.origin === "non-EU") risk.push("icke-EU: moms/tull/avgift");
    if (["okänt", "alla språk"].includes(o.language)) risk.push("språk okänt");
    if (!o.seller_rating) risk.push("säljbetyg ej synligt");
    if (["tradera", "ebay", "cardmarket", "aukro"].some(k => o.source.toLowerCase().includes(k))) risk.push("privatsäljare möjlig: kontrollera försegling (reseal/fake)");
    const dt = d == null ? "–" : d >= 0 ? `${fmt(d)} % under` : `${fmt(-d)} % över`;
    return [`<tr><td>${deal ? "<b class=g>DEAL</b> " : ""}<a href="${esc(o.url)}">${esc(o.source)}</a><br><span class=m>${esc(o.seller)} · ${o.origin} · ${o.date}</span></td>
      <td>${onlyDeals ? esc(it.name) : ""}</td><td>${money(o.price, o.currency)}${o.shipping ? `<br><span class=m>+frakt ${money(o.shipping, o.currency)}</span>` : ""}</td><td>${kr(L)}</td>
      <td class="${d > 0 ? "g" : "r"}">${dt}</td><td>${esc(o.seller_rating || "–")}</td><td class=m>${esc(o.language)}</td><td class=m>${esc(risk.join(", "))}${o.notes ? "<br>" + esc(o.notes) : ""}</td></tr>`];
  });
}
function dealsHtml() {
  const rows = P.items.flatMap(i => offerRows(i, true));
  return `<section class="item deals"><h2 style="margin-top:0">Deals (≥ ${DS.threshold_pct} % under Cardmarket-trend)</h2>${rows.length ? `<div class=scroll><table>${OH}${rows.join("")}</table></div>` : "<p>Inga erbjudanden under tröskeln just nu.</p>"}<p class=m>${esc(DS.notes)}</p></section>`;
}
function aucLanded(a) {
  const f = AF[a.platform] || {premium_pct: 0, fixed: 0, currency: "SEK"}; let v = sek(a.price, a.currency); if (v == null) return null;
  v = v * (1 + f.premium_pct / 100) + sek(f.fixed, f.currency) + (a.shipping ? sek(a.shipping, a.currency) : 0);
  if (a.platform.endsWith("UK")) v *= 1 + DS.import_vat_pct / 100; return v;
}
function auctionsHtml() {
  const now = P.last_updated, soonLim = new Date(day(now) * 864e5 + 2 * 864e5).toISOString().slice(0, 10);
  const items = Object.fromEntries(P.items.map(i => [i.id, i]));
  const live = (P.auctions || []).filter(a => a.ends_at.slice(0, 10) >= now).sort((a, b) => a.ends_at.localeCompare(b.ends_at));
  const rows = live.map(a => {
    const L = aucLanded(a), q = a.qty || 1, per = L ? L / q : null, b = a.item_id ? bench(items[a.item_id])[0] : null;
    const c = !(b && per) ? "–" : per < b ? `<span class=g>${fmt((b - per) / b * 100)} % under</span>` : `<span class=r>${fmt((per - b) / b * 100)} % över</span>`;
    return `<tr><td>${a.ends_at.replace("T", " ")}${a.ends_at.slice(0, 10) <= soonLim ? " <b class=r>snart</b>" : ""}</td><td><b>${esc(a.platform)}</b></td><td><a href="${esc(a.url)}">${esc(a.title)}</a>${q > 1 ? " ×" + q : ""}</td>
      <td>${money(a.price, a.currency)}<br><span class=m>${esc(a.price_kind)}</span></td><td>${a.estimate ? money(a.estimate, a.currency) : "–"}</td><td>${kr(L)}${q > 1 ? `<br><span class=m>${kr(per)}/st</span>` : ""}</td><td>${c}</td><td class=m>${esc(a.notes)}</td></tr>`;
  });
  const fees = Object.entries(AF).map(([k, v]) => `<a href="${esc(v.source)}">${esc(k)}</a>: ${v.premium_pct} % + ${v.fixed} ${v.currency}`).join(" · ");
  const mw = (P.market_watch || []).map(m => `<li><b>${esc(m.platform)}</b>: <a href="${esc(m.url)}">${esc(m.title)}</a>${m.price ? " – " + kr(sek(m.price, m.currency)) : ""} <span class=m>· ${m.date_seen} · ${esc(m.notes)}</span></li>`).join("");
  return `<section class=item><h2 style="margin-top:0">På auktion nu</h2><div class=m>Sett ${now}. Bud ändras – kontrollera innan budgivning. Landat = bud × (1+provision) + fast avgift + ev. frakt (+25 % importmoms för UK-hus).</div>
    ${rows.length ? `<div class=scroll><table><tr><th>Slutar</th><th>Plattform</th><th>Objekt</th><th>Aktuellt</th><th>Värdering</th><th>Landat inkl. avgifter</th><th>Mot CM-trend</th><th>Noter</th></tr>${rows.join("")}</table></div>` : "<p>Inga pågående auktioner hittade.</p>"}
    <p class=m>Avgifter: ${fees}. Tradera-procenten är observerad, ej officiell.</p><h3>Övrigt att bevaka</h3><ul>${mw}</ul></section>`;
}
const val = (i, k) => { const v = i.valuation[k] || i.valuation.mid; return sek(v.price, v.currency); };
const card = (t, v, s = "") => `<div class=card><div class=m>${t}</div><div class=big>${v}</div><div class=m>${s}</div></div>`;
function section(i) {
  const own = i.status === "owned", c = i.purchase_price_sek;
  const vs = [["conservative", "Försiktig"], ["mid", "Mitten"], ["high", "Hög"]].filter(([k]) => own || k === "mid").map(([k, l]) => {
    const v = val(i, k), basis = (i.valuation[k] || i.valuation.mid).basis;
    return `<div class=card><div class=m>${l} · ${esc(basis)}</div><div class=big>${kr(v)}</div><div class=m>${eur(v)}${c ? ` · <b class=${v >= c ? "g" : "r"}>${pct(v, c)}</b>` : ""}</div></div>`; }).join("");
  const msrp = i.msrp ? ` · MSRP <a href="${esc(i.msrp.url)}">${money(i.msrp.price, i.msrp.currency)}</a>` : "";
  const legend = Object.keys(TYPES).map(t => `<span style="color:${COL[t]}">● ${TYPES[t]}</span>`).join(" ");
  const rows = offerRows(i, false); const [b, bs] = bench(i);
  const offers = rows.length ? `<details open style="margin-top:12px"><summary>Erbjudanden (${rows.length}) · riktmärke ${kr(b)} (CM-trend ${bs.date})</summary><div class=scroll><table>${OH}${rows.join("")}</table></div></details>` : '<div class=m style="margin-top:10px">Inga sparade erbjudanden.</div>';
  return `<section class=item><h3>${esc(i.name)}</h3><div class=m>${esc(i.category)} · språk: ${esc(i.language)} · antal ${i.quantity}${c ? " · köpt för " + kr(c) : ""}${msrp}</div>
    <p>${esc(i.notes)}</p><div class=row><div class=vals>${vs}</div><div class=chart><div class=m>Prishistorik i SEK (ungefärliga datum endast i tabellen) ${legend}</div>${chart(i)}</div></div>${compare(i)}${offers}</section>`;
}
function render() {
  R = {SEK: 1, ...P.rates}; DS = P.deal_settings; AF = P.auction_fees || {};
  const owned = P.items.filter(i => i.status === "owned"), watch = P.items.filter(i => i.status === "watchlist");
  const cost = owned.reduce((s, i) => s + i.purchase_price_sek * i.quantity, 0);
  const tot = k => owned.reduce((s, i) => s + val(i, k) * i.quantity, 0);
  const rates = Object.entries(P.rates).map(([k, v]) => `1 ${k} = ${v} SEK`).join(" · ");
  document.getElementById("app").innerHTML = `<h1>Samlarportfölj</h1><div class=m>Senast uppdaterad ${esc(P.last_updated)} · ${rates} (ECB-referens) · endast källbelagda priser · ~ = ungefärligt datum</div>
    <div class=cards>${card("Anskaffningsvärde", kr(cost), eur(cost))}${card("Värde (mitten)", kr(tot("mid")), eur(tot("mid")))}
    ${card("Vinst (mitten)", `<span class=${tot("mid") >= cost ? "g" : "r"}>${kr(tot("mid") - cost)}</span>`, pct(tot("mid"), cost))}${card("Värdespann", `${kr(tot("conservative"))} – ${kr(tot("high"))}`, "försiktig – hög")}</div>
    ${dealsHtml()}${auctionsHtml()}<h2>Innehav</h2>${owned.map(section).join("")}<h2>Bevakningslista</h2>${watch.map(section).join("")}
    <p class=m>Värden är uppskattningar från annonser/trender, inte bekräftade försäljningar. Avgifter och frakt ej avdragna i portföljvärdet.</p>`;
}
fetch("data.json?v=" + Date.now(), {cache: "no-store"}).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(d => { P = d; render(); }).catch(e => { document.getElementById("app").innerHTML = `<p class=r>Kunde inte ladda data.json (${esc(e.message)}).</p>`; });
