// =====================================================================
// tests/csvHelpers.test.ts - Testes unitários dos utilitários de CSV
// Cobre: sanitização contra injeção de fórmula (CSV injection), round-trip
// de exportação/importação e detecção global de delimitador.
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escaparCelulaCSV,
  detectarDelimitador,
  exportPerguntasToCSV,
  parsePerguntasCSV,
  exportUsuariosToCSV,
  parseUsuariosCSV,
  exportSetoresToCSV,
  parseSetoresCSV,
} from '../src/utils/csvHelpers';
import type { Pergunta, Usuario, Setor } from '../src/types';

// ---------------------------------------------------------------------
// 1. Escapamento contra injeção de fórmula
// ---------------------------------------------------------------------
test('escaparCelulaCSV neutraliza prefixos perigosos', () => {
  assert.equal(escaparCelulaCSV('=1+1'), "'=1+1");
  assert.equal(escaparCelulaCSV('+1+1'), "'+1+1");
  assert.equal(escaparCelulaCSV('-1'), "'-1");
  assert.equal(escaparCelulaCSV('@SUM(1,1)'), "'@SUM(1,1)");
});

test('escaparCelulaCSV nao altera valores seguros', () => {
  assert.equal(escaparCelulaCSV('Operações & Produção'), 'Operações & Produção');
  assert.equal(escaparCelulaCSV('NR-35'), 'NR-35');
  assert.equal(escaparCelulaCSV(''), '');
});

test('exportPerguntasToCSV sanitiza campo com prefixo perigoso', () => {
  const perguntas: Pergunta[] = [{
    id: 'p-1',
    empresa_id: 'emp-1',
    categoria: '=HIPERLINK("http://malicioso","x")',
    tipo: 'multipla_escolha',
    dificuldade: 'Médio',
    enunciado: 'Pergunta normal',
    alternativas: ['A', 'B', 'C', 'D'],
    resposta_correta: 0,
    explicacao: 'Explicação',
    tempo_limite_segundos: 30,
    norma_relacionada: 'NR-06',
  }];
  const csv = exportPerguntasToCSV(perguntas);
  assert.ok(csv.includes("'=HIPERLINK"), 'categoria perigosa deve ser escapada com aspas simples');
});

test('exportUsuariosToCSV sanitiza celulas de texto', () => {
  const usuarios: Usuario[] = [{
    id: 'u-1',
    empresa_id: 'emp-1',
    setor_id: 'set-1',
    nome: '=cmd|/c calc!',
    email: 'joao@empresa.com',
    senha: '123456',
    avatar: '',
    perfil: 'colaborador',
    cargo: 'Operador',
    estatisticas: {} as any,
  }];
  const csv = exportUsuariosToCSV(usuarios, []);
  assert.ok(csv.includes("'=cmd"), 'nome perigoso deve ser escapado');
});

test('exportSetoresToCSV sanitiza nomes de setores', () => {
  const setores: Setor[] = [
    { id: 'set-1', empresa_id: 'emp-1', nome: '=1+1', colaboradores_ativos: 3 },
  ];
  const csv = exportSetoresToCSV(setores);
  assert.ok(csv.includes("'=1+1"), 'nome de setor perigoso deve ser escapado');
});

// ---------------------------------------------------------------------
// 2. Detecção de delimitador
// ---------------------------------------------------------------------
test('detectarDelimitador prioriza ";" quando presente fora de aspas', () => {
  assert.equal(detectarDelimitador('a;b;c'), ';');
  assert.equal(detectarDelimitador('a,b,c'), ',');
  assert.equal(detectarDelimitador('"a;b";c'), ';');
  assert.equal(detectarDelimitador(''), ',');
});

// ---------------------------------------------------------------------
// 3. Round-trip: exportação -> importação preserva os dados
// ---------------------------------------------------------------------
test('round-trip de perguntas export/import preserva dados', () => {
  const perguntas: Pergunta[] = [
    {
      id: 'p-1',
      empresa_id: 'emp-1',
      categoria: 'SST',
      tipo: 'multipla_escolha',
      dificuldade: 'Difícil',
      enunciado: 'Qual a altura mínima da NR-35?',
      alternativas: ['1,5 m', '2,0 m', '2,5 m', '3,0 m'],
      resposta_correta: 1,
      explicacao: 'Acima de 2 metros.',
      tempo_limite_segundos: 45,
      norma_relacionada: 'NR-35',
    },
    {
      id: 'p-2',
      empresa_id: 'emp-1',
      categoria: 'Normas',
      tipo: 'verdadeiro_falso',
      dificuldade: 'Fácil',
      enunciado: 'O EPI é fornecido gratuitamente.',
      alternativas: ['Verdadeiro', 'Falso'],
      resposta_correta: 0,
      explicacao: 'Conforme NR-06.',
      tempo_limite_segundos: 30,
      norma_relacionada: 'NR-06',
    },
  ];
  const csv = exportPerguntasToCSV(perguntas);
  const parsed = parsePerguntasCSV(csv);
  assert.equal(parsed.errors.length, 0, `erros inesperados: ${parsed.errors.join('; ')}`);
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].enunciado, perguntas[0].enunciado);
  assert.equal(parsed.items[0].resposta_correta, 1);
  assert.equal(parsed.items[0].tempo_limite_segundos, 45);
  assert.equal(parsed.items[1].tipo, 'verdadeiro_falso');
  assert.deepEqual(parsed.items[1].alternativas, ['Verdadeiro', 'Falso']);
});

test('round-trip de usuários export/import preserva dados (sem senha)', () => {
  const setores: Setor[] = [
    { id: 'set-1', empresa_id: 'emp-1', nome: 'Operações & Produção', colaboradores_ativos: 5 },
  ];
  const usuarios: Usuario[] = [
    {
      id: 'u-1',
      empresa_id: 'emp-1',
      setor_id: 'set-1',
      nome: 'João Silva',
      email: 'joao.silva@tecnosafety.com',
      senha: 'segredo123',
      avatar: '',
      perfil: 'colaborador',
      cargo: 'Técnico de Operações',
      is_instrutor: true,
      estatisticas: {} as any,
    },
  ];
  const csv = exportUsuariosToCSV(usuarios, setores);
  // A senha NÃO deve ser exportada por segurança.
  assert.ok(!csv.includes('segredo123'), 'a senha nunca deve ser exportada');
  assert.ok(csv.includes('joao.silva@tecnosafety.com'));

  const parsed = parseUsuariosCSV(csv);
  assert.equal(parsed.errors.length, 0, `erros inesperados: ${parsed.errors.join('; ')}`);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].nome, 'João Silva');
  assert.equal(parsed.items[0].email, 'joao.silva@tecnosafety.com');
  assert.equal(parsed.items[0].cargo, 'Técnico de Operações');
  assert.equal(parsed.items[0].setor_nome, 'Operações & Produção');
  assert.equal(parsed.items[0].perfil, 'colaborador');
  assert.equal(parsed.items[0].is_instrutor, true);
});

test('round-trip de setores export/import preserva nomes', () => {
  const setores: Setor[] = [
    { id: 'set-1', empresa_id: 'emp-1', nome: 'Manutenção Industrial', colaboradores_ativos: 4 },
    { id: 'set-2', empresa_id: 'emp-1', nome: 'Logística & Frota', colaboradores_ativos: 6 },
  ];
  const csv = exportSetoresToCSV(setores);
  const parsed = parseSetoresCSV(csv);
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.items, ['Manutenção Industrial', 'Logística & Frota']);
});

// ---------------------------------------------------------------------
// 4. Parse com aspas e separador misto
// ---------------------------------------------------------------------
test('parseUsuariosCSV ignora ";" dentro de campos entre aspas', () => {
  const csv = 'nome;email;senha;cargo;setor_nome;perfil;is_instrutor\n' +
    'Ana;ana@empresa.com;123;Analista;Operações & Produção;admin;sim';
  const parsed = parseUsuariosCSV(csv);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].cargo, 'Analista');
});

test('parseUsuariosCSV detecta vírgula como separador quando sem ponto-e-vírgula', () => {
  const csv = 'nome,email,senha,cargo,setor_nome,perfil,is_instrutor\n' +
    'Ana,ana@empresa.com,123,Analista,Operacoes,admin,sim';
  const parsed = parseUsuariosCSV(csv);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].email, 'ana@empresa.com');
});
