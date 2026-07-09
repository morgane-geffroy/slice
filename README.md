# Slice

Build web Godot basé sur [`ZDemeter/Shrunk_slice_test`](https://github.com/ZDemeter/Shrunk_slice_test).

## Déploiement Netlify

- Build command : laisser vide
- Publish directory : `.`

Le fichier `_headers` configure le type MIME du WASM et les en-têtes d'isolation nécessaires aux exports web Godot modernes.

## Fichiers principaux

- `index.html` : page de lancement Godot
- `index.js` : runtime web Godot
- `index.wasm` : moteur exporté
- `index.pck` : données du jeu
