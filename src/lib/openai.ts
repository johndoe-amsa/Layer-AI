export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = await res.json();
      detail = err?.error?.message ?? detail;
    } catch {
      // corps non JSON, on garde statusText
    }
    throw new Error(detail);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
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
