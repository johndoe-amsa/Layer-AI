import { ApiError, classifyStatus } from "./errors";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Un arrêt volontaire (bouton Stop) remonte tel quel : l'appelant le
 * reconnaît à son nom et n'affiche alors aucune erreur. Tout le reste, à ce
 * niveau, est une panne de transport — hors ligne, DNS, proxy d'entreprise —
 * que `fetch` signale par un TypeError sans détail exploitable.
 */
function asNetworkError(e: unknown): never {
  if ((e as Error)?.name === "AbortError") throw e;
  throw new ApiError("network");
}

/**
 * Appelle l'API OpenAI (chat completions) en streaming et invoque
 * `onChunk` à chaque morceau de texte reçu.
 */
export async function streamCompletion(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      // Température basse : on privilégie la fidélité et la régularité
      // (correction, traduction, reformulation) plutôt que la créativité.
      body: JSON.stringify({ model, messages, stream: true, temperature: 0.2 }),
      signal,
    });
  } catch (e) {
    asNetworkError(e);
  }

  if (!res.ok) {
    let detail = res.statusText;
    let code: string | undefined;
    try {
      const err = await res.json();
      detail = err?.error?.message ?? detail;
      // OpenAI place tantôt un `code`, tantôt seulement un `type`.
      code = err?.error?.code ?? err?.error?.type;
    } catch {
      // corps non JSON, on garde statusText
    }
    throw new ApiError(classifyStatus(res.status, code), detail);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    // La connexion peut aussi lâcher en plein streaming (wifi qui saute) :
    // le texte déjà reçu reste affiché, l'erreur s'ajoute en dessous.
    let chunk;
    try {
      chunk = await reader.read();
    } catch (e) {
      asNetworkError(e);
    }
    const { done, value } = chunk;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      const data = line.replace(/^data: /, "").trim();
      if (!data || data === "[DONE]") continue;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch {
        // ligne SSE incomplète ou keep-alive, on ignore
      }
    }
  }
}
