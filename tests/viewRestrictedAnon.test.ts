import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// REGRESSÃO: migration 037 (view sem dados de sessões anteriores +
// RPC registrar_resposta_quiz_guiado aberto a visitante/anon)
// Garante que:
//   1) a view NÃO exponha historico_sessoes/posicoes_anteriores
//      (informação de sessões anteriores de participantes — "unrestricted");
//   2) o RPC conceda EXECUTE a anon (visitante valida a resposta no
//      servidor — corrige "pergunta correta marcada como errada");
//   3) o acesso anon ao RPC seja restrito a salas com permitir_visitantes
//      e status aberto, com participante existente na sala (anti-oráculo).
// ============================================================

const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '037_fix_view_unrestricted_anon.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const sqlSemComentarios = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

test('037: view NÃO expõe historico_sessoes/posicoes_anteriores (informação restricted)', () => {
  // A lista de colunas da view não pode incluir os campos de sessões anteriores.
  assert.doesNotMatch(sqlSemComentarios, /historico_sessoes/i);
  assert.doesNotMatch(sqlSemComentarios, /posicoes_anteriores/i);
  // A view continua sanitizada (perguntas sem gabarito).
  assert.match(sql, /sanitizar_perguntas_publicas\(perguntas\)/i);
  assert.match(sql, /sanitizar_participantes_publicos\(participantes\)/i);
});

test('037: view mantém o filtro por empresa e o fluxo visitante (permitir_visitantes)', () => {
  assert.match(sql, /empresa_id = public\.user_empresa_id\(\)/i);
  assert.match(sql, /permitir_visitantes = true AND status IN/i);
  assert.match(sql, /GRANT SELECT ON public\.vw_salas_quiz_guiado_publica TO anon, authenticated, service_role;/i);
});

test('037: RPC concede EXECUTE a anon (participante visitante valida resposta no servidor)', () => {
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.registrar_resposta_quiz_guiado\(TEXT, TEXT, TEXT, TEXT, INT, INT\) TO anon, authenticated, service_role;/i);
});

test('037: anon só pode registrar resposta em sala com permitir_visitantes e status aberto', () => {
  // Bloco "ELSE" do IF auth.uid(): validações do visitante.
  assert.match(sql, /permitir_visitantes, false/i);
  assert.match(sql, /status NOT IN \('aguardando', 'em_andamento'\)/i);
  assert.match(sql, /ACESSO_NEGADO/, 'sala sem visitantes deve ser negada ao anon');
  assert.match(sql, /SALA_FECHADA/, 'sala fechada deve ser negada ao anon');
});

test('037: anon exige participante existente na sala (anti-oráculo)', () => {
  // No bloco anon, o participante deve existir no array da sala.
  const idxAnon = sql.indexOf("ELSE\n    -- CORREÇÃO");
  const idxPart = sql.indexOf("e->>'id' = p_participante_id");
  assert.ok(idxPart > -1, 'validação de participante na sala deve existir');
  assert.ok(idxAnon > -1 && idxPart > idxAnon, 'a validação de participante deve vir no ramo anon (após o ELSE)');
});

test('037: autenticados mantêm as validações cross-empresa/anti-impersonação', () => {
  assert.match(sql, /OUTRA_EMPRESA/i);
  assert.match(sql, /ACESSO_NEGADO/);
  assert.match(sql, /Anti-impersonação de id/i);
});
