# PHONE / SLICE ⚔️

Un Fruit Ninja où **ton téléphone est la lame**. L'ordinateur affiche le jeu, le téléphone streame son orientation en temps réel via WebRTC, et tu tranches des fruits en fendant l'air.

100 % statique : HTML + CSS + JS vanilla, zéro backend, zéro build. Parfait pour Netlify.

## Comment ça marche

```
téléphone (capteurs)          laptop (jeu)
deviceorientation  ──WebRTC──▶  pointeur-lame → tranchage
     ~60 Hz         (PeerJS)     canvas + physique + particules
```

- **PeerJS** établit un data channel WebRTC pair-à-pair entre le téléphone et l'écran. Le broker public gratuit de PeerJS ne sert qu'à la mise en relation ; le flux de mouvement passe ensuite en direct, sans serveur.
- L'écran génère un **code de salle** à 4 caractères + un **QR code**. Le téléphone scanne ou tape le code.
- Le téléphone envoie `alpha` (yaw) et `beta` (pitch) à ~60 Hz. L'écran les convertit en position de pointeur, comme un pointeur laser, avec lissage et calcul de vitesse.
- Un fruit est tranché quand le segment de lame de la frame croise son cercle **et** que la lame va assez vite (on tranche, on ne caresse pas).
- Retour haptique : le téléphone vibre à chaque fruit tranché (Android ; iOS ne supporte pas `navigator.vibrate`).

## Structure

```
├── index.html          # écran de jeu (laptop) : lobby + canvas
├── controller.html     # contrôleur (téléphone) : code → permission → lame
├── css/style.css
├── js/desktop.js       # hôte PeerJS + moteur de jeu
└── js/controller.js    # streaming des capteurs
```

## Déployer

### 1. GitHub

```bash
cd phone-slice
git init
git add .
git commit -m "⚔️ phone slice — le téléphone est la lame"
gh repo create phone-slice --public --source=. --push
# ou sans gh CLI : crée le repo sur github.com puis
# git remote add origin git@github.com:TON_USER/phone-slice.git
# git push -u origin main
```

### 2. Netlify

**Option A — depuis GitHub (recommandé, redéploiement auto à chaque push) :**
1. [app.netlify.com](https://app.netlify.com) → *Add new site* → *Import an existing project*
2. Choisis GitHub → sélectionne `phone-slice`
3. Build command : *(vide)* — Publish directory : `.` (racine)
4. *Deploy*

**Option B — drag & drop :**
Glisse simplement le dossier `phone-slice` sur [app.netlify.com/drop](https://app.netlify.com/drop).

C'est tout. Pas de variables d'environnement, pas de fonction serveur.

## Jouer

Important : ne lance pas le jeu en double-cliquant sur `index.html` dans le ZIP. Il faut servir le dossier avec un vrai serveur web, ou mieux le déployer en HTTPS.

1. Ouvre l'URL Netlify sur ton **laptop** → un code + QR s'affichent
2. Scanne le QR avec ton **téléphone** (ou ouvre `/controller.html` et tape le code)
3. Sur iPhone : accepte la permission « Mouvement et orientation »
4. Pointe le téléphone vers l'écran, appuie sur **Recentrer la lame** si besoin
5. Tranche 🍈

Un mode souris est disponible sur l'écran de jeu pour tester sans téléphone.

### Tester rapidement sur l'ordinateur

```bash
cd phone-slice
python3 -m http.server 8080
```

Puis ouvre `http://localhost:8080` et clique sur **Jouer à la souris**.

Pour jouer avec le téléphone comme lame, il faut que le téléphone ouvre une URL **HTTPS**. Le plus simple est de déployer le dossier sur Netlify. Un simple `http://192.168.x.x:8080` peut afficher la page, mais les capteurs du téléphone seront bloqués par le navigateur.

## Notes techniques

- Les fruits visibles dans le jeu viennent du **Kenney Food Kit**, un pack 3D publié en Creative Commons CC0. Le projet utilise les previews PNG du pack comme sprites légers pour garder le jeu simple et rapide à charger.
- **HTTPS obligatoire** pour `deviceorientation` — Netlify le fournit d'office. En local, `localhost` fonctionne pour l'écran, mais le téléphone doit accéder en HTTPS (utilise Netlify ou `npx serve` + tunnel type `cloudflared`).
- iOS 13+ exige `DeviceOrientationEvent.requestPermission()` déclenché par un geste utilisateur, d'où le bouton « Activer les capteurs ».
- Le yaw (`alpha`) est relatif à une orientation de référence capturée à la connexion : le bouton **Recentrer** la redéfinit, indispensable car la boussole dérive.
- Si deux parties génèrent le même code en même temps (1 chance sur ~920 000), recharge la page.

## Idées d'évolution

- Deux lames = deux joueurs (le host accepte plusieurs connexions)
- Mode chrono 60 s avec game over + leaderboard (Supabase)
- Utiliser les quaternions (`AbsoluteOrientationSensor`) pour un tracking plus stable
- Sons de tranchage (Web Audio, tu connais 😉)
