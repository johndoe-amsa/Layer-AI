import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Servi depuis la racine du domaine (Vercel) comme en dev/Tauri.
  base: "/",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
