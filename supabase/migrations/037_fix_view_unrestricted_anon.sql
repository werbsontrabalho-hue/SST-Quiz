-- ============================================================
-- 037_fix_view_unrestricted_anon.sql — CORRIGE VIEW E VALIDAÇÃO DO VISITANTE
-- ------------------------------------------------------------
-- PROBLEMA 1 (informação "unrestricted" na view):
--   vw_salas_quiz_guiado_publica expunha `historico_sessoes` e
--   `posicoes_anteriores` SEM sanitização para qualquer anon/visitante que
--   lesse a sala por PIN. Esses campos contêm nomes/pontuações de
--   participantes de sessões anteriores. Nenhuma delas é necessária ao
--   participante atual — a view passa a expor apenas o mínimo para entrar
--   e jogar.
--
-- PROBLEMA 2 (resposta correta marcada como errada):
--   O participante VISITANTE obtém a sala sanitizada (sem resposta_correta).
--   Quando a Edge Function pontuar-quiz-guiado falha, o frontend recorre ao
--   RPC registrar_resposta_quiz_guiado — mas o EXECUTE era REVOGADO para
--   anon, então o fallback caía no cálculo local com `resposta_correta`
--   undefined → a resposta correta era marcada como errada.
--   CORREÇÃO: conceder EXECUTE a anon no RPC, mas com as MESMAS regras da
--   Edge Function — anon (visitante) só pode registrar resposta em sala com
--   permitir_visitantes = true E status aberto, E o participante deve existir
--   na sala (anti-oráculo mínimo). Autenticados continuam com as validações
--   cross-empresa/anti-impersonação já existentes.
-- NÃO-DESTRUTIVO: recria view e função; ajusta grants.
-- ============================================================

-- ------------------------------------------------------------
-- 1. VIEW SEM DADOS DE SESSÕES ANTERIORES
-- ------------------------------------------------------------
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
  question_ends_at
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

-- ------------------------------------------------------------
-- 2. RPC registrar_resposta_quiz_guiado: permite VISITANTE (anon) validar
--    a resposta no servidor com as mesmas regras da Edge Function.
-- ------------------------------------------------------------
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
  ELSE
    -- CORREÇÃO (Problema 2 — resposta correta marcada como errada): anon
    -- (participante VISITANTE) pode registrar resposta apenas em salas que
    -- aceitam visitantes E estão abertas, e o participante deve existir na
    -- sala (anti-oráculo). Validação igual à Edge Function.
    IF NOT COALESCE(v_sala.permitir_visitantes, false) THEN
      RETURN jsonb_build_object('success', false, 'code', 'ACESSO_NEGADO', 'message', 'Acesso negado: sala exige participante autenticado.');
    END IF;
    IF v_sala.status NOT IN ('aguardando', 'em_andamento') THEN
      RETURN jsonb_build_object('success', false, 'code', 'SALA_FECHADA', 'message', 'A sala não está aberta para respostas.');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(v_sala.participantes, '[]'::jsonb)) AS e
      WHERE e->>'id' = p_participante_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'code', 'PARTICIPANTE_NAO_ENCONTRADO', 'message', 'Participante não encontrado na sala.');
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

-- Grants: agora o RPC aceita anon (visitante) em salas com permitir_visitantes.
GRANT EXECUTE ON FUNCTION public.registrar_resposta_quiz_guiado(TEXT, TEXT, TEXT, TEXT, INT, INT) TO anon, authenticated, service_role;