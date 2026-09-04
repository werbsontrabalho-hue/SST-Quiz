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
  const rawAlts = (pergunta as any).alternativas || (pergunta as any).opcoes;
  const alts = normalizeAlternativas(rawAlts);
  const { opcoes: _discardedOpcoes, ...rest } = pergunta as any;
  const normalized: any = {
    ...rest,
    alternativas: alts,
  };

  // Define 'opcoes' como propriedade compatível não-enumerável para que
  // leituras como `p.opcoes` continuem funcionando nos componentes legados,
  // mas 'opcoes' NUNCA seja incluído em Object.keys(), {...p}, JSON.stringify
  // ou em chamadas upsert para a tabela 'perguntas' do Supabase.
  try {
    Object.defineProperty(normalized, 'opcoes', {
      get() {
        return this.alternativas || alts;
      },
      set(val) {
        this.alternativas = normalizeAlternativas(val);
      },
      enumerable: false,
      configurable: true,
    });
  } catch {
    // Fallback silencioso se objeto não permitir definição
  }

  return normalized as T;
}

/**
 * Prepara o objeto de pergunta para inserção ou atualização no banco de dados Supabase.
 * Remove propriedades exclusivas do cliente (como 'opcoes') e garante que os campos
 * correspondam estritamente ao schema da tabela public.perguntas.
 */
export function sanitizePerguntaParaDb(
  p: any,
  validEmpresaIds?: Set<string>,
  fallbackEmpresaId?: string
): Record<string, any> {
  if (!p) return p;
  const alternativas = normalizeAlternativas(p.alternativas || p.opcoes);
  const empresaId =
    validEmpresaIds && fallbackEmpresaId
      ? validEmpresaIds.has(p.empresa_id)
        ? p.empresa_id
        : fallbackEmpresaId
      : p.empresa_id;

  const sanitized: Record<string, any> = {
    id: p.id,
    empresa_id: empresaId,
    categoria: p.categoria,
    tipo: p.tipo || 'multipla_escolha',
    dificuldade: p.dificuldade || 'Médio',
    enunciado: p.enunciado || '',
    alternativas: alternativas,
    resposta_correta: typeof p.resposta_correta === 'number' ? p.resposta_correta : 0,
    explicacao: p.explicacao || '',
    tempo_limite_segundos: typeof p.tempo_limite_segundos === 'number' ? p.tempo_limite_segundos : 30,
    norma_relacionada: p.norma_relacionada || null,
    disponivel_desafios: p.disponivel_desafios !== false,
    ativa: p.ativa !== false,
  };

  return sanitized;
}

