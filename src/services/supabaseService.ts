import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { normalizePergunta } from '../utils/questionHelpers';
import { 
  Empresa, 
  Setor, 
  Usuario, 
  Pergunta, 
  Campanha, 
  QuizSessao, 
  Desafio1v1, 
  Premiacao,
  ResgatePremio
} from '../types';

// ============================================================
// supabaseService — "CÉREBRO" DA COMUNICAÇÃO COM O SUPABASE
// ============================================================
// Camada de serviço que faz toda a persistência na nuvem: SELECT
// (busca), INSERT/UPDATE via upsert (grava ou atualiza) e DELETE.
// Cada função aqui é chamada pelas telas do app para manter os
// dados do Supabase em sincronia com os dados locais.

// SEGURANÇA (auditoria V-017): remove recursivamente o campo "senha" (texto
// puro) de qualquer objeto/array antes de gravar no Supabase. Senhas jamais
// devem persistir na nuvem — autenticação é feita pelo Supabase Auth.
function removerSenha(obj: any): any {
  if (Array.isArray(obj)) return obj.map(removerSenha);
  if (obj && typeof obj === 'object') {
    const copy: any = {};
    for (const k of Object.keys(obj)) {
      if (k === 'senha') continue;
      copy[k] = removerSenha(obj[k]);
    }
    return copy;
  }
  return obj;
}

// Cabeçalho opcional de autenticação para as rotas do servidor Express
// (LAN). Quando o administrador definir VITE_API_TOKEN no build, ele é
// enviado como x-api-token; caso contrário, o servidor mantém o modo LAN
// aberto (isAuthorized retorna true sem token).
function headersComToken(extra?: Record<string, string>): Record<string, string> {
  const apiToken = (import.meta.env.VITE_API_TOKEN as string | undefined) || '';
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...(extra || {}) };
  if (apiToken) h['x-api-token'] = apiToken;
  return h;
}

// ============================================================
// NORMALIZAÇÃO DE PAYLOAD PARA O SUPABASE ("poison fields")
// ============================================================// A auditoria forense (AUD-11) encontrou colunas que o frontend envia mas
// que NÃO existiam no banco, fazendo o upsert falhar inteiro (erro 42703).
// A migration 009 adicionou essas colunas; este sanitizador garante que o
// payload enviado sempre esteja compatível com o schema real do Supabase:
//   - converte nota mínima de base-100 (ex.: 70) para base-10 (7.0), pois o
//     banco tem CHECK (nota_minima >= 0 AND nota_minima <= 10);
//   - remove campos que existem apenas no tipo local e não devem persistir.

// Normaliza uma sala de Quiz Guiado antes do upsert no Supabase.
function normalizarSalaParaSupabase(sala: any): any {
  if (!sala || typeof sala !== 'object') return sala;
  const copia: any = { ...sala };
  // Nota mínima: o app usa base-100 (70 = 70%); o banco usa base-10 (7.0).
  const nota = copia.nota_minima ?? copia.nota_minima_aprovacao ?? 7.0;
  const numNota = Number(nota);
  copia.nota_minima = !isNaN(numNota) && numNota > 10 ? Math.round((numNota / 10) * 10) / 10 : numNota;
  if (copia.nota_minima_aprovacao !== undefined) {
    copia.nota_minima_aprovacao = Number(copia.nota_minima_aprovacao) > 10
      ? Number(copia.nota_minima_aprovacao)
      : copia.nota_minima;
  }
  // Tempo por pergunta: garante um valor inteiro positivo na coluna canônica.
  const tempo = Number(copia.tempo_por_pergunta_seg ?? copia.tempo_por_pergunta ?? 30);
  copia.tempo_por_pergunta_seg = isNaN(tempo) || tempo <= 0 ? 30 : Math.round(tempo);
  if (copia.tempo_por_pergunta !== undefined) {
    copia.tempo_por_pergunta = copia.tempo_por_pergunta_seg;
  }
  return copia;
}

// Colunas canônicas suportadas na tabela resultados_avaliacao_sst do Supabase.
// Garante que campos extras do app (como codigo_documento, sessao_id, etc)
// não causem erro PGRST204 no PostgREST.
const COLUNAS_SUPORTADAS_RESULTADOS_SST = new Set([
  'id',
  'sala_id',
  'participante_nome',
  'participante_id',
  'cpf_ou_empresa',
  'is_visitante',
  'treinamento_titulo',
  'instrutor_nome',
  'data',
  'total_perguntas',
  'acertos',
  'erros',
  'nota_final',
  'nota_minima',
  'situacao',
  'desempenho_por_tema',
  'respostas_detalhadas',
  'matricula',
  'cpf',
  'cargo',
  'setor_nome',
  'email',
  'sala_nome',
  'data_finalizacao',
  'porcentagem_acertos',
  'questoes_corretas',
  'total_questoes',
  'nota_minima_aprovacao'
]);

function normalizarResultadoParaSupabase(resultado: any): any {
  if (!resultado || typeof resultado !== 'object') return resultado;
  const copia: any = { ...resultado };
  if (copia.nota_minima_aprovacao === undefined && copia.nota_minima !== undefined) {
    const n = Number(copia.nota_minima);
    copia.nota_minima_aprovacao = !isNaN(n) ? Math.round(n * 10) : undefined;
  }
  if (copia.nota_final !== undefined && copia.nota_minima === undefined) {
    copia.nota_minima = Number(copia.nota_final);
  }

  // Ajusta a propriedade 'situacao' para atender à restrição de validação CHECK
  // (resultados_avaliacao_sst_situacao_check) no Supabase, que exige estritamente 'Aprovado' ou 'Reprovado'.
  if (copia.situacao !== undefined && copia.situacao !== null) {
    const sitUpper = String(copia.situacao).toUpperCase();
    if (sitUpper.includes('APROVAD') && !sitUpper.includes('NAO') && !sitUpper.includes('NÃO')) {
      copia.situacao = 'Aprovado';
    } else {
      copia.situacao = 'Reprovado';
    }
  } else if (copia.nota_final !== undefined && copia.nota_minima !== undefined) {
    copia.situacao = Number(copia.nota_final) >= Number(copia.nota_minima) ? 'Aprovado' : 'Reprovado';
  }

  // Sanitiza para manter estritamente as colunas existentes na tabela
  const sanitizado: any = {};
  for (const k of Object.keys(copia)) {
    if (COLUNAS_SUPORTADAS_RESULTADOS_SST.has(k) && copia[k] !== undefined) {
      sanitizado[k] = copia[k];
    }
  }
  return sanitizado;
}

function normalizarResultadoDoSupabase(item: any): any {
  if (!item || typeof item !== 'object') return item;
  const copia: any = { ...item };
  if (copia.situacao) {
    const sitUpper = String(copia.situacao).toUpperCase();
    if (sitUpper.includes('APROVAD') && !sitUpper.includes('NAO') && !sitUpper.includes('NÃO')) {
      copia.situacao = 'APROVADO';
    } else {
      copia.situacao = 'NAO_APROVADO';
    }
  }
  return copia;
}

export const supabaseService = {
  // --- CARREGAR TODOS OS DADOS DO SUPABASE ---
  // Busca (SELECT) de TODAS as tabelas do banco de uma única vez,
  // em paralelo (Promise.all), e retorna um objeto com cada coleção.
  // Usada na inicialização do app para carregar o estado da nuvem.
  async fetchAllData(): Promise<{
    empresas?: Empresa[];
    setores?: Setor[];
    usuarios?: Usuario[];
    perguntas?: Pergunta[];
    campanhas?: Campanha[];
    quizzes?: QuizSessao[];
    desafios?: Desafio1v1[];
    premiacoes?: Premiacao[];
    resgates?: ResgatePremio[];
    backupsHistorico?: any[];
    salasQuizGuiado?: any[];
    resultadosAvaliacaoSST?: any[];
    hasData: boolean;
  }> {
    if (!isSupabaseConfigured()) {
      return { hasData: false };
    }

    const client = getSupabaseClient();
    if (!client) return { hasData: false };

    try {
      // Busca todas as tabelas em paralelo para evitar dependências falsas no boot
      const [
        { data: empresasData, error: empErr },
        { data: setoresData, error: setErr },
        resUsuarios,
        { data: perguntasData, error: prgErr },
        { data: campanhasData, error: cmpErr },
        { data: quizzesData, error: qzErr },
        { data: desafiosData, error: dsfErr },
        { data: premiacoesData, error: prmErr },
        { data: resgatesData, error: rsgErr },
        { data: backupsData, error: bkpErr },
        { data: salasData, error: salasErr },
        { data: resultadosData, error: resErr }
      ] = await Promise.all([
        client.from('empresas').select('*'),
        client.from('setores').select('*'),
        client.from('usuarios').select('*'),
        client.from('perguntas').select('*'),
        client.from('campanhas').select('*'),
        client.from('quizzes').select('*'),
        client.from('desafios_1v1').select('*'),
        client.from('premiacoes').select('*'),
        client.from('resgates_premios').select('*'),
        client.from('backups_historico').select('*'),
        client.from('salas_quiz_guiado').select('*'),
        client.from('resultados_avaliacao_sst').select('*')
      ]);

      let usuariosData = resUsuarios.data;
      let usrErr = resUsuarios.error;

      // Fallback: se a busca falhar, tenta novamente na tabela usuarios
      if (usrErr || !usuariosData || usuariosData.length === 0) {
        const { data: directUsers, error: dErr } = await client
          .from('usuarios')
          .select('*');
        if (!dErr && directUsers && directUsers.length > 0) {
          usuariosData = directUsers;
          usrErr = null;
        }
      }

      if (empErr || setErr || usrErr || prgErr || cmpErr || qzErr || dsfErr || prmErr || rsgErr || bkpErr || salasErr || resErr) {
        console.warn('Sub-erros ao buscar dados no Supabase:', { empErr, setErr, usrErr, prgErr, cmpErr, qzErr, dsfErr, prmErr, rsgErr, bkpErr, salasErr, resErr });
      }

      const perguntasNorm = (perguntasData as Pergunta[] || []).map(normalizePergunta);
      const quizzesNorm = (quizzesData as QuizSessao[] || []).map(q => ({
        ...q,
        perguntas: Array.isArray(q.perguntas) ? q.perguntas.map(normalizePergunta) : q.perguntas
      }));
      const desafiosNorm = (desafiosData as Desafio1v1[] || []).map(d => ({
        ...d,
        perguntas: Array.isArray(d.perguntas) ? d.perguntas.map(normalizePergunta) : d.perguntas
      }));
      const salasNorm = (salasData as any[] || []).map(s => ({
        ...s,
        perguntas: Array.isArray(s.perguntas) ? s.perguntas.map(normalizePergunta) : s.perguntas
      }));

      // A nuvem é considerada populada se QUALQUER uma das tabelas essenciais contiver dados
      const hasData = Boolean(
        (empresasData && empresasData.length > 0) ||
        (usuariosData && usuariosData.length > 0) ||
        (perguntasData && perguntasData.length > 0) ||
        (quizzesData && quizzesData.length > 0) ||
        (salasData && salasData.length > 0) ||
        (resultadosData && resultadosData.length > 0)
      );

      return {
        empresas: empresasData as Empresa[] || undefined,
        setores: setoresData as Setor[] || undefined,
        usuarios: usuariosData as Usuario[] || undefined,
        perguntas: perguntasNorm || undefined,
        campanhas: campanhasData as Campanha[] || undefined,
        quizzes: quizzesNorm || undefined,
        desafios: desafiosNorm || undefined,
        premiacoes: premiacoesData as Premiacao[] || undefined,
        resgates: resgatesData as ResgatePremio[] || undefined,
        backupsHistorico: backupsData as any[] || undefined,
        salasQuizGuiado: salasNorm || undefined,
        resultadosAvaliacaoSST: Array.isArray(resultadosData) ? resultadosData.map(normalizarResultadoDoSupabase) : undefined,
        hasData
      };
    } catch (err) {
      console.error('Falha ao sincronizar dados do Supabase:', err);
      return { hasData: false };
    }
  },

  // --- SEED DADOS INICIAIS CASO ESTEJA VAZIO ---
  // Insere (INSERT/upsert) os dados cadastrais locais no Supabase pela
  // primeira vez. É o "seed inicial": só grava se o banco estiver vazio
  // (ou quando forceSeed=true). Respeita a ordem de chave estrangeira:
  // empresas -> setores -> usuários -> perguntas -> campanhas -> quizzes
  // -> desafios -> premiações.
  async seedInitialDataIfEmpty(
    empresas: Empresa[],
    setores: Setor[],
    usuarios: Usuario[],
    perguntas: Pergunta[],
    campanhas: Campanha[],
    quizzes: QuizSessao[],
    desafios: Desafio1v1[],
    premiacoes: Premiacao[],
    forceSeed: boolean = false
  ): Promise<{ success: boolean; message: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false, message: 'Cliente Supabase não está configurado.' };

    try {
      // Checa antes se o banco já tem empresas, a menos que forceSeed force a gravação
      if (!forceSeed) {
        const { data: existing, error: checkErr } = await client.from('empresas').select('id').limit(1);
        if (checkErr) {
          // Chave secreta (service_role) é proibida no navegador
          if (checkErr.message && (checkErr.message.includes('chave secreta') || checkErr.message.includes('service_role') || checkErr.message.includes('ambiente protegido'))) {
            return {
              success: false,
              message: '⚠️ A chave configurada é a "service_role" (secreta). Substitua pela chave pública "anon" nas configurações do Supabase.'
            };
          }
          // 42P01 = tabela "empresas" não criada (script SQL não executado)
          if (checkErr.code === '42P01') {
            return { 
              success: false, 
              message: 'A tabela "empresas" não foi encontrada no Supabase! Copie e execute o Script SQL na guia "Script SQL das Tabelas".' 
            };
          }
          return { success: false, message: `Erro ao checar banco: ${checkErr.message}` };
        }
        // Banco já populado: aborta o seed para não duplicar dados
        if (existing && existing.length > 0) {
          return { success: false, message: 'O Supabase já contém dados de empresas cadastrados.' };
        }
      }

      console.log('Populando dados em ordem de chave estrangeira no Supabase...');
      
      // 1. Grava as empresas (upsert = insere se não existe, atualiza se existe)
      const { error: e1 } = await client.from('empresas').upsert(empresas);
      if (e1) return { success: false, message: `Erro ao salvar empresas: ${e1.message}` };

      // Conjunto de IDs válidos de empresa + fallback para corrigir referências órfãs
      const validEmpresaIds = new Set(empresas.map(e => e.id));
      const fallbackEmpresaId = empresas[0]?.id || 'emp-1';

      // 2. Saneia os setores (corrige empresa_id inválido para o fallback) e grava
      const sanitizedSetores = setores.map(s => ({
        ...s,
        empresa_id: validEmpresaIds.has(s.empresa_id) ? s.empresa_id : fallbackEmpresaId
      }));
      const { error: e2 } = await client.from('setores').upsert(sanitizedSetores);
      if (e2) return { success: false, message: `Erro ao salvar setores: ${e2.message}` };

      // IDs válidos de setor (para validar o setor_id dos usuários)
      const validSetorIds = new Set(sanitizedSetores.map(s => s.id));
      const fallbackSetorId = sanitizedSetores[0]?.id || null;

      // 3. Saneia os usuários (valida empresa_id e setor_id) e grava
      const sanitizedUsuarios = usuarios.map(u => ({
        ...u,
        empresa_id: validEmpresaIds.has(u.empresa_id) ? u.empresa_id : fallbackEmpresaId,
        setor_id: u.setor_id && validSetorIds.has(u.setor_id) ? u.setor_id : fallbackSetorId
      }));

      let { error: e3 } = await client.from('usuarios').upsert(sanitizedUsuarios);
      // Contorno para schema antigo: remove o campo "ativo" quando o banco não o possui
      if (e3 && (e3.message.includes('ativo') || e3.message.includes('schema cache'))) {
        const usuariosSanitizedWithoutAtivo = sanitizedUsuarios.map(({ ativo, ...rest }) => rest);
        const retryRes = await client.from('usuarios').upsert(usuariosSanitizedWithoutAtivo);
        if (!retryRes.error) {
          e3 = null;
        }
      }
      if (e3) return { success: false, message: `Erro ao salvar usuários: ${e3.message}` };

      // 4. Saneia e grava as perguntas (valida empresa_id)
      const sanitizedPerguntas = perguntas.map(p => ({
        ...p,
        empresa_id: validEmpresaIds.has(p.empresa_id) ? p.empresa_id : fallbackEmpresaId
      }));
      const { error: e4 } = await client.from('perguntas').upsert(sanitizedPerguntas);
      if (e4) return { success: false, message: `Erro ao salvar perguntas: ${e4.message}` };

      // 5. Saneia e grava as campanhas
      const sanitizedCampanhas = campanhas.map(c => ({
        ...c,
        empresa_id: validEmpresaIds.has(c.empresa_id) ? c.empresa_id : fallbackEmpresaId
      }));
      const { error: e5 } = await client.from('campanhas').upsert(sanitizedCampanhas);
      if (e5) return { success: false, message: `Erro ao salvar campanhas: ${e5.message}` };

      // 6. Saneia e grava os quizzes
      const sanitizedQuizzes = quizzes.map(q => ({
        ...q,
        empresa_id: validEmpresaIds.has(q.empresa_id) ? q.empresa_id : fallbackEmpresaId
      }));
      const { error: e6 } = await client.from('quizzes').upsert(sanitizedQuizzes);
      if (e6) return { success: false, message: `Erro ao salvar quizzes: ${e6.message}` };

      // 7. Saneia e grava os desafios 1v1
      const sanitizedDesafios = desafios.map(d => ({
        ...d,
        empresa_id: validEmpresaIds.has(d.empresa_id) ? d.empresa_id : fallbackEmpresaId
      }));
      let { error: e7 } = await client.from('desafios_1v1').upsert(sanitizedDesafios);
      if (e7 && (e7.message.includes('decidido_no_desempate') || e7.message.includes('schema cache') || e7.message.includes('column'))) {
        const withoutDecidido = sanitizedDesafios.map(({ decidido_no_desempate, ...rest }: any) => rest);
        const retry = await client.from('desafios_1v1').upsert(withoutDecidido);
        if (retry.error) console.error('Erro ao salvar desafios no seed (retry):', retry.error.message);
      } else if (e7) {
        return { success: false, message: `Erro ao salvar desafios: ${e7.message}` };
      }

      // 8. Saneia e grava as premiações
      const sanitizedPremiacoes = premiacoes.map(pr => ({
        ...pr,
        empresa_id: validEmpresaIds.has(pr.empresa_id) ? pr.empresa_id : fallbackEmpresaId
      }));
      let { error: e8 } = await client.from('premiacoes').upsert(sanitizedPremiacoes);
      if (e8 && (e8.message.includes('ativo') || e8.message.includes('schema cache') || e8.message.includes('column'))) {
        const withoutAtivo = sanitizedPremiacoes.map(({ ativo, ...rest }: any) => rest);
        let retry = await client.from('premiacoes').upsert(withoutAtivo);
        if (retry.error) {
          const basicList = withoutAtivo.map(({ custo_pontos, estoque, imagem, ...basic }: any) => basic);
          retry = await client.from('premiacoes').upsert(basicList);
        }
        if (retry.error) console.error('Erro ao salvar premiações no seed (retry):', retry.error.message);
      } else if (e8) {
        return { success: false, message: `Erro ao salvar premiações: ${e8.message}` };
      }

      console.log('Dados iniciais inseridos com sucesso no Supabase!');
      return { success: true, message: 'Todas as tabelas do Supabase foram populadas com sucesso com os dados cadastrais!' };
    } catch (err: any) {
      console.error('Erro ao popular dados iniciais no Supabase:', err);
      return { success: false, message: `Falha na gravação: ${err.message || 'Erro desconhecido'}` };
    }
  },

  // --- EMPRESAS ---
  // Insere ou atualiza (upsert) uma única empresa na tabela "empresas".
  // Chamada quando o usuário salva uma empresa no cadastro.
  async upsertEmpresa(empresa: Empresa) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      // upsert = INSERT se o id não existe, UPDATE se já existe
      const { error } = await client.from('empresas').upsert(empresa);
      if (error) console.error('Erro ao upsertEmpresa:', error.message);
    } catch (err) {
      console.error('Exceção em upsertEmpresa:', err);
    }
  },
  // Deleta (DELETE) uma empresa da tabela "empresas" pelo id.
  // Chamada quando o usuário exclui uma empresa no cadastro.
  async deleteEmpresa(id: string) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      // DELETE WHERE id = valor informado
      const { error } = await client.from('empresas').delete().eq('id', id);
      if (error) console.error('Erro ao deleteEmpresa:', error.message);
    } catch (err) {
      console.error('Exceção em deleteEmpresa:', err);
    }
  },

  // --- SETORES ---
  // Insere ou atualiza (upsert) um setor na tabela "setores".
  // Chamada quando o usuário salva um setor no cadastro.
  async upsertSetor(setor: Setor) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { error } = await client.from('setores').upsert(setor);
      if (error) console.error('Erro ao upsertSetor:', error.message);
    } catch (err) {
      console.error('Exceção em upsertSetor:', err);
    }
  },
  // Deleta (DELETE) um setor pelo id.
  // Chamada quando o usuário exclui um setor no cadastro.
  async deleteSetor(id: string) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { error } = await client.from('setores').delete().eq('id', id);
      if (error) console.error('Erro ao deleteSetor:', error.message);
    } catch (err) {
      console.error('Exceção em deleteSetor:', err);
    }
  },

  // --- USUÁRIOS ---
  // Insere ou atualiza (upsert) um usuário na tabela "usuarios".
  // Antes de gravar, garante que a empresa e o setor referenciados
  // existam no Supabase (criando a empresa "emp-1" se não houver nenhuma).
  // Chamada quando o usuário é salvo no cadastro.
  async upsertUsuario(usuario: Usuario): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      // Garante que a empresa exista no Supabase antes de salvar o usuário
      let companyIdToUse = (usuario.empresa_id && usuario.empresa_id.trim()) ? usuario.empresa_id.trim() : 'emp-1';
      // SELECT da empresa pelo id informado
      const { data: dbEmp } = await client.from('empresas').select('id').eq('id', companyIdToUse).maybeSingle();
      if (!dbEmp) {
        // Empresa não existe: tenta usar a primeira empresa cadastrada
        const { data: anyEmp } = await client.from('empresas').select('id').limit(1);
        if (anyEmp && anyEmp.length > 0) {
          companyIdToUse = anyEmp[0].id;
        } else {
          // Nenhuma empresa existe: cria a empresa padrão "emp-1" na nuvem
          await client.from('empresas').upsert({
            id: 'emp-1',
            nome: 'TecnoSafety Industrial S.A.',
            cnpj: '12.345.678/0001-90',
            plano: 'Enterprise',
            configuracoes: {}
          });
          companyIdToUse = 'emp-1';
        }
      }

      // Garante que o setor exista no Supabase; setor inválido/inexistente vira null
      let sectorIdToUse: string | null = (usuario.setor_id && usuario.setor_id.trim()) ? usuario.setor_id.trim() : null;
      if (sectorIdToUse) {
        // SELECT do setor pelo id informado
        const { data: dbSet } = await client.from('setores').select('id').eq('id', sectorIdToUse).maybeSingle();
        if (!dbSet) {
          sectorIdToUse = null;
        }
      }

      // Monta o registro com as referências já corrigidas
      const sanitized: any = {
        ...usuario,
        empresa_id: companyIdToUse,
        setor_id: sectorIdToUse
      };

      // Se a senha não foi informada na atualização, remove para não sobrescrever
      if (sanitized.senha === undefined || sanitized.senha === null) {
        delete sanitized.senha;
      }

      let { error } = await client.from('usuarios').upsert(sanitized);
      // Contorno para schema antigo: remove os campos "ativo" e/ou "is_instrutor" se o banco não os tiver
      if (error && (error.message.includes('ativo') || error.message.includes('is_instrutor') || error.message.includes('schema cache'))) {
        const { ativo, is_instrutor, ...rest } = sanitized;
        const retry = await client.from('usuarios').upsert(rest);
        if (retry.error) {
          console.error('Erro ao upsertUsuario (retry):', retry.error.message);
          return false;
        }
        return true;
      } else if (error) {
        console.error('Erro ao upsertUsuario no Supabase:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Exceção em upsertUsuario:', err);
      return false;
    }
  },
  // Deleta (DELETE) um usuário pelo id.
  // Chamada quando o usuário é excluído no cadastro.
  async deleteUsuario(id: string) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { error } = await client.from('usuarios').delete().eq('id', id);
      if (error) console.error('Erro ao deleteUsuario:', error.message);
    } catch (err) {
      console.error('Exceção em deleteUsuario:', err);
    }
  },

  // --- SINCRONIZAÇÃO COMPLETA DE DADOS LOCAIS -> SUPABASE ---
  // Envia (upsert em lote) TODOS os dados locais do app para a nuvem.
  // Usada quando o app estava offline e volta a ter conexão (fila de
  // sincronização): o estado local é "empurrado" para o Supabase.
  // Sanea referências de chave estrangeira (empresa_id/setor_id) e
  // retorna a contagem de registros gravados por tabela.
  async syncAllDataToSupabase(data: {
    empresas: Empresa[];
    setores: Setor[];
    usuarios: Usuario[];
    perguntas: Pergunta[];
    campanhas: Campanha[];
    quizzes: QuizSessao[];
    desafios: Desafio1v1[];
    premiacoes: Premiacao[];
    resgates: ResgatePremio[];
  }): Promise<{ success: boolean; message: string; counts?: Record<string, number> }> {
    const client = getSupabaseClient();
    if (!client) return { success: false, message: 'Cliente Supabase não está configurado.' };

    try {
      console.log('Iniciando sincronização completa local -> Supabase...');

      // Acumula os erros reais por tabela para não "fingir" sucesso quando
      // algo falhar (auditoria forense AUD-53: o sync reportava sucesso mesmo
      // com 100% de falha, enganando o usuário na tela do modal).
      const erros: string[] = [];

      // 1. Sincroniza as empresas (upsert em lote)
      if (data.empresas && data.empresas.length > 0) {
        const { error: e1 } = await client.from('empresas').upsert(data.empresas);
        if (e1) erros.push(`empresas: ${e1.message}`);
      }

      // IDs válidos de empresa + fallback para corrigir referências órfãs
      const validEmpresaIds = new Set(data.empresas?.map(e => e.id) || ['emp-1']);
      const fallbackEmpresaId = data.empresas?.[0]?.id || 'emp-1';

      // 2. Sincroniza os setores (corrige empresa_id inválido para o fallback)
      if (data.setores && data.setores.length > 0) {
        const sanitizedSetores = data.setores.map(s => ({
          ...s,
          empresa_id: validEmpresaIds.has(s.empresa_id) ? s.empresa_id : fallbackEmpresaId
        }));
        const { error: e2 } = await client.from('setores').upsert(sanitizedSetores);
        if (e2) erros.push(`setores: ${e2.message}`);
      }

      // IDs válidos de setor (para validar o setor_id dos usuários)
      const validSetorIds = new Set(data.setores?.map(s => s.id) || []);

      // 3. Sincroniza os usuários (valida empresa_id e setor_id)
      if (data.usuarios && data.usuarios.length > 0) {
        const sanitizedUsuarios = data.usuarios.map(u => ({
          ...u,
          empresa_id: validEmpresaIds.has(u.empresa_id) ? u.empresa_id : fallbackEmpresaId,
          setor_id: u.setor_id && u.setor_id.trim() !== '' && validSetorIds.has(u.setor_id.trim()) ? u.setor_id.trim() : null
        }));

        let { error: e3 } = await client.from('usuarios').upsert(sanitizedUsuarios);
        // Contorno para schema antigo: remove o campo "ativo" se o banco não o tiver
        if (e3 && (e3.message.includes('ativo') || e3.message.includes('schema cache'))) {
          const usuariosSanitizedWithoutAtivo = sanitizedUsuarios.map(({ ativo, ...rest }) => rest);
          const retry = await client.from('usuarios').upsert(usuariosSanitizedWithoutAtivo);
          if (retry.error) e3 = retry.error;
          else e3 = null;
        }
        if (e3) erros.push(`usuarios: ${e3.message}`);
      }

      // 4. Sincroniza as perguntas
      if (data.perguntas && data.perguntas.length > 0) {
        const sanitizedPerguntas = data.perguntas.map(p => ({
          ...p,
          empresa_id: validEmpresaIds.has(p.empresa_id) ? p.empresa_id : fallbackEmpresaId
        }));
        const { error } = await client.from('perguntas').upsert(sanitizedPerguntas);
        if (error) erros.push(`perguntas: ${error.message}`);
      }

      // 5. Sincroniza as campanhas
      if (data.campanhas && data.campanhas.length > 0) {
        const sanitizedCampanhas = data.campanhas.map(c => ({
          ...c,
          empresa_id: validEmpresaIds.has(c.empresa_id) ? c.empresa_id : fallbackEmpresaId
        }));
        const { error } = await client.from('campanhas').upsert(sanitizedCampanhas);
        if (error) erros.push(`campanhas: ${error.message}`);
      }

      // 6. Sincroniza os quizzes
      if (data.quizzes && data.quizzes.length > 0) {
        const sanitizedQuizzes = data.quizzes.map(q => ({
          ...q,
          empresa_id: validEmpresaIds.has(q.empresa_id) ? q.empresa_id : fallbackEmpresaId
        }));
        const { error } = await client.from('quizzes').upsert(sanitizedQuizzes);
        if (error) erros.push(`quizzes: ${error.message}`);
      }

      // 7. Sincroniza os desafios 1v1
      if (data.desafios && data.desafios.length > 0) {
        const sanitizedDesafios = data.desafios.map(d => ({
          ...d,
          empresa_id: validEmpresaIds.has(d.empresa_id) ? d.empresa_id : fallbackEmpresaId
        }));
        let { error } = await client.from('desafios_1v1').upsert(sanitizedDesafios);
        if (error && (error.message.includes('decidido_no_desempate') || error.message.includes('schema cache') || error.message.includes('column'))) {
          const withoutDecidido = sanitizedDesafios.map(({ decidido_no_desempate, ...rest }: any) => rest);
          const retry = await client.from('desafios_1v1').upsert(withoutDecidido);
          if (retry.error) erros.push(`desafios_1v1: ${retry.error.message}`);
        } else if (error) {
          erros.push(`desafios_1v1: ${error.message}`);
        }
      }

      // 8. Sincroniza as premiações
      if (data.premiacoes && data.premiacoes.length > 0) {
        const sanitizedPremiacoes = data.premiacoes.map(pr => ({
          ...pr,
          empresa_id: validEmpresaIds.has(pr.empresa_id) ? pr.empresa_id : fallbackEmpresaId
        }));
        let { error } = await client.from('premiacoes').upsert(sanitizedPremiacoes);
        if (error && (error.message.includes('ativo') || error.message.includes('schema cache') || error.message.includes('column'))) {
          const withoutAtivo = sanitizedPremiacoes.map(({ ativo, ...rest }: any) => rest);
          let retry = await client.from('premiacoes').upsert(withoutAtivo);
          if (retry.error) {
            const basicList = withoutAtivo.map(({ custo_pontos, estoque, imagem, ...basic }: any) => basic);
            retry = await client.from('premiacoes').upsert(basicList);
          }
          if (retry.error) erros.push(`premiacoes: ${retry.error.message}`);
        } else if (error) {
          erros.push(`premiacoes: ${error.message}`);
        }
      }

      // 9. Sincroniza os resgates de prêmios
      if (data.resgates && data.resgates.length > 0) {
        const sanitizedResgates = data.resgates.map(r => ({
          ...r,
          empresa_id: validEmpresaIds.has(r.empresa_id) ? r.empresa_id : fallbackEmpresaId
        }));
        const { error } = await client.from('resgates_premios').upsert(sanitizedResgates);
        if (error) erros.push(`resgates_premios: ${error.message}`);
      }

      // Só reporta sucesso se NENHUMA tabela falhou; caso contrário informa
      // exatamente quais falharam, para o usuário ver o problema real.
      if (erros.length > 0) {
        return {
          success: false,
          message: `Sincronização concluída com avisos: ${erros.join(' | ')}`,
          counts: {
            empresas: data.empresas?.length || 0,
            setores: data.setores?.length || 0,
            usuarios: data.usuarios?.length || 0,
            perguntas: data.perguntas?.length || 0,
            campanhas: data.campanhas?.length || 0,
            quizzes: data.quizzes?.length || 0,
            desafios: data.desafios?.length || 0,
            premiacoes: data.premiacoes?.length || 0,
            resgates: data.resgates?.length || 0,
          }
        };
      }

      // Retorna sucesso com a quantidade de registros enviados por tabela
      return {
        success: true,
        message: 'Todos os registros locais (incluindo usuários, empresas e setores) foram sincronizados com sucesso no Supabase!',
        counts: {
          empresas: data.empresas?.length || 0,
          setores: data.setores?.length || 0,
          usuarios: data.usuarios?.length || 0,
          perguntas: data.perguntas?.length || 0,
          campanhas: data.campanhas?.length || 0,
          quizzes: data.quizzes?.length || 0,
          desafios: data.desafios?.length || 0,
          premiacoes: data.premiacoes?.length || 0,
          resgates: data.resgates?.length || 0,
        }
      };
    } catch (err: any) {
      console.error('Erro na sincronização com Supabase:', err);
      return { success: false, message: `Erro ao sincronizar: ${err.message || 'Erro de conexão'}` };
    }
  },

  // --- PERGUNTAS ---
  // Insere ou atualiza (upsert) uma pergunta na tabela "perguntas".
  // Chamada quando uma pergunta é salva/alterada no cadastro.
  async upsertPergunta(pergunta: Pergunta) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { error } = await client.from('perguntas').upsert(pergunta);
      if (error) console.error('Erro ao upsertPergunta:', error.message);
    } catch (err) {
      console.error('Exceção em upsertPergunta:', err);
    }
  },
  // Insere ou atualiza várias perguntas em lote na tabela "perguntas".
  async upsertPerguntas(perguntasArr: Pergunta[]) {
    const client = getSupabaseClient();
    if (!client || !perguntasArr || perguntasArr.length === 0) return;
    try {
      const { error } = await client.from('perguntas').upsert(perguntasArr);
      if (error) console.error('Erro ao upsertPerguntas:', error.message);
    } catch (err) {
      console.error('Exceção em upsertPerguntas:', err);
    }
  },
  // Deleta (DELETE) uma pergunta pelo id.
  // Chamada quando uma pergunta é excluída no cadastro.
  async deletePergunta(id: string) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { error } = await client.from('perguntas').delete().eq('id', id);
      if (error) console.error('Erro ao deletePergunta:', error.message);
    } catch (err) {
      console.error('Exceção em deletePergunta:', err);
    }
  },

  // --- CAMPANHAS ---
  // Insere ou atualiza (upsert) uma campanha na tabela "campanhas".
  // Chamada quando uma campanha é salva/alterada no cadastro.
  async upsertCampanha(campanha: Campanha) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { error } = await client.from('campanhas').upsert(campanha);
      if (error) console.error('Erro ao upsertCampanha:', error.message);
    } catch (err) {
      console.error('Exceção em upsertCampanha:', err);
    }
  },
  // Deleta (DELETE) uma campanha pelo id.
  // Chamada quando uma campanha é excluída no cadastro.
  async deleteCampanha(id: string) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { error } = await client.from('campanhas').delete().eq('id', id);
      if (error) console.error('Erro ao deleteCampanha:', error.message);
    } catch (err) {
      console.error('Exceção em deleteCampanha:', err);
    }
  },

  // --- QUIZZES ---
  // Insere ou atualiza (upsert) uma sessão de quiz na tabela "quizzes".
  // Chamada quando uma sessão de quiz é salva/alterada no app.
  async upsertQuiz(quiz: QuizSessao): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;
    try {
      const { error } = await client.from('quizzes').upsert(quiz);
      if (error) {
        console.error('Erro ao upsertQuiz:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Exceção em upsertQuiz:', err);
      return false;
    }
  },

  // --- DESAFIOS 1V1 ---
  // Insere ou atualiza (upsert) um desafio 1v1 na tabela "desafios_1v1".
  // Chamada quando um desafio é salvo/alterado no app.
  async upsertDesafio(desafio: Desafio1v1): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;
    try {
      const sanitized: any = { ...desafio };
      let { error } = await client.from('desafios_1v1').upsert(sanitized);

      if (error && (error.message.includes('decidido_no_desempate') || error.message.includes('schema cache') || error.message.includes('column'))) {
        console.warn('Retentando upsertDesafio sem colunas potencialmente ausentes no schema cache:', error.message);
        const { decidido_no_desempate, ...withoutDecidido } = sanitized;
        const retry = await client.from('desafios_1v1').upsert(withoutDecidido);
        if (retry.error) {
          console.error('Erro ao upsertDesafio (retry):', retry.error.message);
          return false;
        }
        return true;
      }

      if (error) {
        console.error('Erro ao upsertDesafio:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Exceção em upsertDesafio:', err);
      return false;
    }
  },
  // Deleta (DELETE) um desafio 1v1 pelo id.
  // Chamada quando um desafio é excluído no app.
  async deleteDesafio(id: string) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { error } = await client.from('desafios_1v1').delete().eq('id', id);
      if (error) console.error('Erro ao deleteDesafio:', error.message);
    } catch (err) {
      console.error('Exceção em deleteDesafio:', err);
    }
  },

  // --- PREMIAÇÕES ---
  // Insere ou atualiza (upsert) uma premiação na tabela "premiacoes".
  // Chamada quando uma premiação é salva/alterada no cadastro.
  async upsertPremiacao(premiacao: Premiacao): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;
    try {
      const sanitized: any = { ...premiacao };
      let { error } = await client.from('premiacoes').upsert(sanitized);

      if (error && (error.message.includes('ativo') || error.message.includes('schema cache') || error.message.includes('column'))) {
        console.warn('Retentando upsertPremiacao sem colunas potencialmente ausentes no schema cache:', error.message);
        const { ativo, ...withoutAtivo } = sanitized;
        let retry = await client.from('premiacoes').upsert(withoutAtivo);
        if (retry.error) {
          const { custo_pontos, estoque, imagem, ...basic } = withoutAtivo;
          retry = await client.from('premiacoes').upsert(basic);
        }
        if (retry.error) {
          console.error('Erro ao upsertPremiacao (retry):', retry.error.message);
          return false;
        }
        return true;
      }

      if (error) {
        console.error('Erro ao upsertPremiacao:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Exceção em upsertPremiacao:', err);
      return false;
    }
  },
  // Deleta (DELETE) uma premiação pelo id.
  // Chamada quando uma premiação é excluída no cadastro.
  async deletePremiacao(id: string) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { error } = await client.from('premiacoes').delete().eq('id', id);
      if (error) console.error('Erro ao deletePremiacao:', error.message);
    } catch (err) {
      console.error('Exceção em deletePremiacao:', err);
    }
  },

  // --- RESGATES DE PRÊMIOS ---
  // Insere ou atualiza (upsert) um resgate de prêmio na tabela
  // "resgates_premios". Chamada quando um usuário resgata um prêmio.
  async upsertResgatePremio(resgate: ResgatePremio): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;
    try {
      const { error } = await client.from('resgates_premios').upsert(resgate);
      if (error) {
        console.error('Erro ao upsertResgatePremio:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Exceção em upsertResgatePremio:', err);
      return false;
    }
  },
  // Deleta (DELETE) um resgate de prêmio pelo id.
  // Chamada quando um resgate é cancelado/excluído no app.
  async deleteResgatePremio(id: string) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { error } = await client.from('resgates_premios').delete().eq('id', id);
      if (error) console.error('Erro ao deleteResgatePremio:', error.message);
    } catch (err) {
      console.error('Exceção em deleteResgatePremio:', err);
    }
  },

  // --- HISTÓRICO DE BACKUPS ---
  // Insere ou atualiza (upsert) um registro de backup na tabela
  // "backups_historico". Guarda metadados do backup (tipo, data, tamanho,
  // resumo e o "dados" completo). Chamada ao criar um backup na nuvem.
  async upsertBackupHistorico(backupRecord: {
    id: string;
    empresa_id?: string;
    tipo: string;
    data: string;
    tamanho_kb: number;
    resumo: string;
    dados: any;
  }) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      // SEGURANÇA (auditoria V-015/V-017): o snapshot pode conter senhas em
      // texto puro dos usuários — remove antes de persistir na nuvem.
      await client.from('backups_historico').upsert({
        ...backupRecord,
        dados: removerSenha(backupRecord.dados),
      });
    } catch (err) {
      console.warn('Aviso: Tabela backups_historico não encontrada no Supabase:', err);
    }
  },

  // Deleta (DELETE) um registro de backup da tabela "backups_historico"
  // pelo id. Chamada quando um backup é removido/excluído na nuvem.
  async deleteBackupHistorico(id: string) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      await client.from('backups_historico').delete().eq('id', id);
    } catch (err) {
      console.warn('Erro ao deletar backup no Supabase:', err);
    }
  },

  // --- SALAS DE QUIZ GUIADO (TEMPO REAL & SERVIDOR LOCAL + SUPABASE) ---
  async fetchSalaQuizGuiadoByPin(pin: string) {
    const cleanPin = pin.trim().toUpperCase();
    
    // 1. Tenta buscar no servidor Express local
    try {
      const res = await fetch(`/api/salas_quiz_guiado/pin/${cleanPin}`, { headers: headersComToken() });
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) return data;
      }
    } catch (e) {
      // Ignore
    }

    // 2. Tenta buscar no Supabase se configurado.
    // SEGURANÇA (auditoria forense AUD-42/R1 + aviso "unrestricted"): o
    // participante NÃO pode receber o gabarito da tabela base. Antes usávamos a
    // view vw_salas_quiz_guiado_publica, que era SECURITY DEFINER (bypassava
    // RLS) e permitia a anon enumerar salas de todas as empresas. Agora usamos
    // a função SEGURA buscar_sala_quiz_guiado_por_pin(p_pin), que exige o PIN
    // exato e retorna a sala sanitizada (sem resposta_correta/explicacao).
    const client = getSupabaseClient();
    if (client) {
      try {
        const { data, error } = await client.rpc('buscar_sala_quiz_guiado_por_pin', {
          p_pin: cleanPin,
        });

        if (data && !error) return data;
      } catch (err) {
        console.warn('Erro ao consultar sala no Supabase:', err);
      }
    }

    return null;
  },

  async upsertSalaQuizGuiado(sala: any, opcoes?: { somenteExpress?: boolean }) {
    // Normaliza o payload para o Supabase (nota mínima base-10, etc.)
    const salaNormalizada = normalizarSalaParaSupabase(sala);

    // 1. Envia para o servidor Express local
    try {
      await fetch('/api/salas_quiz_guiado', {
        method: 'POST',
        headers: headersComToken(),
        body: JSON.stringify(sala),
      });
    } catch (err) {
      console.warn('Aviso ao enviar sala para backend local:', err);
    }

    // 2. Envia para o Supabase se configurado.
    // CORREÇÃO (Problema 1 — respostas corretas marcadas como erradas): as
    // escritas feitas pelo PARTICIPANTE (entrada na sala / envio de resposta)
    // usam somenteExpress=true — atualizam apenas o Express (que preserva o
    // gabarito no servidor) e o Supabase via RPC seguro. O upsert da sala
    // INTEIRA no Supabase vindo de um payload sanitizado sobrescreveria
    // perguntas[].resposta_correta com undefined (gabarito corrompido).
    const client = getSupabaseClient();
    if (!client || opcoes?.somenteExpress) return;
    try {
      await client.from('salas_quiz_guiado').upsert(salaNormalizada);
    } catch (err) {
      console.warn('Aviso ao upsertSalaQuizGuiado no Supabase:', err);
    }
  },

  async deleteSalaQuizGuiado(id: string) {
    try {
      await fetch(`/api/salas_quiz_guiado/${id}`, { method: 'DELETE', headers: headersComToken() });
    } catch (err) {
      // Ignore
    }

    const client = getSupabaseClient();
    if (!client) return;
    try {
      await client.from('salas_quiz_guiado').delete().eq('id', id);
    } catch (err) {
      console.warn('Erro ao deleteSalaQuizGuiado:', err);
    }
  },

  // CORREÇÃO (auditoria Problema 1 — resposta correta marcada como errada):
  // valida a resposta no SERVIDOR EXPRESS, que possui o gabarito completo da
  // sala. Cobre o participante VISITANTE (LAN), que não tem sessão Supabase
  // Auth — a edge function exige `Authorization: Bearer` e o RPC exige o
  // participante já persistido no Supabase, ambos inacessíveis a ele.
  // Retorna { correta, pontosAdicionais } ou null em caso de falha.
  async validarRespostaQuizGuiadoExpress(payload: {
    sala_id: string;
    participante_id: string;
    pergunta_id: string;
    resposta_index: number;
    tempo_ms: number;
  }): Promise<{ correta: boolean; pontosAdicionais: number } | null> {
    try {
      const res = await fetch('/api/salas_quiz_guiado/responder', {
        method: 'POST',
        headers: headersComToken(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && typeof data.correta === 'boolean') {
        return { correta: data.correta, pontosAdicionais: Number(data.pontosAdicionais ?? 0) || 0 };
      }
      return null;
    } catch (err) {
      console.warn('Falha ao validar resposta no Express:', err);
      return null;
    }
  },

  // --- RESULTADOS DE AVALIAÇÃO SST ---
  async fetchResultadosAvaliacaoSST() {
    let localData: any[] = [];
    try {
      const res = await fetch('/api/resultados_avaliacao_sst', { headers: headersComToken() });
      if (res.ok) {
        localData = await res.json();
      }
    } catch (e) {}

    const client = getSupabaseClient();
    if (!client) return localData;

    try {
      const { data, error } = await client.from('resultados_avaliacao_sst').select('*').order('data_finalizacao', { ascending: false });
      if (data && !error && Array.isArray(data)) {
        const normData = data.map(normalizarResultadoDoSupabase);
        // Atualiza a réplica local para bater exatamente com a nuvem quando online
        try {
          localStorage.setItem('sst_resultados_avaliacao_sst', JSON.stringify(normData));
        } catch (e) {}
        return normData;
      }
      if (error) {
        console.warn('Aviso ao buscar resultados_avaliacao_sst no Supabase:', error.message);
      }
    } catch (err) {
      console.warn('Aviso ao buscar resultados_avaliacao_sst no Supabase:', err);
    }

    return localData;
  },

  async upsertResultadoAvaliacaoSST(resultado: any) {
    try {
      await fetch('/api/resultados_avaliacao_sst', {
        method: 'POST',
        headers: headersComToken(),
        body: JSON.stringify(resultado),
      });
    } catch (err) {}

    const client = getSupabaseClient();
    if (!client) return;
    try {
      let payload = normalizarResultadoParaSupabase(resultado);
      let maxRetries = 5;
      let lastError: any = null;

      while (maxRetries > 0) {
        const { error } = await client.from('resultados_avaliacao_sst').upsert(payload);
        if (!error) {
          console.log('Laudo salvo no Supabase com sucesso:', resultado.id);
          return;
        }

        lastError = error;
        console.warn(`Tentativa de upsertResultadoAvaliacaoSST retornou erro [${error.code}]:`, error.message);

        // Trata coluna ausente no cache de esquema (PGRST204)
        if (error.code === 'PGRST204' || error.message?.includes('Could not find the')) {
          const match = error.message?.match(/Could not find the '([^']+)' column/i);
          if (match && match[1]) {
            const colToRemove = match[1];
            console.warn(`Removendo coluna inexistente '${colToRemove}' e tentando novamente...`);
            delete payload[colToRemove];
            maxRetries--;
            continue;
          }
        }

        // Resiliência contra Foreign Key violation (23503): se sala_id, empresa_id ou instrutor_id não existirem na nuvem
        if (error.code === '23503' || error.message?.toLowerCase().includes('foreign key')) {
          console.warn('Retentando salvar laudo com FKs nulas para garantir persistência na nuvem...');
          payload = {
            ...payload,
            sala_id: null,
            empresa_id: null,
            instrutor_id: null
          };
          maxRetries--;
          continue;
        }

        break;
      }

      if (lastError) {
        console.error('Erro ao upsertResultadoAvaliacaoSST no Supabase:', lastError.message, lastError.code);
      }
    } catch (err) {
      console.warn('Exceção ao upsertResultadoAvaliacaoSST no Supabase:', err);
    }
  },

  async deleteResultadoAvaliacaoSST(id: string) {
    try {
      await fetch(`/api/resultados_avaliacao_sst/${id}`, { method: 'DELETE', headers: headersComToken() });
    } catch (e) {}

    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { error } = await client.from('resultados_avaliacao_sst').delete().eq('id', id);
      if (error) {
        console.error('Erro ao deletar de resultados_avaliacao_sst no Supabase:', error.message);
      } else {
        console.log('Laudo deletado com sucesso no Supabase:', id);
      }
    } catch (err) {
      console.warn('Erro ao deleteResultadoAvaliacaoSST:', err);
    }
  },

  // --- RESET TOTAL DO BANCO (usado no Reset de Fábrica do Super Admin) ---
  // Limpa TODAS as tabelas do Supabase (na ordem correta de chave
  // estrangeira: filhas primeiro, pais por último). Usada para
  // comercialização, garantindo que a nuvem não fique com dados antigos
  // que voltariam ao app na próxima hidratação ("banco vence").
  async limparTodasTabelas() {
    const client = getSupabaseClient();
    if (!client) return { success: false, message: 'Cliente Supabase não configurado.' };

    try {
      // Ordem: tabelas filhas (com FK) primeiro, depois as pais.
      try { await client.from('resultados_avaliacao_sst').delete().neq('id', '__none__'); } catch (e) {}
      try { await client.from('salas_quiz_guiado').delete().neq('id', '__none__'); } catch (e) {}
      await client.from('resgates_premios').delete().neq('id', '__none__');
      await client.from('backups_historico').delete().neq('id', '__none__');
      await client.from('desafios_1v1').delete().neq('id', '__none__');
      await client.from('quizzes').delete().neq('id', '__none__');
      await client.from('campanhas').delete().neq('id', '__none__');
      await client.from('perguntas').delete().neq('id', '__none__');
      await client.from('usuarios').delete().neq('id', '__none__');
      await client.from('setores').delete().neq('id', '__none__');
      await client.from('empresas').delete().neq('id', '__none__');
      return { success: true, message: 'Todas as tabelas do Supabase foram limpas com sucesso.' };
    } catch (err: any) {
      console.error('Erro ao limpar tabelas do Supabase:', err);
      return { success: false, message: `Erro ao limpar Supabase: ${err?.message || 'Erro desconhecido'}` };
    }
  },

  // ============================================================
  // CHAMADAS A EDGE FUNCTIONS (PONTUAÇÃO VALIDADA NO SERVIDOR)
  // ============================================================
  // Quando o Supabase está configurado, a pontuação é calculada no
  // servidor (gabarito + janela de tempo), nunca confiando no cliente.
  // Se a função não existir/não responder, retorna null (o app usa o
  // cálculo local como fallback de compatibilidade).

  async invokeEdgeFunction<T>(
    functionName: string,
    payload: Record<string, unknown>
  ): Promise<T | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
      const { data, error } = await client.functions.invoke(functionName, { body: payload });
      if (error) {
        console.warn(`Edge function "${functionName}" indisponível:`, error.message);
        return null;
      }
      return data as T;
    } catch (err) {
      console.warn(`Edge function "${functionName}" falhou:`, err);
      return null;
    }
  },

  async pontuarQuiz(payload: {
    quiz_id: string;
    respostas: {
      pergunta_id: string;
      resposta_escolhida: number;
      tempo_gasto_segundos: number;
    }[];
  }): Promise<any | null> {
    return this.invokeEdgeFunction('pontuar-quiz', payload);
  },

  async pontuarDesafio(payload: {
    desafio_id: string;
    user_id: string;
    respostas: {
      pergunta_id: string;
      alternativa_escolhida: number;
      tempo_resposta_segundos: number;
    }[];
  }): Promise<any | null> {
    return this.invokeEdgeFunction('pontuar-desafio', payload);
  },

  async pontuarQuizGuiado(payload: {
    sala_id: string;
    participante_id: string;
    pergunta_id: string;
    resposta_index: number;
    tempo_ms: number;
  }): Promise<any | null> {
    return this.invokeEdgeFunction('pontuar-quiz-guiado', payload);
  },

  // --- RESGATE DE PRÊMIO TRANSACIONAL (RPC no servidor) ---
  // O débito de pontos + estoque + registro do resgate acontecem numa ÚNICA
  // transação no banco (estoque > 0 e saldo validados server-side), evitando
  // a corrida pelo último item. Retorna null se o RPC não existir (fallback
  // para o fluxo local legado do app).

  async resgatarPremio(premiacaoId: string, resgate: any): Promise<any | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
      const { data, error } = await client.rpc('resgatar_premio', {
        p_premiacao_id: premiacaoId,
        p_resgate: resgate,
      });
      if (error) {
        console.warn('RPC resgatar_premio indisponível:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('Falha ao chamar RPC resgatar_premio:', err);
      return null;
    }
  },

  async reembolsarResgate(resgateId: string): Promise<any | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
      const { data, error } = await client.rpc('reembolsar_resgate', {
        p_resgate_id: resgateId,
      });
      if (error) {
        console.warn('RPC reembolsar_resgate indisponível:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('Falha ao chamar RPC reembolsar_resgate:', err);
      return null;
    }
  },

  // --- DESAFIOS 1x1: ESTADO E LEDGER SERVER-SIDE (RPC idempotente) ---
  // Registra data_aceite (server timestamp) e a RESERVA_APOSTA no ledger.
  // Retorna null se o RPC não existir (fallback para o fluxo local legado).

  async aceitarDesafioRpc(desafioId: string, userId: string): Promise<any | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
      const { data, error } = await client.rpc('aceitar_desafio', {
        p_desafio_id: desafioId,
        p_usuario_id: userId,
      });
      if (error) {
        console.warn('RPC aceitar_desafio indisponível:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('Falha ao chamar RPC aceitar_desafio:', err);
      return null;
    }
  },

  // Liquida o desafio no servidor (status concluido + data_conclusao) e grava
  // os lançamentos de DESAFIO no ledger (vencedor +pontos; perdedor -perda no
  // amistoso), numa única transação idempotente.
  async registrarDesafioNoLedger(payload: {
    desafio_id: string;
    vencedor_id?: string | null;
    perdedor_id?: string | null;
    pontos_ganho?: number;
    pontos_perda?: number;
    motivo?: string | null;
  }): Promise<any | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
      const { data, error } = await client.rpc('registrar_desafio_no_ledger', {
        p_desafio_id: payload.desafio_id,
        p_vencedor_id: payload.vencedor_id ?? null,
        p_perdedor_id: payload.perdedor_id ?? null,
        p_pontos_ganho: payload.pontos_ganho ?? 0,
        p_pontos_perda: payload.pontos_perda ?? 0,
        p_motivo: payload.motivo ?? null,
      });
      if (error) {
        console.warn('RPC registrar_desafio_no_ledger indisponível:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('Falha ao chamar RPC registrar_desafio_no_ledger:', err);
      return null;
    }
  },

  // --- QUIZ GUIADO: RESULTADO IMUTÁVEL E MARCOS SERVER-SIDE ---
  // Grava a resposta validada na tabela imutável (append-only) do servidor.
  // Retorna null se o RPC não existir (fallback para o fluxo local legado).

  async registrarRespostaQuizGuiadoRpc(payload: {
    sala_id: string;
    participante_id: string;
    participante_nome?: string | null;
    pergunta_id: string;
    resposta_index: number;
    tempo_ms: number;
  }): Promise<any | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
      const { data, error } = await client.rpc('registrar_resposta_quiz_guiado', {
        p_sala_id: payload.sala_id,
        p_participante_id: payload.participante_id,
        p_participante_nome: payload.participante_nome ?? null,
        p_pergunta_id: payload.pergunta_id,
        p_resposta_index: payload.resposta_index,
        p_tempo_ms: payload.tempo_ms,
      });
      if (error) {
        console.warn('RPC registrar_resposta_quiz_guiado indisponível:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('Falha ao chamar RPC registrar_resposta_quiz_guiado:', err);
      return null;
    }
  },

  // CORREÇÃO (Problema 1 — respostas corretas marcadas como erradas): atualiza
  // APENAS o array 'participantes' da sala via RPC SECURITY DEFINER, preservando
  // as perguntas/gabarito no banco. O participante NÃO deve fazer upsert da sala
  // inteira (sobrescrevia o gabarito e fazia a validação sempre falhar).
  async atualizarParticipanteSala(payload: {
    sala_id: string;
    participante_id: string;
    respostas?: Record<string, any>;
    pontuacao_acumulada?: number;
    nota_final?: number;
    situacao?: string;
    concluido?: boolean;
  }): Promise<any | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
      const { data, error } = await client.rpc('atualizar_participante_sala', {
        p_sala_id: payload.sala_id,
        p_participante_id: payload.participante_id,
        p_respostas: payload.respostas ?? {},
        p_pontuacao_acumulada: payload.pontuacao_acumulada ?? null,
        p_nota_final: payload.nota_final ?? null,
        p_situacao: payload.situacao ?? null,
        p_concluido: payload.concluido ?? null,
      });
      if (error) {
        console.warn('RPC atualizar_participante_sala indisponível:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('Falha ao chamar RPC atualizar_participante_sala:', err);
      return null;
    }
  },

  // Registra marcos de tempo (inicio/encerramento) com timestamp server-side.
  async registrarMarcoSalaQuizGuiadoRpc(salaId: string, marco: 'inicio' | 'encerramento'): Promise<any | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
      const { data, error } = await client.rpc('registrar_marco_sala_quiz_guiado', {
        p_sala_id: salaId,
        p_marco: marco,
      });
      if (error) {
        console.warn('RPC registrar_marco_sala_quiz_guiado indisponível:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('Falha ao chamar RPC registrar_marco_sala_quiz_guiado:', err);
      return null;
    }
  }
};
