-- ============================================================
-- 016_fix_gatilho_auth_uid_uuid.sql — CAST DE auth_uid (uuid vs text)
-- ------------------------------------------------------------
-- A coluna public.usuarios.auth_uid é do tipo UUID (referencia auth.users.id),
-- mas as funções de gatilho/RPC a comparam como texto. Isso gera o erro
-- "operator does not exist: uuid <> text" ao atualizar estatísticas via RPC
-- (V-018) ou ao vincular auth_uid. Correção: CAST explícito ::text nas
-- comparações do gatilho e do RPC vincular_auth_uid.
-- NÃO-DESTRUTIVO: apenas reescreve gatilho e função.
-- ============================================================

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

  -- BYPASS OFICIAL DE ESTATÍSTICAS (V-018): somente os RPCs autoritativos de
  -- pontuação (pontuar_quiz, registrar_desafio_no_ledger, resgatar_premio,
  -- reembolsar_resgate) ligam este GUC. Restringe a alteração a "estatisticas"
  -- e ao próprio usuário; demais campos sensíveis continuam bloqueados.
  IF current_setting('app.bypass_estat', true) = 'on'
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

  -- Admin/instrutor da MESMA empresa pode gerenciar colegas, mas não pode
  -- se auto-promover para um perfil superior ao dele.
  IF public.usuario_atual_perfil() = 'admin' AND NEW.empresa_id = public.user_empresa_id() THEN
    IF OLD.id = public.usuario_id_atual() AND NEW.perfil IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Autopromoção de perfil não permitida.';
    END IF;
    RETURN NEW;
  END IF;

  -- Colaborador autenticado alterando a PRÓPRIA linha: não pode tocar em
  -- campos sensíveis (perfil, is_instrutor, auth_uid, empresa, setor, ativo,
  -- estatisticas).
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

  -- Qualquer outra alteração autenticada sem permissão de admin: bloqueia.
  RAISE EXCEPTION 'Sem permissão para alterar este usuário.';
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_autopromocao ON public.usuarios;
CREATE TRIGGER trg_bloquear_autopromocao
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_autopromocao();

-- Corrige também o RPC vincular_auth_uid (008): o UPDATE de auth_uid numa
-- coluna UUID recebe o valor como texto; o Postgres converte implicitamente
-- string UUID válida, mas garantimos o cast explícito para evitar ambiguidade.
CREATE OR REPLACE FUNCTION public.vincular_auth_uid(p_usuario_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_uid TEXT := auth.uid()::text;
  v_email TEXT;
  v_user public.usuarios%ROWTYPE;
BEGIN
  IF v_auth_uid IS NULL OR v_auth_uid = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'AUTH_REQUIRED', 'message', 'Sessão não autenticada.');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  SELECT * INTO v_user FROM public.usuarios WHERE id = p_usuario_id;
  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Perfil não encontrado.');
  END IF;

  IF v_user.auth_uid IS NOT NULL AND v_user.auth_uid::text <> v_auth_uid THEN
    RETURN jsonb_build_object('success', false, 'code', 'JA_VINCULADO', 'message', 'Este perfil já está vinculado a outra conta.');
  END IF;

  IF lower(COALESCE(v_user.email, '')) <> lower(COALESCE(v_email, '')) THEN
    RETURN jsonb_build_object('success', false, 'code', 'EMAIL_DIVERGENTE', 'message', 'O e-mail do perfil não corresponde à conta autenticada.');
  END IF;

  PERFORM set_config('app.bypass_auth_uid_link', 'on', true);
  UPDATE public.usuarios SET auth_uid = v_auth_uid::uuid WHERE id = p_usuario_id;

  RETURN jsonb_build_object('success', true, 'code', 'OK', 'message', 'Perfil vinculado à conta autenticada.');
END;
$$;

REVOKE ALL ON FUNCTION public.vincular_auth_uid(p_usuario_id TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vincular_auth_uid(p_usuario_id TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.vincular_auth_uid(p_usuario_id TEXT) TO authenticated;