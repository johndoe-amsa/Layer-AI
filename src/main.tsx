import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme, loadSettings } from "./lib/settings";
import "./styles.css";

// Thème posé avant le premier rendu (le script inline d'index.html a déjà
// évité le flash ; ici on branche aussi le suivi du thème système).
applyTheme(loadSettings().theme);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
