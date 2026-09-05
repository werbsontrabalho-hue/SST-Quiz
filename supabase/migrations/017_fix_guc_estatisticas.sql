-- ============================================================
-- 017_fix_guc_estatisticas.sql — GUC DE BYPASS EM NÍVEL DE SESSÃO
-- ------------------------------------------------------------
-- A 015 usou set_config('app.bypass_estat', 'on', true) (transaction-local).
-- Ao chamar RPCs via PostgREST, o gatilho de UPDATE não enxergava o valor
-- definido (o PostgREST executa o RPC e o gatilho em transações distintas /
-- não compartilha o valor local), gerando "Alteração de campos restritos".
--
-- CORREÇÃO: definir o GUC em NÍVEL DE SESSÃO (is_local=false) antes de
-- gravar as estatísticas e REINICIAR (RESET) ao final da função. O PostgREST
-- isola cada request com uma sessão/role própria, então o valor não vaza
-- entre usuários — e o RESET garante que, mesmo reutilizando a conexão do
-- pool, o GUC volta ao estado neutro.
-- NÃO-DESTRUTIVO: reescreve as duas funções de pontuação.
-- ============================================================

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
  v_is_amistoso BOOLEAN;
  v_stats_venc JSONB;
  v_stats_perd JSONB;
  v_pontos_venc_resgat BIGINT;
  v_pontos_perd_resgat BIGINT;
  v_stats_novo_venc JSONB;
  v_stats_novo_perd JSONB;
BEGIN
  SELECT * INTO v_desafio FROM public.desafios_1v1 WHERE id = p_desafio_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Desafio não encontrado.');
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF NOT public.pode_gerenciar_empresa(v_desafio.empresa_id)
       AND public.usuario_id_atual() NOT IN (v_desafio.desafiante_id, v_desafio.desafiado_id) THEN
      RETURN jsonb_build_object('success', false, 'code', 'ACESSO_NEGADO', 'message', 'Sem permissão para liquidar este desafio.');
    END IF;
  END IF;

  IF p_vencedor_id IS NOT NULL AND p_vencedor_id NOT IN (v_desafio.desafiante_id, v_desafio.desafiado_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'VENCEDOR_INVALIDO', 'message', 'O vencedor informado não participa deste desafio.');
  END IF;
  IF p_vencedor_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = p_vencedor_id AND empresa_id = v_desafio.empresa_id) THEN
      RETURN jsonb_build_object('success', false, 'code', 'VENCEDOR_OUTRA_EMPRESA', 'message', 'O vencedor informado é de outra empresa.');
    END IF;
  END IF;

  IF v_desafio.status = 'concluido' THEN
    RETURN jsonb_build_object('success', false, 'code', 'JA_CONCLUIDO', 'message', 'Desafio já liquidado.');
  END IF;

  v_is_amistoso := (v_desafio.tipo = 'amistoso');

  UPDATE public.desafios_1v1
     SET status = 'concluido', data_conclusao = now(),
         vencedor_id = COALESCE(p_vencedor_id, v_desafio.vencedor_id),
         motivo_vitoria = COALESCE(p_motivo, v_desafio.motivo_vitoria)
   WHERE id = p_desafio_id;

  IF p_vencedor_id IS NOT NULL THEN
    INSERT INTO public.pontos_ledger (empresa_id, usuario_id, tipo, valor, origem, referencia_id, descricao)
    VALUES (v_desafio.empresa_id, p_vencedor_id, 'DESAFIO', p_pontos_ganho, 'desafio_1v1', p_desafio_id,
            'Vitória no desafio ' || COALESCE(v_desafio.tema_sorteado, ''));

    -- GUC de bypass em nível de SESSÃO (is_local=false) para o gatilho ver.
    PERFORM set_config('app.bypass_estat', 'on', false);
    SELECT estatisticas INTO v_stats_venc FROM public.usuarios WHERE id = p_vencedor_id;
    IF v_stats_venc IS NULL THEN v_stats_venc := '{}'::jsonb; END IF;
    v_pontos_venc_resgat := COALESCE((v_stats_venc->>'pontos_resgataveis')::BIGINT, COALESCE((v_stats_venc->>'pontos_totais')::BIGINT, 0));
    v_stats_novo_venc := v_stats_venc
      || jsonb_build_object(
           'desafios_vencidos', COALESCE((v_stats_venc->>'desafios_vencidos')::INT, 0) + 1,
           'desafios_jogados', COALESCE((v_stats_venc->>'desafios_jogados')::INT, 0) + 1,
           'pontos_desafios', COALESCE((v_stats_venc->>'pontos_desafios')::BIGINT, 0) + p_pontos_ganho,
           'pontos_totais', COALESCE((v_stats_venc->>'pontos_totais')::BIGINT, 0) + p_pontos_ganho,
           'pontos_resgataveis', v_pontos_venc_resgat + p_pontos_ganho,
           'sequencia_vitorias', COALESCE((v_stats_venc->>'sequencia_vitorias')::INT, 0) + 1,
           'maior_sequencia_vitorias', GREATEST(
             COALESCE((v_stats_venc->>'maior_sequencia_vitorias')::INT, 0),
             COALESCE((v_stats_venc->>'sequencia_vitorias')::INT, 0) + 1
           ),
           'defesas_vencidas', COALESCE((v_stats_venc->>'defesas_vencidas')::INT, 0)
             + (CASE WHEN p_vencedor_id = v_desafio.desafiado_id THEN 1 ELSE 0 END),
           'sequencia_defesas', CASE WHEN p_vencedor_id = v_desafio.desafiado_id
                                       THEN COALESCE((v_stats_venc->>'sequencia_defesas')::INT, 0) + 1
                                       ELSE COALESCE((v_stats_venc->>'sequencia_defesas')::INT, 0) END,
           'maior_sequencia_defesas', GREATEST(
             COALESCE((v_stats_venc->>'maior_sequencia_defesas')::INT, 0),
             CASE WHEN p_vencedor_id = v_desafio.desafiado_id
                    THEN COALESCE((v_stats_venc->>'sequencia_defesas')::INT, 0) + 1
                    ELSE COALESCE((v_stats_venc->>'sequencia_defesas')::INT, 0) END
           )
         );
    UPDATE public.usuarios SET estatisticas = v_stats_novo_venc WHERE id = p_vencedor_id;
    PERFORM set_config('app.bypass_estat', 'off', false);
  END IF;

  IF p_perdedor_id IS NOT NULL AND p_perdedor_id <> p_vencedor_id THEN
    IF p_pontos_perda > 0 THEN
      INSERT INTO public.pontos_ledger (empresa_id, usuario_id, tipo, valor, origem, referencia_id, descricao)
      VALUES (v_desafio.empresa_id, p_perdedor_id, 'DESAFIO', -p_pontos_perda, 'desafio_1v1', p_desafio_id,
              'Derrota no desafio ' || COALESCE(v_desafio.tema_sorteado, ''));
    END IF;

    PERFORM set_config('app.bypass_estat', 'on', false);
    SELECT estatisticas INTO v_stats_perd FROM public.usuarios WHERE id = p_perdedor_id;
    IF v_stats_perd IS NULL THEN v_stats_perd := '{}'::jsonb; END IF;
    v_pontos_perd_resgat := COALESCE((v_stats_perd->>'pontos_resgataveis')::BIGINT, COALESCE((v_stats_perd->>'pontos_totais')::BIGINT, 0));
    v_stats_novo_perd := v_stats_perd
      || jsonb_build_object(
           'desafios_jogados', COALESCE((v_stats_perd->>'desafios_jogados')::INT, 0) + 1,
           'sequencia_vitorias', 0,
           'sequencia_defesas', 0,
           'pontos_desafios', CASE WHEN v_is_amistoso
                                     THEN GREATEST(0, COALESCE((v_stats_perd->>'pontos_desafios')::BIGINT, 0) - p_pontos_perda)
                                     ELSE COALESCE((v_stats_perd->>'pontos_desafios')::BIGINT, 0) END,
           'pontos_totais', CASE WHEN v_is_amistoso
                                   THEN GREATEST(0, COALESCE((v_stats_perd->>'pontos_totais')::BIGINT, 0) - p_pontos_perda)
                                   ELSE COALESCE((v_stats_perd->>'pontos_totais')::BIGINT, 0) END,
           'pontos_resgataveis', CASE WHEN v_is_amistoso
                                        THEN GREATEST(0, v_pontos_perd_resgat - p_pontos_perda)
                                        ELSE v_pontos_perd_resgat END
         );
    UPDATE public.usuarios SET estatisticas = v_stats_novo_perd WHERE id = p_perdedor_id;
    PERFORM set_config('app.bypass_estat', 'off', false);
  END IF;

  -- Garante que o GUC volte ao neutro mesmo em caminhos alternativos.
  PERFORM set_config('app.bypass_estat', 'off', false);

  RETURN jsonb_build_object('success', true, 'code', 'OK', 'message', 'Desafio liquidado e registrado no ledger.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_desafio_no_ledger(TEXT, TEXT, TEXT, INT, INT, TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.registrar_desafio_no_ledger(TEXT, TEXT, TEXT, INT, INT, TEXT) FROM anon;

-- pontuar_quiz: mesmo ajuste (GUC em nível de sessão).
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
  v_stats JSONB;
  v_pontos_totais BIGINT;
  v_pontos_quizzes BIGINT;
  v_pontos_resgataveis BIGINT;
  v_quizzes_respondidos INT;
  v_acertos_totais BIGINT;
  v_erros_totais BIGINT;
  v_streak_dias INT;
  v_ultimo_quiz_data TEXT;
  v_hoje DATE := CURRENT_DATE;
  v_ultima_data DATE;
  v_diff_dias INT;
  v_seq_acertos INT;
  v_pontos_por_acerto INT;
  v_config JSONB;
BEGIN
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

  SELECT perguntas, empresa_id INTO v_quiz_perguntas, v_empresa_id
    FROM public.quizzes WHERE id = p_quiz_id;
  IF v_quiz_perguntas IS NULL THEN
    RETURN jsonb_build_object('updated', false, 'reason', 'quiz_not_found');
  END IF;

  SELECT configuracoes INTO v_config FROM public.empresas WHERE id = v_empresa_id;
  v_pontos_por_acerto := COALESCE((v_config->>'pontosPorAcertoQuiz')::INT, 10);
  IF v_pontos_por_acerto <= 0 THEN v_pontos_por_acerto := 10; END IF;

  v_detalhes_validados := '[]'::jsonb;
  FOR v_det IN SELECT * FROM jsonb_array_elements(COALESCE(p_detalhes, '[]'::jsonb)) LOOP
    v_pergunta := NULL;
    SELECT e.value INTO v_pergunta
      FROM jsonb_array_elements(v_quiz_perguntas) AS e
     WHERE e.value->>'id' = v_det->>'pergunta_id'
     LIMIT 1;
    IF v_pergunta IS NULL THEN CONTINUE; END IF;
    BEGIN
      v_resp_escolhida := (v_det->>'resposta_escolhida')::INT;
    EXCEPTION WHEN OTHERS THEN v_resp_escolhida := -1; END;
    v_resp_correta := COALESCE((v_pergunta->>'resposta_correta')::INT, -1);
    v_correta := (v_resp_escolhida = v_resp_correta);
    IF v_correta THEN
      v_acertos_reais := v_acertos_reais + 1;
      v_pontos_recalculados := v_pontos_recalculados
        + GREATEST(v_pontos_por_acerto, COALESCE((v_det->>'pontos_ganhos')::INT, 0));
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
                                   THEN GREATEST(v_pontos_por_acerto, COALESCE((v_det->>'pontos_ganhos')::INT, 0))
                                   ELSE 0 END
         );
  END LOOP;

  UPDATE public.quizzes
     SET status = 'concluido',
         pontuacao_total = v_pontos_recalculados,
         respostas = v_detalhes_validados,
         respondido_em = now()
   WHERE id = p_quiz_id AND status <> 'concluido';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('updated', false, 'reason', 'already_concluded');
  END IF;

  SELECT colaborador_id INTO v_colaborador_id FROM public.quizzes WHERE id = p_quiz_id;

  IF v_colaborador_id IS NOT NULL THEN
    PERFORM set_config('app.bypass_estat', 'on', false);

    SELECT estatisticas INTO v_stats FROM public.usuarios WHERE id = v_colaborador_id;
    IF v_stats IS NULL THEN v_stats := '{}'::jsonb; END IF;

    v_pontos_totais := COALESCE((v_stats->>'pontos_totais')::BIGINT, 0);
    v_pontos_quizzes := COALESCE((v_stats->>'pontos_quizzes')::BIGINT, 0);
    v_pontos_resgataveis := COALESCE((v_stats->>'pontos_resgataveis')::BIGINT, v_pontos_totais);
    v_quizzes_respondidos := COALESCE((v_stats->>'quizzes_respondidos')::INT, 0);
    v_acertos_totais := COALESCE((v_stats->>'acertos_totais')::BIGINT, 0);
    v_erros_totais := COALESCE((v_stats->>'erros_totais')::BIGINT, 0);
    v_streak_dias := COALESCE((v_stats->>'streak_dias')::INT, 0);
    v_ultimo_quiz_data := v_stats->>'ultimo_quiz_data';
    v_seq_acertos := COALESCE((v_stats->>'sequencia_acertos')::INT, 0);

    v_ultima_data := v_ultimo_quiz_data::DATE;
    IF v_ultima_data IS NULL THEN
      v_streak_dias := 1;
    ELSE
      v_diff_dias := (v_hoje - v_ultima_data);
      IF v_diff_dias = 1 THEN v_streak_dias := v_streak_dias + 1;
      ELSIF v_diff_dias = 0 THEN v_streak_dias := GREATEST(v_streak_dias, 1);
      ELSIF v_diff_dias < 0 THEN v_streak_dias := GREATEST(v_streak_dias, 1);
      ELSE v_streak_dias := 1;
      END IF;
    END IF;

    FOR v_det IN SELECT * FROM jsonb_array_elements(v_detalhes_validados) LOOP
      IF (v_det->>'correta')::boolean THEN v_seq_acertos := v_seq_acertos + 1;
      ELSE v_seq_acertos := 0;
      END IF;
    END LOOP;

    UPDATE public.usuarios
       SET estatisticas = v_stats
           || jsonb_build_object(
                'pontos_totais', v_pontos_totais + v_pontos_recalculados,
                'pontos_quizzes', v_pontos_quizzes + v_pontos_recalculados,
                'pontos_resgataveis', v_pontos_resgataveis + v_pontos_recalculados,
                'quizzes_respondidos', v_quizzes_respondidos + 1,
                'acertos_totais', v_acertos_totais + v_acertos_reais,
                'erros_totais', v_erros_totais + v_erros_reais,
                'streak_dias', v_streak_dias,
                'ultimo_quiz_data', v_hoje::text,
                'sequencia_acertos', v_seq_acertos
              )
     WHERE id = v_colaborador_id;

    PERFORM set_config('app.bypass_estat', 'off', false);

    INSERT INTO public.pontos_ledger (empresa_id, usuario_id, tipo, valor, origem, referencia_id, descricao)
    VALUES (v_empresa_id, v_colaborador_id, 'QUIZ', v_pontos_recalculados, 'quiz', p_quiz_id,
            'Quiz diário concluído (' || v_acertos_reais || ' acertos, ' || v_erros_reais || ' erros)');
  END IF;

  PERFORM set_config('app.bypass_estat', 'off', false);

  RETURN jsonb_build_object(
    'updated', true,
    'pontos_recalculados', v_pontos_recalculados,
    'acertos_reais', v_acertos_reais,
    'erros_reais', v_erros_reais,
    'detalhes_validados', v_detalhes_validados
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pontuar_quiz(TEXT, INT, INT, INT, JSONB, JSONB) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pontuar_quiz(TEXT, INT, INT, INT, JSONB, JSONB) FROM anon;