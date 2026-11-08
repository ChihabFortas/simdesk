# SIM Desk

French/Arabic shop app for SIM top-ups through a provider's Telegram bot, with clients and debts, a day register, a safe, suppliers and staff accounts. All data lives in **Firebase Firestore**, so every PC and phone in the shop sees the same data in real time.

## How it fits together

| Part | Where it runs | What it does |
|---|---|---|
| **Interface** (`web/`) | GitHub Pages (or any PC) | Login, recharge, clients, registers, safe, users. It talks to Firebase directly. |
| **Data** | Firebase Auth + Cloud Firestore | Accounts and all records. Money moves run in transactions, and `firestore.rules` enforce the roles. |
| **Bot bridge** (`SIM-Desk.exe`) | The one shop PC logged into Telegram | Sends the commands to the provider bot and returns its replies. It stores no business data. |

### Roles

- **Manager:** everything, including the dashboard, safe, suppliers, users and settings.
- **Operator:** recharges, clients (no delete, no credit limit changes) and today's day register (open, expenses, close). The operator's screen can face customers:
  - Before sending, a big confirmation screen shows the number, operator and amount.
  - Client debts and limits are hidden behind an eye button.
  - Other numbers are masked.
  - The provider balance and profits are removed from the bot's replies.

### Money flow

- **Morning:** opening the day register takes the float out of the safe (this can be turned off).
- **During the day:**
  - Sales and debt payments go into the day register.
  - Expenses come out of it.
- **Closing:** the counted cash is transferred to the safe automatically. Only a manager can reopen a closed day, and reopening cancels that transfer.
- **Suppliers:** purchases and supplier payments are paid from the safe.

## Setup (once)

### 1. Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Add project**. Analytics isn't needed.
2. **Build → Authentication → Get started → Email/Password → Enable.**
3. **Build → Firestore Database → Create database → Production mode.** Pick a location close to you, e.g. `europe-west`.
4. **Firestore → Rules:** paste the content of `firestore.rules`, then **Publish**.
5. **Project settings → General → Your apps → Web (</>)** → register the app → copy the `firebaseConfig` object.
6. **Authentication → Settings → Authorized domains:** add `<your-user>.github.io`.

### 2. GitHub

1. Upload this folder to a new repository, keeping the `.github` folder.
2. **Settings → Secrets and variables → Actions → Variables → New variable** named `FIREBASE_CONFIG`. Its value is the config as JSON, for example:
   `{"apiKey":"AIza…","authDomain":"x.firebaseapp.com","projectId":"x","storageBucket":"x.appspot.com","messagingSenderId":"1","appId":"1:…"}`
   Alternatively, paste it into `web/firebase-config.js`.
3. **Settings → Pages → Source: GitHub Actions.**
4. **Settings → Actions → General → Workflow permissions: Read and write.**
5. Push to `main`. The site deploys to Pages, and `SIM-Desk.exe` is built and available under **Actions → Artifacts**, or on a release if you tag `v1.0.0`.
6. *(Optional)* Firestore rules can deploy themselves: add the secret `FIREBASE_SERVICE_ACCOUNT` (a service-account JSON key) and the variable `FIREBASE_PROJECT_ID`.

### 3. First login

1. Open the Pages URL and choose **Première installation ? → Créer le compte**.
2. Then **Terminer**. That account becomes the **manager**. This only works once; the rules refuse a second setup.
3. Go to **Utilisateurs** and create the operators' accounts.

### 4. Bot PC

1. Run `SIM-Desk.exe` on the PC that will be logged into Telegram. Keep its window open; it shows the **access key**.
2. On that PC, sign in as manager and go to **Paramètres → PC du bot**:
   - Leave the server address as `http://localhost:8765`.
   - Enter the access key, then **Enregistrer**.
   - Link Telegram in the card on the right.
3. Operators automatically receive the address and key with the shop settings.

> The bot bridge is reached at `http://localhost:8765`, so recharges are made from the bot PC itself. Clients, registers and statements work from any device. To recharge from a second PC, set the bot PC's network address (`http://192.168.x.x:8765`, shown in its window) in **Paramètres**, and open SIM Desk on that second PC at that same address rather than from GitHub Pages. Browsers block an `https` page from calling a plain `http` LAN address. If Firebase then refuses to sign in, add that address under **Authentication → Settings → Authorized domains**.

## Development

- No build step: `web/` is plain HTML/CSS/JS modules.
- `tests/fb-fake.js` is an offline stand-in for the Firebase SDK that mirrors `firestore.rules`. Copy it over `web/fb.js` in a scratch folder to run the interface without Firebase.
- To run the bridge from source: `pip install -r requirements.txt`, then `python run.py`.
