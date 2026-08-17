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

/** Durée du fondu de bascule ; doit rester alignée sur `[data-theme-anim]`. */
const THEME_FADE_MS = 200;

let fadeTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Autorise les transitions de couleur le temps de la bascule, via l'attribut
 * `data-theme-anim` que guette le CSS. On les retire ensuite : les laisser en
 * permanence retarderait aussi les changements de fond au survol.
 */
function fadeThemeSwitch(root: HTMLElement) {
  root.dataset.themeAnim = "";
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => delete root.dataset.themeAnim, THEME_FADE_MS);
}

function syncTheme() {
  const dark =
    currentTheme === "dark" || (currentTheme === "system" && !!darkQuery?.matches);
  const next = dark ? "dark" : "light";
  const root = document.documentElement;
  // Fondu réservé aux vrais changements d'apparence : au montage, l'attribut
  // est déjà posé par le script anti-flash de index.html et rien ne bouge.
  if (root.dataset.theme && root.dataset.theme !== next) fadeThemeSwitch(root);
  root.dataset.theme = next;
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

const KEY = "lapsus-settings";

/**
 * Clés utilisées avant le renommage « Layer AI » → « Lapsus ». Relues une
 * fois par `migrate` pour ne pas faire perdre sa clé API (et ses préférences)
 * à quelqu'un qui utilisait déjà l'app. Supprimable dans quelques versions.
 */
const LEGACY_KEYS: Record<string, string> = {
  "lapsus-settings": "layer-ai-settings",
  "lapsus-prefs": "layer-ai-prefs",
};

/** Lit `key`, en reprenant au besoin la valeur stockée sous l'ancien nom. */
function readMigrated(key: string): string | null {
  const raw = localStorage.getItem(key);
  if (raw !== null) return raw;

  const legacy = localStorage.getItem(LEGACY_KEYS[key]);
  if (legacy !== null) {
    localStorage.setItem(key, legacy);
    localStorage.removeItem(LEGACY_KEYS[key]);
  }
  return legacy;
}

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
    const raw = readMigrated(KEY);
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

const PREFS_KEY = "lapsus-prefs";

const DEFAULT_PREFS: Prefs = { task: "fix", targetLang: "fr", tone: "standard" };

export function loadPrefs(): Prefs {
  try {
    const raw = readMigrated(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    // stockage corrompu : on repart des valeurs par défaut
  }
  return { ...DEFAULT_PREFS };
}

export function savePrefs(p: Prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
}
