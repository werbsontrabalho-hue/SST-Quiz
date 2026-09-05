-- ============================================================
-- 009_alinear_schema.sql — ALINHA O BANCO AO MODELO DO FRONTEND
-- ------------------------------------------------------------
-- A auditoria forense constatou que o frontend envia colunas que NÃO
-- existem no banco ("poison fields"), fazendo os upsert falharem com
-- erro 42703 (coluna inexistente). Este script ADICIONA as colunas
-- faltantes de forma NÃO-DESTRUTIVA (ADD COLUMN IF NOT EXISTS), sem
-- alterar dados existentes, para que a persistência volte a funcionar.
-- As colunas espelham exatamente o modelo usado pelo app (src/types.ts
-- e src/context/SSTContext.tsx).
-- ============================================================

-- 1. USUARIOS: linha do tempo de temporadas + última data de atividade
--    (usado no streak diário por data).
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS trofeus_temporadas JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ultimo_quiz_data TEXT;

-- 2. EMPRESAS: histórico de temporadas (Linha do Tempo).
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS historico_temporadas JSONB DEFAULT '[]'::jsonb;

-- 3. SETORES: pontuação acumulada do setor (usada em desafios/ranking).
ALTER TABLE public.setores
  ADD COLUMN IF NOT EXISTS pontos_totais BIGINT DEFAULT 0;

-- 4. CAMPANHAS: pontos por acerto configurável.
ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS pontos_por_acerto INT;

-- 5. BACKUPS: escopo (global | empresa) usado no SuperAdmin.
ALTER TABLE public.backups_historico
  ADD COLUMN IF NOT EXISTS escopo TEXT DEFAULT 'global';

-- 6. SALAS DE QUIZ GUIADO: aliases de nota mínima e tempo por pergunta
--    (base-100 / segundos) que o frontend usa como fallback de leitura.
ALTER TABLE public.salas_quiz_guiado
  ADD COLUMN IF NOT EXISTS nota_minima_aprovacao NUMERIC,
  ADD COLUMN IF NOT EXISTS tempo_por_pergunta INT;

-- 7. RESULTADOS DE AVALIAÇÃO SST: campos de relatório/laudo que o app
--    monta no resultado (matrícula, CPF, cargo, setor, e-mail, aliases
--    de nota e percentuais). Sem eles o upsert do resultado falhava.
ALTER TABLE public.resultados_avaliacao_sst
  ADD COLUMN IF NOT EXISTS matricula TEXT,
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS cargo TEXT,
  ADD COLUMN IF NOT EXISTS setor_nome TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS sala_nome TEXT,
  ADD COLUMN IF NOT EXISTS data_finalizacao TEXT,
  ADD COLUMN IF NOT EXISTS porcentagem_acertos NUMERIC,
  ADD COLUMN IF NOT EXISTS questoes_corretas INT,
  ADD COLUMN IF NOT EXISTS total_questoes INT,
  ADD COLUMN IF NOT EXISTS nota_minima_aprovacao NUMERIC;