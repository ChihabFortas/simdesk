# SIM Desk

Modern French/Arabic interface for a SIM top-up shop. It talks to the provider's Telegram bot for you (top-ups, monthly bills, 4G cards) and manages clients, debts, the daily cash register and suppliers.

## How it fits together

| Part | Where it runs | What it does |
|---|---|---|
| **Interface** (`web/`) | GitHub Pages — `https://<user>.github.io/<repo>/` | The screens. Built and published automatically. |
| **Server** (`app/`, `run.py`) | The shop PC — `SIM-Desk.exe` | Logs into Telegram, talks to the bot, stores all data in `data/`. |

GitHub Pages can only host static files, so the server must keep running on the shop PC. The Pages interface connects to it at `http://localhost:8765` using an **access key** shown in the SIM Desk window.

## GitHub setup (once)

1. Create a new repository on GitHub and upload everything in this folder (keep the `.github` folder).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Actions → General → Workflow permissions: Read and write.** This lets builds publish releases.
4. Push to `main`. Two workflows then run automatically:
   - **Deploy interface to GitHub Pages** publishes `web/` to your Pages URL.
   - **Build Windows app** builds `SIM-Desk.exe`. Download it from the run's *Artifacts* section in the **Actions** tab.
5. For a permanent download link, create a tag: **Releases → Draft a new release → tag `v1.0.0` → Publish**. The workflow attaches `SIM-Desk-windows.zip` to that release.

## Shop PC

1. Unzip `SIM-Desk-windows.zip` into a folder you keep, e.g. `C:\SIM-Desk`.
2. Double-click `SIM-Desk.exe`. Windows SmartScreen may warn about an unsigned app: choose **More info → Run anyway**. Allow it in the firewall if asked.
3. Keep the black window open. It shows the **access key**.
4. Open your Pages URL. Leave the server as `http://localhost:8765`, enter the key, and click **Connect**. If the browser asks for local network access, click **Allow**.
5. Link Telegram in **Settings**. See `LISEZ-MOI.md`.

Your data is stored in `data/` next to the `.exe`. Back it up regularly. `data/telegram.session` gives access to the Telegram account, so never upload it or share it.

> **Phones and other PCs in the shop:** open `http://<shop-PC-IP>:8765` directly. The IP is shown in the SIM Desk window. Browsers block an `https://` Pages site from talking to `http://192.168…` addresses, so the Pages URL only works on the shop PC itself.

## Running from source

```
pip install -r requirements.txt
python run.py
```

On Windows, `start.bat` does this for you.
