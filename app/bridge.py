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
    "template": "{number}", # number only: shows the bot's offers (ماكتيفيا)
    # How each operation is written for the provider bot (Chahine Flexy formats).
    # {number} = 0669970022   {amount} = 100   {number01} = number with its first 2 digits replaced by 01
    "commands": {
        "flexy": "{number}*{amount}",
        "international": "{number}i{amount}",
        "bill_djezzy": "{number}**{amount}",
        "bill_ooredoo": "{number01}*{amount}",
    },
    "reply_wait": 2.5,      # seconds of silence before we consider the bot finished
    "first_timeout": 30,    # max seconds to wait for the bot's first answer
    "demo": True,
    "shop_name": "SIM Desk",
    "currency": "DA",
    "access_key": "",       # asked by the GitHub Pages interface before it can talk to this PC
}


def load_config():
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))
    if CONFIG_PATH.exists():
        try:
            saved = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            cfg["commands"].update(saved.pop("commands", {}) or {})
            cfg.update(saved)
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


OPERATOR_PREFIX = {"05": "Ooredoo", "06": "Mobilis", "07": "Djezzy", "01": "Ooredoo"}
# which operations each operator supports, and the minimum amount
OPERATIONS = {
    "Mobilis": {"flexy": 50, "international": 200, "offers": 0},
    "Djezzy": {"flexy": 50, "bill": 100, "offers": 0},
    "Ooredoo": {"flexy": 50, "bill": 100, "offers": 0},
}


def normalize_number(raw):
    d = "".join(ch for ch in str(raw) if ch.isdigit())
    if d.startswith("213") and len(d) == 12:
        d = "0" + d[3:]
    if len(d) == 9 and d[0] in "567":
        d = "0" + d
    return d


def build_command(raw_number, operation, amount=None, cfg=None):
    """Turn (number, operation, amount) into the exact text the bot expects."""
    cfg = cfg or load_config()
    num = normalize_number(raw_number)
    if len(num) != 10 or num[:2] not in OPERATOR_PREFIX:
        raise ValueError("invalid_number")
    op = OPERATOR_PREFIX[num[:2]]
    if num.startswith("01"):        # someone typed the Ooredoo bill form directly
        num, operation = "05" + num[2:], "bill"
    allowed = OPERATIONS[op]
    if operation not in allowed:
        raise ValueError("operation_not_available")
    if operation == "offers":
        return cfg.get("template", "{number}").replace("{number}", num), op, num
    try:
        amount = int(float(amount))
    except (TypeError, ValueError):
        raise ValueError("invalid_amount")
    if amount < allowed[operation]:
        raise ValueError(f"min_amount:{allowed[operation]}")
    key = {"flexy": "flexy", "international": "international",
           "bill": "bill_djezzy" if op == "Djezzy" else "bill_ooredoo"}[operation]
    tpl = cfg["commands"][key]
    text = tpl.replace("{number01}", "01" + num[2:]).replace("{number}", num).replace("{amount}", str(amount))
    return text, op, num


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

    async def menu(self, refresh=False):
        """The bot's bottom keyboard (رصيد / ديون / بطاقات …). Its labels carry live values."""
        self._ready()
        async with self.lock:
            for attempt in range(2):
                msgs = await self.client.get_messages(self.bot_entity, limit=60)
                for m in msgs:
                    if type(m.reply_markup).__name__ == "ReplyKeyboardMarkup" and not m.out:
                        self.cache[m.id] = m
                        return {"msg_id": m.id, "buttons": serialize(m)["menu"]}
                if attempt == 0:  # no keyboard in history: ask the bot for it
                    self._drain()
                    await self.client.send_message(self.bot_entity, "/start")
                    await self._collect()
        return {"msg_id": None, "buttons": []}


def serialize(m):
    buttons = []
    if m.buttons:
        for r, row in enumerate(m.buttons):
            buttons.append([{"text": b.text, "r": r, "c": c, "url": getattr(b, "url", None)} for c, b in enumerate(row)])
    keyboard = type(m.reply_markup).__name__ == "ReplyKeyboardMarkup"
    return {"id": m.id, "text": m.raw_text or "", "buttons": [] if keyboard else buttons,
            "menu": buttons if keyboard else None,
            "date": m.date.isoformat() if m.date else "", "edited": bool(m.edit_date)}


# ---------------------------------------------------------------- demo bot
class DemoBridge:
    """A pretend 'Chahine Flexy' bot using the real command formats, to try the app before linking Telegram."""

    MENU = [["🎁 بطاقات"], ["الارباح : {profit} دج", "رصيد : {balance} دج", "ديون : 0 دج"],
            ["📅 سجل التحويلات", "👨 حسابك", "💰 تحويل الارباح"], ["📗 دليل الاستخدام", "🤙 اتصل بنا"]]

    def __init__(self):
        self.cfg = load_config()
        self.msgs = {}
        self.next_id = 1000
        self.balance = 48500
        self.profit = 1230
        self.history = []

    async def start(self):
        self.cfg = load_config()

    async def stop(self):
        pass

    async def status(self):
        return {"mode": "demo", "configured": False, "connected": True, "authorized": True,
                "bot": "Chahine Flexy (démo)", "bot_ok": True, "me": "Démo", "error": ""}

    def _msg(self, text, buttons=None, menu=False):
        self.next_id += 1
        btns = [[{"text": t, "r": r, "c": c, "url": None} for c, t in enumerate(row)] for r, row in enumerate(buttons or [])]
        m = {"id": self.next_id, "text": text, "buttons": [] if menu else btns, "menu": btns if menu else None,
             "date": "", "edited": False}
        self.msgs[m["id"]] = m
        return m

    def _menu_msg(self, text):
        rows = [[b.format(profit=self.profit, balance=self.balance) for b in row] for row in self.MENU]
        return self._msg(text, rows, menu=True)

    async def send(self, text):
        await asyncio.sleep(0.7)
        text = text.strip()
        if text == "/start":
            return {"messages": [self._menu_msg("مرحبا بك في Chahine Flexy")]}
        if "رصيد" in text:
            return {"messages": [self._msg(f"رصيدك الحالي: {self.balance} دج")]}
        if "الارباح" in text:
            return {"messages": [self._msg(f"أرباحك: {self.profit} دج")]}
        if "ديون" in text:
            return {"messages": [self._msg("ديونك: 0 دج")]}
        if "سجل" in text:
            return {"messages": [self._msg("\n".join(self.history[-10:]) or "لا توجد تحويلات")]}
        if "بطاقات" in text:
            return {"messages": [self._msg("اختر البطاقة:", [["Free Fire 1 USD", "Free Fire 5 USD"], ["PUBG 1 USD", "PUBG 5 USD"],
                                                             ["Idoom 4G 1000 DA", "Idoom 4G 2000 DA"]])]}
        m = re.fullmatch(r"(0[1567]\d{8})(?:(\*\*|\*|n|i|f|ى)(\d+))?", text)
        if not m:
            return {"messages": [self._msg("❌ صيغة غير صحيحة. راجع دليل الاستخدام")]}
        num, sep, amount = m.groups()
        if not sep:
            return {"messages": [self._msg(f"📱 {num}\nاختر العرض:", [["Mix 500 DA", "Mix 1000 DA"], ["Internet 2000 DA", "❌ إلغاء"]])]}
        amount = int(amount)
        kind = {"i": "انترناسيونال", "f": "فاتورة", "**": "فاتورة"}.get(sep, "فاتورة" if num.startswith("01") else "ارسال عادي")
        if amount > self.balance:
            return {"messages": [self._msg("❌ رصيدك غير كاف")]}
        self.balance -= amount
        self.profit += max(1, amount // 50)
        self.history.append(f"{num} — {kind} — {amount} دج ✅")
        return {"messages": [self._menu_msg(
            f"✅ تمت العملية بنجاح\nالرقم: {num}\nالعملية: {kind}\nالمبلغ: {amount} دج\nرصيدك: {self.balance} دج")]}

    async def click(self, msg_id, row, col):
        m = self.msgs.get(msg_id)
        if not m:
            raise BotError("message_gone")
        btn = (m["buttons"] or m["menu"])[row][col]["text"]
        if m["menu"]:
            return await self.send(btn)
        await asyncio.sleep(0.6)
        if "إلغاء" in btn:
            return {"messages": [self._msg("تم الإلغاء")], "notice": ""}
        amt = re.search(r"(\d+)\s*(DA|USD)", btn)
        if amt and amt.group(2) == "DA" and int(amt.group(1)) <= self.balance:
            self.balance -= int(amt.group(1))
        code = f"{random.randint(1000, 9999)}-{random.randint(1000, 9999)}-{random.randint(1000, 9999)}"
        extra = f"\nالكود: {code}" if ("USD" in btn or "Idoom" in btn) else ""
        return {"messages": [self._msg(f"✅ تمت العملية بنجاح\n{btn}{extra}\nرصيدك: {self.balance} دج")], "notice": ""}

    async def latest(self, n=3):
        return {"messages": list(self.msgs.values())[-1:]}

    async def menu(self, refresh=False):
        m = self._menu_msg("القائمة")
        return {"msg_id": m["id"], "buttons": m["menu"]}

    async def send_code(self, phone):
        raise BotError("demo_mode")

    async def sign_in(self, *a, **k):
        raise BotError("demo_mode")

    async def logout(self):
        pass


def make_bridge():
    cfg = load_config()
    return DemoBridge() if cfg.get("demo") else TelegramBridge()
