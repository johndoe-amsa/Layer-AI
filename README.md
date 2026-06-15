# Layer AI :)

Mini assistant LLM : corriger, traduire ou reformuler un texte en un raccourci clavier.

Un seul codebase, deux versions :

- **Web** — déployée sur Vercel, utilisable dans n'importe quel navigateur (idéal au travail, rien à installer).
- **Desktop Windows** — fenêtre flottante toujours au premier plan, invoquée avec `Ctrl+Shift+Espace` où que tu sois.

La clé API OpenAI se configure dans les réglages de l'app (icône ⚙️). Elle est stockée uniquement sur l'appareil et les requêtes partent directement vers l'API OpenAI — aucun serveur intermédiaire.

## Version web

Déployée sur Vercel. La branche `main` correspond à la production ; chaque
autre branche / pull request obtient automatiquement une URL de **preview**
unique pour tester avant de merger.

> Mise en place : importer le repo sur [vercel.com](https://vercel.com)
> (preset **Vite**, build `npm run build`, output `dist`). Ne pas définir la
> variable `DEPLOY_TARGET` — le site est servi depuis la racine du domaine.

## Version desktop (Windows)

### Installer une release

Les installateurs (`.msi` et `.exe`) sont compilés par GitHub Actions à chaque tag `v*` et publiés dans l'onglet **Releases**.

Pour publier une nouvelle version :

```bash
git tag v0.1.0
git push origin v0.1.0
```

> Windows SmartScreen affichera « Éditeur inconnu » car l'app n'est pas signée : cliquer sur *Informations complémentaires → Exécuter quand même*.

### Raccourcis

| Raccourci | Action |
|---|---|
| `Ctrl+Shift+Espace` | Afficher / masquer la fenêtre (global) |
| `Échap` | Masquer la fenêtre |
| `Ctrl+Entrée` | Lancer la requête |

## Développement local

Prérequis : [Node.js ≥ 20](https://nodejs.org), et pour la version desktop [Rust](https://rustup.rs) + les [prérequis Tauri](https://tauri.app/start/prerequisites/).

```bash
npm install

# Version web (navigateur, hot reload)
npm run dev

# Version desktop (fenêtre native, hot reload)
npm run tauri dev

# Compiler l'installateur Windows localement
npm run tauri build
```

Pour tester une mise à jour du code : `git pull` puis relancer la commande dev.

## Structure

```
src/                  Frontend React partagé (web + desktop)
  lib/tasks.ts        Onglets et prompts prédéfinis
  lib/openai.ts       Client API OpenAI (streaming)
  lib/desktop.ts      Intégration Tauri (no-op dans le navigateur)
src-tauri/            Enveloppe desktop (Rust / Tauri 2)
.github/workflows/    Build Windows (release sur tag v*)
```
