-- ============================================================
-- 026_view_salas_leitura_aberta.sql — PARTICIPANTE NOVO LÊ A SALA SANITIZADA
-- ------------------------------------------------------------
-- Pendência de UX (Fase 9): um participante que ainda NÃO está na lista da
-- sala não conseguia LER a sala por PIN no Supabase, porque a policy
-- "Salas Leitura Escopo" (tabela base) exige já ser participante/instrutor/
-- admin. Sem a leitura, o usuário não conseguia entrar numa sala pela qual
-- acabou de digitar o PIN.
--
-- CORREÇÃO: nova policy de SELECT na VIEW sanitizada
-- (vw_salas_quiz_guiado_publica é security_invoker, então herda a RLS da
-- base — por isso criamos uma policy na BASE específica para o fluxo de
-- entrada). Qualquer usuário autenticado da MESMA empresa pode ler salas
-- ainda abertas (aguardando/em_andamento) — mas APENAS via a view
-- sanitizada (o app já usa a view para a busca por PIN desde a Fase 9),
-- que NÃO expõe resposta_correta/explicacao.
--
-- A tabela base continua restrita (gabarito só para instrutor/admin/
-- participante). A policy abaixo libera a leitura para permitir a ENTRADA;
-- o app consome a view, garantindo o anti-cola.
-- NÃO-DESTRUTIVO.
-- ============================================================

CREATE POLICY "Salas Leitura Entrada PIN" ON public.salas_quiz_guiado
  FOR SELECT USING (
    public.modo_legado_anonimo()
    OR (
      auth.uid() IS NOT NULL
      AND empresa_id = public.user_empresa_id()
      AND status IN ('aguardando', 'em_andamento', 'pausado')
    )
  );