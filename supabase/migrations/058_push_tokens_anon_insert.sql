-- ============================================================
-- 058_push_tokens_anon_insert.sql
-- ------------------------------------------------------------
-- Permite que o app registre o celular mesmo quando o usuário
-- entrou pela senha da tabela (sem sessão do Auth): o INSERT
-- anônimo é liberado SOMENTE para cadastrar token.
-- Leitura e apagamento continuam restritos (só o dono + o
-- entregador via service_role). Enviar avisos continua exigindo
-- as chaves secretas — cadastrar token sozinho não dá acesso.
-- ============================================================

DROP POLICY IF EXISTS push_tokens_insert_anon ON public.push_tokens;
CREATE POLICY push_tokens_insert_anon ON public.push_tokens
  FOR INSERT TO anon
  WITH CHECK (usuario_id IS NOT NULL AND token IS NOT NULL);
