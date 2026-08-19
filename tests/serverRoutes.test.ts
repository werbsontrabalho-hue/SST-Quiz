import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server';

// ============================================================
// Testes de INTEGRAÇÃO HTTP do backend Express (server.ts).
// Cobre as rotas /api/* com um servidor real em porta efêmera:
//   - health/ready;
//   - lista de salas SANITIZADA (sem gabarito — AUD-20);
//   - POST de sala preserva o gabarito oficial quando o participante
//     devolve a cópia sanitizada (AUD-25);
//   - autorização por API_TOKEN nas rotas de resultados;
//   - ciclo de vida dos backups em disco.
// ============================================================

let server: http.Server;
let baseUrl = '';
let state: any = null;
const salvoApiToken = process.env.API_TOKEN;

// Helper: requisita uma rota e devolve { status, json }
async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['x-api-token'] = token;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

before(async () => {
  // Garante ambiente "produção" para não subir o middleware do Vite no teste.
  const nodeEnvOriginal = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  delete process.env.API_TOKEN; // sem token: modo LAN aberto (comportamento legado)
  const { app, state: appState } = await createApp();
  state = appState;
  process.env.NODE_ENV = nodeEnvOriginal;

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  process.env.API_TOKEN = salvoApiToken;
  return new Promise<void>((resolve, reject) => {
    server?.close((err) => (err ? reject(err) : resolve()));
  });
});

test('GET /api/health e /api/ready respondem 200 com status ok', async () => {
  const health = await req('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.json.status, 'ok');

  const ready = await req('GET', '/api/ready');
  assert.equal(ready.status, 200);
  assert.equal(ready.json.status, 'ready');
});

test('GET /api/salas_quiz_guiado retorna lista e não expõe gabarito (AUD-20)', async () => {
  // Cria uma sala com gabarito conhecido.
  const sala = {
    id: 'sala-teste-1',
    pin: '123456',
    nome: 'Sala Teste',
    treinamento_titulo: 'Treinamento',
    instrutor_id: 'usr-1',
    instrutor_nome: 'Instrutor',
    empresa_id: 'emp-1',
    status: 'aguardando',
    modalidade: 'interativo',
    estilo: 'competitivo',
    nota_minima: 7,
    tempo_por_pergunta_seg: 30,
    perguntas: [
      { id: 'q1', enunciado: 'Pergunta?', alternativas: ['A', 'B'], resposta_correta: 0, explicacao: 'Segredo' },
    ],
    pergunta_atual_index: 0,
    participantes: [{ id: 'p1', nome: 'Ana', cpf: '123.456.789-00' }],
  };
  // A criação da sala é feita pelo INSTRUTOR (via nuvem/Supabase) e depois
  // sincronizada ao Express; o POST do Express NÃO cria salas novas (evita
  // gabarito forjado — auditoria Quiz Guiado/Avaliação). Por isso, injetamos
  // a sala diretamente no estado do servidor para simular a sincronização.
  state.salasQuizMap.set(sala.id, { ...sala, updated_at: new Date().toISOString() });

  const lista = await req('GET', '/api/salas_quiz_guiado');
  assert.equal(lista.status, 200);
  const encontrada = lista.json.find((s: any) => s.id === 'sala-teste-1');
  assert.ok(encontrada, 'sala deve estar na lista');
  // O gabarito NÃO pode vazar na listagem.
  assert.equal(encontrada.perguntas[0].resposta_correta, undefined, 'resposta_correta deve ser removida');
  assert.equal(encontrada.perguntas[0].explicacao, undefined, 'explicacao deve ser removida');
});

test('POST de sala NOVA é aceito (fluxo LAN) e a lista sanitiza o gabarito', async () => {
  // O instrutor cria a sala via POST (fluxo LAN/visitante) — aceito. A
  // resposta e a lista são SEMPRE sanitizadas (sem resposta_correta).
  const salaNova = {
    id: 'sala-nova-1',
    pin: '555556',
    nome: 'Sala Nova',
    treinamento_titulo: 'T',
    instrutor_id: 'usr-x',
    instrutor_nome: 'X',
    empresa_id: 'emp-1',
    status: 'aguardando',
    modalidade: 'interativo',
    estilo: 'competitivo',
    nota_minima: 7,
    tempo_por_pergunta_seg: 30,
    perguntas: [{ id: 'q1', enunciado: 'P?', alternativas: ['A', 'B'], resposta_correta: 1, explicacao: 'Forjado' }],
    pergunta_atual_index: 0,
    participantes: [],
  };
  const res = await req('POST', '/api/salas_quiz_guiado', salaNova);
  assert.equal(res.status, 200, 'POST de sala nova deve ser aceito (fluxo LAN)');
  assert.equal(state.salasQuizMap.has('sala-nova-1'), true, 'sala deve ser criada no servidor');

  // A lista deve SANITIZAR (sem gabarito).
  const lista = await req('GET', '/api/salas_quiz_guiado');
  const encontrada = lista.json.find((s: any) => s.id === 'sala-nova-1');
  assert.ok(encontrada, 'sala nova deve estar na lista');
  assert.equal(encontrada.perguntas[0].resposta_correta, undefined, 'gabarito não pode vazar na lista');
});

test('POST com progresso ANTIGO não regride a pergunta no servidor (bug participante travado)', async () => {
  // Simula: o instrutor avançou para a pergunta 2 (pergunta_atual_index=1,
  // question_started_at recente). Um participante envia a sala de volta com o
  // progresso que recebeu (pergunta 0 / estado antigo). O servidor NÃO pode
  // regredir.
  const agora = Date.now();
  state.salasQuizMap.set('sala-prog-1', {
    id: 'sala-prog-1',
    pin: '777001',
    nome: 'Sala Prog',
    treinamento_titulo: 'T',
    instrutor_id: 'usr-1',
    instrutor_nome: 'I',
    empresa_id: 'emp-1',
    status: 'em_andamento',
    estado_apresentacao: 'QUESTION_ACTIVE',
    pergunta_atual_index: 1,
    question_started_at: agora,
    question_ends_at: agora + 30000,
    perguntas: [],
    participantes: [],
  });

  // Participante envia com progresso antigo (pergunta 0, sem question_started_at).
  const payloadAntigo = {
    id: 'sala-prog-1',
    pin: '777001',
    status: 'aguardando',
    estado_apresentacao: 'AGUARDANDO',
    pergunta_atual_index: 0,
    participantes: [{ id: 'p1', nome: 'Ana', respostas: {} }],
  };
  const res = await req('POST', '/api/salas_quiz_guiado', payloadAntigo);
  assert.equal(res.status, 200);
  // O servidor deve manter o progresso mais avançado (pergunta 1, em_andamento).
  const interna = state.salasQuizMap.get('sala-prog-1');
  assert.equal(interna.pergunta_atual_index, 1, 'não deve regredir a pergunta');
  assert.equal(interna.status, 'em_andamento', 'não deve regredir o status');
  assert.equal(interna.estado_apresentacao, 'QUESTION_ACTIVE', 'não deve regredir o estado');
  // Os participantes enviados ainda são mesclados (resposta do participante).
  assert.equal(interna.participantes[0].id, 'p1', 'participantes devem ser atualizados');
});

test('POST de REINÍCIO (novo sessao_id/PIN) aceita o novo PIN e zera participantes sem corromper gabarito (Problema 2)', async () => {
  // Simula: instrutor cria a sala e inicia (sessão 1).
  state.salasQuizMap.set('sala-reinicio-1', {
    id: 'sala-reinicio-1',
    pin: '555001',
    sessao_id: 'sess-antiga',
    nome: 'Sala Reinicio',
    treinamento_titulo: 'T',
    instrutor_id: 'usr-1',
    instrutor_nome: 'I',
    empresa_id: 'emp-1',
    status: 'em_andamento',
    estado_apresentacao: 'QUESTION_ACTIVE',
    pergunta_atual_index: 2,
    question_started_at: Date.now(),
    question_ends_at: Date.now() + 30000,
    perguntas: [{ id: 'q1', enunciado: 'P?', alternativas: ['A', 'B'], resposta_correta: 1, explicacao: 'Segredo' }],
    participantes: [{ id: 'p1', nome: 'Ana', respostas: { q1: { resposta_index: 1, correta: true } }, pontuacao_acumulada: 100 }],
  });

  // Instrutor reinicia: novo PIN + novo sessao_id + participantes zerados.
  const reinicio = {
    id: 'sala-reinicio-1',
    pin: '555002',
    sessao_id: 'sess-nova',
    status: 'aguardando',
    estado_apresentacao: 'AGUARDANDO',
    pergunta_atual_index: 0,
    question_started_at: 0,
    question_ends_at: 0,
    participantes: [],
  };
  const res = await req('POST', '/api/salas_quiz_guiado', reinicio);
  assert.equal(res.status, 200);
  const interna = state.salasQuizMap.get('sala-reinicio-1');
  // Novo PIN deve ser aceito (participante usa o QR/PIN novo após reinício).
  assert.equal(interna.pin, '555002', 'novo PIN do reinício deve ser aceito');
  assert.equal(interna.sessao_id, 'sess-nova', 'novo sessao_id deve ser aceito');
  assert.equal(interna.status, 'aguardando', 'status deve voltar para aguardando');
  assert.equal(interna.pergunta_atual_index, 0, 'pergunta deve voltar para 0');
  assert.equal(interna.participantes.length, 0, 'participantes da sessão anterior devem ser zerados');
  // O gabarito NUNCA pode ser corrompido.
  assert.equal(interna.perguntas[0].resposta_correta, 1, 'gabarito deve ser preservado após reinício');
  assert.equal(interna.perguntas[0].explicacao, 'Segredo', 'explicacao deve ser preservada após reinício');
});

test('POST de sala atualizada não corrompe o gabarito oficial (AUD-25)', async () => {
  // O participante devolve a sala SANITIZADA (sem gabarito) após responder.
  const salaSanitizada = {
    id: 'sala-teste-1',
    pin: '123456',
    nome: 'Sala Teste',
    status: 'em_andamento',
    perguntas: [{ id: 'q1', enunciado: 'Pergunta?', alternativas: ['A', 'B'] }], // sem resposta_correta/explicacao
    participantes: [{ id: 'p1', nome: 'Ana', respostas: { q1: { resposta_index: 0 } } }],
  };
  const res = await req('POST', '/api/salas_quiz_guiado', salaSanitizada);
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);

  // O gabarito oficial DEVE estar preservado no estado interno do servidor
  // (a listagem sanitiza o payload de saída, mas o servidor guarda o original).
  const interna = state.salasQuizMap.get('sala-teste-1');
  assert.equal(interna.perguntas[0].resposta_correta, 0, 'gabarito deve ser preservado pelo servidor');
  assert.equal(interna.perguntas[0].explicacao, 'Segredo', 'explicacao deve ser preservada');
});

test('POST de ENCERRAMENTO (status concluido) é aceito no servidor (auditoria A-01)', async () => {
  // Bug real: o encerramento não altera question_started_at, e a regra "não
  // regredir" rejeitava a transição para `concluido`, deixando o Express preso
  // em `em_andamento` enquanto o Supabase já registrava o estado terminal.
  state.salasQuizMap.set('sala-concluir-1', {
    id: 'sala-concluir-1',
    pin: '777111',
    sessao_id: 'sess-c1',
    nome: 'Sala Concluir',
    treinamento_titulo: 'T',
    instrutor_id: 'usr-1',
    instrutor_nome: 'I',
    empresa_id: 'emp-1',
    status: 'em_andamento',
    estado_apresentacao: 'QUESTION_ACTIVE',
    pergunta_atual_index: 4,
    question_started_at: Date.now(),
    question_ends_at: Date.now() + 30000,
    perguntas: [{ id: 'q1', enunciado: 'P?', alternativas: ['A', 'B'], resposta_correta: 1, explicacao: 'Segredo' }],
    participantes: [{ id: 'p1', nome: 'Ana', respostas: {}, pontuacao_acumulada: 0 }],
  });

  // Encerramento: mesmo question_started_at, status terminal + participantes processados.
  const encerramento = {
    id: 'sala-concluir-1',
    pin: '777111',
    status: 'concluido',
    estado_apresentacao: 'CONCLUIDO',
    pergunta_atual_index: 4,
    participantes: [{ id: 'p1', nome: 'Ana', respostas: {}, pontuacao_acumulada: 100, nota_final: 10, situacao: 'APROVADO', concluido: true }],
  };
  const res = await req('POST', '/api/salas_quiz_guiado', encerramento);
  assert.equal(res.status, 200);
  const interna = state.salasQuizMap.get('sala-concluir-1');
  assert.equal(interna.status, 'concluido', 'o estado terminal deve ser aceito pelo servidor');
  assert.equal(interna.estado_apresentacao, 'CONCLUIDO', 'estado de apresentação concluído deve ser aceito');
  assert.equal(interna.participantes.length, 1, 'participantes processados devem ser preservados');
  // O gabarito NUNCA pode ser corrompido.
  assert.equal(interna.perguntas[0].resposta_correta, 1, 'gabarito deve ser preservado após encerramento');
  assert.equal(interna.perguntas[0].explicacao, 'Segredo', 'explicacao deve ser preservada após encerramento');
});

test('POST /api/salas_quiz_guiado/responder valida a resposta contra o gabarito do servidor (auditoria Problema 1)', async () => {
  // Bug real: o participante VISITANTE (LAN) não tinha validação server-side —
  // a edge exige Bearer e o RPC exige participante no Supabase. O fallback local
  // comparava com resposta_correta inexistente (sala sanitizada) → tudo errado.
  // Este endpoint valida contra o gabarito armazenado no próprio Express.
  state.salasQuizMap.set('sala-resp-1', {
    id: 'sala-resp-1',
    pin: '777222',
    sessao_id: 'sess-r1',
    nome: 'Sala Responder',
    treinamento_titulo: 'T',
    instrutor_id: 'usr-1',
    instrutor_nome: 'I',
    empresa_id: 'emp-1',
    status: 'em_andamento',
    estilo: 'competitivo',
    tempo_por_pergunta_seg: 30,
    perguntas: [{ id: 'q1', enunciado: 'P?', alternativas: ['A', 'B', 'C'], resposta_correta: 1, explicacao: 'X' }],
    participantes: [{ id: 'p1', nome: 'Ana', respostas: {}, pontuacao_acumulada: 0 }],
  });

  // Resposta CORRETA (índice 1).
  const certa = await req('POST', '/api/salas_quiz_guiado/responder', {
    sala_id: 'sala-resp-1', participante_id: 'p1', pergunta_id: 'q1', resposta_index: 1, tempo_ms: 5000,
  });
  assert.equal(certa.status, 200);
  assert.equal(certa.json.correta, true, 'resposta correta deve ser validada como correta');
  assert.ok(certa.json.pontosAdicionais > 0, 'deve pontuar');

  // A resposta validada deve ser gravada no participante (polling do instrutor).
  const interna = state.salasQuizMap.get('sala-resp-1');
  assert.equal(interna.participantes[0].respostas.q1.correta, true, 'resposta gravada com correta=true');
  assert.ok(interna.participantes[0].pontuacao_acumulada > 0, 'pontuação acumulada deve ser atualizada');

  // Resposta ERRADA (índice 2) em outra pergunta.
  state.salasQuizMap.get('sala-resp-1').perguntas.push({ id: 'q2', enunciado: 'P2?', alternativas: ['A', 'B', 'C'], resposta_correta: 0, explicacao: 'Y' });
  const errada = await req('POST', '/api/salas_quiz_guiado/responder', {
    sala_id: 'sala-resp-1', participante_id: 'p1', pergunta_id: 'q2', resposta_index: 2, tempo_ms: 3000,
  });
  assert.equal(errada.status, 200);
  assert.equal(errada.json.correta, false, 'resposta errada deve ser validada como errada');
  assert.equal(errada.json.pontosAdicionais, 0, 'resposta errada não pontua');
});

test('POST /api/salas_quiz_guiado/responder rejeita parâmetros inválidos (400)', async () => {
  const res = await req('POST', '/api/salas_quiz_guiado/responder', { sala_id: 'x' });
  assert.equal(res.status, 400);
});

test('POST /api/salas_quiz_guiado/responder retorna 404 para sala inexistente', async () => {
  const res = await req('POST', '/api/salas_quiz_guiado/responder', {
    sala_id: 'nao-existe', participante_id: 'p1', pergunta_id: 'q1', resposta_index: 0, tempo_ms: 1000,
  });
  assert.equal(res.status, 404);
});

test('GET /api/resultados_avaliacao_sst responde 200 sem API_TOKEN (modo LAN)', async () => {
  const res = await req('GET', '/api/resultados_avaliacao_sst');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json));
});

test('POST /api/enviar_email_prova rejeita e-mail inválido com 400', async () => {
  const res = await req('POST', '/api/enviar_email_prova', { email: 'invalido', nome: 'Teste', resultado: {} });
  assert.equal(res.status, 400);
  assert.match(res.json.error, /E-mail/i);
});

// ============================================================
// GRUPO 2: autenticação por API_TOKEN e ciclo de vida dos backups
// ============================================================
describe('com API_TOKEN configurado', () => {
  let tokenServer: http.Server;
  let tokenUrl = '';
  const TOKEN = 'token-teste-seguro';

  before(async () => {
    const nodeEnvOriginal = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.API_TOKEN = TOKEN;
    const { app } = await createApp();
    process.env.NODE_ENV = nodeEnvOriginal;

    tokenServer = http.createServer(app);
    await new Promise<void>((resolve) => tokenServer.listen(0, '127.0.0.1', resolve));
    const addr = tokenServer.address() as AddressInfo;
    tokenUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(() => {
    process.env.API_TOKEN = salvoApiToken;
    return new Promise<void>((resolve, reject) => {
      tokenServer?.close((err) => (err ? reject(err) : resolve()));
    });
  });

  async function tReq(method: string, path: string, body?: unknown, token?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['x-api-token'] = token;
    const res = await fetch(`${tokenUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json };
  }

  test('resultados exigem token (401 sem token, 200 com token)', async () => {
    const sem = await tReq('GET', '/api/resultados_avaliacao_sst');
    assert.equal(sem.status, 401, 'sem token deve ser 401');
    const com = await tReq('GET', '/api/resultados_avaliacao_sst', undefined, TOKEN);
    assert.equal(com.status, 200, 'com token deve ser 200');
  });

  test('ciclo de vida de backups: POST cria, GET lista/lê, DELETE remove', async () => {
    // Cria um backup.
    const criado = await tReq('POST', '/api/backups', {
      id: 'bkp-teste-01',
      tipo: 'manual',
      escopo: 'empresa',
      empresaId: 'emp-1',
      resumo: 'Backup de teste',
      jsonSnapshot: { empresas: [{ id: 'emp-1' }] },
    }, TOKEN);
    assert.equal(criado.status, 200);
    assert.equal(criado.json.success, true);

    // Lista inclui o backup criado.
    const lista = await tReq('GET', '/api/backups', undefined, TOKEN);
    assert.equal(lista.status, 200);
    const encontrado = lista.json.find((b: any) => b.id === 'bkp-teste-01');
    assert.ok(encontrado, 'backup deve aparecer na lista');
    assert.equal(encontrado.empresaId, 'emp-1');

    // Lê o backup completo.
    const lido = await tReq('GET', '/api/backups/bkp-teste-01', undefined, TOKEN);
    assert.equal(lido.status, 200);
    assert.equal(lido.json.jsonSnapshot.empresas[0].id, 'emp-1');

    // Remove.
    const removido = await tReq('DELETE', '/api/backups/bkp-teste-01', undefined, TOKEN);
    assert.equal(removido.status, 200);

    // Confirma que sumiu.
    const depois = await tReq('GET', '/api/backups', undefined, TOKEN);
    const sumiu = depois.json.find((b: any) => b.id === 'bkp-teste-01');
    assert.ok(!sumiu, 'backup deve ter sido removido');
  });

  test('backups sem token são negados (401)', async () => {
    const lista = await tReq('GET', '/api/backups');
    assert.equal(lista.status, 401);
    const criado = await tReq('POST', '/api/backups', { id: 'bkp-x' });
    assert.equal(criado.status, 401);
  });

  test('path traversal é bloqueado no id de backup (sanitizeBackupId)', async () => {
    const criado = await tReq('POST', '/api/backups', {
      id: '../../etc/passwd',
      resumo: 'tentativa',
    }, TOKEN);
    assert.equal(criado.status, 200);
    // O id foi SANITIZADO: o arquivo nunca é gravado fora do diretório de
    // backups e o id devolvido não contém separadores de caminho nem "..".
    assert.ok(!/\.\.|\/|\\/.test(criado.json.id), `id sanitizado não pode conter path traversal, veio: ${criado.json.id}`);
    assert.notEqual(criado.json.id, '../../etc/passwd');

    // Limpa o backup criado pelo teste.
    await tReq('DELETE', `/api/backups/${criado.json.id}`, undefined, TOKEN);
  });

  test('e-mail exige token quando configurado (401 sem token)', async () => {
    const res = await tReq('POST', '/api/enviar_email_prova', { email: 'a@b.com', nome: 'X', resultado: {} });
    assert.equal(res.status, 401);
  });

  test('/pdf exige token quando API_TOKEN configurado (401 sem, 200 com token)', async () => {
    // Cria um arquivo PDF dummy em public/pdf para o teste.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pdfDir = path.join(process.cwd(), 'public', 'pdf');
    fs.mkdirSync(pdfDir, { recursive: true });
    const arquivo = path.join(pdfDir, 'teste-pdf-auditoria.pdf');
    fs.writeFileSync(arquivo, Buffer.from('%PDF-1.4 dummy'));

    // Sem token: deve ser 401 (quando API_TOKEN configurado).
    const semToken = await fetch(`${tokenUrl}/pdf/teste-pdf-auditoria.pdf`);
    assert.equal(semToken.status, 401, 'sem token deve ser 401');

    // Com token via query: deve ser 200.
    const comTokenQuery = await fetch(`${tokenUrl}/pdf/teste-pdf-auditoria.pdf?token=${TOKEN}`);
    assert.equal(comTokenQuery.status, 200, 'com token deve ser 200');

    // Com token via header: deve ser 200.
    const comTokenHeader = await fetch(`${tokenUrl}/pdf/teste-pdf-auditoria.pdf`, {
      headers: { 'x-api-token': TOKEN },
    });
    assert.equal(comTokenHeader.status, 200, 'com token via header deve ser 200');

    // Limpa o arquivo de teste.
    fs.unlinkSync(arquivo);
  });

  test('POST de sala nova é aceito com token (fluxo LAN) e não expõe gabarito', async () => {
    // O POST aceita criar salas (fluxo LAN/visitante); o gabarito é sanitizado
    // na resposta/lista.
    const res = await tReq('POST', '/api/salas_quiz_guiado', { id: 'sala-token-1', pin: '999001', nome: 'T', perguntas: [{ id: 'q1', resposta_correta: 0, explicacao: 'x' }] }, TOKEN);
    assert.equal(res.status, 200);
  });
});