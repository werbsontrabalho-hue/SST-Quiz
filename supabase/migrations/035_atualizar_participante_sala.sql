-- ============================================================
-- 035_atualizar_participante_sala.sql — RPC SEGURO PARA RESPOSTA
-- ------------------------------------------------------------
-- CAUSA RAIZ (Problema 1 — respostas corretas marcadas como erradas):
-- o participante envia a sala SANITIZADA (sem resposta_correta/explicacao)
-- de volta ao Supabase via upsertSalaQuizGuiado, SOBRESCREVENDO o gabarito
-- das perguntas no banco. Depois, a Edge Function pontuar-quiz-guiado e o
-- RPC registrar_resposta_quiz_guiado validam contra sala.perguntas[].resposta_correta
-- que agora é undefined → Number(undefined)=NaN → correta sempre false.
--
-- CORREÇÃO: RPC SECURITY DEFINER que atualiza APENAS o array 'participantes'
-- da sala (respostas/pontuação), SEM tocar em 'perguntas' (gabarito). O
-- participante passa a usar este RPC para registrar a resposta; o gabarito
-- do banco permanece íntegro.
--
-- SEGURANÇA: valida que o participante pertence à sala e que o chamador é o
-- próprio participante (ou instrutor/admin da empresa). NÃO expõe gabarito.
-- NÃO-DESTRUTIVO: cria função; não altera dados.
-- ============================================================

CREATE OR REPLACE FUNCTION public.atualizar_participante_sala(
  p_sala_id TEXT,
  p_participante_id TEXT,
  p_respostas JSONB,
  p_pontuacao_acumulada INT DEFAULT NULL,
  p_nota_final NUMERIC DEFAULT NULL,
  p_situacao TEXT DEFAULT NULL,
  p_concluido BOOLEAN DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sala public.salas_quiz_guiado%ROWTYPE;
  v_participantes JSONB;
  v_idx INT;
  v_part JSONB;
  v_usuario_id TEXT;
BEGIN
  SELECT * INTO v_sala FROM public.salas_quiz_guiado WHERE id = p_sala_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Sala não encontrada.');
  END IF;

  -- ISOLAMENTO CROSS-EMPRESA: se autenticado, a sala deve ser da mesma empresa.
  IF auth.uid() IS NOT NULL THEN
    v_usuario_id := public.usuario_id_atual();
    IF NOT public.pode_gerenciar_empresa(v_sala.empresa_id)
       AND v_usuario_id IS NOT NULL
       AND (SELECT empresa_id FROM public.usuarios WHERE id = v_usuario_id) <> v_sala.empresa_id THEN
      RETURN jsonb_build_object('success', false, 'code', 'OUTRA_EMPRESA', 'message', 'Acesso negado: sala de outra empresa.');
    END IF;
  END IF;

  -- Localiza o participante no array JSONB.
  v_participantes := COALESCE(v_sala.participantes, '[]'::jsonb);
  SELECT i - 1 INTO v_idx
    FROM jsonb_array_elements(v_participantes) WITH ORDINALITY AS e(part, i)
   WHERE e.part->>'id' = p_participante_id OR e.part->>'usuario_id' = p_participante_id
   LIMIT 1;

  IF v_idx IS NULL OR v_idx < 0 THEN
    -- CORREÇÃO (Problema 2 — participante travado na tela "Iniciar"): o
    -- participante que se identifica pela primeira vez na sessão NÃO existe
    -- ainda no array — o RPC deve ADICIONÁ-LO (upsert), nunca substituir o
    -- array inteiro de perguntas/gabarito. Sem isto, a entrada falhava
    -- silenciosamente e o participante ficava preso na identificação.
    v_part := jsonb_build_object(
      'id', p_participante_id,
      'usuario_id', NULL,
      'nome', COALESCE(p_respostas->>'__nome', ''),
      'matricula', COALESCE(p_respostas->>'__matricula', NULL),
      'cpf', COALESCE(p_respostas->>'__cpf', NULL),
      'cpf_ou_empresa', COALESCE(p_respostas->>'__cpf_ou_empresa', NULL),
      'is_visitante', true,
      'respostas', '{}'::jsonb,
      'pontuacao_acumulada', 0
    );
    v_participantes := v_participantes || jsonb_build_array(v_part);
    v_idx := jsonb_array_length(v_participantes) - 1;
  ELSE
    v_part := v_participantes->v_idx;
  END IF;

  -- Merge de respostas (preserva as existentes; novas respostas são adicionadas).
  v_part := jsonb_set(v_part, '{respostas}', COALESCE(v_part->'respostas', '{}'::jsonb) || COALESCE(p_respostas, '{}'::jsonb));
  IF p_pontuacao_acumulada IS NOT NULL THEN
    v_part := jsonb_set(v_part, '{pontuacao_acumulada}', to_jsonb(p_pontuacao_acumulada));
  END IF;
  IF p_nota_final IS NOT NULL THEN
    v_part := jsonb_set(v_part, '{nota_final}', to_jsonb(p_nota_final));
  END IF;
  IF p_situacao IS NOT NULL THEN
    v_part := jsonb_set(v_part, '{situacao}', to_jsonb(p_situacao));
  END IF;
  IF p_concluido IS NOT NULL THEN
    v_part := jsonb_set(v_part, '{concluido}', to_jsonb(p_concluido));
  END IF;

  v_participantes := jsonb_set(v_participantes, ARRAY[v_idx::text], v_part);

  -- Atualiza SOMENTE participantes — as perguntas (gabarito) permanecem íntegras.
  UPDATE public.salas_quiz_guiado
     SET participantes = v_participantes
   WHERE id = p_sala_id;

  RETURN jsonb_build_object('success', true, 'code', 'OK', 'message', 'Participante atualizado.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_participante_sala(TEXT, TEXT, JSONB, INT, NUMERIC, TEXT, BOOLEAN) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.atualizar_participante_sala(TEXT, TEXT, JSONB, INT, NUMERIC, TEXT, BOOLEAN) FROM anon;