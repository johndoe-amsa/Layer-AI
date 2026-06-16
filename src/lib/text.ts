/**
 * Nettoie un texte saisi/collé des artefacts typiques d'un copier-coller
 * (Outlook, Word, navigateurs) : retours à la ligne hétérogènes, espaces
 * insécables ou exotiques, caractères de largeur nulle, espaces en fin de
 * ligne. On reste conservateur : on ne touche pas aux espaces internes
 * volontaires ni à la structure des paragraphes.
 */

// Caractères de largeur nulle (ZWSP, ZWNJ, ZWJ, word joiner, BOM) et marques
// directionnelles (LRM/RLM) : à supprimer purement.
const ZERO_WIDTH = /[​‌‍⁠﻿‎‏]/g;

// Espaces « exotiques » (insécable, fines, cadratin, idéographique…) à
// ramener à une espace normale.
const EXOTIC_SPACES = /[  -   　]/g;

export function cleanInput(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(ZERO_WIDTH, "")
    .replace(EXOTIC_SPACES, " ")
    .replace(/[ \t]+$/gm, "");
}

/**
 * Nettoyage léger d'une sortie du modèle avant copie : on retire seulement
 * les espaces en fin de ligne et on normalise les retours à la ligne, sans
 * toucher à la typographie (les espaces insécables français sont conservés).
 */
export function cleanOutput(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "");
}
