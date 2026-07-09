# Fruit Saber Prototype

Prototype web autonome : un écran desktop affiche le jeu, un téléphone sert de contrôleur.

## Lancer

```bash
node server.js
```

Puis ouvrir :

```text
http://localhost:4177/new
```

Le jeu affiche un lien `controller.html?session=...` à ouvrir sur le téléphone.
Le téléphone et l'ordinateur doivent être sur le même réseau local.

## Ce qui fonctionne

- Jeu plein écran en Canvas.
- Fruits lancés automatiquement.
- Lame contrôlée en temps réel par le téléphone.
- Connexion desktop/mobile par Server-Sent Events + POST HTTP, sans dépendance npm.
- Contrôleur mobile avec deux modes :
  - capteurs `DeviceOrientationEvent` / `DeviceMotionEvent` si le navigateur les autorise ;
  - pavé tactile de secours, utilisable partout.

## Note capteurs mobiles

Sur iPhone et certains navigateurs Android, les capteurs de mouvement exigent un contexte sécurisé HTTPS.
En HTTP local, le pavé tactile fonctionnera, mais le bouton capteurs peut être refusé par le navigateur.

Pour une version démo publique vraiment gestuelle, mettre ce serveur derrière HTTPS, par exemple via un tunnel HTTPS
ou un déploiement Node avec certificat valide.

## Déploiement Netlify

Le repo contient aussi une configuration Netlify :

- `netlify.toml` publie le dossier `public/`.
- `/input` et `/api/input` sont routés vers une fonction Netlify.
- `/new` renvoie vers la page de jeu.

Sur Netlify, la page racine fonctionne directement. Le jeu utilise un polling léger vers la fonction Netlify pour recevoir
les gestes du téléphone, avec un contrôle tactile local en secours.

Les fichiers statiques existent à la fois à la racine et dans `public/`. C'est volontaire : le site reste fonctionnel si
Netlify publie `public/` via `netlify.toml`, ou si ses réglages d'interface publient encore la racine du repo.
