"""Where things live — works both from source (python run.py) and from the built SIM-Desk.exe."""
import sys
from pathlib import Path

FROZEN = getattr(sys, "frozen", False)

# Bundled, read-only files (the web interface). Inside the .exe they are unpacked to a temp folder.
RESOURCES = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
WEB = RESOURCES / "web"

# Your data (database, settings, Telegram session) always sits next to the program / .exe.
HOME = Path(sys.executable).resolve().parent if FROZEN else Path(__file__).resolve().parent.parent
DATA = HOME / "data"
DATA.mkdir(parents=True, exist_ok=True)
