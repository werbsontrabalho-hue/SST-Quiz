import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

// ============================================================
// supabaseAuth — AUTENTICAÇÃO OFICIAL DO SUPABASE (JWT / Bcrypt)
// ============================================================
// Camada de autenticação que usa supabase.auth (Auth oficial com hash
// Bcrypt e tokens JWT) SEMPRE que o Supabase estiver configurado.
// Quando NÃO configurado (modo offline), as funções retornam
// success:false sem lançar erro, para o app cair no fallback local.
//
// Ligações com o app:
//  - auth_uid: coluna em public.usuarios que guarda o auth.users.id,
//    permitindo políticas RLS por empresa (migration_politicas_rls_fase2.sql).
//  - v_usuarios_sem_senha: view pública sem a coluna "senha".

export interface AuthResult {
  success: boolean;
  message: string;
  authUserId?: string;
  email?: string;
}

// --- CADASTRO (signUp) ---
// Cria a conta no Supabase Auth (hash Bcrypt no auth.users).
// O perfil público continua em public.usuarios (criado pelo app).
export async function signUpWithEmail(
  email: string,
  password: string,
  metadata?: Record<string, unknown>
): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase não configurado.' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, message: 'Cliente Supabase indisponível.' };
  }
  try {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: metadata || {} },
    });
    if (error) {
      return { success: false, message: error.message };
    }
    return {
      success: true,
      message: 'Conta criada com sucesso no Supabase Auth!',
      authUserId: data.user?.id,
      email: data.user?.email,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Erro ao criar conta.' };
  }
}

// --- LOGIN (signInWithPassword) ---
// Autentica no Supabase Auth e retorna o auth.users.id (auth_uid).
export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase não configurado.' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, message: 'Cliente Supabase indisponível.' };
  }
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, message: error.message };
    }
    return {
      success: true,
      message: 'Autenticado com sucesso via Supabase Auth!',
      authUserId: data.user?.id,
      email: data.user?.email,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Erro ao autenticar.' };
  }
}

// --- LOGOUT (signOut) ---
export async function signOutSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch (err) {
    console.warn('Erro ao deslogar no Supabase Auth:', err);
  }
}

// --- SESSÃO ATUAL ---
// Retorna o auth.users.id do usuário logado (ou null).
export async function getSupabaseAuthUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch (err) {
    return null;
  }
}

// --- RECUPERAÇÃO DE SENHA (e-mail oficial do Supabase) ---
// Envia o e-mail de redefinição de senha do Supabase Auth.
export async function resetPasswordViaEmail(email: string): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase não configurado.' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, message: 'Cliente Supabase indisponível.' };
  }
  try {
    const { error } = await client.auth.resetPasswordForEmail(email);
    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, message: 'E-mail de recuperação de senha enviado!' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Erro ao solicitar recuperação.' };
  }
}

// --- FINALIZAR RECUPERAÇÃO VIA LINK OFICIAL DO SUPABASE ---
// Quando o usuário clica no link do e-mail de recuperação, o app abre com um
// token de recuperação na URL (token_hash + type=recovery). Esta função
// troca esse token por uma sessão válida e aplica a nova senha no auth.users
// (hash Bcrypt). É o fluxo SEGURO de redefinição de senha.
export async function finalizarRecuperacaoViaToken(novaSenha: string): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase não configurado.' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, message: 'Cliente Supabase indisponível.' };
  }
  try {
    // 1. Lê o token de recuperação da URL (?token_hash=...&type=recovery).
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    if (tokenHash && type === 'recovery') {
      const { data: otpData, error: otpErr } = await client.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      });
      if (otpErr) {
        return { success: false, message: otpErr.message };
      }
      // Token de recuperação válido: cria a sessão de redefinição.
      if (!otpData?.session) {
        return { success: false, message: 'Token de recuperação inválido ou expirado.' };
      }
      // 2. Aplica a nova senha na conta autenticada (auth.users).
      const { error: updateErr } = await client.auth.updateUser({ password: novaSenha });
      if (updateErr) {
        return { success: false, message: updateErr.message };
      }
      // 3. Limpa o token da URL para não ficar exposto no histórico.
      window.history.replaceState({}, document.title, window.location.pathname);
      return { success: true, message: 'Senha redefinida com sucesso via link oficial!' };
    }
    // Sem token de recuperação na URL: verifica se já há sessão de recuperação.
    const { data: sessionData } = await client.auth.getSession();
    if (sessionData?.session) {
      const { error: updateErr } = await client.auth.updateUser({ password: novaSenha });
      if (updateErr) {
        return { success: false, message: updateErr.message };
      }
      return { success: true, message: 'Senha redefinida com sucesso!' };
    }
    return { success: false, message: 'Nenhum link de recuperação válido encontrado.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Erro ao redefinir senha.' };
  }
}

// Detecta se a URL atual carrega um token de recuperação do Supabase Auth.
// Usada pela tela de login para exibir o formulário de nova senha quando o
// usuário chega pelo link do e-mail de recuperação.
export function temTokenRecuperacaoNaUrl(): boolean {
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get('token_hash') && params.get('type') === 'recovery');
}

// --- VINCULAR auth_uid A UM USUÁRIO EXISTENTE ---
// Após login via Auth, liga o auth.users.id ao registro de public.usuarios
// (via e-mail) para que as políticas RLS funcionem. Não falha se já vinculado.
// SEGURANÇA: usa o RPC server-side "vincular_auth_uid" (migração 007), que
// valida o e-mail no banco e contorna o gatilho anti-autopromoção — o UPDATE
// direto do próprio auth_uid é bloqueado pelo trigger e não é mais permitido.
export async function vincularAuthUidAoUsuario(
  authUserId: string,
  email: string
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    let { data, error } = await client
      .from('v_usuarios_sem_senha')
      .select('id, auth_uid')
      .ilike('email', email)
      .maybeSingle();

    if (error || !data) {
      const { data: directData } = await client
        .from('usuarios')
        .select('id, auth_uid')
        .ilike('email', email)
        .maybeSingle();
      data = directData;
    }

    if (!data) return false;
    if (data.auth_uid === authUserId) return true;
    const { data: rpcData, error: rpcError } = await client.rpc('vincular_auth_uid', {
      p_usuario_id: data.id,
    });
    if (rpcError) {
      console.warn('Não foi possível vincular auth_uid via RPC:', rpcError.message);
      return false;
    }
    return Boolean(rpcData && (rpcData as any).success === true);
  } catch (err) {
    console.warn('Erro ao vincular auth_uid:', err);
    return false;
  }
}
