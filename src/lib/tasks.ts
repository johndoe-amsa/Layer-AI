export interface Task {
  id: string;
  label: string;
  /** Prompt système envoyé au modèle. */
  system: string;
  /** Placeholder affiché dans la zone de texte. */
  placeholder: string;
}

export const TASKS: Task[] = [
  {
    id: "fix",
    label: "Corriger",
    system:
      "Tu es un correcteur professionnel. Corrige l'orthographe, la grammaire, la ponctuation et la typographie du texte fourni, dans sa langue d'origine. Préserve le ton, le style et la mise en forme. Réponds UNIQUEMENT avec le texte corrigé, sans commentaire ni guillemets.",
    placeholder: "Colle le texte à corriger…",
  },
  {
    id: "translate",
    label: "Traduire",
    system:
      "Tu es un traducteur professionnel. Détecte automatiquement la langue du texte fourni et traduis-le en français. La traduction doit être naturelle et idiomatique. Réponds UNIQUEMENT avec la traduction, sans commentaire ni guillemets.",
    placeholder: "Colle le texte à traduire…",
  },
  {
    id: "rephrase",
    label: "Reformuler",
    system:
      "Tu es un assistant de rédaction. Reformule le texte fourni pour le rendre plus clair, fluide et professionnel, dans sa langue d'origine, sans en changer le sens ni la longueur de manière significative. Réponds UNIQUEMENT avec le texte reformulé, sans commentaire ni guillemets.",
    placeholder: "Colle le texte à reformuler…",
  },
];

/** Langues de sortie proposées pour la traduction. */
export interface TranslateLang {
  /** Code court affiché dans le sélecteur. */
  code: string;
  /** Libellé affiché à l'utilisateur. */
  label: string;
  /** Nom de la langue utilisé dans le prompt système (en français). */
  name: string;
}

export const TRANSLATE_LANGS: TranslateLang[] = [
  { code: "fr", label: "Français", name: "français" },
  { code: "en", label: "Anglais", name: "anglais" },
  { code: "de", label: "Allemand", name: "allemand" },
];

/**
 * Construit le prompt système de traduction vers la langue cible.
 * La langue d'entrée n'a pas besoin d'être précisée : le modèle la détecte.
 */
export function translateSystem(targetName: string): string {
  return `Tu es un traducteur professionnel. Détecte automatiquement la langue du texte fourni et traduis-le en ${targetName}. Si le texte est déjà en ${targetName}, renvoie-le tel quel. La traduction doit être naturelle et idiomatique. Réponds UNIQUEMENT avec la traduction, sans commentaire ni guillemets.`;
}
