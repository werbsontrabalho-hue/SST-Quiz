import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// REGRESSÃO: migração 008 (correção do vínculo legado → Auth)
// Garante que o RPC vincular_auth_uid volte a funcionar após a
// desativação do modo legado: SECURITY DEFINER NÃO contorna gatilhos,
// então o gatilho bloquear_autopromocao rejeitava o UPDATE de auth_uid.
// A 008 liga o GUC 'app.bypass_auth_uid_link' dentro do RPC e o gatilho
// passa a aceitar EXCLUSIVAMENTE esse bypass (sem reabrir autopromoção).
// ============================================================

const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '008_corrigir_vincular_auth_uid.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

test('008: gatilho bloquear_autopromocao reconhece o GUC de bypass oficial', () => {
  assert.match(sql, /current_setting\('app\.bypass_auth_uid_link', true\)/i);
  assert.match(sql, /= 'on'/i);
});

test('008: bypass do gatilho fica restrito ao UPDATE de auth_uid (campos sensíveis travados)', () => {
  assert.match(sql, /OLD\.perfil = NEW\.perfil/i);
  assert.match(sql, /OLD\.is_instrutor = NEW\.is_instrutor/i);
  assert.match(sql, /OLD\.empresa_id = NEW\.empresa_id/i);
  assert.match(sql, /OLD\.setor_id = NEW\.setor_id/i);
  assert.match(sql, /OLD\.ativo = NEW\.ativo/i);
});

test('008: RPC vincular_auth_uid liga o GUC via set_config antes do UPDATE', () => {
  assert.match(sql, /set_config\('app\.bypass_auth_uid_link', 'on', true\)/i);
});

test('008: gatilho recriado (DROP + CREATE) para a função atualizada', () => {
  assert.match(sql, /DROP TRIGGER IF EXISTS trg_bloquear_autopromocao ON public\.usuarios;/i);
  assert.match(sql, /CREATE TRIGGER trg_bloquear_autopromocao/i);
});

test('008: EXECUTE do RPC mantém-se restrito a authenticated (não reabre anon)', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.vincular_auth_uid\(p_usuario_id TEXT\) FROM anon;/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.vincular_auth_uid\(p_usuario_id TEXT\) TO authenticated;/i);
});

test('008: nenhum GRANT ALL ... TO anon (não reabre o bypass multi-tenant)', () => {
  const sqlSemComentarios = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(sqlSemComentarios, /GRANT\s+ALL[\s\S]*TO anon/i);
});