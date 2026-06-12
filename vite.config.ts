import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` doit correspondre au nom du repo pour GitHub Pages.
// En mode Tauri (ou dev), on sert depuis la racine.
const isPages = process.env.DEPLOY_TARGET === "pages";

export default defineConfig({
  plugins: [react()],
  base: isPages ? "/Layer-AI/" : "/",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
