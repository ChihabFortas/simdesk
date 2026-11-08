"""Talks to the provider's Telegram bot through YOUR Telegram account (a "userbot").

The website never chats with Telegram itself: it calls this module, which sends the
SIM number to the bot, waits for the reply (text + buttons), and clicks buttons for you.
If Telegram isn't configured yet, a demo bot answers instead so the interface can be tried.
"""
import asyncio
import json
import random
import re
import time
from pathlib import Path

from .paths import DATA

CONFIG_PATH = DATA / "config.json"
SESSION_PATH = DATA / "telegram"

DEFAULT_CONFIG = {
    "api_id": "",
    "api_hash": "",
    "bot": "",              # e.g. @ProviderTopupBot
    "template": "{number}", # what is sent to the bot when you press OK
    "reply_wait": 2.5,      # seconds of silence before we consider the bot finished
    "first_timeout": 30,    # max seconds to wait for the bot's first answer
    "demo": True,
    "shop_name": "SIM Desk",
    "currency": "DA",
    "access_key": "",       # asked by the GitHub Pages interface before it can talk to this PC
}


def load_config():
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        try:
            cfg.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
        except Exception:
            pass
    if not cfg.get("access_key"):
        import secrets
        cfg["access_key"] = "-".join(secrets.token_hex(2).upper() for _ in range(3))
        save_config(cfg)
    return cfg


def save_config(cfg):
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


class BotError(Exception):
    pass


# ---------------------------------------------------------------- real Telegram
class TelegramBridge:
    def __init__(self):
        self.cfg = load_config()
        self.client = None
        self.bot_entity = None
        self.queue = asyncio.Queue()
        self.cache = {}             # message id -> telethon Message
        self.lock = asyncio.Lock()
        self.phone_code_hash = None
        self.last_error = ""

    # --- lifecycle
    async def start(self):
        self.cfg = load_config()
        if self.cfg.get("demo") or not (self.cfg.get("api_id") and self.cfg.get("api_hash")):
            return
        try:
            from telethon import TelegramClient, events
        except ImportError:
            self.last_error = "telethon_missing"
            return
        try:
            if self.client:
                await self.client.disconnect()
            self.client = TelegramClient(str(SESSION_PATH), int(self.cfg["api_id"]), self.cfg["api_hash"])
            await self.client.connect()

            @self.client.on(events.NewMessage(incoming=True))
            async def _new(ev):
                await self._push(ev.message)

            @self.client.on(events.MessageEdited(incoming=True))
            async def _edit(ev):
                await self._push(ev.message)

            if await self.client.is_user_authorized():
                await self._resolve_bot()
            self.last_error = ""
        except Exception as e:  # bad api id/hash, no internet...
            self.last_error = str(e)

    async def stop(self):
        if self.client:
            await self.client.disconnect()

    async def _resolve_bot(self):
        self.bot_entity = None
        if self.cfg.get("bot"):
            try:
                self.bot_entity = await self.client.get_entity(self.cfg["bot"])
            except Exception as e:
                self.last_error = f"bot: {e}"

    async def _push(self, msg):
        if self.bot_entity is not None and msg.chat_id == self.bot_entity.id:
            self.cache[msg.id] = msg
            await self.queue.put(msg)

    async def status(self):
        st = {"mode": "telegram", "configured": bool(self.cfg.get("api_id") and self.cfg.get("api_hash")),
              "connected": False, "authorized": False, "bot": self.cfg.get("bot", ""),
              "bot_ok": self.bot_entity is not None, "me": "", "error": self.last_error}
        if self.client and self.client.is_connected():
            st["connected"] = True
            try:
                if await self.client.is_user_authorized():
                    st["authorized"] = True
                    me = await self.client.get_me()
                    st["me"] = " ".join(x for x in [me.first_name, me.last_name] if x) or (me.username or "")
            except Exception as e:
                st["error"] = str(e)
        return st

    # --- login (done once from the Settings page)
    async def send_code(self, phone):
        if not self.client:
            await self.start()
        if not self.client:
            raise BotError(self.last_error or "not_configured")
        sent = await self.client.send_code_request(phone)
        self.phone_code_hash = sent.phone_code_hash

    async def sign_in(self, phone, code=None, password=None):
        from telethon.errors import SessionPasswordNeededError
        try:
            if password and not code:
                await self.client.sign_in(password=password)
            else:
                await self.client.sign_in(phone, code, phone_code_hash=self.phone_code_hash)
        except SessionPasswordNeededError:
            if not password:
                return {"need_password": True}
            await self.client.sign_in(password=password)
        await self._resolve_bot()
        return {"ok": True}

    async def logout(self):
        if self.client:
            await self.client.log_out()
        self.bot_entity = None

    # --- conversation
    def _drain(self):
        while not self.queue.empty():
            self.queue.get_nowait()

    async def _collect(self):
        """Wait for the bot's answer; keep listening until it goes quiet (bots often edit/send several messages)."""
        got = {}
        try:
            m = await asyncio.wait_for(self.queue.get(), timeout=float(self.cfg.get("first_timeout", 30)))
            got[m.id] = m
        except asyncio.TimeoutError:
            return []
        quiet = float(self.cfg.get("reply_wait", 2.5))
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            try:
                m = await asyncio.wait_for(self.queue.get(), timeout=quiet)
                got[m.id] = m
            except asyncio.TimeoutError:
                break
        return [serialize(m) for m in sorted(got.values(), key=lambda x: x.id)]

    def _ready(self):
        if not self.client or self.bot_entity is None:
            raise BotError("bot_not_ready")

    async def send(self, text):
        self._ready()
        async with self.lock:
            self._drain()
            await self.client.send_message(self.bot_entity, text)
            return {"messages": await self._collect()}

    async def click(self, msg_id, row, col):
        self._ready()
        async with self.lock:
            msg = self.cache.get(msg_id)
            if msg is None:
                msg = await self.client.get_messages(self.bot_entity, ids=msg_id)
            if msg is None:
                raise BotError("message_gone")
            self._drain()
            notice = ""
            try:
                ans = await msg.click(row, col)
                if ans is not None and getattr(ans, "message", None):
                    notice = ans.message  # popup/alert text from a callback button
            except Exception as e:
                if "timeout" not in str(e).lower():
                    raise
            msgs = await self._collect()
            return {"messages": msgs, "notice": notice}

    async def latest(self, n=3):
        """Re-read the last messages of the chat (for bots that answer slowly)."""
        self._ready()
        msgs = await self.client.get_messages(self.bot_entity, limit=n)
        for m in msgs:
            self.cache[m.id] = m
        return {"messages": [serialize(m) for m in reversed(msgs) if not m.out]}


def serialize(m):
    buttons = []
    if m.buttons:
        for r, row in enumerate(m.buttons):
            buttons.append([{"text": b.text, "r": r, "c": c, "url": getattr(b, "url", None)} for c, b in enumerate(row)])
    return {"id": m.id, "text": m.raw_text or "", "buttons": buttons,
            "date": m.date.isoformat() if m.date else "", "edited": bool(m.edit_date)}


# ---------------------------------------------------------------- demo bot
OPERATORS = {"06": "Mobilis", "07": "Djezzy", "05": "Ooredoo"}


class DemoBridge:
    """A pretend provider bot, so the shop can try the interface before linking Telegram."""

    def __init__(self):
        self.cfg = load_config()
        self.msgs = {}
        self.next_id = 1000
        self.state = {}

    async def start(self):
        self.cfg = load_config()

    async def stop(self):
        pass

    async def status(self):
        return {"mode": "demo", "configured": False, "connected": True, "authorized": True,
                "bot": "DemoBot", "bot_ok": True, "me": "Démo", "error": ""}

    def _msg(self, text, buttons=None):
        self.next_id += 1
        btns = [[{"text": t, "r": r, "c": c, "url": None} for c, t in enumerate(row)] for r, row in enumerate(buttons or [])]
        m = {"id": self.next_id, "text": text, "buttons": btns, "date": "", "edited": False}
        self.msgs[m["id"]] = m
        return m

    async def send(self, text):
        await asyncio.sleep(0.7)
        num = re.sub(r"\D", "", text)
        if len(num) < 9:
            return {"messages": [self._msg("❌ Numéro invalide. Envoyez un numéro à 10 chiffres.")]}
        op = OPERATORS.get(num[:2], "4G LTE")
        self.state = {"number": num, "op": op}
        bal = random.choice([0, 35, 120, 260, 1450])
        due = random.choice([0, 0, 1500, 2500])
        lines = [f"📱 Numéro: {num}", f"Opérateur: {op}", f"Solde actuel: {bal} DA"]
        if due:
            lines.append(f"Facture du mois: {due} DA")
            lines.append("Échéance: 15/11/2026")
        lines.append("")
        lines.append("Choisissez l'opération :")
        rows = [["Flexy 100 DA", "Flexy 200 DA", "Flexy 500 DA"], ["Flexy 1000 DA", "Forfait 1500 DA"]]
        if due:
            rows.append([f"Payer facture {due} DA"])
        rows.append(["Carte 4G 2000 DA", "❌ Annuler"])
        return {"messages": [self._msg("\n".join(lines), rows)]}

    async def click(self, msg_id, row, col):
        await asyncio.sleep(0.6)
        m = self.msgs.get(msg_id)
        if not m:
            raise BotError("message_gone")
        label = m["buttons"][row][col]["text"]
        if "Annuler" in label:
            return {"messages": [self._msg("Opération annulée.")], "notice": ""}
        if label.startswith("✅"):
            amount = self.state.get("amount", 0)
            ref = f"TX{random.randint(10000000, 99999999)}"
            text = (f"✅ Opération réussie\nNuméro: {self.state.get('number')}\nOpération: {self.state.get('label')}\n"
                    f"Montant: {amount} DA\nRéférence: {ref}\nSolde revendeur: {random.randint(20000, 90000)} DA")
            if "Carte" in self.state.get("label", ""):
                text += f"\nCode carte: {random.randint(1000, 9999)}-{random.randint(1000, 9999)}-{random.randint(1000, 9999)}"
            return {"messages": [self._msg(text)], "notice": "Opération effectuée"}
        amt = re.search(r"(\d+)\s*DA", label)
        self.state.update({"label": label, "amount": int(amt.group(1)) if amt else 0})
        return {"messages": [self._msg(
            f"Confirmer : {label}\nvers le {self.state.get('number')} ?", [["✅ Confirmer", "❌ Annuler"]])], "notice": ""}

    async def latest(self, n=3):
        return {"messages": list(self.msgs.values())[-1:]}

    async def send_code(self, phone):
        raise BotError("demo_mode")

    async def sign_in(self, *a, **k):
        raise BotError("demo_mode")

    async def logout(self):
        pass


def make_bridge():
    cfg = load_config()
    return DemoBridge() if cfg.get("demo") else TelegramBridge()
