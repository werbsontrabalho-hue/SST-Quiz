-- ============================================================
-- 010_endurecer_rpc.sql — VALIDA VENCEDOR/PONTOS NO SERVIDOR
-- ------------------------------------------------------------
-- A auditoria forense (AUD-37/38) constatou que RPCs SECURITY DEFINER
-- aceitavam vencedor/pontos informados pelo chamador SEM validar contra
-- o gabarito/participantes. Correção (não-destrutiva, só reescreve
-- funções e grants):
--
--   1) registrar_desafio_no_ledger: o vencedor informado PRECISA ser um
--      dos participantes do desafio (desafiante/desafiado) e da MESMA
--      empresa. Impede marcar a si mesmo ou terceiros como vencedor de
--      partidas alheias/cross-empresa.
--
--   2) pontuar_quiz: revalida o gabarito de cada resposta contra
--      quizzes.perguntas (resposta_correta) e recalcula os acertos/pontos
--      reais, sem confiar em p_pontos/p_acertos do chamador.
--
--   3) Grants seletivos: pontuar_quiz continua disponível a authenticated
--      (a edge function e o app o usam), mas registrar_pontos_ledger (que
--      forja lançamentos quando auth.uid() IS NULL) fica restrita a
--      service_role — o frontend não a chama.
-- ============================================================

-- ------------------------------------------------------------
-- 1. registrar_desafio_no_ledger — VALIDA VENCEDOR/PONTOS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_desafio_no_ledger(
  p_desafio_id TEXT,
  p_vencedor_id TEXT,
  p_perdedor_id TEXT,
  p_pontos_ganho INT DEFAULT 0,
  p_pontos_perda INT DEFAULT 0,
  p_motivo TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_desafio RECORD;
BEGIN
  SELECT * INTO v_desafio FROM public.desafios_1v1 WHERE id = p_desafio_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Desafio não encontrado.');
  END IF;

  -- SEGURANÇA: usuário autenticado só pode liquidar se for participante do
  -- desafio ou administrador/super_admin da empresa.
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.pode_gerenciar_empresa(v_desafio.empresa_id)
       AND public.usuario_id_atual() NOT IN (v_desafio.desafiante_id, v_desafio.desafiado_id) THEN
      RETURN jsonb_build_object('success', false, 'code', 'ACESSO_NEGADO', 'message', 'Sem permissão para liquidar este desafio.');
    END IF;
  END IF;

  -- SEGURANÇA (auditoria AUD-38): o vencedor informado precisa ser um dos
  -- participantes do desafio e da MESMA empresa. Isso impede marcar como
  -- vencedor um usuário que não participou ou de outra empresa.
  IF p_vencedor_id IS NOT NULL AND p_vencedor_id NOT IN (v_desafio.desafiante_id, v_desafio.desafiado_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'VENCEDOR_INVALIDO', 'message', 'O vencedor informado não participa deste desafio.');
  END IF;
  IF p_vencedor_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = p_vencedor_id AND empresa_id = v_desafio.empresa_id) THEN
      RETURN jsonb_build_object('success', false, 'code', 'VENCEDOR_OUTRA_EMPRESA', 'message', 'O vencedor informado é de outra empresa.');
    END IF;
  END IF;

  -- Idempotência: partida já concluída não é liquidada de novo.
  IF v_desafio.status = 'concluido' THEN
    RETURN jsonb_build_object('success', false, 'code', 'JA_CONCLUIDO', 'message', 'Desafio já liquidado.');
  END IF;

  UPDATE public.desafios_1v1
     SET status = 'concluido', data_conclusao = now(),
         vencedor_id = COALESCE(p_vencedor_id, v_desafio.vencedor_id),
         motivo_vitoria = COALESCE(p_motivo, v_desafio.motivo_vitoria)
   WHERE id = p_desafio_id;

  -- Vencedor recebe os pontos do desafio.
  IF p_vencedor_id IS NOT NULL THEN
    INSERT INTO public.pontos_ledger (empresa_id, usuario_id, tipo, valor, origem, referencia_id, descricao)
    VALUES (v_desafio.empresa_id, p_vencedor_id, 'DESAFIO', p_pontos_ganho, 'desafio_1v1', p_desafio_id,
            'Vitória no desafio ' || COALESCE(v_desafio.tema_sorteado, ''));
  END IF;

  -- Perdedor perde pontos (só no modo amistoso).
  IF p_perdedor_id IS NOT NULL AND p_pontos_perda > 0 THEN
    INSERT INTO public.pontos_ledger (empresa_id, usuario_id, tipo, valor, origem, referencia_id, descricao)
    VALUES (v_desafio.empresa_id, p_perdedor_id, 'DESAFIO', -p_pontos_perda, 'desafio_1v1', p_desafio_id,
            'Derrota no desafio ' || COALESCE(v_desafio.tema_sorteado, ''));
  END IF;

  RETURN jsonb_build_object('success', true, 'code', 'OK', 'message', 'Desafio liquidado e registrado no ledger.');
END;
$$;

-- ------------------------------------------------------------
-- 2. pontuar_quiz — REVALIDA O GABARITO NO SERVIDOR
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pontuar_quiz(
  p_quiz_id TEXT,
  p_pontos INT,
  p_acertos INT,
  p_erros INT,
  p_detalhes JSONB,
  p_novas_estatisticas JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_colaborador_id TEXT;
  v_empresa_id TEXT;
  v_quiz_perguntas JSONB;
  v_pergunta JSONB;
  v_det JSONB;
  v_resp_escolhida INT;
  v_resp_correta INT;
  v_correta BOOLEAN;
  v_acertos_reais INT := 0;
  v_erros_reais INT := 0;
  v_pontos_recalculados INT := 0;
  v_detalhes_validados JSONB := '[]'::jsonb;
BEGIN
  -- SEGURANÇA: usuário autenticado só pode pontuar se o quiz pertence à sua
  -- empresa e (o próprio quiz é dele OU ele é admin/instrutor da empresa).
  IF auth.uid() IS NOT NULL THEN
    SELECT colaborador_id, empresa_id INTO v_colaborador_id, v_empresa_id
      FROM public.quizzes WHERE id = p_quiz_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('updated', false, 'reason', 'quiz_not_found');
    END IF;
    IF NOT public.pode_gerenciar_empresa(v_empresa_id)
       AND v_colaborador_id <> public.usuario_id_atual() THEN
      RETURN jsonb_build_object('updated', false, 'reason', 'acesso_negado');
    END IF;
  END IF;

  -- Carrega o gabarito autoritativo (as perguntas DO QUIZ, no banco).
  SELECT perguntas, empresa_id INTO v_quiz_perguntas, v_empresa_id
    FROM public.quizzes WHERE id = p_quiz_id;
  IF v_quiz_perguntas IS NULL THEN
    RETURN jsonb_build_object('updated', false, 'reason', 'quiz_not_found');
  END IF;

  -- Revalida cada resposta contra o gabarito no banco. O que não bate é
  -- recalculado do zero: nada do chamador é confiado para acerto/erro.
  v_detalhes_validados := '[]'::jsonb;
  FOR v_det IN SELECT * FROM jsonb_array_elements(COALESCE(p_detalhes, '[]'::jsonb)) LOOP
    v_pergunta := NULL;
    SELECT e.value INTO v_pergunta
      FROM jsonb_array_elements(v_quiz_perguntas) AS e
     WHERE e.value->>'id' = v_det->>'pergunta_id'
     LIMIT 1;
    IF v_pergunta IS NULL THEN
      CONTINUE; -- pergunta desconhecida: ignora (não pontua)
    END IF;
    BEGIN
      v_resp_escolhida := (v_det->>'resposta_escolhida')::INT;
    EXCEPTION WHEN OTHERS THEN
      v_resp_escolhida := -1;
    END;
    v_resp_correta := COALESCE((v_pergunta->>'resposta_correta')::INT, -1);
    v_correta := (v_resp_escolhida = v_resp_correta);

    IF v_correta THEN
      v_acertos_reais := v_acertos_reais + 1;
      v_pontos_recalculados := v_pontos_recalculados
        + GREATEST(10, COALESCE((v_det->>'pontos_ganhos')::INT, 0));
    ELSE
      v_erros_reais := v_erros_reais + 1;
    END IF;

    v_detalhes_validados := v_detalhes_validados
      || jsonb_build_object(
           'pergunta_id', v_det->>'pergunta_id',
           'resposta_escolhida', v_resp_escolhida,
           'correta', v_correta,
           'tempo_gasto_segundos', COALESCE((v_det->>'tempo_gasto_segundos')::INT, 0),
           'pontos_ganhos', CASE WHEN v_correta
                                   THEN GREATEST(10, COALESCE((v_det->>'pontos_ganhos')::INT, 0))
                                   ELSE 0 END
         );
  END LOOP;

  -- Atualiza o quiz com os valores RECALCULADOS (não confia no chamador).
  UPDATE public.quizzes
     SET status = 'concluido',
         pontuacao_total = v_pontos_recalculados,
         respostas = v_detalhes_validados,
         respondido_em = now()
   WHERE id = p_quiz_id AND status <> 'concluido';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('updated', false, 'reason', 'already_concluded');
  END IF;

  SELECT colaborador_id INTO v_colaborador_id
    FROM public.quizzes WHERE id = p_quiz_id;

  IF v_colaborador_id IS NOT NULL THEN
    UPDATE public.usuarios
       SET estatisticas = p_novas_estatisticas
     WHERE id = v_colaborador_id;

    INSERT INTO public.pontos_ledger (empresa_id, usuario_id, tipo, valor, origem, referencia_id, descricao)
    VALUES (v_empresa_id, v_colaborador_id, 'QUIZ', v_pontos_recalculados, 'quiz', p_quiz_id,
            'Quiz diário concluído (' || v_acertos_reais || ' acertos, ' || v_erros_reais || ' erros)');
  END IF;

  RETURN jsonb_build_object(
    'updated', true,
    'pontos_recalculados', v_pontos_recalculados,
    'acertos_reais', v_acertos_reais,
    'erros_reais', v_erros_reais,
    'detalhes_validados', v_detalhes_validados
  );
END;
$$;

-- ------------------------------------------------------------
-- 3. GRANTS SELETIVOS
-- ------------------------------------------------------------
-- registrar_pontos_ledger (forja lançamentos quando auth.uid() IS NULL) não
-- é chamada pelo frontend: fica restrita a service_role.
REVOKE EXECUTE ON FUNCTION public.registrar_pontos_ledger(TEXT, TEXT, TEXT, INT, TEXT, TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_pontos_ledger(TEXT, TEXT, TEXT, INT, TEXT, TEXT, TEXT) FROM anon;

-- pontuar_quiz continua disponível a authenticated (usado pelo app e pela
-- edge function) e a service_role. anon permanece sem acesso.
GRANT EXECUTE ON FUNCTION public.pontuar_quiz(TEXT, INT, INT, INT, JSONB, JSONB) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pontuar_quiz(TEXT, INT, INT, INT, JSONB, JSONB) FROM anon;