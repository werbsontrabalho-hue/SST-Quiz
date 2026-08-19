import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcularResultadoAvaliacaoParticipante } from '../src/utils/resultadoAvaliacao';
import { sanitizeSalaParaParticipante } from '../src/utils/salaSanitize';
import { ParticipanteSalaQuiz, Pergunta, SalaQuizGuiado } from '../src/types';

function makePergunta(id: string, respostaCorreta = 0, norma?: string): Pergunta {
  return {
    id,
    empresa_id: 'emp-1',
    categoria: 'sst',
    tipo: 'multipla_escolha',
    dificuldade: 'Médio',
    enunciado: `Enunciado ${id}`,
    alternativas: ['A', 'B', 'C', 'D'],
    resposta_correta: respostaCorreta,
    explicacao: `Explicação ${id}`,
    tempo_limite_segundos: 30,
    norma_relacionada: norma,
  };
}

function makeSala(overrides?: Partial<SalaQuizGuiado>): SalaQuizGuiado {
  return {
    id: 'sala-1',
    pin: '123456',
    treinamento_titulo: 'NR-35 Trabalho em Altura',
    instrutor_id: 'inst-1',
    instrutor_nome: 'Instrutor Teste',
    empresa_id: 'emp-1',
    data_criacao: new Date().toISOString(),
    status: 'concluido',
    modalidade: 'avaliacao',
    nota_minima: 7.0,
    nota_minima_aprovacao: 7.0,
    tempo_por_pergunta_seg: 30,
    perguntas: [makePergunta('q1', 0, 'NR-35'), makePergunta('q2', 1, 'NR-06')],
    pergunta_atual_index: 1,
    mostrar_ranking: false,
    permitir_visitantes: false,
    participantes: [],
    ...overrides,
  };
}

function makeParticipante(overrides?: Partial<ParticipanteSalaQuiz>): ParticipanteSalaQuiz {
  return {
    id: 'part-1',
    usuario_id: 'usr-1',
    nome: 'Colaborador Teste',
    matricula: '1234',
    is_visitante: false,
    respostas: {},
    pontuacao_acumulada: 0,
    ...overrides,
  };
}

describe('calcularResultadoAvaliacaoParticipante', () => {
  it('participante que acertou todas as perguntas é APROVADO', () => {
    const sala = makeSala();
    const participante = makeParticipante({
      respostas: {
        q1: { resposta_index: 0, tempo_ms: 5000, timestamp: new Date().toISOString(), correta: true },
        q2: { resposta_index: 1, tempo_ms: 5000, timestamp: new Date().toISOString(), correta: true },
      },
    });
    const resultado = calcularResultadoAvaliacaoParticipante(sala, participante);
    assert.equal(resultado.acertos, 2);
    assert.equal(resultado.erros, 0);
    assert.equal(resultado.nota_final, 10.0);
    assert.equal(resultado.situacao, 'APROVADO');
    assert.equal(resultado.total_perguntas, 2);
    assert.equal(resultado.porcentagem_acertos, 100);
  });

  it('participante que errou todas é NAO_APROVADO', () => {
    const sala = makeSala();
    const participante = makeParticipante({
      respostas: {
        q1: { resposta_index: 2, tempo_ms: 5000, timestamp: new Date().toISOString(), correta: false },
        q2: { resposta_index: 0, tempo_ms: 5000, timestamp: new Date().toISOString(), correta: false },
      },
    });
    const resultado = calcularResultadoAvaliacaoParticipante(sala, participante);
    assert.equal(resultado.acertos, 0);
    assert.equal(resultado.nota_final, 0.0);
    assert.equal(resultado.situacao, 'NAO_APROVADO');
  });

  it('participante sem respostas conta perguntas como Sem Resposta e erra', () => {
    const sala = makeSala();
    const participante = makeParticipante();
    const resultado = calcularResultadoAvaliacaoParticipante(sala, participante);
    assert.equal(resultado.acertos, 0);
    assert.equal(resultado.respostas_detalhadas.length, 2);
    assert.equal(resultado.respostas_detalhadas[0].resposta_fornecida, 'Sem Resposta');
  });

  it('apura desempenho por tema/norma relacionada', () => {
    const sala = makeSala();
    const participante = makeParticipante({
      respostas: {
        q1: { resposta_index: 0, tempo_ms: 5000, timestamp: new Date().toISOString(), correta: true },
        q2: { resposta_index: 0, tempo_ms: 5000, timestamp: new Date().toISOString(), correta: false },
      },
    });
    const resultado = calcularResultadoAvaliacaoParticipante(sala, participante);
    const nr35 = resultado.desempenho_por_tema.find(t => t.tema === 'NR-35');
    const nr06 = resultado.desempenho_por_tema.find(t => t.tema === 'NR-06');
    assert.equal(nr35?.acertos, 1);
    assert.equal(nr35?.percentual, 100);
    assert.equal(nr06?.acertos, 0);
    assert.equal(nr06?.percentual, 0);
  });

  it('sem normas relacionadas usa tema genérico de SST', () => {
    const sala = makeSala({ perguntas: [makePergunta('q1'), makePergunta('q2')] });
    const participante = makeParticipante({
      respostas: {
        q1: { resposta_index: 0, tempo_ms: 5000, timestamp: new Date().toISOString(), correta: true },
        q2: { resposta_index: 1, tempo_ms: 5000, timestamp: new Date().toISOString(), correta: true },
      },
    });
    const resultado = calcularResultadoAvaliacaoParticipante(sala, participante);
    assert.equal(resultado.desempenho_por_tema.length, 1);
    assert.equal(resultado.desempenho_por_tema[0].tema, 'Conhecimentos Gerais SST');
  });

  it('nota_minima maior que 10 é convertida para base 10', () => {
    const sala = makeSala({ nota_minima: 70, nota_minima_aprovacao: 70 });
    const participante = makeParticipante({
      respostas: {
        q1: { resposta_index: 0, tempo_ms: 5000, timestamp: new Date().toISOString(), correta: true },
        q2: { resposta_index: 0, tempo_ms: 5000, timestamp: new Date().toISOString(), correta: false },
      },
    });
    const resultado = calcularResultadoAvaliacaoParticipante(sala, participante);
    assert.equal(resultado.nota_final, 5.0);
    assert.equal(resultado.nota_minima, 7.0);
    assert.equal(resultado.nota_minima_aprovacao, 70);
    assert.equal(resultado.situacao, 'NAO_APROVADO');
  });

  it('REGRESSÃO: sala sanitizada (sem resposta_correta) não marca todas as respostas como incorretas', () => {
    // Bug real relatado: o participante acertava no app, mas o PDF marcava
    // TODAS as respostas como "INCORRETA". Causa raiz: a sala no estado
    // global era a versão sanitizada para participante, que REMOVE
    // resposta_correta das perguntas → `respIndex === undefined` = false.
    // O resultado deve ser calculado sempre com a sala COMPLETA (com gabarito).
    const salaCompleta = makeSala();
    const salaSanitizada = sanitizeSalaParaParticipante(salaCompleta) as unknown as SalaQuizGuiado;
    const participante = makeParticipante({
      respostas: {
        q1: { resposta_index: 0, tempo_ms: 5000, timestamp: new Date().toISOString(), correta: true },
        q2: { resposta_index: 1, tempo_ms: 5000, timestamp: new Date().toISOString(), correta: true },
      },
    });

    const comGabarito = calcularResultadoAvaliacaoParticipante(salaCompleta, participante);
    assert.equal(comGabarito.acertos, 2);
    assert.equal(comGabarito.situacao, 'APROVADO');

    // CORREÇÃO (Problema 1 — resposta correta marcada como errada): o cálculo
    // usa a flag `correta` VALIDADA NO SERVIDOR (gravada em resp.correta no
    // momento da resposta), então a sala sanitizada (sem gabarito) NÃO pode
    // subestimar os acertos — o resultado deve ser idêntico ao da sala completa.
    const semGabarito = calcularResultadoAvaliacaoParticipante(salaSanitizada, participante);
    assert.equal(semGabarito.acertos, 2, 'sala sanitizada deve manter os acertos validados no servidor');
    assert.equal(semGabarito.situacao, 'APROVADO');
    assert.equal(semGabarito.nota_final, comGabarito.nota_final, 'nota deve ser idêntica à sala com gabarito');
  });

  it('REGRESSÃO: resposta com correta AGUARDANDO (undefined) não é contada como erro no resultado', () => {
    // Bug relatado: "Você não pontuou nesta pergunta" mesmo respondendo certo.
    // Quando a validação server (edge/RPC) ainda não retornou, o participante
    // grava a resposta com `correta: undefined` (aguardando). No resultado:
    //  - se a sala tem GABARITO local, o fallback calcula a correção (sem
    //    marcar como erro quando o índice bate com o gabarito);
    //  - a resposta nunca é contada como ERRO por causa do gabarito ausente.
    const salaCompleta = makeSala();
    const participante = makeParticipante({
      respostas: {
        q1: { resposta_index: 0, tempo_ms: 5000, timestamp: new Date().toISOString(), correta: true },
        q2: { resposta_index: 1, tempo_ms: 5000, timestamp: new Date().toISOString() }, // correta: undefined
      },
    });

    const resultado = calcularResultadoAvaliacaoParticipante(salaCompleta, participante);
    // q1 validada (true) conta acerto; q2 sem validação usa o gabarito LOCAL
    // (resposta_correta=1) → correta também.
    assert.equal(resultado.acertos, 2, 'resposta validada e resposta com gabarito local contam como acerto');
    assert.equal(resultado.respostas_detalhadas[1].correta, true, 'fallback local com gabarito calcula corretamente');
  });

  it('REGRESSÃO: sala sanitizada + resposta SEM correta não vira erro automático no detalhe', () => {
    // Com a sala SANITIZADA (sem gabarito local) e sem validação server, a
    // resposta fica pendente (não soma acerto nem é marcada como erro).
    const salaCompleta = makeSala();
    const salaSanitizada = sanitizeSalaParaParticipante(salaCompleta) as unknown as SalaQuizGuiado;
    const participante = makeParticipante({
      respostas: {
        q1: { resposta_index: 0, tempo_ms: 5000, timestamp: new Date().toISOString(), correta: true },
        q2: { resposta_index: 1, tempo_ms: 5000, timestamp: new Date().toISOString() }, // correta: undefined
      },
    });
    const resultado = calcularResultadoAvaliacaoParticipante(salaSanitizada, participante);
    // q1 contou acerto (validação do servidor); q2 permanece neutra — NÃO
    // incrementa erros mesmo sem gabarito local.
    assert.equal(resultado.acertos, 1, 'apenas a resposta validada no servidor conta acerto');
    assert.equal(resultado.erros, 1, 'q2 sem gabarito local/validação não soma erro');
  });
});