import { Pergunta, Usuario, Setor, CategoriaPergunta, DificuldadePergunta, TipoPergunta } from '../types';

// ============================================================================
// HELPERS DE CSV DO APP SST QUIZ
// ============================================================================
// Utilitários responsáveis por gerar modelos, exportar e importar planilhas
// CSV (separadas por ";") de Perguntas, Usuários e Setores, além do relatório
// de conformidade SST. Todas as funções retornam strings de texto CSV ou
// arrays de itens parseados, e são consumidas pelas telas administrativas.

/**
 * Dispara o download de um arquivo CSV em UTF-8 no navegador.
 *
 * - Parâmetros: `filename` (nome do arquivo, ex.: 'modelo_usuarios_sst.csv')
 *   e `csvContent` (conteúdo CSV em string).
 * - Retorno: nenhum (efeito colateral de download).
 * - Uso no app: telas de importação/exportação (QuestionBankView,
 *   AdminManagementView e SuperAdminView) ao baixar modelos e planilhas.
 *
 * Lógica: envolve o conteúdo num Blob com BOM (\uFEFF) para forçar a leitura
 * correta de acentos no Excel, cria um link <a> temporário, dispara o clique
 * e remove o link da página.
 */
export const triggerDownloadCSV = (filename: string, csvContent: string) => {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// ============================================================================
// HELPERS DE SEGURANÇA E PARSE
// ============================================================================

/**
 * Escapa células CSV contra injeção de fórmula (CSV injection).
 * Prefixa com aspas simples valores que começam com os caracteres perigosos
 * (=, +, -, @) interpretados como fórmula pelo Excel/Sheets.
 */
export const escaparCelulaCSV = (valor: string): string => {
  const v = String(valor ?? '');
  if (/^[=+\-@]/.test(v)) return `'${v}`;
  return v;
};

/**
 * Detecta o separador (delimitador) de um CSV de forma GLOBAL: prioriza ";" se
 * houver ponto-e-vírgula fora de aspas na linha; caso contrário usa ",".
 * Evita que linhas com ";" dentro de campos quebrem o parse.
 */
export const detectarDelimitador = (linha: string): ';' | ',' => {
  let inQuotes = false;
  for (const char of String(linha)) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ';' && !inQuotes) return ';';
  }
  return ',';
};

/**
 * Divide uma linha CSV respeitando aspas duplas e o separador informado.
 */
const splitCSVLine = (line: string, delimiter: ';' | ','): string[] => {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      parts.push(current.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
  return parts;
};

// ============================================================================
// 1. PERGUNTAS (MODELO, EXPORTAÇÃO E IMPORTAÇÃO)
// ============================================================================

/**
 * Gera o modelo CSV oficial de importação de perguntas (12 colunas).
 *
 * - Parâmetros: nenhum.
 * - Retorno: string CSV com cabeçalho + 3 linhas de exemplo prontas.
 * - Uso no app: QuestionBankView — botão "Baixar modelo" da tela de banco
 *   de perguntas (importação em massa de questões).
 *
 * Colunas: categoria;tipo;dificuldade;enunciado;alternativa_a..d;
 * resposta_correta (0..3);explicacao;tempo_limite_segundos;norma_relacionada.
 * Os exemplos cobrem múltipla escolha, verdadeiro/falso e normas NR-35/NR-06/NR-10.
 */
export const generateCSVTemplatePerguntas = (): string => {
  const header = 'categoria;tipo;dificuldade;enunciado;alternativa_a;alternativa_b;alternativa_c;alternativa_d;resposta_correta;explicacao;tempo_limite_segundos;norma_relacionada';
  const row1 = 'SST;multipla_escolha;Médio;Qual a altura mínima segundo a NR-35 para exigir cinto de segurança tipo paraquedista?;1,5 metros;2,0 metros;2,5 metros;3,0 metros;1;A NR-35 define trabalho em altura acima de 2,0 metros do nível inferior.;30;NR-35';
  const row2 = 'Normas e Treinamentos;verdadeiro_falso;Fácil;O uso do EPI é obrigatório e fornecido gratuitamente pelo empregador.;Verdadeiro;Falso;;;0;Conforme a NR-06, a empresa é obrigada a fornecer gratuitamente o EPI adequado.;30;NR-06';
  const row3 = 'Procedimentos Operacionais;multipla_escolha;Difícil;O que significa a sigla LOTO na manutenção e segurança industrial?;Lockout / Tagout (Bloqueio e Etiquetagem);Logística Operacional Total;Licença Operacional de Trabalho Organizado;Local e Operação para Terapia Ocupacional;0;LOTO refere-se aos procedimentos de segurança para desenergização e bloqueio de fontes de energia.;45;NR-10';
  
  return [header, row1, row2, row3].join('\n');
};

/**
 * Exporta a lista de perguntas para o formato CSV (separador ";").
 *
 * - Parâmetro: `perguntas` (array de Pergunta) — perguntas a exportar.
 * - Retorno: string CSV com cabeçalho + uma linha por pergunta.
 * - Uso no app: QuestionBankView — botão "Exportar" (baixa `perguntas_sst_exportadas.csv`).
 *
 * Lógica:
 *  - Campos de texto são escapados com aspas duplas ("") e o ";" interno é
 *    substituído por "," para não quebrar as colunas;
 *  - Perguntas verdadeiro/falso saem com as alternativas C/D vazias;
 *  - `tempo_limite_segundos` tem fallback de 30s e `norma_relacionada` de "SST".
 */
export const exportPerguntasToCSV = (perguntas: Pergunta[]): string => {
  const header = 'categoria;tipo;dificuldade;enunciado;alternativa_a;alternativa_b;alternativa_c;alternativa_d;resposta_correta;explicacao;tempo_limite_segundos;norma_relacionada';
  
  const rows = perguntas.map(p => {
    const isVF = p.tipo === 'verdadeiro_falso';
    const altA = escaparCelulaCSV((p.alternativas[0] || '').replace(/;/g, ','));
    const altB = escaparCelulaCSV((p.alternativas[1] || '').replace(/;/g, ','));
    const altC = escaparCelulaCSV(isVF ? '' : (p.alternativas[2] || '').replace(/;/g, ','));
    const altD = escaparCelulaCSV(isVF ? '' : (p.alternativas[3] || '').replace(/;/g, ','));

    return [
      escaparCelulaCSV(p.categoria.replace(/;/g, ',')),
      escaparCelulaCSV(p.tipo),
      escaparCelulaCSV(p.dificuldade),
      `"${escaparCelulaCSV(p.enunciado).replace(/"/g, '""')}"`,
      `"${altA.replace(/"/g, '""')}"`,
      `"${altB.replace(/"/g, '""')}"`,
      `"${altC.replace(/"/g, '""')}"`,
      `"${altD.replace(/"/g, '""')}"`,
      p.resposta_correta,
      `"${escaparCelulaCSV(p.explicacao || '').replace(/"/g, '""')}"`,
      p.tempo_limite_segundos || 30,
      escaparCelulaCSV((p.norma_relacionada || 'SST').replace(/;/g, ','))
    ].join(';');
  });

  return [header, ...rows].join('\n');
};

/**
 * Importa (parseia) um CSV de perguntas enviado pelo usuário.
 *
 * - Parâmetro: `csvText` (string) — conteúdo bruto do arquivo .csv.
 * - Retorno: `{ items, errors }` — items são perguntas sem `id`/`empresa_id`
 *   (prontas para salvar), e errors contém mensagens por linha com problema.
 * - Uso no app: QuestionBankView — botão "Importar planilha" (importação em massa).
 *
 * Lógica de validação:
 *  - Rejeita arquivos vazios e planilhas cujo cabeçalho não contenha palavras-chave
 *    de perguntas (categoria, enunciado, alternativa, resposta, pergunta);
 *  - Suporta CSV com separador ";" ou ",";
 *  - Parser manual com suporte a campos entre aspas ("" escapadas), que podem
 *    conter ";" sem quebrar a estrutura;
 *  - Suporta dois formatos: o completo (11+ colunas, com tipo, dificuldade e
 *    explicacao) e um simplificado (enunciado na coluna 3);
 *  - Normaliza tipo verdadeiro/falso, resposta_correta (0-3, letras A-D ou
 *    texto VERDADEIRO/FALSO) e dificuldade (Fácil/Médio/Difícil).
 */
export const parsePerguntasCSV = (csvText: string): { items: Omit<Pergunta, 'id' | 'empresa_id'>[]; errors: string[] } => {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const errors: string[] = [];

  if (lines.length === 0) {
    return { items: [], errors: ['O arquivo CSV está vazio.'] };
  }

  const headerLine = lines[0].toLowerCase();
  // Validação do cabeçalho: deve conter nomes de colunas relacionados a perguntas
  const validHeaderKeywords = ['categoria', 'enunciado', 'alternativa', 'resposta', 'pergunta'];
  const hasValidHeader = validHeaderKeywords.some(kw => headerLine.includes(kw));

  if (!hasValidHeader && lines.length > 0) {
    return { 
      items: [], 
      errors: ['A planilha enviada não parece ser um Banco de Perguntas SST. Os cabeçalhos esperados (ex: categoria, enunciado, resposta_correta) não foram encontrados. Use o modelo CSV oficial.'] 
    };
  }

  const result: Omit<Pergunta, 'id' | 'empresa_id'>[] = [];
  const startIdx = hasValidHeader ? 1 : 0;

  // Detecta o separador UMA única vez (linha do cabeçalho ou 1ª linha de dados),
  // evitando linhas com ";" dentro de campos quebrem o parse.
  const delimiter = detectarDelimitador(lines[Math.min(startIdx, lines.length - 1)]);

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    
    const parts = splitCSVLine(line, delimiter);

    if (parts.length >= 4) {
      const cat = (parts[0] || 'SST') as CategoriaPergunta;
      let tipo: TipoPergunta = 'multipla_escolha';
      let dif: DificuldadePergunta = 'Médio';
      let enunciado = '';
      let altA = '';
      let altB = '';
      let altC = '';
      let altD = '';
      let respCorretaStr = '0';
      let explicacao = 'Importado via planilha CSV';
      let tempoSeg = 30;
      let norma = 'SST';

      if (parts.length >= 11) {
        tipo = (parts[1].toLowerCase().includes('verdadeiro') || parts[1] === 'vf' || parts[1] === 'v_f') ? 'verdadeiro_falso' : 'multipla_escolha';
        dif = (parts[2] as DificuldadePergunta) || 'Médio';
        enunciado = parts[3];
        altA = parts[4];
        altB = parts[5];
        altC = parts[6];
        altD = parts[7];
        respCorretaStr = parts[8];
        explicacao = parts[9] || 'Importado via planilha CSV';
        tempoSeg = parseInt(parts[10] || '30', 10) || 30;
        norma = parts[11] || 'SST';
      } else {
        enunciado = parts[2] || parts[0];
        altA = parts[3] || 'Opção A';
        altB = parts[4] || 'Opção B';
        altC = parts[5] || 'Opção C';
        altD = parts[6] || 'Opção D';
        respCorretaStr = parts[7] || '0';
      }

      if (!enunciado || enunciado.trim().length < 5) {
        errors.push(`Linha ${lineNumber}: Enunciado muito curto ou ausente.`);
        continue;
      }

      if (tipo === 'verdadeiro_falso' || altA.toLowerCase() === 'verdadeiro' || altB.toLowerCase() === 'falso') {
        tipo = 'verdadeiro_falso';
      }

      let respIndex = 0;
      const cleanResp = respCorretaStr.trim().toUpperCase();
      if (cleanResp === '1' || cleanResp === 'B' || cleanResp === 'FALSO') respIndex = 1;
      else if (cleanResp === '2' || cleanResp === 'C') respIndex = 2;
      else if (cleanResp === '3' || cleanResp === 'D') respIndex = 3;

      const alternativas = tipo === 'verdadeiro_falso' 
        ? ['Verdadeiro', 'Falso']
        : [altA || 'Opção A', altB || 'Opção B', altC || 'Opção C', altD || 'Opção D'];

      result.push({
        categoria: cat,
        tipo,
        dificuldade: (dif === 'Fácil' || dif === 'Médio' || dif === 'Difícil') ? dif : 'Médio',
        enunciado: enunciado.trim(),
        alternativas,
        resposta_correta: respIndex,
        explicacao: explicacao.trim(),
        tempo_limite_segundos: tempoSeg,
        norma_relacionada: norma.trim(),
      });
    } else {
      errors.push(`Linha ${lineNumber}: Estrutura de colunas insuficiente.`);
    }
  }

  return { items: result, errors };
};

// ============================================================================
// 2. USUÁRIOS (MODELO, EXPORTAÇÃO E IMPORTAÇÃO)
// ============================================================================

/**
 * Gera o modelo CSV oficial de importação de usuários (6 colunas).
 *
 * - Parâmetros: nenhum.
 * - Retorno: string CSV com cabeçalho + 3 linhas de exemplo (colaborador/admin).
 * - Uso no app: AdminManagementView e SuperAdminView — botão "Baixar modelo de usuários".
 *
 * Colunas: nome;email;senha;cargo;setor_nome;perfil (colaborador|admin).
 * `setor_nome` é usado para localizar/mapear o setor na importação.
 */
export const generateCSVTemplateUsuarios = (): string => {
  const header = 'nome;email;senha;cargo;setor_nome;perfil;is_instrutor';
  const row1 = 'João Silva;joao.silva@tecnosafety.com;123456;Técnico de Operações I;Operações & Produção;colaborador;nao';
  const row2 = 'Maria Santos;maria.santos@tecnosafety.com;123456;Engenheira de Segurança;SST & Meio Ambiente;admin;sim';
  const row3 = 'Roberto Almeida;roberto.almeida@tecnosafety.com;123456;Mecânico Industrial;Manutenção Industrial;colaborador;nao';

  return [header, row1, row2, row3].join('\n');
};

/**
 * Exporta a lista de usuários da empresa para CSV.
 *
 * - Parâmetros: `usuarios` (usuários a exportar) e `setores` (para traduzir o
 *   `setor_id` de cada usuário no nome do setor).
 * - Retorno: string CSV com cabeçalho + uma linha por usuário.
 * - Uso no app: AdminManagementView — botão "Exportar usuários"
 *   (baixa `usuarios_empresa_sst.csv`).
 *
 * Lógica: campos de texto são escapados com aspas duplas; o setor é resolvido
 * via `setor_id` (fallback "Geral"); o status vira "Ativo"/"Inativo".
 */
export const exportUsuariosToCSV = (usuarios: Usuario[], setores: Setor[]): string => {
  // Mesma ordem de colunas do modelo/importação (nome;email;senha;cargo;setor_nome;perfil;is_instrutor)
  // para garantir round-trip correto (exportar -> importar).
  // A senha NÃO é exportada por segurança (campo vazio -> senha padrão na importação).
  const header = 'nome;email;senha;cargo;setor_nome;perfil;is_instrutor';

  const rows = usuarios.map(u => {
    const setorNome = setores.find(s => s.id === u.setor_id)?.nome || 'Geral';
    return [
      `"${escaparCelulaCSV(u.nome).replace(/"/g, '""')}"`,
      escaparCelulaCSV(u.email),
      '',
      `"${escaparCelulaCSV(u.cargo).replace(/"/g, '""')}"`,
      `"${escaparCelulaCSV(setorNome).replace(/"/g, '""')}"`,
      u.perfil,
      u.is_instrutor ? 'sim' : 'nao'
    ].join(';');
  });

  return [header, ...rows].join('\n');
};

/**
 * Importa (parseia) um CSV de usuários enviado pelo usuário.
 *
 * - Parâmetro: `csvText` (string) — conteúdo bruto do arquivo .csv.
 * - Retorno: `{ items, errors }` — items são usuários normalizados e errors,
 *   as mensagens por linha inválida.
 * - Uso no app: AdminManagementView e SuperAdminView — importação em massa
 *   de usuários (criação de contas colaborador/admin).
 *
 * Lógica de validação:
 *  - Exige cabeçalho com pelo menos 2 palavras-chave de usuário (nome, email,
 *    e-mail, cargo, setor, perfil);
 *  - Parser manual com suporte a aspas e separador ";" ou ",";
 *  - Exige nome com 2+ caracteres e e-mail no formato básico;
 *  - Perfil é 'admin' se o texto contém "admin", senão 'colaborador';
 *  - Duplicados de e-mail dentro do mesmo lote são sobrescritos pela linha
 *    mais recente do arquivo.
 */
export const parseUsuariosCSV = (
  csvText: string
): {
  items: {
    nome: string;
    email: string;
    senha?: string;
    cargo: string;
    setor_nome: string;
    perfil: 'colaborador' | 'admin';
    is_instrutor?: boolean;
  }[];
  errors: string[];
} => {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const errors: string[] = [];

  if (lines.length === 0) {
    return { items: [], errors: ['O arquivo CSV está vazio.'] };
  }

  const headerLine = lines[0].toLowerCase();
  const validUserKeywords = ['nome', 'email', 'e-mail', 'cargo', 'setor', 'perfil'];
  const matchingKeywords = validUserKeywords.filter(kw => headerLine.includes(kw));

  // Rejeita planilhas que não possuem cabeçalhos de colunas relacionados a usuários
  if (matchingKeywords.length < 2) {
    return {
      items: [],
      errors: [
        'A planilha enviada não corresponde ao modelo de Usuários SST (cabeçalhos como "nome", "email", "cargo", "setor" não foram identificados). Verifique se você enviou o arquivo correto ou baixe o modelo oficial.'
      ]
    };
  }

  const result: {
    nome: string;
    email: string;
    senha?: string;
    cargo: string;
    setor_nome: string;
    perfil: 'colaborador' | 'admin';
    is_instrutor?: boolean;
  }[] = [];

  const emailsProcessadosNoLote = new Map<string, number>();

  const startIdx = 1; // O cabeçalho está na linha 0

  // Detecta o separador UMA única vez (linha do cabeçalho ou 1ª linha de dados).
  const delimiter = detectarDelimitador(lines[Math.min(startIdx, lines.length - 1)]);

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    const parts = splitCSVLine(line, delimiter);

    if (parts.length >= 2) {
      const nome = parts[0]?.trim();
      const email = parts[1]?.trim().toLowerCase();
      const senha = parts[2]?.trim();
      const cargo = parts[3]?.trim() || 'Colaborador SST';
      const setor_nome = parts[4]?.trim() || 'Geral';
      const perfilRaw = parts[5]?.toLowerCase() || 'colaborador';
      const perfil: 'colaborador' | 'admin' = perfilRaw.includes('admin') ? 'admin' : 'colaborador';
      
      const instrutorRaw = parts[6]?.toLowerCase() || '';
      const is_instrutor = instrutorRaw === 'sim' || instrutorRaw === 'true' || instrutorRaw === '1' || perfilRaw.includes('instrutor');

      // Validação 1: nome ausente ou inválido
      if (!nome || nome.length < 2) {
        errors.push(`Linha ${lineNumber}: Nome inválido ou em branco ("${nome || ''}").`);
        continue;
      }

      // Validação 2: e-mail ausente ou malformado
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        errors.push(`Linha ${lineNumber}: E-mail inválido ou malformatado ("${email || ''}").`);
        continue;
      }

      const item = {
        nome,
        email,
        senha: senha || undefined,
        cargo,
        setor_nome,
        perfil,
        is_instrutor
      };

      // Trata duplicados dentro do lote: sobrescreve com a última linha do arquivo
      if (emailsProcessadosNoLote.has(email)) {
        const existingIdx = emailsProcessadosNoLote.get(email)!;
        result[existingIdx] = item;
      } else {
        emailsProcessadosNoLote.set(email, result.length);
        result.push(item);
      }
    } else {
      errors.push(`Linha ${lineNumber}: Colunas insuficientes (deve conter ao menos Nome e E-mail).`);
    }
  }

  return { items: result, errors };
};

// ============================================================================
// 4. RELATÓRIO DE CONFORMIDADE AUDITORIA SST (NR-1, NR-12, ISO 45001)
// ============================================================================

/**
 * Gera um relatório de conformidade SST em CSV para auditoria (NR-1 / ISO 45001).
 *
 * - Parâmetros: `empresaNome` (nome da empresa), `setores` (lista de setores),
 *   `usuarios` (todos os colaboradores) e `rankingsSetores` (dados de
 *   participação/pontuação por setor vindos do ranking).
 * - Retorno: string CSV com cabeçalho informativo + linhas por setor + resumo executivo.
 * - Uso no app: relatório de auditoria interna/fiscalização MTE gerado a partir
 *   da tela administrativa de rankings e engajamento.
 *
 * Lógica: cada setor recebe status CONFORME (adesão >= 50%) ou NÃO CONFORME;
 * o rodapé calcula o total de colaboradores, quantos responderam quizzes no
 * período e a taxa global de engajamento.
 */
export const exportRelatorioConformidadeSSTToCSV = (
  empresaNome: string,
  setores: Setor[],
  usuarios: Usuario[],
  rankingsSetores: any[],
  percentualMinimo: number = 50
): string => {
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  const headerInfo = [
    `RELATÓRIO DE CONFORMIDADE SST E ENGAJAMENTO EM TREINAMENTOS - NORMA NR-1 / ISO 45001`,
    `Empresa: ${empresaNome}`,
    `Data de Emissão: ${dataHoje}`,
    `Finalidade: Auditoria Interna / Fiscalização MTE`,
    `Percentual Mínimo de Participação Aplicado: ${percentualMinimo}%`,
    ``,
    `SETOR;COLABORADORES ELEGÍVEIS;COLABORADORES PARTICIPANTES;TAXA PARTICIPAÇÃO (%);PONTUAÇÃO MÉDIA;STATUS CONFORMIDADE NR-1`
  ];

  const rows = rankingsSetores.map(r => {
    const status = r.elegivel ? `CONFORME (Adesão >= ${percentualMinimo}%)` : `NÃO CONFORME (Adesão < ${percentualMinimo}%)`;
    return [
      `"${escaparCelulaCSV(r.setor_nome).replace(/"/g, '""')}"`,
      r.total_colaboradores_ativos,
      r.colaboradores_participantes,
      `${r.taxa_participacao.toFixed(1)}%`,
      r.pontuacao_media.toFixed(1),
      `"${escaparCelulaCSV(status)}"`
    ].join(';');
  });

  const totalColab = usuarios.length;
  const colabAtivos = usuarios.filter(u => (u.estatisticas?.quizzes_respondidos || 0) > 0).length;
  const taxaGeral = totalColab > 0 ? ((colabAtivos / totalColab) * 100).toFixed(1) : '0';

  const footer = [
    ``,
    `RESUMO EXECUTIVO DE AUDITORIA:`,
    `Total de Colaboradores Cadastrados: ${totalColab}`,
    `Total com Treinamentos Respondidos no Período: ${colabAtivos}`,
    `Taxa de Engajamento Global SST: ${taxaGeral}%`,
    `Assinatura do Responsável Técnico SST: ____________________________________`
  ];

  return [...headerInfo, ...rows, ...footer].join('\n');
};


/**
 * Gera o modelo CSV oficial de importação de setores (1 coluna).
 *
 * - Parâmetros: nenhum.
 * - Retorno: string CSV com cabeçalho `nome_setor` + 5 setores de exemplo.
 * - Uso no app: AdminManagementView — botão "Baixar modelo de setores".
 */
export const generateCSVTemplateSetores = (): string => {
  const header = 'nome_setor';
  const row1 = 'Operações & Produção';
  const row2 = 'Manutenção Industrial';
  const row3 = 'Logística & Frota';
  const row4 = 'SST & Meio Ambiente';
  const row5 = 'Administrativo & RH';

  return [header, row1, row2, row3, row4, row5].join('\n');
};

/**
 * Exporta a lista de setores da empresa para CSV.
 *
 * - Parâmetro: `setores` (array de Setor) — setores a exportar.
 * - Retorno: string CSV com colunas `nome_setor` e `colaboradores_ativos`.
 * - Uso no app: AdminManagementView — exportação/backup dos setores cadastrados.
 */
export const exportSetoresToCSV = (setores: Setor[]): string => {
  const header = 'nome_setor;colaboradores_ativos';
  const rows = setores.map(s => [
    `"${escaparCelulaCSV(s.nome).replace(/"/g, '""')}"`,
    s.colaboradores_ativos || 0
  ].join(';'));

  return [header, ...rows].join('\n');
};

/**
 * Importa (parseia) um CSV de setores.
 *
 * - Parâmetro: `csvText` (string) — conteúdo bruto do arquivo .csv.
 * - Retorno: `{ items, errors }` — items são os nomes de setores únicos e
 *   errors, as mensagens por linha inválida.
 * - Uso no app: AdminManagementView — importação em massa de setores.
 *
 * Lógica: exige cabeçalho com "setor"/"departamento"/"nome"; ignora linhas
 * vazias ou com menos de 2 caracteres; rejeita setores duplicados (case-insensitive).
 */
export const parseSetoresCSV = (
  csvText: string
): { items: string[]; errors: string[] } => {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const errors: string[] = [];

  if (lines.length === 0) {
    return { items: [], errors: ['O arquivo CSV está vazio.'] };
  }

  const headerLine = lines[0].toLowerCase();
  const hasSectorHeader = headerLine.includes('setor') || headerLine.includes('departamento') || headerLine.includes('nome');

  if (!hasSectorHeader) {
    return {
      items: [],
      errors: ['A planilha não possui o cabeçalho esperado ("nome_setor" ou "setor"). Utilize o modelo de planilha de Setores oficial.']
    };
  }

  const result: string[] = [];
  const setUnicos = new Set<string>();

  const delimiter = detectarDelimitador(lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1;
    const raw = splitCSVLine(lines[i], delimiter)[0].trim();
    
    if (!raw || raw.length < 2) {
      errors.push(`Linha ${lineNumber}: Nome de setor inválido ou em branco.`);
      continue;
    }

    if (setUnicos.has(raw.toLowerCase())) {
      errors.push(`Linha ${lineNumber}: Setor "${raw}" duplicado na planilha.`);
      continue;
    }

    setUnicos.add(raw.toLowerCase());
    result.push(raw);
  }

  return { items: result, errors };
};
