import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// REGRESSÃO: migração 009 (alinhamento do schema ao modelo do app)
// Garante que as colunas que o frontend envia ("poison fields") passem a
// existir no banco, para os upsert pararem de falhar com erro 42703.
// ============================================================

const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '009_alinear_schema.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

test('009: usuários ganham trofeus_temporadas e ultimo_quiz_data', () => {
  assert.match(sql, /usuarios[\s\S]*ADD COLUMN IF NOT EXISTS trofeus_temporadas JSONB DEFAULT '\[\]'::jsonb/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS ultimo_quiz_data TEXT/i);
});

test('009: empresas ganham historico_temporadas', () => {
  assert.match(sql, /empresas[\s\S]*ADD COLUMN IF NOT EXISTS historico_temporadas JSONB DEFAULT '\[\]'::jsonb/i);
});

test('009: setores ganham pontos_totais', () => {
  assert.match(sql, /setores[\s\S]*ADD COLUMN IF NOT EXISTS pontos_totais BIGINT DEFAULT 0/i);
});

test('009: salas ganham nota_minima_aprovacao e tempo_por_pergunta', () => {
  assert.match(sql, /salas_quiz_guiado[\s\S]*ADD COLUMN IF NOT EXISTS nota_minima_aprovacao NUMERIC/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS tempo_por_pergunta INT/i);
});

test('009: resultados de avaliação ganham os campos de relatório', () => {
  assert.match(sql, /resultados_avaliacao_sst[\s\S]*ADD COLUMN IF NOT EXISTS matricula TEXT/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS cpf TEXT/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS cargo TEXT/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS setor_nome TEXT/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS email TEXT/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS sala_nome TEXT/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS data_finalizacao TEXT/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS porcentagem_acertos NUMERIC/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS questoes_corretas INT/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS total_questoes INT/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS nota_minima_aprovacao NUMERIC/i);
});

test('009: campanhas ganham pontos_por_acerto e backups ganham escopo', () => {
  assert.match(sql, /campanhas[\s\S]*ADD COLUMN IF NOT EXISTS pontos_por_acerto INT/i);
  assert.match(sql, /backups_historico[\s\S]*ADD COLUMN IF NOT EXISTS escopo TEXT DEFAULT 'global'/i);
});

test('009: é não-destrutiva (só ADD COLUMN IF NOT EXISTS, sem DROP)', () => {
  const sqlSemComentarios = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(sqlSemComentarios, /DROP\s+TABLE/i);
  assert.doesNotMatch(sqlSemComentarios, /DROP\s+COLUMN/i);
});