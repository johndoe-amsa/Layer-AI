export type DiffOp = "equal" | "insert" | "delete";

export interface DiffSegment {
  op: DiffOp;
  text: string;
}

/** Au-delà de cette taille, on renonce au diff (coût mémoire O(n·m)). */
const MAX_TOKENS = 4000;

/** Découpe en tokens : mots (lettres/chiffres), espaces ou ponctuation. */
function tokenize(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+|\s+|[^\s\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Diff mot à mot entre deux textes via la plus longue sous-séquence commune.
 * `original` est le texte saisi, `revised` le texte corrigé. Les tokens
 * consécutifs de même nature sont fusionnés pour un rendu plus lisible.
 */
export function diffWords(original: string, revised: string): DiffSegment[] {
  const a = tokenize(original);
  const b = tokenize(revised);
  const n = a.length;
  const m = b.length;

  // Textes trop longs : on n'affiche pas de surlignage plutôt que de figer l'UI.
  if (n > MAX_TOKENS || m > MAX_TOKENS) return [{ op: "equal", text: revised }];

  // Table de la plus longue sous-séquence commune.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  const push = (op: DiffOp, text: string) => {
    const last = segments[segments.length - 1];
    if (last && last.op === op) last.text += text;
    else segments.push({ op, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("equal", a[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push("delete", a[i]);
      i++;
    } else {
      push("insert", b[j]);
      j++;
    }
  }
  while (i < n) push("delete", a[i++]);
  while (j < m) push("insert", b[j++]);
  return segments;
}
