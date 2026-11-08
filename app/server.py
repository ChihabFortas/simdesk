"""Web server: serves the interface and a small JSON API. Run with:  python run.py"""
from contextlib import asynccontextmanager

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.routing import Route, Mount
from starlette.staticfiles import StaticFiles

from . import db
from .bridge import make_bridge, load_config, save_config, BotError, DEFAULT_CONFIG
from .paths import WEB

# The interface hosted on GitHub Pages lives on another website (https://<you>.github.io),
# so the browser asks this PC for permission first (CORS), and every request must carry the access key.
PAGES_ORIGINS = r"https://[A-Za-z0-9-]+\.github\.io"
state = {"bridge": None}


def bridge():
    return state["bridge"]


async def restart_bridge():
    if state["bridge"]:
        await state["bridge"].stop()
    state["bridge"] = make_bridge()
    await state["bridge"].start()


@asynccontextmanager
async def lifespan(app):
    db.init()
    await restart_bridge()
    yield
    await bridge().stop()


class KeyGuard(BaseHTTPMiddleware):
    """Requests coming from another site (GitHub Pages) must show the access key printed on this PC."""

    async def dispatch(self, request, call_next):
        origin = request.headers.get("origin")
        if origin and request.url.path.startswith("/api/") and request.method != "OPTIONS":
            own = f"{request.url.scheme}://{request.headers.get('host', '')}"
            key = request.headers.get("x-simdesk-key", "").strip().upper()
            if origin != own and key != load_config()["access_key"].upper():
                return JSONResponse({"ok": False, "error": "bad_key"}, status_code=401)
        return await call_next(request)


def ok(data=None):
    return JSONResponse({"ok": True, "data": data})


def fail(msg, code=400):
    return JSONResponse({"ok": False, "error": str(msg)}, status_code=code)


def api(fn):
    async def handler(request):
        try:
            body = await request.json() if request.method in ("POST", "PUT") else {}
        except Exception:
            body = {}
        try:
            return ok(await fn(request, body))
        except BotError as e:
            return fail(e)
        except ValueError as e:
            return fail(e)
        except Exception as e:  # keep the UI alive and show the reason
            return fail(f"{type(e).__name__}: {e}", 500)
    return handler


def pid(request, key="id"):
    return int(request.path_params[key])


# ---------------- bot
async def bot_status(r, b):
    st = await bridge().status()
    cfg = load_config()
    st["template"] = cfg.get("template")
    return st


async def bot_lookup(r, b):
    number = "".join(ch for ch in str(b.get("number", "")) if ch.isdigit() or ch == "+")
    if len(number) < 6:
        raise ValueError("invalid_number")
    text = load_config().get("template", "{number}").replace("{number}", number)
    return await bridge().send(text)


async def bot_click(r, b):
    return await bridge().click(int(b["msg_id"]), int(b["row"]), int(b["col"]))


async def bot_send(r, b):
    text = str(b.get("text", "")).strip()
    if not text:
        raise ValueError("empty")
    return await bridge().send(text)


async def bot_latest(r, b):
    return await bridge().latest()


# ---------------- settings & telegram login
SAFE_KEYS = ("bot", "template", "reply_wait", "first_timeout", "demo", "shop_name", "currency", "api_id")


async def ping(r, b):
    cfg = load_config()
    return {"app": "simdesk", "shop_name": cfg.get("shop_name")}


async def get_settings(r, b):
    cfg = load_config()
    out = {k: cfg.get(k) for k in SAFE_KEYS}
    out["access_key"] = cfg.get("access_key")
    out["has_api_hash"] = bool(cfg.get("api_hash"))
    return out


async def put_settings(r, b):
    cfg = load_config()
    for k in SAFE_KEYS:
        if k in b:
            cfg[k] = b[k]
    if b.get("api_hash"):
        cfg["api_hash"] = b["api_hash"].strip()
    for k in ("reply_wait", "first_timeout"):
        cfg[k] = float(cfg.get(k) or DEFAULT_CONFIG[k])
    cfg["demo"] = bool(cfg.get("demo"))
    save_config(cfg)
    await restart_bridge()
    return await get_settings(r, b)


async def tg_send_code(r, b):
    await bridge().send_code(b["phone"].strip())
    return {"sent": True}


async def tg_sign_in(r, b):
    return await bridge().sign_in(b["phone"].strip(), (b.get("code") or "").strip() or None, b.get("password") or None)


async def tg_logout(r, b):
    await bridge().logout()
    return {"ok": True}


# ---------------- business
async def dashboard(r, b):
    return db.dashboard()


async def clients(r, b):
    return db.list_clients(r.query_params.get("q", ""))


async def client_get(r, b):
    c = db.get_client(pid(r))
    if not c:
        raise ValueError("not_found")
    return c


async def client_create(r, b):
    if not b.get("name", "").strip():
        raise ValueError("name_required")
    return {"id": db.save_client(b)}


async def client_update(r, b):
    return {"id": db.save_client(b, pid(r))}


async def client_pay(r, b):
    amount = float(b.get("amount") or 0)
    if amount <= 0:
        raise ValueError("invalid_amount")
    db.client_payment(pid(r), amount, b.get("note", ""))
    return db.get_client(pid(r))


async def sales(r, b):
    return db.list_sales(r.query_params.get("day"))


async def sale_create(r, b):
    if float(b.get("total") or 0) <= 0:
        raise ValueError("invalid_amount")
    return {"id": db.add_sale(b)}


async def sale_delete(r, b):
    db.delete_sale(pid(r))
    return True


async def suppliers(r, b):
    return db.list_suppliers()


async def supplier_get(r, b):
    return db.get_supplier(pid(r))


async def supplier_create(r, b):
    if not b.get("name", "").strip():
        raise ValueError("name_required")
    return {"id": db.save_supplier(b)}


async def supplier_update(r, b):
    return {"id": db.save_supplier(b, pid(r))}


async def supplier_purchase(r, b):
    if float(b.get("total") or 0) <= 0:
        raise ValueError("invalid_amount")
    db.add_purchase(pid(r), b)
    return db.get_supplier(pid(r))


async def supplier_pay(r, b):
    amount = float(b.get("amount") or 0)
    if amount <= 0:
        raise ValueError("invalid_amount")
    db.supplier_payment(pid(r), amount, b.get("note", ""))
    return db.get_supplier(pid(r))


async def register_get(r, b):
    return db.register(r.query_params.get("day"))


async def register_open(r, b):
    db.open_register(float(b.get("opening") or 0))
    return db.register()


async def register_close(r, b):
    db.close_register(float(b.get("counted") or 0), b.get("note", ""))
    return db.register()


async def register_reopen(r, b):
    db.reopen_register()
    return db.register()


async def register_move(r, b):
    amount = float(b.get("amount") or 0)
    if amount <= 0 or b.get("direction") not in ("in", "out"):
        raise ValueError("invalid_amount")
    db.manual_move(b["direction"], b.get("category") or ("other_in" if b["direction"] == "in" else "expense"),
                   amount, b.get("note", ""))
    return db.register()


async def register_move_delete(r, b):
    db.delete_move(pid(r))
    return db.register()


async def register_history(r, b):
    return db.history(int(r.query_params.get("days", 30)))


def R(path, fn, methods=("GET",)):
    return Route(path, api(fn), methods=list(methods))


routes = [
    R("/api/ping", ping),
    R("/api/bot/status", bot_status),
    R("/api/bot/lookup", bot_lookup, ["POST"]),
    R("/api/bot/click", bot_click, ["POST"]),
    R("/api/bot/send", bot_send, ["POST"]),
    R("/api/bot/latest", bot_latest),
    R("/api/settings", get_settings),
    R("/api/settings", put_settings, ["PUT"]),
    R("/api/telegram/send_code", tg_send_code, ["POST"]),
    R("/api/telegram/sign_in", tg_sign_in, ["POST"]),
    R("/api/telegram/logout", tg_logout, ["POST"]),
    R("/api/dashboard", dashboard),
    R("/api/clients", clients),
    R("/api/clients", client_create, ["POST"]),
    R("/api/clients/{id:int}", client_get),
    R("/api/clients/{id:int}", client_update, ["PUT"]),
    R("/api/clients/{id:int}/pay", client_pay, ["POST"]),
    R("/api/sales", sales),
    R("/api/sales", sale_create, ["POST"]),
    R("/api/sales/{id:int}/delete", sale_delete, ["POST"]),
    R("/api/suppliers", suppliers),
    R("/api/suppliers", supplier_create, ["POST"]),
    R("/api/suppliers/{id:int}", supplier_get),
    R("/api/suppliers/{id:int}", supplier_update, ["PUT"]),
    R("/api/suppliers/{id:int}/purchase", supplier_purchase, ["POST"]),
    R("/api/suppliers/{id:int}/pay", supplier_pay, ["POST"]),
    R("/api/register", register_get),
    R("/api/register/open", register_open, ["POST"]),
    R("/api/register/close", register_close, ["POST"]),
    R("/api/register/reopen", register_reopen, ["POST"]),
    R("/api/register/move", register_move, ["POST"]),
    R("/api/register/move/{id:int}/delete", register_move_delete, ["POST"]),
    R("/api/register/history", register_history),
    Mount("/", StaticFiles(directory=WEB, html=True), name="web"),
]

app = Starlette(routes=routes, lifespan=lifespan, middleware=[
    Middleware(CORSMiddleware, allow_origin_regex=PAGES_ORIGINS,
               allow_origins=load_config().get("allowed_origins", []),
               allow_methods=["GET", "POST", "PUT"], allow_headers=["content-type", "x-simdesk-key"],
               allow_private_network=True, max_age=3600),
    Middleware(KeyGuard),
])
