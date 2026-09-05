-- Migration 044: Atualiza a view v_usuarios_sem_senha para incluir todas as colunas de controle do usuário
-- Inclui: ativo, matricula, cpf, cpf_ou_empresa, is_visitante

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
  ativo,
  matricula,
  cpf,
  cpf_ou_empresa,
  is_visitante,
  data_cadastro, 
  data_ultimo_acesso, 
  status, 
  estatisticas, 
  conquistas, 
  configuracoes
FROM public.usuarios;

GRANT SELECT ON public.v_usuarios_sem_senha TO anon, authenticated, service_role;
