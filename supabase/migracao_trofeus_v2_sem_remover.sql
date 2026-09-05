-- ============================================================
-- MIGRAÇÃO v2 (ALTERNATIVA SEGURA): CONVERTE "medalhas" → "trofeus_conquistados"
-- SEM REMOVER O CAMPO ANTIGO
-- ------------------------------------------------------------
-- Diferença para a migracao_trofeus_v2.sql:
--   • Converte as medalhas antigas em trofeus_conquistados (com data),
--     porém NÃO executa o passo "estatisticas - 'medalhas'".
--   • Mantém o campo "medalhas" intacto (modo compatibilidade), para
--     você testar antes de removê-lo definitivamente.
--   • Idempotente: pode rodar mais de uma vez sem duplicar troféus
--     (só converte se o campo medalhas existir e não houver conversão já feita).
-- ============================================================

-- 1. Adiciona os contadores de sequência/defesas quando ausentes.
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

-- 2. Converte medalhas antigas (nomes) em trofeus_conquistados com data,
--    SOMENTE para usuários que ainda não tiveram essa conversão feita.
--    (Condição: campo "medalhas" existe E "trofeus_conquistados" está vazio.)
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
  AND jsonb_array_length(estatisticas->'medalhas') > 0
  AND (
    NOT (estatisticas ? 'trofeus_conquistados')
    OR jsonb_array_length(COALESCE(estatisticas->'trofeus_conquistados', '[]'::jsonb)) = 0
  );

-- 3. OBSERVAÇÃO: O campo "medalhas" NÃO foi removido.
--    Depois de validar, rode o comando abaixo para removê-lo definitivamente
--    (ou use a migracao_trofeus_v2.sql que já inclui este passo):
--
--    UPDATE public.usuarios
--    SET estatisticas = estatisticas - 'medalhas'
--    WHERE estatisticas ? 'medalhas';

-- 4. Confirmação.
SELECT
  (SELECT count(*) FROM public.usuarios) AS total_usuarios,
  (SELECT count(*) FROM public.usuarios WHERE estatisticas ? 'trofeus_conquistados' AND jsonb_array_length(COALESCE(estatisticas->'trofeus_conquistados', '[]'::jsonb)) > 0) AS usuarios_com_trofeus,
  (SELECT count(*) FROM public.usuarios WHERE estatisticas ? 'medalhas') AS usuarios_ainda_com_medalhas;

-- ============================================================
-- FIM DA MIGRAÇÃO ALTERNATIVA
-- ============================================================
