import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcularResultadoDesafio, RespostaDesafioItem } from '../src/utils/desafioWinner';
import { Desafio1v1, Pergunta } from '../src/types';

function makePergunta(id: string, empresaId = 'emp-1'): Pergunta {
  return {
    id,
    empresa_id: empresaId,
    categoria: 'sst',
    tipo: 'multipla_escolha',
    dificuldade: 'Médio',
    enunciado: `Pergunta ${id}`,
    alternativas: ['A', 'B', 'C', 'D'],
    resposta_correta: 0,
    explicacao: '',
    tempo_limite_segundos: 30,
    disponivel_desafios: true,
  };
}

function makeDesafio(overrides?: Partial<Desafio1v1>): Desafio1v1 {
  const perguntas = [makePergunta('q1'), makePergunta('q2'), makePergunta('q3'), makePergunta('q4'), makePergunta('q5')];
  return {
    id: 'des-1',
    empresa_id: 'emp-1',
    desafiante_id: 'u1',
    desafiante_setor_id: 'setor-1',
    desafiado_id: 'u2',
    desafiado_setor_id: 'setor-2',
    tema_sorteado: 'sst',
    status: 'em_andamento',
    vale_ponto: true,
    tipo: 'competitivo',
    pontuacao_setor: 100,
    data_criacao: new Date().toISOString(),
    perguntas,
    ...overrides,
  };
}

function resp(perguntaId: string, correta: boolean, tempo = 10): RespostaDesafioItem {
  return {
    pergunta_id: perguntaId,
    alternativa_escolhida: correta ? 0 : 1,
    correta,
    tempo_resposta_segundos: tempo,
  };
}

describe('calcularResultadoDesafio', () => {
  it('desafiante vence direto nas 5 perguntas quando tem mais acertos', () => {
    const desafio = makeDesafio({
      respostas_desafiado: [resp('q1', false), resp('q2', false), resp('q3', false), resp('q4', false), resp('q5', false)],
    });
    const resultado = calcularResultadoDesafio({
      desafio,
      respostas: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true)],
      isDesafiante: true,
      perguntasDisponiveis: [],
      desempateRule: 'desafiante',
    });
    assert.equal(resultado.status, 'concluido');
    assert.equal(resultado.vencedorId, 'u1');
    assert.equal(resultado.vencedorSetorId, 'setor-1');
    assert.equal(resultado.placarFinal, '5 x 0');
    assert.equal(resultado.decididoNoDesempate, false);
  });

  it('desafiado vence direto nas 5 perguntas quando tem mais acertos', () => {
    const desafio = makeDesafio({
      respostas_desafiante: [resp('q1', false), resp('q2', false), resp('q3', false), resp('q4', false), resp('q5', false)],
    });
    const resultado = calcularResultadoDesafio({
      desafio,
      respostas: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true)],
      isDesafiante: false,
      perguntasDisponiveis: [],
      desempateRule: 'desafiante',
    });
    assert.equal(resultado.status, 'concluido');
    assert.equal(resultado.vencedorId, 'u2');
    assert.equal(resultado.vencedorSetorId, 'setor-2');
    // Placar sempre na ordem desafiante x desafiado (0 x 5 aqui).
    assert.equal(resultado.placarFinal, '0 x 5');
  });

  it('empate nas 5 perguntas adiciona a 6a pergunta de desempate e segue em andamento', () => {
    const desafio = makeDesafio({
      respostas_desafiado: [resp('q1', true), resp('q2', false), resp('q3', true), resp('q4', false), resp('q5', true)],
    });
    const resultado = calcularResultadoDesafio({
      desafio,
      respostas: [resp('q1', true), resp('q2', false), resp('q3', true), resp('q4', false), resp('q5', true)],
      isDesafiante: true,
      perguntasDisponiveis: [makePergunta('q6')],
      desempateRule: 'desafiante',
    });
    assert.equal(resultado.status, 'em_andamento');
    assert.equal(resultado.perguntas.length, 6);
    assert.equal(resultado.vencedorId, undefined);
  });

  it('sem perguntas disponiveis, empate nas 5 segue em andamento sem acrescentar', () => {
    const desafio = makeDesafio({
      respostas_desafiado: [resp('q1', true), resp('q2', false), resp('q3', true), resp('q4', false), resp('q5', true)],
    });
    const resultado = calcularResultadoDesafio({
      desafio,
      respostas: [resp('q1', true), resp('q2', false), resp('q3', true), resp('q4', false), resp('q5', true)],
      isDesafiante: true,
      perguntasDisponiveis: [],
      desempateRule: 'desafiante',
    });
    assert.equal(resultado.status, 'em_andamento');
    assert.equal(resultado.perguntas.length, 5);
  });

  it('desempate: apenas o desafiante acerta e vence', () => {
    const desafio = makeDesafio({
      perguntas: [...[makePergunta('q1'), makePergunta('q2'), makePergunta('q3'), makePergunta('q4'), makePergunta('q5')], makePergunta('q6')],
      respostas_desafiado: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true), resp('q6', false)],
    });
    const resultado = calcularResultadoDesafio({
      desafio,
      respostas: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true), resp('q6', true)],
      isDesafiante: true,
      perguntasDisponiveis: [],
      desempateRule: 'desafiante',
    });
    assert.equal(resultado.status, 'concluido');
    assert.equal(resultado.vencedorId, 'u1');
    assert.equal(resultado.decididoNoDesempate, true);
    assert.match(resultado.placarFinal || '', /Desempate/);
  });

  it('desempate: ambos acertam e o mais rapido vence', () => {
    const desafio = makeDesafio({
      perguntas: [...[makePergunta('q1'), makePergunta('q2'), makePergunta('q3'), makePergunta('q4'), makePergunta('q5')], makePergunta('q6')],
      respostas_desafiado: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true), resp('q6', true, 5)],
    });
    // Ambos acertam a q6; desafiado (u2) responde mais rápido (5s vs 12s).
    const resultado = calcularResultadoDesafio({
      desafio,
      respostas: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true), resp('q6', true, 12)],
      isDesafiante: true,
      perguntasDisponiveis: [],
      desempateRule: 'desafiante',
    });
    assert.equal(resultado.status, 'concluido');
    assert.equal(resultado.vencedorId, 'u2');
    assert.match(resultado.placarFinal || '', /Tempo/);
  });

  it('ambos erram o desempate sem mais perguntas: regra da empresa decide (desafiado)', () => {
    const desafio = makeDesafio({
      perguntas: [...[makePergunta('q1'), makePergunta('q2'), makePergunta('q3'), makePergunta('q4'), makePergunta('q5')], makePergunta('q6')],
      respostas_desafiado: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true), resp('q6', false)],
    });
    const resultado = calcularResultadoDesafio({
      desafio,
      respostas: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true), resp('q6', false)],
      isDesafiante: true,
      perguntasDisponiveis: [],
      desempateRule: 'desafiado',
    });
    assert.equal(resultado.status, 'concluido');
    assert.equal(resultado.vencedorId, 'u2');
  });

  it('ambos erram o desempate sem mais perguntas: regra "ninguem" sem vencedor', () => {
    const desafio = makeDesafio({
      perguntas: [...[makePergunta('q1'), makePergunta('q2'), makePergunta('q3'), makePergunta('q4'), makePergunta('q5')], makePergunta('q6')],
      respostas_desafiado: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true), resp('q6', false)],
    });
    const resultado = calcularResultadoDesafio({
      desafio,
      respostas: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true), resp('q6', false)],
      isDesafiante: true,
      perguntasDisponiveis: [],
      desempateRule: 'ninguem',
    });
    assert.equal(resultado.status, 'concluido');
    assert.equal(resultado.vencedorId, undefined);
  });

  it('aguardando o oponente no desempate mantem a partida em andamento', () => {
    const desafio = makeDesafio({
      perguntas: [...[makePergunta('q1'), makePergunta('q2'), makePergunta('q3'), makePergunta('q4'), makePergunta('q5')], makePergunta('q6')],
      respostas_desafiado: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true)],
    });
    // Desafiante já respondeu a q6; desafiado ainda não → em_andamento.
    const resultado = calcularResultadoDesafio({
      desafio,
      respostas: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true), resp('q6', true)],
      isDesafiante: true,
      perguntasDisponiveis: [],
      desempateRule: 'desafiante',
    });
    assert.equal(resultado.status, 'em_andamento');
    assert.equal(resultado.vencedorId, undefined);
  });

  // REGRESSÃO (auditoria forense AUD-51): tempo de resposta 0 (resposta
  // imediata) NÃO deve virar 20s pelo fallback "|| 20" — quem respondeu com
  // tempo 0 vence o desempate por tempo.
  it('desempate por tempo: tempo 0 real vence contra tempo maior (sem fallback de 20s)', () => {
    const desafio = makeDesafio({
      perguntas: [...[makePergunta('q1'), makePergunta('q2'), makePergunta('q3'), makePergunta('q4'), makePergunta('q5')], makePergunta('q6')],
      respostas_desafiado: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true), resp('q6', true, 5)],
    });
    // Desafiante respondeu a q6 com tempo 0 (resposta imediata) e acertou.
    const resultado = calcularResultadoDesafio({
      desafio,
      respostas: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true), resp('q6', true, 0)],
      isDesafiante: true,
      perguntasDisponiveis: [],
      desempateRule: 'desafiante',
    });
    assert.equal(resultado.status, 'concluido');
    assert.equal(resultado.vencedorId, 'u1');
    assert.equal(resultado.motivoVitoria, 'Ambos acertaram! Vitória por resposta mais rápida na 6ª pergunta (0.0s vs 5.0s)!');
  });

  // REGRESSÃO (auditoria forense AUD-50/F-21): a pergunta de desempate (6ª)
  // deve ser escolhida de forma DETERMINÍSTICA — os dois dispositivos
  // (desafiante e desafiado) devem selecionar SEMPRE a mesma pergunta. Antes
  // usava Math.random() e cada lado podia receber uma pergunta diferente.
  it('pergunta de desempate é determinística (mesmo id de desafio escolhe a mesma pergunta)', () => {
    const candidatas = [makePergunta('q7'), makePergunta('q8'), makePergunta('q9'), makePergunta('q10')];
    const desafio = makeDesafio({
      id: 'des-deterministico-1',
      perguntas: [makePergunta('q1'), makePergunta('q2'), makePergunta('q3'), makePergunta('q4'), makePergunta('q5')],
      respostas_desafiado: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true)],
    });
    const base = {
      desafio,
      respostas: [resp('q1', true), resp('q2', true), resp('q3', true), resp('q4', true), resp('q5', true)],
      perguntasDisponiveis: candidatas,
      desempateRule: 'desafiante' as const,
    };
    // Executa várias vezes: a pergunta escolhida deve ser sempre a mesma.
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const r = calcularResultadoDesafio({ ...base, isDesafiante: true });
      const q6 = r.perguntas.find(p => p.id === 'q7' || p.id === 'q8' || p.id === 'q9' || p.id === 'q10');
      assert.ok(q6, 'deve adicionar a pergunta de desempate');
      ids.add(q6.id);
    }
    assert.equal(ids.size, 1, `o sorteio deve ser determinístico, mas escolheu: ${[...ids].join(', ')}`);
  });
});