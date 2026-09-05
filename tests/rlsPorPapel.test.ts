import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// REGRESSÃO: migração 011 (RLS por papel — Fase B, V-008)
// Garante que a escrita de perguntas/campanhas/premiações fique restrita a
// admin/instrutor, quizzes ao próprio colaborador, desafios a participantes,
// e resgates/usuários com escopo correto — sem reabrir acesso a anon.
// ============================================================

const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '011_rls_por_papel.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const sqlSemComentarios = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

test('011: perguntas têm escrita restrita a instrutor/admin/super', () => {
  assert.match(sql, /"Perguntas Escrita Papel"/i);
  assert.match(sql, /is_instrutor_ou_admin\(\) AND empresa_id = public\.user_empresa_id\(\)/i);
});

test('011: campanhas têm escrita restrita a admin/super', () => {
  assert.match(sql, /"Campanhas Escrita Papel"/i);
  assert.match(sql, /usuario_atual_perfil\(\) IN \('admin', 'super_admin'\)/i);
});

test('011: quizzes têm escrita do próprio colaborador ou admin', () => {
  assert.match(sql, /"Quizzes Escrita Proprio"/i);
  assert.match(sql, /colaborador_id = public\.usuario_id_atual\(\)/i);
});

test('011: desafios têm escrita restrita a participantes ou admin', () => {
  assert.match(sql, /"Desafios Escrita Participante"/i);
  assert.match(sql, /desafiante_id = public\.usuario_id_atual\(\)/i);
  assert.match(sql, /desafiado_id = public\.usuario_id_atual\(\)/i);
});

test('011: premiações têm escrita restrita a admin/super', () => {
  assert.match(sql, /"Premiacoes Escrita Papel"/i);
});

test('011: resgates têm INSERT do próprio usuário e UPDATE só de admin', () => {
  assert.match(sql, /"Resgates Insert Proprio"/i);
  assert.match(sql, /usuario_id = public\.usuario_id_atual\(\)/i);
  assert.match(sql, /"Resgates Update Admin"/i);
});

test('011: usuários têm UPDATE restrito à própria linha ou admin da empresa', () => {
  assert.match(sql, /"Usuarios Update Proprio"/i);
  assert.match(sql, /auth_uid = auth\.uid\(\)/i);
});

test('011: modo legado anônimo permanece como fallback (desativado pela 007)', () => {
  assert.match(sql, /modo_legado_anonimo\(\)/i);
});

test('011: nenhum GRANT a anon e nenhuma policy FOR ALL (true) aberta', () => {
  assert.doesNotMatch(sqlSemComentarios, /GRANT[\s\S]*TO anon/i);
  assert.doesNotMatch(sqlSemComentarios, /FOR ALL USING \(true\)/i);
  assert.doesNotMatch(sqlSemComentarios, /WITH CHECK \(true\)/i);
});