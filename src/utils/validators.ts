// ============================================================================
// VALIDADORES DE FORMULÁRIOS DO APP SST QUIZ
// ============================================================================
// Funções utilitárias usadas na validação de entradas de formulários
// (empresas, usuários e autenticação) em todo o app.

/**
 * Parseia uma string JSON com segurança sem lançar exceções.
 *
 * - Parâmetros: `jsonString` (string | null) e `fallback` (valor padrão caso falhe).
 * - Retorno: objeto parseado ou o `fallback` fornecido.
 */
export function safeJsonParse<T>(jsonString: string | null, fallback: T): T {
  if (!jsonString) return fallback;
  try {
    const parsed = JSON.parse(jsonString);
    return parsed !== null && parsed !== undefined ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Valida um CNPJ digitado pelo usuário.
 *
 * - Parâmetro: `cnpj` (string) — valor bruto digitado no formulário.
 * - Retorno: `true` se o CNPJ parece válido, `false` caso contrário.
 * - Uso no app: SuperAdminView ao cadastrar empresas (validação do campo CNPJ).
 *
 * Lógica:
 *  1. Remove todos os caracteres não numéricos (pontos, barras, traços);
 *  2. Exige exatamente 14 dígitos;
 *  3. Rejeita sequências repetidas conhecidas (ex.: 00.000.000/0000-00).
 *  (Não calcula o dígito verificador — apenas validação estrutural básica.)
 */
export const validarCNPJ = (cnpj: string): boolean => {
  if (!cnpj) return false;
  // Remove caracteres não numéricos (pontos, barras, hífens)
  const clean = cnpj.replace(/\D/g, '');

  if (clean.length !== 14) return false;

  // Rejeita sequências repetitivas inválidas conhecidas (ex.: 00000000000000, 11111111111111)
  if (/^(\d)\1{13}$/.test(clean)) return false;

  // Dígito verificador oficial do CNPJ (barrar CNPJ falso com 14 dígitos aleatórios).
  const calc = (base: string, pesos: number[]): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = calc(clean.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(clean.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== Number(clean[12]) || d2 !== Number(clean[13])) return false;

  return true;
};

/**
 * Formata automaticamente o CNPJ enquanto o usuário digita (máscara de entrada).
 *
 * - Parâmetro: `value` (string) — texto atual do campo CNPJ.
 * - Retorno: string no formato XX.XXX.XXX/XXXX-XX (ou o valor parcial digitado).
 * - Uso no app: SuperAdminView no `onChange` dos inputs de cadastro/edição de empresa.
 *
 * Lógica: remove os não numéricos, limita a 14 dígitos e aplica as máscaras
 * progressivas (2.3.3.4-2) a cada grupo de dígitos.
 */
export const formatarCNPJ = (value: string): string => {
  const clean = value.replace(/\D/g, '').slice(0, 14);
  return clean
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

/**
 * Valida se um e-mail tem o formato básico correto (ex.: nome@dominio.com.br).
 *
 * - Parâmetro: `email` (string) — e-mail digitado no formulário.
 * - Retorno: `true` se o formato é válido, `false` se vazio ou malformado.
 * - Uso no app: SuperAdminView e AdminManagementView na criação/edição de
 *   usuários (validação do campo de e-mail ao salvar e ao importar).
 *
 * Lógica: aplica uma regex simples exigindo algo antes do @, um domínio após
 * o @ e um ponto seguido do TLD (sem aceitar espaços em branco).
 */
export const validarEmail = (email: string): boolean => {
  if (!email || !email.trim()) return false;
  const v = email.trim();
  if (v.length > 254 || v.includes(' ')) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return re.test(v);
};

/**
 * Sanitiza entradas de texto, removendo espaços em branco das extremidades.
 *
 * - Parâmetro: `text` (string) — texto bruto do formulário.
 * - Retorno: string sem espaços nas pontas, ou string vazia se `text` for nulo/vazio.
 * - Uso no app: campos de texto em geral (nomes, cargos, setores, etc.) antes de
 *   salvar no banco local, garantindo dados limpos e consistentes.
 */
export const sanitizarTexto = (text: string): string => {
  return text ? text.trim() : '';
};
