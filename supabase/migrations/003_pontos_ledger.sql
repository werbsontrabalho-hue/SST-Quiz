-- ============================================================
-- 003_pontos_ledger.sql — LEDGER DE PONTOS + RESGATE TRANSACIONAL
-- ------------------------------------------------------------
-- Fase 3 (Ledger) e núcleo da Fase 4 (Premiações transacionais):
--   1. Tabela pontos_ledger: histórico imutável de TODOS os eventos de
--      pontos (QUIZ, DESAFIO, RESGATE, REEMBOLSO, AJUSTE, TROFEU...).
--   2. registrar_pontos_ledger: RPC de escrita (SECURITY DEFINER).
--   3. pontuar_quiz atualizada para também gravar no ledger.
--   4. resgatar_premio: RPC TRANSACIONAL — trava a linha do prêmio
--      (evita corrida pelo último item), valida estoque > 0 e saldo,
--      debita saldo, decrementa estoque, cria o resgate e grava o ledger
--      numa ÚNICA transação. Idempotente por id do resgate.
--   5. reembolsar_resgate: devolve pontos + estoque na mesma transação.
--
-- NÃO-DESTRUTIVO. Aplicar após 001_rls_consolidada.sql e 002.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABELA pontos_ledger
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pontos_ledger (
    id BIGSERIAL PRIMARY KEY,
    empresa_id TEXT,
    usuario_id TEXT,
    tipo TEXT NOT NULL,
    valor INT NOT NULL,
    origem TEXT NOT NULL,
    referencia_id TEXT,
    descricao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pontos_ledger_usuario ON public.pontos_ledger(usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pontos_ledger_empresa ON public.pontos_ledger(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pontos_ledger_origem  ON public.pontos_ledger(origem, referencia_id);

-- ------------------------------------------------------------
-- 2. RLS DO LEDGER (mesmo padrão: anônimo/legado aberto, autenticado escopado)
-- ------------------------------------------------------------
ALTER TABLE public.pontos_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ledger Legado Anonimo" ON public.pontos_ledger;
DROP POLICY IF EXISTS "Ledger Leitura Escopo" ON public.pontos_ledger;
DROP POLICY IF EXISTS "Ledger Inserção RPC" ON public.pontos_ledger;

CREATE POLICY "Ledger Legado Anonimo" ON public.pontos_ledger
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

CREATE POLICY "Ledger Leitura Escopo" ON public.pontos_ledger
  FOR SELECT USING (
    public.is_super_admin()
    OR usuario_id = public.usuario_id_atual()
    OR empresa_id = public.user_empresa_id()
  );

-- Escrita exclusivamente via RPC (SECURITY DEFINER). Nenhum insert direto
-- pela API (evita forjar lançamentos no ledger).
CREATE POLICY "Ledger Inserção RPC" ON public.pontos_ledger
  FOR INSERT WITH CHECK (public.is_super_admin());

-- ------------------------------------------------------------
-- 3. RPC registrar_pontos_ledger (uso genérico por flows futuros)
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.pontos_ledger (empresa_id, usuario_id, tipo, valor, origem, referencia_id, descricao)
  VALUES (p_empresa_id, p_usuario_id, p_tipo, p_valor, p_origem, p_referencia_id, p_descricao)
  RETURNING id
$$;

-- ------------------------------------------------------------
-- 4. pontuar_quiz atualizada: também grava o lançamento no ledger
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
-- 5. RPC resgatar_premio (transacional, idempotente)
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
  v_custo       := COALESCE((p_resgate->>'custo_pontos')::INT, 300);
  v_titulo      := COALESCE(p_resgate->>'premiacao_titulo', '');

  IF v_resgate_id IS NULL OR v_usuario_id IS NULL OR p_premiacao_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID', 'message', 'Parâmetros inválidos.');
  END IF;

  -- Idempotência: resgate já registrado não debita de novo.
  IF EXISTS (SELECT 1 FROM public.resgates_premios WHERE id = v_resgate_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_EXISTS', 'message', 'Resgate já registrado.');
  END IF;

  -- Trava a linha do prêmio (evita corrida pelo último item do estoque).
  SELECT estoque INTO v_estoque FROM public.premiacoes WHERE id = p_premiacao_id FOR UPDATE;
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

  -- Registro do resgate.
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
-- 6. RPC reembolsar_resgate (devolve pontos + estoque na mesma transação)
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