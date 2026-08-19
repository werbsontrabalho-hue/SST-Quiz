-- ============================================================
-- 006_seguranca_hardening.sql — ENDURECIMENTO DE SEGURANÇA (RPCs + RLS)
-- ------------------------------------------------------------
-- Corrige as vulnerabilidades apontadas na auditoria de segurança:
--   1. resgatar_premio: NÃO aceita mais o custo informado pelo cliente.
--      O custo passa a ser lido da tabela premiacoes (autoritativo).
--   2. resgatar_premio / reembolsar_resgate / aceitar_desafio /
--      registrar_desafio_no_ledger / registrar_resposta_quiz_guiado /
--      registrar_marco_sala_quiz_guiado / pontuar_quiz /
--      registrar_pontos_ledger: adicionam verificação de quem está chamando
--      (auth.uid()) e de ESCOPO, impedindo que um usuário autenticado atue
--      em nome de outro ou fora da própria empresa.
--   3. Usuários: gatilho que impede AUTO-PROMOÇÃO de perfil (colaborador
--      autenticado não pode virar admin/instrutor alterando a própria linha).
--   4. View pública de salas: passa a ser SECURITY_INVOKER (aplica a RLS da
--      tabela) e SANITIZA também os participantes (remove o campo "correta"
--      das respostas — anti-cola).
--
-- IMPORTANTE (não destrutivo): o MODO LEGADO (sem Supabase Auth — auth.uid()
-- IS NULL) continua funcionando exatamente como antes, pois o app depende
-- dele no login por senha. O endurecimento vale para quem ESTÁ autenticado.
-- Para desativar o modo legado por completo, veja o comentário ao final.
--
-- Aplicar no SQL Editor após 001, 002, 003, 004 e 005.
-- ============================================================

-- ------------------------------------------------------------
-- 0. HELPERS DE AUTORIZAÇÃO (idempotentes)
-- ------------------------------------------------------------

-- Retorna true se o usuário autenticado pode administrar a empresa informada
-- (super_admin global, ou admin/instrutor da própria empresa).
CREATE OR REPLACE FUNCTION public.pode_gerenciar_empresa(p_empresa_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND public.user_empresa_id() = p_empresa_id)
$$;

-- ------------------------------------------------------------
-- 1. RPC resgatar_premio (custo autoritativo do servidor + escopo)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resgatar_premio(
  p_premiacao_id TEXT,
  p_resgate JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_resgate_id TEXT;
  v_usuario_id TEXT;
  v_empresa_id TEXT;
  v_custo INT;
  v_estoque INT;
  v_saldo INT;
  v_estatisticas JSONB;
  v_titulo TEXT;
BEGIN
  v_resgate_id  := p_resgate->>'id';
  v_usuario_id  := p_resgate->>'usuario_id';
  v_empresa_id  := p_resgate->>'empresa_id';

  IF v_resgate_id IS NULL OR v_usuario_id IS NULL OR p_premiacao_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID', 'message', 'Parâmetros inválidos.');
  END IF;

  -- SEGURANÇA (endurecimento): usuário autenticado só pode resgatar em nome
  -- DELE MESMO e dentro da própria empresa. O modo legado (sem JWT) mantém o
  -- comportamento anterior para não quebrar o login por senha.
  IF auth.uid() IS NOT NULL THEN
    IF v_usuario_id <> public.usuario_id_atual() THEN
      RETURN jsonb_build_object('success', false, 'code', 'ACESSO_NEGADO', 'message', 'Você só pode resgatar prêmios em seu próprio nome.');
    END IF;
    IF NOT public.pode_gerenciar_empresa(v_empresa_id)
       AND public.user_empresa_id() IS DISTINCT FROM v_empresa_id THEN
      RETURN jsonb_build_object('success', false, 'code', 'ACESSO_NEGADO', 'message', 'Prêmio fora da sua empresa.');
    END IF;
  END IF;

  -- Idempotência: resgate já registrado não debita de novo.
  IF EXISTS (SELECT 1 FROM public.resgates_premios WHERE id = v_resgate_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_EXISTS', 'message', 'Resgate já registrado.');
  END IF;

  -- Trava a linha do prêmio (evita corrida pelo último item do estoque) e lê
  -- o CUSTO AUTORITATIVO do servidor — o cliente NÃO define mais o custo.
  SELECT estoque, custo_pontos, titulo
    INTO v_estoque, v_custo, v_titulo
    FROM public.premiacoes WHERE id = p_premiacao_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Prêmio não encontrado.');
  END IF;

  -- Estoque finito e zerado?
  IF v_estoque IS NOT NULL AND v_estoque <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'ESGOTADO', 'message', 'Este prêmio está temporariamente esgotado!');
  END IF;

  -- Saldo do usuário (com trava para não computar concorrente).
  SELECT estatisticas INTO v_estatisticas FROM public.usuarios WHERE id = v_usuario_id FOR UPDATE;
  v_saldo := COALESCE((v_estatisticas->>'pontos_resgataveis')::INT, (v_estatisticas->>'pontos_totais')::INT, 0);
  IF v_saldo < v_custo THEN
    RETURN jsonb_build_object('success', false, 'code', 'SALDO_INSUFICIENTE', 'message', 'Saldo insuficiente para este resgate.');
  END IF;

  -- Débito do saldo.
  v_estatisticas := jsonb_set(v_estatisticas, '{pontos_resgataveis}', to_jsonb(v_saldo - v_custo));
  UPDATE public.usuarios SET estatisticas = v_estatisticas WHERE id = v_usuario_id;

  -- Estoque finito: decrementa.
  IF v_estoque IS NOT NULL THEN
    UPDATE public.premiacoes SET estoque = v_estoque - 1 WHERE id = p_premiacao_id;
  END IF;

  -- Registro do resgate (com o custo autoritativo do servidor).
  INSERT INTO public.resgates_premios (
    id, empresa_id, usuario_id, usuario_nome, usuario_email, usuario_setor_nome,
    premiacao_id, premiacao_titulo, premiacao_imagem, custo_pontos, status,
    data_resgate, observacoes
  ) VALUES (
    v_resgate_id,
    v_empresa_id,
    v_usuario_id,
    COALESCE(p_resgate->>'usuario_nome', ''),
    p_resgate->>'usuario_email',
    p_resgate->>'usuario_setor_nome',
    p_premiacao_id,
    v_titulo,
    p_resgate->>'premiacao_imagem',
    v_custo,
    'pendente',
    COALESCE((p_resgate->>'data_resgate')::TIMESTAMPTZ, NOW()),
    p_resgate->>'observacoes'
  );

  -- Ledger: débito do resgate.
  INSERT INTO public.pontos_ledger (empresa_id, usuario_id, tipo, valor, origem, referencia_id, descricao)
  VALUES (v_empresa_id, v_usuario_id, 'RESGATE', -v_custo, 'resgate_premio', v_resgate_id,
          'Resgate do prêmio "' || v_titulo || '"');

  RETURN jsonb_build_object('success', true, 'code', 'OK', 'message', 'Resgate registrado com sucesso.');
END;
$$;

-- ------------------------------------------------------------
-- 2. RPC reembolsar_resgate (só admin/instrutor/super_admin da empresa)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reembolsar_resgate(
  p_resgate_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_resgate RECORD;
  v_estatisticas JSONB;
  v_saldo INT;
BEGIN
  SELECT * INTO v_resgate FROM public.resgates_premios WHERE id = p_resgate_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Resgate não encontrado.');
  END IF;

  -- SEGURANÇA: somente super_admin ou admin/instrutor da empresa do resgate.
  -- No modo legado (sem JWT) mantém o comportamento anterior.
  IF auth.uid() IS NOT NULL AND NOT public.pode_gerenciar_empresa(v_resgate.empresa_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'ACESSO_NEGADO', 'message', 'Somente o administrador da empresa pode reembolsar resgates.');
  END IF;

  IF v_resgate.status = 'rejeitado' OR v_resgate.status = 'entregue' THEN
    RETURN jsonb_build_object('success', false, 'code', 'STATUS_INVALIDO', 'message', 'Este resgate não pode ser reembolsado.');
  END IF;

  -- Devolve pontos.
  SELECT estatisticas INTO v_estatisticas FROM public.usuarios WHERE id = v_resgate.usuario_id FOR UPDATE;
  v_saldo := COALESCE((v_estatisticas->>'pontos_resgataveis')::INT, (v_estatisticas->>'pontos_totais')::INT, 0);
  v_estatisticas := jsonb_set(v_estatisticas, '{pontos_resgataveis}', to_jsonb(v_saldo + v_resgate.custo_pontos));
  UPDATE public.usuarios SET estatisticas = v_estatisticas WHERE id = v_resgate.usuario_id;

  -- Restaura estoque (só se o prêmio ainda existir e tiver estoque finito).
  UPDATE public.premiacoes
     SET estoque = estoque + 1
   WHERE id = v_resgate.premiacao_id AND estoque IS NOT NULL;

  UPDATE public.resgates_premios
     SET status = 'rejeitado', data_atualizacao = now()
   WHERE id = p_resgate_id;

  INSERT INTO public.pontos_ledger (empresa_id, usuario_id, tipo, valor, origem, referencia_id, descricao)
  VALUES (v_resgate.empresa_id, v_resgate.usuario_id, 'REEMBOLSO', v_resgate.custo_pontos, 'reembolso_resgate', p_resgate_id,
          'Reembolso do resgate "' || v_resgate.premiacao_titulo || '"');

  RETURN jsonb_build_object('success', true, 'code', 'OK', 'message', 'Resgate reembolsado com sucesso.');
END;
$$;

-- ------------------------------------------------------------
-- 3. RPC aceitar_desafio (só o próprio desafiado pode aceitar)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aceitar_desafio(
  p_desafio_id TEXT,
  p_usuario_id TEXT
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

  -- SEGURANÇA: usuário autenticado só pode aceitar em nome próprio.
  -- (O modo legado mantém o comportamento anterior.)
  IF auth.uid() IS NOT NULL AND p_usuario_id <> public.usuario_id_atual() THEN
    RETURN jsonb_build_object('success', false, 'code', 'ACESSO_NEGADO', 'message', 'Você só pode aceitar desafios em seu próprio nome.');
  END IF;

  -- Só o desafiado aceita.
  IF v_desafio.desafiado_id IS DISTINCT FROM p_usuario_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'NAO_PERMITIDO', 'message', 'Somente o desafiado pode aceitar.');
  END IF;

  -- Idempotente: já aceito/concluído não re-registra.
  IF v_desafio.status <> 'pendente' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ESTADO_INVALIDO', 'message', 'Desafio não está pendente.');
  END IF;

  UPDATE public.desafios_1v1
     SET status = 'aceito', data_aceite = now()
   WHERE id = p_desafio_id;

  -- Reserva da aposta (registro de auditoria; o movimento real ocorre na conclusão).
  INSERT INTO public.pontos_ledger (empresa_id, usuario_id, tipo, valor, origem, referencia_id, descricao)
  VALUES (v_desafio.empresa_id, p_usuario_id, 'RESERVA_APOSTA', 0, 'desafio_1v1', p_desafio_id,
          'Desafio aceito — aposta reservada (' || COALESCE(v_desafio.tipo, '') || ', ' || COALESCE(v_desafio.aposta_pontos, 0)::TEXT || ' pts)');

  RETURN jsonb_build_object('success', true, 'code', 'OK', 'message', 'Desafio aceito.');
END;
$$;

-- ------------------------------------------------------------
-- 4. RPC registrar_desafio_no_ledger (só participantes/admin/super)
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

  -- Idempotência: partida já concluída não é liquidada de novo.
  IF v_desafio.status = 'concluido' THEN
    RETURN jsonb_build_object('success', false, 'code', 'JA_CONCLUIDO', 'message', 'Desafio já liquidado.');
  END IF;

  UPDATE public.desafios_1v1
     SET status = 'concluido', data_conclusao = now(),
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
-- 5. RPC registrar_resposta_quiz_guiado (participante não responde por outro)
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
BEGIN
  SELECT * INTO v_sala FROM public.salas_quiz_guiado WHERE id = p_sala_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Sala não encontrada.');
  END IF;

  -- SEGURANÇA: usuário autenticado só pode registrar resposta em nome próprio
  -- (ou ser instrutor/admin da empresa da sala).
  IF auth.uid() IS NOT NULL THEN
    IF p_participante_id <> public.usuario_id_atual()
       AND NOT public.pode_gerenciar_empresa(v_sala.empresa_id) THEN
      RETURN jsonb_build_object('success', false, 'code', 'ACESSO_NEGADO', 'message', 'Não é possível responder em nome de outro participante.');
    END IF;
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

  -- Gravação IMUTÁVEL: a primeira escrita vence; respostas duplicadas são
  -- ignoradas silenciosamente (não altera o registro original).
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

-- ------------------------------------------------------------
-- 6. RPC registrar_marco_sala_quiz_guiado (só instrutor/admin/super)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_marco_sala_quiz_guiado(
  p_sala_id TEXT,
  p_marco TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_empresa_id TEXT;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM public.salas_quiz_guiado WHERE id = p_sala_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Sala não encontrada.');
  END IF;

  -- SEGURANÇA: somente super_admin ou admin/instrutor da empresa da sala.
  -- No modo legado (sem JWT) mantém o comportamento anterior.
  IF auth.uid() IS NOT NULL AND NOT public.pode_gerenciar_empresa(v_empresa_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'ACESSO_NEGADO', 'message', 'Somente o instrutor/admin pode registrar marcos da sala.');
  END IF;

  IF p_marco = 'inicio' THEN
    UPDATE public.salas_quiz_guiado SET data_inicio = now() WHERE id = p_sala_id AND data_inicio IS NULL;
  ELSIF p_marco = 'encerramento' THEN
    UPDATE public.salas_quiz_guiado SET data_encerramento = now() WHERE id = p_sala_id AND data_encerramento IS NULL;
  ELSE
    RETURN jsonb_build_object('success', false, 'code', 'MARCO_INVALIDO', 'message', 'Marco inválido.');
  END IF;
  RETURN jsonb_build_object('success', true, 'code', 'OK', 'message', 'Marco registrado.');
END;
$$;

-- ------------------------------------------------------------
-- 7. RPC pontuar_quiz (só o dono do quiz ou admin/super da empresa)
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
BEGIN
  -- SEGURANÇA: usuário autenticado só pode pontuar se o quiz pertence à sua
  -- empresa e (o próprio quiz é dele OU ele é admin/instrutor da empresa).
  -- O modo legado mantém o comportamento anterior.
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

  UPDATE public.quizzes
     SET status = 'concluido',
         pontuacao_total = p_pontos,
         respostas = p_detalhes,
         respondido_em = now()
   WHERE id = p_quiz_id AND status <> 'concluido';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('updated', false, 'reason', 'already_concluded');
  END IF;

  SELECT colaborador_id, empresa_id INTO v_colaborador_id, v_empresa_id
    FROM public.quizzes WHERE id = p_quiz_id;

  IF v_colaborador_id IS NOT NULL THEN
    UPDATE public.usuarios
       SET estatisticas = p_novas_estatisticas
     WHERE id = v_colaborador_id;

    INSERT INTO public.pontos_ledger (empresa_id, usuario_id, tipo, valor, origem, referencia_id, descricao)
    VALUES (v_empresa_id, v_colaborador_id, 'QUIZ', p_pontos, 'quiz', p_quiz_id,
            'Quiz diário concluído (' || p_acertos || ' acertos, ' || p_erros || ' erros)');
  END IF;

  RETURN jsonb_build_object('updated', true);
END;
$$;

-- ------------------------------------------------------------
-- 8. RPC registrar_pontos_ledger (somente super_admin quando autenticado)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_pontos_ledger(
  p_empresa_id TEXT,
  p_usuario_id TEXT,
  p_tipo TEXT,
  p_valor INT,
  p_origem TEXT,
  p_referencia_id TEXT DEFAULT NULL,
  p_descricao TEXT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  -- SEGURANÇA: usuário autenticado que não seja super_admin NÃO pode forjar
  -- lançamentos no ledger. O modo legado mantém o comportamento anterior.
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente o administrador global pode registrar pontos.';
  END IF;

  INSERT INTO public.pontos_ledger (empresa_id, usuario_id, tipo, valor, origem, referencia_id, descricao)
  VALUES (p_empresa_id, p_usuario_id, p_tipo, p_valor, p_origem, p_referencia_id, p_descricao)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- 9. USUÁRIOS: gatilho ANTI-AUTO-PROMOÇÃO
-- ------------------------------------------------------------
-- Impede que um usuário autenticado altere a PRÓPRIA linha para se promover
-- (perfil, is_instrutor) ou mudar empresa/setor/ativo/auth_uid. No modo
-- legado (sem JWT) o gatilho não bloqueia nada (o app depende do upsert).
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

  -- Super admin pode tudo.
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Admin/instrutor da MESMA empresa pode gerenciar colegas, mas não pode
  -- se auto-promover para um perfil superior ao dele.
  IF public.usuario_atual_perfil() = 'admin' AND NEW.empresa_id = public.user_empresa_id() THEN
    IF OLD.id = public.usuario_id_atual() AND NEW.perfil IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Autopromoção de perfil não permitida.';
    END IF;
    RETURN NEW;
  END IF;

  -- Colaborador autenticado alterando a PRÓPRIA linha: não pode tocar em
  -- campos sensíveis (perfil, is_instrutor, auth_uid, empresa, setor, ativo).
  IF OLD.id = public.usuario_id_atual() THEN
    IF NEW.perfil IS DISTINCT FROM OLD.perfil
       OR NEW.is_instrutor IS DISTINCT FROM OLD.is_instrutor
       OR NEW.auth_uid IS DISTINCT FROM OLD.auth_uid
       OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR NEW.setor_id IS DISTINCT FROM OLD.setor_id
       OR NEW.ativo IS DISTINCT FROM OLD.ativo THEN
      RAISE EXCEPTION 'Alteração de campos restritos não permitida.';
    END IF;
    RETURN NEW;
  END IF;

  -- Qualquer outra alteração autenticada sem permissão de admin: bloqueia.
  RAISE EXCEPTION 'Sem permissão para alterar este usuário.';
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_autopromocao ON public.usuarios;
CREATE TRIGGER trg_bloquear_autopromocao
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_autopromocao();

-- ------------------------------------------------------------
-- 10. VIEW PÚBLICA DE SALAS: SECURITY_INVOKER + SANITIZA PARTICIPANTES
-- ------------------------------------------------------------
-- Sanitiza a lista de participantes removendo o campo "correta" das respostas
-- (anti-cola: um participante não deve descobrir o gabarito vendo as respostas
-- marcadas de outro participante).
CREATE OR REPLACE FUNCTION public.sanitizar_participantes_publicos(participantes JSONB)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p->>'id',
        'usuario_id', p->>'usuario_id',
        'nome', p->>'nome',
        'matricula', p->>'matricula',
        'is_visitante', (p->>'is_visitante')::boolean,
        'pontuacao_acumulada', COALESCE((p->>'pontuacao_acumulada')::INT, 0),
        'respostas', (
          SELECT COALESCE(
            jsonb_object_agg(
              k,
              jsonb_build_object(
                'resposta_index', (v->>'resposta_index')::INT,
                'tempo_ms', COALESCE((v->>'tempo_ms')::INT, 0),
                'timestamp', v->>'timestamp'
              )
            ),
            '{}'::jsonb
          )
          FROM jsonb_each(COALESCE(p->'respostas', '{}'::jsonb)) AS e(k, v)
        )
      )
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(participantes) AS p
  WHERE jsonb_typeof(participantes) = 'array'
$$;

-- Recria a view como SECURITY_INVOKER: a RLS da tabela salas_quiz_guiado
-- passa a valer também para quem consulta a view (usuário autenticado só vê
-- a própria empresa; visitante legado continua vendo o que a política permite).
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
  question_ends_at,
  historico_sessoes,
  posicoes_anteriores
FROM public.salas_quiz_guiado;

-- ============================================================
-- NOTA FINAL — DESATIVAR O MODO LEGADO (opcional)
-- ------------------------------------------------------------
-- Este script mantém o modo legado (auth.uid() IS NULL → acesso aberto)
-- para não quebrar o login por senha e o sync cross-device do app.
--
-- Quando a migração para Supabase Auth estiver completa, REVOGUE o acesso
-- anônimo trocando a definição de modo_legado_anonimo() para retornar false
-- SEMPRE, e revogue os GRANTs de anon em todas as tabelas:
--
--   CREATE OR REPLACE FUNCTION public.modo_legado_anonimo()
--   RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
--   SET search_path = public, pg_temp AS $$ SELECT false $$;
--
--   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
--   REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
--   REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
-- ============================================================