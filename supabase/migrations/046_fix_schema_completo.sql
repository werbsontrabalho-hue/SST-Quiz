-- ============================================================
-- 046_fix_schema_completo.sql
-- ------------------------------------------------------------
-- CORREÇÕES DE SCHEMA identificadas na auditoria geral.
-- RLS simplificadas (FOR ALL USING true) para evitar dependências
-- circulares com funções auxiliares que exigem auth_uid.
-- ============================================================

-- 1. COLUNA auth_uid (CRÍTICO — sem ela, RLS autenticado falha)
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS auth_uid TEXT UNIQUE;

-- 2. TABELA resgates_premios
CREATE TABLE IF NOT EXISTS public.resgates_premios (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    usuario_id TEXT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    usuario_nome TEXT,
    usuario_email TEXT,
    usuario_setor_nome TEXT,
    premiacao_id TEXT NOT NULL REFERENCES public.premiacoes(id) ON DELETE CASCADE,
    premiacao_titulo TEXT,
    premiacao_imagem TEXT,
    custo_pontos INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pendente',
    data_resgate TIMESTAMPTZ DEFAULT NOW(),
    data_atualizacao TIMESTAMPTZ,
    observacoes TEXT
);

ALTER TABLE public.resgates_premios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total resgates_premios" ON public.resgates_premios;
CREATE POLICY "Acesso total resgates_premios" ON public.resgates_premios
    FOR ALL USING (true) WITH CHECK (true);

-- 3. TABELA notificacoes
CREATE TABLE IF NOT EXISTS public.notificacoes (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    empresa_id TEXT REFERENCES public.empresas(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    tipo TEXT DEFAULT 'sistema',
    lida BOOLEAN DEFAULT false,
    criada_em TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total notificacoes" ON public.notificacoes;
CREATE POLICY "Acesso total notificacoes" ON public.notificacoes
    FOR ALL USING (true) WITH CHECK (true);

-- 4. TABELA backups_historico
CREATE TABLE IF NOT EXISTS public.backups_historico (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    usuario_id TEXT REFERENCES public.usuarios(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL DEFAULT 'manual',
    escopo TEXT DEFAULT 'empresa',
    dados JSONB NOT NULL DEFAULT '{}'::jsonb,
    tamanho_bytes INT DEFAULT 0,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.backups_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total backups_historico" ON public.backups_historico;
CREATE POLICY "Acesso total backups_historico" ON public.backups_historico
    FOR ALL USING (true) WITH CHECK (true);

-- 5. Habilitar Realtime nas novas tabelas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'notificacoes'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;
    END IF;
END
$$;
