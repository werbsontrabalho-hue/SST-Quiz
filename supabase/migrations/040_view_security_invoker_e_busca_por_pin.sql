-- ============================================================
-- 040_view_security_invoker_e_busca_por_pin.sql
-- ------------------------------------------------------------
-- CORREÇÃO (aviso "unrestricted" na vw_salas_quiz_guiado_publica):
-- a view era SECURITY DEFINER (roda com privilégios do dono, IGNORANDO a
-- RLS da tabela base) e tinha SELECT concedido a `anon`. Isso permitia que
-- qualquer chamada anônima enumerasse TODAS as salas abertas (com
-- permitir_visitantes) de TODAS as empresas — vazamento entre tenants.
--
-- CORREÇÃO:
--   1) a view passa a ser SECURITY_INVOKER (respeita a RLS da base) — o aviso
--      "unrestricted" some e o isolamento por empresa volta a valer;
--   2) para o fluxo de ENTRADA por PIN (participante/visitante precisa achar a
--      sala pelo PIN sem enumerar), criamos a função SEGURA
--      buscar_sala_quiz_guiado_por_pin(p_pin), que retorna SOMENTE a sala do
--      PIN informado (sanitizada, sem gabarito), exigindo o PIN exato.
--
-- NÃO-DESTRUTIVO: recria a view, cria a função e ajusta grants.
-- ============================================================

-- 1. View passa a respeitar RLS (security_invoker).
DROP VIEW IF EXISTS public.vw_salas_quiz_guiado_publica;
CREATE VIEW public.vw_salas_quiz_guiado_publica
WITH (security_invoker = true) AS
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
  question_ends_at
FROM public.salas_quiz_guiado;

-- A view security_invoker depende da RLS; mantém SELECT a autenticados e
-- anon (a RLS fará o isolamento real). A anon não é concedida mais na
-- prática para a view (a busca por PIN usa a função abaixo).
REVOKE ALL ON public.vw_salas_quiz_guiado_publica FROM PUBLIC;
GRANT SELECT ON public.vw_salas_quiz_guiado_publica TO authenticated, service_role;

-- 2. Função de busca por PIN (fluxo de entrada). SECURITY DEFINER apenas para
--    ler e SANITIZAR a sala do PIN informado; exige o PIN exato — sem
--    enumeração. Retorna JSONB (sanitizado) ou NULL.
CREATE OR REPLACE FUNCTION public.buscar_sala_quiz_guiado_por_pin(p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sala public.salas_quiz_guiado%ROWTYPE;
BEGIN
  SELECT * INTO v_sala
  FROM public.salas_quiz_guiado
  WHERE UPPER(TRIM(pin)) = UPPER(TRIM(COALESCE(p_pin, '')))
    AND status NOT IN ('concluido', 'encerrado')
    AND (
      public.is_super_admin()
      OR empresa_id = public.user_empresa_id()
      OR instrutor_id = public.usuario_id_atual()
      OR (permitir_visitantes = true AND status IN ('aguardando', 'em_andamento', 'pausado'))
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_sala.id,
    'pin', v_sala.pin,
    'nome', v_sala.nome,
    'treinamento_titulo', v_sala.treinamento_titulo,
    'instrutor_nome', v_sala.instrutor_nome,
    'empresa_id', v_sala.empresa_id,
    'data_criacao', v_sala.data_criacao,
    'status', v_sala.status,
    'modalidade', v_sala.modalidade,
    'estilo', v_sala.estilo,
    'nota_minima', v_sala.nota_minima,
    'tempo_por_pergunta_seg', v_sala.tempo_por_pergunta_seg,
    'perguntas', public.sanitizar_perguntas_publicas(v_sala.perguntas),
    'pergunta_atual_index', v_sala.pergunta_atual_index,
    'mostrar_ranking', v_sala.mostrar_ranking,
    'permitir_visitantes', v_sala.permitir_visitantes,
    'participantes', public.sanitizar_participantes_publicos(v_sala.participantes),
    'revelar_resposta_atual', v_sala.revelar_resposta_atual,
    'mostrar_modo_tv', v_sala.mostrar_modo_tv,
    'estado_apresentacao', v_sala.estado_apresentacao,
    'sessao_id', v_sala.sessao_id,
    'question_started_at', v_sala.question_started_at,
    'question_ends_at', v_sala.question_ends_at
  );
END;
$$;

-- Grants: a função de busca por PIN pode ser usada por anon (visitante) e
-- authenticated. Ela sanitiza e exige o PIN exato (não permite enumeração).
GRANT EXECUTE ON FUNCTION public.buscar_sala_quiz_guiado_por_pin(TEXT) TO anon, authenticated, service_role;