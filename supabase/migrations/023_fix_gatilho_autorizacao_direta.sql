-- ============================================================
-- 023_fix_gatilho_autorizacao_direta.sql — GATILHO VERIFICA TABELA DIRETO
-- ------------------------------------------------------------
-- O bypass via função hay_autorizacao_pontuacao retornava true quando
-- chamada via REST, mas dentro do gatilho (contexto SECURITY DEFINER do
-- trigger) o UPDATE ainda era bloqueado. Para eliminar qualquer problema de
-- contexto/privilégio, o gatilho passa a consultar a tabela
-- autorizacoes_pontuacao DIRETAMENTE (EXISTS) dentro da própria função de
-- trigger.
-- NÃO-DESTRUTIVO: reescreve o gatilho.
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

  -- BYPASS OFICIAL DE ESTATÍSTICAS (V-018): consulta DIRETA na tabela de
  -- autorização (sem função intermediária) — mais robusto no contexto de
  -- gatilho SECURITY DEFINER.
  IF EXISTS (
       SELECT 1 FROM public.autorizacoes_pontuacao
       WHERE usuario_id = OLD.id
         AND criado_em > now() - interval '2 minutes'
     )
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