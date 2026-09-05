-- Migration 042: Adiciona coluna 'decidido_no_desempate' na tabela public.desafios_1v1 se ainda não existir.
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS decidido_no_desempate BOOLEAN DEFAULT false;

-- Notifica o PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
