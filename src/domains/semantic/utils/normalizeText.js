// src/domains/semantic/normalizeText.js

/**
 * Normaliza texto conversacional SIN destruir significado.
 *
 * Objetivos:
 * - lowercase
 * - remover acentos
 * - limpiar espacios
 * - mantener números y contexto
 *
 * IMPORTANTE:
 * NO modificar intención semántica.
 */

function normalizeText(text = '') {
    return text
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export {
    normalizeText
};