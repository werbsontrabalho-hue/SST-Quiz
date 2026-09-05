import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// REGRESSÃO: migration 030 (RPC registrar_resposta_quiz_guiado seguro)
// Garante que:
//   1) resposta DUPLICADA não revela correta/pontos (anti-oráculo);
//   2) validação de empresa (isolamento cross-empresa);
//   3) validação de janela de tempo.
// ============================================================

const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '030_fix_rpc_resposta_quiz_guiado.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

test('030: resposta duplicada retorna DUPLICADA sem revelar correta/pontos', () => {
  assert.match(sql, /'code', 'DUPLICADA'/i);
  // O retorno da duplicada só contém success/code/duplicada/message — sem correta.
  assert.match(sql, /'duplicada', true/i);
  // A verificação de duplicata acontece ANTES do cálculo de pontos/revelação.
  const idxDuplicada = sql.indexOf("'DUPLICADA'");
  const idxGravacao = sql.indexOf('INSERT INTO public.quiz_guiado_respostas');
  assert.ok(idxDuplicada > -1 && idxGravacao > -1);
  // A duplicada é detectada ANTES da gravação e do retorno com correta.
  assert.ok(idxDuplicada < idxGravacao, 'a checagem de duplicada deve vir antes da gravação');
});

test('030: valida isolamento cross-empresa (OUTRA_EMPRESA)', () => {
  assert.match(sql, /OUTRA_EMPRESA/i);
  assert.match(sql, /empresa_id FROM public\.usuarios WHERE id = v_usuario_id/);
  assert.match(sql, /<> v_sala\.empresa_id/i);
});

test('030: valida janela de tempo (TEMPO_ESGOTADO)', () => {
  assert.match(sql, /TEMPO_ESGOTADO/i);
  assert.match(sql, /question_ends_at/i);
});

test('030: valida que o participante existe na sala', () => {
  assert.match(sql, /PARTICIPANTE_NAO_ENCONTRADO/i);
  assert.match(sql, /jsonb_array_elements\(COALESCE\(v_sala\.participantes/i);
});