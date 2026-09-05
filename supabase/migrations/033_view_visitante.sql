-- ============================================================
-- 033_view_visitante.sql — PARTICIPANTE VISITANTE LÊ SALA POR PIN
-- ------------------------------------------------------------
-- QA/Homologação: o fluxo de participante visitante (modo Kahoot — escanear
-- QR / digitar PIN sem login) não conseguia LER a sala, porque a view
-- vw_salas_quiz_guiado_publica (SECURITY DEFINER, migration 031) filtrava
-- apenas por empresa do usuário AUTENTICADO — e o visitante não tem sessão.
--
-- CORREÇÃO: a view passa a liberar leitura de salas abertas (aguardando/
-- em_andamento/pausado) com permitir_visitantes = true, SEM exigir login. O
-- SELECT é concedido também a anon APENAS na view (sanitizada — sem gabarito).
-- A tabela BASE continua protegida.
-- NÃO-DESTRUTIVO: recria a view e ajusta grants.
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
  -- FLUXO KAHOOT / PARTICIPANTE VISITANTE: sala com permitir_visitantes = true
  -- pode ser lida (APENAS via view sanitizada, sem gabarito) por qualquer
  -- chamada anônima/visitante — é como o participante entra pelo QR/PIN.
  OR (permitir_visitantes = true AND status IN ('aguardando', 'em_andamento', 'pausado'));

-- Grants: SELECT a anon/authenticated/service_role APENAS na view sanitizada.
REVOKE ALL ON public.vw_salas_quiz_guiado_publica FROM PUBLIC;
GRANT SELECT ON public.vw_salas_quiz_guiado_publica TO anon, authenticated, service_role;