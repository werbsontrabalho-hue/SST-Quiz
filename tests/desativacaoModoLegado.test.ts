import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// REGRESSÃO: migração 007 (desativação do modo legado anônimo)
// Garante que o bypass de isolamento multi-tenant (V-001) continue
// fechado: modo_legado_anonimo() = false, anon sem privilégios,
// EXECUTE de funções só para authenticated/service_role, e o RPC
// vincular_auth_uid com validação de e-mail no servidor.
// ============================================================

const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '007_desativar_modo_legado.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
// Remove linhas de comentário para que asserções testem apenas SQL real.
const sqlSemComentarios = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

test('007: modo_legado_anonimo() passa a retornar false SEMPRE', () => {
  assert.match(sql, /SELECT\s+false/i);
});

test('007: revoga acesso da role anon a tabelas/funções/sequências', () => {
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;/i);
  assert.match(sql, /REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;/i);
  assert.match(sql, /REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;/i);
});

test('007: EXECUTE de funções devolvido apenas a authenticated/service_role', () => {
  assert.match(sql, /GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;/i);
  assert.match(sql, /GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;/i);
});

test('007: RPC vincular_auth_uid valida sessão e e-mail no servidor (anti-ligação cruzada)', () => {
  assert.match(sql, /FUNCTION public\.vincular_auth_uid/i);
  assert.match(sql, /AUTH_REQUIRED/i);
  assert.match(sql, /EMAIL_DIVERGENTE/i);
  assert.match(sql, /JA_VINCULADO/i);
});

test('007: nenhum GRANT ALL ... TO anon (não reabre o bypass)', () => {
  assert.doesNotMatch(sqlSemComentarios, /GRANT\s+ALL[\s\S]*TO anon/i);
});