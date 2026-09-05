-- ============================================================
-- MIGRAÇÃO: ADICIONAR REGRAS DE TROFÉUS (regrasTrofeus)
-- SST QUIZ SAAS - Executar UMA VEZ no SQL Editor do Supabase
-- ------------------------------------------------------------
-- Este script é SEGURO para bancos já existentes: ele adiciona
-- o bloco "regrasTrofeus" dentro do campo "configuracoes" da
-- tabela "empresas" SEM apagar as configurações que já existem
-- (usando o operador de concatenação de JSONB "||").
--
-- IMPORTANTE: Pode ser executado mais de uma vez sem causar
-- conflito. Se o campo já existir, nada será duplicado.
-- ============================================================

-- 1. Adiciona as regras padrão de troféus para TODAS as empresas.
--    O operador "||" mescla o novo bloco com o que já existia.
UPDATE public.empresas
SET configuracoes = COALESCE(configuracoes, '{}'::jsonb) || '{
  "regrasTrofeus": {
    "vitoriasTotais": [
      {"meta": 10, "trofeuId": "t-bronze", "imagem": "medalha_bronze", "nome": "Bronze"},
      {"meta": 30, "trofeuId": "t-prata", "imagem": "medalha_prata", "nome": "Prata"},
      {"meta": 50, "trofeuId": "t-ouro", "imagem": "medalha_ouro", "nome": "Ouro"}
    ],
    "winStreak": [
      {"meta": 3, "trofeuId": "s-bronze", "imagem": "streak_3", "nome": "Em Forma"},
      {"meta": 7, "trofeuId": "s-prata", "imagem": "streak_7", "nome": "Consistente"},
      {"meta": 15, "trofeuId": "s-ouro", "imagem": "streak_15", "nome": "Imbatível"}
    ],
    "acertosTotais": [
      {"meta": 100, "trofeuId": "a-bronze", "imagem": "acertos_100", "nome": "Estudioso"},
      {"meta": 500, "trofeuId": "a-prata", "imagem": "acertos_500", "nome": "Mestre do Conhecimento"}
    ],
    "defesasImbativel": [
      {"meta": 1, "trofeuId": "d-bronze", "imagem": "defesa_1", "nome": "Defesa Sólida"}
    ],
    "recuperacoesEpicas": [
      {"meta": 1, "trofeuId": "r-bronze", "imagem": "recuperacao_1", "nome": "Recuperação Épica"}
    ],
    "veteranoSST": [
      {"meta": 10, "trofeuId": "v-bronze", "imagem": "veterano_10", "nome": "Veterano SST"},
      {"meta": 50, "trofeuId": "v-ouro", "imagem": "veterano_50", "nome": "Lenda SST"}
    ]
  }
}'::jsonb
WHERE configuracoes IS NULL
   OR NOT (configuracoes ? 'regrasTrofeus');

-- 2. Confirmação: exibe quantas empresas foram atualizadas.
SELECT id, nome, configuracoes->'regrasTrofeus' AS regras_trofeus
FROM public.empresas
ORDER BY nome;

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
