import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server';

describe('Quiz Guiado SST em Tempo Real — Fluxo Completo', () => {
  let server: http.Server;
  let baseUrl = '';
  let state: any = null;

  async function req(method: string, path: string, body?: unknown) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json };
  }

  before(async () => {
    process.env.NODE_ENV = 'production';
    const { app, state: appState } = await createApp();
    state = appState;

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(() => {
    return new Promise<void>((resolve, reject) => {
      server?.close((err) => (err ? reject(err) : resolve()));
    });
  });

  test('1. Criar sala pelo instrutor, entrar participante por PIN, responder, e reiniciar sala', async () => {
    const salaInicial = {
      id: 'sala-realtime-test-1',
      pin: '654321',
      treinamento_titulo: 'Treinamento de CIPA e NR-05',
      nome: 'Treinamento CIPA',
      instrutor_id: 'usr-instrutor-1',
      instrutor_nome: 'Instrutor João',
      empresa_id: 'emp-1',
      status: 'aguardando',
      estado_apresentacao: 'AGUARDANDO',
      sessao_id: 'sess-1001',
      modalidade: 'interativo',
      estilo: 'competitivo',
      nota_minima: 7,
      tempo_por_pergunta_seg: 30,
      perguntas: [
        {
          id: 'q1',
          enunciado: 'Qual NR trata de CIPA?',
          alternativas: ['NR-01', 'NR-05', 'NR-10', 'NR-35'],
          resposta_correta: 1,
          explicacao: 'NR-05 regulamenta a CIPA.',
        },
        {
          id: 'q2',
          enunciado: 'Qual a frequência de reuniões da CIPA?',
          alternativas: ['Semanal', 'Mensal', 'Anual'],
          resposta_correta: 1,
          explicacao: 'Reuniões ordinárias mensais.',
        }
      ],
      pergunta_atual_index: 0,
      participantes: [],
      revelar_resposta_atual: false,
      mostrar_ranking: false,
    };

    // 1. Post da sala criada no servidor Express
    const createRes = await req('POST', '/api/salas_quiz_guiado', salaInicial);
    assert.equal(createRes.status, 200);
    assert.equal(createRes.json.success, true);
    assert.equal(createRes.json.sala.pin, '654321');

    // 2. Busca por PIN (simula celular do participante escaneando QR / digitando PIN)
    const pinRes = await req('GET', '/api/salas_quiz_guiado/pin/654321');
    assert.equal(pinRes.status, 200);
    assert.equal(pinRes.json.id, 'sala-realtime-test-1');
    // Sanitização anti-cola: resposta_correta não deve estar visível ao participante antes de ser revelada
    assert.equal(pinRes.json.perguntas[0].resposta_correta, undefined, 'Gabarito omitido para participante');

    // 3. Participante entra na sala e responde a pergunta 1
    const part1 = {
      id: 'part-100',
      nome: 'Maria Silva',
      matricula: 'MAT-888',
      cpf: '111.222.333-44',
      respostas: {},
      pontuacao_acumulada: 0,
    };

    salaInicial.participantes.push(part1 as any);
    const updateWithPart = await req('POST', '/api/salas_quiz_guiado', {
      ...salaInicial,
      status: 'em_andamento',
      estado_apresentacao: 'QUESTION_ACTIVE',
      question_started_at: Date.now(),
      question_ends_at: Date.now() + 30000,
    });
    assert.equal(updateWithPart.status, 200);

    // 4. Participante envia resposta para o servidor (/api/salas_quiz_guiado/responder)
    const respRes = await req('POST', '/api/salas_quiz_guiado/responder', {
      sala_id: 'sala-realtime-test-1',
      participante_id: 'part-100',
      pergunta_id: 'q1',
      resposta_index: 1, // resposta correta (NR-05)
      tempo_ms: 5000,
    });
    assert.equal(respRes.status, 200);
    assert.equal(respRes.json.success, true);
    assert.equal(respRes.json.correta, true, 'Servidor deve validar resposta correta');
    assert.ok(respRes.json.pontosAdicionais > 1000, 'Pontuação competitiva atribuída com base no tempo');

    // 5. Verifica se o estado do participante no servidor acumulou a pontuação e gravou a resposta
    const salaAposResposta = state.salasQuizMap.get('sala-realtime-test-1');
    assert.ok(salaAposResposta.participantes[0].pontuacao_acumulada > 0);
    assert.equal(salaAposResposta.participantes[0].respostas['q1'].correta, true);

    // 6. Teste de Reinício de Sala (geração de novo PIN e nova sessão pelo instrutor)
    const salaReiniciadaPayload = {
      id: 'sala-realtime-test-1',
      pin: '987654', // Novo PIN
      sessao_id: 'sess-2002', // Nova sessão
      status: 'aguardando',
      estado_apresentacao: 'AGUARDANDO',
      pergunta_atual_index: 0,
      revelar_resposta_atual: false,
      mostrar_ranking: false,
      participantes: [], // Zerados para a nova rodada
    };

    const restartRes = await req('POST', '/api/salas_quiz_guiado', salaReiniciadaPayload);
    assert.equal(restartRes.status, 200);
    assert.equal(restartRes.json.sala.pin, '987654');
    assert.equal(restartRes.json.sala.sessao_id, 'sess-2002');
    assert.equal(restartRes.json.sala.status, 'aguardando');

    // O PIN antigo (654321) não deve mais localizar a sala no servidor
    const oldPinRes = await req('GET', '/api/salas_quiz_guiado/pin/654321');
    assert.equal(oldPinRes.status, 404, 'PIN antigo deve retornar 404');

    // O PIN novo (987654) deve localizar a sala limpa e pronta
    const newPinRes = await req('GET', '/api/salas_quiz_guiado/pin/987654');
    assert.equal(newPinRes.status, 200);
    assert.equal(newPinRes.json.id, 'sala-realtime-test-1');
    assert.equal(newPinRes.json.participantes.length, 0, 'Lista de participantes limpa para nova sessão');
  });
});
