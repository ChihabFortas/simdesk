// Offline stand-in for the Firebase SDK subset SIM Desk uses (tests only — never deployed).
// Data lives in localStorage so several browser tabs/pages share it like real devices sharing Firestore.
// It also re-implements firestore.rules for writes and sensitive reads, so a forbidden write fails here too.
const LS = window.localStorage;
const load = (k, d) => { try { return JSON.parse(LS.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => LS.setItem(k, JSON.stringify(v));
const DB = () => load("fake_db", {});
const putDB = (d) => save("fake_db", d);
const rid = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
const err = (code, msg) => Object.assign(new Error(msg || code), { code });

/* ---------------- app ---------------- */
export const app = {
  initializeApp: (config, name = "[DEFAULT]") => ({ name, config }),
  deleteApp: async () => {},
};

/* ---------------- auth ---------------- */
const listeners = {};
const authFor = {};
function sess(name) { return load("fake_sess_" + name, null); }
function setSess(name, u) { save("fake_sess_" + name, u); const a = authFor[name]; if (a) { a.currentUser = u; (listeners[name] || []).forEach((cb) => cb(u)); } }
export const auth = {
  getAuth: (a) => (authFor[a.name] ||= { name: a.name, currentUser: sess(a.name) }),
  onAuthStateChanged: (a, cb) => { (listeners[a.name] ||= []).push(cb); setTimeout(() => cb(a.currentUser), 0); return () => {}; },
  signInWithEmailAndPassword: async (a, email, pw) => {
    const u = load("fake_users", {})[email.toLowerCase()];
    if (!u || u.pw !== pw) throw err("auth/invalid-credential");
    setSess(a.name, { uid: u.uid, email: u.email });
  },
  createUserWithEmailAndPassword: async (a, email, pw) => {
    const users = load("fake_users", {});
    if (users[email.toLowerCase()]) throw err("auth/email-already-in-use");
    if (String(pw).length < 6) throw err("auth/weak-password");
    const u = { uid: "u_" + rid(), email, pw };
    users[email.toLowerCase()] = u; save("fake_users", users);
    setSess(a.name, { uid: u.uid, email });
    return { user: { uid: u.uid, email } };
  },
  signOut: async (a) => setSess(a.name, null),
  sendPasswordResetEmail: async () => {},
};

/* ---------------- firestore ---------------- */
let currentAuth = () => authFor["[DEFAULT]"]?.currentUser || null;
const join = (...p) => p.join("/");
function mkDoc(path) { const parts = path.split("/"); return { type: "doc", path, id: parts.at(-1), parent: parts.slice(0, -1).join("/") }; }
function mkCol(path) { return { type: "col", path }; }

const snap = (path, data) => ({ id: path.split("/").at(-1), ref: mkDoc(path), exists: () => data !== undefined, data: () => (data === undefined ? undefined : structuredClone(data)) });

// ---- rules (mirror of firestore.rules) ----
function rulesCheck(op, path, before, after, state) {
  const a = currentAuth();
  const prof = a && state["users/" + a.uid];
  const active = !!(prof && prof.active === true);
  const manager = active && prof.role === "manager";
  const staff = active && ["manager", "operator"].includes(prof.role);
  const setupDone = !!state["meta/setup"];
  const p = path.split("/");
  const deny = () => { throw err("permission-denied", `rules: ${op} ${path}`); };
  const post = state.__after || {};
  const claiming = a && !setupDone && post["meta/setup"] && post["users/" + a.uid]?.role === "manager";
  const ok = (() => {
    if (path === "meta/setup") return op === "read" ? !!a : op === "create" && claiming;
    if (path === "settings/app") return op === "read" ? staff : manager || (op === "create" && claiming);
    if (p[0] === "users") {
      if (op === "read") return manager || (a && a.uid === p[1]);
      if (op === "delete") return false;
      return manager || (op === "create" && claiming && a.uid === p[1]);
    }
    if (p[0] === "clients" && p.length === 2) {
      if (op === "read") return staff;
      if (op === "create") return manager || (staff && after.credit_limit === null);
      if (op === "update") return manager || (staff && (after.credit_limit ?? null) === (before.credit_limit ?? null));
      return manager;
    }
    if (p[0] === "clients" && p[2] === "entries") return ["read", "create"].includes(op) ? staff : manager;
    if (p[0] === "numbers") return staff;
    if (p[0] === "sales") {
      if (op === "read") return staff;
      if (op === "create") return staff && typeof after.total === "number" && after.total > 0 && after.by_uid === a.uid;
      return manager;
    }
    if (p[0] === "registers" && p.length === 2) {
      if (op === "read") return staff;
      if (op === "create") return manager || (staff && after.status === "open");
      if (op === "update") return manager || (staff && before.status === "open");
      return manager;
    }
    if (p[0] === "registers" && p[2] === "moves") return ["read", "create"].includes(op) ? staff : manager;
    if (p[0] === "safe_moves") {
      if (op !== "create") return manager;
      return manager || (staff && ["day_close", "register_float"].includes(after.category) && typeof after.ref_day === "string"
        && (!!state["registers/" + after.ref_day]) === (after.category === "day_close"));
    }
    if (p[0] === "suppliers") return manager;
    return false;
  })();
  if (!ok) deny();
}
function readCheck(path, state) { try { rulesCheck("read", path, undefined, undefined, state); } catch (e) { throw e; } }

function commitWrites(writes) {
  const state = DB();
  const after = { ...state };
  for (const w of writes) {
    if (w.kind === "delete") delete after[w.path];
    else if (w.kind === "set") after[w.path] = w.merge ? { ...(after[w.path] || {}), ...w.data } : w.data;
    else if (w.kind === "update") { if (!(w.path in after)) throw err("not-found", "update missing " + w.path); after[w.path] = { ...after[w.path], ...w.data }; }
  }
  const ctx = { ...state, __after: after };
  for (const w of writes) {
    const before = state[w.path];
    const op = w.kind === "delete" ? "delete" : before === undefined ? "create" : "update";
    rulesCheck(op, w.path, before, after[w.path], ctx);
  }
  putDB(after);
  notify();
}

const watchers = [];
function notify() { for (const w of watchers) w(); }
window.addEventListener("storage", (e) => { if (e.key === "fake_db") notify(); });

function clean(v) { return JSON.parse(JSON.stringify(v, (k, x) => (x === undefined ? null : x))); }

export const fs = {
  initializeFirestore: () => ({ fake: true }),
  getFirestore: () => ({ fake: true }),
  persistentLocalCache: () => ({}),
  persistentMultipleTabManager: () => ({}),
  collection: (base, ...p) => mkCol(base.type === "doc" ? join(base.path, ...p) : p.join("/")),
  doc: (base, ...p) => {
    if (base.type === "col") return mkDoc(join(base.path, p[0] || rid()));
    if (base.type === "doc") return mkDoc(join(base.path, ...p));
    return mkDoc(p.join("/"));
  },
  getDoc: async (r) => { const s = DB(); readCheck(r.path, s); return snap(r.path, s[r.path]); },
  getDocs: async (q) => {
    const c = q.type === "query" ? q.col : q;
    const s = DB();
    let rows = Object.keys(s).filter((k) => k.startsWith(c.path + "/") && k.split("/").length === c.path.split("/").length + 1);
    if (rows.length || true) readCheck(c.path + "/x", s);
    let items = rows.map((k) => snap(k, s[k]));
    for (const cn of q.cons || []) {
      if (cn.t === "where") items = items.filter((d) => d.data()[cn.f] === cn.v);
      if (cn.t === "orderBy") items.sort((a, b) => (a.data()[cn.f] < b.data()[cn.f] ? -1 : 1) * (cn.dir === "desc" ? -1 : 1));
      if (cn.t === "limit") items = items.slice(0, cn.n);
    }
    return { docs: items, size: items.length, empty: !items.length };
  },
  query: (c, ...cons) => ({ type: "query", col: c, cons }),
  where: (f, o, v) => ({ t: "where", f, o, v }),
  orderBy: (f, dir = "asc") => ({ t: "orderBy", f, dir }),
  limit: (n) => ({ t: "limit", n }),
  setDoc: async (r, data, opt) => commitWrites([{ kind: "set", path: r.path, data: clean(data), merge: !!opt?.merge }]),
  addDoc: async (c, data) => { const r = mkDoc(join(c.path, rid())); commitWrites([{ kind: "set", path: r.path, data: clean(data) }]); return r; },
  updateDoc: async (r, data) => commitWrites([{ kind: "update", path: r.path, data: clean(data) }]),
  deleteDoc: async (r) => commitWrites([{ kind: "delete", path: r.path }]),
  writeBatch: () => {
    const w = [];
    return {
      set: (r, d, o) => w.push({ kind: "set", path: r.path, data: clean(d), merge: !!o?.merge }),
      update: (r, d) => w.push({ kind: "update", path: r.path, data: clean(d) }),
      delete: (r) => w.push({ kind: "delete", path: r.path }),
      commit: async () => commitWrites(w),
    };
  },
  runTransaction: async (db, fn) => {
    const writes = []; let wrote = false;
    const tx = {
      get: async (r) => { if (wrote) throw err("invalid-argument", "Firestore transactions require all reads to be executed before all writes."); const s = DB(); readCheck(r.path, s); return snap(r.path, s[r.path]); },
      set: (r, d, o) => { wrote = true; writes.push({ kind: "set", path: r.path, data: clean(d), merge: !!o?.merge }); return tx; },
      update: (r, d) => { wrote = true; writes.push({ kind: "update", path: r.path, data: clean(d) }); return tx; },
      delete: (r) => { wrote = true; writes.push({ kind: "delete", path: r.path }); return tx; },
    };
    const res = await fn(tx);
    commitWrites(writes);
    return res;
  },
  onSnapshot: (r, cb, onErr) => {
    const fire = () => { try { const s = DB(); readCheck(r.path, s); cb(snap(r.path, s[r.path])); } catch (e) { onErr && onErr(e); } };
    watchers.push(fire); setTimeout(fire, 0);
    return () => { const i = watchers.indexOf(fire); if (i >= 0) watchers.splice(i, 1); };
  },
};
