---
name: verify
description: Vérifier un changement de Layer AI en pilotant l'app compilée dans un navigateur headless, sans clé API réelle.
---

# Vérifier Layer AI

App 100 % front (React + Vite) : la seule surface est l'interface web. Pas de
tests dans le repo ; on vérifie en pilotant l'app réelle.

## Lancer

```bash
npm install && npm run build          # tsc -b && vite build
npx vite preview --port 4173 --strictPort   # sert dist/ (en arrière-plan)
```

## Piloter (Playwright)

Chromium est préinstallé dans l'environnement distant :
`executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"`
(installer le paquet npm `playwright` dans le scratchpad, pas dans le repo).

Deux astuces indispensables :

- **Clé API factice** avant chargement, sinon l'app ouvre les réglages au
  premier « Lancer » :
  ```js
  await page.addInitScript(() => {
    localStorage.setItem("layer-ai-settings",
      JSON.stringify({ apiKey: "sk-test", autoPaste: true, replyProfile: "", models: {} }));
  });
  ```
- **Stub de l'API OpenAI** via `page.route("https://api.openai.com/**", …)` :
  répondre en `text/event-stream` avec des lignes
  `data: {"choices":[{"delta":{"content":"…"}}]}` puis `data: [DONE]`.
  Capturer `route.request().postData()` permet de vérifier le prompt système
  et le message utilisateur réellement envoyés.

## Flux à couvrir selon l'onglet touché

- Onglets Corriger/Traduire/Reformuler : saisie → Lancer → sortie streamée ;
  le message utilisateur est délimité par `<<< … >>>`.
- Onglet Répondre : blocs de conversation numérotés en ordre chronologique
  (1 = plus ancien ; le bouton d'ajout insère en tête ; pilules Reçu/Moi ;
  blocs repliés hors focus), consigne, profil des réglages injecté dans le
  prompt système, bouton « Reprendre et reformuler » vers l'onglet Reformuler.
- Réglages : engrenage en haut à droite, sauvegarde dans localStorage.
