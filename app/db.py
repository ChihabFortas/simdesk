"""SQLite storage: clients, debts, sales, suppliers, purchases and the cash register."""
import sqlite3
from datetime import datetime, date
from pathlib import Path

from .paths import DATA

DB_PATH = DATA / "simdesk.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL
);
-- A sale: a top-up, a monthly payment, a card... total vs paid (the rest is debt)
CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    ts TEXT NOT NULL,
    client_id INTEGER REFERENCES clients(id),
    sim_number TEXT DEFAULT '',
    kind TEXT DEFAULT '',
    description TEXT DEFAULT '',
    total REAL NOT NULL DEFAULT 0,
    paid REAL NOT NULL DEFAULT 0,
    bot_reply TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS client_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    day TEXT NOT NULL,
    ts TEXT NOT NULL,
    amount REAL NOT NULL,
    note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    day TEXT NOT NULL,
    ts TEXT NOT NULL,
    description TEXT DEFAULT '',
    total REAL NOT NULL DEFAULT 0,
    paid REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS supplier_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    day TEXT NOT NULL,
    ts TEXT NOT NULL,
    amount REAL NOT NULL,
    note TEXT DEFAULT ''
);
-- Every dinar that enters or leaves the drawer
CREATE TABLE IF NOT EXISTS cash_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    ts TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('in','out')),
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    note TEXT DEFAULT '',
    ref_type TEXT DEFAULT '',
    ref_id INTEGER
);
CREATE TABLE IF NOT EXISTS register_days (
    day TEXT PRIMARY KEY,
    opening REAL NOT NULL DEFAULT 0,
    counted REAL,
    closed_at TEXT,
    note TEXT DEFAULT ''
);
-- A client can pay for several lines (his own, his family's…)
CREATE TABLE IF NOT EXISTS client_numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    number TEXT NOT NULL UNIQUE,
    label TEXT DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sales_day ON sales(day);
CREATE INDEX IF NOT EXISTS ix_sales_client ON sales(client_id);
CREATE INDEX IF NOT EXISTS ix_cash_day ON cash_movements(day);
"""


def now():
    return datetime.now().isoformat(timespec="seconds")


def today():
    return date.today().isoformat()


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def init():
    with connect() as con:
        con.executescript(SCHEMA)
        cols = {r["name"] for r in con.execute("PRAGMA table_info(clients)")}
        if "credit_limit" not in cols:   # upgrade older databases
            con.execute("ALTER TABLE clients ADD COLUMN credit_limit REAL")
        # a client's contact phone that is a mobile line also counts as one of his numbers
        for c in con.execute("SELECT id, phone FROM clients").fetchall():
            n = norm_number(c["phone"])
            if is_mobile(n):
                con.execute("INSERT OR IGNORE INTO client_numbers(client_id,number,label,created_at) VALUES (?,?,?,?)",
                            (c["id"], n, "", now()))


OPERATORS = {"05": "Ooredoo", "06": "Mobilis", "07": "Djezzy"}


def norm_number(raw):
    d = "".join(ch for ch in str(raw or "") if ch.isdigit())
    if d.startswith("213") and len(d) == 12:
        d = "0" + d[3:]
    if len(d) == 9 and d[0] in "567":
        d = "0" + d
    if len(d) == 10 and d.startswith("01"):   # Ooredoo bill form
        d = "05" + d[2:]
    return d


def is_mobile(n):
    return len(n) == 10 and n[:2] in OPERATORS


def operator_of(n):
    return OPERATORS.get(norm_number(n)[:2], "")


def rows(sql, args=()):
    with connect() as con:
        return [dict(r) for r in con.execute(sql, args).fetchall()]


def one(sql, args=()):
    r = rows(sql, args)
    return r[0] if r else None


def cash(con, direction, category, amount, note="", ref_type="", ref_id=None, day=None):
    if not amount or amount <= 0:
        return
    con.execute(
        "INSERT INTO cash_movements(day,ts,direction,category,amount,note,ref_type,ref_id) VALUES (?,?,?,?,?,?,?,?)",
        (day or today(), now(), direction, category, amount, note, ref_type, ref_id),
    )


# ---------------- clients ----------------
CLIENT_BALANCE = """
SELECT c.*,
  COALESCE((SELECT SUM(total - paid) FROM sales s WHERE s.client_id = c.id), 0)
  - COALESCE((SELECT SUM(amount) FROM client_payments p WHERE p.client_id = c.id), 0) AS debt,
  (SELECT MAX(ts) FROM sales s WHERE s.client_id = c.id) AS last_sale
FROM clients c
"""


def list_clients(q=""):
    like = f"%{q}%"
    digits = norm_number(q) if any(ch.isdigit() for ch in q) else None
    out = rows(CLIENT_BALANCE + """ WHERE c.name LIKE ? OR c.phone LIKE ?
        OR c.id IN (SELECT client_id FROM client_numbers WHERE number LIKE ?)
        ORDER BY debt DESC, c.name""", (like, like, f"%{digits or q}%"))
    nums = {}
    for n in rows("SELECT client_id, number FROM client_numbers ORDER BY id"):
        nums.setdefault(n["client_id"], []).append(n["number"])
    for c in out:
        c["numbers"] = nums.get(c["id"], [])
    return out


def get_client(cid):
    c = one(CLIENT_BALANCE + " WHERE c.id = ?", (cid,))
    if not c:
        return None
    c["numbers"] = client_numbers(cid)
    c["sales"] = rows("SELECT * FROM sales WHERE client_id=? ORDER BY ts DESC LIMIT 200", (cid,))
    c["payments"] = rows("SELECT * FROM client_payments WHERE client_id=? ORDER BY ts DESC LIMIT 200", (cid,))
    return c


def client_numbers(cid):
    out = rows("SELECT * FROM client_numbers WHERE client_id=? ORDER BY id", (cid,))
    for n in out:
        n["operator"] = operator_of(n["number"])
    return out


def client_by_number(raw):
    n = norm_number(raw)
    if not is_mobile(n):
        return None
    hit = one("SELECT client_id, label FROM client_numbers WHERE number=?", (n,))
    if not hit:
        return None
    c = one(CLIENT_BALANCE + " WHERE c.id = ?", (hit["client_id"],))
    c["numbers"] = client_numbers(c["id"])
    c["number_label"] = hit["label"]
    return c


def _limit(v):
    return float(v) if v not in (None, "") else None


def save_client(data, cid=None):
    with connect() as con:
        if cid:
            con.execute("UPDATE clients SET name=?, phone=?, note=?, credit_limit=? WHERE id=?",
                        (data["name"], data.get("phone", ""), data.get("note", ""), _limit(data.get("credit_limit")), cid))
        else:
            cid = con.execute("INSERT INTO clients(name,phone,note,credit_limit,created_at) VALUES (?,?,?,?,?)",
                              (data["name"], data.get("phone", ""), data.get("note", ""),
                               _limit(data.get("credit_limit")), now())).lastrowid
        extra = list(data.get("numbers") or [])
        if is_mobile(norm_number(data.get("phone"))):
            extra.append({"number": data.get("phone"), "label": ""})
        for n in extra:
            _attach(con, cid, n.get("number"), n.get("label", ""), move=False)
        return cid


def _attach(con, cid, raw, label="", move=True):
    n = norm_number(raw)
    if not is_mobile(n):
        raise ValueError("invalid_number")
    owner = con.execute("SELECT client_id FROM client_numbers WHERE number=?", (n,)).fetchone()
    if owner and owner["client_id"] != cid:
        if not move:
            raise ValueError("number_taken")
        con.execute("UPDATE client_numbers SET client_id=?, label=? WHERE number=?", (cid, label, n))
    elif owner:
        if label:
            con.execute("UPDATE client_numbers SET label=? WHERE number=?", (label, n))
    else:
        con.execute("INSERT INTO client_numbers(client_id,number,label,created_at) VALUES (?,?,?,?)", (cid, n, label, now()))


def add_client_number(cid, raw, label=""):
    with connect() as con:
        _attach(con, cid, raw, label, move=False)
    return client_numbers(cid)


def delete_client_number(cid, nid):
    with connect() as con:
        con.execute("DELETE FROM client_numbers WHERE id=? AND client_id=?", (nid, cid))
    return client_numbers(cid)


def delete_client(cid):
    """Removes the client and his debt records. Sales stay in the register history as walk-in sales."""
    with connect() as con:
        con.execute("DELETE FROM client_numbers WHERE client_id=?", (cid,))
        con.execute("DELETE FROM client_payments WHERE client_id=?", (cid,))
        con.execute("UPDATE sales SET client_id=NULL WHERE client_id=?", (cid,))
        con.execute("DELETE FROM clients WHERE id=?", (cid,))


def statement(cid, date_from=None, date_to=None, number=None, operator=None):
    """Client account statement: sales (debit) and payments (credit) with a running balance."""
    c = one(CLIENT_BALANCE + " WHERE c.id = ?", (cid,))
    if not c:
        raise ValueError("not_found")
    labels = {n["number"]: n["label"] for n in client_numbers(cid)}
    lines = []
    for s_ in rows("SELECT * FROM sales WHERE client_id=? ORDER BY ts", (cid,)):
        n = norm_number(s_["sim_number"])
        lines.append({"type": "sale", "id": s_["id"], "ts": s_["ts"], "day": s_["day"], "number": n,
                      "label": labels.get(n, ""), "operator": operator_of(n), "description": s_["description"],
                      "debit": s_["total"], "credit": s_["paid"]})
    for p in rows("SELECT * FROM client_payments WHERE client_id=? ORDER BY ts", (cid,)):
        lines.append({"type": "payment", "id": p["id"], "ts": p["ts"], "day": p["day"], "number": "", "label": "",
                      "operator": "", "description": p["note"], "debit": 0, "credit": p["amount"]})
    lines.sort(key=lambda x: (x["ts"], x["id"]))
    by_line = bool(number or operator)   # payments are not tied to a number
    if by_line:
        n = norm_number(number) if number else None
        lines = [l for l in lines if l["type"] == "sale" and (not n or l["number"] == n)
                 and (not operator or l["operator"] == operator)]
    opening, out, bal = 0.0, [], 0.0
    for l in lines:
        if date_from and l["day"] < date_from:
            opening += l["debit"] - l["credit"]
            continue
        if date_to and l["day"] > date_to:
            continue
        out.append(l)
    bal = opening
    for l in out:
        bal += l["debit"] - l["credit"]
        l["balance"] = round(bal, 2)
    return {
        "client": {k: c[k] for k in ("id", "name", "phone", "note", "credit_limit", "debt")},
        "numbers": client_numbers(cid), "lines": out, "opening": round(opening, 2), "closing": round(bal, 2),
        "total_debit": sum(l["debit"] for l in out), "total_credit": sum(l["credit"] for l in out),
        "count": sum(1 for l in out if l["type"] == "sale"), "by_line": by_line,
        "filters": {"from": date_from, "to": date_to, "number": number, "operator": operator},
    }


def client_payment(cid, amount, note=""):
    with connect() as con:
        cur = con.execute("INSERT INTO client_payments(client_id,day,ts,amount,note) VALUES (?,?,?,?,?)",
                          (cid, today(), now(), amount, note))
        name = con.execute("SELECT name FROM clients WHERE id=?", (cid,)).fetchone()["name"]
        cash(con, "in", "debt_payment", amount, f"{name} {note}".strip(), "client_payment", cur.lastrowid)


# ---------------- sales ----------------
def add_sale(d):
    total = float(d.get("total") or 0)
    paid = min(float(d.get("paid") if d.get("paid") not in (None, "") else total), total)
    cid = d.get("client_id") or None
    if total - paid > 0.001 and not cid:
        raise ValueError("client_required_for_debt")
    with connect() as con:
        cur = con.execute(
            "INSERT INTO sales(day,ts,client_id,sim_number,kind,description,total,paid,bot_reply) VALUES (?,?,?,?,?,?,?,?,?)",
            (today(), now(), cid, norm_number(d.get("sim_number", "")) or d.get("sim_number", ""), d.get("kind", ""), d.get("description", ""),
             total, paid, d.get("bot_reply", "")))
        note = " ".join(x for x in [d.get("description", ""), d.get("sim_number", "")] if x)
        cash(con, "in", "sale", paid, note, "sale", cur.lastrowid)
        if cid and d.get("attach_number") and is_mobile(norm_number(d.get("sim_number"))):
            _attach(con, int(cid), d["sim_number"], d.get("number_label", ""), move=False)
        return cur.lastrowid


def list_sales(day=None, limit=300):
    sql = "SELECT s.*, c.name AS client_name FROM sales s LEFT JOIN clients c ON c.id = s.client_id"
    if day:
        return rows(sql + " WHERE s.day=? ORDER BY s.ts DESC", (day,))
    return rows(sql + " ORDER BY s.ts DESC LIMIT ?", (limit,))


def delete_sale(sid):
    with connect() as con:
        con.execute("DELETE FROM cash_movements WHERE ref_type='sale' AND ref_id=?", (sid,))
        con.execute("DELETE FROM sales WHERE id=?", (sid,))


# ---------------- suppliers ----------------
SUPPLIER_BALANCE = """
SELECT s.*,
  COALESCE((SELECT SUM(total - paid) FROM purchases p WHERE p.supplier_id = s.id), 0)
  - COALESCE((SELECT SUM(amount) FROM supplier_payments sp WHERE sp.supplier_id = s.id), 0) AS owed,
  COALESCE((SELECT SUM(total) FROM purchases p WHERE p.supplier_id = s.id), 0) AS purchased
FROM suppliers s
"""


def list_suppliers():
    return rows(SUPPLIER_BALANCE + " ORDER BY owed DESC, s.name")


def get_supplier(sid):
    s = one(SUPPLIER_BALANCE + " WHERE s.id=?", (sid,))
    if not s:
        return None
    s["purchases"] = rows("SELECT * FROM purchases WHERE supplier_id=? ORDER BY ts DESC LIMIT 200", (sid,))
    s["payments"] = rows("SELECT * FROM supplier_payments WHERE supplier_id=? ORDER BY ts DESC LIMIT 200", (sid,))
    return s


def save_supplier(data, sid=None):
    with connect() as con:
        if sid:
            con.execute("UPDATE suppliers SET name=?, phone=?, note=? WHERE id=?",
                        (data["name"], data.get("phone", ""), data.get("note", ""), sid))
            return sid
        cur = con.execute("INSERT INTO suppliers(name,phone,note,created_at) VALUES (?,?,?,?)",
                          (data["name"], data.get("phone", ""), data.get("note", ""), now()))
        return cur.lastrowid


def add_purchase(sid, d):
    total = float(d.get("total") or 0)
    paid = min(float(d.get("paid") if d.get("paid") not in (None, "") else total), total)
    with connect() as con:
        cur = con.execute("INSERT INTO purchases(supplier_id,day,ts,description,total,paid) VALUES (?,?,?,?,?,?)",
                          (sid, today(), now(), d.get("description", ""), total, paid))
        name = con.execute("SELECT name FROM suppliers WHERE id=?", (sid,)).fetchone()["name"]
        cash(con, "out", "purchase", paid, f"{name} {d.get('description', '')}".strip(), "purchase", cur.lastrowid)


def supplier_payment(sid, amount, note=""):
    with connect() as con:
        cur = con.execute("INSERT INTO supplier_payments(supplier_id,day,ts,amount,note) VALUES (?,?,?,?,?)",
                          (sid, today(), now(), amount, note))
        name = con.execute("SELECT name FROM suppliers WHERE id=?", (sid,)).fetchone()["name"]
        cash(con, "out", "supplier_payment", amount, f"{name} {note}".strip(), "supplier_payment", cur.lastrowid)


# ---------------- register ----------------
def register(day=None):
    day = day or today()
    reg = one("SELECT * FROM register_days WHERE day=?", (day,))
    if not reg:
        prev = one("SELECT * FROM register_days WHERE day < ? ORDER BY day DESC LIMIT 1", (day,))
        suggested = 0
        if prev:
            suggested = prev["counted"] if prev["counted"] is not None else register_expected(prev["day"])
        reg = {"day": day, "opening": None, "suggested_opening": suggested, "counted": None, "closed_at": None, "note": ""}
    moves = rows("SELECT * FROM cash_movements WHERE day=? ORDER BY ts DESC, id DESC", (day,))
    tin = sum(m["amount"] for m in moves if m["direction"] == "in")
    tout = sum(m["amount"] for m in moves if m["direction"] == "out")
    opening = reg["opening"] or 0
    by_cat = {}
    for m in moves:
        k = (m["direction"], m["category"])
        by_cat[k] = by_cat.get(k, 0) + m["amount"]
    sales = one("SELECT COUNT(*) n, COALESCE(SUM(total),0) total, COALESCE(SUM(paid),0) paid FROM sales WHERE day=?", (day,))
    reg.update({
        "moves": moves, "total_in": tin, "total_out": tout,
        "expected": opening + tin - tout,
        "difference": (reg["counted"] - (opening + tin - tout)) if reg.get("counted") is not None else None,
        "by_category": [{"direction": k[0], "category": k[1], "amount": v} for k, v in sorted(by_cat.items())],
        "sales_count": sales["n"], "sales_total": sales["total"], "new_debt": sales["total"] - sales["paid"],
    })
    return reg


def register_expected(day):
    reg = one("SELECT opening FROM register_days WHERE day=?", (day,))
    m = one("""SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount END),0) i,
                      COALESCE(SUM(CASE WHEN direction='out' THEN amount END),0) o
               FROM cash_movements WHERE day=?""", (day,))
    return (reg["opening"] if reg else 0) + m["i"] - m["o"]


def open_register(opening, day=None):
    day = day or today()
    with connect() as con:
        con.execute("INSERT INTO register_days(day,opening) VALUES (?,?) ON CONFLICT(day) DO UPDATE SET opening=excluded.opening",
                    (day, opening))


def close_register(counted, note="", day=None):
    day = day or today()
    with connect() as con:
        con.execute("INSERT OR IGNORE INTO register_days(day,opening) VALUES (?,0)", (day,))
        con.execute("UPDATE register_days SET counted=?, note=?, closed_at=? WHERE day=?", (counted, note, now(), day))


def reopen_register(day=None):
    with connect() as con:
        con.execute("UPDATE register_days SET counted=NULL, closed_at=NULL WHERE day=?", (day or today(),))


def manual_move(direction, category, amount, note=""):
    with connect() as con:
        cash(con, direction, category, amount, note, "manual", None)


def delete_move(mid):
    with connect() as con:
        con.execute("DELETE FROM cash_movements WHERE id=? AND ref_type='manual'", (mid,))


def history(days=30):
    return rows("""
      SELECT day,
        SUM(CASE WHEN direction='in' THEN amount ELSE 0 END) AS total_in,
        SUM(CASE WHEN direction='out' THEN amount ELSE 0 END) AS total_out
      FROM cash_movements GROUP BY day ORDER BY day DESC LIMIT ?""", (days,))


def dashboard():
    d = today()
    reg = register(d)
    return {
        "day": d,
        "sales_count": reg["sales_count"],
        "sales_total": reg["sales_total"],
        "total_in": reg["total_in"],
        "total_out": reg["total_out"],
        "drawer": reg["expected"],
        "register_open": reg.get("opening") is not None and not reg.get("closed_at"),
        "clients_debt": one(f"SELECT COALESCE(SUM(debt),0) v FROM ({CLIENT_BALANCE})")["v"],
        "suppliers_owed": one(f"SELECT COALESCE(SUM(owed),0) v FROM ({SUPPLIER_BALANCE})")["v"],
        "top_debtors": rows(f"SELECT * FROM ({CLIENT_BALANCE}) WHERE debt > 0.001 ORDER BY debt DESC LIMIT 5"),
        "recent_sales": list_sales(limit=8),
        "week": list(reversed(history(7))),
    }
