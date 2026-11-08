/* SIM Desk — single-page interface (no build step). */
const S = {
  lang: localStorage.getItem("lang") || "fr",
  settings: {}, status: {}, clients: [],
  rc: { number: "", feed: [], busy: false, batch: [], sale: { description: "", total: "", paid: "", client: null, sim: "" }, lastText: "" },
};
const t = (k) => (I18N[S.lang] && I18N[S.lang][k]) || I18N.fr[k] || k;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => `<span class="num">${Math.round(Number(n) || 0).toLocaleString("fr-FR")} ${esc(S.settings.currency || "DA")}</span>`;
const hm = (ts) => (ts || "").slice(11, 16);
const dmy = (ts) => { const d = (ts || "").slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}/${d[1]}` : ""; };
const initials = (n) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/* When opened from GitHub Pages, the interface talks to the SIM Desk server running on the shop PC. */
const CFG = window.SIMDESK || {};
const REMOTE = !!CFG.remote;
const serverUrl = () => (localStorage.getItem("server") || CFG.server || "http://localhost:8765").trim().replace(/\/+$/, "");
const accessKey = () => localStorage.getItem("key") || "";

async function api(path, method = "GET", body, quiet) {
  const headers = { "Content-Type": "application/json" };
  if (REMOTE) headers["X-SimDesk-Key"] = accessKey();
  let res;
  try {
    res = await fetch((REMOTE ? serverUrl() : "") + "/api" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    if (REMOTE && !quiet) showConnect("unreachable");
    else if (!quiet) toast(t("err_unreachable"), "err");
    throw new Error("unreachable");
  }
  if (res.status === 401 && REMOTE) { if (!quiet) showConnect("bad_key"); throw new Error("bad_key"); }
  const j = await res.json().catch(() => ({ ok: false, error: "network" }));
  if (!j.ok) { const msg = t("err_" + j.error) !== "err_" + j.error ? t("err_" + j.error) : j.error; toast(msg, "err"); throw new Error(j.error); }
  return j.data;
}

function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind; el.textContent = msg;
  $("#toasts").appendChild(el); setTimeout(() => el.remove(), 3800);
}
function modal(html) { $("#modalCard").innerHTML = html; $("#modal").classList.remove("hidden"); }
function closeModal() { $("#modal").classList.add("hidden"); }
$("#modal").addEventListener("mousedown", (e) => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

/* ---------------- icons & nav ---------------- */
const IC = {
  recharge: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  clients: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  register: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/><path d="M6 6V4h12v2"/>',
  suppliers: '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`;
const PAGES = ["recharge", "dashboard", "clients", "register", "suppliers", "settings"];

function renderShell() {
  document.documentElement.lang = S.lang;
  document.documentElement.dir = S.lang === "ar" ? "rtl" : "ltr";
  $("#langBtn").textContent = S.lang === "ar" ? "Français" : "العربية";
  $("#shopName").textContent = S.settings.shop_name || "SIM Desk";
  const cur = (location.hash.slice(1) || "recharge").split("/")[0];
  $("#nav").innerHTML = PAGES.map((p) => `<a href="#${p}" class="${p === cur ? "active" : ""}">${svg(p)}<span>${t("nav_" + p)}</span></a>`).join("");
  const st = S.status;
  let cls = "off", label = t("not_linked");
  if (st.mode === "demo") { cls = "demo"; label = t("demo_badge"); }
  else if (st.authorized && st.bot_ok) { cls = "on"; label = `${t("bot_ready")} · ${st.bot}`; }
  else if (st.authorized) { label = t("bot_missing"); }
  $("#botBadge").innerHTML = `<span class="dot ${cls}"></span><span>${esc(label)}</span>`;
}
$("#langBtn").onclick = () => setLang(S.lang === "ar" ? "fr" : "ar");
function setLang(l) { S.lang = l; localStorage.setItem("lang", l); route(); }

async function refreshStatus() {
  try { S.status = await api("/bot/status"); } catch { S.status = {}; }
}

async function route() {
  if (S.offline) return showConnect("");
  const page = (location.hash.slice(1) || "recharge").split("/")[0];
  renderShell();
  const v = $("#view");
  const fn = { recharge: pageRecharge, dashboard: pageDashboard, clients: pageClients, register: pageRegister, suppliers: pageSuppliers, settings: pageSettings }[page] || pageRecharge;
  await fn(v);
}
window.addEventListener("hashchange", route);

/* ---------------- RECHARGE (talks to the bot) ---------------- */
const OPS = { "06": "Mobilis", "07": "Djezzy", "05": "Ooredoo" };
const opOf = (n) => { const d = n.replace(/\D/g, ""); const k = d.startsWith("213") ? "0" + d.slice(3, 4) : d.slice(0, 2); return d.length >= 2 ? OPS[k] || t("other") : ""; };
const AMOUNT_RE = /(\d[\d\s.,]*)\s*(?:DA|DZD|دج|دينار)/i;
const parseAmount = (s) => { const m = String(s || "").match(AMOUNT_RE); return m ? Number(m[1].replace(/[\s.,]/g, "")) : null; };
const stripEmoji = (s) => s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️]/gu, "").trim();

async function pageRecharge(v) {
  const r = S.rc;
  v.innerHTML = `
  <div class="recharge">
    <div>
      <form class="lookup" id="lookupForm" autocomplete="off">
        <label>${t("sim_number")}</label>
        <div class="lookup-row">
          <input class="big-input" id="simInput" inputmode="tel" placeholder="06 XX XX XX XX" value="${esc(r.number)}">
          <button class="ok-btn" id="okBtn" ${r.busy ? "disabled" : ""}>${t("ok")}</button>
        </div>
        <span class="op-tag" id="opTag"></span>
      </form>
      <div class="feed" id="feed"></div>
    </div>
    <div class="sale-panel">
      <div class="card" id="salePanel"></div>
      <div class="card" style="margin-top:16px"><h2>${t("today_ops")}</h2><div class="list" id="todayList"></div></div>
    </div>
  </div>`;
  const inp = $("#simInput");
  const showOp = () => { const o = opOf(inp.value); const tag = $("#opTag"); tag.textContent = o; tag.className = "op-tag " + (o ? "op-" + o : "hidden"); };
  inp.addEventListener("input", () => { r.number = inp.value; showOp(); });
  showOp();
  $("#lookupForm").onsubmit = (e) => { e.preventDefault(); lookup(); };
  if (!r.feed.length) inp.focus();
  renderFeed(); renderSalePanel(); loadToday();
}

async function lookup() {
  const r = S.rc;
  const num = r.number.replace(/[^\d+]/g, "");
  if (num.length < 6) return toast(t("err_invalid_number"), "err");
  r.feed = []; r.batch = [];
  r.sale = { description: "", total: "", paid: "", client: r.sale.client, sim: num };
  renderSalePanel();
  await talk(() => api("/bot/lookup", "POST", { number: num }));
}

async function talk(call, stepLabel) {
  const r = S.rc;
  if (r.busy) return;
  r.busy = true;
  if (stepLabel) r.feed.push({ step: stepLabel });
  r.feed.push({ loading: true });
  renderFeed(); setBusy(true);
  try {
    const res = await call();
    r.feed = r.feed.filter((x) => !x.loading);
    if (res.notice) r.feed.push({ notice: res.notice });
    const msgs = res.messages || [];
    if (!msgs.length) r.feed.push({ empty: true });
    r.batch = msgs.map((m) => m.id);
    for (const m of msgs) {
      const i = r.feed.findIndex((x) => x.msg && x.msg.id === m.id);
      if (i >= 0) r.feed[i] = { msg: m }; else r.feed.push({ msg: m });
      r.lastText = m.text;
      afterBotMessage(m);
    }
  } catch (e) {
    r.feed = r.feed.filter((x) => !x.loading);
  }
  r.busy = false; setBusy(false); renderFeed();
}
function setBusy(b) { const ok = $("#okBtn"); if (ok) ok.disabled = b; }

function afterBotMessage(m) {
  const kind = classify(m.text);
  if (kind === "success") {
    const amt = parseAmount((m.text.match(/(montant|amount|المبلغ|prix|total)[^\n]*/i) || [""])[0]) ?? parseAmount(m.text);
    if (amt && !S.rc.sale.total) { S.rc.sale.total = amt; S.rc.sale.paid = amt; }
    renderSalePanel(true);
  }
}

function classify(text) {
  if (/✅|réussi|succès|effectué|success|done|تم\s|بنجاح/i.test(text)) return "success";
  if (/❌|⛔|échec|erreur|invalide|error|failed|insuffisant|فشل|خطأ/i.test(text)) return "error";
  return "";
}

function renderBotCard(m, active) {
  const kind = classify(m.text);
  const lines = m.text.split("\n").map((l) => l.trim());
  let head = "";
  const firstIdx = lines.findIndex((l) => l);
  if (firstIdx >= 0 && !/^[^:：]{1,40}[:：]\s*\S/.test(lines[firstIdx]) && lines[firstIdx].length < 70) { head = lines[firstIdx]; lines.splice(firstIdx, 1); }
  let body = "", kv = "", para = [];
  const flush = () => {
    if (kv) { body += `<div class="kv">${kv}</div>`; kv = ""; }
    if (para.length) { body += `<p class="para">${esc(para.join("\n"))}</p>`; para = []; }
  };
  for (const l of lines) {
    const mm = l.match(/^([^:：]{1,40}?)\s*[:：]\s*(.+)$/);
    if (mm && !/https?$/i.test(mm[1])) {
      if (para.length) flush();
      kv += `<div class="k">${esc(mm[1])}</div><div class="v copy" title="copier" data-copy="${esc(mm[2])}">${esc(mm[2])}</div>`;
    } else if (l) { if (kv) flush(); para.push(l); }
  }
  flush();
  const btns = (m.buttons || []).flat();
  const choices = btns.length ? `<div class="choices">${btns.map((b) => {
    const price = parseAmount(b.text);
    const label = price ? b.text.replace(AMOUNT_RE, "").trim() : b.text;
    const c = /annul|cancel|retour|إلغاء|رجوع|❌/i.test(b.text) ? "cancel" : /confirm|valider|oui|✅|تأكيد|نعم/i.test(b.text) ? "confirm" : "";
    return `<button class="choice ${c}" ${active ? "" : "disabled"} data-msg="${m.id}" data-r="${b.r}" data-c="${b.c}" ${b.url ? `data-url="${esc(b.url)}"` : ""} data-label="${esc(b.text)}">${esc(label)}${price ? `<span class="price num">${price.toLocaleString("fr-FR")} ${esc(S.settings.currency || "DA")}</span>` : ""}</button>`;
  }).join("")}</div>` : "";
  return `<div class="botcard ${kind}"><div class="bc-head">${esc(head || t("bot_said"))}</div>${body ? `<div class="bc-body">${body}</div>` : ""}${choices}</div>`;
}

function renderFeed() {
  const f = $("#feed"); if (!f) return;
  const r = S.rc;
  if (!r.feed.length) { f.innerHTML = `<div class="hint">${t("lookup_hint")}</div>`; return; }
  let html = r.feed.map((x) => {
    if (x.loading) return `<div class="card loader"><div class="spin"></div>${t("waiting_bot")}</div>`;
    if (x.step) return `<div><span class="pill accent">→ ${esc(x.step)}</span></div>`;
    if (x.notice) return `<div class="notice">${esc(x.notice)}</div>`;
    if (x.empty) return `<div class="card loader">${t("no_reply")} <button class="btn sm" id="refreshBtn">${t("refresh")}</button></div>`;
    return renderBotCard(x.msg, !r.busy && r.batch.includes(x.msg.id));
  }).join("");
  if (!r.busy) html += `
    <form class="reply-row" id="replyForm" autocomplete="off">
      <input class="input" id="replyInput" placeholder="${t("reply_bot")}">
      <button class="btn">${t("send")}</button>
      <button type="button" class="btn ghost" id="refreshBtn2" title="${t("refresh")}">↻</button>
      <button type="button" class="btn ghost" id="newOpBtn">${t("new_op")}</button>
    </form>`;
  f.innerHTML = html;
  $$(".choice", f).forEach((b) => b.onclick = () => {
    if (b.dataset.url) return window.open(b.dataset.url, "_blank");
    const label = b.dataset.label;
    const price = parseAmount(label);
    if (!/annul|cancel|retour|confirm|valider|إلغاء|تأكيد|❌|✅/i.test(label)) {
      S.rc.sale.description = stripEmoji(label);
      if (price) { S.rc.sale.total = price; S.rc.sale.paid = price; }
      renderSalePanel();
    }
    talk(() => api("/bot/click", "POST", { msg_id: +b.dataset.msg, row: +b.dataset.r, col: +b.dataset.c }), stripEmoji(label));
  });
  $$("[data-copy]", f).forEach((el) => el.onclick = () => { navigator.clipboard?.writeText(el.dataset.copy); toast("✓ " + el.dataset.copy); });
  const rf = () => talk(() => api("/bot/latest"));
  $("#refreshBtn") && ($("#refreshBtn").onclick = rf);
  $("#refreshBtn2") && ($("#refreshBtn2").onclick = rf);
  $("#replyForm") && ($("#replyForm").onsubmit = (e) => { e.preventDefault(); const v = $("#replyInput").value.trim(); if (v) talk(() => api("/bot/send", "POST", { text: v }), v); });
  $("#newOpBtn") && ($("#newOpBtn").onclick = () => { S.rc.feed = []; S.rc.number = ""; S.rc.sale = { description: "", total: "", paid: "", client: null, sim: "" }; route(); });
  const last = f.lastElementChild; last && last.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderSalePanel(flash) {
  const p = $("#salePanel"); if (!p) return;
  const s = S.rc.sale;
  const rest = Math.max(0, (Number(s.total) || 0) - (Number(s.paid === "" ? s.total : s.paid) || 0));
  p.innerHTML = `
    <h2>${t("record_sale")}</h2>
    <div class="field"><label>${t("description")}</label><input class="input" id="sDesc" value="${esc(s.description)}"></div>
    <div class="row">
      <div class="field"><label>${t("amount")}</label><input class="input num" id="sTotal" inputmode="decimal" value="${esc(s.total)}"></div>
      <div class="field"><label>${t("paid")}</label><input class="input num" id="sPaid" inputmode="decimal" value="${esc(s.paid)}"></div>
    </div>
    <div class="field"><label>${t("client")}</label>${clientCombo(s.client)}</div>
    <div class="debt-preview ${rest > 0 ? "has" : ""}"><span>${t("rest")}</span>${money(rest)}</div>
    <button class="btn primary" style="width:100%" id="sSave">${t("save")}</button>`;
  if (flash) { p.animate([{ boxShadow: "0 0 0 4px rgba(18,161,80,.35)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1400 }); }
  const sync = () => { s.description = $("#sDesc").value; s.total = $("#sTotal").value; s.paid = $("#sPaid").value; };
  $("#sDesc").oninput = sync;
  $("#sTotal").oninput = () => { const old = s.total; sync(); if (String(s.paid) === String(old) || s.paid === "") { s.paid = s.total; $("#sPaid").value = s.total; } updRest(); };
  $("#sPaid").oninput = () => { sync(); updRest(); };
  const updRest = () => { const rr = Math.max(0, (Number(s.total) || 0) - (Number(s.paid === "" ? s.total : s.paid) || 0)); const d = $(".debt-preview", p); d.className = "debt-preview " + (rr > 0 ? "has" : ""); d.lastElementChild.outerHTML = money(rr); };
  bindCombo(p, (c) => { s.client = c; });
  $("#sSave").onclick = async () => {
    sync();
    await api("/sales", "POST", { total: s.total, paid: s.paid === "" ? s.total : s.paid, client_id: s.client?.id, description: s.description, sim_number: s.sim || S.rc.number.replace(/\D/g, ""), bot_reply: S.rc.lastText });
    toast(t("sale_saved"), "ok");
    S.rc.sale = { description: "", total: "", paid: "", client: null, sim: s.sim };
    renderSalePanel(); loadToday();
  };
}

function clientCombo(sel) {
  return `<div class="combo"><input class="input" id="cSearch" placeholder="${t("walk_in")}" value="${esc(sel ? sel.name : "")}"><div class="combo-list hidden" id="cList"></div></div>`;
}
function bindCombo(root, onPick) {
  const inp = $("#cSearch", root), list = $("#cList", root);
  const show = async () => {
    S.clients = await api("/clients?q=" + encodeURIComponent(inp.value.trim()));
    const q = inp.value.trim();
    list.innerHTML = `<div data-id="">${t("walk_in")}</div>` + S.clients.slice(0, 30).map((c) => `<div data-id="${c.id}"><span>${esc(c.name)} <span class="sub">${esc(c.phone)}</span></span>${c.debt > 0 ? `<span class="pill red">${money(c.debt)}</span>` : ""}</div>`).join("")
      + (q ? `<div data-new="1">+ ${t("new_client")} : <b>${esc(q)}</b></div>` : "");
    list.classList.remove("hidden");
  };
  inp.onfocus = show; inp.oninput = () => { onPick(null); show(); };
  inp.onblur = () => setTimeout(() => list.classList.add("hidden"), 180);
  list.onmousedown = async (e) => {
    const d = e.target.closest("div[data-id],div[data-new]"); if (!d) return;
    e.preventDefault();
    if (d.dataset.new) {
      const { id } = await api("/clients", "POST", { name: inp.value.trim() });
      const c = { id, name: inp.value.trim() }; onPick(c); toast(t("saved"), "ok");
    } else {
      const c = S.clients.find((x) => String(x.id) === d.dataset.id) || null;
      onPick(c); inp.value = c ? c.name : "";
    }
    list.classList.add("hidden"); inp.blur();
  };
}

async function loadToday() {
  const el = $("#todayList"); if (!el) return;
  const today = new Date().toLocaleDateString("sv-SE");
  const sales = await api("/sales?day=" + today);
  if (!document.body.contains(el)) return;
  el.innerHTML = sales.length ? sales.map(saleItem).join("") : `<div class="empty">${t("nothing")}</div>`;
}
function saleItem(s) {
  const debt = s.total - s.paid;
  return `<div class="item"><div class="grow"><div class="t">${esc(s.description || s.kind || t("sale"))}</div>
    <div class="s"><span class="num">${esc(s.sim_number)}</span> · ${esc(s.client_name || t("walkin_short"))} · ${hm(s.ts)}</div></div>
    <div style="text-align:end">${money(s.total)}${debt > 0.001 ? `<div><span class="pill red">${money(debt)}</span></div>` : ""}</div></div>`;
}

/* ---------------- DASHBOARD ---------------- */
async function pageDashboard(v) {
  const d = await api("/dashboard");
  const max = Math.max(1, ...d.week.map((w) => Math.max(w.total_in, w.total_out)));
  v.innerHTML = `
  <div class="page-head"><h1>${t("nav_dashboard")}</h1><span class="sub">${t("today")} · ${dmy(d.day)}</span></div>
  <div class="kpis">
    <div class="kpi accent"><div class="l">${t("kpi_sales")} (${d.sales_count})</div><div class="v">${money(d.sales_total)}</div></div>
    <div class="kpi"><div class="l">${t("kpi_drawer")}</div><div class="v">${money(d.drawer)}</div></div>
    <div class="kpi"><div class="l">${t("kpi_in")}</div><div class="v amt-in">${money(d.total_in)}</div></div>
    <div class="kpi"><div class="l">${t("kpi_out")}</div><div class="v amt-out">${money(d.total_out)}</div></div>
    <div class="kpi"><div class="l">${t("kpi_debts")}</div><div class="v">${money(d.clients_debt)}</div></div>
    <div class="kpi"><div class="l">${t("kpi_owed")}</div><div class="v">${money(d.suppliers_owed)}</div></div>
  </div>
  <div class="grid g2">
    <div class="card"><h2>${t("week")}</h2>
      ${d.week.length ? `<div class="bars">${d.week.map((w) => `<div class="bar-col"><div class="bar-pair">
        <div class="bar in" style="height:${(w.total_in / max) * 100}%" title="${w.total_in}"></div>
        <div class="bar out" style="height:${(w.total_out / max) * 100}%" title="${w.total_out}"></div></div><span class="num">${dmy(w.day)}</span></div>`).join("")}</div>
        <div class="legend"><span><i style="background:var(--accent)"></i>${t("kpi_in")}</span><span><i style="background:#f1a49d"></i>${t("kpi_out")}</span></div>`
        : `<div class="empty">${t("nothing")}</div>`}
    </div>
    <div class="card"><h2>${t("top_debtors")}</h2><div class="list">
      ${d.top_debtors.length ? d.top_debtors.map((c) => `<div class="item click" data-c="${c.id}"><div class="avatar">${esc(initials(c.name))}</div><div class="grow"><div class="t">${esc(c.name)}</div><div class="s num">${esc(c.phone)}</div></div><span class="pill red">${money(c.debt)}</span></div>`).join("") : `<div class="empty">${t("nothing")}</div>`}
    </div></div>
  </div>
  <div class="card" style="margin-top:16px"><h2>${t("recent")}</h2><div class="list">${d.recent_sales.length ? d.recent_sales.map(saleItem).join("") : `<div class="empty">${t("nothing")}</div>`}</div></div>`;
  $$("[data-c]", v).forEach((el) => el.onclick = () => openClient(+el.dataset.c));
}

/* ---------------- CLIENTS ---------------- */
async function pageClients(v) {
  v.innerHTML = `
  <div class="page-head"><h1>${t("nav_clients")}</h1>
    <div class="row" style="flex:0 1 460px"><input class="input" id="cq" placeholder="${t("search")}"><button class="btn primary" id="cNew" style="flex:none">+ ${t("new_client")}</button></div></div>
  <div class="kpis" id="cKpis"></div>
  <div class="card"><div class="list" id="cl"></div></div>`;
  const load = async () => {
    if (!$("#cl")) return;
    const list = await api("/clients?q=" + encodeURIComponent($("#cq").value.trim()));
    if (!$("#cl")) return;
    const debtors = list.filter((c) => c.debt > 0.001);
    $("#cKpis").innerHTML = `<div class="kpi"><div class="l">${t("nav_clients")}</div><div class="v num">${list.length}</div></div>
      <div class="kpi"><div class="l">${t("kpi_debts")} (${debtors.length})</div><div class="v amt-out">${money(debtors.reduce((a, c) => a + c.debt, 0))}</div></div>`;
    $("#cl").innerHTML = list.length ? list.map((c) => `<div class="item click" data-c="${c.id}"><div class="avatar">${esc(initials(c.name))}</div>
      <div class="grow"><div class="t">${esc(c.name)}</div><div class="s"><span class="num">${esc(c.phone)}</span>${c.last_sale ? ` · ${dmy(c.last_sale)}` : ""}</div></div>
      ${c.debt > 0.001 ? `<span class="pill red">${money(c.debt)}</span>` : `<span class="pill green">${t("clear")}</span>`}</div>`).join("") : `<div class="empty">${t("nothing")}</div>`;
    $$("[data-c]", v).forEach((el) => el.onclick = () => openClient(+el.dataset.c, load));
  };
  $("#cq").oninput = load;
  $("#cNew").onclick = () => editParty("clients", null, load);
  load();
}

function editParty(kind, obj, done) {
  const o = obj || {};
  modal(`<div class="modal-head"><h1>${o.id ? t("edit") : t(kind === "clients" ? "new_client" : "new_supplier")}</h1><button class="btn ghost" onclick="closeModal()">✕</button></div>
    <form id="pf"><div class="field"><label>${t("name")}</label><input class="input" name="name" required value="${esc(o.name)}"></div>
    <div class="field"><label>${t("phone")}</label><input class="input num" name="phone" value="${esc(o.phone)}"></div>
    <div class="field"><label>${t("note")}</label><textarea class="input" name="note" rows="2">${esc(o.note)}</textarea></div>
    <button class="btn primary">${t("save")}</button></form>`);
  $("#pf [name=name]").focus();
  $("#pf").onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    await api(`/${kind}` + (o.id ? `/${o.id}` : ""), o.id ? "PUT" : "POST", data);
    toast(t("saved"), "ok"); closeModal(); done && done();
  };
}

async function openClient(id, onChange) {
  const c = await api("/clients/" + id);
  const hist = [...c.sales.map((s) => ({ ...s, _k: "sale" })), ...c.payments.map((p) => ({ ...p, _k: "pay" }))].sort((a, b) => b.ts.localeCompare(a.ts));
  modal(`<div class="modal-head"><div class="row" style="flex:1"><div class="avatar" style="flex:none">${esc(initials(c.name))}</div><div><h1>${esc(c.name)}</h1><div class="sub num">${esc(c.phone)} ${esc(c.note)}</div></div></div>
      <button class="btn sm" id="edC">${t("edit")}</button><button class="btn ghost" onclick="closeModal()">✕</button></div>
    <div class="kpis"><div class="kpi ${c.debt > 0.001 ? "" : ""}"><div class="l">${t("debt")}</div><div class="v ${c.debt > 0.001 ? "amt-out" : "amt-in"}">${money(c.debt)}</div></div></div>
    ${c.debt > 0.001 ? `<form class="row" id="payF" style="margin-bottom:16px"><input class="input num" name="amount" inputmode="decimal" placeholder="${t("amount")}" value="${Math.round(c.debt)}"><input class="input" name="note" placeholder="${t("note")}"><button class="btn green" style="flex:none">${t("collect")}</button></form>` : ""}
    <h2>${t("history")}</h2>
    <table><tbody>${hist.length ? hist.map((h) => h._k === "sale"
      ? `<tr><td class="num">${dmy(h.ts)} ${hm(h.ts)}</td><td>${esc(h.description || t("sale"))} <span class="sub num">${esc(h.sim_number)}</span></td><td style="text-align:end">${money(h.total)}${h.total - h.paid > 0.001 ? ` <span class="pill red">+${money(h.total - h.paid)}</span>` : ""}</td></tr>`
      : `<tr><td class="num">${dmy(h.ts)} ${hm(h.ts)}</td><td><span class="pill green">${t("payment")}</span> ${esc(h.note)}</td><td style="text-align:end" class="amt-in">−${money(h.amount)}</td></tr>`).join("") : `<tr><td class="empty">${t("nothing")}</td></tr>`}</tbody></table>`);
  $("#edC").onclick = () => editParty("clients", c, () => { onChange && onChange(); openClient(id, onChange); });
  $("#payF") && ($("#payF").onsubmit = async (e) => {
    e.preventDefault();
    await api(`/clients/${id}/pay`, "POST", Object.fromEntries(new FormData(e.target)));
    toast(t("saved"), "ok"); onChange && onChange(); openClient(id, onChange);
  });
}

/* ---------------- REGISTER (caisse) ---------------- */
const CATS = { in: ["other_in", "deposit"], out: ["expense", "withdrawal", "salary", "purchase", "other"] };
const catLabel = (c) => (t("cat_" + c) !== "cat_" + c ? t("cat_" + c) : t(c));

async function pageRegister(v, day) {
  const today = new Date().toLocaleDateString("sv-SE");
  day = day || today;
  const r = await api("/register?day=" + day);
  const isToday = day === today;
  const opened = r.opening !== null && r.opening !== undefined;
  let dir = "out";
  v.innerHTML = `
  <div class="page-head"><h1>${t("nav_register")}</h1><input type="date" class="input" id="regDay" value="${day}" max="${today}" style="width:auto"></div>
  ${!opened && isToday ? `<div class="card" style="max-width:460px;margin-bottom:16px"><h2>${t("register_closed_title")}</h2>
     <form class="row" id="openF"><input class="input num" name="opening" inputmode="decimal" value="${Math.round(r.suggested_opening || 0)}"><button class="btn primary" style="flex:none">${t("open")}</button></form></div>` : ""}
  <div class="kpis">
    <div class="kpi"><div class="l">${t("opening")}</div><div class="v">${money(r.opening || 0)}</div></div>
    <div class="kpi"><div class="l">${t("kpi_in")}</div><div class="v amt-in">${money(r.total_in)}</div></div>
    <div class="kpi"><div class="l">${t("kpi_out")}</div><div class="v amt-out">${money(r.total_out)}</div></div>
    <div class="kpi accent"><div class="l">${t("expected")}</div><div class="v">${money(r.expected)}</div></div>
    ${r.closed_at ? `<div class="kpi"><div class="l">${t("counted")}</div><div class="v">${money(r.counted)}</div></div>
      <div class="kpi"><div class="l">${t("difference")}</div><div class="v ${Math.abs(r.difference) < 1 ? "amt-in" : "amt-out"}">${r.difference > 0 ? "+" : ""}${money(r.difference)}</div></div>` : ""}
  </div>
  <div class="grid g2">
    <div>
      ${isToday && !r.closed_at ? `<div class="card" style="margin-bottom:16px"><h2>${t("add_move")}</h2>
        <div class="seg" id="dirSeg"><button data-d="in">${t("money_in")}</button><button data-d="out" class="on">${t("money_out")}</button></div>
        <form id="mvF"><div class="row"><div class="field"><label>${t("category")}</label><select class="input" name="category" id="mvCat"></select></div>
          <div class="field"><label>${t("amount")}</label><input class="input num" name="amount" inputmode="decimal" required></div></div>
          <div class="field"><label>${t("note")}</label><input class="input" name="note"></div>
          <button class="btn primary">${t("save")}</button></form></div>
        <div class="card"><h2>${t("close_register")}</h2>
          <form id="closeF"><div class="row"><div class="field"><label>${t("counted")}</label><input class="input num" name="counted" inputmode="decimal" required placeholder="${Math.round(r.expected)}"></div>
          <div class="field"><label>${t("note")}</label><input class="input" name="note"></div></div>
          <button class="btn green">${t("close_register")}</button></form></div>`
      : r.closed_at ? `<div class="card"><div class="status-box"><span class="dot on"></span>${t("closed")} · ${hm(r.closed_at)}</div>${esc(r.note)} ${isToday ? `<button class="btn sm" id="reopenB">${t("reopen")}</button>` : ""}</div>` : ""}
      <div class="card" style="margin-top:16px"><h2>${t("by_cat")}</h2>
        ${r.by_category.length ? `<table><tbody>${r.by_category.map((c) => `<tr><td>${catLabel(c.category)}</td><td style="text-align:end" class="${c.direction === "in" ? "amt-in" : "amt-out"}">${c.direction === "in" ? "+" : "−"}${money(c.amount)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">${t("nothing")}</div>`}
        ${r.new_debt > 0 ? `<div class="sub" style="margin-top:10px">${t("rest")} : ${money(r.new_debt)}</div>` : ""}
      </div>
    </div>
    <div class="card"><h2>${t("moves")}</h2><div class="list">
      ${r.moves.length ? r.moves.map((m) => `<div class="item"><div class="grow"><div class="t">${catLabel(m.category)}</div><div class="s">${hm(m.ts)} · ${esc(m.note)}</div></div>
        <span class="${m.direction === "in" ? "amt-in" : "amt-out"}">${m.direction === "in" ? "+" : "−"}${money(m.amount)}</span>
        ${m.ref_type === "manual" && isToday && !r.closed_at ? `<button class="btn ghost sm" data-del="${m.id}">✕</button>` : ""}</div>`).join("") : `<div class="empty">${t("nothing")}</div>`}
    </div></div>
  </div>`;
  $("#regDay").onchange = (e) => pageRegister(v, e.target.value);
  const fillCats = () => { $("#mvCat").innerHTML = CATS[dir].map((c) => `<option value="${c}">${catLabel(c)}</option>`).join(""); };
  if ($("#mvCat")) {
    fillCats();
    $$("#dirSeg button").forEach((b) => b.onclick = () => { dir = b.dataset.d; $$("#dirSeg button").forEach((x) => x.classList.toggle("on", x === b)); fillCats(); });
    $("#mvF").onsubmit = async (e) => { e.preventDefault(); await api("/register/move", "POST", { ...Object.fromEntries(new FormData(e.target)), direction: dir }); toast(t("saved"), "ok"); pageRegister(v, day); };
    $("#closeF").onsubmit = async (e) => { e.preventDefault(); await api("/register/close", "POST", Object.fromEntries(new FormData(e.target))); pageRegister(v, day); };
  }
  $("#openF") && ($("#openF").onsubmit = async (e) => { e.preventDefault(); await api("/register/open", "POST", Object.fromEntries(new FormData(e.target))); pageRegister(v, day); });
  $("#reopenB") && ($("#reopenB").onclick = async () => { await api("/register/reopen", "POST", {}); pageRegister(v, day); });
  $$("[data-del]", v).forEach((b) => b.onclick = async () => { if (confirm(t("confirm_delete"))) { await api(`/register/move/${b.dataset.del}/delete`, "POST", {}); pageRegister(v, day); } });
}

/* ---------------- SUPPLIERS ---------------- */
async function pageSuppliers(v) {
  v.innerHTML = `<div class="page-head"><h1>${t("nav_suppliers")}</h1><button class="btn primary" id="sNew">+ ${t("new_supplier")}</button></div>
    <div class="kpis" id="sK"></div><div class="card"><div class="list" id="sl"></div></div>`;
  const load = async () => {
    const list = await api("/suppliers");
    if (!$("#sl")) return;
    $("#sK").innerHTML = `<div class="kpi"><div class="l">${t("kpi_owed")}</div><div class="v amt-out">${money(list.reduce((a, s) => a + s.owed, 0))}</div></div>`;
    $("#sl").innerHTML = list.length ? list.map((s) => `<div class="item click" data-s="${s.id}"><div class="avatar">${esc(initials(s.name))}</div>
      <div class="grow"><div class="t">${esc(s.name)}</div><div class="s">${t("purchased")} : ${money(s.purchased)}</div></div>
      ${s.owed > 0.001 ? `<span class="pill red">${money(s.owed)}</span>` : `<span class="pill green">${t("settled")}</span>`}</div>`).join("") : `<div class="empty">${t("nothing")}</div>`;
    $$("[data-s]", v).forEach((el) => el.onclick = () => openSupplier(+el.dataset.s, load));
  };
  $("#sNew").onclick = () => editParty("suppliers", null, load);
  load();
}

async function openSupplier(id, onChange) {
  const s = await api("/suppliers/" + id);
  const hist = [...s.purchases.map((p) => ({ ...p, _k: "buy" })), ...s.payments.map((p) => ({ ...p, _k: "pay" }))].sort((a, b) => b.ts.localeCompare(a.ts));
  modal(`<div class="modal-head"><div><h1>${esc(s.name)}</h1><div class="sub num">${esc(s.phone)} ${esc(s.note)}</div></div>
      <div class="row" style="flex:none"><button class="btn sm" id="edS">${t("edit")}</button><button class="btn ghost" onclick="closeModal()">✕</button></div></div>
    <div class="kpis"><div class="kpi"><div class="l">${t("owed")}</div><div class="v ${s.owed > 0.001 ? "amt-out" : "amt-in"}">${money(s.owed)}</div></div>
      <div class="kpi"><div class="l">${t("purchased")}</div><div class="v">${money(s.purchased)}</div></div></div>
    <div class="grid g2" style="margin-bottom:16px">
      <form class="card" id="buyF"><h2>${t("new_purchase")}</h2><div class="field"><label>${t("description")}</label><input class="input" name="description"></div>
        <div class="row"><div class="field"><label>${t("total")}</label><input class="input num" name="total" inputmode="decimal" required></div>
        <div class="field"><label>${t("paid")}</label><input class="input num" name="paid" inputmode="decimal" placeholder="= ${t("total")}"></div></div>
        <button class="btn primary">${t("save")}</button></form>
      <form class="card" id="spF"><h2>${t("pay_supplier")}</h2><div class="field"><label>${t("amount")}</label><input class="input num" name="amount" inputmode="decimal" required value="${s.owed > 0 ? Math.round(s.owed) : ""}"></div>
        <div class="field"><label>${t("note")}</label><input class="input" name="note"></div><button class="btn green">${t("pay_supplier")}</button></form>
    </div>
    <h2>${t("history")}</h2><table><tbody>${hist.length ? hist.map((h) => h._k === "buy"
      ? `<tr><td class="num">${dmy(h.ts)}</td><td><span class="pill accent">${t("purchase")}</span> ${esc(h.description)}</td><td style="text-align:end">${money(h.total)}${h.total - h.paid > 0.001 ? ` <span class="pill red">${money(h.total - h.paid)}</span>` : ""}</td></tr>`
      : `<tr><td class="num">${dmy(h.ts)}</td><td><span class="pill green">${t("payment")}</span> ${esc(h.note)}</td><td style="text-align:end" class="amt-out">${money(h.amount)}</td></tr>`).join("") : `<tr><td class="empty">${t("nothing")}</td></tr>`}</tbody></table>`);
  const again = () => { toast(t("saved"), "ok"); onChange && onChange(); openSupplier(id, onChange); };
  $("#edS").onclick = () => editParty("suppliers", s, () => { onChange && onChange(); openSupplier(id, onChange); });
  $("#buyF").onsubmit = async (e) => { e.preventDefault(); await api(`/suppliers/${id}/purchase`, "POST", Object.fromEntries(new FormData(e.target))); again(); };
  $("#spF").onsubmit = async (e) => { e.preventDefault(); await api(`/suppliers/${id}/pay`, "POST", Object.fromEntries(new FormData(e.target))); again(); };
}

/* ---------------- SETTINGS ---------------- */
async function pageSettings(v) {
  const st = S.settings = await api("/settings");
  await refreshStatus(); renderShell();
  const s = S.status;
  let statusLine = s.mode === "demo" ? `<span class="dot demo"></span>${t("demo_badge")}`
    : s.authorized ? `<span class="dot ${s.bot_ok ? "on" : "off"}"></span>${t("connected_as")} ${esc(s.me)} · ${s.bot_ok ? t("bot_ready") : t("bot_missing")}`
    : `<span class="dot off"></span>${t("not_linked")} ${s.error ? `<span class="sub">(${esc(s.error)})</span>` : ""}`;
  v.innerHTML = `<div class="page-head"><h1>${t("settings")}</h1>
      <div class="seg" style="margin:0;width:220px"><button data-l="fr" class="${S.lang === "fr" ? "on" : ""}">Français</button><button data-l="ar" class="${S.lang === "ar" ? "on" : ""}">العربية</button></div></div>
    <div class="grid g2">
      <form class="card" id="setF">
        <h2>${t("tg_link")}</h2>
        <div class="status-box">${statusLine}</div>
        <label class="switch"><input type="checkbox" name="demo" ${st.demo ? "checked" : ""}> ${t("demo_mode")}</label>
        <p class="sub">${t("api_help")}</p>
        <div class="row"><div class="field"><label>${t("api_id")}</label><input class="input num" name="api_id" value="${esc(st.api_id)}"></div>
          <div class="field"><label>${t("api_hash")}</label><input class="input num" name="api_hash" placeholder="${st.has_api_hash ? "••••••••" : ""}"></div></div>
        <div class="field"><label>${t("bot_user")}</label><input class="input num" name="bot" value="${esc(st.bot)}" placeholder="@ProviderBot"></div>
        <div class="field"><label>${t("template")}</label><input class="input num" name="template" value="${esc(st.template)}"><span class="sub">${t("template_hint")}</span></div>
        <div class="field"><label>${t("reply_wait")}</label><input class="input num" name="reply_wait" value="${esc(st.reply_wait)}" inputmode="decimal"></div>
        <h2 style="margin-top:20px">${t("shop")}</h2>
        <div class="row"><div class="field"><label>${t("shop_name")}</label><input class="input" name="shop_name" value="${esc(st.shop_name)}"></div>
          <div class="field" style="flex:0 0 100px"><label>${t("currency")}</label><input class="input" name="currency" value="${esc(st.currency)}"></div></div>
        <button class="btn primary">${t("save")}</button>
      </form>
      <div>
        <div class="card" id="loginCard"></div>
        <div class="card" style="margin-top:16px"><h2>${t("remote_access")}</h2>
          ${REMOTE
            ? `<div class="status-box"><span class="dot on"></span><span class="num">${esc(serverUrl())}</span></div>
               <button class="btn" id="chSrv">${t("change_server")}</button>`
            : `<p class="sub">${t("remote_help")}</p>
               <div class="field"><label>${t("access_key")}</label><div class="status-box num" style="font-size:20px;letter-spacing:.08em">${esc(st.access_key)}</div></div>`}
        </div>
      </div>
    </div>`;
  $("#chSrv") && ($("#chSrv").onclick = () => showConnect(""));
  $$("[data-l]", v).forEach((b) => b.onclick = () => setLang(b.dataset.l));
  $("#setF").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)); d.demo = !!e.target.demo.checked;
    if (!d.api_hash) delete d.api_hash;
    S.settings = await api("/settings", "PUT", d); toast(t("saved"), "ok"); pageSettings(v);
  };
  renderLogin();
}

function renderLogin() {
  const c = $("#loginCard"), s = S.status;
  if (s.mode === "demo" || !s.configured) { c.innerHTML = `<h2>${t("login")}</h2><p class="sub">${t("api_help")}</p>`; c.style.opacity = .6; return; }
  if (s.authorized) {
    c.innerHTML = `<h2>${t("login")}</h2><div class="status-box"><span class="dot on"></span>${t("connected_as")} ${esc(s.me)}</div><button class="btn red" id="loB">${t("logout")}</button>`;
    $("#loB").onclick = async () => { if (confirm(t("logout") + " ?")) { await api("/telegram/logout", "POST", {}); route(); } };
    return;
  }
  c.innerHTML = `<h2>${t("login")}</h2>
    <form id="lgF"><div class="field"><label>${t("phone")}</label><input class="input num" name="phone" placeholder="+213 6XX XX XX XX" required></div>
    <button class="btn" id="codeB" type="button">${t("send_code")}</button>
    <div id="step2" class="hidden" style="margin-top:14px">
      <div class="field"><label>${t("code")}</label><input class="input num" name="code"></div>
      <div class="field"><label>${t("password")}</label><input class="input" type="password" name="password"></div>
      <button class="btn primary">${t("sign_in")}</button></div></form>`;
  const f = $("#lgF");
  $("#codeB").onclick = async () => { await api("/telegram/send_code", "POST", { phone: f.phone.value }); toast(t("code_sent"), "ok"); $("#step2").classList.remove("hidden"); f.code.focus(); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const res = await api("/telegram/sign_in", "POST", { phone: f.phone.value, code: f.code.value, password: f.password.value });
    if (res.need_password) { toast(t("need_password"), "err"); f.password.focus(); return; }
    toast("✓", "ok"); route();
  };
}

/* ---------------- connect (GitHub Pages → shop PC) ---------------- */
function showConnect(reason) {
  S.offline = true;
  renderShell();
  $("#view").innerHTML = `
  <div class="card connect-card">
    <div class="logo" style="width:52px;height:52px;margin-bottom:14px">${svg("register")}</div>
    <h1>${t("connect_title")}</h1>
    <p class="sub">${t("connect_help")}</p>
    ${reason ? `<div class="notice" style="margin:12px 0">${t("err_" + reason)}</div>` : ""}
    <form id="cnF">
      <div class="field"><label>${t("server_address")}</label><input class="input num" name="server" value="${esc(serverUrl())}" placeholder="http://localhost:8765"></div>
      <div class="field"><label>${t("access_key")}</label><input class="input num" name="key" value="${esc(accessKey())}" placeholder="XXXX-XXXX-XXXX" autocomplete="off" style="text-transform:uppercase"></div>
      <button class="btn primary" style="width:100%">${t("connect")}</button>
    </form>
    <p class="sub" style="margin-top:14px">${t("connect_note")}</p>
  </div>`;
  $("#cnF").onsubmit = async (e) => {
    e.preventDefault();
    localStorage.setItem("server", e.target.server.value.trim());
    localStorage.setItem("key", e.target.key.value.trim().toUpperCase());
    try { await api("/ping", "GET", null, true); } catch (err) { return showConnect(err.message === "bad_key" ? "bad_key" : "unreachable"); }
    S.offline = false; toast("✓", "ok"); start();
  };
}

/* ---------------- boot ---------------- */
async function start() {
  try { S.settings = await api("/settings"); } catch { return; }
  await refreshStatus();
  route();
}
(async function boot() {
  if (REMOTE && !accessKey()) return showConnect("");
  await start();
  setInterval(async () => { if (S.offline) return; try { S.status = await api("/bot/status", "GET", null, true); renderShell(); } catch {} }, 30000);
})();
