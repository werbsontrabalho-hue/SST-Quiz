-- ============================================================
-- 030_fix_rpc_resposta_quiz_guiado.sql — CORRIGE RPC DE RESPOSTA
-- ------------------------------------------------------------
-- Corrige os achados da auditoria do módulo Quiz Guiado/Avaliação sobre o
-- RPC registrar_resposta_quiz_guiado:
--
--   1) ORÁCULO DE GABARITO (CRÍTICO): o RPC retornava 'correta'/'pontosAdicionais'
--      mesmo quando a resposta JÁ estava registrada (ON CONFLICT DO NOTHING
--      não informava duplicata) — um participante podia "testar" alternativas
--      em chamadas sequenciais e descobrir o gabarito. Agora, se a resposta já
--      existe, retorna 'duplicada: true' SEM revelar a correção/pontos.
--
--   2) ISOLAMENTO CROSS-EMPRESA (CRÍTICO): o ramo "em nome próprio"
--      (p_participante_id = usuario_id_atual()) não verificava a empresa da
--      sala — um usuário da empresa A podia consultar o gabarito de salas da
--      empresa B. Agora exige que a sala seja da MESMA empresa do usuário
--      autenticado.
--
--   3) JANELA DE TEMPO (ALTO): não validava question_ends_at. Agora rejeita
--      respostas fora do prazo (com tolerância de 1,5s para rede).
--
--   4) A validação de participante agora também confere que o participante
--      consta no array 'participantes' da sala (anti-impersonação de id).
--
-- NÃO-DESTRUTIVO: reescreve a função.
-- ============================================================

CREATE OR REPLACE FUNCTION public.registrar_resposta_quiz_guiado(
  p_sala_id TEXT,
  p_participante_id TEXT,
  p_participante_nome TEXT DEFAULT NULL,
  p_pergunta_id TEXT DEFAULT NULL,
  p_resposta_index INT DEFAULT NULL,
  p_tempo_ms INT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sala public.salas_quiz_guiado%ROWTYPE;
  v_pergunta JSONB;
  v_correta_index INT;
  v_correta BOOLEAN;
  v_pontos INT := 0;
  v_tempo_max_ms INT;
  v_ratio NUMERIC;
  v_usuario_id TEXT;
  v_ja_registrada BOOLEAN;
BEGIN
  SELECT * INTO v_sala FROM public.salas_quiz_guiado WHERE id = p_sala_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Sala não encontrada.');
  END IF;

  -- SEGURANÇA: usuário autenticado só pode registrar resposta em nome próprio
  -- (ou ser instrutor/admin da empresa da sala).
  IF auth.uid() IS NOT NULL THEN
    v_usuario_id := public.usuario_id_atual();
    -- ISOLAMENTO CROSS-EMPRESA: se autenticado, a sala DEVE ser da mesma
    -- empresa do usuário (exceto super_admin / gestor da empresa).
    IF NOT public.pode_gerenciar_empresa(v_sala.empresa_id)
       AND v_usuario_id IS NOT NULL
       AND (SELECT empresa_id FROM public.usuarios WHERE id = v_usuario_id) <> v_sala.empresa_id THEN
      RETURN jsonb_build_object('success', false, 'code', 'OUTRA_EMPRESA', 'message', 'Acesso negado: sala de outra empresa.');
    END IF;
    IF p_participante_id <> v_usuario_id
       AND NOT public.pode_gerenciar_empresa(v_sala.empresa_id) THEN
      RETURN jsonb_build_object('success', false, 'code', 'ACESSO_NEGADO', 'message', 'Não é possível responder em nome de outro participante.');
    END IF;
    -- Anti-impersonação de id: quando autenticado em nome próprio, o
    -- participante deve existir na sala E ser o próprio usuário.
    IF p_participante_id = v_usuario_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(v_sala.participantes, '[]'::jsonb)) AS e
        WHERE (e->>'usuario_id' = v_usuario_id OR e->>'id' = v_usuario_id)
      ) THEN
        RETURN jsonb_build_object('success', false, 'code', 'PARTICIPANTE_NAO_ENCONTRADO', 'message', 'Participante não encontrado na sala.');
      END IF;
    END IF;
  END IF;

  -- JANELA DE TEMPO: rejeita respostas fora do prazo (tolerância 1,5s).
  IF v_sala.question_ends_at IS NOT NULL AND v_sala.question_ends_at > 0
     AND (EXTRACT(EPOCH FROM now()) * 1000) > v_sala.question_ends_at + 1500 THEN
    RETURN jsonb_build_object('success', false, 'code', 'TEMPO_ESGOTADO', 'message', 'Tempo esgotado para esta pergunta.');
  END IF;

  -- Busca a pergunta no array JSONB da sala.
  v_pergunta := (SELECT elem FROM jsonb_array_elements(COALESCE(v_sala.perguntas, '[]'::jsonb)) elem WHERE elem->>'id' = p_pergunta_id LIMIT 1);
  IF v_pergunta IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'PERGUNTA_INVALIDA', 'message', 'Pergunta não pertence à sala.');
  END IF;

  -- Recalcula a correção com o gabarito armazenado (defesa em profundidade).
  v_correta_index := (v_pergunta->>'resposta_correta')::INT;
  v_correta := (p_resposta_index IS NOT NULL AND p_resposta_index = v_correta_index);

  -- Pontuação idêntica à do cliente: competitivo pontua por velocidade.
  IF v_correta THEN
    IF v_sala.estilo = 'competitivo' THEN
      v_tempo_max_ms := COALESCE(v_sala.tempo_por_pergunta_seg, 30) * 1000;
      v_ratio := GREATEST(0, (v_tempo_max_ms - COALESCE(p_tempo_ms, 0))::NUMERIC / NULLIF(v_tempo_max_ms, 0));
      v_pontos := 1000 + ROUND(v_ratio * 500);
    ELSE
      v_pontos := 100;
    END IF;
  END IF;

  -- Verifica se a resposta JÁ está registrada (a primeira escrita vence).
  SELECT EXISTS (
    SELECT 1 FROM public.quiz_guiado_respostas
    WHERE sala_id = p_sala_id AND participante_id = p_participante_id AND pergunta_id = p_pergunta_id
  ) INTO v_ja_registrada;

  IF v_ja_registrada THEN
    -- ANTI-ORÁCULO: não revela 'correta' nem pontos em resposta duplicada.
    RETURN jsonb_build_object('success', false, 'code', 'DUPLICADA', 'duplicada', true, 'message', 'Resposta já registrada.');
  END IF;

  -- Gravação IMUTÁVEL: a primeira escrita vence.
  INSERT INTO public.quiz_guiado_respostas
    (sala_id, empresa_id, participante_id, participante_nome, pergunta_id,
     resposta_index, resposta_correta_index, correta, tempo_ms, pontos_adicionais)
  VALUES
    (p_sala_id, v_sala.empresa_id, p_participante_id, p_participante_nome, p_pergunta_id,
     COALESCE(p_resposta_index, -1), v_correta_index, v_correta, p_tempo_ms, v_pontos)
  ON CONFLICT (sala_id, participante_id, pergunta_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'code', 'OK', 'correta', v_correta,
                            'pontosAdicionais', v_pontos, 'registrado', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_resposta_quiz_guiado(TEXT, TEXT, TEXT, TEXT, INT, INT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.registrar_resposta_quiz_guiado(TEXT, TEXT, TEXT, TEXT, INT, INT) FROM anon;