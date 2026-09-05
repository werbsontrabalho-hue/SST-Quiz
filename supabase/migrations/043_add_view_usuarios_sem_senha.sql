-- Migration 043: Cria a view v_usuarios_sem_senha e garante acesso público de leitura
CREATE OR REPLACE VIEW public.v_usuarios_sem_senha AS
SELECT 
  id, 
  empresa_id, 
  setor_id, 
  auth_uid, 
  nome, 
  email, 
  avatar, 
  cargo, 
  perfil, 
  is_instrutor, 
  data_cadastro, 
  data_ultimo_acesso, 
  status, 
  estatisticas, 
  conquistas, 
  configuracoes
FROM public.usuarios;

-- Garante as permissões de leitura para papéis anônimos e autenticados
GRANT SELECT ON public.v_usuarios_sem_senha TO anon, authenticated, service_role;

-- Solicita ao PostgREST recarregar o schema cache
NOTIFY pgrst, 'reload schema';
