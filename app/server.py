"""SIM Desk bot bridge — runs on the shop PC that is logged into Telegram.

All business data (clients, sales, registers, safe…) now lives in Firebase Firestore and is handled by the
web interface directly. This server only does what a browser cannot: talk to the provider's Telegram bot.
Every /api call except /api/ping must carry the access key shown in this PC's SIM Desk window.
"""
from contextlib import asynccontextmanager

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.routing import Route, Mount
from starlette.staticfiles import StaticFiles

from .bridge import make_bridge, load_config, save_config, BotError, DEFAULT_CONFIG
from .paths import WEB

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
    await restart_bridge()
    yield
    await bridge().stop()


class KeyGuard(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        if path.startswith("/api/") and path != "/api/ping" and request.method != "OPTIONS":
            key = request.headers.get("x-simdesk-key", "").strip().upper()
            if key != load_config()["access_key"].upper():
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
        except (BotError, ValueError) as e:
            return fail(e)
        except Exception as e:
            return fail(f"{type(e).__name__}: {e}", 500)
    return handler


# ---------------- bot
# Raise when the web interface starts needing a new bridge route; the interface warns if the PC is older.
BRIDGE_API = 2


async def ping(r, b):
    return {"app": "simdesk-bridge", "api": BRIDGE_API, "mode": "demo" if load_config().get("demo") else "telegram"}


async def bot_status(r, b):
    return await bridge().status()


async def bot_send(r, b):
    text = str(b.get("text", "")).strip()
    if not text:
        raise ValueError("empty")
    return await bridge().send(text)


async def bot_click(r, b):
    return await bridge().click(int(b["msg_id"]), int(b["row"]), int(b["col"]))


async def bot_latest(r, b):
    return await bridge().latest()


async def bot_menu(r, b):
    return await bridge().menu()


# ---------------- this PC's Telegram settings
SAFE_KEYS = ("bot", "reply_wait", "first_timeout", "demo", "api_id")


async def get_settings(r, b):
    cfg = load_config()
    out = {k: cfg.get(k) for k in SAFE_KEYS}
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


def R(path, fn, methods=("GET",)):
    return Route(path, api(fn), methods=list(methods))


routes = [
    R("/api/ping", ping),
    R("/api/bot/status", bot_status),
    R("/api/bot/send", bot_send, ["POST"]),
    R("/api/bot/click", bot_click, ["POST"]),
    R("/api/bot/latest", bot_latest),
    R("/api/bot/menu", bot_menu),
    R("/api/settings", get_settings),
    R("/api/settings", put_settings, ["PUT"]),
    R("/api/telegram/send_code", tg_send_code, ["POST"]),
    R("/api/telegram/sign_in", tg_sign_in, ["POST"]),
    R("/api/telegram/logout", tg_logout, ["POST"]),
    Mount("/", StaticFiles(directory=WEB, html=True), name="web"),
]

app = Starlette(routes=routes, lifespan=lifespan, middleware=[
    Middleware(CORSMiddleware, allow_origin_regex=PAGES_ORIGINS,
               allow_origins=load_config().get("allowed_origins", []),
               allow_methods=["GET", "POST", "PUT"], allow_headers=["content-type", "x-simdesk-key"],
               allow_private_network=True, max_age=3600),
    Middleware(KeyGuard),
])
