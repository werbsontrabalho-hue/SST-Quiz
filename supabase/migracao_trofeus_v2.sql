-- ============================================================
-- MIGRAÇÃO v2: SISTEMA DE TROFÉUS DESACOPLADO DAS TEMPORADAS
-- SST QUIZ SAAS - Executar UMA VEZ no SQL Editor do Supabase
-- ------------------------------------------------------------
-- O que esta migração faz:
--   1. Adiciona os NOVOS campos de regra de troféu ao JSONB
--      "configuracoes.regrasTrofeus" das empresas (ativo,
--      modoContagem, mostrarProgresso, limiteProximidade,
--      gatilhoDefesa) SEM apagar configurações existentes.
--   2. Adiciona os contadores de sequência/defesas ao JSONB
--      "estatisticas" dos usuários, quando ausentes.
--   3. CONVERTE o antigo array "medalhas" (nomes soltos) em
--      "trofeus_conquistados" (objetos com data), evitando os
--      troféus "fantasma" sem correspondência nas regras novas.
--   4. Remove o campo antigo "medalhas" (decisão do cliente:
--      fase de criação, não precisa de compatibilidade).
--
-- SEGURO: usa concatenação JSONB (||) e WHERE de existência.
-- Pode ser executado mais de uma vez sem conflito.
-- ============================================================

-- 1. Atualiza as regras de troféus das empresas com os novos campos padrão.
UPDATE public.empresas
SET configuracoes = COALESCE(configuracoes, '{}'::jsonb) ||
  jsonb_set(
    COALESCE(configuracoes, '{}'::jsonb),
    '{regrasTrofeus}',
    COALESCE(configuracoes->'regrasTrofeus', '{}'::jsonb)
  )
WHERE true;

-- 1.1. (Recomendado) Simplificação: como as regras ficam salvas no
-- localStorage do app e são sincronizadas via upsert, o app já aplica
-- os defaults ao abrir. Este UPDATE garante que EMPRESAS que nunca
-- tiveram regrasTrofeus recebam o bloco padrão.
UPDATE public.empresas
SET configuracoes = COALESCE(configuracoes, '{}'::jsonb) || '{
  "regrasTrofeus": {
    "vitoriasTotais": [
      {"meta": 10, "trofeuId": "t-bronze", "imagem": "medalha_bronze", "nome": "Bronze", "ativo": true, "modoContagem": "acumulado", "mostrarProgresso": true, "limiteProximidade": 3},
      {"meta": 30, "trofeuId": "t-prata", "imagem": "medalha_prata", "nome": "Prata", "ativo": true, "modoContagem": "acumulado", "mostrarProgresso": true, "limiteProximidade": 5},
      {"meta": 50, "trofeuId": "t-ouro", "imagem": "medalha_ouro", "nome": "Ouro", "ativo": true, "modoContagem": "acumulado", "mostrarProgresso": true, "limiteProximidade": 5}
    ],
    "winStreak": [
      {"meta": 3, "trofeuId": "s-bronze", "imagem": "streak_3", "nome": "Em Forma", "ativo": true, "modoContagem": "sequencial", "mostrarProgresso": true, "limiteProximidade": 2},
      {"meta": 7, "trofeuId": "s-prata", "imagem": "streak_7", "nome": "Consistente", "ativo": true, "modoContagem": "sequencial", "mostrarProgresso": true, "limiteProximidade": 2},
      {"meta": 15, "trofeuId": "s-ouro", "imagem": "streak_15", "nome": "Imbatível", "ativo": true, "modoContagem": "sequencial", "mostrarProgresso": true, "limiteProximidade": 3}
    ],
    "acertosTotais": [
      {"meta": 100, "trofeuId": "a-bronze", "imagem": "acertos_100", "nome": "Estudioso", "ativo": true, "modoContagem": "acumulado", "mostrarProgresso": true, "limiteProximidade": 20}
    ],
    "defesasImbativel": [
      {"meta": 5, "trofeuId": "d-bronze", "imagem": "defesa_1", "nome": "Defesa Sólida", "ativo": true, "modoContagem": "acumulado", "mostrarProgresso": true, "limiteProximidade": 2, "gatilhoDefesa": "desafiado"}
    ],
    "recuperacoesEpicas": [
      {"meta": 1, "trofeuId": "r-bronze", "imagem": "recuperacao_1", "nome": "Recuperação Épica", "ativo": true, "modoContagem": "acumulado", "mostrarProgresso": true, "limiteProximidade": 1, "gatilhoDefesa": "ambos"}
    ],
    "veteranoSST": [
      {"meta": 10, "trofeuId": "v-bronze", "imagem": "veterano_10", "nome": "Veterano SST", "ativo": true, "modoContagem": "acumulado", "mostrarProgresso": true, "limiteProximidade": 2}
    ]
  }
}'::jsonb
WHERE configuracoes IS NULL
   OR NOT (configuracoes ? 'regrasTrofeus');

-- 2. Adiciona os contadores de sequência/defesas e converte "medalhas"
--    em "trofeus_conquistados" para todos os usuários.
--    (estatisticas é JSONB, então não precisamos de ALTER TABLE.)
UPDATE public.usuarios
SET estatisticas = COALESCE(estatisticas, '{}'::jsonb) ||
  jsonb_build_object(
    'defesas_vencidas', COALESCE((estatisticas->>'defesas_vencidas')::int, 0),
    'sequencia_vitorias', COALESCE((estatisticas->>'sequencia_vitorias')::int, 0),
    'maior_sequencia_vitorias', COALESCE((estatisticas->>'maior_sequencia_vitorias')::int, 0),
    'sequencia_defesas', COALESCE((estatisticas->>'sequencia_defesas')::int, 0),
    'maior_sequencia_defesas', COALESCE((estatisticas->>'maior_sequencia_defesas')::int, 0),
    'sequencia_acertos', COALESCE((estatisticas->>'sequencia_acertos')::int, 0),
    'maior_sequencia_acertos', COALESCE((estatisticas->>'maior_sequencia_acertos')::int, 0),
    'trofeus_conquistados', COALESCE(estatisticas->'trofeus_conquistados', '[]'::jsonb)
  )
WHERE true;

-- 2.1. Converte medalhas antigas (nomes) em trofeus_conquistados com data atual.
--      Executa apenas onde existe o campo "medalhas" com conteúdo.
UPDATE public.usuarios
SET estatisticas = jsonb_set(
  estatisticas,
  '{trofeus_conquistados}',
  (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'nome', med_item,
            'categoria', 'vitoriasTotais',
            'conquistado_em', to_char(COALESCE((estatisticas->>'created_at')::timestamptz, now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          )
        )
        FROM jsonb_array_elements_text(estatisticas->'medalhas') AS med_item
      ),
      '[]'::jsonb
    )
  )
)
WHERE estatisticas ? 'medalhas'
  AND jsonb_typeof(estatisticas->'medalhas') = 'array'
  AND jsonb_array_length(estatisticas->'medalhas') > 0;

-- 2.2. Remove o campo antigo "medalhas" (decisão: fase de criação).
UPDATE public.usuarios
SET estatisticas = estatisticas - 'medalhas'
WHERE estatisticas ? 'medalhas';

-- 3. Confirmação: quantas empresas e usuários foram atualizados.
SELECT
  (SELECT count(*) FROM public.empresas) AS total_empresas,
  (SELECT count(*) FROM public.empresas WHERE configuracoes ? 'regrasTrofeus') AS empresas_com_regras,
  (SELECT count(*) FROM public.usuarios) AS total_usuarios,
  (SELECT count(*) FROM public.usuarios WHERE estatisticas ? 'trofeus_conquistados') AS usuarios_com_trofeus;

-- ============================================================
-- FIM DA MIGRAÇÃO v2
-- ============================================================
