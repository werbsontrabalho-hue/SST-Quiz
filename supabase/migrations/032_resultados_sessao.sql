-- ============================================================
-- 032_resultados_sessao.sql — COLUNAS DE SESSÃO NOS RESULTADOS
-- ------------------------------------------------------------
-- QA/Homologação: a migration 009 adicionou colunas de relatório aos
-- resultados, mas NÃO incluiu sessao_id / codigo_documento / sessao_codigo.
-- O frontend passou a enviá-los (para separar avaliações por sessão e gerar
-- código de documento único) e o upsert falhava com 42703. Adicionamos as
-- colunas de forma NÃO-DESTRUTIVA.
-- ============================================================

ALTER TABLE public.resultados_avaliacao_sst
  ADD COLUMN IF NOT EXISTS sessao_id TEXT,
  ADD COLUMN IF NOT EXISTS codigo_documento TEXT,
  ADD COLUMN IF NOT EXISTS sessao_codigo TEXT;

-- Índice para consulta de histórico por sessão.
CREATE INDEX IF NOT EXISTS idx_resultados_sessao ON public.resultados_avaliacao_sst (sala_id, sessao_id);