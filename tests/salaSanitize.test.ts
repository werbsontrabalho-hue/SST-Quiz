// =====================================================================
// tests/salaSanitize.test.ts - Testes unitários do sanitizador de gabarito
// do Quiz Guiado. Cobre: ocultação de resposta_correta/explicacao de
// perguntas não reveladas, manutenção das reveladas, e regra de quem
// gerencia a sala (instrutor/admin mantém o payload completo).
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  podeGerenciarSala,
  sanitizeSalaParaParticipante,
  sanitizeSalaParaDispositivo,
} from '../src/utils/salaSanitize';
import type { SalaQuizGuiado } from '../src/types';

function criarSala(overrides: Partial<SalaQuizGuiado> = {}): SalaQuizGuiado {
  return {
    id: 'sala-1',
    pin: '123456',
    treinamento_titulo: 'NR-35',
    instrutor_id: 'usr-instrutor',
    instrutor_nome: 'Instrutor',
    empresa_id: 'emp-1',
    data_criacao: new Date().toISOString(),
    status: 'em_andamento',
    modalidade: 'interativo',
    nota_minima: 7,
    tempo_por_pergunta_seg: 30,
    pergunta_atual_index: 0,
    mostrar_ranking: true,
    permitir_visitantes: false,
    perguntas: [
      { id: 'q1', empresa_id: 'emp-1', categoria: 'sst', tipo: 'multipla_escolha', dificuldade: 'media', enunciado: 'P1', alternativas: ['A', 'B', 'C'], resposta_correta: 1, explicacao: 'gabarito q1', tempo_limite_segundos: 30 },
      { id: 'q2', empresa_id: 'emp-1', categoria: 'sst', tipo: 'multipla_escolha', dificuldade: 'media', enunciado: 'P2', alternativas: ['A', 'B', 'C'], resposta_correta: 0, explicacao: 'gabarito q2', tempo_limite_segundos: 30 },
      { id: 'q3', empresa_id: 'emp-1', categoria: 'sst', tipo: 'multipla_escolha', dificuldade: 'media', enunciado: 'P3', alternativas: ['A', 'B', 'C'], resposta_correta: 2, explicacao: 'gabarito q3', tempo_limite_segundos: 30 },
    ],
    participantes: [],
    ...overrides,
  } as SalaQuizGuiado;
}

test('sanitizeSalaParaParticipante oculta gabarito de perguntas nao reveladas', () => {
  const sala = criarSala({ pergunta_atual_index: 0, revelar_resposta_atual: false });
  const limpa = sanitizeSalaParaParticipante(sala);

  assert.equal(limpa.perguntas[0].resposta_correta, undefined);
  assert.equal(limpa.perguntas[0].explicacao, undefined);
  assert.equal(limpa.perguntas[1].resposta_correta, undefined);
  assert.equal(limpa.perguntas[2].resposta_correta, undefined);
  // O enunciado e as alternativas continuam visíveis (participante precisa responder).
  assert.equal(limpa.perguntas[0].enunciado, 'P1');
  assert.deepEqual(limpa.perguntas[0].alternativas, ['A', 'B', 'C']);
});

test('sanitizeSalaParaParticipante mantem gabarito da pergunta atual quando revelada', () => {
  const sala = criarSala({ pergunta_atual_index: 0, revelar_resposta_atual: true });
  const limpa = sanitizeSalaParaParticipante(sala);

  assert.equal(limpa.perguntas[0].resposta_correta, 1); // revelada agora
  assert.equal(limpa.perguntas[1].resposta_correta, undefined); // futura
});

test('sanitizeSalaParaParticipante mantem gabarito de perguntas ja passadas', () => {
  const sala = criarSala({ pergunta_atual_index: 2, revelar_resposta_atual: true });
  const limpa = sanitizeSalaParaParticipante(sala);

  assert.equal(limpa.perguntas[0].resposta_correta, 1); // passada
  assert.equal(limpa.perguntas[1].resposta_correta, 0); // passada
  assert.equal(limpa.perguntas[2].resposta_correta, 2); // atual revelada
});

test('podeGerenciarSala: instrutor da sala mantem payload completo', () => {
  const sala = criarSala();
  assert.equal(podeGerenciarSala({ id: 'usr-instrutor', perfil: 'colaborador', is_instrutor: true, empresa_id: 'emp-1' }, sala), true);
});

test('podeGerenciarSala: colaborador comum e visitante nao gerenciam', () => {
  const sala = criarSala();
  assert.equal(podeGerenciarSala({ id: 'usr-colab', perfil: 'colaborador', empresa_id: 'emp-1' }, sala), false);
  assert.equal(podeGerenciarSala(null, sala), false);
  assert.equal(podeGerenciarSala(undefined, sala), false);
});

test('sanitizeSalaParaDispositivo: admin de OUTRA empresa recebe sala sanitizada', () => {
  const sala = criarSala();
  const result = sanitizeSalaParaDispositivo({ id: 'usr-admin2', perfil: 'admin', empresa_id: 'emp-2' }, sala);
  assert.equal(result.perguntas[0].resposta_correta, undefined);
});

test('sanitizeSalaParaDispositivo: instrutor recebe payload completo', () => {
  const sala = criarSala();
  const result = sanitizeSalaParaDispositivo({ id: 'usr-instrutor', perfil: 'colaborador', is_instrutor: true, empresa_id: 'emp-1' }, sala);
  assert.equal(result.perguntas[0].resposta_correta, 1);
});