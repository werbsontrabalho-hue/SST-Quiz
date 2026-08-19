import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// REGRESSÃO: migration 031 (view de salas SECURITY DEFINER sanitizada)
// Garante que:
//   1) a view vw_salas_quiz_guiado_publica seja SECURITY DEFINER (participante
//      lê a sala por PIN mesmo sem ser participante ainda);
//   2) mantenha a SANITIZAÇÃO (sem resposta_correta/explicacao);
//   3) filtre por empresa (isolamento entre empresas);
//   4) anon continue sem acesso.
// ============================================================

const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '031_view_salas_definer.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const sqlSemComentarios = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

test('031: view criada como SECURITY DEFINER (sem security_invoker)', () => {
  assert.match(sql, /CREATE VIEW public\.vw_salas_quiz_guiado_publica AS/i);
  assert.doesNotMatch(sqlSemComentarios, /security_invoker/i);
});

test('031: view continua usando as funções de sanitização', () => {
  assert.match(sql, /sanitizar_perguntas_publicas\(perguntas\)/i);
  assert.match(sql, /sanitizar_participantes_publicos\(participantes\)/i);
});

test('031: view filtra por empresa (isolamento entre empresas)', () => {
  assert.match(sql, /empresa_id = public\.user_empresa_id\(\)/i);
  assert.match(sql, /public\.is_super_admin\(\)/i);
});

test('031: grants dão SELECT a anon/authenticated na view sanitizada (base permanece protegida)', () => {
  assert.match(sql, /GRANT SELECT ON public\.vw_salas_quiz_guiado_publica TO anon, authenticated, service_role;/i);
  // Não concede acesso à BASE via grants anon.
  assert.doesNotMatch(sqlSemComentarios, /GRANT ALL ON TABLE public\.salas_quiz_guiado TO anon/i);
});