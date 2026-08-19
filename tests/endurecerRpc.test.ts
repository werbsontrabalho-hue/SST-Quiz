import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// REGRESSÃO: migração 010 (endurecimento das RPCs)
// Garante que o servidor valide vencedor de desafio e gabarito de quiz
// (anti-fraude AUD-37/38), e que registrar_pontos_ledger saia do alcance
// de authenticated (não é chamada pelo frontend).
// ============================================================

const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '010_endurecer_rpc.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const sqlSemComentarios = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

test('010: registrar_desafio_no_ledger valida que o vencedor é participante', () => {
  assert.match(sql, /VENCEDOR_INVALIDO/i);
  assert.match(sql, /p_vencedor_id NOT IN \(v_desafio\.desafiante_id, v_desafio\.desafiado_id\)/i);
});

test('010: registrar_desafio_no_ledger impede vencedor de outra empresa', () => {
  assert.match(sql, /VENCEDOR_OUTRA_EMPRESA/i);
  assert.match(sql, /empresa_id = v_desafio\.empresa_id/i);
});

test('010: registrar_desafio_no_ledger grava vencedor_id real no desafio', () => {
  assert.match(sql, /vencedor_id = COALESCE\(p_vencedor_id, v_desafio\.vencedor_id\)/i);
});

test('010: pontuar_quiz revalida o gabarito contra quizzes.perguntas', () => {
  assert.match(sql, /SELECT e\.value INTO v_pergunta/i);
  assert.match(sql, /resposta_correta/i);
  assert.match(sql, /v_acertos_reais/i);
  assert.match(sql, /v_pontos_recalculados/i);
});

test('010: pontuar_quiz não confia em p_pontos/p_acertos do chamador', () => {
  assert.match(sql, /pontuacao_total = v_pontos_recalculados/i);
});

test('010: registrar_pontos_ledger sai do alcance de authenticated', () => {
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.registrar_pontos_ledger/i);
});

test('010: pontuar_quiz permanece disponível a authenticated/service_role', () => {
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pontuar_quiz/i);
});

test('010: não reabre acesso a anon em nenhum GRANT', () => {
  assert.doesNotMatch(sqlSemComentarios, /GRANT[\s\S]*TO anon/i);
});