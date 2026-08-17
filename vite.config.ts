import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

export default defineConfig({
  plugins: [react()],
  define: {
    // Numéro de version affiché dans le pied de page. Lu depuis package.json
    // pour n'avoir qu'une seule source : c'est déjà lui que suit le tag de
    // release, il ne peut donc pas diverger de ce qui est publié.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Servi depuis la racine du domaine (Vercel) comme en dev/Tauri.
  base: "/",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
