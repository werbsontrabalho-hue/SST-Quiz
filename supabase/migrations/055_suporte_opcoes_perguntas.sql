-- ============================================================
-- 055_suporte_opcoes_perguntas.sql
-- ------------------------------------------------------------
-- COMPATIBILIDADE DA TABELA PERGUNTAS:
--
-- Garante que se algum cliente antigo ou script enviar 'opcoes',
-- o banco possua a coluna ou permita a operação sem quebrar o schema cache.
-- Na tabela oficial, as alternativas residem em 'alternativas' (JSONB).
-- ============================================================

-- Adiciona a coluna opcional 'opcoes' caso não exista
ALTER TABLE public.perguntas ADD COLUMN IF NOT EXISTS opcoes JSONB;

-- Preenche retroativamente com o valor de alternativas onde opcoes for nulo
UPDATE public.perguntas SET opcoes = alternativas WHERE opcoes IS NULL AND alternativas IS NOT NULL;

-- Trigger para manter sincronizadas se algum cliente gravar diretamente
CREATE OR REPLACE FUNCTION public.sincronizar_opcoes_alternativas()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.alternativas IS NULL AND NEW.opcoes IS NOT NULL THEN
    NEW.alternativas := NEW.opcoes;
  ELSIF NEW.opcoes IS NULL AND NEW.alternativas IS NOT NULL THEN
    NEW.opcoes := NEW.alternativas;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sincronizar_opcoes_alternativas ON public.perguntas;
CREATE TRIGGER trg_sincronizar_opcoes_alternativas
BEFORE INSERT OR UPDATE ON public.perguntas
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_opcoes_alternativas();
