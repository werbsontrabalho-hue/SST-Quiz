-- ============================================================
-- webhook_push_notificacoes.sql
-- ------------------------------------------------------------
-- Liga o "fio": toda linha NOVA na tabela "notificacoes" chama o
-- entregador (Edge Function enviar-push), que manda o aviso para o
-- celular — mesmo com o app fechado.
--
-- COMO USAR (1 vez só):
-- 1) Publique a função enviar-push (código na pasta
--    supabase/functions/enviar-push) e cadastre os 3 Secrets nela.
-- 2) Rode ESTE script no Supabase > SQL Editor > Run.
-- 3) Pronto: desafiou, criou campanha ou concluiu quiz → push chega.
-- ============================================================

-- Fio telefônico do banco (extensão de rede):
-- O pg_net mora no esquema "net" (ele não aceita mudar de esquema).
CREATE EXTENSION IF NOT EXISTS pg_net;

-- O recado: pega a notificação nova e liga para o entregador.
CREATE OR REPLACE FUNCTION public.avisar_push_notificacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  SELECT net.http_post(
    url := 'https://qmodxeztodqvmtiuyrib.supabase.co/functions/v1/enviar-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_YFjC82QAmtQp3VsMvNVLig_nq-f9-0L'
    ),
    body := jsonb_build_object('record', row_to_json(NEW)),
    timeout_milliseconds := 5000
  ) INTO v_id;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Se o entregador falhar, a notificação continua salva no app.
    RETURN NEW;
END;
$$;

-- Pendura o recado na tabela de notificações (só nas novas):
DROP TRIGGER IF EXISTS trg_avisar_push_notificacao ON public.notificacoes;
CREATE TRIGGER trg_avisar_push_notificacao
  AFTER INSERT ON public.notificacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.avisar_push_notificacao();
