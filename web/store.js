/* SIM Desk data layer — Firebase Authentication + Cloud Firestore.
 *
 * Every operation that moves money (sale, debt payment, register open/close, expense, safe, supplier)
 * runs inside a Firestore transaction, so two PCs working at the same time can never corrupt a balance.
 *
 * Collections
 *   meta/setup                      { done }                       first-run flag
 *   settings/app                    shop settings (manager writes, staff reads)
 *   users/{uid}                     { name, email, role: manager|operator, active }
 *   clients/{id}                    { name, phone, note, credit_limit, debt, numbers[], labels{}, last_sale }
 *   clients/{id}/entries/{id}       statement lines: sale (debit/credit) or payment (credit)
 *   numbers/{0661234567}            { client_id, label }           one owner per SIM number
 *   sales/{id}                      every operation recorded
 *   registers/{YYYY-MM-DD}          day register { status, opening, totals… }
 *   registers/{day}/moves/{id}      every dinar in/out of the drawer
 *   safe_moves/{id}                 the safe (coffre): day closings in, floats/suppliers/withdrawals out
 *   suppliers/{id}, suppliers/{id}/entries/{id}
 */
import { app as A, auth as AU, fs as F } from "./fb.js";
import { firebaseConfig } from "./firebase-config.js";

export class AppError extends Error {
  constructor(code, arg) { super(arg !== undefined ? `${code}:${arg}` : code); this.code = code; }
}
const fail = (code, arg) => { throw new AppError(code, arg); };

let fbApp, auth, db;
export let me = null;                 // { uid, email, name, role, active }
export const isManager = () => me?.role === "manager";

export const DEFAULT_SETTINGS = {
  shop_name: "SIM Desk", currency: "DA",
  template: "{number}",
  commands: { flexy: "{number}*{amount}", international: "{number}i{amount}", bill_djezzy: "{number}**{amount}", bill_ooredoo: "{number01}*{amount}" },
  bridge_url: "http://localhost:8765", bridge_key: "",
  confirm_before_send: true,     // big confirmation screen the customer can read
  float_from_safe: true,         // opening float of the day register is taken from the safe
  default_float: 0,
};

/* ---------------- helpers ---------------- */
export const today = () => new Date().toLocaleDateString("sv-SE");
const nowIso = () => { const d = new Date(); return `${d.toLocaleDateString("sv-SE")}T${d.toTimeString().slice(0, 8)}`; };
const n = (v) => Math.round((Number(v) || 0) * 100) / 100;
const OPERATORS = { "05": "Ooredoo", "06": "Mobilis", "07": "Djezzy" };
export function normNumber(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("213") && d.length === 12) d = "0" + d.slice(3);
  if (d.length === 9 && /^[567]/.test(d)) d = "0" + d;
  if (d.length === 10 && d.startsWith("01")) d = "05" + d.slice(2);   // Ooredoo bill form
  return d;
}
export const isMobile = (d) => d.length === 10 && !!OPERATORS[d.slice(0, 2)];
export const operatorOf = (raw) => OPERATORS[normNumber(raw).slice(0, 2)] || "";
const byMe = () => ({ by_uid: me.uid, by_name: me.name || me.email });
const col = (...p) => F.collection(db, ...p);
const ref = (...p) => F.doc(db, ...p);
const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const needManager = () => { if (!isManager()) fail("permission"); };

/* ---------------- init & auth ---------------- */
export const configured = () => !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

export function init() {
  fbApp = A.initializeApp(firebaseConfig);
  auth = AU.getAuth(fbApp);
  try {
    // offline cache: the app keeps showing data if the shop's internet drops for a moment
    db = F.initializeFirestore(fbApp, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch { db = F.getFirestore(fbApp); }
}

/** cb({ state: "signed_out" | "setup" | "no_access" | "ready", user }) */
export function onUser(cb) {
  AU.onAuthStateChanged(auth, async (u) => {
    if (!u) { me = null; return cb({ state: "signed_out" }); }
    try {
      const p = await F.getDoc(ref("users", u.uid));
      if (p.exists() && p.data().active !== false) {
        me = { uid: u.uid, email: u.email, ...p.data() };
        return cb({ state: "ready", user: me });
      }
      me = null;
      if (!p.exists()) {
        const setup = await F.getDoc(ref("meta", "setup"));
        if (!setup.exists()) return cb({ state: "setup", user: { uid: u.uid, email: u.email } });
      }
      cb({ state: "no_access", user: { email: u.email } });
    } catch (e) {
      me = null; cb({ state: "no_access", user: { email: u.email }, error: e.code || e.message });
    }
  });
}

export async function login(email, password) {
  try { await AU.signInWithEmailAndPassword(auth, email.trim(), password); }
  catch (e) { fail(/invalid|wrong|not-found|credential/.test(e.code || "") ? "bad_login" : (e.code || "login_failed")); }
}
export async function createFirstAccount(email, password) {
  try { await AU.createUserWithEmailAndPassword(auth, email.trim(), password); }
  catch (e) { fail(e.code === "auth/email-already-in-use" ? "email_used" : (e.code || "login_failed")); }
}
export const logout = () => AU.signOut(auth);
export const resetPassword = (email) => AU.sendPasswordResetEmail(auth, email);

/** First run: the signed-in account becomes the manager and the shop settings are created. */
export async function bootstrap(name) {
  const u = auth.currentUser;
  const b = F.writeBatch(db);
  b.set(ref("users", u.uid), { name, email: u.email, role: "manager", active: true, created_at: nowIso() });
  b.set(ref("settings", "app"), { ...DEFAULT_SETTINGS, created_at: nowIso() });
  b.set(ref("meta", "setup"), { done: true, at: nowIso(), by: u.uid });
  await b.commit();
  me = { uid: u.uid, email: u.email, name, role: "manager", active: true };
}

/* ---------------- settings ---------------- */
export function watchSettings(cb) {
  return F.onSnapshot(ref("settings", "app"), (s) => {
    const d = s.exists() ? s.data() : {};
    cb({ ...DEFAULT_SETTINGS, ...d, commands: { ...DEFAULT_SETTINGS.commands, ...(d.commands || {}) } });
  }, () => cb({ ...DEFAULT_SETTINGS }));
}
async function putSettings(b) {
  needManager();
  const allowed = ["shop_name", "currency", "template", "commands", "bridge_url", "bridge_key", "confirm_before_send", "float_from_safe", "default_float"];
  const data = Object.fromEntries(Object.entries(b).filter(([k]) => allowed.includes(k)));
  if ("default_float" in data) data.default_float = n(data.default_float);
  await F.setDoc(ref("settings", "app"), { ...data, updated_at: nowIso(), ...byMe() }, { merge: true });
  return getSettings();
}
async function getSettings() {
  const s = await F.getDoc(ref("settings", "app"));
  const d = s.exists() ? s.data() : {};
  return { ...DEFAULT_SETTINGS, ...d, commands: { ...DEFAULT_SETTINGS.commands, ...(d.commands || {}) } };
}

/* ---------------- users (manager) ---------------- */
async function listUsers() {
  needManager();
  return docs(await F.getDocs(col("users"))).sort((a, b) => (a.role === b.role ? (a.name || "").localeCompare(b.name || "") : a.role === "manager" ? -1 : 1));
}
async function createUser(b) {
  needManager();
  if (!b.email || !b.password || String(b.password).length < 6) fail("password_short");
  // a second Firebase app creates the account without signing the manager out
  const sec = A.initializeApp(firebaseConfig, "add-user-" + Date.now());
  try {
    const sauth = AU.getAuth(sec);
    const cred = await AU.createUserWithEmailAndPassword(sauth, b.email.trim(), b.password);
    await F.setDoc(ref("users", cred.user.uid), {
      name: b.name || b.email, email: b.email.trim(), role: b.role === "manager" ? "manager" : "operator", active: true, created_at: nowIso(), ...byMe(),
    });
    await AU.signOut(sauth);
    return { id: cred.user.uid };
  } catch (e) {
    if (e instanceof AppError) throw e;
    fail(e.code === "auth/email-already-in-use" ? "email_used" : e.code === "auth/weak-password" ? "password_short" : (e.code || "error"));
  } finally { await A.deleteApp(sec).catch(() => {}); }
}
async function updateUser(uid, b) {
  needManager();
  if (uid === me.uid && (b.role && b.role !== "manager" || b.active === false)) fail("cannot_demote_self");
  const data = {};
  for (const k of ["name", "role", "active"]) if (k in b) data[k] = b[k];
  if (data.role && !["manager", "operator"].includes(data.role)) fail("bad_role");
  await F.updateDoc(ref("users", uid), { ...data, updated_at: nowIso() });
  return true;
}

/* ---------------- clients & numbers ---------------- */
function shapeClient(id, c) {
  const labels = c.labels || {};
  const numbers = (c.numbers || []).map((x) => ({ id: x, number: x, label: labels[x] || "", operator: operatorOf(x) }));
  return { id, name: c.name, phone: c.phone || "", note: c.note || "", credit_limit: c.credit_limit ?? null,
           debt: n(c.debt), last_sale: c.last_sale || null, numbers, labels };
}

async function listClients(q = "") {
  const all = docs(await F.getDocs(col("clients")));
  const t = q.trim().toLowerCase(), d = q.replace(/\D/g, "");
  return all
    .filter((c) => !t || (c.name || "").toLowerCase().includes(t) || (d && ((c.phone || "").replace(/\D/g, "").includes(d) || (c.numbers || []).some((x) => x.includes(d)))))
    .map((c) => ({ ...shapeClient(c.id, c), numbers: c.numbers || [] }))
    .sort((a, b) => b.debt - a.debt || a.name.localeCompare(b.name));
}

async function getClient(id) {
  const s = await F.getDoc(ref("clients", id));
  if (!s.exists()) fail("not_found");
  return shapeClient(s.id, s.data());
}

async function clientByNumber(raw) {
  const num = normNumber(raw);
  if (!isMobile(num)) return null;
  const owner = await F.getDoc(ref("numbers", num));
  if (!owner.exists()) return null;
  const c = await F.getDoc(ref("clients", owner.data().client_id));
  if (!c.exists()) return null;
  return { ...shapeClient(c.id, c.data()), number_label: owner.data().label || "" };
}

async function saveClient(b, id) {
  if (!String(b.name || "").trim()) fail("name_required");
  const wanted = [...(b.numbers || [])].map((x) => ({ number: normNumber(x.number), label: x.label || "" }));
  const phone = normNumber(b.phone);
  if (isMobile(phone) && !wanted.some((x) => x.number === phone)) wanted.push({ number: phone, label: "" });
  for (const w of wanted) if (!isMobile(w.number)) fail("invalid_number");
  return F.runTransaction(db, async (tx) => {
    const cref = id ? ref("clients", id) : F.doc(col("clients"));
    const cur = id ? await tx.get(cref) : null;
    if (id && !cur.exists()) fail("not_found");
    const owners = await Promise.all(wanted.map((w) => tx.get(ref("numbers", w.number))));
    owners.forEach((o, i) => { if (o.exists() && o.data().client_id !== cref.id) fail("number_taken", wanted[i].number); });
    const old = cur ? cur.data() : {};
    const numbers = [...new Set([...(old.numbers || []), ...wanted.map((w) => w.number)])];
    const labels = { ...(old.labels || {}) };
    wanted.forEach((w) => { if (w.label || !(w.number in labels)) labels[w.number] = w.label; });
    const data = { name: b.name.trim(), phone: b.phone || "", note: b.note || "", numbers, labels };
    if (isManager() && "credit_limit" in b) data.credit_limit = b.credit_limit === "" || b.credit_limit == null ? null : n(b.credit_limit);
    if (id) tx.update(cref, { ...data, updated_at: nowIso() });
    else tx.set(cref, { ...data, credit_limit: data.credit_limit ?? null, debt: 0, created_at: nowIso(), ...byMe() });
    wanted.forEach((w) => tx.set(ref("numbers", w.number), { client_id: cref.id, label: w.label }));
    return { id: cref.id };
  });
}

async function addNumber(cid, raw, label = "") {
  const num = normNumber(raw);
  if (!isMobile(num)) fail("invalid_number");
  await F.runTransaction(db, async (tx) => {
    const cref = ref("clients", cid);
    const [c, o] = [await tx.get(cref), await tx.get(ref("numbers", num))];
    if (!c.exists()) fail("not_found");
    if (o.exists() && o.data().client_id !== cid) fail("number_taken", num);
    const d = c.data();
    tx.update(cref, { numbers: [...new Set([...(d.numbers || []), num])], labels: { ...(d.labels || {}), [num]: label } });
    tx.set(ref("numbers", num), { client_id: cid, label });
  });
  return (await getClient(cid)).numbers;
}

async function removeNumber(cid, num) {
  await F.runTransaction(db, async (tx) => {
    const cref = ref("clients", cid);
    const [c, o] = [await tx.get(cref), await tx.get(ref("numbers", num))];
    if (!c.exists()) fail("not_found");
    const d = c.data(), labels = { ...(d.labels || {}) };
    delete labels[num];
    tx.update(cref, { numbers: (d.numbers || []).filter((x) => x !== num), labels });
    if (o.exists() && o.data().client_id === cid) tx.delete(ref("numbers", num));
  });
  return (await getClient(cid)).numbers;
}

async function deleteClient(cid) {
  needManager();
  const c = await F.getDoc(ref("clients", cid));
  if (!c.exists()) return true;
  const entries = await F.getDocs(col("clients", cid, "entries"));
  const refs = [...entries.docs.map((d) => d.ref), ...(c.data().numbers || []).map((x) => ref("numbers", x)), ref("clients", cid)];
  for (let i = 0; i < refs.length; i += 450) {   // batches are limited to 500 writes
    const b = F.writeBatch(db);
    refs.slice(i, i + 450).forEach((r) => b.delete(r));
    await b.commit();
  }
  return true;   // sales stay in the register history (client name kept on each sale)
}

async function statement(cid, f = {}) {
  const c = await getClient(cid);
  let lines = docs(await F.getDocs(col("clients", cid, "entries")))
    .map((e) => ({ ...e, label: e.number ? (c.labels[e.number] || "") : "", operator: e.number ? operatorOf(e.number) : "" }))
    .sort((a, b) => (a.ts === b.ts ? (a.id < b.id ? -1 : 1) : a.ts < b.ts ? -1 : 1));
  const byLine = !!(f.number || f.operator);
  if (byLine) lines = lines.filter((l) => l.type === "sale" && (!f.number || l.number === normNumber(f.number)) && (!f.operator || l.operator === f.operator));
  let opening = 0;
  const out = [];
  for (const l of lines) {
    if (f.from && l.day < f.from) { opening += n(l.debit) - n(l.credit); continue; }
    if (f.to && l.day > f.to) continue;
    out.push({ ...l, debit: n(l.debit), credit: n(l.credit) });
  }
  let bal = opening;
  out.forEach((l) => { bal += l.debit - l.credit; l.balance = n(bal); });
  return {
    client: { id: c.id, name: c.name, phone: c.phone, note: c.note, credit_limit: c.credit_limit, debt: c.debt },
    numbers: c.numbers, lines: out, opening: n(opening), closing: n(bal),
    total_debit: n(out.reduce((a, l) => a + l.debit, 0)), total_credit: n(out.reduce((a, l) => a + l.credit, 0)),
    count: out.filter((l) => l.type === "sale").length, by_line: byLine, filters: f,
  };
}

/* ---------------- day register helpers (inside transactions) ---------------- */
async function openRegisterIn(tx) {
  const rref = ref("registers", today());
  const r = await tx.get(rref);
  if (!r.exists() || r.data().status !== "open") fail("register_closed");
  return { rref, reg: r.data() };
}
function moveIn(tx, rref, reg, direction, category, amount, note, refType = "", refId = "") {
  amount = n(amount);
  if (amount <= 0) return {};
  tx.set(F.doc(F.collection(rref, "moves")), { day: today(), ts: nowIso(), direction, category, amount, note: note || "", ref_type: refType, ref_id: refId, ...byMe() });
  return direction === "in" ? { total_in: n((reg.total_in || 0) + amount) } : { total_out: n((reg.total_out || 0) + amount) };
}

/* ---------------- sales ---------------- */
async function addSale(b) {
  const total = n(b.total);
  if (total <= 0) fail("invalid_amount");
  const paid = Math.min(b.paid === "" || b.paid == null ? total : n(b.paid), total);
  const rest = n(total - paid);
  const cid = b.client_id || null;
  if (rest > 0 && !cid) fail("client_required_for_debt");
  const sim = normNumber(b.sim_number) || String(b.sim_number || "");
  return F.runTransaction(db, async (tx) => {
    const { rref, reg } = await openRegisterIn(tx);
    const cref = cid ? ref("clients", cid) : null;
    const c = cref ? await tx.get(cref) : null;
    if (cref && !c.exists()) fail("not_found");
    const attach = cid && b.attach_number && isMobile(sim);
    const owner = attach ? await tx.get(ref("numbers", sim)) : null;
    // ---- writes
    const sref = F.doc(col("sales"));
    const ts = nowIso(), day = today();
    tx.set(sref, { day, ts, client_id: cid, client_name: c ? c.data().name : "", sim_number: sim, operator: operatorOf(sim),
                   description: b.description || "", total, paid, rest, bot_reply: String(b.bot_reply || "").slice(0, 1500), ...byMe() });
    if (c) {
      const d = c.data();
      const upd = { debt: n((d.debt || 0) + rest), last_sale: ts };
      if (attach && !owner.exists()) {
        upd.numbers = [...new Set([...(d.numbers || []), sim])];
        upd.labels = { ...(d.labels || {}), [sim]: b.number_label || "" };
        tx.set(ref("numbers", sim), { client_id: cid, label: b.number_label || "" });
      }
      tx.update(cref, upd);
      tx.set(F.doc(col("clients", cid, "entries")), { type: "sale", ref_id: sref.id, day, ts, number: sim, description: b.description || "", debit: total, credit: paid, ...byMe() });
    }
    const totals = moveIn(tx, rref, reg, "in", "sale", paid, [b.description, sim].filter(Boolean).join(" "), "sale", sref.id);
    tx.update(rref, { ...totals, sales_count: (reg.sales_count || 0) + 1, sales_total: n((reg.sales_total || 0) + total), new_debt: n((reg.new_debt || 0) + rest) });
    return { id: sref.id };
  });
}

async function listSales(day) {
  if (day) return docs(await F.getDocs(F.query(col("sales"), F.where("day", "==", day)))).sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return docs(await F.getDocs(F.query(col("sales"), F.orderBy("ts", "desc"), F.limit(8))));
}

async function payDebt(cid, amount, note = "") {
  amount = n(amount);
  if (amount <= 0) fail("invalid_amount");
  await F.runTransaction(db, async (tx) => {
    const { rref, reg } = await openRegisterIn(tx);
    const cref = ref("clients", cid);
    const c = await tx.get(cref);
    if (!c.exists()) fail("not_found");
    const ts = nowIso();
    tx.update(cref, { debt: n((c.data().debt || 0) - amount) });
    tx.set(F.doc(col("clients", cid, "entries")), { type: "payment", day: today(), ts, number: "", description: note, debit: 0, credit: amount, ...byMe() });
    tx.update(rref, moveIn(tx, rref, reg, "in", "debt_payment", amount, `${c.data().name} ${note}`.trim(), "client_payment", cid));
  });
  return getClient(cid);
}

/* ---------------- day register ---------------- */
async function getRegister(day) {
  day = day || today();
  const s = await F.getDoc(ref("registers", day));
  let reg;
  if (s.exists()) reg = { day, ...s.data() };
  else {
    const set = await getSettings();
    reg = { day, status: "none", opening: null, suggested_opening: set.default_float || 0, counted: null, closed_at: null, note: "" };
  }
  const moves = s.exists() ? docs(await F.getDocs(col("registers", day, "moves"))).sort((a, b) => (a.ts < b.ts ? 1 : -1)) : [];
  const tin = n(moves.filter((m) => m.direction === "in").reduce((a, m) => a + m.amount, 0));
  const tout = n(moves.filter((m) => m.direction === "out").reduce((a, m) => a + m.amount, 0));
  const cats = {};
  moves.forEach((m) => { const k = m.direction + ":" + m.category; cats[k] = n((cats[k] || 0) + m.amount); });
  const expected = n((reg.opening || 0) + tin - tout);
  return {
    ...reg, moves, total_in: tin, total_out: tout, expected,
    difference: reg.counted != null ? n(reg.counted - expected) : null,
    by_category: Object.entries(cats).sort().map(([k, amount]) => ({ direction: k.split(":")[0], category: k.split(":")[1], amount })),
    sales_count: reg.sales_count || 0, sales_total: reg.sales_total || 0, new_debt: reg.new_debt || 0,
  };
}

async function openRegister(opening) {
  opening = n(opening);
  const set = await getSettings();
  await F.runTransaction(db, async (tx) => {
    const rref = ref("registers", today());
    const r = await tx.get(rref);
    if (r.exists()) fail(r.data().status === "open" ? "already_open" : "day_closed");
    let floatMove = "";
    if (set.float_from_safe && opening > 0) {
      const mref = F.doc(col("safe_moves"));
      floatMove = mref.id;
      tx.set(mref, { ts: nowIso(), day: today(), direction: "out", category: "register_float", amount: opening, note: "", ref_day: today(), ...byMe() });
    }
    tx.set(rref, { day: today(), status: "open", opening, opened_at: nowIso(), opened_by: me.name || me.email, float_move_id: floatMove,
                   total_in: 0, total_out: 0, sales_count: 0, sales_total: 0, new_debt: 0 });
  });
  return getRegister();
}

async function closeRegister(counted, note = "") {
  counted = n(counted);
  await F.runTransaction(db, async (tx) => {
    const { rref, reg } = await openRegisterIn(tx);
    const expected = n((reg.opening || 0) + (reg.total_in || 0) - (reg.total_out || 0));
    const mref = F.doc(col("safe_moves"));
    // the counted cash goes to the safe
    tx.set(mref, { ts: nowIso(), day: today(), direction: "in", category: "day_close", amount: counted, note, ref_day: reg.day, ...byMe() });
    tx.update(rref, { status: "closed", counted, expected, difference: n(counted - expected), note, closed_at: nowIso(),
                      closed_by: me.name || me.email, close_move_id: mref.id });
  });
  return getRegister();
}

async function reopenRegister(day) {
  needManager();
  day = day || today();
  await F.runTransaction(db, async (tx) => {
    const rref = ref("registers", day);
    const r = await tx.get(rref);
    if (!r.exists() || r.data().status !== "closed") fail("not_found");
    if (r.data().close_move_id) tx.delete(ref("safe_moves", r.data().close_move_id));
    tx.update(rref, { status: "open", counted: null, difference: null, closed_at: null, close_move_id: "" });
  });
  return getRegister(day);
}

async function addMove(b) {
  const amount = n(b.amount);
  if (amount <= 0 || !["in", "out"].includes(b.direction)) fail("invalid_amount");
  if (!isManager() && b.direction === "in" && b.category === "deposit") fail("permission");
  await F.runTransaction(db, async (tx) => {
    const { rref, reg } = await openRegisterIn(tx);
    tx.update(rref, moveIn(tx, rref, reg, b.direction, b.category || (b.direction === "in" ? "other_in" : "expense"), amount, b.note, "manual"));
  });
  return getRegister();
}

async function deleteMove(id) {
  needManager();
  await F.runTransaction(db, async (tx) => {
    const rref = ref("registers", today()), mref = F.doc(rref, "moves", id);
    const [r, m] = [await tx.get(rref), await tx.get(mref)];
    if (!r.exists() || !m.exists() || m.data().ref_type !== "manual" || r.data().status !== "open") fail("not_found");
    const d = m.data(), reg = r.data();
    tx.delete(mref);
    tx.update(rref, d.direction === "in" ? { total_in: n(reg.total_in - d.amount) } : { total_out: n(reg.total_out - d.amount) });
  });
  return getRegister();
}

async function registerHistory(days = 30) {
  needManager();
  return docs(await F.getDocs(F.query(col("registers"), F.orderBy("day", "desc"), F.limit(days))));
}

/* ---------------- safe (manager) ---------------- */
async function getSafe(f = {}) {
  needManager();
  const all = docs(await F.getDocs(col("safe_moves"))).sort((a, b) => (a.ts < b.ts ? 1 : -1));
  const sum = (arr, dir) => n(arr.filter((m) => m.direction === dir).reduce((a, m) => a + m.amount, 0));
  const balance = n(sum(all, "in") - sum(all, "out"));
  const moves = all.filter((m) => (!f.from || m.day >= f.from) && (!f.to || m.day <= f.to));
  return { balance, moves, total_in: sum(moves, "in"), total_out: sum(moves, "out") };
}
async function safeMove(b) {
  needManager();
  const amount = n(b.amount);
  if (amount <= 0 || !["in", "out"].includes(b.direction)) fail("invalid_amount");
  await F.addDoc(col("safe_moves"), { ts: nowIso(), day: today(), direction: b.direction, category: b.category || (b.direction === "in" ? "deposit" : "withdrawal"),
                                     amount, note: b.note || "", manual: true, ...byMe() });
  return getSafe();
}
async function deleteSafeMove(id) {
  needManager();
  const s = await F.getDoc(ref("safe_moves", id));
  if (!s.exists() || !s.data().manual) fail("not_found");
  await F.deleteDoc(ref("safe_moves", id));
  return getSafe();
}

/* ---------------- suppliers (manager, paid from the safe) ---------------- */
async function listSuppliers() {
  needManager();
  return docs(await F.getDocs(col("suppliers"))).map((s) => ({ ...s, owed: n(s.owed), purchased: n(s.purchased) }))
    .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
}
async function getSupplier(id) {
  needManager();
  const s = await F.getDoc(ref("suppliers", id));
  if (!s.exists()) fail("not_found");
  const e = docs(await F.getDocs(col("suppliers", id, "entries"))).sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return { id, ...s.data(), owed: n(s.data().owed), purchased: n(s.data().purchased),
           purchases: e.filter((x) => x.type === "purchase"), payments: e.filter((x) => x.type === "payment") };
}
async function saveSupplier(b, id) {
  needManager();
  if (!String(b.name || "").trim()) fail("name_required");
  const data = { name: b.name.trim(), phone: b.phone || "", note: b.note || "" };
  if (id) { await F.updateDoc(ref("suppliers", id), data); return { id }; }
  const r = await F.addDoc(col("suppliers"), { ...data, owed: 0, purchased: 0, created_at: nowIso() });
  return { id: r.id };
}
async function supplierPurchase(id, b) {
  needManager();
  const total = n(b.total);
  if (total <= 0) fail("invalid_amount");
  const paid = Math.min(b.paid === "" || b.paid == null ? total : n(b.paid), total);
  await F.runTransaction(db, async (tx) => {
    const sref = ref("suppliers", id);
    const s = await tx.get(sref);
    if (!s.exists()) fail("not_found");
    const ts = nowIso();
    tx.set(F.doc(col("suppliers", id, "entries")), { type: "purchase", ts, day: today(), description: b.description || "", total, paid, ...byMe() });
    tx.update(sref, { owed: n((s.data().owed || 0) + total - paid), purchased: n((s.data().purchased || 0) + total) });
    if (paid > 0) tx.set(F.doc(col("safe_moves")), { ts, day: today(), direction: "out", category: "purchase", amount: paid, note: `${s.data().name} ${b.description || ""}`.trim(), ...byMe() });
  });
  return getSupplier(id);
}
async function supplierPay(id, b) {
  needManager();
  const amount = n(b.amount);
  if (amount <= 0) fail("invalid_amount");
  await F.runTransaction(db, async (tx) => {
    const sref = ref("suppliers", id);
    const s = await tx.get(sref);
    if (!s.exists()) fail("not_found");
    const ts = nowIso();
    tx.set(F.doc(col("suppliers", id, "entries")), { type: "payment", ts, day: today(), amount, note: b.note || "", ...byMe() });
    tx.update(sref, { owed: n((s.data().owed || 0) - amount) });
    tx.set(F.doc(col("safe_moves")), { ts, day: today(), direction: "out", category: "supplier_payment", amount, note: `${s.data().name} ${b.note || ""}`.trim(), ...byMe() });
  });
  return getSupplier(id);
}

/* ---------------- dashboard (manager) ---------------- */
async function dashboard() {
  needManager();
  const [reg, clients, sups, recent, hist, safe] = await Promise.all([
    getRegister(), listClients(), listSuppliers(), listSales(), registerHistory(7), getSafe(),
  ]);
  return {
    day: today(), sales_count: reg.sales_count, sales_total: reg.sales_total, total_in: reg.total_in, total_out: reg.total_out,
    drawer: reg.expected, register_open: reg.status === "open",
    clients_debt: n(clients.reduce((a, c) => a + Math.max(0, c.debt), 0)),
    suppliers_owed: n(sups.reduce((a, s) => a + s.owed, 0)),
    top_debtors: clients.filter((c) => c.debt > 0.001).slice(0, 5),
    recent_sales: recent, safe_balance: safe.balance,
    week: hist.slice().reverse().map((r) => ({ day: r.day, total_in: r.total_in || 0, total_out: r.total_out || 0 })),
  };
}

/* ---------------- router: same paths the interface already uses ---------------- */
const ROUTES = [
  ["GET", /^\/settings$/, () => getSettings()],
  ["PUT", /^\/settings$/, (m, q, b) => putSettings(b)],
  ["GET", /^\/users$/, () => listUsers()],
  ["POST", /^\/users$/, (m, q, b) => createUser(b)],
  ["PUT", /^\/users\/([^/]+)$/, (m, q, b) => updateUser(m[1], b)],
  ["POST", /^\/users\/([^/]+)\/reset$/, async (m, q, b) => { needManager(); await resetPassword(b.email); return true; }],
  ["GET", /^\/clients$/, (m, q) => listClients(q.get("q") || "")],
  ["POST", /^\/clients$/, (m, q, b) => saveClient(b)],
  ["GET", /^\/clients\/by_number$/, (m, q) => clientByNumber(q.get("n"))],
  ["GET", /^\/clients\/([^/]+)$/, (m) => getClient(m[1])],
  ["PUT", /^\/clients\/([^/]+)$/, (m, q, b) => saveClient(b, m[1])],
  ["POST", /^\/clients\/([^/]+)\/pay$/, (m, q, b) => payDebt(m[1], b.amount, b.note)],
  ["POST", /^\/clients\/([^/]+)\/delete$/, (m) => deleteClient(m[1])],
  ["POST", /^\/clients\/([^/]+)\/numbers$/, (m, q, b) => addNumber(m[1], b.number, b.label)],
  ["POST", /^\/clients\/([^/]+)\/numbers\/([^/]+)\/delete$/, (m) => removeNumber(m[1], m[2])],
  ["GET", /^\/clients\/([^/]+)\/statement$/, (m, q) => statement(m[1], Object.fromEntries(["from", "to", "number", "operator"].map((k) => [k, q.get(k) || ""])))],
  ["GET", /^\/sales$/, (m, q) => listSales(q.get("day"))],
  ["POST", /^\/sales$/, (m, q, b) => addSale(b)],
  ["GET", /^\/dashboard$/, () => dashboard()],
  ["GET", /^\/register$/, (m, q) => getRegister(q.get("day"))],
  ["POST", /^\/register\/open$/, (m, q, b) => openRegister(b.opening)],
  ["POST", /^\/register\/close$/, (m, q, b) => closeRegister(b.counted, b.note)],
  ["POST", /^\/register\/reopen$/, (m, q, b) => reopenRegister(b.day)],
  ["POST", /^\/register\/move$/, (m, q, b) => addMove(b)],
  ["POST", /^\/register\/move\/([^/]+)\/delete$/, (m) => deleteMove(m[1])],
  ["GET", /^\/register\/history$/, (m, q) => registerHistory(+(q.get("days") || 30))],
  ["GET", /^\/safe$/, (m, q) => getSafe({ from: q.get("from"), to: q.get("to") })],
  ["POST", /^\/safe\/move$/, (m, q, b) => safeMove(b)],
  ["POST", /^\/safe\/move\/([^/]+)\/delete$/, (m) => deleteSafeMove(m[1])],
  ["GET", /^\/suppliers$/, () => listSuppliers()],
  ["POST", /^\/suppliers$/, (m, q, b) => saveSupplier(b)],
  ["GET", /^\/suppliers\/([^/]+)$/, (m) => getSupplier(m[1])],
  ["PUT", /^\/suppliers\/([^/]+)$/, (m, q, b) => saveSupplier(b, m[1])],
  ["POST", /^\/suppliers\/([^/]+)\/purchase$/, (m, q, b) => supplierPurchase(m[1], b)],
  ["POST", /^\/suppliers\/([^/]+)\/pay$/, (m, q, b) => supplierPay(m[1], b)],
];

export async function route(path, method = "GET", body = {}) {
  const [p, qs] = path.split("?");
  const q = new URLSearchParams(qs || "");
  for (const [mth, rx, fn] of ROUTES) {
    const m = mth === method && p.match(rx);
    if (m) {
      if (!me) fail("signed_out");
      try { return await fn(m, q, body || {}); }
      catch (e) {
        if (e instanceof AppError) throw e;
        if (e && e.code === "permission-denied") fail("permission");
        if (e && (e.code === "unavailable" || e.code === "failed-precondition")) fail("offline");
        throw e;
      }
    }
  }
  fail("unknown_route", path);
}
