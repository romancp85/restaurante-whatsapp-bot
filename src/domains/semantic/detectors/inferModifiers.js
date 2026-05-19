export function inferModifiers(text = "") {
  const modifiers = [];

  const normalized = text.toLowerCase();

  // =====================================================
  // SIN ...
  // =====================================================

  const regexSin = /\bsin\s+([a-záéíóúñ]+(?:\s+ni\s+[a-záéíóúñ]+)*)/gi;

  let match;

  while ((match = regexSin.exec(normalized)) !== null) {
    const ingredientes = match[1]
      .split(/\s+ni\s+/i)
      .map((v) => v.trim())
      .filter(Boolean);

    ingredientes.forEach((ingrediente) => {
      modifiers.push({
        type: "REMOVE_INGREDIENT",
        value: ingrediente,
        raw: `sin ${ingrediente}`,
      });
    });
  }

  // =====================================================
  // CON ...
  // =====================================================

  const regexCon = /\bcon\s+([a-záéíóúñ\s]+)/gi;

  while ((match = regexCon.exec(normalized)) !== null) {
    modifiers.push({
      type: "ADD_INGREDIENT",
      value: match[1].trim(),
      raw: match[0],
    });
  }

  // =====================================================
  // EXTRA ...
  // =====================================================

  const regexExtra = /\bextra\s+([a-záéíóúñ\s]+)/gi;

  while ((match = regexExtra.exec(normalized)) !== null) {
    modifiers.push({
      type: "EXTRA_INGREDIENT",
      value: match[1].trim(),
      raw: match[0],
    });
  }

  return modifiers;
}
