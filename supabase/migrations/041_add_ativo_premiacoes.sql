-- Migration 041: Adiciona coluna 'ativo' e colunas auxiliares na tabela public.premiacoes se ainda não existirem.
ALTER TABLE public.premiacoes ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;
ALTER TABLE public.premiacoes ADD COLUMN IF NOT EXISTS custo_pontos INT DEFAULT 300;
ALTER TABLE public.premiacoes ADD COLUMN IF NOT EXISTS estoque INT DEFAULT 10;
ALTER TABLE public.premiacoes ADD COLUMN IF NOT EXISTS imagem TEXT;

-- Notifica o PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
