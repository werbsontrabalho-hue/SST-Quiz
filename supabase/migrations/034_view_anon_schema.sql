-- ============================================================
-- 034_view_anon_schema.sql — GARANTE ACESSO ANON À VIEW SANITIZADA
-- ------------------------------------------------------------
-- A migration 007 revogou todo o acesso de anon (inclusive USAGE no schema
-- public). Para o participante VISITANTE (modo Kahoot) ler a sala por PIN
-- via a view sanitizada, é preciso conceder USAGE ON SCHEMA + SELECT na view
-- à role anon. A BASE e o gabarito continuam protegidos (a view não os
-- expõe).
-- NÃO-DESTRUTIVO: apenas grants.
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.vw_salas_quiz_guiado_publica TO anon;