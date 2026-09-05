// =====================================================================
// tests/supabaseConfig.test.ts - Testes da detecção de chaves Supabase
// Garante que chaves "anon" legítimas (JWT) não sejam rejeitadas e que
// chaves service_role/secreta sejam bloqueadas (sem falsos-positivos).
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSecretKey } from '../src/lib/supabase';

// Gera um JWT fake com o "role" informado (para simular chaves do Supabase).
function gerarChaveJWT(role: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=+$/, '');
  const payload = btoa(JSON.stringify({ iss: 'supabase', ref: 'xyz', role })).replace(/=+$/, '');
  return `${header}.${payload}.assinatura_fake`;
}

test('isSecretKey bloqueia chave service_role (JWT)', () => {
  assert.equal(isSecretKey(gerarChaveJWT('service_role')), true);
});

test('isSecretKey bloqueia chave com papel secret', () => {
  assert.equal(isSecretKey(gerarChaveJWT('secret')), true);
});

test('isSecretKey aceita chave anon (JWT) legítima', () => {
  // Mesmo que o payload contenha a palavra "secret" no contexto, o papel anon
  // deve ser aceito (correção do falso-positivo do includes('secret')).
  const anonComSecretNoPayload =
    `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.` +
    btoa(JSON.stringify({ iss: 'supabase', ref: 'secret-key-projeto', role: 'anon' })).replace(/=+$/, '') +
    `.assinatura`;
  assert.equal(isSecretKey(anonComSecretNoPayload), false);
  assert.equal(isSecretKey(gerarChaveJWT('anon')), false);
});

test('isSecretKey bloqueia chave no formato sbp_ (nova geração)', () => {
  assert.equal(isSecretKey('sbp_0123456789abcdef...'), true);
});

test('isSecretKey trata entradas vazias/inválidas sem lançar erro', () => {
  assert.equal(isSecretKey(''), false);
  assert.equal(isSecretKey('não é uma chave'), false);
  assert.equal(isSecretKey(undefined as unknown as string), false);
});
