import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// REGRESSÃO: migração 013 (leitura do próprio perfil por e-mail)
// Garante que um usuário autenticado consiga ler o PRÓPRIO perfil por
// e-mail (auth.jwt()->>'email') mesmo antes de ter o auth_uid vinculado —
// desbloqueando o RPC vincular_auth_uid (AUD-47/F1). Só a própria conta
// consegue (e-mail do JWT emitido pelo Auth), não abre leitura alheia.
// ============================================================

const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '013_rls_leitura_proprio_email.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

test('013: cria policy de leitura do próprio perfil por e-mail do JWT', () => {
  assert.match(sql, /"Usuarios Leitura Proprio Email"/i);
  assert.match(sql, /FOR SELECT USING/i);
  assert.match(sql, /auth\.jwt\(\)->>'email'/i);
});

test('013: exige sessão autenticada (auth.uid() NOT NULL)', () => {
  assert.match(sql, /auth\.uid\(\) IS NOT NULL/i);
});

test('013: comparação de e-mail é case-insensitive', () => {
  assert.match(sql, /lower\(COALESCE\(email, ''\)\) = lower\(COALESCE\(auth\.jwt\(\)->>'email', ''\)\)/i);
});

test('013: não reabre acesso a anon', () => {
  const sqlSemComentarios = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(sqlSemComentarios, /GRANT[\s\S]*TO anon/i);
});