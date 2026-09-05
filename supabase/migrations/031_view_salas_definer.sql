-- ============================================================
-- 031_view_salas_definer.sql — PARTICIPANTE LÊ A SALA SANITIZADA POR PIN
-- ------------------------------------------------------------
-- QA/Homologação — Fluxo de entrada por PIN/QR:
-- A view vw_salas_quiz_guiado_publica era SECURITY_INVOKER e herdava a RLS
-- da base ("Salas Leitura Escopo"), que exige super/admin/instrutor/
-- participante já listado. Um colaborador da MESMA empresa que ainda NÃO é
-- participante não conseguia LER a sala por PIN → entrada travada quando o
-- Express local não conhecia a sala.
--
-- CORREÇÃO: recria a view como SECURITY DEFINER (roda como o dono, sem a RLS
-- da base), mantendo a SANITIZAÇÃO (perguntas sem resposta_correta/explicacao
-- e participantes sem "correta"). O SELECT é concedido a authenticated APENAS
-- na VIEW — a tabela BASE continua protegida pela RLS, então o GABARITO não
-- vaza. O participante entra por PIN lendo a sala sanitizada.
--
-- SEGURANÇA: a view expõe apenas campos sanitizados (nenhum segredo); o
-- isolamento entre empresas é mantido porque a view, ao ser definida pelo
-- dono, ainda pode restringir por empresa via WHERE. Adicionamos um filtro
-- por empresa no corpo da view usando user_empresa_id() do chamador — como a
-- view é SECURITY DEFINER e user_empresa_id() lê o auth.uid() da sessão, o
-- isolamento por empresa permanece.
-- NÃO-DESTRUTIVO: reescreve view e grants.
-- ============================================================

DROP VIEW IF EXISTS public.vw_salas_quiz_guiado_publica;
CREATE VIEW public.vw_salas_quiz_guiado_publica AS
SELECT
  id,
  pin,
  nome,
  treinamento_titulo,
  instrutor_nome,
  empresa_id,
  data_criacao,
  status,
  modalidade,
  estilo,
  nota_minima,
  tempo_por_pergunta_seg,
  public.sanitizar_perguntas_publicas(perguntas) AS perguntas,
  pergunta_atual_index,
  mostrar_ranking,
  permitir_visitantes,
  public.sanitizar_participantes_publicos(participantes) AS participantes,
  revelar_resposta_atual,
  mostrar_modo_tv,
  estado_apresentacao,
  sessao_id,
  question_started_at,
  question_ends_at,
  historico_sessoes,
  posicoes_anteriores
FROM public.salas_quiz_guiado
WHERE
  -- ISOLAMENTO ENTRE EMPRESAS (mesmo sendo SECURITY DEFINER, filtra pela
  -- empresa do usuário autenticado; super_admin vê tudo).
  public.is_super_admin()
  OR empresa_id = public.user_empresa_id()
  OR instrutor_id = public.usuario_id_atual()
  -- FLUXO KAHOOT / PARTICIPANTE VISITANTE: uma sala com permitir_visitantes =
  -- true pode ser lida (APENAS via view sanitizada, sem gabarito) por qualquer
  -- chamada anônima/visitante — é como o participante entra escaneando o QR.
  OR (permitir_visitantes = true AND status IN ('aguardando', 'em_andamento', 'pausado'));

-- Grants: SELECT a authenticated/service_role e a anon (apenas na VIEW
-- sanitizada, para o fluxo do participante visitante via QR/PIN). A BASE
-- continua protegida (gabarito nunca exposto).
REVOKE ALL ON public.vw_salas_quiz_guiado_publica FROM PUBLIC;
GRANT SELECT ON public.vw_salas_quiz_guiado_publica TO anon, authenticated, service_role;