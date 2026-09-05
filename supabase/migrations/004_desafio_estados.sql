-- ============================================================
-- 004_desafio_estados.sql — DESAFIOS 1V1: ESTADO + LEDGER SERVER-SIDE
-- ------------------------------------------------------------
-- Fase 5. Mantém o cálculo de vitória existente (validado pelo edge
-- pontuar-desafio), mas passa o REGISTRO de estado e o AUDIT de pontos
-- para o servidor, de forma IDEMPOTENTE:
--   1. aceitar_desafio: registra data_aceite (server timestamp) e uma
--      RESERVA_APOSTA no ledger quando o desafiado aceita.
--   2. registrar_desafio_no_ledger: quando a partida conclui, grava os
--      lançamentos de DESAFIO (vencedor +pontos, perdedor -perda no
--      amistoso) no ledger e a data_conclusao — numa única transação.
--
-- NÃO-DESTRUTIVO. Aplicar após 003_pontos_ledger.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1. COLUNAS DE TEMPO SERVER-SIDE
-- ------------------------------------------------------------
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS data_aceite TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS data_conclusao TIMESTAMP WITH TIME ZONE;

-- ------------------------------------------------------------
-- 2. RPC aceitar_desafio (idempotente)
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
-- 3. RPC registrar_desafio_no_ledger (idempotente — só conclui uma vez)
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