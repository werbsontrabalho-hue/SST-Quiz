// ============================================================================
// resultadoAvaliacao.ts — CÁLCULO PURO DO RESULTADO DE AVALIAÇÃO (QUIZ GUIADO)
// ----------------------------------------------------------------------------
// Refactor incremental (Fase 9): dado uma sala e um participante, calcula o
// ResultadoAvaliacaoSST completo (acertos, nota, situação, desempenho por
// tema e respostas detalhadas). NÃO muda nenhuma regra — apenas isola o
// cálculo do SSTContext para ser testável.
// ============================================================================

import { ParticipanteSalaQuiz, ResultadoAvaliacaoSST, SalaQuizGuiado } from '../types';
import { formatAlternativaText, normalizeAlternativas } from './questionHelpers';

export function calcularResultadoAvaliacaoParticipante(
  sala: SalaQuizGuiado,
  p: ParticipanteSalaQuiz
): ResultadoAvaliacaoSST {
  const perguntas = sala.perguntas || [];
  const total = perguntas.length;
  let acertos = 0;

  const respostasDetalhadas = perguntas.map(perg => {
    let resp: any = undefined;
    if (p.respostas) {
      if (Array.isArray(p.respostas)) {
        resp = (p.respostas as any[]).find((r: any) => r.pergunta_id === perg.id);
      } else {
        resp = p.respostas[perg.id];
      }
    }
    const respIndexRaw = resp ? resp.resposta_index : -1;
    // Normaliza para número: dados vindos de DB/CSV podem trazer "0" como
    // string, e a comparação estrita marcaria a resposta como errada
    // (auditoria forense AUD-25).
    const respIndex = Number(respIndexRaw);
    // CORREÇÃO (Problema 1 — resposta correta marcada como errada): a
    // avaliação final deve usar a correção VALIDADA NO SERVIDOR (gravada em
    // resp.correta pelo RPC/Edge no momento da resposta). Recalcular com o
    // gabarito LOCAL quebra o participante, que recebe a sala SANITIZADA
    // (sem resposta_correta/explicacao) — nesse caso tudo viraria errado.
    let correta: boolean;
    if (resp && typeof resp.correta === 'boolean') {
      correta = resp.correta;
    } else {
      correta = respIndex === Number(perg.resposta_correta);
    }
    if (correta) acertos++;

    const alts = normalizeAlternativas(perg.alternativas || (perg as any).opcoes);
    const respFornecidaVal = respIndex >= 0 ? alts[respIndex] : undefined;
    const respCorretaVal = alts[perg.resposta_correta];

    return {
      pergunta_id: perg.id,
      enunciado: perg.enunciado,
      norma_relacionada: perg.norma_relacionada,
      alternativas: alts,
      resposta_fornecida_index: respIndex,
      resposta_correta_index: perg.resposta_correta,
      resposta_fornecida: respIndex >= 0 ? (respFornecidaVal ? formatAlternativaText(respFornecidaVal) : 'Não respondida') : 'Sem Resposta',
      resposta_correta: respCorretaVal ? formatAlternativaText(respCorretaVal) : '',
      correta,
      explicacao: perg.explicacao,
    };
  });

  const notaFinal = total > 0 ? parseFloat(((acertos / total) * 10).toFixed(1)) : 0;
  const notaMinimaOriginal = sala.nota_minima_aprovacao ?? sala.nota_minima ?? 70;
  const notaMinimaBase10 = notaMinimaOriginal > 10 ? notaMinimaOriginal / 10 : notaMinimaOriginal;
  const situacao: 'APROVADO' | 'NAO_APROVADO' = notaFinal >= notaMinimaBase10 ? 'APROVADO' : 'NAO_APROVADO';

  const temasMap = new Map<string, { total: number; acertos: number }>();
  respostasDetalhadas.forEach(r => {
    const t = r.norma_relacionada || 'Conhecimentos Gerais SST';
    const curr = temasMap.get(t) || { total: 0, acertos: 0 };
    curr.total += 1;
    if (r.correta) curr.acertos += 1;
    temasMap.set(t, curr);
  });

  const desempenho_por_tema = Array.from(temasMap.entries()).map(([tema, val]) => {
    const pct = val.total > 0 ? Math.round((val.acertos / val.total) * 100) : 0;
    return {
      tema,
      total: val.total,
      acertos: val.acertos,
      percentual: pct,
      porcentagem: pct,
    };
  });

  const pctAcertosGeral = total > 0 ? Math.round((acertos / total) * 100) : 0;

  // CORREÇÃO (QA/Homologação): o id e os códigos incluem a SESSÃO (sessao_id),
  // alinhado ao encerramento — para que a avaliação sob demanda da sessão
  // atual não colida com a de outra sessão do mesmo Quiz.
  const sessaoId = sala.sessao_id || `sess-${Date.now()}`;

  return {
    id: `res-${sala.id}-${sessaoId}-${p.id}`,
    sala_id: sala.id,
    empresa_id: sala.empresa_id,
    instrutor_id: sala.instrutor_id,
    sala_pin: sala.pin,
    sessao_id: sessaoId,
    participante_nome: p.nome,
    participante_id: p.usuario_id || p.id,
    matricula: p.matricula,
    cpf: p.cpf,
    cpf_ou_empresa: p.cpf_ou_empresa,
    is_visitante: p.is_visitante,
    treinamento_titulo: sala.treinamento_titulo || sala.nome || 'Quiz Guiado SST',
    instrutor_nome: sala.instrutor_nome,
    data: new Date().toLocaleDateString('pt-BR'),
    total_perguntas: total,
    acertos,
    erros: total - acertos,
    nota_final: notaFinal,
    nota_minima: notaMinimaBase10,
    situacao,
    desempenho_por_tema,
    respostas_detalhadas: respostasDetalhadas,
    cargo: p.cpf_ou_empresa || 'Colaborador SST',
    setor_nome: 'Treinamento SST',
    email: p.is_visitante ? 'Visitante' : 'Cadastrado',
    sala_nome: sala.nome || sala.treinamento_titulo || 'Quiz Guiado SST',
    data_finalizacao: new Date().toISOString(),
    porcentagem_acertos: pctAcertosGeral,
    codigo_documento: `DOC-SST-${(sala.id || 'SALASST').slice(-4).toUpperCase()}-${sessaoId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}-${(p.id || 'PART').slice(-4).toUpperCase()}`,
    sessao_codigo: `SST-SESSAO-${sessaoId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`,
    nota_minima_aprovacao: Math.round(notaMinimaBase10 * 10),
    questoes_corretas: acertos,
    total_questoes: total,
  };
}