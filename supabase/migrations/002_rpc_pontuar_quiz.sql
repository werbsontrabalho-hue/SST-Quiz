-- ============================================================
-- 002_rpc_pontuar_quiz.sql — RPC TRANSACIONAL DE PONTUAÇÃO
-- ------------------------------------------------------------
-- Grava o resultado oficial de um quiz (status + pontos + respostas) e
-- atualiza as estatísticas do usuário numa ÚNICA transação, de forma
-- idempotente (não pontua duas vezes). Chamado pela Edge Function
-- pontuar-quiz com SERVICE_ROLE. SECURITY DEFINER: roda como dono do
-- schema para poder atualizar quizzes/usuarios sem RLS.
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

  SELECT colaborador_id INTO v_colaborador_id
    FROM public.quizzes WHERE id = p_quiz_id;

  IF v_colaborador_id IS NOT NULL THEN
    UPDATE public.usuarios
       SET estatisticas = p_novas_estatisticas
     WHERE id = v_colaborador_id;
  END IF;

  RETURN jsonb_build_object('updated', true);
END;
$$;