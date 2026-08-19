-- ============================================================
-- ROLLBACK: DESFAZ A MIGRAÇÃO v2 (SISTEMA DE TROFÉUS)
-- ------------------------------------------------------------
-- Este script reverte os efeitos da migracao_trofeus_v2.sql:
--   1. Reconstrói o campo antigo "medalhas" a partir de
--      "trofeus_conquistados" (apenas os nomes), para voltar ao
--      formato antigo exibido nas telas.
--   2. Remove os campos novos de contador e troféus.
--   3. NÃO altera as configurações de regras (empresas), pois elas
--      não quebram o app antigo (JSONB flexível).
--
-- ATENÇÃO: use APENAS se quiser voltar ao sistema anterior.
-- Execute uma única vez.
-- ============================================================

-- 1. Reconstrói "medalhas" (array de nomes) a partir de trofeus_conquistados,
--    apenas para usuários que não têm mais o campo "medalhas".
UPDATE public.usuarios
SET estatisticas = estatisticas || jsonb_build_object(
  'medalhas',
  COALESCE(
    (
      SELECT jsonb_agg(item->>'nome')
      FROM jsonb_array_elements(COALESCE(estatisticas->'trofeus_conquistados', '[]'::jsonb)) AS item
    ),
    '[]'::jsonb
  )
)
WHERE NOT (estatisticas ? 'medalhas');

-- 2. Remove os campos novos de troféus e contadores.
UPDATE public.usuarios
SET estatisticas = estatisticas
  - 'trofeus_conquistados'
  - 'defesas_vencidas'
  - 'sequencia_vitorias'
  - 'maior_sequencia_vitorias'
  - 'sequencia_defesas'
  - 'maior_sequencia_defesas'
  - 'sequencia_acertos'
  - 'maior_sequencia_acertos'
  - 'ultimo_quiz_data'
WHERE true;

-- 3. Confirmação: quantos usuários voltaram a ter medalhas.
SELECT
  (SELECT count(*) FROM public.usuarios) AS total_usuarios,
  (SELECT count(*) FROM public.usuarios WHERE estatisticas ? 'medalhas') AS usuarios_com_medalhas,
  (SELECT count(*) FROM public.usuarios WHERE estatisticas ? 'trofeus_conquistados') AS usuarios_ainda_com_trofeus;

-- ============================================================
-- FIM DO ROLLBACK
-- ============================================================
