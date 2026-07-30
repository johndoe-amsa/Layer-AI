export interface Settings {
  apiKey: string;
  /** Modèle OpenAI choisi pour chaque mode (clé = identifiant de tâche). */
  models: Record<string, string>;
  /** Coller automatiquement le presse-papier à l'ouverture (desktop). */
  autoPaste: boolean;
  /**
   * Notes personnelles injectées dans le prompt du mode Répondre
   * (signature, tutoiement/vouvoiement, préférences de style). Optionnel.
   */
  replyProfile: string;
  /** Thème d'interface : clair, sombre, ou celui du système (défaut). */
  theme: Theme;
}

export type Theme = "light" | "dark" | "system";

/** Choix de thème proposés dans les réglages. */
export const THEMES: { code: Theme; label: string }[] = [
  { code: "light", label: "Clair" },
  { code: "dark", label: "Sombre" },
  { code: "system", label: "Système" },
];

// Requête média observée pour le mode « Système » : quand l'OS bascule
// clair/sombre, l'app suit en direct sans rechargement.
const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
let currentTheme: Theme = "system";

function syncTheme() {
  const dark =
    currentTheme === "dark" || (currentTheme === "system" && !!darkQuery?.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  // Barre du navigateur (PWA iPhone) assortie au fond de l'app.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#0f0f0f" : "#ffffff");
}

darkQuery?.addEventListener("change", () => {
  if (currentTheme === "system") syncTheme();
});

/** Pose le thème sur `<html>` (attribut `data-theme`, lu par le CSS). */
export function applyTheme(theme: Theme) {
  currentTheme = theme;
  syncTheme();
}

const KEY = "layer-ai-settings";

/** Modèles OpenAI proposés dans les listes déroulantes. */
export interface ModelOption {
  id: string;
  label: string;
}

export const MODELS: ModelOption[] = [
  { id: "gpt-4o-mini", label: "GPT-4o mini · éco" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini · équilibré" },
  { id: "gpt-4.1", label: "GPT-4.1 · qualité max" },
];

/** Modèle par défaut pour chaque mode. */
export const DEFAULT_MODELS: Record<string, string> = {
  fix: "gpt-4.1-mini",
  translate: "gpt-4.1",
  rephrase: "gpt-4.1-mini",
  // Rédaction libre imitant un style : la qualité prime sur le coût.
  reply: "gpt-4.1",
};

/** Modèle de repli si un mode n'a pas de modèle défini. */
export const FALLBACK_MODEL = "gpt-4.1-mini";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        apiKey: parsed.apiKey ?? "",
        autoPaste: parsed.autoPaste ?? true,
        replyProfile: parsed.replyProfile ?? "",
        models: { ...DEFAULT_MODELS, ...(parsed.models ?? {}) },
        theme:
          parsed.theme === "light" || parsed.theme === "dark" ? parsed.theme : "system",
      };
    }
  } catch {
    // stockage corrompu : on repart de zéro
  }
  return {
    apiKey: "",
    autoPaste: true,
    replyProfile: "",
    models: { ...DEFAULT_MODELS },
    theme: "system",
  };
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** Préférences d'interface mémorisées entre deux sessions. */
export interface Prefs {
  /** Identifiant du dernier onglet (tâche) utilisé. */
  task: string;
  /** Code de la dernière langue de traduction choisie. */
  targetLang: string;
  /** Code du dernier ton de reformulation choisi. */
  tone: string;
}

const PREFS_KEY = "layer-ai-prefs";

const DEFAULT_PREFS: Prefs = { task: "fix", targetLang: "fr", tone: "standard" };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    // stockage corrompu : on repart des valeurs par défaut
  }
  return { ...DEFAULT_PREFS };
}

export function savePrefs(p: Prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
}
