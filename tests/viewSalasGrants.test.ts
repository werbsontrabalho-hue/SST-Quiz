import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// REGRESSÃO: migração 012 (grants da view sanitizada de salas)
// Garante que a view vw_salas_quiz_guiado_publica seja legível por
// authenticated/service_role (o app a usa para o participante NÃO receber
// o gabarito) e que anon continue sem acesso (reforça a 007).
// ============================================================

const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '012_view_salas_grants.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

test('012: concede SELECT da view a authenticated e service_role', () => {
  assert.match(sql, /GRANT SELECT ON public\.vw_salas_quiz_guiado_publica TO authenticated, service_role;/i);
});

test('012: revoga acesso da view a anon', () => {
  assert.match(sql, /REVOKE ALL ON public\.vw_salas_quiz_guiado_publica FROM anon;/i);
});

test('012: não reabre acesso a anon em nenhum grant', () => {
  const sqlSemComentarios = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(sqlSemComentarios, /GRANT[\s\S]*TO anon/i);
});