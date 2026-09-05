import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// REGRESSÃO: proteção de campos sensíveis no gatilho (V-018, estado final)
// Após a tentativa de bloqueio de "estatisticas" (015-023) e a reversão
// (024), o gatilho DEVE:
//   1) continuar protegendo perfil/is_instrutor/auth_uid/empresa/setor/ativo
//      na própria linha (auto-promoção fechada);
//   2) NÃO bloquear "estatisticas" (o RPC pontuar_quiz recalcula no servidor
//      — 014 — e é a via autoritativa; o bloqueio completo exige Fase C).
// ============================================================

const base = path.join(process.cwd(), 'supabase', 'migrations');
const sql024 = fs.readFileSync(path.join(base, '024_reverter_gatilho_estatisticas.sql'), 'utf8');
const sql014 = fs.readFileSync(path.join(base, '014_pontuar_quiz_estatisticas.sql'), 'utf8');
const sql025 = fs.readFileSync(path.join(base, '025_registrar_desafio_simples.sql'), 'utf8');

test('024: gatilho continua protegendo perfil/is_instrutor/auth_uid/empresa/setor/ativo', () => {
  assert.match(sql024, /NEW\.perfil IS DISTINCT FROM OLD\.perfil/i);
  assert.match(sql024, /NEW\.is_instrutor IS DISTINCT FROM OLD\.is_instrutor/i);
  assert.match(sql024, /OLD\.auth_uid::text IS DISTINCT FROM NEW\.auth_uid::text/i);
  assert.match(sql024, /NEW\.empresa_id IS DISTINCT FROM OLD\.empresa_id/i);
  assert.match(sql024, /NEW\.setor_id IS DISTINCT FROM OLD\.setor_id/i);
  assert.match(sql024, /NEW\.ativo IS DISTINCT FROM OLD\.ativo/i);
});

test('024: estatisticas NÃO está mais na lista de bloqueio da própria linha (decisão Fase C)', () => {
  const bloco = sql024.split('IF NEW.perfil IS DISTINCT FROM OLD.perfil')[1]?.split('THEN')[0] || '';
  assert.doesNotMatch(bloco, /estatisticas/i);
});

test('014: RPC pontuar_quiz recalcula estatísticas no servidor (não confia no chamador)', () => {
  assert.match(sql014, /SELECT estatisticas INTO v_stats/i);
  assert.match(sql014, /v_pontos_totais \+ v_pontos_recalculados/i);
  assert.match(sql014, /quizzes_respondidos', v_quizzes_respondidos \+ 1/i);
});

test('025: registrar_desafio_no_ledger valida vencedor participante e mesma empresa', () => {
  assert.match(sql025, /VENCEDOR_INVALIDO/i);
  assert.match(sql025, /VENCEDOR_OUTRA_EMPRESA/i);
  assert.match(sql025, /p_vencedor_id NOT IN \(v_desafio\.desafiante_id, v_desafio\.desafiado_id\)/i);
});