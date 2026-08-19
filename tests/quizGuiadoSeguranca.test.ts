import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// REGRESSÃO: migration 029 (regra de Instrutor + RLS restrita)
// Garante que:
//   1) is_instrutor_ou_admin() exija is_instrutor = true (Admin/Super sem
//      a marcação NÃO conduzem Quiz Guiado);
//   2) Salas Update Escopo não libere UPDATE a qualquer usuário da empresa;
//   3) Resultados Insert Escopo não seja mais WITH CHECK (true).
// ============================================================

const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '029_quiz_guiado_seguranca.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
// Remove linhas de comentário para que as asserções testem apenas SQL real.
const sqlSemComentarios = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

test('029: is_instrutor_ou_admin exige is_instrutor = true (sem OR perfil admin/super)', () => {
  // Nova definição: SELECT (is_instrutor = true) sem perfil admin/super.
  assert.match(sql, /SELECT \(is_instrutor = true\)/i);
  // A função NÃO pode mais conter a permissão automática por perfil.
  assert.doesNotMatch(sqlSemComentarios, /perfil IN \(\s*'admin',\s*'super_admin'\s*\)/i);
});

test('029: Salas Update Escopo remove o OR empresa_id = user_empresa_id()', () => {
  // Na policy reescrita da 029, o UPDATE restringe a instrutor/admin/participante.
  const trechoSalas = sql.split('DROP POLICY IF EXISTS "Salas Update Escopo"')[1] || sql;
  assert.match(trechoSalas, /instrutor_id = public\.usuario_id_atual\(\)/i);
  assert.match(trechoSalas, /public\.usuario_atual_perfil\(\) = 'admin' AND empresa_id = public\.user_empresa_id\(\)/i);
  assert.doesNotMatch(trechoSalas, /OR empresa_id = public\.user_empresa_id\(\)/i);
});

test('029: Resultados Insert Escopo não usa WITH CHECK (true)', () => {
  const trechoResult = sql.split('DROP POLICY IF EXISTS "Resultados Insert Escopo"')[1] || sql;
  assert.doesNotMatch(trechoResult, /WITH CHECK \(true\)/i);
  assert.match(trechoResult, /participante_id = public\.usuario_id_atual\(\)/i);
});