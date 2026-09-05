-- ============================================================
-- ESQUEMA DO BANCO DE DADOS SUPABASE (POSTGRESQL) - SST QUIZ SAAS
-- Executar este script no SQL Editor do seu Dashboard Supabase.
-- ============================================================

-- 1. TABELA DE EMPRESAS
CREATE TABLE IF NOT EXISTS public.empresas (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    cnpj TEXT NOT NULL,
    plano TEXT NOT NULL DEFAULT 'Basic',
    ativa BOOLEAN DEFAULT true,
    limite_colaboradores INT DEFAULT 50,
    configuracoes JSONB DEFAULT '{
        "limiteDesafiosSemana": 3,
        "pontosVitoriaDesafio": 50,
        "perguntasPorDesafio": 5,
        "desempateRule": "desafiante",
        "tempoLimiteAceiteHoras": 48,
        "permitirAmistosos": true,
        "permitirMesmoSetorAmistoso": true,
        "percentualMinimoParticipacao": 50,
        "regrasTrofeus": {
            "vitoriasTotais": [
                {"meta": 10, "trofeuId": "t-bronze", "imagem": "medalha_bronze", "nome": "Bronze", "ativo": true, "modoContagem": "acumulado", "mostrarProgresso": true, "limiteProximidade": 3},
                {"meta": 30, "trofeuId": "t-prata", "imagem": "medalha_prata", "nome": "Prata", "ativo": true, "modoContagem": "acumulado", "mostrarProgresso": true, "limiteProximidade": 5},
                {"meta": 50, "trofeuId": "t-ouro", "imagem": "medalha_ouro", "nome": "Ouro", "ativo": true, "modoContagem": "acumulado", "mostrarProgresso": true, "limiteProximidade": 5}
            ],
            "winStreak": [
                {"meta": 3, "trofeuId": "s-bronze", "imagem": "streak_3", "nome": "Em Forma", "ativo": true, "modoContagem": "sequencial", "mostrarProgresso": true, "limiteProximidade": 2},
                {"meta": 7, "trofeuId": "s-prata", "imagem": "streak_7", "nome": "Consistente", "ativo": true, "modoContagem": "sequencial", "mostrarProgresso": true, "limiteProximidade": 2},
                {"meta": 15, "trofeuId": "s-ouro", "imagem": "streak_15", "nome": "Imbatível", "ativo": true, "modoContagem": "sequencial", "mostrarProgresso": true, "limiteProximidade": 3}
            ],
            "acertosTotais": [
                {"meta": 100, "trofeuId": "a-bronze", "imagem": "acertos_100", "nome": "Estudioso", "ativo": true, "modoContagem": "acumulado", "mostrarProgresso": true, "limiteProximidade": 20}
            ],
            "defesasImbativel": [
                {"meta": 5, "trofeuId": "d-bronze", "imagem": "defesa_1", "nome": "Defesa Sólida", "ativo": true, "modoContagem": "acumulado", "mostrarProgresso": true, "limiteProximidade": 2, "gatilhoDefesa": "desafiado"}
            ],
            "recuperacoesEpicas": [
                {"meta": 1, "trofeuId": "r-bronze", "imagem": "recuperacao_1", "nome": "Recuperação Épica", "ativo": true, "modoContagem": "acumulado", "mostrarProgresso": true, "limiteProximidade": 1, "gatilhoDefesa": "ambos"}
            ],
            "veteranoSST": [
                {"meta": 10, "trofeuId": "v-bronze", "imagem": "veterano_10", "nome": "Veterano SST", "ativo": true, "modoContagem": "acumulado", "mostrarProgresso": true, "limiteProximidade": 2}
            ]
        }
    }'::jsonb,
    data_contratacao TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. TABELA DE SETORES
CREATE TABLE IF NOT EXISTS public.setores (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    colaboradores_ativos INT DEFAULT 0
);

-- 3. TABELA DE USUÁRIOS
CREATE TABLE IF NOT EXISTS public.usuarios (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    setor_id TEXT REFERENCES public.setores(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT,
    avatar TEXT,
    perfil TEXT NOT NULL DEFAULT 'colaborador',
    cargo TEXT NOT NULL DEFAULT 'Colaborador',
    ativo BOOLEAN DEFAULT true,
    is_instrutor BOOLEAN DEFAULT false,
    estatisticas JSONB DEFAULT '{
        "pontos_quizzes": 0,
        "pontos_desafios": 0,
        "pontos_totais": 0,
        "streak_dias": 0,
        "quizzes_respondidos": 0,
        "acertos_totais": 0,
        "erros_totais": 0,
        "tempo_medio_resposta_seg": 0,
        "desafios_vencidos": 0,
        "desafios_jogados": 0,
        "medalhas": []
    }'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TABELA DE BANCO DE PERGUNTAS DE SST
CREATE TABLE IF NOT EXISTS public.perguntas (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    categoria TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'multipla_escolha',
    dificuldade TEXT NOT NULL DEFAULT 'Médio',
    enunciado TEXT NOT NULL,
    alternativas JSONB NOT NULL,
    resposta_correta INT NOT NULL DEFAULT 0,
    explicacao TEXT,
    tempo_limite_segundos INT DEFAULT 30,
    norma_relacionada TEXT,
    disponivel_desafios BOOLEAN DEFAULT true,
    ativa BOOLEAN DEFAULT true
);

-- 5. TABELA DE CAMPANHAS DE TREINAMENTO
CREATE TABLE IF NOT EXISTS public.campanhas (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    descricao TEXT,
    frequencia TEXT DEFAULT 'diaria',
    setores_alvo JSONB DEFAULT '["todos"]'::jsonb,
    quantidade_perguntas INT DEFAULT 5,
    pergunta_ids JSONB DEFAULT '[]'::jsonb,
    data_inicio TEXT,
    data_fim TEXT,
    horario_disparo TEXT DEFAULT '08:00',
    ativa BOOLEAN DEFAULT true
);

-- 6. TABELA DE QUIZZES (SESSÕES DISPARADAS)
CREATE TABLE IF NOT EXISTS public.quizzes (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    colaborador_id TEXT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    campanha_id TEXT REFERENCES public.campanhas(id) ON DELETE SET NULL,
    titulo TEXT NOT NULL,
    categoria TEXT NOT NULL,
    perguntas JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente',
    pontuacao_total INT DEFAULT 0,
    respostas JSONB DEFAULT '[]'::jsonb,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    respondido_em TIMESTAMP WITH TIME ZONE
);

-- 7. TABELA DE DESAFIOS 1V1
CREATE TABLE IF NOT EXISTS public.desafios_1v1 (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    desafiante_id TEXT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    desafiante_setor_id TEXT,
    desafiado_id TEXT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    desafiado_setor_id TEXT,
    tema_sorteado TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceito', 'em_andamento', 'concluido', 'recusado', 'expirado', 'cancelado', 'finalizado')),
    vale_ponto BOOLEAN DEFAULT true,
    tipo TEXT NOT NULL DEFAULT 'competitivo',
    aposta_pontos INT DEFAULT 50,
    pontuacao_setor INT DEFAULT 50,
    vencedor_id TEXT REFERENCES public.usuarios(id) ON DELETE SET NULL,
    vencedor_setor_id TEXT,
    motivo_vitoria TEXT,
    placar_final TEXT,
    decidido_no_desempate BOOLEAN DEFAULT false,
    data_criacao TEXT,
    data_aceite TIMESTAMP WITH TIME ZONE,
    data_conclusao TIMESTAMP WITH TIME ZONE,
    perguntas JSONB NOT NULL,
    respostas_desafiante JSONB DEFAULT '[]'::jsonb,
    respostas_desafiado JSONB DEFAULT '[]'::jsonb,
    revanche_id TEXT
);

-- 8. TABELA DE PREMIAÇÕES DE SST
CREATE TABLE IF NOT EXISTS public.premiacoes (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descricao TEXT,
    tipo TEXT NOT NULL DEFAULT 'brinde',
    mes_referencia TEXT,
    requisito TEXT,
    imagem TEXT
);

-- 9. TABELA DE SALAS DE QUIZ GUIADO (TEMPO REAL / TREINAMENTOS)
CREATE TABLE IF NOT EXISTS public.salas_quiz_guiado (
    id TEXT PRIMARY KEY,
    pin TEXT NOT NULL,
    nome TEXT,
    treinamento_titulo TEXT NOT NULL,
    instrutor_id TEXT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    instrutor_nome TEXT NOT NULL,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'aguardando',
    modalidade TEXT NOT NULL DEFAULT 'interativo',
    estilo TEXT DEFAULT 'educacional',
    nota_minima NUMERIC DEFAULT 7.0,
    tempo_por_pergunta_seg INT DEFAULT 30,
    perguntas JSONB DEFAULT '[]'::jsonb,
    pergunta_atual_index INT DEFAULT 0,
    mostrar_ranking BOOLEAN DEFAULT true,
    permitir_visitantes BOOLEAN DEFAULT true,
    participantes JSONB DEFAULT '[]'::jsonb,
    revelar_resposta_atual BOOLEAN DEFAULT false,
    mostrar_modo_tv BOOLEAN DEFAULT true
);

-- 10. TABELA DE RESULTADOS E LAUDOS DE AVALIAÇÃO SST
CREATE TABLE IF NOT EXISTS public.resultados_avaliacao_sst (
    id TEXT PRIMARY KEY,
    sala_id TEXT REFERENCES public.salas_quiz_guiado(id) ON DELETE SET NULL,
    participante_nome TEXT NOT NULL,
    participante_id TEXT,
    cpf_ou_empresa TEXT,
    is_visitante BOOLEAN DEFAULT false,
    treinamento_titulo TEXT NOT NULL,
    instrutor_nome TEXT NOT NULL,
    data TEXT NOT NULL,
    total_perguntas INT NOT NULL,
    acertos INT NOT NULL,
    erros INT NOT NULL,
    nota_final NUMERIC NOT NULL,
    nota_minima NUMERIC NOT NULL,
    situacao TEXT NOT NULL,
    desempenho_por_tema JSONB DEFAULT '[]'::jsonb,
    respostas_detalhadas JSONB DEFAULT '[]'::jsonb
);

-- POLÍTICAS DE SEGURANÇA (RLS - ROW LEVEL SECURITY)
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perguntas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desafios_1v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premiacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salas_quiz_guiado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resultados_avaliacao_sst ENABLE ROW LEVEL SECURITY;

-- Permissões públicas para API anon / authenticated (Desenvolvimento e Produção com chave Anon)
CREATE POLICY "Acesso total empresas" ON public.empresas FOR ALL USING (true);
CREATE POLICY "Acesso total setores" ON public.setores FOR ALL USING (true);
CREATE POLICY "Acesso total usuarios" ON public.usuarios FOR ALL USING (true);
CREATE POLICY "Acesso total perguntas" ON public.perguntas FOR ALL USING (true);
CREATE POLICY "Acesso total campanhas" ON public.campanhas FOR ALL USING (true);
CREATE POLICY "Acesso total quizzes" ON public.quizzes FOR ALL USING (true);
CREATE POLICY "Acesso total desafios_1v1" ON public.desafios_1v1 FOR ALL USING (true);
CREATE POLICY "Acesso total premiacoes" ON public.premiacoes FOR ALL USING (true);
CREATE POLICY "Acesso total salas_quiz_guiado" ON public.salas_quiz_guiado FOR ALL USING (true);
CREATE POLICY "Acesso total resultados_avaliacao_sst" ON public.resultados_avaliacao_sst FOR ALL USING (true);

-- ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON public.usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_setor ON public.usuarios(setor_id);
CREATE INDEX IF NOT EXISTS idx_setores_empresa ON public.setores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_perguntas_empresa ON public.perguntas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_colaborador ON public.quizzes(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_desafios_empresa ON public.desafios_1v1(empresa_id);
CREATE INDEX IF NOT EXISTS idx_salas_empresa ON public.salas_quiz_guiado(empresa_id);
CREATE INDEX IF NOT EXISTS idx_salas_pin ON public.salas_quiz_guiado(pin);
CREATE INDEX IF NOT EXISTS idx_resultados_sala ON public.resultados_avaliacao_sst(sala_id);

-- PUBLICAR TABELAS NO SUPABASE REALTIME
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.salas_quiz_guiado;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.resultados_avaliacao_sst;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.desafios_1v1;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
