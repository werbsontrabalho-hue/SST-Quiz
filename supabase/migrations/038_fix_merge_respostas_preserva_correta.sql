-- ============================================================
-- 038_fix_merge_respostas_preserva_correta.sql
-- ------------------------------------------------------------
-- CORREÇÃO (bug: "Você não pontuou nesta pergunta" mesmo acertando):
-- quando a validação server (edge/RPC) falhava, o participante gravava a
-- resposta localmente com `correta` INDEFINIDA (aguardando validação). Esse
-- payload era enviado ao RPC atualizar_participante_sala, cujo merge de
-- respostas (`||`) SOBRESCREVIA a resposta existente no banco, REMOVENDO o
-- campo `correta` já validado pelo servidor — o painel então mostrava
-- "Você não pontuou" mesmo a resposta estando certa no servidor.
--
-- CORREÇÃO: o merge passa a PRESERVAR o campo `correta` da resposta já
-- armazenada quando o payload enviado NÃO a define (undefined). Assim o
-- valor validado no servidor nunca é apagado por um upsert do participante.
-- NÃO-DESTRUTIVO: recreia a função e mantém grants.
-- ============================================================

CREATE OR REPLACE FUNCTION public.atualizar_participante_sala(
  p_sala_id TEXT,
  p_participante_id TEXT,
  p_respostas JSONB,
  p_pontuacao_acumulada INT DEFAULT NULL,
  p_nota_final NUMERIC DEFAULT NULL,
  p_situacao TEXT DEFAULT NULL,
  p_concluido BOOLEAN DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sala public.salas_quiz_guiado%ROWTYPE;
  v_participantes JSONB;
  v_idx INT;
  v_part JSONB;
  v_chave TEXT;
  v_entrada JSONB;
  v_existente JSONB;
  v_respostas_final JSONB;
  v_usuario_id TEXT;
BEGIN
  SELECT * INTO v_sala FROM public.salas_quiz_guiado WHERE id = p_sala_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Sala não encontrada.');
  END IF;

  -- ISOLAMENTO CROSS-EMPRESA: se autenticado, a sala deve ser da mesma empresa.
  IF auth.uid() IS NOT NULL THEN
    v_usuario_id := public.usuario_id_atual();
    IF NOT public.pode_gerenciar_empresa(v_sala.empresa_id)
       AND v_usuario_id IS NOT NULL
       AND (SELECT empresa_id FROM public.usuarios WHERE id = v_usuario_id) <> v_sala.empresa_id THEN
      RETURN jsonb_build_object('success', false, 'code', 'OUTRA_EMPRESA', 'message', 'Acesso negado: sala de outra empresa.');
    END IF;
  END IF;

  -- Localiza o participante no array JSONB.
  v_participantes := COALESCE(v_sala.participantes, '[]'::jsonb);
  SELECT i - 1 INTO v_idx
    FROM jsonb_array_elements(v_participantes) WITH ORDINALITY AS e(part, i)
   WHERE e.part->>'id' = p_participante_id OR e.part->>'usuario_id' = p_participante_id
   LIMIT 1;

  IF v_idx IS NULL OR v_idx < 0 THEN
    -- UPSERT: adiciona o participante quando ele ainda não existe (entrada na
    -- sessão). NUNCA substitui o array de perguntas/gabarito.
    v_part := jsonb_build_object(
      'id', p_participante_id,
      'usuario_id', NULL,
      'nome', COALESCE(p_respostas->>'__nome', ''),
      'matricula', COALESCE(p_respostas->>'__matricula', NULL),
      'cpf', COALESCE(p_respostas->>'__cpf', NULL),
      'cpf_ou_empresa', COALESCE(p_respostas->>'__cpf_ou_empresa', NULL),
      'is_visitante', true,
      'respostas', '{}'::jsonb,
      'pontuacao_acumulada', 0
    );
    v_participantes := v_participantes || jsonb_build_array(v_part);
    v_idx := jsonb_array_length(v_participantes) - 1;
  ELSE
    v_part := v_participantes->v_idx;
  END IF;

  -- Merge de respostas PRESERVANDO a `correta` validada no servidor:
  -- para cada resposta enviada, se o payload não define `correta` (undefined)
  -- e a resposta já armazenada TEM `correta`, mantém a armazenada.
  v_respostas_final := COALESCE(v_part->'respostas', '{}'::jsonb);
  FOR v_entrada IN SELECT jsonb_build_object('k', key, 'v', value)
                     FROM jsonb_each(COALESCE(p_respostas, '{}'::jsonb))
  LOOP
    v_chave := v_entrada->>'k';
    -- Ignora chaves internas de metadados (__nome/__matricula/...).
    IF v_chave LIKE '\_\_%' THEN
      CONTINUE;
    END IF;
    v_existente := v_respostas_final->v_chave;
    IF v_existente IS NOT NULL
       AND v_entrada->'v'->>'correta' IS NULL
       AND v_existente->>'correta' IS NOT NULL THEN
      -- Preserva a `correta` validada no servidor.
      v_respostas_final := jsonb_set(
        v_respostas_final,
        ARRAY[v_chave],
        (v_entrada->'v') || jsonb_build_object('correta', v_existente->'correta')
      );
    ELSE
      v_respostas_final := jsonb_set(v_respostas_final, ARRAY[v_chave], v_entrada->'v');
    END IF;
  END LOOP;

  v_part := jsonb_set(v_part, '{respostas}', v_respostas_final);
  IF p_pontuacao_acumulada IS NOT NULL THEN
    v_part := jsonb_set(v_part, '{pontuacao_acumulada}', to_jsonb(p_pontuacao_acumulada));
  END IF;
  IF p_nota_final IS NOT NULL THEN
    v_part := jsonb_set(v_part, '{nota_final}', to_jsonb(p_nota_final));
  END IF;
  IF p_situacao IS NOT NULL THEN
    v_part := jsonb_set(v_part, '{situacao}', to_jsonb(p_situacao));
  END IF;
  IF p_concluido IS NOT NULL THEN
    v_part := jsonb_set(v_part, '{concluido}', to_jsonb(p_concluido));
  END IF;

  v_participantes := jsonb_set(v_participantes, ARRAY[v_idx::text], v_part);

  -- Atualiza SOMENTE participantes — as perguntas (gabarito) permanecem íntegras.
  UPDATE public.salas_quiz_guiado
     SET participantes = v_participantes
   WHERE id = p_sala_id;

  RETURN jsonb_build_object('success', true, 'code', 'OK', 'message', 'Participante atualizado.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_participante_sala(TEXT, TEXT, JSONB, INT, NUMERIC, TEXT, BOOLEAN) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.atualizar_participante_sala(TEXT, TEXT, JSONB, INT, NUMERIC, TEXT, BOOLEAN) FROM anon;