// =====================================================================
// tests/server.test.ts - Testes unitários do servidor (Node.js)
// Valida o comportamento da função getPreferredPort, que define a porta
// utilizada pelo servidor Express em desenvolvimento e produção.
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPreferredPort } from '../server';

// Teste 1: usa o valor da variável de ambiente PORT quando ela é válida
test('getPreferredPort uses environment value when valid', () => {
  process.env.PORT = '4100';
  assert.equal(getPreferredPort(), 4100);
});

// Teste 2: retorna a porta padrão (3000) quando a variável de ambiente é inválida/ausente
test('getPreferredPort falls back to 3000 when env is invalid', () => {
  delete process.env.PORT;
  assert.equal(getPreferredPort(), 3000);
});

// Teste 3: rejeita portas fora do intervalo válido de portas TCP (1..65535)
test('getPreferredPort falls back to 3000 when env port is out of range', () => {
  process.env.PORT = '99999';
  assert.equal(getPreferredPort(), 3000);
  process.env.PORT = '0';
  assert.equal(getPreferredPort(), 3000);
  process.env.PORT = '-5';
  assert.equal(getPreferredPort(), 3000);
  delete process.env.PORT;
});

// Teste 4: aceita portas dentro do intervalo válido (incluindo 65535)
test('getPreferredPort accepts valid ports up to 65535', () => {
  process.env.PORT = '65535';
  assert.equal(getPreferredPort(), 65535);
  delete process.env.PORT;
});
