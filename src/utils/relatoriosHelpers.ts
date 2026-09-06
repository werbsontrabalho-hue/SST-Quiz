// ============================================================
// relatoriosHelpers.ts — Funções puras de agregação para o
// módulo de Relatórios do Admin (somente leitura).
// ------------------------------------------------------------
// Nenhuma função aqui altera estado ou dados: apenas recebe os
// dados do contexto (usuarios, quizzes, desafios, setores,
// perguntas) e devolve agregados prontos para exibição/CSV.
// ============================================================

import { Usuario, Setor, QuizSessao, Desafio1v1, Pergunta } from '../types';
import { formatAlternativaText, normalizeAlternativas } from './questionHelpers';

// Origem dos dados que o admin quer analisar.
export type OrigemRelatorio = 'todos' | 'quizzes' | 'desafios';

export interface FiltroRelatorio {
  origem: OrigemRelatorio;
  dataInicio?: string;
  dataFim?: string;
  setorId?: string;
  colaboradorId?: string;
  norma?: string;
  categoria?: string;
  modoDesafio?: 'competitivo' | 'amistoso';
  // Situação das respostas (corretas/erradas/todas) para o relatório individual.
  situacao?: 'todas' | 'corretas' | 'erradas';
}

// ------------------------------------------------------------------
// Normaliza texto para comparação tolerante (ignora maiúsculas e espaços).
// Usado nos filtros de norma/categoria para evitar que "NR-10" ≠ "nr 10".
// ------------------------------------------------------------------
export const normalizarTexto = (texto: string): string =>
  (texto || '').toLowerCase().replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------------
// Filtro por data (usa data_criacao/respondido_em como string ISO).
// ------------------------------------------------------------------
const dentroPeriodo = (dataISO: string | undefined, filtro: FiltroRelatorio): boolean => {
  if (!dataISO) return true;
  if (!filtro.dataInicio && !filtro.dataFim) return true;
  const dt = new Date(dataISO).getTime();
  if (filtro.dataInicio && dt < new Date(filtro.dataInicio).getTime()) return false;
  if (filtro.dataFim) {
    // Inclui o dia final inteiro (até 23:59:59.999).
    const fim = new Date(filtro.dataFim);
    fim.setHours(23, 59, 59, 999);
    if (dt > fim.getTime()) return false;
  }
  return true;
};

// ------------------------------------------------------------------
// Filtra os quizzes da empresa respeitando origem, período e setor.
// ------------------------------------------------------------------
export const filtrarQuizzes = (quizzes: QuizSessao[], filtro: FiltroRelatorio, usuarios?: Usuario[]): QuizSessao[] => {
  if (filtro.origem === 'desafios') return [];
  return quizzes.filter(q => {
    if (filtro.dataInicio || filtro.dataFim) {
      if (!dentroPeriodo(q.respondido_em || q.criado_em, filtro)) return false;
    }
    if (filtro.colaboradorId && q.colaborador_id !== filtro.colaboradorId) return false;
    if (filtro.setorId && usuarios) {
      const dono = usuarios.find(u => u.id === q.colaborador_id);
      if (!dono || dono.setor_id !== filtro.setorId) return false;
    }
    if (filtro.categoria && q.categoria !== filtro.categoria) return false;
    if (filtro.norma) {
      const alvo = normalizarTexto(filtro.norma);
      const temNorma = (q.perguntas || []).some(p => normalizarTexto(p.norma_relacionada || '').includes(alvo));
      if (!temNorma) return false;
    }
    return true;
  });
};

// ------------------------------------------------------------------
// Filtra os desafios da empresa respeitando origem, período, setor e modo.
// ------------------------------------------------------------------
export const filtrarDesafios = (desafios: Desafio1v1[], filtro: FiltroRelatorio): Desafio1v1[] => {
  if (filtro.origem === 'quizzes') return [];
  return desafios.filter(d => {
    if (!dentroPeriodo(d.data_criacao, filtro)) return false;
    if (filtro.setorId && d.desafiante_setor_id !== filtro.setorId && d.desafiado_setor_id !== filtro.setorId) return false;
    if (filtro.colaboradorId && d.desafiante_id !== filtro.colaboradorId && d.desafiado_id !== filtro.colaboradorId) return false;
    if (filtro.modoDesafio && d.tipo !== filtro.modoDesafio) return false;
    return true;
  });
};

// ------------------------------------------------------------------
// 1. RESUMO GERAL — totais da empresa conforme a origem.
// ------------------------------------------------------------------
export interface ResumoGeral {
  totalColaboradores: number;
  colaboradoresParticipantesQuiz: number;
  totalQuizzesRespondidos: number;
  mediaAcertosQuiz: number;
  totalDesafios: number;
  totalDesafiosConcluidos: number;
  totalVitorias: number;
  taxaVitoria: number;
  totalPontosQuizzes: number;
  totalPontosDesafios: number;
}

export const calcularResumoGeral = (
  usuarios: Usuario[],
  quizzes: QuizSessao[],
  desafios: Desafio1v1[],
  filtro: FiltroRelatorio
): ResumoGeral => {
  const colabs = usuarios.filter(u => u.ativo !== false && u.perfil === 'colaborador');
  const quizzesFiltrados = filtrarQuizzes(quizzes, filtro);
  const desafiosFiltrados = filtrarDesafios(desafios, filtro);

  const quizzesConcluidos = quizzesFiltrados.filter(q => q.status === 'concluido');
  const colaboradoresParticipantesQuiz = new Set(quizzesConcluidos.map(q => q.colaborador_id)).size;
  const totalAcertos = quizzesConcluidos.reduce((acc, q) => acc + (q.respostas || []).filter(r => r.correta).length, 0);
  const totalRespostas = quizzesConcluidos.reduce((acc, q) => acc + (q.respostas || []).length, 0);
  const totalPontosQuizzes = quizzesConcluidos.reduce((acc, q) => acc + (q.pontuacao_total || 0), 0);

  const desafiosConcluidos = desafiosFiltrados.filter(d => d.status === 'concluido');
  const totalVitorias = desafiosConcluidos.filter(d => d.vencedor_id).length;
  const totalPontosDesafios = desafiosConcluidos.reduce((acc, d) => acc + (d.pontuacao_setor || 0), 0);

  return {
    totalColaboradores: colabs.length,
    colaboradoresParticipantesQuiz,
    totalQuizzesRespondidos: quizzesConcluidos.length,
    mediaAcertosQuiz: totalRespostas > 0 ? Number(((totalAcertos / totalRespostas) * 100).toFixed(1)) : 0,
    totalDesafios: desafiosFiltrados.length,
    totalDesafiosConcluidos: desafiosConcluidos.length,
    totalVitorias,
    taxaVitoria: desafiosConcluidos.length > 0 ? Number(((totalVitorias / desafiosConcluidos.length) * 100).toFixed(1)) : 0,
    totalPontosQuizzes,
    totalPontosDesafios,
  };
};

// ------------------------------------------------------------------
// 2. CONFORMIDADE DOS SETORES (participação em quizzes / treinamento)
// ------------------------------------------------------------------
export interface ConformidadeSetor {
  setor_id: string;
  setor_nome: string;
  totalColaboradores: number;
  participantes: number;
  taxaParticipacao: number;
  elegivel: boolean;
  faltamParaMinimo: number;
  // Quantos colaboradores ainda faltam para atingir 100% de participação.
  faltamPara100: number;
}

export const calcularConformidadeSetores = (
  usuarios: Usuario[],
  setores: Setor[],
  quizzes: QuizSessao[],
  percentualMinimo: number,
  filtro?: FiltroRelatorio
): ConformidadeSetor[] => {
  // Aplica os filtros de origem (só quizzes), período e setor.
  const quizzesFiltrados = filtrarQuizzes(quizzes, filtro || { origem: 'quizzes' }).filter(q => q.status === 'concluido');
  const participantesPorSetor = new Map<string, Set<string>>();

  quizzesFiltrados.forEach(q => {
    const u = usuarios.find(usr => usr.id === q.colaborador_id);
    if (!u || !u.setor_id) return;
    if (!participantesPorSetor.has(u.setor_id)) participantesPorSetor.set(u.setor_id, new Set());
    participantesPorSetor.get(u.setor_id)!.add(u.id);
  });

  return setores
    .filter(s => !filtro?.setorId || s.id === filtro.setorId)
    .map(s => {
    const colabs = usuarios.filter(u => u.setor_id === s.id && u.empresa_id === s.empresa_id && u.ativo !== false && u.perfil === 'colaborador');
    const total = colabs.length || 1;
    const participantes = participantesPorSetor.get(s.id)?.size || 0;
    const taxa = Math.min(100, Math.round((participantes / total) * 100));
    const elegivel = taxa >= percentualMinimo;
    const faltam = Math.max(0, Math.ceil(total * (percentualMinimo / 100)) - participantes);

    return {
      setor_id: s.id,
      setor_nome: s.nome,
      totalColaboradores: total,
      participantes,
      taxaParticipacao: taxa,
      elegivel,
      faltamParaMinimo: faltam,
      faltamPara100: Math.max(0, total - participantes),
    };
  }).sort((a, b) => Number(a.elegivel) - Number(b.elegivel) || a.taxaParticipacao - b.taxaParticipacao);
};

// ------------------------------------------------------------------
// 3. DESEMPENHO POR NORMA / CATEGORIA (só quizzes)
// ------------------------------------------------------------------
export interface DesempenhoNorma {
  norma: string;
  totalRespostas: number;
  acertos: number;
  erros: number;
  taxaAcerto: number;
}

export interface DesempenhoCategoria {
  categoria: string;
  totalRespostas: number;
  acertos: number;
  erros: number;
  taxaAcerto: number;
}

export interface PerguntaMaisErrada {
  pergunta_id: string;
  enunciado: string;
  categoria: string;
  norma: string;
  erros: number;
  totalRespostas: number;
}

export const calcularDesempenhoNormas = (
  quizzes: QuizSessao[],
  perguntas: Pergunta[],
  filtro: FiltroRelatorio
): { normas: DesempenhoNorma[]; categorias: DesempenhoCategoria[]; maisErradas: PerguntaMaisErrada[] } => {
  const quizzesFiltrados = filtrarQuizzes(quizzes, filtro).filter(q => q.status === 'concluido');

  const mapaNorma = new Map<string, { total: number; acertos: number }>();
  const mapaCategoria = new Map<string, { total: number; acertos: number }>();
  const mapaErros = new Map<string, { erros: number; total: number; enunciado: string; categoria: string; norma: string }>();

  quizzesFiltrados.forEach(q => {
    (q.respostas || []).forEach(r => {
      const pergunta = q.perguntas.find(p => p.id === r.pergunta_id) || perguntas.find(p => p.id === r.pergunta_id);
      if (!pergunta) return;

      const norma = pergunta.norma_relacionada || 'Geral';
      const cat = pergunta.categoria || 'Geral';
      if (filtro.norma && normalizarTexto(norma) !== normalizarTexto(filtro.norma)) return;
      if (filtro.categoria && normalizarTexto(cat) !== normalizarTexto(filtro.categoria)) return;

      // Norma
      const n = mapaNorma.get(norma) || { total: 0, acertos: 0 };
      n.total += 1;
      if (r.correta) n.acertos += 1;
      mapaNorma.set(norma, n);

      // Categoria
      const c = mapaCategoria.get(cat) || { total: 0, acertos: 0 };
      c.total += 1;
      if (r.correta) c.acertos += 1;
      mapaCategoria.set(cat, c);

      // Erros
      const e = mapaErros.get(pergunta.id) || { erros: 0, total: 0, enunciado: pergunta.enunciado, categoria: cat, norma };
      e.total += 1;
      if (!r.correta) e.erros += 1;
      mapaErros.set(pergunta.id, e);
    });
  });

  const normas: DesempenhoNorma[] = Array.from(mapaNorma.entries()).map(([norma, v]) => ({
    norma,
    totalRespostas: v.total,
    acertos: v.acertos,
    erros: v.total - v.acertos,
    taxaAcerto: v.total > 0 ? Number(((v.acertos / v.total) * 100).toFixed(1)) : 0,
  })).sort((a, b) => a.taxaAcerto - b.taxaAcerto);

  const categorias: DesempenhoCategoria[] = Array.from(mapaCategoria.entries()).map(([categoria, v]) => ({
    categoria,
    totalRespostas: v.total,
    acertos: v.acertos,
    erros: v.total - v.acertos,
    taxaAcerto: v.total > 0 ? Number(((v.acertos / v.total) * 100).toFixed(1)) : 0,
  })).sort((a, b) => a.taxaAcerto - b.taxaAcerto);

  const maisErradas: PerguntaMaisErrada[] = Array.from(mapaErros.entries())
    .filter(([, v]) => v.total >= 2) // ignora perguntas respondidas pouquíssimas vezes
    .map(([pergunta_id, v]) => ({
      pergunta_id,
      enunciado: v.enunciado,
      categoria: v.categoria,
      norma: v.norma,
      erros: v.erros,
      totalRespostas: v.total,
    }))
    .sort((a, b) => b.erros - a.erros)
    .slice(0, 10);

  return { normas, categorias, maisErradas };
};

// ------------------------------------------------------------------
// 4. DESEMPENHO DOS DESAFIOS 1x1 (por setor, modo e tema)
// ------------------------------------------------------------------
export interface DesempenhoDesafioSetor {
  setor_id: string;
  setor_nome: string;
  jogados: number;
  vitorias: number;
  derrotas: number;
  taxaVitoria: number;
  pontosGanhos: number;
}

export interface DesempenhoDesafioTema {
  tema: string;
  jogados: number;
  vitorias: number;
  taxaVitoria: number;
}

export const calcularDesempenhoDesafios = (
  desafios: Desafio1v1[],
  setores: Setor[],
  filtro: FiltroRelatorio
): { porSetor: DesempenhoDesafioSetor[]; porModo: { modo: string; jogados: number; vitorias: number }[]; porTema: DesempenhoDesafioTema[] } => {
  const desafiosFiltrados = filtrarDesafios(desafios, filtro).filter(d => d.status === 'concluido');

  // Por setor (conta vitória do setor vencedor)
  const mapaSetor = new Map<string, { jogados: number; vitorias: number; pontos: number }>();
  desafiosFiltrados.forEach(d => {
    if (d.desafiante_setor_id) {
      const s = mapaSetor.get(d.desafiante_setor_id) || { jogados: 0, vitorias: 0, pontos: 0 };
      s.jogados += 1;
      if (d.vencedor_setor_id === d.desafiante_setor_id) s.vitorias += 1;
      if (d.vencedor_setor_id === d.desafiante_setor_id) s.pontos += d.pontuacao_setor || 0;
      mapaSetor.set(d.desafiante_setor_id, s);
    }
    if (d.desafiado_setor_id) {
      const s = mapaSetor.get(d.desafiado_setor_id) || { jogados: 0, vitorias: 0, pontos: 0 };
      s.jogados += 1;
      if (d.vencedor_setor_id === d.desafiado_setor_id) s.vitorias += 1;
      if (d.vencedor_setor_id === d.desafiado_setor_id) s.pontos += d.pontuacao_setor || 0;
      mapaSetor.set(d.desafiado_setor_id, s);
    }
  });

  const porSetor: DesempenhoDesafioSetor[] = Array.from(mapaSetor.entries()).map(([setor_id, v]) => {
    const nome = setores.find(s => s.id === setor_id)?.nome || 'Setor';
    return {
      setor_id,
      setor_nome: nome,
      jogados: v.jogados,
      vitorias: v.vitorias,
      derrotas: v.jogados - v.vitorias,
      taxaVitoria: v.jogados > 0 ? Number(((v.vitorias / v.jogados) * 100).toFixed(1)) : 0,
      pontosGanhos: v.pontos,
    };
  }).sort((a, b) => b.vitorias - a.vitorias);

  // Por modo
  const porModo = ['competitivo', 'amistoso'].map(modo => {
    const lista = desafiosFiltrados.filter(d => d.tipo === modo);
    return {
      modo,
      jogados: lista.length,
      vitorias: lista.filter(d => d.vencedor_id).length,
    };
  });

  // Por tema
  const mapaTema = new Map<string, { jogados: number; vitorias: number }>();
  desafiosFiltrados.forEach(d => {
    const t = mapaTema.get(d.tema_sorteado) || { jogados: 0, vitorias: 0 };
    t.jogados += 1;
    if (d.vencedor_id) t.vitorias += 1;
    mapaTema.set(d.tema_sorteado, t);
  });
  const porTema: DesempenhoDesafioTema[] = Array.from(mapaTema.entries()).map(([tema, v]) => ({
    tema,
    jogados: v.jogados,
    vitorias: v.vitorias,
    taxaVitoria: v.jogados > 0 ? Number(((v.vitorias / v.jogados) * 100).toFixed(1)) : 0,
  })).sort((a, b) => b.jogados - a.jogados);

  return { porSetor, porModo, porTema };
};

// ------------------------------------------------------------------
// 5. RANKING INDIVIDUAL DE COLABORADORES (quizzes + desafios)
// ------------------------------------------------------------------
export interface RankingColaboradorRelatorio {
  usuario_id: string;
  nome: string;
  cargo: string;
  setor_nome: string;
  quizzesRespondidos: number;
  acertos: number;
  erros: number;
  taxaAcerto: number;
  pontosQuizzes: number;
  desafiosJogados: number;
  desafiosVencidos: number;
  taxaVitoria: number;
  pontosTotais: number;
  // Acertos/erros nas perguntas dos desafios 1x1.
  acertosDesafios: number;
  errosDesafios: number;
  taxaAcertoDesafios: number;
}

export const calcularRankingColaboradores = (
  usuarios: Usuario[],
  setores: Setor[],
  quizzes: QuizSessao[],
  desafios: Desafio1v1[],
  filtro: FiltroRelatorio
): RankingColaboradorRelatorio[] => {
  const quizzesFiltrados = filtrarQuizzes(quizzes, filtro).filter(q => q.status === 'concluido');
  const desafiosFiltrados = filtrarDesafios(desafios, filtro);

  return usuarios
    .filter(u => u.perfil === 'colaborador' && u.ativo !== false)
    .filter(u => !filtro.setorId || u.setor_id === filtro.setorId)
    .map(u => {
      const meusQuizzes = quizzesFiltrados.filter(q => q.colaborador_id === u.id);
      const acertos = meusQuizzes.reduce((acc, q) => acc + (q.respostas || []).filter(r => r.correta).length, 0);
      const totalResp = meusQuizzes.reduce((acc, q) => acc + (q.respostas || []).length, 0);
      const pontosQuizzes = meusQuizzes.reduce((acc, q) => acc + (q.pontuacao_total || 0), 0);

      const meusDesafios = desafiosFiltrados.filter(d => d.desafiante_id === u.id || d.desafiado_id === u.id);
      const vitorias = meusDesafios.filter(d => d.vencedor_id === u.id).length;

      // Acertos/erros nas perguntas dos desafios (respostas do colaborador).
      let acertosDesafios = 0;
      let totalRespDesafios = 0;
      meusDesafios.forEach(d => {
        const minhasResps = d.desafiante_id === u.id ? (d.respostas_desafiante || []) : (d.respostas_desafiado || []);
        minhasResps.forEach(r => {
          totalRespDesafios += 1;
          if (r.correta) acertosDesafios += 1;
        });
      });

      const setorNome = setores.find(s => s.id === u.setor_id)?.nome || 'Geral';

      // Pontos do período (soma do filtrado), não o total da vida toda.
      const pontosPeriodo = pontosQuizzes;

      return {
        usuario_id: u.id,
        nome: u.nome,
        cargo: u.cargo,
        setor_nome: setorNome,
        quizzesRespondidos: meusQuizzes.length,
        acertos,
        erros: totalResp - acertos,
        taxaAcerto: totalResp > 0 ? Number(((acertos / totalResp) * 100).toFixed(1)) : 0,
        pontosQuizzes,
        desafiosJogados: meusDesafios.length,
        desafiosVencidos: vitorias,
        taxaVitoria: meusDesafios.length > 0 ? Number(((vitorias / meusDesafios.length) * 100).toFixed(1)) : 0,
        acertosDesafios,
        errosDesafios: totalRespDesafios - acertosDesafios,
        taxaAcertoDesafios: totalRespDesafios > 0 ? Number(((acertosDesafios / totalRespDesafios) * 100).toFixed(1)) : 0,
        pontosTotais: pontosPeriodo,
      };
    })
    .filter(r => filtro.origem === 'desafios' ? r.desafiosJogados > 0 : filtro.origem === 'quizzes' ? r.quizzesRespondidos > 0 : (r.quizzesRespondidos > 0 || r.desafiosJogados > 0))
    .sort((a, b) => b.pontosTotais - a.pontosTotais);
};

// ------------------------------------------------------------------
// 6. RELATÓRIO INDIVIDUAL (cada pergunta de cada quiz e desafio)
// ------------------------------------------------------------------
export interface DetalheRespostaRelatorio {
  pergunta_id: string;
  enunciado: string;
  alternativaEscolhida: number;
  alternativaEscolhidaTexto: string;
  correta: boolean;
  respostaCorretaTexto: string;
  explicacao: string;
  norma: string;
  categoria: string;
  tempoGastoSeg: number;
}

export interface QuizIndividualRelatorio {
  quiz_id: string;
  titulo: string;
  categoria: string;
  respondido_em: string;
  pontuacao_total: number;
  respostas: DetalheRespostaRelatorio[];
  totalAcertos: number;
  totalPerguntas: number;
}

export interface DesafioIndividualRelatorio {
  desafio_id: string;
  tipo: string;
  tema: string;
  data: string;
  oponente: string;
  status: string;
  venceu: boolean | null;
  placar: string;
  respostasMinhas: DetalheRespostaRelatorio[];
}

export interface RelatorioIndividual {
  colaborador: Usuario;
  quizzes: QuizIndividualRelatorio[];
  desafios: DesafioIndividualRelatorio[];
  resumoPorNorma: { norma: string; total: number; acertos: number; taxaAcerto: number }[];
}

const montarDetalheResposta = (pergunta: Pergunta | undefined, escolhida: number, correta: boolean, tempo: number): DetalheRespostaRelatorio => {
  const alternativas = normalizeAlternativas(pergunta?.alternativas || []);
  const altEscolhidaVal = alternativas[escolhida];
  const altCorretaVal = pergunta && pergunta.resposta_correta !== undefined ? alternativas[pergunta.resposta_correta] : undefined;
  return {
    pergunta_id: pergunta?.id || '',
    enunciado: pergunta?.enunciado || 'Pergunta não encontrada',
    alternativaEscolhida: escolhida,
    alternativaEscolhidaTexto: altEscolhidaVal !== undefined ? formatAlternativaText(altEscolhidaVal) : (escolhida === -1 ? 'Não respondida (tempo esgotado)' : '—'),
    correta,
    respostaCorretaTexto: altCorretaVal !== undefined ? formatAlternativaText(altCorretaVal) : '—',
    explicacao: pergunta?.explicacao || '',
    norma: pergunta?.norma_relacionada || 'Geral',
    categoria: pergunta?.categoria || 'Geral',
    tempoGastoSeg: tempo,
  };
};

export const montarRelatorioIndividual = (
  colaboradorId: string,
  usuarios: Usuario[],
  quizzes: QuizSessao[],
  desafios: Desafio1v1[],
  perguntas: Pergunta[],
  filtro: FiltroRelatorio
): RelatorioIndividual | null => {
  const colaborador = usuarios.find(u => u.id === colaboradorId);
  if (!colaborador) return null;

  // --- Quizzes ---
  const meusQuizzes = filtrarQuizzes(quizzes, filtro)
    .filter(q => q.colaborador_id === colaboradorId && q.status === 'concluido')
    .filter(q => {
      if (!filtro.dataInicio && !filtro.dataFim) return true;
      return dentroPeriodo(q.respondido_em || q.criado_em, filtro);
    });

  const quizzesRelatorio: QuizIndividualRelatorio[] = meusQuizzes.map(q => {
    const respostas = (q.respostas || []).map(r => {
      const pergunta = q.perguntas.find(p => p.id === r.pergunta_id) || perguntas.find(p => p.id === r.pergunta_id);
      // Filtro de norma/categoria com comparação TOLERANTE (ignora maiúsculas/espaços).
      if (filtro.norma && normalizarTexto(pergunta?.norma_relacionada || 'Geral') !== normalizarTexto(filtro.norma)) return null;
      if (filtro.categoria && normalizarTexto(pergunta?.categoria || 'Geral') !== normalizarTexto(filtro.categoria)) return null;
      // Filtro de situação (corretas/erradas).
      if (filtro.situacao === 'corretas' && !r.correta) return null;
      if (filtro.situacao === 'erradas' && r.correta) return null;
      return montarDetalheResposta(pergunta, r.resposta_escolhida, r.correta, r.tempo_gasto_segundos);
    }).filter((r): r is DetalheRespostaRelatorio => r !== null);

    return {
      quiz_id: q.id,
      titulo: q.titulo,
      categoria: q.categoria,
      respondido_em: q.respondido_em || q.criado_em,
      pontuacao_total: q.pontuacao_total || 0,
      respostas,
      totalAcertos: respostas.filter(r => r.correta).length,
      totalPerguntas: respostas.length,
    };
  });

  // --- Desafios ---
  const meusDesafios = filtrarDesafios(desafios, filtro)
    .filter(d => d.desafiante_id === colaboradorId || d.desafiado_id === colaboradorId);

  const desafiosRelatorio: DesafioIndividualRelatorio[] = meusDesafios.map(d => {
    const ehDesafiante = d.desafiante_id === colaboradorId;
    const minhasResps = ehDesafiante ? (d.respostas_desafiante || []) : (d.respostas_desafiado || []);
    const oponente = usuarios.find(u => u.id === (ehDesafiante ? d.desafiado_id : d.desafiante_id));
    const venceu = d.status === 'concluido' ? d.vencedor_id === colaboradorId : null;

    const respostasMinhas = minhasResps.map(r => {
      const pergunta = d.perguntas.find(p => p.id === r.pergunta_id) || perguntas.find(p => p.id === r.pergunta_id);
      if (filtro.norma && normalizarTexto(pergunta?.norma_relacionada || 'Geral') !== normalizarTexto(filtro.norma)) return null;
      if (filtro.categoria && normalizarTexto(pergunta?.categoria || 'Geral') !== normalizarTexto(filtro.categoria)) return null;
      if (filtro.situacao === 'corretas' && !r.correta) return null;
      if (filtro.situacao === 'erradas' && r.correta) return null;
      return montarDetalheResposta(pergunta, r.alternativa_escolhida, r.correta, r.tempo_resposta_segundos);
    }).filter((r): r is DetalheRespostaRelatorio => r !== null);

    return {
      desafio_id: d.id,
      tipo: d.tipo === 'competitivo' ? 'Competitivo' : 'Amistoso',
      tema: d.tema_sorteado,
      data: d.data_criacao,
      oponente: oponente?.nome || 'Oponente',
      status: d.status,
      venceu,
      placar: d.placar_final || '—',
      respostasMinhas,
    };
  });

  // --- Resumo por norma (quizzes) ---
  const mapaNorma = new Map<string, { total: number; acertos: number }>();
  quizzesRelatorio.forEach(q => q.respostas.forEach(r => {
    const n = mapaNorma.get(r.norma) || { total: 0, acertos: 0 };
    n.total += 1;
    if (r.correta) n.acertos += 1;
    mapaNorma.set(r.norma, n);
  }));
  const resumoPorNorma = Array.from(mapaNorma.entries()).map(([norma, v]) => ({
    norma,
    total: v.total,
    acertos: v.acertos,
    taxaAcerto: v.total > 0 ? Number(((v.acertos / v.total) * 100).toFixed(1)) : 0,
  })).sort((a, b) => a.taxaAcerto - b.taxaAcerto);

  return {
    colaborador,
    quizzes: quizzesRelatorio,
    desafios: desafiosRelatorio,
    resumoPorNorma,
  };
};
