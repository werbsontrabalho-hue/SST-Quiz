-- ============================================================
-- 020_bypass_tabela_real.sql — AUTORIZAÇÃO POR TABELA REAL (V-018)
-- ------------------------------------------------------------
-- As tentativas de bypass via GUC (015/017/018) e tabela temporária (019)
-- não funcionaram no contexto SECURITY DEFINER via PostgREST. Esta migration
-- usa uma TABELA REAL de autorização com expiração curta:
--
--   autorizacoes_pontuacao (usuario_id, criado_em)
--
-- O RPC autoritativo (pontuar_quiz / registrar_desafio_no_ledger) insere um
-- registro para o usuário; o gatilho verifica se há autorização VÁLIDA (não
-- expirada) para aquela linha; ao final da transação o registro é removido.
--
-- SEGURANÇA: a função que insere (autorizar_pontuacao) é SECURITY DEFINER e
-- o EXECUTE só é concedido a service_role (não ao usuário autenticado), então
-- nenhum colaborador consegue autorizar a si mesmo fora dos RPCs.
-- NÃO-DESTRUTIVO.
-- ============================================================

-- Tabela de autorização com expiração de 2 minutos (tempo suficiente para a
-- transação de pontuação concluir; não acumula).
CREATE TABLE IF NOT EXISTS public.autorizacoes_pontuacao (
  usuario_id TEXT PRIMARY KEY,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.autorizacoes_pontuacao IS
  'Autoriza o UPDATE de estatisticas de um usuario na sessao/transacao corrente (V-018).';

-- Não concede acesso à anon nem ao authenticated: só service_role (funções).
REVOKE ALL ON public.autorizacoes_pontuacao FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.autorizacoes_pontuacao TO service_role;

-- Autoriza a pontuação de um usuário (chamado apenas pelos RPCs autoritários).
CREATE OR REPLACE FUNCTION public.autorizar_pontuacao(p_usuario_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.autorizacoes_pontuacao (usuario_id)
  VALUES (p_usuario_id)
  ON CONFLICT (usuario_id) DO UPDATE SET criado_em = now();
END;
$$;

-- Verifica se há autorização VÁLIDA (não expirada) para o usuário.
CREATE OR REPLACE FUNCTION public.hay_autorizacao_pontuacao(p_usuario_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.autorizacoes_pontuacao
    WHERE usuario_id = p_usuario_id
      AND criado_em > now() - interval '2 minutes'
  );
END;
$$;

-- Remove a autorização após uso (no fim da transação do RPC).
CREATE OR REPLACE FUNCTION public.revogar_pontuacao(p_usuario_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.autorizacoes_pontuacao WHERE usuario_id = p_usuario_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.autorizar_pontuacao(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.revogar_pontuacao(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.hay_autorizacao_pontuacao(TEXT) TO authenticated, service_role;

-- Gatilho: aceita "estatisticas" na própria linha apenas com autorização válida.
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
  -- inserir autorização válida (não expirada) na tabela de controle para este
  -- usuário. Restringe a alteração a "estatisticas" e ao próprio usuário.
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