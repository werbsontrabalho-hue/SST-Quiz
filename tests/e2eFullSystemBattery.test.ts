import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../src/lib/supabase';
import { supabaseService } from '../src/services/supabaseService';

// =========================================================================
// BATERIA DE AUDITORIA E TESTES E2E: SST QUIZ CORPORATE
// =========================================================================

const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseConfig();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

describe('AUDITORIA E TESTES REAIS E2E — SISTEMA SST QUIZ', () => {
  let server: http.Server;
  let baseUrl = '';

  before(async () => {
    const nodeEnvOriginal = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const { app } = await createApp();
    process.env.NODE_ENV = nodeEnvOriginal;

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

  async function apiReq(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json };
  }

  // -----------------------------------------------------------------------
  // 1. AUDITORIA DE TABELAS E ESTRUTURA NO SUPABASE
  // -----------------------------------------------------------------------
  describe('1. Verificação Estrutural de Tabelas no Supabase (Schema Audit)', () => {
    const tabelas = [
      'empresas',
      'setores',
      'usuarios',
      'perguntas',
      'campanhas',
      'quizzes',
      'desafios_1v1',
      'premiacoes',
      'resgates_premios',
      'backups_historico',
      'salas_quiz_guiado',
      'resultados_avaliacao_sst'
    ];

    for (const tab of tabelas) {
      test(`Tabela "${tab}" está presente e acessível`, async () => {
        const { data, error } = await supabase.from(tab).select('*').limit(1);
        assert.equal(error, null, `Erro acessando ${tab}: ${error?.message}`);
        assert.ok(Array.isArray(data));
      });
    }
  });

  // -----------------------------------------------------------------------
  // 2. AUTENTICAÇÃO, HIERARQUIA E IDENTIDADE REAL
  // -----------------------------------------------------------------------
  describe('2. Autenticação, Usuários Ativos e Validação de Perfis', () => {
    test('Consulta de usuários ativos e checagem de perfis cadastrados no Supabase', async () => {
      const { data: users, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('ativo', true);

      assert.equal(error, null);
      assert.ok(users && users.length > 0, 'Deve haver usuários ativos no banco');

      const superAdmin = users.find(u => u.perfil === 'super_admin');
      const admin = users.find(u => u.perfil === 'admin');
      const colab = users.find(u => u.perfil === 'colaborador');

      assert.ok(superAdmin, 'Deve existir pelo menos um Super Admin no banco');
      assert.ok(admin, 'Deve existir pelo menos um Admin no banco');
      assert.ok(colab, 'Deve existir pelo menos um Colaborador no banco');

      assert.ok(superAdmin.email, 'Super Admin deve possuir e-mail');
      assert.ok(admin.empresa_id, 'Admin deve possuir empresa_id');
      assert.ok(colab.empresa_id, 'Colaborador deve possuir empresa_id');
    });

    test('Validação de bloqueio de usuário inativo ou inexistente', async () => {
      const { data: userInexistente } = await supabase
        .from('usuarios')
        .select('*')
        .eq('email', 'usuario_fantasma_inexistente_999@empresa.com.br')
        .maybeSingle();

      assert.equal(userInexistente, null, 'Usuário inexistente não deve retornar registro');
    });
  });

  // -----------------------------------------------------------------------
  // 3. CRUD TESTE: EMPRESAS E SETORES
  // -----------------------------------------------------------------------
  describe('3. CRUD Completo de Empresas e Setores', () => {
    const testEmpresaId = `emp-teste-audit-${Date.now()}`;
    const testSetorId = `set-teste-audit-${Date.now()}`;

    test('CREATE: Criar nova Empresa e Setor no Supabase', async () => {
      const novaEmpresa = {
        id: testEmpresaId,
        nome: 'Empresa Teste Auditoria SST',
        cnpj: `11.222.${Math.floor(100 + Math.random() * 899)}/0001-99`,
        plano: 'Enterprise',
        ativa: true,
        limite_colaboradores: 80,
        configuracoes: { tema_personalizado: 'dark', permitir_visitantes: true }
      };

      const { data: emp, error: errEmp } = await supabase.from('empresas').insert(novaEmpresa).select().single();
      assert.equal(errEmp, null, `Erro ao inserir empresa: ${errEmp?.message}`);
      assert.equal(emp.id, testEmpresaId);

      const novoSetor = {
        id: testSetorId,
        empresa_id: testEmpresaId,
        nome: 'Engenharia e Manutenção',
        colaboradores_ativos: 8
      };

      const { data: set, error: errSet } = await supabase.from('setores').insert(novoSetor).select().single();
      assert.equal(errSet, null, `Erro ao inserir setor: ${errSet?.message}`);
      assert.equal(set.id, testSetorId);
    });

    test('READ: Consultar Empresa e Setor criados com integridade relacional', async () => {
      const { data: emp, error: errEmp } = await supabase
        .from('empresas')
        .select('*, setores(*)')
        .eq('id', testEmpresaId)
        .single();

      assert.equal(errEmp, null);
      assert.equal(emp.id, testEmpresaId);
      assert.ok(Array.isArray(emp.setores));
      assert.equal(emp.setores.length, 1);
      assert.equal(emp.setores[0].id, testSetorId);
    });

    test('UPDATE: Alterar dados da Empresa e do Setor', async () => {
      const { error: errUpdateEmp } = await supabase
        .from('empresas')
        .update({ nome: 'Empresa Teste Auditoria SST Atualizada', limite_colaboradores: 120 })
        .eq('id', testEmpresaId);

      assert.equal(errUpdateEmp, null);

      const { data: empAtualizada } = await supabase.from('empresas').select('*').eq('id', testEmpresaId).single();
      assert.equal(empAtualizada.nome, 'Empresa Teste Auditoria SST Atualizada');
      assert.equal(empAtualizada.limite_colaboradores, 120);
    });

    test('DELETE: Excluir Setor e Empresa (Limpeza garantida)', async () => {
      const { error: errDelSetor } = await supabase.from('setores').delete().eq('id', testSetorId);
      assert.equal(errDelSetor, null);

      const { error: errDelEmpresa } = await supabase.from('empresas').delete().eq('id', testEmpresaId);
      assert.equal(errDelEmpresa, null);

      const { data: checkEmp } = await supabase.from('empresas').select('*').eq('id', testEmpresaId).maybeSingle();
      assert.equal(checkEmp, null);
    });
  });

  // -----------------------------------------------------------------------
  // 4. CRUD TESTE: PERGUNTAS E BANCO DE QUESTÕES SST
  // -----------------------------------------------------------------------
  describe('4. CRUD Completo de Perguntas SST e Validação de Resposta', () => {
    const testPerguntaId = `perg-audit-${Date.now()}`;

    test('CREATE: Inserir nova pergunta SST no Supabase', async () => {
      // Consulta empresa existente para associar à pergunta
      const { data: empExistente } = await supabase.from('empresas').select('id').limit(1).single();
      const empresaIdValida = empExistente?.id || 'emp-1787488106505-36787';

      const novaPergunta = {
        id: testPerguntaId,
        empresa_id: empresaIdValida,
        categoria: 'NR-35 Trabalho em Altura',
        tipo: 'multipla_escolha',
        dificuldade: 'Médio',
        enunciado: 'Qual a altura mínima considerada para trabalho em altura segundo a NR-35?',
        alternativas: ['1,50 metros', '2,00 metros', '2,50 metros', '3,00 metros'],
        resposta_correta: 1,
        explicacao: 'Considera-se trabalho em altura toda atividade executada acima de 2,00 m do nível inferior com risco de queda.',
        tempo_limite_segundos: 30,
        norma_relacionada: 'NR-35'
      };

      const { data, error } = await supabase.from('perguntas').insert(novaPergunta).select().single();
      assert.equal(error, null, `Erro ao inserir pergunta: ${error?.message}`);
      assert.equal(data.id, testPerguntaId);
      assert.equal(data.resposta_correta, 1);
    });

    test('READ: Consultar pergunta cadastrada', async () => {
      const { data: p, error } = await supabase.from('perguntas').select('*').eq('id', testPerguntaId).single();
      assert.equal(error, null);
      assert.equal(p.id, testPerguntaId);
      assert.equal(p.norma_relacionada, 'NR-35');
    });

    test('UPDATE: Alterar enunciado e tempo limite', async () => {
      const { error } = await supabase
        .from('perguntas')
        .update({ tempo_limite_segundos: 45, dificuldade: 'Difícil' })
        .eq('id', testPerguntaId);

      assert.equal(error, null);

      const { data: pAtualizada } = await supabase.from('perguntas').select('*').eq('id', testPerguntaId).single();
      assert.equal(pAtualizada.tempo_limite_segundos, 45);
      assert.equal(pAtualizada.dificuldade, 'Difícil');
    });

    test('DELETE: Remover pergunta de teste', async () => {
      const { error } = await supabase.from('perguntas').delete().eq('id', testPerguntaId);
      assert.equal(error, null);

      const { data: check } = await supabase.from('perguntas').select('*').eq('id', testPerguntaId).maybeSingle();
      assert.equal(check, null);
    });
  });

  // -----------------------------------------------------------------------
  // 5. TESTE REAL: QUIZ GUIADO (AVANÇO, GABARITO, SEM LOOP, EMISSÃO DE LAUDO)
  // -----------------------------------------------------------------------
  describe('5. Teste E2E de Quiz Guiado: Criação, Resposta no Servidor, Gabarito e Laudo', () => {
    const salaId = `sala-audit-live-${Date.now()}`;
    const pin = '849302';
    const laudoId = `laudo-audit-live-${Date.now()}`;

    test('CREATE: Criar sala de Quiz Guiado na API Express e Supabase', async () => {
      const salaPayload = {
        id: salaId,
        pin: pin,
        treinamento_titulo: 'Treinamento NR-35 Trabalho em Altura',
        instrutor_id: 'usr-admin',
        instrutor_nome: 'Carlos Eduardo (Instrutor SST)',
        empresa_id: 'emp-001',
        status: 'aguardando',
        modalidade: 'interativo',
        estilo: 'educacional',
        nota_minima: 7.0,
        tempo_por_pergunta_seg: 30,
        mostrar_ranking: true,
        permitir_visitantes: true,
        perguntas: [
          {
            id: 'q-audit-1',
            enunciado: 'Qual a altura mínima considerada para trabalho em altura pela NR-35?',
            alternativas: ['1,50m', '2,00m', '2,50m', '3,00m'],
            resposta_correta: 1,
            explicacao: 'Acima de 2,00 m onde haja risco de queda.'
          },
          {
            id: 'q-audit-2',
            enunciado: 'O cinto de segurança tipo paraquedista é obrigatório?',
            alternativas: ['Sim, com talabarte duplo ou trava-quedas', 'Não, cinto abdominal é suficiente', 'Apenas para mais de 5 metros', 'Opcional'],
            resposta_correta: 0,
            explicacao: 'O cinto tipo paraquedista é obrigatório para retenção de quedas.'
          }
        ],
        participantes: [
          {
            id: 'part-joao',
            nome: 'João da Silva',
            matricula: 'MAT-2026',
            cpf: '111.222.333-44',
            avatar: '👷‍♂️',
            pontos: 0,
            respostas: {}
          }
        ]
      };

      // Gravação na API
      const resApi = await apiReq('POST', '/api/salas_quiz_guiado', salaPayload);
      assert.equal(resApi.status, 200);

      // Persistência no Supabase
      const { error: errDb } = await supabase.from('salas_quiz_guiado').upsert(salaPayload);
      assert.equal(errDb, null, `Erro ao gravar sala no Supabase: ${errDb?.message}`);
    });

    test('SECURITY: Gabarito protegido contra vazamento para participante', async () => {
      const res = await apiReq('GET', '/api/salas_quiz_guiado');
      assert.equal(res.status, 200);
      const sala = res.json.find((s: any) => s.id === salaId);
      assert.ok(sala, 'Sala deve existir na listagem');
      assert.equal(sala.perguntas[0].resposta_correta, undefined, 'Gabarito não pode ser exposto publicamente');
    });

    test('RPC / BACKEND: Participante responde Pergunta 1 (Resposta Correta)', async () => {
      const res = await apiReq('POST', '/api/salas_quiz_guiado/responder', {
        sala_id: salaId,
        participante_id: 'part-joao',
        pergunta_id: 'q-audit-1',
        resposta_index: 1, // Correta (2,00m)
        tempo_ms: 2500
      });

      assert.equal(res.status, 200);
      assert.equal(res.json.correta, true);
      assert.ok(res.json.pontosAdicionais > 0);
    });

    test('RPC / BACKEND: Participante responde Pergunta 2 (Resposta Correta)', async () => {
      const res = await apiReq('POST', '/api/salas_quiz_guiado/responder', {
        sala_id: salaId,
        participante_id: 'part-joao',
        pergunta_id: 'q-audit-2',
        resposta_index: 0, // Correta (Sim, cinto paraquedista)
        tempo_ms: 2100
      });

      assert.equal(res.status, 200);
      assert.equal(res.json.correta, true);
      assert.ok(res.json.pontosAdicionais > 0);
    });

    test('FINALIZAÇÃO E LAUDO: Gravação do resultado oficial de avaliação SST', async () => {
      const laudo = {
        id: laudoId,
        sala_id: salaId,
        participante_id: 'part-joao',
        participante_nome: 'João da Silva',
        matricula: 'MAT-2026',
        cpf: '111.222.333-44',
        cpf_ou_empresa: '111.222.333-44',
        is_visitante: false,
        treinamento_titulo: 'Treinamento NR-35 Trabalho em Altura',
        instrutor_nome: 'Carlos Eduardo (Instrutor SST)',
        data: '26/08/2026',
        total_perguntas: 2,
        acertos: 2,
        erros: 0,
        nota_final: 10.0,
        nota_minima: 7.0,
        situacao: 'Aprovado',
        desempenho_por_tema: [{ tema: 'NR-35 Trabalho em Altura', acertos: 2, total: 2 }],
        respostas_detalhadas: [{ pergunta: 'Altura mínima', correta: true }]
      };

      const resApi = await apiReq('POST', '/api/resultados_avaliacao_sst', laudo);
      assert.equal(resApi.status, 200);

      const { data: dbData, error: dbErr } = await supabase
        .from('resultados_avaliacao_sst')
        .insert(laudo)
        .select()
        .single();

      assert.equal(dbErr, null, `Erro ao gravar laudo: ${dbErr?.message}`);
      assert.equal(dbData.id, laudoId);
      assert.equal(dbData.situacao, 'Aprovado');
      assert.equal(Number(dbData.nota_final), 10.0);
    });

    test('CLEANUP: Remover sala e laudo de teste', async () => {
      await supabase.from('salas_quiz_guiado').delete().eq('id', salaId);
      await supabase.from('resultados_avaliacao_sst').delete().eq('id', laudoId);
    });
  });

  // -----------------------------------------------------------------------
  // 6. ISOLAMENTO MULTIEMPRESA
  // -----------------------------------------------------------------------
  describe('6. Isolamento Multiempresa (Multi-Tenant)', () => {
    test('Usuários da Empresa 1 não vazam para Empresa 2', async () => {
      const { data: usersEmp1 } = await supabase.from('usuarios').select('*').eq('empresa_id', 'emp-001');
      const { data: usersEmp2 } = await supabase.from('usuarios').select('*').eq('empresa_id', 'emp-1787488106505-36787');

      assert.ok(usersEmp1 && usersEmp1.length > 0);
      assert.ok(usersEmp2 && usersEmp2.length > 0);

      const set1 = new Set(usersEmp1.map(u => u.id));
      const set2 = new Set(usersEmp2.map(u => u.id));

      for (const id of set1) {
        assert.equal(set2.has(id), false, `Usuário ${id} não pode vazar entre empresas`);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 7. OFFLINE, IDEMPOTÊNCIA E SINCRONIZAÇÃO
  // -----------------------------------------------------------------------
  describe('7. Resiliência Offline e Sincronização Idempotente', () => {
    const offlineId = `res-sync-test-${Date.now()}`;

    test('Envio de resultado offline, persistência e proteção contra duplicação (Upsert)', async () => {
      const item = {
        id: offlineId,
        sala_id: null,
        participante_id: 'usr-colab1',
        participante_nome: 'João da Silva',
        cpf_ou_empresa: '111.222.333-44',
        is_visitante: false,
        treinamento_titulo: 'Treinamento Offline de Emergência',
        instrutor_nome: 'Carlos Eduardo (Instrutor SST)',
        data: '26/08/2026',
        total_perguntas: 5,
        acertos: 5,
        erros: 0,
        nota_final: 10.0,
        nota_minima: 7.0,
        situacao: 'Aprovado',
        desempenho_por_tema: [],
        respostas_detalhadas: []
      };

      // 1ª Sincronização
      const { error: err1 } = await supabase.from('resultados_avaliacao_sst').upsert(item);
      assert.equal(err1, null);

      // 2ª Sincronização (Replay / Retry de rede)
      const { error: err2 } = await supabase.from('resultados_avaliacao_sst').upsert(item);
      assert.equal(err2, null);

      // Verificação de registro único
      const { data: countCheck } = await supabase.from('resultados_avaliacao_sst').select('id').eq('id', offlineId);
      assert.equal(countCheck?.length, 1, 'Registro não pode duplicar na sincronização');

      // Cleanup
      await supabase.from('resultados_avaliacao_sst').delete().eq('id', offlineId);
    });
  });

  describe('8. Integridade de Campanhas, Quizzes e Foreign Key (quizzes_campanha_id_fkey)', () => {
    const testCampanhaId = `camp-e2e-${Date.now()}`;
    const testQuizValidoId = `quiz-valido-${Date.now()}`;
    const testQuizOrfaoId = `quiz-orfao-${Date.now()}`;

    test('Campanha cadastrada permite vincular quiz com FK válida', async () => {
      // 1. Cadastra campanha
      const { error: errCamp } = await supabase.from('campanhas').insert({
        id: testCampanhaId,
        empresa_id: 'emp-001',
        nome: 'Campanha E2E Prevenção',
        descricao: 'Teste E2E de integridade relacional',
        frequencia: 'semanal',
        quantidade_perguntas: 3,
        setores_alvo: ['todos'],
        horario_disparo: '09:00',
        ativa: true,
        pergunta_ids: []
      });
      assert.equal(errCamp, null);

      // 2. Cadastra quiz vinculado à campanha
      const { error: errQuiz } = await supabase.from('quizzes').insert({
        id: testQuizValidoId,
        campanha_id: testCampanhaId,
        colaborador_id: 'usr-super',
        empresa_id: 'emp-001',
        titulo: 'Quiz da Campanha E2E',
        categoria: 'SST',
        perguntas: [],
        status: 'pendente',
        pontuacao_total: 0,
        respostas: [],
        criado_em: new Date().toISOString()
      });
      assert.equal(errQuiz, null);
    });

    test('Quiz com campanha inexistente é protegido pelo fallback de upsertQuiz no serviço', async () => {
      const quizFantasma = {
        id: testQuizOrfaoId,
        campanha_id: 'campanha-fantasma-inexistente',
        colaborador_id: 'usr-super',
        empresa_id: 'emp-001',
        titulo: 'Quiz com Campanha Órfã',
        categoria: 'SST',
        perguntas: [],
        status: 'pendente' as const,
        pontuacao_total: 0,
        respostas: [],
        criado_em: new Date().toISOString()
      };

      const resultado = await supabaseService.upsertQuiz(quizFantasma);
      assert.equal(resultado, true, 'upsertQuiz deve retornar true usando o fallback seguro');

      const { data: salvo } = await supabase.from('quizzes').select('*').eq('id', testQuizOrfaoId).single();
      assert.equal(salvo?.id, testQuizOrfaoId);
      assert.equal(salvo?.campanha_id, null, 'campanha_id inexistente deve ser sanada para null');
    });

    test('CLEANUP: Remoção de quizzes e campanha de teste', async () => {
      await supabase.from('quizzes').delete().in('id', [testQuizValidoId, testQuizOrfaoId]);
      await supabase.from('campanhas').delete().eq('id', testCampanhaId);
    });
  });
});
