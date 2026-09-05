/**
 * Database Service & SQL Schema Definitions
 * Preparado para conexão direta com PostgreSQL / Cloud SQL / Supabase / Express API.
 */

import { Empresa, Setor, Usuario, Pergunta, Campanha, QuizSessao, Desafio1v1, Premiacao } from '../types';

// ==========================================
// 1. DDL SQL TABLE SCHEMAS (PostgreSQL / Cloud SQL)
// ==========================================

export const POSTGRES_DDL_SCHEMA = `
-- Tabela de Empresas
CREATE TABLE IF NOT EXISTS empresas (
  id VARCHAR(50) PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  cnpj VARCHAR(30) UNIQUE NOT NULL,
  plano VARCHAR(20) NOT NULL DEFAULT 'Pro',
  ativa BOOLEAN DEFAULT TRUE,
  data_contratacao DATE DEFAULT CURRENT_DATE,
  limite_colaboradores INT DEFAULT 100,
  configuracoes JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Tabela de Setores
CREATE TABLE IF NOT EXISTS setores (
  id VARCHAR(50) PRIMARY KEY,
  empresa_id VARCHAR(50) REFERENCES empresas(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  colaboradores_ativos INT DEFAULT 0
);

-- Tabela de Usuários
CREATE TABLE IF NOT EXISTS usuarios (
  id VARCHAR(50) PRIMARY KEY,
  empresa_id VARCHAR(50) REFERENCES empresas(id) ON DELETE CASCADE,
  setor_id VARCHAR(50) REFERENCES setores(id) ON DELETE SET NULL,
  nome VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  senha_hash VARCHAR(255),
  avatar TEXT,
  perfil VARCHAR(20) NOT NULL CHECK (perfil IN ('super_admin', 'admin', 'colaborador')),
  cargo VARCHAR(100),
  ativo BOOLEAN DEFAULT TRUE,
  is_instrutor BOOLEAN DEFAULT FALSE,
  estatisticas JSONB DEFAULT '{}'::jsonb,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Banco de Perguntas SST
CREATE TABLE IF NOT EXISTS perguntas (
  id VARCHAR(50) PRIMARY KEY,
  empresa_id VARCHAR(50) REFERENCES empresas(id) ON DELETE CASCADE,
  categoria VARCHAR(50) NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  dificuldade VARCHAR(20) NOT NULL,
  enunciado TEXT NOT NULL,
  alternativas JSONB NOT NULL,
  resposta_correta INT NOT NULL,
  explicacao TEXT,
  tempo_limite_segundos INT DEFAULT 30,
  norma_relacionada VARCHAR(100)
);

-- Tabela de Campanhas de SST
CREATE TABLE IF NOT EXISTS campanhas (
  id VARCHAR(50) PRIMARY KEY,
  empresa_id VARCHAR(50) REFERENCES empresas(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  descricao TEXT,
  frequencia VARCHAR(30) NOT NULL,
  setores_alvo JSONB NOT NULL,
  quantidade_perguntas INT NOT NULL,
  pergunta_ids JSONB DEFAULT '[]'::jsonb,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  horario_disparo VARCHAR(10) DEFAULT '08:00',
  ativa BOOLEAN DEFAULT TRUE
);

-- Tabela de Sessões de Quizzes (Cada colaborador só pode responder 1x por campanha/conjunto)
CREATE TABLE IF NOT EXISTS quiz_sessoes (
  id VARCHAR(50) PRIMARY KEY,
  campanha_id VARCHAR(50) REFERENCES campanhas(id) ON DELETE CASCADE,
  colaborador_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id VARCHAR(50) REFERENCES empresas(id) ON DELETE CASCADE,
  titulo VARCHAR(150) NOT NULL,
  categoria VARCHAR(50),
  perguntas JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'concluido', 'expirado')),
  pontuacao_total INT DEFAULT 0,
  respostas JSONB DEFAULT '[]'::jsonb,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  respondido_em TIMESTAMP WITH TIME ZONE,
  CONSTRAINT unique_colaborador_campanha UNIQUE (colaborador_id, campanha_id)
);

-- Tabela de Desafios 1v1 Entre Setores
CREATE TABLE IF NOT EXISTS desafios_1v1 (
  id VARCHAR(50) PRIMARY KEY,
  empresa_id VARCHAR(50) REFERENCES empresas(id) ON DELETE CASCADE,
  desafiante_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
  desafiante_setor_id VARCHAR(50) REFERENCES setores(id) ON DELETE CASCADE,
  desafiado_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
  desafiado_setor_id VARCHAR(50) REFERENCES setores(id) ON DELETE CASCADE,
  tema_sorteado VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pendente',
  vale_ponto BOOLEAN DEFAULT TRUE,
  tipo VARCHAR(20) DEFAULT 'competitivo',
  aposta_pontos INT DEFAULT 100,
  pontuacao_setor INT DEFAULT 50,
  vencedor_id VARCHAR(50),
  vencedor_setor_id VARCHAR(50),
  motivo_vitoria TEXT,
  placar_final VARCHAR(100),
  decidido_no_desempate BOOLEAN DEFAULT FALSE,
  perguntas JSONB NOT NULL,
  respostas_desafiante JSONB,
  respostas_desafiado JSONB,
  data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Premiações
CREATE TABLE IF NOT EXISTS premiacoes (
  id VARCHAR(50) PRIMARY KEY,
  empresa_id VARCHAR(50) REFERENCES empresas(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  tipo VARCHAR(30) DEFAULT 'brinde',
  mes_referencia VARCHAR(50),
  requisito TEXT,
  custo_pontos INT DEFAULT 300,
  estoque INT DEFAULT 10,
  ativo BOOLEAN DEFAULT TRUE,
  imagem TEXT
);

-- Tabela de Resgates de Prêmios
CREATE TABLE IF NOT EXISTS resgates_premios (
  id VARCHAR(50) PRIMARY KEY,
  empresa_id VARCHAR(50) REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
  usuario_nome VARCHAR(150) NOT NULL,
  usuario_email VARCHAR(150),
  usuario_setor_nome VARCHAR(100),
  premiacao_id VARCHAR(50) REFERENCES premiacoes(id) ON DELETE CASCADE,
  premiacao_titulo VARCHAR(255) NOT NULL,
  premiacao_imagem TEXT,
  custo_pontos INT NOT NULL DEFAULT 300,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'entregue', 'rejeitado')),
  data_resgate TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  data_atualizacao TIMESTAMP WITH TIME ZONE,
  observacoes TEXT
);

-- Tabela de Salas de Quiz Guiado (Tempo Real)
CREATE TABLE IF NOT EXISTS salas_quiz_guiado (
  id VARCHAR(50) PRIMARY KEY,
  pin VARCHAR(10) NOT NULL,
  treinamento_titulo VARCHAR(255) NOT NULL,
  instrutor_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
  instrutor_nome VARCHAR(150) NOT NULL,
  empresa_id VARCHAR(50) REFERENCES empresas(id) ON DELETE CASCADE,
  data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'aguardando',
  modalidade VARCHAR(20) DEFAULT 'interativo',
  estilo VARCHAR(20) DEFAULT 'educacional',
  nota_minima NUMERIC DEFAULT 7.0,
  tempo_por_pergunta_seg INT DEFAULT 30,
  perguntas JSONB NOT NULL DEFAULT '[]'::jsonb,
  pergunta_atual_index INT DEFAULT 0,
  mostrar_ranking BOOLEAN DEFAULT TRUE,
  permitir_visitantes BOOLEAN DEFAULT TRUE,
  participantes JSONB DEFAULT '[]'::jsonb,
  revelar_resposta_atual BOOLEAN DEFAULT FALSE
);

-- Tabela de Resultados de Avaliação SST
CREATE TABLE IF NOT EXISTS resultados_avaliacao_sst (
  id VARCHAR(50) PRIMARY KEY,
  sala_id VARCHAR(50) REFERENCES salas_quiz_guiado(id) ON DELETE SET NULL,
  empresa_id VARCHAR(50),
  instrutor_id VARCHAR(50),
  participante_nome VARCHAR(150) NOT NULL,
  participante_id VARCHAR(50),
  cpf_ou_empresa VARCHAR(50),
  is_visitante BOOLEAN DEFAULT FALSE,
  treinamento_titulo VARCHAR(255) NOT NULL,
  instrutor_nome VARCHAR(150) NOT NULL,
  data VARCHAR(50) NOT NULL,
  total_perguntas INT NOT NULL,
  acertos INT NOT NULL,
  erros INT NOT NULL,
  nota_final NUMERIC NOT NULL,
  nota_minima NUMERIC NOT NULL,
  situacao VARCHAR(20) NOT NULL,
  desempenho_por_tema JSONB DEFAULT '[]'::jsonb,
  respostas_detalhadas JSONB DEFAULT '[]'::jsonb
);
`;

// ==========================================
// 2. ASYNC DATABASE API SERVICE ABSTRACTION
// ==========================================

export const DatabaseService = {
  // Sync Status
  async checkConnection(): Promise<{ connected: boolean; latencyMs: number }> {
    return new Promise(resolve => setTimeout(() => resolve({ connected: true, latencyMs: 24 }), 100));
  },

  // Save to Database Layer (LocalStorage fallback with async API pattern)
  async saveToStorage<T>(key: string, data: T): Promise<boolean> {
    try {
      localStorage.setItem(`sst_db_${key}`, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error(`Error saving ${key} to Database Service`, e);
      return false;
    }
  },

  async loadFromStorage<T>(key: string, fallback: T): Promise<T> {
    try {
      const item = localStorage.getItem(`sst_db_${key}`);
      return item ? JSON.parse(item) : fallback;
    } catch (e) {
      return fallback;
    }
  },
};
