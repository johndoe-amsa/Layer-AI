export interface Settings {
  apiKey: string;
  model: string;
}

const KEY = "layer-ai-settings";

export const DEFAULT_MODEL = "gpt-4o-mini";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { model: DEFAULT_MODEL, ...JSON.parse(raw) };
  } catch {
    // stockage corrompu : on repart de zéro
  }
  return { apiKey: "", model: DEFAULT_MODEL };
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
