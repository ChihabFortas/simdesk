# SIM Desk — Recharge, clients, dettes et caisse

Une interface moderne (français / العربية) qui parle au bot Telegram du fournisseur à votre place,
plus la gestion des clients, des dettes, de la caisse journalière et des fournisseurs.

## Installation (une seule fois)
1. Dézippez `SIM-Desk-windows.zip` dans un dossier fixe (ex. `C:\SIM-Desk`).
2. Double-cliquez **`SIM-Desk.exe`** (si Windows avertit : *Informations complémentaires → Exécuter quand même*).
   Le navigateur s'ouvre sur `http://localhost:8765`. Laissez la fenêtre noire ouverte : elle affiche la **clé d'accès**.
3. Interface en ligne (GitHub Pages) : ouvrez votre adresse `https://<compte>.github.io/<repo>/`,
   laissez `http://localhost:8765`, entrez la clé → **Connecter** (cliquez *Autoriser* si le navigateur demande
   l'accès au réseau local). Ça marche sur le PC de la boutique ; les téléphones utilisent `http://<IP-du-PC>:8765`.

*(Sans le .exe : installez Python 3.10+ puis double-cliquez `start.bat`.)*

L'application démarre en **mode démo** (bot simulé) pour que vous puissiez essayer tout de suite.

## Lier le vrai bot (une seule fois)
1. Allez sur **my.telegram.org** → connectez-vous avec le numéro de votre compte Telegram
   → **API development tools** → créez une application → notez **API ID** et **API Hash**.
2. Dans SIM Desk → **Paramètres** : décochez *Mode démo*, collez API ID / API Hash,
   le nom du bot (ex. `@NomDuBot`), puis **Enregistrer**.
3. Dans la carte *Connexion du compte Telegram* : votre numéro (+213…) → **Recevoir le code**
   → tapez le code reçu dans Telegram (et le mot de passe 2FA si vous en avez un) → **Se connecter**.
4. Le badge en bas à gauche passe au vert : *Bot prêt*.

**Message envoyé au bot** : par défaut le numéro seul (`{number}`). Si votre bot attend une commande,
mettez par ex. `/recharge {number}`. Si le bot répond lentement, augmentez *Attente après la dernière réponse*.

## Utilisation
- **Recharge** : tapez le numéro → **OK**. La réponse du bot s'affiche en carte (solde, facture…) et ses
  boutons deviennent de grandes tuiles. Touchez une tuile, confirmez. Si le bot demande un montant ou un code,
  utilisez la case *Répondre au bot*. Le montant et la description se remplissent tout seuls à droite :
  choisissez le client (ou *client de passage*), ajustez *Payé* si le client paie une partie → **Enregistrer**.
  Le reste devient automatiquement une dette du client.
- **Clients** : dettes de chaque client, historique, bouton **Encaisser** quand il rembourse.
- **Caisse** : ouvrez la journée avec le fond de caisse. Ventes, remboursements, achats et paiements fournisseurs
  s'y ajoutent tout seuls. Ajoutez les dépenses/retraits à la main. Le soir : comptez l'argent → **Clôturer** (l'écart s'affiche).
- **Fournisseurs** : achats (payés ou à crédit) et paiements.
- Depuis un téléphone sur le Wi-Fi de la boutique : `http://<IP-du-PC>:8765`.

## À savoir
- Toutes les données sont dans `data/` à côté du programme (`simdesk.db`). **Sauvegardez ce dossier** régulièrement (clé USB…).
- `data/telegram.session` donne accès à votre compte Telegram : ne le partagez jamais.
  Utilisez de préférence un compte Telegram dédié à la boutique.
- Le PC doit rester allumé avec la fenêtre SIM Desk ouverte pendant l'utilisation.
- Évitez d'écrire au bot depuis votre téléphone pendant qu'une opération est en cours dans SIM Desk.

## Fichiers
- `app/bridge.py` — liaison avec le bot (Telethon) + bot de démo
- `app/db.py` — base SQLite : clients, ventes, dettes, caisse, fournisseurs
- `app/server.py` — API
- `web/` — l'interface (HTML/CSS/JS, sans compilation)
