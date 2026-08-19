import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// REGRESSÃO: migration 032 (colunas de sessão nos resultados)
// Garante que resultados_avaliacao_sst aceite sessao_id /
// codigo_documento / sessao_codigo (separação de avaliações por sessão —
// evita PDF/avaliação de sessão anterior).
// ============================================================

const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '032_resultados_sessao.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

test('032: adiciona sessao_id aos resultados', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS sessao_id TEXT/i);
});

test('032: adiciona codigo_documento e sessao_codigo aos resultados', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS codigo_documento TEXT/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS sessao_codigo TEXT/i);
});

test('032: cria índice de consulta por sessão', () => {
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_resultados_sessao ON public\.resultados_avaliacao_sst \(sala_id, sessao_id\)/i);
});

test('032: não-destrutiva (só ADD COLUMN IF NOT EXISTS)', () => {
  const sqlSemComentarios = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(sqlSemComentarios, /DROP\s+TABLE/i);
  assert.doesNotMatch(sqlSemComentarios, /DROP\s+COLUMN/i);
});