-- ============================================================
-- 052_corrigir_check_desafios_status.sql
-- ------------------------------------------------------------
-- CORREÇÃO DE CHECK CONSTRAINT E SCHEMA DA TABELA DESAFIOS 1V1:
--
-- 1. Permite os status: 'pendente', 'aceito', 'em_andamento', 'concluido', 'recusado', 'expirado', 'cancelado', 'finalizado'.
--    (Remove a restrição antiga que causava erro ao salvar desafios em andamento)
--
-- 2. Garante colunas de apoio:
--    - aposta_pontos (INT)
--    - motivo_vitoria (TEXT)
--    - placar_final (TEXT)
--    - decidido_no_desempate (BOOLEAN)
-- ============================================================

-- 1. Atualizar CHECK constraint de status da tabela desafios_1v1
ALTER TABLE public.desafios_1v1 DROP CONSTRAINT IF EXISTS desafios_1v1_status_check;
ALTER TABLE public.desafios_1v1 ADD CONSTRAINT desafios_1v1_status_check 
  CHECK (status IN ('pendente', 'aceito', 'em_andamento', 'concluido', 'recusado', 'expirado', 'cancelado', 'finalizado'));

-- 2. Garantir colunas essenciais do modelo de Desafio1v1
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS aposta_pontos INT DEFAULT 50;
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS motivo_vitoria TEXT;
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS placar_final TEXT;
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS decidido_no_desempate BOOLEAN DEFAULT FALSE;
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS data_aceite TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS data_conclusao TIMESTAMP WITH TIME ZONE;
