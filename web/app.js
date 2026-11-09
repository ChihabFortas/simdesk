/* SIM Desk — interface. Data: Firebase (store.js). Telegram bot: the bridge running on the bot PC. */
import * as Store from "./store.js";

const S = {
  lang: localStorage.getItem("lang") || "fr",
  settings: { ...Store.DEFAULT_SETTINGS }, status: {}, clients: [], user: null, bridgeOk: null, reveal: false,
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
const isMgr = () => Store.isManager();
const fmtNum = (d) => String(d || "").replace(/(\d{2})(?=\d)/g, "$1 ");
const maskNum = (d) => { d = String(d || ""); return d.length >= 8 ? `${d.slice(0, 4)} •• ${d.slice(-4)}` : d; };
// operator screens can be seen by customers: amounts are hidden until the operator taps the eye
const secret = (html) => (isMgr() || S.reveal ? html : `<span class="masked">•••••</span>`);

/* The bot bridge runs on the shop PC logged into Telegram. When this page is served by that PC itself
   (http://localhost:8765) the bridge is same-origin; on GitHub Pages it is reached at settings.bridge_url. */
const CFG = window.SIMDESK || {};
const bridgeBase = () => (CFG.remote ? (S.settings.bridge_url || "http://localhost:8765") : "").trim().replace(/\/+$/, "");
const BRIDGE_PATH = /^\/(bot|telegram|bridge|ping)(\/|$)/;

async function bridgeCall(path, method, body) {
  let res;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), /^\/bot\/(send|click|latest|menu)/.test(path) ? 90000 : 15000);
  try {
    res = await fetch(bridgeBase() + "/api" + path, { method, headers: { "Content-Type": "application/json", "X-SimDesk-Key": S.settings.bridge_key || "" },
                                                      body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
  } catch (e) {
    if (e.name === "AbortError") throw new Error("bridge_timeout");
    S.bridgeOk = false; renderBotBadge(); throw new Error("bridge_unreachable");
  } finally { clearTimeout(timer); }
  if (res.status === 401) { S.bridgeOk = false; renderBotBadge(); throw new Error("bridge_key"); }
  // a bot PC running an older SIM-Desk.exe answers "Not Found" (plain text) for routes it doesn't know
  if (res.status === 404) throw new Error("bridge_outdated");
  const j = await res.json().catch(() => ({ ok: false, error: `bridge_http:${res.status}` }));
  if (S.bridgeOk !== true) { S.bridgeOk = true; renderBotBadge(); }
  if (!j.ok) throw new Error(j.error);
  return j.data;
}

async function api(path, method = "GET", body, quiet) {
  try {
    if (BRIDGE_PATH.test(path)) return await bridgeCall(path.replace(/^\/bridge(?=\/)/, ""), method, body);
    return await Store.route(path, method, body || {});
  } catch (e) {
    const msg = String(e?.message || e);
    if (!quiet) {
      const [code, arg] = msg.split(":");
      const known = t("err_" + code) !== "err_" + code;
      toast(known ? t("err_" + code) + (arg ? " " + arg : "") : msg, "err");
    }
    throw e;
  }
}

function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind; el.textContent = msg;
  $("#toasts").appendChild(el); setTimeout(() => el.remove(), 3800);
}
function modal(html, size) { const c = $("#modalCard"); c.className = "modal-card " + (size || ""); c.innerHTML = html; $("#modal").classList.remove("hidden"); }
function closeModal() { $("#modal").classList.add("hidden"); }
window.closeModal = closeModal;
$("#modal").addEventListener("mousedown", (e) => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

/* ---------------- icons & nav ---------------- */
const IC = {
  recharge: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  clients: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  register: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/><path d="M6 6V4h12v2"/>',
  suppliers: '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  safe: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5V7M15.5 12H17M7 20v1.5M17 20v1.5"/>',
  users: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/><path d="m17 3 1.5 1.5L21 2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`;
const MANAGER_PAGES = ["recharge", "dashboard", "clients", "register", "safe", "suppliers", "users", "settings"];
const OPERATOR_PAGES = ["recharge", "clients", "register"];
const pagesFor = () => (isMgr() ? MANAGER_PAGES : OPERATOR_PAGES);

function renderShell() {
  document.documentElement.lang = S.lang;
  document.documentElement.dir = S.lang === "ar" ? "rtl" : "ltr";
  document.body.classList.toggle("signed-in", !!S.user);
  document.body.classList.toggle("role-operator", !!S.user && !isMgr());
  $("#langBtn").textContent = S.lang === "ar" ? "Français" : "العربية";
  $("#shopName").textContent = S.settings.shop_name || "SIM Desk";
  const cur = (location.hash.slice(1) || "recharge").split("/")[0];
  $("#nav").innerHTML = S.user ? pagesFor().map((p) => `<a href="#${p}" class="${p === cur ? "active" : ""}">${svg(p)}<span>${t("nav_" + p)}</span></a>`).join("") : "";
  $("#userChip").innerHTML = S.user ? `<div class="avatar sm">${esc(initials(S.user.name || S.user.email))}</div>
    <div class="grow"><div class="t">${esc(S.user.name || S.user.email)}</div><div class="s">${t("role_" + S.user.role)}</div></div>
    <button class="icon-btn" id="logoutBtn" title="${t("logout_app")}">${svg("logout")}</button>` : "";
  $("#logoutBtn") && ($("#logoutBtn").onclick = async () => { if (confirm(t("logout_app") + " ?")) { await Store.logout(); } });
  renderBotBadge();
}
function renderBotBadge() {
  const el = $("#botBadge"); if (!el) return;
  if (!S.user) { el.innerHTML = ""; return; }
  const st = S.status;
  let cls = "off", label = t("bridge_off");
  if (S.bridgeOk) {
    if (st.mode === "demo") { cls = "demo"; label = t("demo_badge"); }
    else if (st.authorized && st.bot_ok) { cls = "on"; label = isMgr() ? `${t("bot_ready")} · ${st.bot}` : t("bot_ready"); }
    else { label = st.authorized ? t("bot_missing") : t("not_linked"); }
  }
  if (S.bridgeOutdated) { cls = "off"; label = t("bridge_outdated"); }
  el.innerHTML = `<span class="dot ${cls}"></span><span>${esc(label)}</span>`;
}
$("#langBtn").onclick = () => setLang(S.lang === "ar" ? "fr" : "ar");
function setLang(l) { S.lang = l; localStorage.setItem("lang", l); S.user ? route() : renderAuth(S.authState); }
window.setLang = setLang;

async function refreshStatus() {
  try { S.status = await api("/bot/status", "GET", null, true); } catch { S.status = {}; }
}

async function route() {
  if (!S.user) return;
  let page = (location.hash.slice(1) || "recharge").split("/")[0];
  if (!pagesFor().includes(page)) { if (location.hash && location.hash !== "#recharge") { location.hash = "recharge"; return; } page = "recharge"; }
  renderShell();
  const v = $("#view");
  const fn = { recharge: pageRecharge, dashboard: pageDashboard, clients: pageClients, register: pageRegister, safe: pageSafe,
               suppliers: pageSuppliers, users: pageUsers, settings: pageSettings }[page] || pageRecharge;
  try { await fn(v); } catch (e) { console.error(e); }
}
window.addEventListener("hashchange", () => { closeModal(); route(); });

/* ---------------- RECHARGE (talks to the bot) ---------------- */
const OPS = { "06": "Mobilis", "07": "Djezzy", "05": "Ooredoo", "01": "Ooredoo" };
const normNum = (n) => { let d = String(n || "").replace(/\D/g, ""); if (d.startsWith("213") && d.length === 12) d = "0" + d.slice(3); if (d.length === 9 && /^[567]/.test(d)) d = "0" + d; return d; };
const opOf = (n) => { const d = normNum(n); return d.length >= 2 ? OPS[d.slice(0, 2)] || "" : ""; };
// operations offered by the provider bot for each operator (min amount)
const OPERATIONS = {
  Mobilis: [["flexy", 50], ["international", 200], ["offers", 0]],
  Djezzy: [["flexy", 50], ["bill", 100], ["offers", 0]],
  Ooredoo: [["flexy", 50], ["bill", 100], ["offers", 0]],
};
const QUICK = [100, 200, 500, 1000, 2000];
const AMOUNT_RE = /(\d[\d\s.,]*)\s*(?:DA|DZD|دج|دينار)/i;
const parseAmount = (s) => { const m = String(s || "").match(AMOUNT_RE); return m ? Number(m[1].replace(/[\s.,]/g, "")) : null; };
const stripEmoji = (s) => s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️]/gu, "").trim();
function buildCommand(num, op, amount) {   // same formats as the server (preview only)
  const d = normNum(num), o = opOf(d);
  if (d.length !== 10 || !o) return "";
  const cmds = S.settings.commands || {};
  if (S.rc.operation === "offers") return (S.settings.template || "{number}").replace("{number}", d.startsWith("01") ? "05" + d.slice(2) : d);
  if (!amount) return "";
  const key = op === "flexy" ? "flexy" : op === "international" ? "international" : o === "Djezzy" ? "bill_djezzy" : "bill_ooredoo";
  const real = d.startsWith("01") ? "05" + d.slice(2) : d;
  return (cmds[key] || "{number}*{amount}").replace("{number01}", "01" + real.slice(2)).replace("{number}", real).replace("{amount}", amount);
}

async function pageRecharge(v) {
  const r = S.rc;
  r.operation = r.operation || "flexy";
  v.innerHTML = `
  <div class="recharge">
    <div>
      <div class="provider" id="provider"></div>
      <form class="lookup" id="lookupForm" autocomplete="off">
        <label>${t("sim_number")}</label>
        <input class="big-input" id="simInput" inputmode="tel" placeholder="06 XX XX XX XX" value="${esc(r.number)}">
        <div class="op-line"><span class="op-tag hidden" id="opTag"></span><div class="op-seg" id="opSeg"></div></div>
        <div id="amountZone">
          <div class="amount-row">
            <input class="amount-input num" id="amtInput" inputmode="numeric" placeholder="${t("amount")}" value="${esc(r.amount || "")}"><span class="cur">${esc(S.settings.currency || "DA")}</span>
          </div>
          <div class="quick" id="quick">${QUICK.map((q) => `<button type="button" data-q="${q}">${q}</button>`).join("")}</div>
        </div>
        <div class="send-row">
          <code class="cmd num" id="cmdPreview"></code>
          <button class="ok-btn" id="okBtn" ${r.busy ? "disabled" : ""}>${t("send")}</button>
        </div>
      </form>
      <div class="feed" id="feed"></div>
    </div>
    <div class="sale-panel">
      <div id="regBanner"></div>
      <div id="clientBox" class="hidden"></div>
      <div class="card" id="salePanel"></div>
      <div class="card" style="margin-top:16px"><h2>${t("today_ops")}</h2><div class="list" id="todayList"></div></div>
    </div>
  </div>`;
  const inp = $("#simInput"), amt = $("#amtInput");
  const refresh = () => {
    const o = opOf(inp.value);
    const tag = $("#opTag"); tag.textContent = o; tag.className = "op-tag " + (o ? "op-" + o : "hidden");
    const ops = OPERATIONS[o] || [];
    if (normNum(inp.value).startsWith("01")) r.operation = "bill";
    if (ops.length && !ops.some(([k]) => k === r.operation)) r.operation = "flexy";
    $("#opSeg").innerHTML = ops.map(([k, min]) => `<button type="button" data-op="${k}" class="${k === r.operation ? "on" : ""}">${t("op_" + k)}${min > 50 ? ` <small>≥${min}</small>` : ""}</button>`).join("");
    $$("#opSeg button").forEach((b) => b.onclick = () => { r.operation = b.dataset.op; refresh(); if (r.operation !== "offers") amt.focus(); });
    $("#amountZone").classList.toggle("hidden", r.operation === "offers");
    const cmd = buildCommand(inp.value, r.operation, amt.value);
    $("#cmdPreview").textContent = cmd ? "→ " + cmd : "";
  };
  inp.addEventListener("input", () => { r.number = inp.value; refresh(); lookupClientByNumber(inp.value); });
  amt.addEventListener("input", () => { r.amount = amt.value.replace(/\D/g, ""); amt.value = r.amount; refresh(); });
  $$("#quick button").forEach((b) => b.onclick = () => { amt.value = r.amount = b.dataset.q; refresh(); });
  refresh();
  $("#lookupForm").onsubmit = (e) => { e.preventDefault(); sendOperation(); };
  if (!r.feed.length) inp.focus();
  renderProvider(); renderFeed(); renderClientBox(); renderSalePanel(); loadToday(); checkRegister();
  if (r.number && !r.clientInfo) lookupClientByNumber(r.number);
  if (!S.menu) loadMenu();
}

/* A sale's description is its transaction type — nothing else */
const SALE_KINDS = ["flexy", "offer", "bill", "international", "card"];
const KIND_STORED = { flexy: "Flexy", offer: "Offre", bill: "Facture", international: "International", card: "Carte" };
const KIND_OF_OP = { flexy: "flexy", bill: "bill", international: "international", offers: "offer" };
const kindLabel = (s) => (s.kind ? t("kind_" + s.kind) : s.description || t("sale"));

async function sendOperation() {
  const r = S.rc;
  const num = normNum(r.number), op = opOf(num);
  if (num.length !== 10 || !op) return toast(t("err_invalid_number"), "err");
  if (r.operation !== "offers" && !(Number(r.amount) > 0)) { $("#amtInput")?.focus(); return toast(t("err_invalid_amount"), "err"); }
  const amount = r.operation === "offers" ? null : Number(r.amount);
  const cmd = buildCommand(num, r.operation, amount);
  r.feed = []; r.batch = [];
  r.flow = r.operation;
  r.pending = {   // filled into the sale form only if the bot confirms
    kind: KIND_OF_OP[r.operation], total: r.operation === "offers" ? "" : amount,
    sim: num.startsWith("01") ? "05" + num.slice(2) : num,
  };
  r.sale = { ...freshSale(), client: r.sale.client, attach: r.sale.attach, label: r.sale.label, sim: r.pending?.sim || num };
  renderSalePanel();
  if (!cmd) return toast(t("err_invalid_amount"), "err");
  if (S.settings.confirm_before_send !== false) {
    const ok = await confirmForCustomer({ num: r.pending?.sim || num, op, operation: r.operation, amount });
    if (!ok) { r.pending = null; return; }
  }
  await talk(() => api("/bot/send", "POST", { text: cmd }), cmd, () => sendOperation());
}

/* Big, readable confirmation the customer checks before the operator sends anything */
function confirmForCustomer({ num, op, operation, amount }) {
  return new Promise((resolve) => {
    modal(`<div class="confirm-screen">
        <div class="cs-label">${t("confirm_number")}</div>
        <div class="cs-number num">${esc(fmtNum(num))}</div>
        <div class="cs-meta"><span class="op-tag op-${op}">${esc(op)}</span><span class="cs-op">${t("op_" + operation)}</span></div>
        ${amount ? `<div class="cs-amount">${money(amount)}</div>` : ""}
        <div class="cs-actions"><button class="btn" id="csNo">${t("correct")}</button><button class="btn primary" id="csYes">${t("confirm_send")}</button></div>
      </div>`, "confirm");
    const done = (v) => { document.removeEventListener("keydown", key, true); closeModal(); resolve(v); };
    const key = (e) => { if (e.key === "Enter") { e.preventDefault(); done(true); } if (e.key === "Escape") { e.preventDefault(); done(false); } };
    document.addEventListener("keydown", key, true);
    $("#csYes").onclick = () => done(true); $("#csNo").onclick = () => done(false);
    $("#csYes").focus();
  });
}
// lines of the bot's replies that reveal the shop's own account (balance, profits…) are hidden from operators
const SENSITIVE_LINE = /رصيد|الارباح|الأرباح|ارباح|أرباح|ديون|solde|balance|profit|bénéfice|commission/i;
const redact = (text) => (isMgr() ? text : String(text || "").split("\n").filter((l) => !SENSITIVE_LINE.test(l)).join("\n"));

/* the provider account: values come from the bot's own menu labels (رصيد : … دج) */
async function loadMenu() {
  try { const m = await api("/bot/menu", "GET", null, true); S.menu = m; renderProvider(); } catch {}
}
function menuValue(rx) {
  const b = (S.menu?.buttons || []).flat().find((x) => rx.test(x.text));
  if (!b) return null;
  const n = String(b.text).match(/(-?\d[\d\s.,]*)/);
  return n ? Number(n[1].replace(/[\s,]/g, "")) : "—";
}
function renderProvider() {
  const el = $("#provider"); if (!el) return;
  let btns = (S.menu?.buttons || []).flat();
  if (!isMgr()) {   // operators only get the cards menu; the shop's account stays private
    btns = btns.filter((b) => /بطاقات|cartes|cards/i.test(b.text));
    el.innerHTML = `<div class="prov-menu">${btns.map((b) => `<button class="pill-btn" data-r="${b.r}" data-c="${b.c}">${esc(b.text)}</button>`).join("")}</div>`;
    $$(".pill-btn", el).forEach((b) => b.onclick = () => { S.rc.feed = []; S.rc.pending = null; S.rc.flow = "card";
      talk(() => api("/bot/click", "POST", { msg_id: S.menu.msg_id, row: +b.dataset.r, col: +b.dataset.c }), b.textContent); });
    return;
  }
  if (!btns.length) { el.innerHTML = `<button class="btn sm ghost" id="menuLoad">↻ ${t("bot_menu")}</button>`; $("#menuLoad").onclick = loadMenu; return; }
  const vals = [["provider_balance", /رصيد/], ["provider_debt", /ديون/], ["provider_profit", /الارباح|الأرباح/]]
    .map(([k, rx]) => [k, menuValue(rx)]).filter(([, v]) => v !== null);
  const others = btns.filter((b) => !/رصيد|ديون|^\s*الارباح\s*:|^\s*الأرباح\s*:/.test(b.text));
  el.innerHTML = `
    <div class="prov-vals">${vals.map(([k, v]) => `<div class="pv ${k}"><span>${t(k)}</span><b>${typeof v === "number" ? money(v) : v}</b></div>`).join("")}
      <button class="btn sm ghost" id="menuLoad" title="${t("refresh")}">↻</button></div>
    <div class="prov-menu">${others.map((b) => `<button class="pill-btn" data-r="${b.r}" data-c="${b.c}">${esc(b.text)}</button>`).join("")}</div>`;
  $("#menuLoad").onclick = loadMenu;
  $$(".pill-btn", el).forEach((b) => b.onclick = () => {
    S.rc.feed = []; S.rc.pending = null; S.rc.flow = /بطاقات|cartes|cards/i.test(b.textContent) ? "card" : "menu";
    talk(() => api("/bot/click", "POST", { msg_id: S.menu.msg_id, row: +b.dataset.r, col: +b.dataset.c }), b.textContent);
  });
}

/* Sends something to the bot and reads the answer. `retry` re-runs the same action from the pop-up. */
async function talk(call, stepLabel, retry) {
  const r = S.rc;
  if (r.busy) return;
  r.busy = true; r.waitStart = Date.now();
  if (stepLabel) r.feed.push({ step: stepLabel });
  r.feed.push({ loading: true });
  renderFeed(); setBusy(true);
  clearInterval(r.waitTimer);
  r.waitTimer = setInterval(() => { const el = $("#waitSec"); if (el) el.textContent = Math.round((Date.now() - r.waitStart) / 1000) + " s"; }, 500);
  let res = null;
  try {
    res = await call();
    r.feed = r.feed.filter((x) => !x.loading);
    if (res.notice) r.feed.push({ notice: res.notice });
    const msgs = res.messages || [];
    if (!msgs.length) r.feed.push({ empty: true });
    r.batch = msgs.map((m) => m.id);
    for (const m of msgs) {
      const i = r.feed.findIndex((x) => x.msg && x.msg.id === m.id);
      if (i >= 0) r.feed[i] = { msg: m }; else r.feed.push({ msg: m });
      r.lastText = m.text;
      if (m.menu && m.menu.length) { S.menu = { msg_id: m.id, buttons: m.menu }; renderProvider(); }
    }
  } catch (e) {
    r.feed = r.feed.filter((x) => !x.loading);
  }
  clearInterval(r.waitTimer);
  r.busy = false; setBusy(false); renderFeed();
  if (res) handleOutcome(interpret(res), res, retry);
}
function setBusy(b) { const ok = $("#okBtn"); if (ok) ok.disabled = b; }

/* ---- understanding the bot's answer ---- */
const PROCESSING_RE = /⏳|⌛|جاري|قيد المعالجة|قيد التنفيذ|انتظر|يرجى الانتظار|en cours|patiente|traitement|processing|please wait|pending/i;
const BOT_RULES = [   // first match wins: specific problems before generic ones
  ["insufficient", /رصيد(ك|كم)?\s*(الحالي\s*)?(غير|لا)\s*(كاف|كافي|يكفي)|غير\s*كاف|insuffisant|insufficient|not enough (balance|credit)|pas assez/i],
  ["no_offer", /لا\s*(توجد|يوجد|تتوفر|يتوفر)\s*(أي|اي)?\s*(عروض|عرض)|لايوجد\s*عرض|لا عروض|ليس لديه عروض|aucune offre|pas d'offre|no offers?\b/i],
  ["invalid_number", /(الرقم|رقم)\s*(غير\s*(صحيح|صالح|موجود|مفعل)|خاطئ|خطأ)|numéro (invalide|incorrect|inexistant)|invalid (number|phone)|wrong number/i],
  ["bad_format", /صيغة\s*(غير|خاطئة)|commande inconnue|unknown command|format (invalide|incorrect)/i],
  ["cancelled", /تم\s*الإلغاء|ألغيت|إلغاء العملية|annulée?|cancell?ed/i],
  ["failed", /❌|⛔|فشل|لم\s*(تتم|يتم|تنجح)|تعذر|مرفوض|رفض|خطأ|échec|erreur|refus|failed|error|declined|non effectu/i],
  ["processing", PROCESSING_RE],
  ["success", /✅|تمت|تم\s|بنجاح|نجحت|réussi|succès|effectué|success|\bdone\b/i],
];
const ERROR_KINDS = new Set(["insufficient", "no_offer", "invalid_number", "bad_format", "failed"]);
function classify(text) {
  for (const [kind, rx] of BOT_RULES) if (rx.test(text || "")) return kind;
  return "";
}
/** One verdict for the whole answer (the bot may send several messages). */
function interpret(res) {
  const msgs = (res.messages || []).filter((m) => (m.text || "").trim() || (m.buttons || []).length);
  if (res.cancelled) return { kind: "stopped" };
  if (!msgs.length) return { kind: "no_reply", waited: res.waited };
  const kinds = msgs.map((m) => classify(m.text));
  const err = kinds.find((k) => ERROR_KINDS.has(k));
  if (err) return { kind: err, text: msgs[kinds.indexOf(err)].text };
  const last = msgs[msgs.length - 1];
  if (kinds[kinds.length - 1] === "processing" && !(last.buttons || []).length) return { kind: "processing", text: last.text };
  if (kinds.includes("cancelled")) return { kind: "cancelled" };
  if (kinds.includes("success")) return { kind: "success", text: msgs[kinds.lastIndexOf("success")].text };
  if (msgs.some((m) => (m.buttons || []).length)) return { kind: "choices" };
  return { kind: "info" };
}

function handleOutcome(o, res, retry) {
  const r = S.rc;
  if (o.kind === "success") {
    if (r.pending) {
      Object.assign(r.sale, { kind: r.pending.kind, sim: r.pending.sim });
      if (r.pending.total) { r.sale.total = r.pending.total; r.sale.paid = r.pending.total; }
      r.pending = null;
    }
    renderSalePanel(true);
    toast(t("bot_ok"), "ok");
    return;
  }
  if (o.kind === "choices" || o.kind === "info") return;          // the operator picks / reads
  if (o.kind === "stopped") { toast(t("wait_stopped")); return; }
  if (o.kind === "cancelled") { r.pending = null; toast(t("bot_cancelled")); return; }
  r.pending = null;   // nothing to record for a failed or unanswered operation
  // no answer to an offer lookup usually means the SIM has no offer
  const kind = o.kind === "no_reply" && r.flow === "offers" ? "no_reply_offers" : o.kind;
  botAlert(kind, o, retry);
}

const ALERT_ICON = { insufficient: "💰", no_offer: "📭", no_reply_offers: "📭", invalid_number: "📵", bad_format: "⌨️", failed: "⛔", processing: "⏳", no_reply: "🔇" };
function botAlert(kind, o, retry) {
  const cls = kind === "processing" ? "amber" : "red";
  modal(`<div class="bot-alert ${cls}">
      <div class="ba-icon">${ALERT_ICON[kind] || "⚠️"}</div>
      <h1>${t("alert_" + kind)}</h1>
      <p>${t("alert_" + kind + "_help").replace("{s}", Math.round(o.waited || 0))}</p>
      ${o.text ? `<blockquote dir="auto">${esc(redact(o.text))}</blockquote>` : ""}
      <div class="ba-actions">
        ${kind === "processing" || kind.startsWith("no_reply") ? `<button class="btn" id="baCheck">↻ ${t("check_again")}</button>` : ""}
        ${retry && kind !== "processing" && kind !== "insufficient" ? `<button class="btn" id="baRetry">${t("retry")}</button>` : ""}
        <button class="btn primary" id="baOk">OK</button>
      </div></div>`, "alert");
  const close = () => { document.removeEventListener("keydown", key, true); closeModal(); };
  const key = (e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); close(); } };
  document.addEventListener("keydown", key, true);
  $("#baOk").onclick = close; $("#baOk").focus();
  $("#baCheck") && ($("#baCheck").onclick = () => { close(); talk(() => api("/bot/latest"), null); });
  $("#baRetry") && ($("#baRetry").onclick = () => { close(); retry(); });
}

function renderBotCard(m, active) {
  const k = classify(m.text);
  const kind = k === "success" ? "success" : ERROR_KINDS.has(k) ? "error" : k === "processing" ? "pending" : "";
  const lines = redact(m.text).split("\n").map((l) => l.trim());
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
    if (x.loading) return `<div class="card loader"><div class="spin"></div><span>${t("waiting_bot")} <b class="num" id="waitSec"></b></span>
      <button class="btn sm" id="stopWait" style="margin-inline-start:auto">${t("stop_wait")}</button></div>`;
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
  $("#stopWait") && ($("#stopWait").onclick = (e) => { e.target.disabled = true; api("/bot/cancel", "POST", {}, true).catch(() => {}); });
  $$(".choice", f).forEach((b) => b.onclick = () => {
    if (b.dataset.url) return window.open(b.dataset.url, "_blank");
    const label = b.dataset.label;
    const price = parseAmount(label);
    if (!/annul|cancel|retour|confirm|valider|إلغاء|تأكيد|❌|✅/i.test(label)) {
      // an offer or a card picked from the bot's buttons: recorded only once the bot confirms
      const sim = S.rc.pending?.sim || S.rc.sale.sim || normNum(S.rc.number);
      S.rc.pending = { kind: S.rc.flow === "card" ? "card" : "offer", total: price || S.rc.pending?.total || "", sim };
    }
    talk(() => api("/bot/click", "POST", { msg_id: +b.dataset.msg, row: +b.dataset.r, col: +b.dataset.c }), stripEmoji(label));
  });
  $$("[data-copy]", f).forEach((el) => el.onclick = () => { navigator.clipboard?.writeText(el.dataset.copy); toast("✓ " + el.dataset.copy); });
  const rf = () => talk(() => api("/bot/latest"));
  $("#refreshBtn") && ($("#refreshBtn").onclick = rf);
  $("#refreshBtn2") && ($("#refreshBtn2").onclick = rf);
  $("#replyForm") && ($("#replyForm").onsubmit = (e) => { e.preventDefault(); const v = $("#replyInput").value.trim(); if (v) talk(() => api("/bot/send", "POST", { text: v }), v); });
  $("#newOpBtn") && ($("#newOpBtn").onclick = () => { resetOperation(); route(); });
  const last = f.lastElementChild; last && last.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---- the client behind the typed number (debts, credit limit, family lines) ---- */
const clientNums = (c) => (c?.numbers || []).map((n) => n.number || n);
const saleRest = () => { const s = S.rc.sale; return Math.max(0, (Number(s.total) || 0) - (Number(s.paid === "" ? s.total : s.paid) || 0)); };
function creditStatus(c, extra = 0) {
  if (!c) return null;
  const debt = Number(c.debt) || 0, after = debt + extra, lim = c.credit_limit;
  if (lim !== null && lim !== undefined && lim !== "") {
    const left = Number(lim) - after;
    if (left < -0.001) return { cls: "red", text: t("limit_exceeded"), left };
    return { cls: debt > 0 ? "amber" : "green", text: t("can_topup"), left };
  }
  return debt > 0.001 ? { cls: "amber", text: t("has_debts") } : { cls: "green", text: t("can_topup") };
}

let lookupTimer = null;
function lookupClientByNumber(raw) {
  clearTimeout(lookupTimer);
  const n = normNum(raw);
  const r = S.rc;
  if (n.length !== 10) { if (r.autoClient) { r.clientInfo = null; r.sale.client = null; r.autoClient = false; } renderClientBox(); renderSalePanel(); return; }
  lookupTimer = setTimeout(async () => {
    let c = null;
    try { c = await api("/clients/by_number?n=" + n, "GET", null, true); } catch {}
    if (normNum(S.rc.number) !== n) return;   // typed something else meanwhile
    if (c) { r.clientInfo = c; r.sale.client = { id: c.id, name: c.name }; r.autoClient = true; }
    else if (r.autoClient) { r.clientInfo = null; r.sale.client = null; r.autoClient = false; }
    renderClientBox(); renderSalePanel();
  }, 250);
}

function renderClientBox() {
  const box = $("#clientBox"); if (!box) return;
  const r = S.rc, c = r.clientInfo, n = normNum(r.number);
  if (!c) {
    box.className = n.length === 10 ? "card client-box unknown" : "hidden";
    box.innerHTML = `<div class="row" style="gap:12px"><div class="avatar" style="flex:none">?</div><div><div class="t">${t("unknown_number")}</div><div class="sub">${t("unknown_number_hint")}</div></div></div>`;
    return;
  }
  const st = creditStatus(c, saleRest());
  const nums = (c.numbers || []).map((x) => typeof x === "string" ? { number: x } : x);
  const here = normNum(r.number);
  box.className = "card client-box " + st.cls;
  box.innerHTML = `
    <div class="cb-head">
      <div class="avatar">${esc(initials(c.name))}</div>
      <div class="grow"><div class="t">${esc(c.name)}</div>
        <div class="sub">${c.number_label ? `<span class="pill accent">${esc(c.number_label)}</span> ` : ""}${nums.length} ${t("numbers_count")}</div></div>
      ${isMgr() ? "" : `<button class="icon-btn eye ${S.reveal ? "on" : ""}" id="revealBtn" title="${t("show_amounts")}">${svg("eye")}</button>`}
      <button class="btn sm" id="cbStatement">${t("statement")}</button>
    </div>
    <div class="cb-status ${st.cls}">${st.cls === "green" ? "✓" : st.cls === "red" ? "⛔" : "!"} ${st.text}</div>
    <div class="cb-grid">
      <div><span>${t("debt")}</span><b class="${c.debt > 0.001 ? "amt-out" : "amt-in"}">${secret(money(c.debt))}</b></div>
      <div><span>${t("credit_limit")}</span><b>${c.credit_limit != null ? secret(money(c.credit_limit)) : "—"}</b></div>
      ${st.left !== undefined ? `<div><span>${t("credit_left")}</span><b class="${st.left < 0 ? "amt-out" : ""}">${secret(money(st.left))}</b></div>` : ""}
    </div>
    <div class="cb-nums">${nums.map((x) => x.number === here || isMgr()
      ? `<span class="num-chip ${x.number === here ? "on" : ""}"><i class="opdot op-${opOf(x.number)}"></i><span class="num">${esc(x.number)}</span>${x.label ? ` · ${esc(x.label)}` : ""}</span>`
      : `<span class="num-chip"><i class="opdot op-${opOf(x.number)}"></i><span class="num">${esc(maskNum(x.number))}</span></span>`).join("")}</div>`;
  $("#cbStatement").onclick = () => openStatement(c.id);
  $("#revealBtn") && ($("#revealBtn").onclick = () => { S.reveal = !S.reveal; renderClientBox(); clearTimeout(S.revealTimer);
    if (S.reveal) S.revealTimer = setTimeout(() => { S.reveal = false; renderClientBox(); }, 8000); });
}

function freshSale() { return { kind: "", total: "", paid: "", client: null, sim: "" }; }
function resetOperation() {
  Object.assign(S.rc, { number: "", amount: "", feed: [], batch: [], pending: null, flow: "", lastText: "", sale: freshSale(), clientInfo: null, autoClient: false });
}

function renderSalePanel(flash) {
  const p = $("#salePanel"); if (!p) return;
  const s = S.rc.sale, r = S.rc;
  const rest = saleRest();
  const sim = normNum(s.sim || r.number);
  const linked = s.client && r.clientInfo && r.clientInfo.id === s.client.id ? clientNums(r.clientInfo).includes(sim) : false;
  const offerAttach = s.client && sim.length === 10 && opOf(sim) && !linked;
  p.innerHTML = `
    <h2>${t("record_sale")}</h2>
    <div class="field"><label>${t("sale_type")}</label>
      <div class="kind-seg" id="sKind">${SALE_KINDS.map((k) => `<button type="button" data-k="${k}" class="${s.kind === k ? "on" : ""}">${t("kind_" + k)}</button>`).join("")}</div></div>
    <div class="row">
      <div class="field"><label>${t("amount")}</label><input class="input num" id="sTotal" inputmode="decimal" value="${esc(s.total)}"></div>
      <div class="field"><label>${t("paid")}</label><input class="input num" id="sPaid" inputmode="decimal" value="${esc(s.paid)}"></div>
    </div>
    <div class="field"><label>${t("client")}</label>${clientCombo(s.client)}</div>
    ${offerAttach ? `<label class="attach"><input type="checkbox" id="sAttach" ${s.attach !== false ? "checked" : ""}>
        <span>${t("attach_number").replace("{n}", `<b class="num">${esc(sim)}</b>`).replace("{c}", `<b>${esc(s.client.name)}</b>`)}</span></label>
        <input class="input" id="sLabel" placeholder="${t("number_label_ph")}" value="${esc(s.label || "")}" style="margin-bottom:12px">` : ""}
    <div class="debt-preview ${rest > 0 ? "has" : ""}"><span>${t("rest")}</span>${money(rest)}</div>
    <button class="btn primary" style="width:100%" id="sSave">${t("save_next")}</button>`;
  if (flash) { p.animate([{ boxShadow: "0 0 0 4px rgba(18,161,80,.35)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1400 }); }
  const sync = () => { s.total = $("#sTotal").value; s.paid = $("#sPaid").value; };
  $$("#sKind button", p).forEach((b) => b.onclick = () => { s.kind = b.dataset.k; $$("#sKind button", p).forEach((x) => x.classList.toggle("on", x === b)); });
  $("#sTotal").oninput = () => { const old = s.total; sync(); if (String(s.paid) === String(old) || s.paid === "") { s.paid = s.total; $("#sPaid").value = s.total; } updRest(); };
  $("#sPaid").oninput = () => { sync(); updRest(); };
  const updRest = () => { const rr = saleRest(); const d = $(".debt-preview", p); d.className = "debt-preview " + (rr > 0 ? "has" : ""); d.lastElementChild.outerHTML = money(rr); renderClientBox(); };
  $("#sAttach") && ($("#sAttach").onchange = (e) => { s.attach = e.target.checked; });
  $("#sLabel") && ($("#sLabel").oninput = (e) => { s.label = e.target.value; });
  bindCombo(p, (c) => {
    s.client = c ? { id: c.id, name: c.name } : null;
    r.autoClient = false;
    r.clientInfo = c && c.debt !== undefined ? c : null;
    renderClientBox(); renderSalePanel();
  });
  $("#sSave").onclick = async () => {
    sync();
    if (!s.kind) { $("#sKind").animate([{ transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "none" }], { duration: 250 }); return toast(t("err_kind_required"), "err"); }
    if (!(Number(s.total) > 0)) return toast(t("err_invalid_amount"), "err");
    const st = creditStatus(r.clientInfo && s.client && r.clientInfo.id === s.client.id ? r.clientInfo : null, saleRest());
    if (st && st.cls === "red" && !confirm(t("limit_confirm"))) return;
    const btn = $("#sSave"); btn.disabled = true;
    try {
      await api("/sales", "POST", {
        total: s.total, paid: s.paid === "" ? s.total : s.paid, client_id: s.client?.id, kind: s.kind, description: KIND_STORED[s.kind],
        sim_number: sim, bot_reply: r.lastText,
        attach_number: !!(offerAttach && s.attach !== false), number_label: s.label || "",
      });
    } catch { btn.disabled = false; return; }
    toast(t("sale_saved"), "ok");
    resetOperation();          // everything validated: clean screen for the next customer
    pageRecharge($("#view"));
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
    list.innerHTML = `<div data-id="">${t("walk_in")}</div>` + S.clients.slice(0, 30).map((c) => `<div data-id="${c.id}"><span>${esc(c.name)} <span class="sub num">${esc((c.numbers || [])[0] || c.phone || "")}${(c.numbers || []).length > 1 ? ` +${c.numbers.length - 1}` : ""}</span></span>${c.debt > 0 ? `<span class="pill red">${secret(money(c.debt))}</span>` : ""}</div>`).join("")
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
      const c = { id, name: inp.value.trim(), debt: 0, credit_limit: null, numbers: [] }; onPick(c); toast(t("saved"), "ok");
    } else {
      const c = S.clients.find((x) => String(x.id) === d.dataset.id) || null;
      onPick(c); inp.value = c ? c.name : "";
    }
    list.classList.add("hidden"); inp.blur();
  };
}

async function checkRegister() {
  try {
    const reg = await api("/register", "GET", null, true);
    const el = $("#regBanner"); if (!el) return;
    el.innerHTML = reg.status === "open" ? "" : `<div class="notice reg-warn">${reg.status === "closed" ? t("register_is_closed") : t("register_not_open")}
      <a class="btn sm" href="#register">${t("nav_register")}</a></div>`;
  } catch {}
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
  const who = isMgr() ? `${esc(s.client_name || t("walkin_short"))}${s.by_name ? ` · ${esc(s.by_name)}` : ""}` : (s.client_id ? t("client") : t("walkin_short"));
  return `<div class="item"><div class="grow"><div class="t">${esc(kindLabel(s))}${s.operator ? ` <span class="sub">${esc(s.operator)}</span>` : ""}</div>
    <div class="s"><span class="num">${esc(isMgr() ? s.sim_number : maskNum(s.sim_number))}</span> · ${who} · ${hm(s.ts)}</div></div>
    <div style="text-align:end">${money(s.total)}${debt > 0.001 ? `<div><span class="pill red">${secret(money(debt))}</span></div>` : ""}</div></div>`;
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
    <div class="kpi"><div class="l">${t("safe_balance")}</div><div class="v">${money(d.safe_balance)}</div></div>
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
      ${d.top_debtors.length ? d.top_debtors.map((c) => `<div class="item click" data-c="${c.id}"><div class="avatar">${esc(initials(c.name))}</div><div class="grow"><div class="t">${esc(c.name)}</div><div class="s num">${esc((c.numbers || [])[0] || c.phone || "")}</div></div><span class="pill red">${money(c.debt)}</span></div>`).join("") : `<div class="empty">${t("nothing")}</div>`}
    </div></div>
  </div>
  <div class="card" style="margin-top:16px"><h2>${t("recent")}</h2><div class="list">${d.recent_sales.length ? d.recent_sales.map(saleItem).join("") : `<div class="empty">${t("nothing")}</div>`}</div></div>`;
  $$("[data-c]", v).forEach((el) => el.onclick = () => openClient(el.dataset.c));
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
      <div class="grow"><div class="t">${esc(c.name)}</div><div class="s"><span class="num">${esc(c.numbers[0] || c.phone || "")}</span>${c.numbers.length > 1 ? ` <span class="pill">+${c.numbers.length - 1} ${t("lines_short")}</span>` : ""}${c.last_sale ? ` · ${dmy(c.last_sale)}` : ""}</div></div>
      ${c.credit_limit != null && c.debt > c.credit_limit ? `<span class="pill red">⛔</span>` : ""}
      ${c.debt > 0.001 ? `<span class="pill red">${money(c.debt)}</span>` : `<span class="pill green">${t("clear")}</span>`}</div>`).join("") : `<div class="empty">${t("nothing")}</div>`;
    $$("[data-c]", v).forEach((el) => el.onclick = () => openClient(el.dataset.c, load));
  };
  $("#cq").oninput = load;
  $("#cNew").onclick = () => editClient(null, load);
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

/* ---- client account: edit (numbers, credit limit), delete, statement ---- */
function editClient(obj, done) {
  const o = obj || {};
  let nums = (o.numbers || []).map((n) => ({ ...n }));
  modal(`<div class="modal-head"><h1>${o.id ? t("edit") : t("new_client")}</h1><button class="btn ghost" onclick="closeModal()">✕</button></div>
    <form id="pf">
      <div class="row"><div class="field"><label>${t("name")}</label><input class="input" name="name" required value="${esc(o.name)}"></div>
        <div class="field"><label>${t("phone")}</label><input class="input num" name="phone" value="${esc(o.phone)}"></div></div>
      <div class="field"><label>${t("credit_limit")}</label><input class="input num" name="credit_limit" inputmode="numeric" placeholder="${t("no_limit")}" value="${o.credit_limit ?? ""}" ${isMgr() ? "" : "disabled"}>
        <span class="sub">${t("credit_limit_hint")}</span></div>
      <div class="field"><label>${t("lines")}</label><div id="numList" class="num-list"></div>
        <div class="row" style="margin-top:8px"><input class="input num" id="nNum" inputmode="tel" placeholder="06 XX XX XX XX"><input class="input" id="nLabel" placeholder="${t("number_label_ph")}">
        <button type="button" class="btn" id="nAdd" style="flex:none">+ ${t("add")}</button></div></div>
      <div class="field"><label>${t("note")}</label><textarea class="input" name="note" rows="2">${esc(o.note)}</textarea></div>
      <button class="btn primary">${t("save")}</button></form>`);
  const drawNums = () => {
    $("#numList").innerHTML = nums.length ? nums.map((n, i) => `<div class="num-row"><i class="opdot op-${opOf(n.number)}"></i><span class="num">${esc(n.number)}</span>
      <span class="sub grow">${esc(n.label || "")}</span><span class="pill">${opOf(n.number) || ""}</span><button type="button" class="btn ghost sm" data-del="${i}">✕</button></div>`).join("")
      : `<div class="sub">${t("no_lines")}</div>`;
    $$("[data-del]", $("#numList")).forEach((b) => b.onclick = async () => {
      const n = nums[+b.dataset.del];
      if (o.id && n.id) { if (!confirm(t("confirm_delete"))) return; nums = await api(`/clients/${o.id}/numbers/${n.id}/delete`, "POST", {}); }
      else nums.splice(+b.dataset.del, 1);
      drawNums();
    });
  };
  drawNums();
  $("#nAdd").onclick = async () => {
    const number = normNum($("#nNum").value), label = $("#nLabel").value.trim();
    if (number.length !== 10 || !opOf(number)) return toast(t("err_invalid_number"), "err");
    if (o.id) nums = await api(`/clients/${o.id}/numbers`, "POST", { number, label });
    else if (!nums.some((n) => n.number === number)) nums.push({ number, label });
    $("#nNum").value = ""; $("#nLabel").value = ""; $("#nNum").focus(); drawNums();
  };
  $("#nNum").onkeydown = $("#nLabel").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("#nAdd").click(); } };
  $("#pf [name=name]").focus();
  $("#pf").onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (!isMgr()) delete data.credit_limit;
    if (!o.id) data.numbers = nums;
    const res = await api("/clients" + (o.id ? `/${o.id}` : ""), o.id ? "PUT" : "POST", data);
    toast(t("saved"), "ok"); closeModal(); done && done(res.id);
  };
}

const openClient = (id, onChange) => openStatement(id, onChange);

async function openStatement(id, onChange, f) {
  f = f || { from: "", to: "", number: "", operator: "" };
  const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const st = await api(`/clients/${id}/statement` + (q ? "?" + q : ""));
  const c = st.client, cs = creditStatus(c);
  const today = new Date().toLocaleDateString("sv-SE");
  const month0 = today.slice(0, 8) + "01";
  const d = new Date(); d.setDate(0); const lastEnd = d.toLocaleDateString("sv-SE"); const lastStart = lastEnd.slice(0, 8) + "01";
  modal(`
    <div class="modal-head">
      <div class="row" style="flex:1;gap:12px"><div class="avatar" style="flex:none;width:46px;height:46px">${esc(initials(c.name))}</div>
        <div><h1>${esc(c.name)}</h1><div class="sub">${t("statement")} · ${esc(S.settings.shop_name || "")} · ${dmyFull(today)}</div></div></div>
      <div class="row no-print" style="flex:none">
        <button class="btn sm" id="stEdit">${t("edit")}</button>
        <button class="btn sm" onclick="window.print()">${t("print")}</button>
        ${isMgr() ? `<button class="btn sm red" id="stDel">${t("delete")}</button>` : ""}
        <button class="btn ghost" onclick="closeModal()">✕</button></div>
    </div>
    <div class="cb-nums" style="margin-bottom:14px">${st.numbers.map((n) => `<span class="num-chip"><i class="opdot op-${n.operator}"></i><span class="num">${esc(n.number)}</span>${n.label ? ` · ${esc(n.label)}` : ""}</span>`).join("") || `<span class="sub">${t("no_lines")}</span>`}</div>
    <div class="kpis st-kpis">
      <div class="kpi"><div class="l">${t("debt")}</div><div class="v ${c.debt > 0.001 ? "amt-out" : "amt-in"}">${money(c.debt)}</div></div>
      <div class="kpi"><div class="l">${t("credit_limit")}</div><div class="v">${c.credit_limit != null ? money(c.credit_limit) : "—"}</div></div>
      <div class="kpi"><div class="l">${t("status")}</div><div class="v" style="font-size:16px"><span class="pill ${cs.cls}">${cs.text}</span></div></div>
    </div>
    ${c.debt > 0.001 ? `<form class="row no-print" id="payF" style="margin-bottom:16px"><input class="input num" name="amount" inputmode="decimal" placeholder="${t("amount")}" value="${Math.round(c.debt)}"><input class="input" name="note" placeholder="${t("note")}"><button class="btn green" style="flex:none">${t("collect")}</button></form>` : ""}
    <div class="st-filters no-print">
      <div class="field"><label>${t("date_from")}</label><input type="date" class="input" id="fFrom" value="${f.from}"></div>
      <div class="field"><label>${t("date_to")}</label><input type="date" class="input" id="fTo" value="${f.to}"></div>
      <div class="field"><label>${t("line")}</label><select class="input" id="fNum"><option value="">${t("all_lines")}</option>
        ${st.numbers.map((n) => `<option value="${n.number}" ${f.number === n.number ? "selected" : ""}>${n.number}${n.label ? " · " + esc(n.label) : ""}</option>`).join("")}</select></div>
      <div class="field"><label>${t("operator")}</label><select class="input" id="fOp"><option value="">${t("all_operators")}</option>
        ${["Mobilis", "Djezzy", "Ooredoo"].map((o) => `<option ${f.operator === o ? "selected" : ""}>${o}</option>`).join("")}</select></div>
      <div class="quick-ranges">
        <button class="btn sm" data-range="month">${t("this_month")}</button>
        <button class="btn sm" data-range="last">${t("last_month")}</button>
        <button class="btn sm ghost" data-range="all">${t("all_time")}</button></div>
    </div>
    ${(f.from || f.to || f.number || f.operator) ? `<div class="sub print-only-show" style="margin-bottom:8px">${[f.from && t("date_from") + " " + dmyFull(f.from), f.to && t("date_to") + " " + dmyFull(f.to), f.number, f.operator].filter(Boolean).join(" · ")}</div>` : ""}
    ${st.by_line ? `<div class="notice" style="margin-bottom:12px">${t("by_line_note")}</div>` : ""}
    <div class="st-table-wrap"><table class="st-table">
      <thead><tr><th>${t("date")}</th><th>${t("line")}</th><th>${t("operation")}</th><th class="r">${t("amount")}</th><th class="r">${t("paid")}</th><th class="r">${st.by_line ? t("rest") : t("balance")}</th></tr></thead>
      <tbody>
        ${!st.by_line && f.from ? `<tr class="opening"><td colspan="5">${t("opening_balance")}</td><td class="r">${money(st.opening)}</td></tr>` : ""}
        ${st.lines.length ? st.lines.map((l) => l.type === "payment"
          ? `<tr class="pay-row"><td class="num">${dmyFull(l.day)} ${hm(l.ts)}</td><td>—</td><td><span class="pill green">${t("payment")}</span> ${esc(l.description)}</td><td class="r"></td><td class="r amt-in">${money(l.credit)}</td><td class="r">${money(l.balance)}</td></tr>`
          : `<tr><td class="num">${dmyFull(l.day)} ${hm(l.ts)}</td><td><i class="opdot op-${l.operator}"></i><span class="num">${esc(l.number || "—")}</span>${l.label ? `<div class="sub">${esc(l.label)}</div>` : ""}</td>
              <td>${esc(kindLabel(l))}</td><td class="r">${money(l.debit)}</td><td class="r">${money(l.credit)}</td>
              <td class="r ${l.debit - l.credit > 0.001 ? "amt-out" : ""}">${money(st.by_line ? l.debit - l.credit : l.balance)}</td></tr>`).join("")
          : `<tr><td colspan="6" class="empty">${t("nothing")}</td></tr>`}
      </tbody>
      <tfoot><tr><td colspan="3">${t("total")} · ${st.count} ${t("operations")}</td><td class="r">${money(st.total_debit)}</td><td class="r">${money(st.total_credit)}</td><td class="r">${money(st.by_line ? st.total_debit - st.total_credit : st.closing)}</td></tr></tfoot>
    </table></div>`, "wide");
  const again = (nf) => openStatement(id, onChange, nf || f);
  const read = () => ({ from: $("#fFrom").value, to: $("#fTo").value, number: $("#fNum").value, operator: $("#fOp").value });
  ["#fFrom", "#fTo", "#fNum", "#fOp"].forEach((sel) => $(sel).onchange = () => again(read()));
  $$("[data-range]").forEach((b) => b.onclick = () => {
    const r = b.dataset.range;
    again({ ...read(), from: r === "month" ? month0 : r === "last" ? lastStart : "", to: r === "month" ? "" : r === "last" ? lastEnd : "" });
  });
  $("#stEdit").onclick = async () => {
    const full = await api("/clients/" + id);
    editClient(full, () => { onChange && onChange(); refreshRechargeClient(); again(); });
  };
  $("#stDel") && ($("#stDel").onclick = async () => {
    const msg = t("delete_client_confirm").replace("{c}", c.name) + (c.debt > 0.001 ? "\n" + t("delete_client_debt").replace("{d}", Math.round(c.debt)) : "");
    if (!confirm(msg)) return;
    await api(`/clients/${id}/delete`, "POST", {});
    toast(t("deleted"), "ok"); closeModal();
    if (S.rc.clientInfo?.id === id) { S.rc.clientInfo = null; S.rc.sale.client = null; S.rc.autoClient = false; }
    onChange && onChange(); refreshRechargeClient();
  });
  $("#payF") && ($("#payF").onsubmit = async (e) => {
    e.preventDefault();
    await api(`/clients/${id}/pay`, "POST", Object.fromEntries(new FormData(e.target)));
    toast(t("saved"), "ok"); onChange && onChange(); refreshRechargeClient(); again();
  });
}
function refreshRechargeClient() {
  if (!$("#clientBox")) return;
  if (S.rc.clientInfo) { S.rc.clientInfo = null; lookupClientByNumber(S.rc.number); } else { renderClientBox(); renderSalePanel(); }
}
const dmyFull = (d) => { const p = (d || "").slice(0, 10).split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : ""; };

/* ---------------- REGISTER (caisse) ---------------- */
const CATS = { in: ["other_in", "deposit"], out: ["expense", "withdrawal", "salary", "purchase", "other"] };
const catLabel = (c) => (t("cat_" + c) !== "cat_" + c ? t("cat_" + c) : t(c));

async function pageRegister(v, day) {
  const today = new Date().toLocaleDateString("sv-SE");
  day = isMgr() ? (day || today) : today;          // operators only work on today's register
  const r = await api("/register?day=" + day);
  const isToday = day === today;
  const open = r.status === "open", closed = r.status === "closed";
  let dir = "out";
  const cats = isMgr() ? CATS : { in: ["other_in"], out: ["expense", "other"] };
  v.innerHTML = `
  <div class="page-head"><h1>${t("day_register")}</h1>
    ${isMgr() ? `<input type="date" class="input" id="regDay" value="${day}" max="${today}" style="width:auto">` : `<span class="sub">${t("today")} · ${dmy(day)}</span>`}</div>
  ${r.status === "none" && isToday ? `<div class="card open-card"><h2>${t("register_closed_title")}</h2>
     <p class="sub">${S.settings.float_from_safe ? t("float_from_safe_hint") : ""}</p>
     <form class="row" id="openF"><input class="input num" name="opening" inputmode="decimal" value="${Math.round(r.suggested_opening || 0)}"><button class="btn primary" style="flex:none">${t("open")}</button></form></div>` : ""}
  ${r.status === "none" && !isToday ? `<div class="empty card">${t("nothing")}</div>` : ""}
  ${r.status !== "none" ? `
  <div class="kpis">
    <div class="kpi"><div class="l">${t("opening")}</div><div class="v">${money(r.opening || 0)}</div></div>
    <div class="kpi"><div class="l">${t("kpi_in")}</div><div class="v amt-in">${money(r.total_in)}</div></div>
    <div class="kpi"><div class="l">${t("kpi_out")}</div><div class="v amt-out">${money(r.total_out)}</div></div>
    <div class="kpi accent"><div class="l">${t("expected")}</div><div class="v">${money(r.expected)}</div></div>
    ${closed ? `<div class="kpi"><div class="l">${t("counted")}</div><div class="v">${money(r.counted)}</div></div>
      <div class="kpi"><div class="l">${t("difference")}</div><div class="v ${Math.abs(r.difference) < 1 ? "amt-in" : "amt-out"}">${r.difference > 0 ? "+" : ""}${money(r.difference)}</div></div>` : ""}
  </div>
  <div class="grid g2">
    <div>
      ${isToday && open ? `<div class="card" style="margin-bottom:16px"><h2>${t("add_move")}</h2>
        <div class="seg" id="dirSeg"><button data-d="in">${t("money_in")}</button><button data-d="out" class="on">${t("money_out")}</button></div>
        <form id="mvF"><div class="row"><div class="field"><label>${t("category")}</label><select class="input" name="category" id="mvCat"></select></div>
          <div class="field"><label>${t("amount")}</label><input class="input num" name="amount" inputmode="decimal" required></div></div>
          <div class="field"><label>${t("note")}</label><input class="input" name="note"></div>
          <button class="btn primary">${t("save")}</button></form></div>
        <div class="card"><h2>${t("close_register")}</h2>
          <p class="sub">${t("close_to_safe_hint")}</p>
          <form id="closeF"><div class="row"><div class="field"><label>${t("counted")}</label><input class="input num" name="counted" inputmode="decimal" required placeholder="${Math.round(r.expected)}"></div>
          <div class="field"><label>${t("note")}</label><input class="input" name="note"></div></div>
          <button class="btn green">${t("close_register")}</button></form></div>`
      : closed ? `<div class="card"><div class="status-box"><span class="dot on"></span>${t("closed")} · ${hm(r.closed_at)} · ${esc(r.closed_by || "")}</div>
          <p class="sub">${t("sent_to_safe")} ${money(r.counted)}</p>${esc(r.note)} ${isMgr() ? `<button class="btn sm" id="reopenB">${t("reopen")}</button>` : ""}</div>` : ""}
      <div class="card" style="margin-top:16px"><h2>${t("by_cat")}</h2>
        ${r.by_category.length ? `<table><tbody>${r.by_category.map((c) => `<tr><td>${catLabel(c.category)}</td><td style="text-align:end" class="${c.direction === "in" ? "amt-in" : "amt-out"}">${c.direction === "in" ? "+" : "−"}${money(c.amount)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">${t("nothing")}</div>`}
        ${r.new_debt > 0 ? `<div class="sub" style="margin-top:10px">${t("rest")} : ${money(r.new_debt)}</div>` : ""}
      </div>
    </div>
    <div class="card"><h2>${t("moves")}</h2><div class="list">
      ${r.moves.length ? r.moves.map((m) => `<div class="item"><div class="grow"><div class="t">${catLabel(m.category)}</div><div class="s">${hm(m.ts)} · ${esc(m.note)}${isMgr() && m.by_name ? ` · ${esc(m.by_name)}` : ""}</div></div>
        <span class="${m.direction === "in" ? "amt-in" : "amt-out"}">${m.direction === "in" ? "+" : "−"}${money(m.amount)}</span>
        ${isMgr() && m.ref_type === "manual" && isToday && open ? `<button class="btn ghost sm" data-del="${m.id}">✕</button>` : ""}</div>`).join("") : `<div class="empty">${t("nothing")}</div>`}
    </div></div>
  </div>` : ""}`;
  $("#regDay") && ($("#regDay").onchange = (e) => pageRegister(v, e.target.value));
  const fillCats = () => { $("#mvCat").innerHTML = cats[dir].map((c) => `<option value="${c}">${catLabel(c)}</option>`).join(""); };
  if ($("#mvCat")) {
    fillCats();
    $$("#dirSeg button").forEach((b) => b.onclick = () => { dir = b.dataset.d; $$("#dirSeg button").forEach((x) => x.classList.toggle("on", x === b)); fillCats(); });
    $("#mvF").onsubmit = async (e) => { e.preventDefault(); await api("/register/move", "POST", { ...Object.fromEntries(new FormData(e.target)), direction: dir }); toast(t("saved"), "ok"); pageRegister(v, day); };
    $("#closeF").onsubmit = async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (!confirm(t("close_confirm").replace("{a}", Math.round(Number(d.counted) || 0)))) return;
      await api("/register/close", "POST", d); toast(t("closed"), "ok"); pageRegister(v, day);
    };
  }
  $("#openF") && ($("#openF").onsubmit = async (e) => { e.preventDefault(); await api("/register/open", "POST", Object.fromEntries(new FormData(e.target))); pageRegister(v, day); });
  $("#reopenB") && ($("#reopenB").onclick = async () => { if (confirm(t("reopen_confirm"))) { await api("/register/reopen", "POST", { day }); pageRegister(v, day); } });
  $$("[data-del]", v).forEach((b) => b.onclick = async () => { if (confirm(t("confirm_delete"))) { await api(`/register/move/${b.dataset.del}/delete`, "POST", {}); pageRegister(v, day); } });
}

/* ---------------- SAFE (manager) ---------------- */
const SAFE_CATS = { in: ["deposit", "bank_withdrawal", "other_in"], out: ["withdrawal", "bank_deposit", "expense", "salary", "other"] };
async function pageSafe(v, f) {
  f = f || { from: new Date().toLocaleDateString("sv-SE").slice(0, 8) + "01", to: "" };
  const q = new URLSearchParams(Object.entries(f).filter(([, x]) => x)).toString();
  const sf = await api("/safe" + (q ? "?" + q : ""));
  let dir = "out";
  v.innerHTML = `
  <div class="page-head"><h1>${t("nav_safe")}</h1>
    <div class="row" style="flex:0 1 420px"><input type="date" class="input" id="sfFrom" value="${f.from}"><input type="date" class="input" id="sfTo" value="${f.to}"></div></div>
  <div class="kpis">
    <div class="kpi accent"><div class="l">${t("safe_balance")}</div><div class="v">${money(sf.balance)}</div></div>
    <div class="kpi"><div class="l">${t("kpi_in")} (${t("period")})</div><div class="v amt-in">${money(sf.total_in)}</div></div>
    <div class="kpi"><div class="l">${t("kpi_out")} (${t("period")})</div><div class="v amt-out">${money(sf.total_out)}</div></div>
  </div>
  <div class="grid g2">
    <div class="card"><h2>${t("add_move")}</h2>
      <div class="seg" id="sDir"><button data-d="in">${t("money_in")}</button><button data-d="out" class="on">${t("money_out")}</button></div>
      <form id="sfF"><div class="row"><div class="field"><label>${t("category")}</label><select class="input" name="category" id="sfCat"></select></div>
        <div class="field"><label>${t("amount")}</label><input class="input num" name="amount" inputmode="decimal" required></div></div>
        <div class="field"><label>${t("note")}</label><input class="input" name="note"></div>
        <button class="btn primary">${t("save")}</button></form>
      <p class="sub" style="margin-top:12px">${t("safe_help")}</p></div>
    <div class="card"><h2>${t("moves")}</h2><div class="list">
      ${sf.moves.length ? sf.moves.map((m) => `<div class="item"><div class="grow"><div class="t">${catLabel(m.category)}${m.ref_day ? ` <span class="pill">${dmy(m.ref_day)}</span>` : ""}</div>
        <div class="s">${[`${dmy(m.ts)} ${hm(m.ts)}`, esc(m.note), esc(m.by_name || "")].filter(Boolean).join(" · ")}</div></div>
        <span class="${m.direction === "in" ? "amt-in" : "amt-out"}">${m.direction === "in" ? "+" : "−"}${money(m.amount)}</span>
        ${m.manual ? `<button class="btn ghost sm" data-sdel="${m.id}">✕</button>` : ""}</div>`).join("") : `<div class="empty">${t("nothing")}</div>`}
    </div></div>
  </div>`;
  const fill = () => { $("#sfCat").innerHTML = SAFE_CATS[dir].map((c) => `<option value="${c}">${catLabel(c)}</option>`).join(""); };
  fill();
  $$("#sDir button").forEach((b) => b.onclick = () => { dir = b.dataset.d; $$("#sDir button").forEach((x) => x.classList.toggle("on", x === b)); fill(); });
  $("#sfF").onsubmit = async (e) => { e.preventDefault(); await api("/safe/move", "POST", { ...Object.fromEntries(new FormData(e.target)), direction: dir }); toast(t("saved"), "ok"); pageSafe(v, f); };
  $("#sfFrom").onchange = $("#sfTo").onchange = () => pageSafe(v, { from: $("#sfFrom").value, to: $("#sfTo").value });
  $$("[data-sdel]", v).forEach((b) => b.onclick = async () => { if (confirm(t("confirm_delete"))) { await api(`/safe/move/${b.dataset.sdel}/delete`, "POST", {}); pageSafe(v, f); } });
}

/* ---------------- USERS (manager) ---------------- */
async function pageUsers(v) {
  const users = await api("/users");
  v.innerHTML = `
  <div class="page-head"><h1>${t("nav_users")}</h1><button class="btn primary" id="uNew">+ ${t("new_user")}</button></div>
  <div class="card"><div class="list">
    ${users.map((u) => `<div class="item"><div class="avatar">${esc(initials(u.name || u.email))}</div>
      <div class="grow"><div class="t">${esc(u.name || "")} ${u.id === S.user.uid ? `<span class="pill">${t("you")}</span>` : ""}</div><div class="s">${esc(u.email)}</div></div>
      <span class="pill ${u.role === "manager" ? "accent" : ""}">${t("role_" + u.role)}</span>
      ${u.active === false ? `<span class="pill red">${t("disabled")}</span>` : ""}
      ${u.id !== S.user.uid ? `<button class="btn sm" data-u="${u.id}">${t("edit")}</button>` : ""}</div>`).join("")}
  </div></div>
  <p class="sub" style="margin-top:12px">${t("users_help")}</p>`;
  $("#uNew").onclick = () => {
    modal(`<div class="modal-head"><h1>${t("new_user")}</h1><button class="btn ghost" onclick="closeModal()">✕</button></div>
      <form id="uf"><div class="field"><label>${t("name")}</label><input class="input" name="name" required></div>
      <div class="field"><label>${t("email")}</label><input class="input" type="email" name="email" required autocomplete="off"></div>
      <div class="field"><label>${t("pwd")} (≥ 6)</label><input class="input" type="text" name="password" required minlength="6" autocomplete="new-password"></div>
      <div class="field"><label>${t("role")}</label><select class="input" name="role"><option value="operator">${t("role_operator")}</option><option value="manager">${t("role_manager")}</option></select></div>
      <button class="btn primary">${t("save")}</button></form>`);
    $("#uf").onsubmit = async (e) => { e.preventDefault(); await api("/users", "POST", Object.fromEntries(new FormData(e.target))); toast(t("saved"), "ok"); closeModal(); pageUsers(v); };
  };
  $$("[data-u]", v).forEach((b) => b.onclick = () => {
    const u = users.find((x) => x.id === b.dataset.u);
    modal(`<div class="modal-head"><h1>${esc(u.name || u.email)}</h1><button class="btn ghost" onclick="closeModal()">✕</button></div>
      <form id="uf"><div class="field"><label>${t("name")}</label><input class="input" name="name" value="${esc(u.name)}"></div>
      <div class="field"><label>${t("role")}</label><select class="input" name="role"><option value="operator" ${u.role === "operator" ? "selected" : ""}>${t("role_operator")}</option><option value="manager" ${u.role === "manager" ? "selected" : ""}>${t("role_manager")}</option></select></div>
      <label class="switch"><input type="checkbox" name="active" ${u.active !== false ? "checked" : ""}> ${t("account_active")}</label>
      <div class="row"><button class="btn primary">${t("save")}</button><button type="button" class="btn" id="uReset">${t("send_reset")}</button></div></form>`);
    $("#uf").onsubmit = async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); d.active = e.target.active.checked;
      await api(`/users/${u.id}`, "PUT", d); toast(t("saved"), "ok"); closeModal(); pageUsers(v); };
    $("#uReset").onclick = async () => { await api(`/users/${u.id}/reset`, "POST", { email: u.email }); toast(t("reset_sent"), "ok"); };
  });
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
    $$("[data-s]", v).forEach((el) => el.onclick = () => openSupplier(el.dataset.s, load));
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
      <form class="card" id="spF"><h2>${t("pay_supplier")}</h2><p class="sub">${t("paid_from_safe")}</p><div class="field"><label>${t("amount")}</label><input class="input num" name="amount" inputmode="decimal" required value="${s.owed > 0 ? Math.round(s.owed) : ""}"></div>
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

/* ---------------- SETTINGS (manager) ---------------- */
async function pageSettings(v) {
  const st = S.settings = await api("/settings");
  await refreshStatus(); renderShell();
  v.innerHTML = `<div class="page-head"><h1>${t("settings")}</h1>
      <div class="seg" style="margin:0;width:220px"><button data-l="fr" class="${S.lang === "fr" ? "on" : ""}">Français</button><button data-l="ar" class="${S.lang === "ar" ? "on" : ""}">العربية</button></div></div>
    <div class="grid g2">
      <form class="card" id="shopF">
        <h2>${t("shop")}</h2>
        <div class="row"><div class="field"><label>${t("shop_name")}</label><input class="input" name="shop_name" value="${esc(st.shop_name)}"></div>
          <div class="field" style="flex:0 0 100px"><label>${t("currency")}</label><input class="input" name="currency" value="${esc(st.currency)}"></div></div>
        <label class="switch"><input type="checkbox" name="confirm_before_send" ${st.confirm_before_send !== false ? "checked" : ""}> ${t("confirm_setting")}</label>
        <label class="switch"><input type="checkbox" name="float_from_safe" ${st.float_from_safe ? "checked" : ""}> ${t("float_setting")}</label>
        <div class="field"><label>${t("default_float")}</label><input class="input num" name="default_float" inputmode="numeric" value="${esc(st.default_float || 0)}"></div>
        <h2 style="margin-top:20px">${t("bot_formats")}</h2>
        <p class="sub" style="margin-top:-8px">${t("template_hint")}</p>
        ${[["flexy", "op_flexy"], ["international", "op_international"], ["bill_djezzy", "bill_djezzy"], ["bill_ooredoo", "bill_ooredoo"]].map(([k, l]) =>
          `<div class="field"><label>${t(l)}</label><input class="input num" data-cmd="${k}" value="${esc((st.commands || {})[k])}"></div>`).join("")}
        <div class="field"><label>${t("op_offers")}</label><input class="input num" name="template" value="${esc(st.template)}"></div>
        <h2 style="margin-top:20px">${t("bot_pc")}</h2>
        <p class="sub" style="margin-top:-8px">${t("bot_pc_help")}</p>
        <div class="row"><div class="field"><label>${t("server_address")}</label><input class="input num" name="bridge_url" value="${esc(st.bridge_url)}" placeholder="http://localhost:8765"></div>
          <div class="field"><label>${t("access_key")}</label><input class="input num" name="bridge_key" value="${esc(st.bridge_key)}" placeholder="XXXX-XXXX-XXXX" style="text-transform:uppercase"></div></div>
        <button class="btn primary">${t("save")}</button>
      </form>
      <div>
        <div class="card" id="bridgeCard"></div>
        <div class="card" id="loginCard" style="margin-top:16px"></div>
      </div>
    </div>`;
  $$("[data-l]", v).forEach((b) => b.onclick = () => setLang(b.dataset.l));
  $("#shopF").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.confirm_before_send = e.target.confirm_before_send.checked; d.float_from_safe = e.target.float_from_safe.checked;
    d.bridge_key = (d.bridge_key || "").trim().toUpperCase();
    d.commands = Object.fromEntries($$("[data-cmd]", e.target).map((i) => [i.dataset.cmd, i.value.trim()]));
    S.settings = await api("/settings", "PUT", d); toast(t("saved"), "ok"); pageSettings(v);
  };
  renderBridgeCard();
}

/* Telegram settings live on the bot PC (the session file never leaves it) */
async function renderBridgeCard() {
  const c = $("#bridgeCard"); if (!c) return;
  let bs;
  try { bs = await api("/bridge/settings", "GET", null, true); }
  catch (e) {
    c.innerHTML = `<h2>${t("tg_link")}</h2><div class="status-box"><span class="dot off"></span>${t(e.message === "bridge_key" ? "err_bridge_key" : "err_bridge_unreachable")}</div><p class="sub">${t("bot_pc_help")}</p>`;
    $("#loginCard").innerHTML = ""; $("#loginCard").classList.add("hidden");
    return;
  }
  $("#loginCard").classList.remove("hidden");
  const s = S.status;
  const line = s.mode === "demo" ? `<span class="dot demo"></span>${t("demo_badge")}`
    : s.authorized ? `<span class="dot ${s.bot_ok ? "on" : "off"}"></span>${t("connected_as")} ${esc(s.me)} · ${s.bot_ok ? t("bot_ready") : t("bot_missing")}`
    : `<span class="dot off"></span>${t("not_linked")} ${s.error ? `<span class="sub">(${esc(s.error)})</span>` : ""}`;
  c.innerHTML = `<form id="tgF"><h2>${t("tg_link")}</h2>
      <div class="status-box">${line}</div>
      <label class="switch"><input type="checkbox" name="demo" ${bs.demo ? "checked" : ""}> ${t("demo_mode")}</label>
      <p class="sub">${t("api_help")}</p>
      <div class="row"><div class="field"><label>${t("api_id")}</label><input class="input num" name="api_id" value="${esc(bs.api_id)}"></div>
        <div class="field"><label>${t("api_hash")}</label><input class="input num" name="api_hash" placeholder="${bs.has_api_hash ? "••••••••" : ""}"></div></div>
      <div class="field"><label>${t("bot_user")}</label><input class="input num" name="bot" value="${esc(bs.bot)}" placeholder="@ProviderBot"></div>
      <div class="field"><label>${t("reply_wait")}</label><input class="input num" name="reply_wait" value="${esc(bs.reply_wait)}" inputmode="decimal"></div>
      <button class="btn primary">${t("save")}</button></form>`;
  $("#tgF").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)); d.demo = e.target.demo.checked;
    if (!d.api_hash) delete d.api_hash;
    await api("/bridge/settings", "PUT", d); toast(t("saved"), "ok"); await refreshStatus(); renderShell(); renderBridgeCard();
  };
  renderLogin();
}

function renderLogin() {
  const c = $("#loginCard"), s = S.status;
  c.style.opacity = 1;
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

/* ---------------- sign-in screens ---------------- */
function authCard(inner) {
  renderShell();
  $("#view").innerHTML = `<div class="auth-wrap"><div class="card auth-card">
    <div class="auth-brand"><span class="logo">${svg("register")}</span><b>${esc(S.settings.shop_name || "SIM Desk")}</b>
      <button class="btn sm ghost" id="authLang">${S.lang === "ar" ? "Français" : "العربية"}</button></div>${inner}</div></div>`;
  $("#authLang").onclick = () => setLang(S.lang === "ar" ? "fr" : "ar");
}

function renderAuth(a) {
  S.authState = a;
  if (!Store.configured()) {
    return authCard(`<h1>${t("fb_missing_title")}</h1><p class="sub">${t("fb_missing_help")}</p>`);
  }
  if (a.state === "signed_out") {
    authCard(`<h1>${t("sign_in_title")}</h1>
      <form id="loginF"><div class="field"><label>${t("email")}</label><input class="input" type="email" name="email" required autocomplete="username"></div>
      <div class="field"><label>${t("pwd")}</label><input class="input" type="password" name="password" required autocomplete="current-password"></div>
      <button class="btn primary" style="width:100%">${t("sign_in")}</button></form>
      <button class="btn ghost sm" id="forgotB" style="margin-top:10px">${t("forgot")}</button>
      <details class="first-run"><summary>${t("first_run")}</summary><p class="sub">${t("first_run_help")}</p>
        <form id="firstF"><div class="field"><label>${t("email")}</label><input class="input" type="email" name="email" required></div>
        <div class="field"><label>${t("pwd")} (≥ 6)</label><input class="input" type="password" name="password" minlength="6" required autocomplete="new-password"></div>
        <button class="btn">${t("create_account")}</button></form></details>`);
    $("#loginF").onsubmit = async (e) => { e.preventDefault(); const b = e.target.querySelector("button"); b.disabled = true;
      try { await Store.login(e.target.email.value, e.target.password.value); } catch (err) { toast(t("err_" + err.code) || err.message, "err"); b.disabled = false; } };
    $("#forgotB").onclick = async () => { const em = $("#loginF").email.value; if (!em) return $("#loginF").email.focus();
      try { await Store.resetPassword(em); toast(t("reset_sent"), "ok"); } catch (err) { toast(err.code || err.message, "err"); } };
    $("#firstF").onsubmit = async (e) => { e.preventDefault();
      try { await Store.createFirstAccount(e.target.email.value, e.target.password.value); } catch (err) { toast(t("err_" + err.code), "err"); } };
    return;
  }
  if (a.state === "setup") {
    authCard(`<h1>${t("setup_title")}</h1><p class="sub">${t("setup_help").replace("{e}", esc(a.user.email))}</p>
      <form id="setupF"><div class="field"><label>${t("name")}</label><input class="input" name="name" required></div>
      <div class="field"><label>${t("shop_name")}</label><input class="input" name="shop" value="SIM Desk"></div>
      <button class="btn primary" style="width:100%">${t("setup_go")}</button></form>
      <button class="btn ghost sm" id="outB" style="margin-top:10px">${t("logout_app")}</button>`);
    $("#setupF").onsubmit = async (e) => { e.preventDefault();
      try { await Store.bootstrap(e.target.name.value.trim()); await Store.route("/settings", "PUT", { shop_name: e.target.shop.value.trim() || "SIM Desk" }); enterApp(Store.me); }
      catch (err) { toast(err.code === "permission-denied" ? t("err_setup_done") : (err.code || err.message), "err"); } };
    $("#outB").onclick = () => Store.logout();
    return;
  }
  if (a.state === "no_access") {
    authCard(`<h1>${t("no_access_title")}</h1><p class="sub">${t("no_access_help").replace("{e}", esc(a.user?.email || ""))}</p>
      <button class="btn" id="outB">${t("logout_app")}</button>`);
    $("#outB").onclick = () => Store.logout();
  }
}

const BRIDGE_API_NEEDED = 3;
async function checkBridgeVersion() {
  try {
    const p = await api("/ping", "GET", null, true);
    S.bridgeOutdated = !(p && p.api >= BRIDGE_API_NEEDED);
  } catch { S.bridgeOutdated = false; }   // unreachable is reported elsewhere
  renderBotBadge();
  if (S.bridgeOutdated) toast(t("err_bridge_outdated"), "err");
}
let unwatch = null, statusTimer = null;
function enterApp(user) {
  S.user = user;
  if (unwatch) unwatch();
  let first = true;
  unwatch = Store.watchSettings((st) => {
    S.settings = st; renderShell();
    if (first) { first = false; refreshStatus().then(renderBotBadge); checkBridgeVersion(); }   // bridge key comes with the settings
  });
  clearInterval(statusTimer);
  statusTimer = setInterval(async () => { if (S.user) { await refreshStatus(); renderBotBadge(); } }, 30000);
  route();
}

/* ---------------- boot ---------------- */
(function boot() {
  if (!Store.configured()) { S.user = null; return renderAuth({ state: "signed_out" }); }
  Store.init();
  Store.onUser((a) => {
    if (a.state === "ready") return enterApp(a.user);
    S.user = null; S.menu = null;
    if (unwatch) { unwatch(); unwatch = null; }
    location.hash = "";
    renderAuth(a);
  });
})();
