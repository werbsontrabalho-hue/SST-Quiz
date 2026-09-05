// =====================================================================
// SupabaseModal - Modal de configuração e conexão com o Supabase (nuvem)
// Permite ao Super Admin informar a URL e a chave anon do projeto,
// testar a conexão, popular (seed) as tabelas e sincronizar os dados
// do app local para o banco PostgreSQL remoto.
// =====================================================================
import React, { useState, useEffect } from 'react';
import { 
  Database, 
  CheckCircle2, 
  XCircle, 
  Copy, 
  Check, 
  RefreshCw, 
  Key, 
  Link as LinkIcon, 
  X, 
  HelpCircle,
  FileCode,
  Zap,
  ShieldCheck
} from 'lucide-react'; // Ícones utilizados na interface do modal
import { 
  getSupabaseConfig, 
  setSupabaseConfig, 
  isSupabaseConfigured, 
  testSupabaseConnection,
  isSecretKey
} from '../lib/supabase'; // Funções de configuração e teste da conexão com o Supabase
import { supabaseService } from '../services/supabaseService'; // Serviço de sincronização e seed de dados com o Supabase
import { useSST } from '../context/SSTContext'; // Contexto global do app (empresas, usuários, quizzes, etc.)

// Props recebidas pelo modal: controlam se ele está aberto e a função de fechamento
interface SupabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseModal: React.FC<SupabaseModalProps> = ({ isOpen, onClose }) => {
  // Extrai do contexto useSST os dados globais e o usuário logado;
  // eles são usados no seed inicial e na sincronização de tudo com a nuvem
  const { 
    currentUser,
    empresas, 
    setores, 
    usuarios, 
    perguntas, 
    campanhas, 
    quizzes, 
    desafios, 
    premiacoes,
    resgates,
    setIsSupabaseActive
  } = useSST();

  // URL do projeto Supabase informada pelo usuário
  const [url, setUrl] = useState('');
  // Chave anon/pública do projeto Supabase
  const [key, setKey] = useState('');
  // Indica se o teste de conexão está em andamento
  const [isTesting, setIsTesting] = useState(false);
  // Resultado do teste de conexão (sucesso/erro + mensagem)
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);
  // Controla a exibição do aviso "Copiado!" ao copiar o script SQL
  const [copiedSql, setCopiedSql] = useState(false);
  // Aba ativa do modal (config, sql, auth, rls ou realtime)
  const [activeTab, setActiveTab] = useState<'config' | 'sql' | 'auth' | 'rls' | 'realtime'>('config');
  // Indica se o seed/sincronização está em andamento
  const [isSeeding, setIsSeeding] = useState(false);
  // Mensagem de sucesso exibida após seed ou sincronização
  const [seedSuccessMsg, setSeedSuccessMsg] = useState('');

  // Ao abrir o modal, carrega as credenciais salvas (se houver) e limpa
  // os estados de resultado do teste e mensagens de seed anteriores
  useEffect(() => {
    if (isOpen) {
      const config = getSupabaseConfig();
      setUrl(config.url);
      setKey(config.key);
      setTestResult(null);
      setSeedSuccessMsg('');
    }
  }, [isOpen]);

  // Se o modal estiver fechado, não renderiza nada
  if (!isOpen) return null;

  // =====================================================================
  // VERIFICAÇÃO DE AUTORIZAÇÃO: Permite configuração na tela de login (!currentUser.id)
  // ou quando o usuário logado for Super Admin.
  // =====================================================================
  if (currentUser && currentUser.id && currentUser.perfil !== 'super_admin') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
        <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
          <ShieldCheck className="w-12 h-12 text-rose-500 mx-auto animate-bounce" />
          <h2 className="text-xl font-bold text-white">Acesso Restrito ao Super Admin</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Apenas o <strong>Super Administrador Global</strong> possui autorização para visualizar ou alterar a configuração do Banco de Dados Supabase.
          </p>
          <button
            onClick={onClose}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs py-2.5 rounded-xl border border-white/10 transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  // Handler do formulário de conexão: testa a conexão e, se válida, salva as credenciais
  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTesting(true); // Ativa o indicador "Testando..."
    setTestResult(null); // Limpa o resultado anterior
    setSeedSuccessMsg('');

    // Testa a conexão primeiro SEM persistir as credenciais.
    // Só salva no localStorage após um teste bem-sucedido.
    const result = await testSupabaseConnection(url.trim(), key.trim());
    setTestResult(result); // Exibe o resultado do teste na interface

    if (result.success) {
      setSupabaseConfig(url, key); // Persiste apenas se o teste passou
      setIsSupabaseActive(true); // Ativa a nuvem imediatamente (sem recarregar)
    }

    setIsTesting(false);
  };

  // Copia o script SQL de configuração (NÃO-DESTRUTIVO) para a área de transferência
  const handleCopySql = () => {
    // Script SQL seguro a ser executado no SQL Editor do Supabase.
    // NÃO apaga tabelas existentes (sem DROP TABLE / TRUNCATE).
    // O script completo (13 tabelas, índices, RLS e seed) está nos arquivos:
    //   supabase/migration_seguranca.sql            (Fase 1 — schema completo)
    //   supabase/migration_politicas_rls_fase2.sql  (Fase 2 — RLS por empresa)
    const sqlCode = `-- ============================================================
-- ESQUEMA DO BANCO DE DADOS SUPABASE (POSTGRESQL) - SST QUIZ CORPORATE
-- VERSÃO NÃO-DESTRUTIVA: não apaga nenhuma tabela existente.
-- NOTA IMPORTANTE: Desative a tradução automática do navegador no Supabase para evitar erros de sintaxe.
-- ============================================================

-- 1. GARANTIR TABELAS DE APOIO QUE PODEM FALTAR (IDEMPOTENTE)
CREATE TABLE IF NOT EXISTS public.resgates_premios (
    id TEXT PRIMARY KEY,
    empresa_id TEXT REFERENCES public.empresas(id) ON DELETE CASCADE,
    usuario_id TEXT REFERENCES public.usuarios(id) ON DELETE CASCADE,
    usuario_nome TEXT NOT NULL,
    usuario_email TEXT,
    usuario_setor_nome TEXT,
    premiacao_id TEXT REFERENCES public.premiacoes(id) ON DELETE CASCADE,
    premiacao_titulo TEXT NOT NULL,
    premiacao_imagem TEXT,
    custo_pontos INT NOT NULL DEFAULT 300,
    status TEXT NOT NULL DEFAULT 'pendente',
    data_resgate TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_atualizacao TIMESTAMP WITH TIME ZONE,
    observacoes TEXT
);

CREATE TABLE IF NOT EXISTS public.notificacoes (
    id TEXT PRIMARY KEY,
    usuario_id TEXT REFERENCES public.usuarios(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'quiz_diario',
    link_acao TEXT,
    lida BOOLEAN DEFAULT false,
    criada_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    canal TEXT DEFAULT 'push'
);

CREATE TABLE IF NOT EXISTS public.backups_historico (
    id TEXT PRIMARY KEY,
    empresa_id TEXT,
    tipo TEXT NOT NULL DEFAULT 'automatico',
    data TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tamanho_kb INT DEFAULT 0,
    resumo TEXT,
    dados JSONB NOT NULL
);

-- 2. GARANTIR COLUNAS ADICIONAIS EM TABELAS EXISTENTES (SEM PERDA DE DADOS)
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS estado_apresentacao TEXT DEFAULT 'AGUARDANDO';
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS sessao_id TEXT;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS question_started_at BIGINT;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS question_ends_at BIGINT;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS historico_sessoes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS posicoes_anteriores JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS nota_minima_aprovacao NUMERIC;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS tempo_por_pergunta INT;
ALTER TABLE public.salas_quiz_guiado DROP CONSTRAINT IF EXISTS salas_quiz_guiado_status_check;
ALTER TABLE public.salas_quiz_guiado ADD CONSTRAINT salas_quiz_guiado_status_check 
  CHECK (status IN ('aguardando', 'em_andamento', 'finalizada', 'concluido', 'concluida', 'pausado', 'cancelada', 'encerrado', 'aberta', 'fechada'));
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS aposta_pontos INT DEFAULT 100;
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS motivo_vitoria TEXT;
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS placar_final TEXT;
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS decidido_no_desempate BOOLEAN DEFAULT false;
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS data_aceite TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS data_conclusao TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.desafios_1v1 DROP CONSTRAINT IF EXISTS desafios_1v1_status_check;
ALTER TABLE public.desafios_1v1 ADD CONSTRAINT desafios_1v1_status_check 
  CHECK (status IN ('pendente', 'aceito', 'em_andamento', 'concluido', 'recusado', 'expirado', 'cancelado', 'finalizado'));
ALTER TABLE public.premiacoes ADD COLUMN IF NOT EXISTS custo_pontos INT DEFAULT 300;
ALTER TABLE public.premiacoes ADD COLUMN IF NOT EXISTS estoque INT DEFAULT 10;
ALTER TABLE public.premiacoes ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

-- 2.1 ALINHAMENTO COM O MODELO DO APP (migration 009): campos que o app envia
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS trofeus_temporadas JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS ultimo_quiz_data TEXT;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS historico_temporadas JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.setores ADD COLUMN IF NOT EXISTS pontos_totais BIGINT DEFAULT 0;
ALTER TABLE public.campanhas ADD COLUMN IF NOT EXISTS pontos_por_acerto INT;
ALTER TABLE public.backups_historico ADD COLUMN IF NOT EXISTS escopo TEXT DEFAULT 'global';
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS empresa_id TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS instrutor_id TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS instrutor_nome TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS sala_pin TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS matricula TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS cargo TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS setor_nome TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS sala_nome TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS data_finalizacao TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS porcentagem_acertos NUMERIC;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS questoes_corretas INT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS total_questoes INT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS nota_minima_aprovacao NUMERIC;

-- Garante que a Foreign Key de resultados_avaliacao_sst para salas_quiz_guiado seja ON DELETE SET NULL (nunca CASCADE)
DO $$
DECLARE fk_rec RECORD;
BEGIN
  FOR fk_rec IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'resultados_avaliacao_sst'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.column_name = 'sala_id'
  LOOP
    EXECUTE 'ALTER TABLE public.resultados_avaliacao_sst DROP CONSTRAINT IF EXISTS ' || quote_ident(fk_rec.constraint_name);
  END LOOP;
  ALTER TABLE public.resultados_avaliacao_sst ADD CONSTRAINT fk_resultados_sala_id FOREIGN KEY (sala_id) REFERENCES public.salas_quiz_guiado(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_resgates_usuario  ON public.resgates_premios(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_user ON public.notificacoes(usuario_id);

-- 4. GRANTS PARA AS ROLES DO SUPABASE (SOMENTE authenticated e service_role).
--    SEGURANÇA (auditoria forense AUD-14): a role anon NÃO recebe privilégios
--    — a migração 007 revogou o acesso anônimo e este script NÃO o reabre.
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.empresas                 TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.setores                  TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.usuarios                 TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.perguntas                TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.campanhas                TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.quizzes                  TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.desafios_1v1             TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.premiacoes               TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.resgates_premios         TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.notificacoes             TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.backups_historico        TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.salas_quiz_guiado        TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.resultados_avaliacao_sst TO authenticated, service_role;

-- 5. RLS (habilitação idempotente)
ALTER TABLE public.empresas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setores                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perguntas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanhas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desafios_1v1            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premiacoes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resgates_premios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups_historico       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salas_quiz_guiado       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resultados_avaliacao_sst ENABLE ROW LEVEL SECURITY;

-- 5. PUBLICAÇÃO REALTIME NO SUPABASE (IDEMPOTENTE E SEGURO - PODE EXECUTAR MÚLTIPLAS VEZES)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.salas_quiz_guiado;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.resultados_avaliacao_sst;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.desafios_1v1;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- OBSERVAÇÃO: o schema completo (todas as tabelas, a view sem senha, as
-- políticas RLS fechadas por empresa, RPCs e trigger anti-autopromoção) está
-- nas MIGRATIONS do repositório (supabase/migrations/001 a 010). Use o
-- comando "supabase db push" para aplicar as migrations de forma segura e
-- idempotente. Este bloco apenas ALINHA colunas/grants sem reabrir anon.
`;

    // Escreve o script na área de transferência e mostra "Copiado!" por 3 segundos
    navigator.clipboard.writeText(sqlCode);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  // Popula/restaura as tabelas do Supabase com os dados iniciais (seed),
  // forçando o preenchimento mesmo que as tabelas já contenham dados
  const handleSeedSupabase = async () => {
    setIsSeeding(true);
    setSeedSuccessMsg('');
    const res = await supabaseService.seedInitialDataIfEmpty(
      empresas,
      setores,
      usuarios,
      perguntas,
      campanhas,
      quizzes,
      desafios,
      premiacoes,
      true // Força o seed para preencher as tabelas
    );
    setIsSeeding(false);
    setSeedSuccessMsg(res.message); // Mostra o resultado do seed na tela
  };

  // Envia (sobrescreve) todos os dados atuais do app local para o Supabase,
  // garantindo que a nuvem reflita exatamente o estado da aplicação
  const handleSyncAllLocal = async () => {
    setIsSeeding(true);
    setSeedSuccessMsg('');
    const res = await supabaseService.syncAllDataToSupabase({
      empresas,
      setores,
      usuarios,
      perguntas,
      campanhas,
      quizzes,
      desafios,
      premiacoes,
      resgates
    });
    setIsSeeding(false);
    setSeedSuccessMsg(res.message); // Mostra o resultado da sincronização
  };

  return (
    // =====================================================================
    // INTERFACE DO MODAL - Renderiza o overlay (fundo escuro) e o card centralizado
    // =====================================================================
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center animate-fadeIn">
      <div className="relative my-auto w-full max-w-2xl bg-slate-900/95 border border-white/15 rounded-3xl p-6 text-white space-y-5 shadow-2xl backdrop-blur-2xl">
        
        {/* Cabeçalho do Modal - Título com ícone do banco e botão de fechar */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-400">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-white flex items-center space-x-2">
                <span>Configuração do Banco de Dados Supabase</span>
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  PostgreSQL
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Conecte seu projeto SST a uma instância Supabase em tempo real com PostgreSQL.
              </p>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-abas de navegação do modal: Conexão, SQL, Auth, RLS e Realtime */}
        <div className="flex flex-wrap gap-1.5 bg-slate-950/60 p-1.5 rounded-2xl border border-white/10 text-xs">
          <button
            onClick={() => setActiveTab('config')}
            className={`flex-1 min-w-[120px] py-2 rounded-xl font-bold flex items-center justify-center space-x-1.5 transition-all ${
              activeTab === 'config'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Conexão</span>
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`flex-1 min-w-[120px] py-2 rounded-xl font-bold flex items-center justify-center space-x-1.5 transition-all ${
              activeTab === 'sql'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Script SQL</span>
          </button>
          <button
            onClick={() => setActiveTab('auth')}
            className={`flex-1 min-w-[120px] py-2 rounded-xl font-bold flex items-center justify-center space-x-1.5 transition-all ${
              activeTab === 'auth'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Auth Oficial</span>
          </button>
          <button
            onClick={() => setActiveTab('rls')}
            className={`flex-1 min-w-[120px] py-2 rounded-xl font-bold flex items-center justify-center space-x-1.5 transition-all ${
              activeTab === 'rls'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>RLS Multi-Tenant</span>
          </button>
          <button
            onClick={() => setActiveTab('realtime')}
            className={`flex-1 min-w-[120px] py-2 rounded-xl font-bold flex items-center justify-center space-x-1.5 transition-all ${
              activeTab === 'realtime'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Realtime</span>
          </button>
        </div>

        {/* TAB 1: CREDENCIAIS E CONEXÃO */}
        {activeTab === 'config' && (
          <form onSubmit={handleTestAndSave} className="space-y-4 text-xs">
            
            {/* Indicador de status da configuração (já configurado ou não) */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {isSupabaseConfigured() ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                ) : (
                  <HelpCircle className="w-6 h-6 text-amber-400 shrink-0" />
                )}
                <div>
                  <div className="font-bold text-white text-sm">
                    {isSupabaseConfigured() ? 'Supabase Configurado' : 'Supabase Não Configurado'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {isSupabaseConfigured() 
                      ? 'As credenciais estão preenchidas. Clique em "Testar & Salvar Conexão" para validar.' 
                      : 'Insira sua URL do Supabase e a Chave Anon para habilitar sincronização em nuvem.'}
                  </div>
                </div>
              </div>

              {isSupabaseConfigured() && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* Botão de sincronização completa: envia todos os dados do app para o Supabase */}
                  <button
                    type="button"
                    onClick={handleSyncAllLocal}
                    disabled={isSeeding}
                    title="Forçar envio de todos os registros e usuários criados no app para o banco Supabase"
                    className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition-all text-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin' : ''}`} />
                    <span>{isSeeding ? 'Sincronizando...' : 'Sincronizar Dados do App -> Supabase'}</span>
                  </button>
                  {/* Botão de seed: popula/restaura as tabelas com os dados iniciais de exemplo */}
                  <button
                    type="button"
                    onClick={handleSeedSupabase}
                    disabled={isSeeding}
                    title="Popular/Restaurar tabelas com dados de exemplo iniciais"
                    className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 font-bold px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition-all text-xs"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Popular Dados Seed</span>
                  </button>
                </div>
              )}
            </div>

            {/* Mensagem de sucesso do seed/sincronização (exibida quando houver) */}
            {seedSuccessMsg && (
              <div className="p-3 bg-purple-500/20 border border-purple-500/40 rounded-xl text-purple-200 text-xs font-bold flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                <span>{seedSuccessMsg}</span>
              </div>
            )}

            {/* Campo da URL do projeto Supabase */}
            <div>
              <label className="block font-bold text-slate-200 mb-1 flex items-center space-x-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span>Supabase Project URL</span>
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://xyzxyzxyz.supabase.co"
                className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-emerald-500 text-xs"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Obtenha em: Supabase Dashboard &gt; Project Settings &gt; API &gt; Project URL
              </p>
            </div>

            {/* Campo da chave anon/pública, com alerta caso o usuário cole a chave secreta (service_role) */}
            <div>
              <label className="block font-bold text-slate-200 mb-1 flex items-center space-x-1.5">
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                <span>Supabase Anon / Public Key (Chave Pública)</span>
              </label>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className={`w-full bg-slate-950/80 border rounded-xl p-3 text-slate-200 focus:outline-none text-xs font-mono transition-colors ${
                  isSecretKey(key) ? 'border-rose-500 focus:border-rose-400 bg-rose-950/20' : 'border-white/10 focus:border-emerald-500'
                }`}
              />

              {isSecretKey(key) ? (
                <div className="mt-2 p-3 bg-rose-500/20 border border-rose-500/50 rounded-xl text-xs text-rose-200 space-y-1">
                  <div className="font-extrabold text-rose-300 flex items-center space-x-1.5">
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>⚠️ Chave Secreta (service_role) Detectada!</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-rose-200/90">
                    Você colou a chave <strong>service_role (secreta)</strong>. O Supabase bloqueia requisições do navegador com a chave secreta (<em>Forbidden use of secret API key in browser</em>).
                  </p>
                  <p className="text-[11px] font-bold text-white pt-1">
                    👉 Como corrigir: No painel do Supabase, vá em <u>Project Settings &gt; API</u> e copie o valor do campo <strong>anon (public)</strong>.
                  </p>
                </div>
              ) : (
                <div className="mt-1.5 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[10px] text-amber-300 flex items-start space-x-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Atenção à Chave da API:</strong> Utilize estritamente a chave pública <strong>anon (public)</strong>. O uso da chave secreta <code>service_role</code> é bloqueado pelo Supabase em navegadores.
                  </div>
                </div>
              )}
            </div>

            {/* Feedback do resultado do teste de conexão (sucesso ou erro) */}
            {testResult && (
              <div className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center space-x-2.5 ${
                testResult.success 
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' 
                  : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
              }`}>
                {testResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            {/* Botões de ação do formulário: Fechar e Testar & Salvar Conexão */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2.5 rounded-xl border border-white/10 transition-all"
              >
                Fechar
              </button>
              <button
                type="submit"
                disabled={isTesting}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black px-6 py-2.5 rounded-xl shadow-lg transition-all flex items-center space-x-2"
              >
                {isTesting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                <span>{isTesting ? 'Testando Conexão...' : 'Testar & Salvar Conexão'}</span>
              </button>
            </div>

          </form>
        )}

        {/* TAB 2: SCRIPT SQL - instruções e código SQL para criar as tabelas no Supabase */}
        {activeTab === 'sql' && (
          <div className="space-y-4 text-xs">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="font-bold text-white flex items-center space-x-2">
                <FileCode className="w-4 h-4 text-emerald-400" />
                <span>Instruções de Criação no Supabase</span>
              </div>
              <ol className="list-decimal list-inside text-slate-300 space-y-1 text-[11px] leading-relaxed">
                <li>Abra seu painel no <strong className="text-emerald-400">Supabase</strong>.</li>
                <li>Vá na aba <strong className="text-white">SQL Editor</strong> no menu lateral esquerdo.</li>
                <li>Clique em <strong className="text-white">New Query</strong>, cole o script SQL abaixo e clique em <strong className="text-white">Run</strong>.</li>
                <li>Todas as 11 tabelas com suporte a RLS e relacionamentos serão criadas instantaneamente.</li>
              </ol>
            </div>

            <div className="relative bg-slate-950 p-4 rounded-2xl border border-white/10 font-mono text-[11px] text-emerald-300 max-h-60 overflow-y-auto">
              <button
                onClick={handleCopySql}
                className="absolute top-3 right-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all shadow-md z-10"
              >
                {copiedSql ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedSql ? 'Copiado!' : 'Copiar Script SQL'}</span>
              </button>
              
              <pre className="pr-24">
{`-- TABELAS DO SST QUIZ CORPORATE (resumo — veja as migrations 001..010 para o schema completo)
1. empresas (id, nome, cnpj, plano, ativa, limite_colaboradores, configuracoes JSONB, historico_temporadas JSONB)
2. setores (id, empresa_id, nome, colaboradores_ativos, pontos_totais)
3. usuarios (id, empresa_id, setor_id, nome, email, avatar, perfil, cargo, ativo, is_instrutor, auth_uid, estatisticas JSONB, trofeus_temporadas JSONB, ultimo_quiz_data) — senha NÃO é gravada na nuvem
4. perguntas (id, empresa_id, categoria, tipo, dificuldade, enunciado, alternativas, resposta_correta, explicacao, tempo_limite_segundos, norma_relacionada, ativa, disponivel_desafios)
5. campanhas (id, empresa_id, nome, descricao, frequencia, setores_alvo, quantidade_perguntas, pergunta_ids, data_inicio, data_fim, horario_disparo, ativa, pontos_por_acerto)
6. quizzes (id, empresa_id, colaborador_id, campanha_id, titulo, categoria, perguntas, status, pontuacao_total, respostas, criado_em, respondido_em)
7. desafios_1v1 (id, empresa_id, desafiante_id, desafiante_setor_id, desafiado_id, desafiado_setor_id, tema_sorteado, status, vale_ponto, tipo, aposta_pontos, pontuacao_setor, vencedor_id, vencedor_setor_id, motivo_vitoria, placar_final, decidido_no_desempate, data_criacao, perguntas, respostas_desafiante, respostas_desafiado, revanche_id, data_aceite, data_conclusao)
8. premiacoes (id, empresa_id, titulo, descricao, tipo, mes_referencia, requisito, custo_pontos, estoque, ativo, imagem)
9. resgates_premios (id, empresa_id, usuario_id, usuario_nome, usuario_email, usuario_setor_nome, premiacao_id, premiacao_titulo, premiacao_imagem, custo_pontos, status, data_resgate, data_atualizacao, observacoes)
10. notificacoes (id, usuario_id, titulo, mensagem, tipo, link_acao, lida, criada_em, canal)
11. backups_historico (id, empresa_id, tipo, data, tamanho_kb, resumo, dados JSONB, escopo)
12. salas_quiz_guiado (id, pin, nome, treinamento_titulo, instrutor_id, instrutor_nome, empresa_id, data_criacao, status, modalidade, estilo, nota_minima, tempo_por_pergunta_seg, perguntas JSONB, pergunta_atual_index, mostrar_ranking, permitir_visitantes, participantes JSONB, revelar_resposta_atual, mostrar_modo_tv, estado_apresentacao, sessao_id, question_started_at, question_ends_at, historico_sessoes, posicoes_anteriores, nota_minima_aprovacao, tempo_por_pergunta)
13. resultados_avaliacao_sst (id, sala_id, participante_nome, participante_id, cpf_ou_empresa, is_visitante, treinamento_titulo, instrutor_nome, data, total_perguntas, acertos, erros, nota_final, nota_minima, situacao, desempenho_por_tema JSONB, respostas_detalhadas JSONB, matricula, cpf, cargo, setor_nome, email, sala_nome, data_finalizacao, porcentagem_acertos, questoes_corretas, total_questoes, nota_minima_aprovacao)
14. pontos_ledger (id, empresa_id, usuario_id, tipo, valor, origem, referencia_id, descricao, criado_em)
15. quiz_guiado_respostas (registro imutável de respostas do quiz guiado)`}
              </pre>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={handleCopySql}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-5 py-2.5 rounded-xl shadow-lg transition-all flex items-center space-x-2"
              >
                {copiedSql ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedSql ? 'Script Copiado para a Área de Transferência!' : 'Copiar Código SQL Completo'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2.5 rounded-xl border border-white/10 transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: SUPABASE AUTH - integração com a autenticação oficial (JWT/Bcrypt) */}
        {activeTab === 'auth' && (
          <div className="space-y-4 text-xs">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="font-bold text-white flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Supabase Auth & Criptografia (JWT / Bcrypt)</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Integração oficial com <code>supabase.auth.signUp()</code> e <code>supabase.auth.signInWithPassword()</code> ativada no aplicativo.
                Garante senhas salvas com hash de alta segurança (Bcrypt) no schema <code>auth.users</code>, tokens JWT e suporte a Login Social (Google / Microsoft Azure).
              </p>
            </div>

            {/* AVISO IMPORTANTE SOBRE CÓDIGO JS vs SQL */}
            <div className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-200 text-xs font-bold space-y-1">
              <div className="text-amber-300 font-extrabold flex items-center space-x-1.5">
                <XCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>⚠️ ATENÇÃO: NÃO COLE O CÓDIGO ABAIXO NO SQL EDITOR!</span>
              </div>
              <p className="text-[11px] font-normal text-slate-200">
                O trecho a seguir é <strong>código JavaScript do Frontend</strong> (já embutido e rodando no aplicativo). Ele serve apenas como referência para desenvolvedores. O SQL Editor do Supabase aceita exclusivamente comandos SQL.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-white/10 space-y-2 font-mono text-[11px] text-emerald-300">
              <div className="text-slate-400 font-sans font-bold text-xs">💻 Exemplo de Chamada de Cadastro em JavaScript (Frontend):</div>
              <pre className="overflow-x-auto p-2 bg-slate-900 rounded-xl">
{`const { data, error } = await supabase.auth.signUp({
  email: 'operador@empresa.com.br',
  password: 'SuaSenhaSegura123',
  options: {
    data: {
      nome: 'Carlos Eduardo',
      empresa_id: 'emp-1',
      perfil: 'colaborador'
    }
  }
});`}
              </pre>
            </div>

            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-200 text-xs">
              <strong>💡 Dica de Produção:</strong> No painel do Supabase, acesse <u>Authentication &gt; Providers</u> para ativar OAuth de Login Social com Google ou Microsoft em 1 clique.
            </div>
          </div>
        )}

        {/* TAB 4: RLS MULTI-TENANT - políticas de isolamento de dados por empresa */}
        {activeTab === 'rls' && (
          <div className="space-y-4 text-xs">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="font-bold text-white flex items-center space-x-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Políticas de Segurança RLS Multi-Tenant por Empresa (SQL)</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Para isolar os dados entre diferentes empresas em produção, execute o script SQL abaixo no <strong>SQL Editor</strong> do Supabase. As funções <code>user_empresa_id()</code> e <code>is_super_admin()</code> são <code>SECURITY DEFINER</code> (evitam recursão de RLS) e usam a coluna <code>auth_uid</code> (vínculo com o Supabase Auth). O script é idempotente (pode rodar mais de uma vez).
              </p>
            </div>

            <div className="relative bg-slate-950 p-4 rounded-2xl border border-white/10 font-mono text-[11px] text-emerald-300 max-h-60 overflow-y-auto">
              <pre>
{`-- SCRIPT RLS MULTI-TENANT POR EMPRESA (Executar no SQL Editor)
-- Idempotente: seguro rodar mais de uma vez.

-- 1. Helper: empresa do usuário autenticado via auth.uid() -> usuarios.auth_uid
--    SECURITY DEFINER burla a RLS para evitar recursão infinita.
CREATE OR REPLACE FUNCTION public.user_empresa_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT empresa_id FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT perfil = 'super_admin' FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1), false)
$$;

-- Helper: id do usuário no app (usuarios.id) correspondente ao auth.uid() atual.
-- Necessário porque as salas guardam instrutor_id com o id do app (ex.: 'usr-admin'),
-- e não o UUID do Supabase Auth.
CREATE OR REPLACE FUNCTION public.usuario_id_atual()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1
$$;

-- Helper: usuário pode criar/gerenciar salas de Quiz Guiado
-- (Instrutor SST, Admin ou Super Admin).
CREATE OR REPLACE FUNCTION public.is_instrutor_ou_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT (is_instrutor = true OR perfil IN ('admin', 'super_admin'))
    FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1
  ), false)
$$;

-- Helper: perfil (role) do usuário autenticado (ex.: 'admin', 'colaborador').
-- Usado nas políticas de leitura para o ADMIN ver as salas da PRÓPRIA empresa.
CREATE OR REPLACE FUNCTION public.usuario_atual_perfil()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT perfil FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1), '')
$$;

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perguntas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desafios_1v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salas_quiz_guiado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resultados_avaliacao_sst ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premiacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resgates_premios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total empresas" ON public.empresas;
DROP POLICY IF EXISTS "Empresa Isola Empresas" ON public.empresas;
DROP POLICY IF EXISTS "Super Admin Gerencia Empresas" ON public.empresas;
DROP POLICY IF EXISTS "Empresas Escrita Bootstrap" ON public.empresas;
CREATE POLICY "Empresa Isola Empresas" ON public.empresas
FOR SELECT USING (id = public.user_empresa_id() OR public.is_super_admin() OR (NOT EXISTS (SELECT 1 FROM public.empresas LIMIT 1)));
CREATE POLICY "Super Admin Gerencia Empresas" ON public.empresas
FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Empresas Escrita Bootstrap" ON public.empresas
FOR INSERT WITH CHECK (public.is_super_admin() OR (NOT EXISTS (SELECT 1 FROM public.empresas LIMIT 1)));

DROP POLICY IF EXISTS "Acesso total setores" ON public.setores;
DROP POLICY IF EXISTS "Empresa Isola Setores" ON public.setores;
CREATE POLICY "Empresa Isola Setores" ON public.setores
FOR ALL USING (empresa_id = public.user_empresa_id() OR public.is_super_admin())
WITH CHECK (empresa_id = public.user_empresa_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Acesso total usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Empresa Isola Usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Empresa Isola Usuarios Leitura" ON public.usuarios;
DROP POLICY IF EXISTS "Empresa Isola Usuarios Escrita" ON public.usuarios;
CREATE POLICY "Empresa Isola Usuarios Leitura" ON public.usuarios
FOR SELECT USING (empresa_id = public.user_empresa_id() OR public.is_super_admin());
CREATE POLICY "Empresa Isola Usuarios Escrita" ON public.usuarios
FOR UPDATE USING (empresa_id = public.user_empresa_id() OR public.is_super_admin())
WITH CHECK (empresa_id = public.user_empresa_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Acesso total perguntas" ON public.perguntas;
DROP POLICY IF EXISTS "Empresa Isola Perguntas" ON public.perguntas;
CREATE POLICY "Empresa Isola Perguntas" ON public.perguntas
FOR ALL USING (empresa_id = public.user_empresa_id() OR public.is_super_admin())
WITH CHECK (empresa_id = public.user_empresa_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Empresa Isola Salas Quiz Guiado" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Acesso total salas_quiz_guiado" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Salas Leitura Publica" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Salas Escrita Instrutor" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Salas Update Instrutor" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Salas Delete Instrutor" ON public.salas_quiz_guiado;
CREATE POLICY "Salas Leitura Publica" ON public.salas_quiz_guiado
FOR SELECT USING (public.is_super_admin() OR instrutor_id = public.usuario_id_atual() OR (public.usuario_atual_perfil() = 'admin' AND empresa_id = public.user_empresa_id()) OR EXISTS (
  SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(participantes) = 'array' THEN participantes ELSE '[]'::jsonb END) AS p
  WHERE p->>'usuario_id' = public.usuario_id_atual()
));
-- SECURITY: somente Instrutor SST/Admin/Super Admin da MESMA EMPRESA (ou Super Admin global) podem CRIAR.
CREATE POLICY "Salas Escrita Instrutor" ON public.salas_quiz_guiado
FOR INSERT WITH CHECK (public.is_super_admin() OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id()));
CREATE POLICY "Salas Update Instrutor" ON public.salas_quiz_guiado
FOR UPDATE USING (public.is_super_admin() OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id()) OR empresa_id = public.user_empresa_id() OR EXISTS (
  SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(participantes) = 'array' THEN participantes ELSE '[]'::jsonb END) AS p
  WHERE p->>'usuario_id' = (SELECT id FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1)
))
WITH CHECK (public.is_super_admin() OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id()) OR empresa_id = public.user_empresa_id() OR EXISTS (
  SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(participantes) = 'array' THEN participantes ELSE '[]'::jsonb END) AS p
  WHERE p->>'usuario_id' = (SELECT id FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1)
));
CREATE POLICY "Salas Delete Instrutor" ON public.salas_quiz_guiado
FOR DELETE USING (public.is_super_admin() OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id()));

DROP POLICY IF EXISTS "Empresa Isola Resultados Avaliacao" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Acesso total resultados_avaliacao_sst" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Leitura Publica" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Leitura Escopo" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Leitura Autor" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Insert Participante" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Update Instrutor" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Update Escopo" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Update Autor" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Delete Instrutor" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Delete Escopo" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Delete Autor" ON public.resultados_avaliacao_sst;
CREATE POLICY "Resultados Leitura Publica" ON public.resultados_avaliacao_sst
FOR SELECT USING (true);
CREATE POLICY "Resultados Insert Participante" ON public.resultados_avaliacao_sst
FOR INSERT WITH CHECK (true);
CREATE POLICY "Resultados Update Instrutor" ON public.resultados_avaliacao_sst
FOR UPDATE USING (
  public.is_super_admin()
  OR (instrutor_id IS NOT NULL AND instrutor_id = public.usuario_id_atual())
  OR (empresa_id IS NOT NULL AND empresa_id = public.user_empresa_id())
  OR (participante_id IS NOT NULL AND participante_id = public.usuario_id_atual())
);
CREATE POLICY "Resultados Delete Instrutor" ON public.resultados_avaliacao_sst
FOR DELETE USING (
  public.is_super_admin()
  OR (instrutor_id IS NOT NULL AND instrutor_id = public.usuario_id_atual())
  OR (empresa_id IS NOT NULL AND empresa_id = public.user_empresa_id())
);

-- CAMPANHAS
DROP POLICY IF EXISTS "Campanhas Escopo Empresa" ON public.campanhas;
DROP POLICY IF EXISTS "Campanhas Leitura Empresa" ON public.campanhas;
DROP POLICY IF EXISTS "Campanhas Insert Gestao" ON public.campanhas;
DROP POLICY IF EXISTS "Campanhas Update Gestao" ON public.campanhas;
DROP POLICY IF EXISTS "Campanhas Delete Gestao" ON public.campanhas;
CREATE POLICY "Campanhas Leitura Empresa" ON public.campanhas FOR SELECT USING (public.modo_legado_anonimo() OR public.is_super_admin() OR empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL);
CREATE POLICY "Campanhas Insert Gestao" ON public.campanhas FOR INSERT WITH CHECK (public.modo_legado_anonimo() OR public.is_super_admin() OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL)));
CREATE POLICY "Campanhas Update Gestao" ON public.campanhas FOR UPDATE USING (public.modo_legado_anonimo() OR public.is_super_admin() OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))) WITH CHECK (public.modo_legado_anonimo() OR public.is_super_admin() OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL)));
CREATE POLICY "Campanhas Delete Gestao" ON public.campanhas FOR DELETE USING (public.modo_legado_anonimo() OR public.is_super_admin() OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL)));

-- DESAFIOS 1V1
DROP POLICY IF EXISTS "Desafios Escrita Participante" ON public.desafios_1v1;
DROP POLICY IF EXISTS "Desafios Update Participante" ON public.desafios_1v1;
DROP POLICY IF EXISTS "Desafios Leitura Escopo" ON public.desafios_1v1;
CREATE POLICY "Desafios Leitura Escopo" ON public.desafios_1v1 FOR SELECT USING (public.modo_legado_anonimo() OR desafiante_id = public.usuario_id_atual() OR desafiado_id = public.usuario_id_atual() OR empresa_id = public.user_empresa_id() OR public.is_super_admin() OR public.user_empresa_id() IS NULL);
CREATE POLICY "Desafios Escrita Participante" ON public.desafios_1v1 FOR INSERT WITH CHECK (public.modo_legado_anonimo() OR desafiante_id = public.usuario_id_atual() OR desafiado_id = public.usuario_id_atual() OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id()) OR public.is_super_admin());
CREATE POLICY "Desafios Update Participante" ON public.desafios_1v1 FOR UPDATE USING (public.modo_legado_anonimo() OR desafiante_id = public.usuario_id_atual() OR desafiado_id = public.usuario_id_atual() OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id()) OR public.is_super_admin()) WITH CHECK (public.modo_legado_anonimo() OR desafiante_id = public.usuario_id_atual() OR desafiado_id = public.usuario_id_atual() OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id()) OR public.is_super_admin());

-- NOTIFICACOES
DROP POLICY IF EXISTS "Acesso total notificacoes" ON public.notificacoes;
DROP POLICY IF EXISTS "Notificacoes Leitura e Escrita" ON public.notificacoes;
CREATE POLICY "Notificacoes Leitura e Escrita" ON public.notificacoes FOR ALL USING (public.modo_legado_anonimo() OR usuario_id = public.usuario_id_atual() OR public.is_super_admin() OR empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL) WITH CHECK (public.modo_legado_anonimo() OR usuario_id = public.usuario_id_atual() OR public.is_super_admin() OR empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL);
`}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 5: REALTIME - escuta em tempo real de mudanças nas tabelas */}
        {activeTab === 'realtime' && (
          <div className="space-y-4 text-xs">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="font-bold text-white flex items-center space-x-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span>Supabase Realtime (Comando SQL e Código JS)</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Para ativar a transmissão ao vivo de dados em tempo real no Supabase, execute o comando SQL abaixo no <strong>SQL Editor</strong> do seu Supabase.
              </p>
            </div>

            {/* COMANDO SQL REALTIME */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-emerald-500/30 space-y-2 font-mono text-[11px] text-emerald-300">
              <div className="text-emerald-400 font-sans font-bold text-xs flex items-center space-x-1.5">
                <FileCode className="w-4 h-4 text-emerald-400" />
                <span>🛢️ Comando SQL para Executar no SQL Editor do Supabase:</span>
              </div>
              <pre className="overflow-x-auto p-2 bg-slate-900 rounded-xl text-emerald-300">
{`-- Habilitar Publicação Realtime para Salas e Desafios
ALTER PUBLICATION supabase_realtime ADD TABLE public.salas_quiz_guiado;
ALTER PUBLICATION supabase_realtime ADD TABLE public.resultados_avaliacao_sst;
ALTER PUBLICATION supabase_realtime ADD TABLE public.desafios_1v1;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;`}
              </pre>
            </div>

            {/* AVISO IMPORTANTE SOBRE CÓDIGO JS vs SQL */}
            <div className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-200 text-xs font-bold space-y-1">
              <div className="text-amber-300 font-extrabold flex items-center space-x-1.5">
                <XCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>⚠️ ATENÇÃO: NÃO COLE O CÓDIGO JAVASCRIPT ABAIXO NO SQL EDITOR!</span>
              </div>
              <p className="text-[11px] font-normal text-slate-200">
                O trecho a seguir é apenas o <strong>código JavaScript do aplicativo</strong> mostrando como o frontend escuta as atualizações via WebSocket. Não deve ser executado no SQL Editor.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-white/10 space-y-2 font-mono text-[11px] text-slate-300">
              <div className="text-slate-400 font-sans font-bold text-xs">💻 Código JavaScript Já Ativo no Frontend (SSTContext):</div>
              <pre className="overflow-x-auto p-2 bg-slate-900 rounded-xl text-slate-300">
{`const channel = supabase
  .channel('public:realtime_sst_channel')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'salas_quiz_guiado'
  }, (payload) => {
    // Sincroniza salas do quiz guiado em tempo real
  })
  .subscribe();`}
              </pre>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
