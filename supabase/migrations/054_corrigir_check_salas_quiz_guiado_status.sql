-- ============================================================
-- 054_corrigir_check_salas_quiz_guiado_status.sql
-- ------------------------------------------------------------
-- CORREÇÃO DE CHECK CONSTRAINT DE STATUS DA TABELA SALAS_QUIZ_GUIADO:
--
-- Permite os status:
--   'aguardando', 'em_andamento', 'finalizada', 'concluido', 'concluida',
--   'pausado', 'cancelada', 'encerrado', 'aberta', 'fechada'
-- ============================================================

-- 1. Atualizar CHECK constraint de status da tabela salas_quiz_guiado
ALTER TABLE public.salas_quiz_guiado DROP CONSTRAINT IF EXISTS salas_quiz_guiado_status_check;
ALTER TABLE public.salas_quiz_guiado ADD CONSTRAINT salas_quiz_guiado_status_check 
  CHECK (status IN ('aguardando', 'em_andamento', 'finalizada', 'concluido', 'concluida', 'pausado', 'cancelada', 'encerrado', 'aberta', 'fechada'));
