-- ============================================================
-- 045_atualizar_estado_apresentacao_sala.sql
-- ------------------------------------------------------------
-- CORREÇÃO (loop crítico_quiz_guiado — raiz no Supabase):
-- o instrutor usa `upsertSalaQuizGuiado` para atualizar o estado
-- de apresentação (revelar_resposta_atual, pergunta_atual_index, etc.),
-- mas o upsert envia a sala INTEIRA, incluindo o array `participantes`.
-- Quando o instrutor não tem ainda a resposta do participante no
-- estado local (o Realtime ainda não entregou), o upsert sobrescreve
-- o `participantes` no Supabase com uma versão DESATUALIZADA,
-- apagando a resposta do participante do banco.
--
-- CORREÇÃO: RPC SECURITY DEFINER que atualiza SOMENTE as colunas de
-- apresentação/estado, NUNCA toca em `participantes`. O instrutor
-- passa a usar este RPC para revelar, avançar, iniciar, pausar e
-- retomar — eliminando a race condition.
--
-- SEGURANÇA: SECURITY DEFINER + search_path = public, pg_temp.
-- ============================================================

CREATE OR REPLACE FUNCTION public.atualizar_estado_apresentacao_sala(
  p_sala_id TEXT,
  p_status TEXT DEFAULT NULL,
  p_estado_apresentacao TEXT DEFAULT NULL,
  p_revelar_resposta_atual BOOLEAN DEFAULT NULL,
  p_mostrar_ranking BOOLEAN DEFAULT NULL,
  p_pergunta_atual_index INT DEFAULT NULL,
  p_question_started_at BIGINT DEFAULT NULL,
  p_question_ends_at BIGINT DEFAULT NULL,
  p_sessao_id TEXT DEFAULT NULL,
  p_mostrar_modo_tv BOOLEAN DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_set_clauses TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_status IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('status = %L', p_status));
  END IF;
  IF p_estado_apresentacao IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('estado_apresentacao = %L', p_estado_apresentacao));
  END IF;
  IF p_revelar_resposta_atual IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('revelar_resposta_atual = %L', p_revelar_resposta_atual));
  END IF;
  IF p_mostrar_ranking IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('mostrar_ranking = %L', p_mostrar_ranking));
  END IF;
  IF p_pergunta_atual_index IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('pergunta_atual_index = %L', p_pergunta_atual_index));
  END IF;
  IF p_question_started_at IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('question_started_at = %L', p_question_started_at));
  END IF;
  IF p_question_ends_at IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('question_ends_at = %L', p_question_ends_at));
  END IF;
  IF p_sessao_id IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('sessao_id = %L', p_sessao_id));
  END IF;
  IF p_mostrar_modo_tv IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('mostrar_modo_tv = %L', p_mostrar_modo_tv));
  END IF;

  IF array_length(v_set_clauses, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Nenhuma coluna para atualizar.');
  END IF;

  EXECUTE format(
    'UPDATE public.salas_quiz_guiado SET %s WHERE id = %L',
    array_to_string(v_set_clauses, ', '),
    p_sala_id
  );

  RETURN jsonb_build_object('success', true, 'code', 'OK', 'message', 'Estado de apresentação atualizado.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_estado_apresentacao_sala(
  TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, INT, BIGINT, BIGINT, TEXT, BOOLEAN
) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.atualizar_estado_apresentacao_sala(
  TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, INT, BIGINT, BIGINT, TEXT, BOOLEAN
) FROM anon;
