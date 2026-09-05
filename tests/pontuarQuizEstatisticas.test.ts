import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// REGRESSÃO: migração 014 (servidor recalcula as estatísticas do quiz)
// Garante que o RPC pontuar_quiz NÃO grave mais o payload
// p_novas_estatisticas do chamador para pontos/contadores (fraude de
// inflar pontos_totais/pontos_resgataveis fechada na Fase 11 estendida).
// ============================================================

const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '014_pontuar_quiz_estatisticas.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

test('014: pontuar_quiz recalcula estatísticas no servidor (ignora p_novas_estatisticas p/ pontos)', () => {
  assert.match(sql, /SELECT estatisticas INTO v_stats/i);
  assert.match(sql, /v_pontos_totais \+ v_pontos_recalculados/i);
  assert.match(sql, /v_pontos_resgataveis \+ v_pontos_recalculados/i);
  assert.match(sql, /quizzes_respondidos', v_quizzes_respondidos \+ 1/i);
});

test('014: recalcula acertos e erros acumulados no servidor', () => {
  assert.match(sql, /acertos_totais', v_acertos_totais \+ v_acertos_reais/i);
  assert.match(sql, /erros_totais', v_erros_totais \+ v_erros_reais/i);
});

test('014: streak diário é recalculado por data no servidor', () => {
  assert.match(sql, /streak_dias/i);
  assert.match(sql, /ultimo_quiz_data', v_hoje::text/i);
});

test('014: sequência de acertos é recalculada a partir dos detalhes validados', () => {
  assert.match(sql, /v_seq_acertos := v_seq_acertos \+ 1/i);
  assert.match(sql, /v_seq_acertos := 0/i);
});

test('014: não reabre acesso a anon', () => {
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.pontuar_quiz/i);
  const sqlSemComentarios = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(sqlSemComentarios, /GRANT[\s\S]*TO anon/i);
});