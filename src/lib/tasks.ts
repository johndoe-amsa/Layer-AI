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
      "Tu es un traducteur professionnel. Si le texte fourni est en français, traduis-le en anglais ; sinon, traduis-le en français. La traduction doit être naturelle et idiomatique. Réponds UNIQUEMENT avec la traduction, sans commentaire ni guillemets.",
    placeholder: "Colle le texte à traduire (FR ⇄ EN)…",
  },
  {
    id: "rephrase",
    label: "Reformuler",
    system:
      "Tu es un assistant de rédaction. Reformule le texte fourni pour le rendre plus clair, fluide et professionnel, dans sa langue d'origine, sans en changer le sens ni la longueur de manière significative. Réponds UNIQUEMENT avec le texte reformulé, sans commentaire ni guillemets.",
    placeholder: "Colle le texte à reformuler…",
  },
  {
    id: "chat",
    label: "Chat",
    system: "Tu es un assistant utile et concis. Réponds dans la langue de l'utilisateur.",
    placeholder: "Pose une question…",
  },
];
