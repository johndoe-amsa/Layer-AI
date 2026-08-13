/**
 * Traduction des échecs d'appel à l'API en messages destinés à l'utilisateur.
 *
 * Le message brut d'OpenAI est en anglais et souvent technique (« Incorrect
 * API key provided… », « You exceeded your current quota… ») : l'afficher seul
 * laisse l'utilisateur sans piste. On classe donc l'échec, puis l'interface
 * choisit quoi dire et quel bouton proposer. Le message d'origine reste
 * affiché en second plan, en petit : il aide à diagnostiquer un cas non prévu.
 */

/** Nature d'un échec, indépendante du texte affiché. */
export type ApiErrorKind =
  | "network"
  | "auth"
  | "forbidden"
  | "quota"
  | "rate"
  | "model"
  | "server"
  | "unknown";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** Message d'origine renvoyé par OpenAI, vide si l'appel n'a pas abouti. */
  readonly detail: string;

  constructor(kind: ApiErrorKind, detail = "") {
    super(detail || kind);
    this.name = "ApiError";
    this.kind = kind;
    this.detail = detail;
  }
}

/**
 * Classe une réponse en échec. Le code d'erreur d'OpenAI prime sur le statut
 * HTTP quand il est présent : un 429 recouvre aussi bien « trop de requêtes
 * par minute » (attendre suffit) que « plus de crédit » (il faut recharger),
 * deux situations qui n'appellent pas du tout le même message.
 */
export function classifyStatus(status: number, code?: string): ApiErrorKind {
  if (code === "insufficient_quota") return "quota";
  if (code === "model_not_found") return "model";
  if (code === "invalid_api_key") return "auth";
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 404) return "model";
  if (status === 429) return "rate";
  if (status >= 500) return "server";
  return "unknown";
}

/** Bouton proposé à côté du message d'erreur. */
export type ErrorAction = "retry" | "settings" | null;

export interface ErrorNotice {
  title: string;
  hint: string;
  action: ErrorAction;
  /** Message brut d'OpenAI, affiché en dessous quand il existe. */
  detail: string;
}

const NOTICES: Record<ApiErrorKind, { title: string; hint: string; action: ErrorAction }> = {
  network: {
    title: "Impossible de joindre OpenAI",
    hint: "Vérifie ta connexion, puis relance la demande.",
    action: "retry",
  },
  auth: {
    title: "Clé API refusée",
    hint: "OpenAI n'a pas accepté ta clé. Vérifie-la dans les réglages : elle commence par « sk- » et se copie depuis platform.openai.com.",
    action: "settings",
  },
  forbidden: {
    title: "Accès refusé par OpenAI",
    hint: "Ta clé n'a pas l'autorisation d'utiliser ce modèle. Essaie-en un autre dans les réglages.",
    action: "settings",
  },
  quota: {
    title: "Crédit OpenAI épuisé",
    hint: "Ton compte n'a plus de crédit disponible. Recharge-le sur platform.openai.com, puis relance la demande.",
    action: "retry",
  },
  rate: {
    title: "Trop de demandes d'affilée",
    hint: "L'API demande de lever le pied quelques secondes.",
    action: "retry",
  },
  model: {
    title: "Modèle indisponible",
    hint: "Le modèle choisi pour ce mode n'est pas accessible avec ta clé. Choisis-en un autre dans les réglages.",
    action: "settings",
  },
  server: {
    title: "OpenAI rencontre un incident",
    hint: "Le service ne répond pas correctement. Réessaie dans un instant.",
    action: "retry",
  },
  unknown: {
    title: "La demande a échoué",
    hint: "Réessaie ; si le problème persiste, vérifie ta clé et ton modèle dans les réglages.",
    action: "retry",
  },
};

/** Ce qu'il faut afficher pour un échec donné. */
export function describeError(err: unknown): ErrorNotice {
  const kind = err instanceof ApiError ? err.kind : "unknown";
  const detail = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "";
  // Un détail identique à la phrase d'explication n'apprendrait rien de plus.
  return { ...NOTICES[kind], detail: detail === NOTICES[kind].hint ? "" : detail };
}
