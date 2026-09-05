-- ============================================================
-- 039_habilitar_realtime_resultados.sql
-- ------------------------------------------------------------
-- CORREÇÃO (auditoria A-03): o frontend (SSTContext) se inscreve em
-- postgres_changes da tabela `resultados_avaliacao_sst`, mas essa tabela
-- NÃO fazia parte da publicação `supabase_realtime` (só desafios_1v1,
-- notificacoes e salas_quiz_guiado). O evento Realtime de resultados
-- nunca disparava — a sincronização de avaliações entre dispositivos
-- ficava dependente apenas do polling do Express.
--
-- CORREÇÃO: adiciona resultados_avaliacao_sst à publicação.
-- NÃO-DESTRUTIVO: apenas ALTER PUBLICATION ADD TABLE.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.resultados_avaliacao_sst;