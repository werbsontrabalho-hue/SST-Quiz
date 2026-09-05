-- ============================================================
-- 027_reverter_leitura_aberta.sql — REVERTE A POLICY DE ENTRADA POR PIN
-- ------------------------------------------------------------
-- A 026 adicionou uma policy de SELECT na TABELA BASE para permitir a
-- entrada por PIN, mas isso liberou também a leitura do GABARITO
-- (resposta_correta/explicacao) na base para qualquer autenticado da mesma
-- empresa — anulando o anti-cola. Como a view sanitizada é security_invoker
-- e herda a RLS da base, não é possível liberar só a view.
--
-- DECISÃO: reverter a 026. O fluxo de entrada por PIN usa o servidor
-- Express local (que sanitiza e não tem RLS); o Supabase serve apenas como
-- fallback para participantes já inscritos. A pendência de UX (participante
-- novo via Supabase puro) fica documentada como menor frente ao risco de
-- vazamento de gabarito.
-- NÃO-DESTRUTIVO: remove apenas a policy adicionada na 026.
-- ============================================================

DROP POLICY IF EXISTS "Salas Leitura Entrada PIN" ON public.salas_quiz_guiado;