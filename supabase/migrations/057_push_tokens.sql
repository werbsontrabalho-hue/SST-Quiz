-- ============================================================
-- 057_push_tokens.sql
-- ------------------------------------------------------------
-- Tabela de códigos dos celulares (push tokens) para avisos estilo
-- WhatsApp: quando chega desafio, campanha, prêmio ou resultado, o
-- servidor localiza o celular do usuário e envia o aviso — mesmo com
-- o app fechado (exige Firebase configurado + Edge Function enviar-push).
--
-- 1. Tabela push_tokens (um usuário pode ter vários aparelhos).
-- 2. RLS: o próprio usuário gerencia seus tokens; service_role (Edge
--    Function) tem acesso total para enviar os avisos.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  plataforma TEXT NOT NULL DEFAULT 'android',
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_usuario
  ON public.push_tokens (usuario_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- O próprio usuário (via auth_uid ou e-mail do JWT) pode ver/cadastrar/apagar
-- apenas os tokens vinculados ao seu id em public.usuarios.
DROP POLICY IF EXISTS push_tokens_select_proprio ON public.push_tokens;
CREATE POLICY push_tokens_select_proprio ON public.push_tokens
  FOR SELECT TO authenticated
  USING (usuario_id = public.usuario_id_atual());

DROP POLICY IF EXISTS push_tokens_insert_proprio ON public.push_tokens;
CREATE POLICY push_tokens_insert_proprio ON public.push_tokens
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = public.usuario_id_atual());

DROP POLICY IF EXISTS push_tokens_update_proprio ON public.push_tokens;
CREATE POLICY push_tokens_update_proprio ON public.push_tokens
  FOR UPDATE TO authenticated
  USING (usuario_id = public.usuario_id_atual())
  WITH CHECK (usuario_id = public.usuario_id_atual());

DROP POLICY IF EXISTS push_tokens_delete_proprio ON public.push_tokens;
CREATE POLICY push_tokens_delete_proprio ON public.push_tokens
  FOR DELETE TO authenticated
  USING (usuario_id = public.usuario_id_atual());

-- Leitura anônima bloqueada (tokens são dados sensíveis do aparelho).
-- A Edge Function usa service_role (bypass RLS) para enviar os avisos.
