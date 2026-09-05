-- ============================================================
-- 059_push_tokens_email.sql
-- ------------------------------------------------------------
-- Guarda também o e-mail junto do código do celular. Assim o
-- entregador acha o celular pelo id OU pelo e-mail (se o id no
-- celular for diferente do id na nuvem, o e-mail salva).
-- ============================================================

ALTER TABLE public.push_tokens ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_push_tokens_email
  ON public.push_tokens (email);
