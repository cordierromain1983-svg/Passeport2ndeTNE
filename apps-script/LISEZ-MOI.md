# Script du tableur « validation saisie 2nde TNE 1 »

Copie de sauvegarde du script Google Apps Script rattaché au tableur (Extensions → Apps Script).
Il sert aux deux passeports (2TNE1 → ce site, 1MS → site de 1re).

- `Code.gs` : menu « Passeports → Publier les validations » et réception des fiches faites en ligne (`doPost`).
- `Corrige.gs` : corrigé des fiches en ligne, pour recorriger côté tableur.

Le jeton GitHub n'est pas ici : il est rangé dans Paramètres du projet → Propriétés du script (`GITHUB_TOKEN`).

Après toute modification du script dans Google : Déployer → Gérer les déploiements → Modifier (crayon)
→ Version : « Nouvelle version » → Déployer. L'adresse de l'application Web ne change pas.
