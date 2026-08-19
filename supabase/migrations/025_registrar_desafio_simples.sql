-- ============================================================
-- 025_registrar_desafio_simples.sql — REESCREVE registrar_desafio_no_ledger
-- ------------------------------------------------------------
-- A versão criada na 021 (com autorizar_pontuacao/revogar_pontuacao) passou
-- a retornar 400 no PostgREST. Como o gatilho foi revertido na 024 (estatisticas
-- fora do bloqueio), essas chamadas de autorização não são mais necessárias.
-- Esta migration reescreve a função na versão SIMPLES e funcional (validação
-- de vencedor participante + ledger), sem dependências extras.
-- NÃO-DESTRUTIVO: reescreve a função.
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
  -- participantes do desafio e da MESMA empresa.
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

GRANT EXECUTE ON FUNCTION public.registrar_desafio_no_ledger(TEXT, TEXT, TEXT, INT, INT, TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.registrar_desafio_no_ledger(TEXT, TEXT, TEXT, INT, INT, TEXT) FROM anon;