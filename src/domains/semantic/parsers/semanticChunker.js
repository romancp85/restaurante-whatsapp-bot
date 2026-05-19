export function splitSemanticChunks(text = "") {
  const normalized = text
    .replace(/\s+y\s+/gi, " | ")
    .replace(/\s+con\s+/gi, " | ")
    .replace(/\s*,\s*/g, " | ");

  return normalized
    .split("|")
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}
