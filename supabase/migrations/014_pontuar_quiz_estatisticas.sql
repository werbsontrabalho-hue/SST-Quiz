-- ============================================================
-- 014_pontuar_quiz_estatisticas.sql — SERVIDOR CALCULA AS ESTATÍSTICAS
-- ------------------------------------------------------------
-- A auditoria forense (AUD-37, extensão da Fase 11) constatou que, embora a
-- 010 já revalide o GABARITO, o RPC pontuar_quiz ainda gravava
-- usuarios.estatisticas = p_novas_estatisticas (payload do chamador). Um
-- colaborador que respondesse corretamente a um quiz próprio poderia inflar
-- pontos_totais/pontos_resgataveis arbitrários no mesmo payload.
--
-- CORREÇÃO: o RPC passa a RECALCULAR as estatísticas no servidor a partir do
-- estado atual do banco + os pontos/acertos/erros REVALIDADOS pelo próprio
-- RPC. O parâmetro p_novas_estatisticas é IGNORADO para campos de pontos e
-- contadores. Bônus de velocidade/streak vêm da edge function (que valida o
-- tempo no servidor) e entram via "pontos_ganhos" de cada detalhe já
-- revalidado contra o gabarito.
-- NÃO-DESTRUTIVO: apenas reescreve a função.
-- ============================================================

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

  -- Pontos por acerto da empresa (padrão 10, como a edge function usa).
  SELECT configuracoes INTO v_config FROM public.empresas WHERE id = v_empresa_id;
  v_pontos_por_acerto := COALESCE((v_config->>'pontosPorAcertoQuiz')::INT, 10);
  IF v_pontos_por_acerto <= 0 THEN v_pontos_por_acerto := 10; END IF;

  -- Revalida cada resposta contra o gabarito no banco.
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
    -- Carrega as estatísticas ATUAIS do usuário no banco (fonte de verdade).
    SELECT estatisticas INTO v_stats
      FROM public.usuarios WHERE id = v_colaborador_id;
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

    -- Streak diário REAL por data (mesma regra do app):
    -- último quiz ontem → +1; hoje → mantém; antes/ausente → reinicia.
    v_ultima_data := v_ultimo_quiz_data::DATE;
    IF v_ultima_data IS NULL THEN
      v_streak_dias := 1;
    ELSE
      v_diff_dias := (v_hoje - v_ultima_data);
      IF v_diff_dias = 1 THEN
        v_streak_dias := v_streak_dias + 1;
      ELSIF v_diff_dias = 0 THEN
        v_streak_dias := GREATEST(v_streak_dias, 1);
      ELSIF v_diff_dias < 0 THEN
        v_streak_dias := GREATEST(v_streak_dias, 1); -- relógio no futuro: mantém
      ELSE
        v_streak_dias := 1;
      END IF;
    END IF;

    -- Sequência de acertos consecutivos: percorre os detalhes validados.
    FOR v_det IN SELECT * FROM jsonb_array_elements(v_detalhes_validados) LOOP
      IF (v_det->>'correta')::boolean THEN
        v_seq_acertos := v_seq_acertos + 1;
      ELSE
        v_seq_acertos := 0;
      END IF;
    END LOOP;

    -- RECALCULA as estatísticas no servidor (ignora p_novas_estatisticas para
    -- pontos e contadores — fraude fechada). Preserva os demais campos que o
    -- app mantém (desafios, troféus, sequências de vitórias etc.).
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

GRANT EXECUTE ON FUNCTION public.pontuar_quiz(TEXT, INT, INT, INT, JSONB, JSONB) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pontuar_quiz(TEXT, INT, INT, INT, JSONB, JSONB) FROM anon;