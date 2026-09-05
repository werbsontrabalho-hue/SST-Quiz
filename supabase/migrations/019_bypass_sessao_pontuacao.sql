-- ============================================================
-- 019_bypass_sessao_pontuacao.sql — AUTORIZAÇÃO POR TABELA TEMPORÁRIA
-- ------------------------------------------------------------
-- As migrations 015/017/018 tentaram o bypass via GUC (set_config /
-- current_setting), mas o gatilho não enxergava o valor no contexto do
-- PostgREST (erro "Alteração de campos restritos").
--
-- CORREÇÃO ROBUSTA: tabela TEMPORÁRIA de sessão. O RPC de pontuação
-- (pontuar_quiz / registrar_desafio_no_ledger) insere uma linha autorizando
-- o UPDATE de estatisticas do usuário; o gatilho verifica se há autorização
-- válida na sessão corrente. Como a tabela é temporária (ON COMMIT DROP) e
-- a função que insere é SECURITY DEFINER restrita a service_role, não há
-- como um usuário autorizar a si mesmo fora do RPC.
-- NÃO-DESTRUTIVO.
-- ============================================================

-- ------------------------------------------------------------
-- 1. FUNÇÕES DE APOIO
-- ------------------------------------------------------------
-- Autoriza o UPDATE de estatisticas de um usuário na sessão corrente.
-- SECURITY DEFINER + grant só a service_role: só o backend/RPCs autoritários
-- conseguem chamá-la (o cliente autenticado não tem EXECUTE).
CREATE OR REPLACE FUNCTION public.autorizar_pontuacao(p_usuario_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS sessao_pontuacao (usuario_id TEXT PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO sessao_pontuacao (usuario_id) VALUES (p_usuario_id)
    ON CONFLICT (usuario_id) DO NOTHING;
END;
$$;

-- Verifica se a sessão corrente autorizou a pontuação do usuário.
CREATE OR REPLACE FUNCTION public.hay_autorizacao_pontuacao(p_usuario_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existe BOOLEAN := false;
BEGIN
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM pg_temp.sessao_pontuacao WHERE usuario_id = p_usuario_id
    ) INTO v_existe;
  EXCEPTION WHEN undefined_table THEN
    v_existe := false;
  END;
  RETURN v_existe;
END;
$$;

GRANT EXECUTE ON FUNCTION public.autorizar_pontuacao(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.hay_autorizacao_pontuacao(TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2. GATILHO: aceita "estatisticas" na própria linha com autorização
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bloquear_autopromocao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Modo legado/anônimo: permite (comportamento atual do app sem Auth).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- BYPASS OFICIAL de vínculo (008): apenas o RPC vincular_auth_uid liga.
  IF current_setting('app.bypass_auth_uid_link', true) = 'on'
     AND NEW.auth_uid IS NOT NULL
     AND OLD.auth_uid::text IS DISTINCT FROM NEW.auth_uid::text
     AND OLD.perfil = NEW.perfil
     AND OLD.is_instrutor = NEW.is_instrutor
     AND OLD.empresa_id = NEW.empresa_id
     AND OLD.setor_id = NEW.setor_id
     AND OLD.ativo = NEW.ativo THEN
    RETURN NEW;
  END IF;

  -- BYPASS OFICIAL DE ESTATÍSTICAS (V-018): somente quando o RPC autoritário
  -- (pontuar_quiz / registrar_desafio_no_ledger) inserir autorização na
  -- sessão corrente para este usuário. Restringe a alteração a "estatisticas"
  -- e ao próprio usuário; demais campos sensíveis continuam bloqueados.
  IF public.hay_autorizacao_pontuacao(OLD.id)
     AND OLD.id = public.usuario_id_atual()
     AND NEW.perfil = OLD.perfil
     AND NEW.is_instrutor = OLD.is_instrutor
     AND OLD.auth_uid::text IS NOT DISTINCT FROM NEW.auth_uid::text
     AND NEW.empresa_id = OLD.empresa_id
     AND NEW.setor_id = OLD.setor_id
     AND NEW.ativo = OLD.ativo THEN
    RETURN NEW;
  END IF;

  -- Super admin pode tudo.
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF public.usuario_atual_perfil() = 'admin' AND NEW.empresa_id = public.user_empresa_id() THEN
    IF OLD.id = public.usuario_id_atual() AND NEW.perfil IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Autopromoção de perfil não permitida.';
    END IF;
    RETURN NEW;
  END IF;

  -- Colaborador autenticado alterando a PRÓPRIA linha: campos restritos.
  IF OLD.id = public.usuario_id_atual() THEN
    IF NEW.perfil IS DISTINCT FROM OLD.perfil
       OR NEW.is_instrutor IS DISTINCT FROM OLD.is_instrutor
       OR OLD.auth_uid::text IS DISTINCT FROM NEW.auth_uid::text
       OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR NEW.setor_id IS DISTINCT FROM OLD.setor_id
       OR NEW.ativo IS DISTINCT FROM OLD.ativo
       OR NEW.estatisticas IS DISTINCT FROM OLD.estatisticas THEN
      RAISE EXCEPTION 'Alteração de campos restritos não permitida.';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Sem permissão para alterar este usuário.';
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_autopromocao ON public.usuarios;
CREATE TRIGGER trg_bloquear_autopromocao
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_autopromocao();

-- ------------------------------------------------------------
-- 3. pontuar_quiz: autoriza via tabela temporária antes do UPDATE
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
    -- Autoriza o UPDATE de estatisticas deste usuário na sessão corrente.
    PERFORM public.autorizar_pontuacao(v_colaborador_id);

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