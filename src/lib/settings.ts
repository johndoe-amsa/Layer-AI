export interface Settings {
  apiKey: string;
  model: string;
  /** Coller automatiquement le presse-papier à l'ouverture (desktop). */
  autoPaste: boolean;
}

const KEY = "layer-ai-settings";

export const DEFAULT_MODEL = "gpt-4o-mini";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { model: DEFAULT_MODEL, autoPaste: true, ...JSON.parse(raw) };
  } catch {
    // stockage corrompu : on repart de zéro
  }
  return { apiKey: "", model: DEFAULT_MODEL, autoPaste: true };
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
}

const PREFS_KEY = "layer-ai-prefs";

const DEFAULT_PREFS: Prefs = { task: "fix", targetLang: "fr" };

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
