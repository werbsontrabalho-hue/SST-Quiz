-- ============================================================
-- 022_fix_grant_autorizacao.sql — CORRIGE GRANT DA TABELA DE AUTORIZAÇÃO
-- ------------------------------------------------------------
-- A tabela autorizacoes_pontuacao (020) só tinha GRANT para service_role.
-- A função hay_autorizacao_pontuacao é STABLE e chamada pelo gatilho
-- (SECURITY DEFINER), mas o PostgREST a executa com a role authenticated e o
-- Postgres exigia SELECT para essa role, gerando "permission denied".
-- A leitura da autorização é inofensiva (só informa se o usuário está
-- autorizado); INSERT/DELETE continuam restritos a service_role.
-- NÃO-DESTRUTIVO: apenas ajusta grants.
-- ============================================================

GRANT SELECT ON public.autorizacoes_pontuacao TO authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.autorizacoes_pontuacao FROM authenticated;