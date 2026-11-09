# SIM Desk — mode d'emploi

Recharges via le bot Telegram du fournisseur, clients et dettes, caisse du jour, coffre, fournisseurs.
Les données sont dans Firebase : tous les PC et téléphones de la boutique voient les mêmes chiffres.
(Installation technique : voir README.md.)

## Comptes
- **Gérant** : accès complet (tableau de bord, coffre, fournisseurs, utilisateurs, paramètres).
- **Opérateur** : Recharge, Clients, Caisse du jour. Il ne voit pas le coffre, les fournisseurs, le solde chez le
  fournisseur ni les paramètres ; il ne peut pas supprimer un client ni changer une limite de crédit.
- Le gérant crée les comptes dans **Utilisateurs** (nom, e-mail, mot de passe, rôle). Pour retirer un accès :
  **Modifier → Compte actif** décoché. « Envoyer un lien de mot de passe » envoie un e-mail de réinitialisation.

## La journée
1. **Caisse → Ouvrir** avec le fond de caisse (pris dans le coffre).
2. **Recharge** : numéro → l'opérateur et le client sont reconnus → Flexy / Facture / International / Offres → montant
   → **Envoyer**. Un grand écran montre le numéro au client : **Confirmer et envoyer** (Entrée) ou **Corriger** (Échap).
   La réponse du bot s'affiche, puis **Enregistrer et opération suivante** (le reste non payé devient une dette).
   La réponse du bot est lue automatiquement. En cas de problème, une fenêtre l'explique : **Solde insuffisant**,
   **Aucune offre pour cette SIM**, **Numéro refusé**, **Opération non effectuée**, **Toujours en cours** ou
   **Pas de réponse du bot**. Dans ces cas rien n'est enregistré. Pendant l'attente, un compteur s'affiche et le bouton
   **Arrêter** coupe l'attente. Avant de renvoyer après « Pas de réponse » ou « En cours », utilisez **Vérifier à nouveau**
   pour ne pas envoyer deux fois.
   Le **type d'opération** de la vente (Flexy, Offre / abonnement, Facture, International, Carte) est choisi
   automatiquement ; il n'y a plus de description libre.
3. Sur l'écran de l'opérateur, les dettes et limites sont masquées (•••••) : l'œil les affiche 8 secondes.
   Les autres numéros du client sont masqués et le solde du fournisseur n'apparaît jamais.
4. **Clients → Relevé → Encaisser** quand un client rembourse (l'argent entre dans la caisse du jour).
5. Dépenses (café, transport…) : **Caisse → Ajouter un mouvement → Sortie**.
6. Le soir : comptez le tiroir → **Clôturer la journée**. Le montant compté part au **coffre**, l'écart s'affiche.
   Une journée clôturée ne peut être rouverte que par le gérant.

## Le gérant
- **Coffre** : solde, clôtures reçues, fonds de caisse sortis, apports, retraits, dépôts en banque.
- **Fournisseurs** : achats et paiements, payés depuis le coffre.
- **Paramètres** : nom de la boutique, écran de confirmation, fond de caisse, formats des commandes du bot,
  et **PC du bot** (adresse + clé d'accès affichées dans la fenêtre SIM Desk, liaison Telegram).

## Formats des commandes (bot Chahine Flexy)
| Opération | Opérateurs | Envoyé au bot |
|---|---|---|
| Flexy | Mobilis, Djezzy, Ooredoo | `0669970022*100` |
| International (≥ 200 DA) | Mobilis | `0669970022i200` |
| Facture | Djezzy | `0772415263**2500` |
| Facture | Ooredoo (05 → 01) | `0150569874*2500` |
| Offres / ماكتيفيا | tous | `0669970022` |

## Mode démo (pour s'entraîner)
Le bot de démo réagit selon les 2 derniers chiffres du numéro : `…00` ne répond pas, `…11` (offres) n'a aucune offre,
`…22` échoue, `…33` numéro refusé ; un montant supérieur au solde donne « Solde insuffisant ».

## À savoir
- Le PC du bot doit rester allumé avec la fenêtre SIM Desk ouverte. Son dossier `data/` contient la session
  Telegram : ne le partagez jamais. Utilisez de préférence un compte Telegram dédié à la boutique.
- Sans Internet, l'application affiche les dernières données mais n'enregistre pas les ventes : réessayez une fois
  la connexion revenue.
