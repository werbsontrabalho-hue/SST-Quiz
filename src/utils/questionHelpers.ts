/**
 * questionHelpers.ts
 * Utilitários para normalização e formatação segura de perguntas e alternativas.
 * Evita o erro "Objects are not valid as a React child (found: object with keys {id, texto})".
 */

export function formatAlternativaText(alt: any): string {
  if (alt === null || alt === undefined) return '';
  if (typeof alt === 'string') return alt;
  if (typeof alt === 'number' || typeof alt === 'boolean') return String(alt);
  if (typeof alt === 'object') {
    if (typeof alt.texto === 'string') return alt.texto;
    if (typeof alt.label === 'string') return alt.label;
    if (typeof alt.text === 'string') return alt.text;
    if (typeof alt.opcao === 'string') return alt.opcao;
    if (typeof alt.value === 'string') return alt.value;
    if (typeof alt.descricao === 'string') return alt.descricao;
    try {
      return JSON.stringify(alt);
    } catch {
      return String(alt);
    }
  }
  return String(alt);
}

export function normalizeAlternativas(alternativas: any): string[] {
  if (!alternativas) return [];
  let list = alternativas;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      return [list];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.map(formatAlternativaText);
}

export function normalizePergunta<T extends Record<string, any>>(pergunta: T): T {
  if (!pergunta) return pergunta;
  const rawAlts = pergunta.alternativas || pergunta.opcoes;
  const alts = normalizeAlternativas(rawAlts);
  return {
    ...pergunta,
    alternativas: alts,
    opcoes: alts,
  };
}
