-- ============================================================
-- 024_reverter_gatilho_estatisticas.sql — REVERTE BLOQUEIO DE ESTATISTICAS
-- ------------------------------------------------------------
-- As migrations 015-023 tentaram proteger a coluna "estatisticas" no
-- gatilho bloquear_autopromocao (V-018), mas o bypass (GUC, temp table ou
-- tabela real) NÃO funcionou de forma confiável no contexto SECURITY
-- DEFINER via PostgREST: os RPCs autoritativos (pontuar_quiz,
-- registrar_desafio_no_ledger) passaram a falhar com "Alteração de campos
-- restritos", quebrando a pontuação legítima.
--
-- DECISÃO: reverter o bloqueio de "estatisticas" no gatilho (voltando ao
-- comportamento da 016, funcional), mantendo protegidos os demais campos
-- sensíveis (perfil, is_instrutor, auth_uid, empresa, setor, ativo).
-- A proteção completa de "estatisticas" (V-018) fica para a Fase C
-- (server-first total), quando o app não depender mais de upsertUsuario
-- para estatísticas.
--
-- MITIGAÇÃO mantida: a migration 014 já faz o RPC pontuar_quiz RECALCULAR
-- as estatísticas no servidor (ignora o payload do chamador), fechando o
-- vetor de fraude mais crítico (inflar pontos via RPC).
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
  -- NOTA: "estatisticas" NÃO está na lista de bloqueio — o bloqueio completo
  -- (V-018) depende da Fase C server-first. O RPC pontuar_quiz (014) já
  -- recalcula as estatísticas no servidor (anti-fraude).
  IF OLD.id = public.usuario_id_atual() THEN
    IF NEW.perfil IS DISTINCT FROM OLD.perfil
       OR NEW.is_instrutor IS DISTINCT FROM OLD.is_instrutor
       OR OLD.auth_uid::text IS DISTINCT FROM NEW.auth_uid::text
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