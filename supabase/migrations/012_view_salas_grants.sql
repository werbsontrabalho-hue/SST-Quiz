-- ============================================================
-- 012_view_salas_grants.sql — GRANT DA VIEW SANITIZADA DE SALAS
-- ------------------------------------------------------------
-- A migration 006 recriou vw_salas_quiz_guiado_publica como
-- security_invoker, mas NÃO re-concedeu GRANT SELECT após o DROP/CREATE
-- (os grants de uma view são perdidos ao recriá-la). Sem isso, até o
-- usuário autenticado recebe "permission denied" (403) ao consultar a
-- view — e o app não consegue usá-la como fonte sanitizada de salas.
--
-- Este script:
--   1) concede SELECT na view a authenticated e service_role;
--   2) garante que anon NÃO tenha acesso (reforça a 007);
--   3) é NÃO-DESTRUTIVO e idempotente (GRANT é idempotente).
-- ============================================================

GRANT SELECT ON public.vw_salas_quiz_guiado_publica TO authenticated, service_role;
REVOKE ALL ON public.vw_salas_quiz_guiado_publica FROM anon;