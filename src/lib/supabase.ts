import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// CONFIGURAÇÃO DO CLIENTE SUPABASE
// ============================================================

// Busca as credenciais de conexão (URL e chave "anon") gravadas no
// localStorage OU nas variáveis de ambiente (VITE_SUPABASE_*).
// Retorna { url, key } com os valores trimados; retorna strings vazias
// quando nada foi configurado.
const DEFAULT_SUPABASE_URL = 'https://vsnilfdvmfhotvrwtiln.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_w2gt3uraWmugDmZNH6zmdQ_553Vf7bb';

export const getSupabaseConfig = () => {
  let localUrl = '';
  let localKey = '';

  try {
    // Tenta ler a URL e a chave salvas pelo usuário nas configurações do app
    localUrl = localStorage.getItem('sst_supabase_url') || '';
    localKey = localStorage.getItem('sst_supabase_anon_key') || '';

    // Remove automaticamente a chave salva se ela for uma chave proibida
    // (service_role/secreta) — tais chaves não podem rodar no navegador
    if (localKey && isSecretKey(localKey)) {
      localStorage.removeItem('sst_supabase_anon_key');
      localKey = '';
    }
  } catch (e) {
    console.warn('Não foi possível acessar o localStorage:', e);
  }

  const metaEnv = (import.meta as any).env || {};
  // Fallback: lê as variáveis de ambiente (Vite ou Node/process) caso nada esteja no localStorage
  const envUrl = metaEnv.VITE_SUPABASE_URL || (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL : '');
  const envKey = metaEnv.VITE_SUPABASE_ANON_KEY || (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY : '');

  // Preferência de uso: localStorage -> variáveis de ambiente -> credenciais padrão de produção
  const url = (localUrl && localUrl.trim()) ? localUrl.trim() : (envUrl && envUrl.trim() ? envUrl.trim() : DEFAULT_SUPABASE_URL);
  const key = (localKey && localKey.trim()) ? localKey.trim() : (envKey && envKey.trim() ? envKey.trim() : DEFAULT_SUPABASE_ANON_KEY);

  return { url, key };
};

// Salva (ou remove) a URL e a chave "anon" do Supabase no localStorage.
// Usada pela tela de Configurações para persistir a conexão do usuário.
export const setSupabaseConfig = (url: string, key: string) => {
  try {
    // Salva a URL somente se informada; caso contrário, apaga o registro
    if (url) localStorage.setItem('sst_supabase_url', url.trim());
    else localStorage.removeItem('sst_supabase_url');

    // Mesmo comportamento para a chave anônima
    if (key) localStorage.setItem('sst_supabase_anon_key', key.trim());
    else localStorage.removeItem('sst_supabase_anon_key');
  } catch (e) {
    console.warn('Não foi possível salvar a configuração no localStorage:', e);
  }
};

// Instância única do cliente (singleton) para não recriar a conexão a cada uso
let clientInstance: SupabaseClient | null = null;
let currentClientUrl = '';
let currentClientKey = '';

// Retorna o cliente Supabase pronto para uso (com base na config salva ou em
// valores informados manualmente). Cria a instância apenas se a URL/chave
// mudaram; caso contrário, reaproveita a instância já criada (cache).
// Retorna null quando a conexão não está configurada ou falhou ao inicializar.
export const getSupabaseClient = (urlOverride?: string, keyOverride?: string): SupabaseClient | null => {
  // Se recebeu URL e chave por parâmetro, usa-os; senão, lê da configuração
  const config = urlOverride !== undefined && keyOverride !== undefined
    ? { url: urlOverride, key: keyOverride }
    : getSupabaseConfig();
  const { url, key } = config;
  // Sem URL ou chave não é possível conectar
  if (!url || !key) {
    return null;
  }

  // Reaproveita a instância existente quando as credenciais não mudaram
  if (clientInstance && currentClientUrl === url && currentClientKey === key) {
    return clientInstance;
  }

  try {
    // Cria o cliente @supabase/supabase-js com a URL e a chave anônima
    clientInstance = createClient(url, key);
    currentClientUrl = url;
    currentClientKey = key;
    return clientInstance;
  } catch (err) {
    console.error('Erro ao inicializar cliente Supabase:', err);
    return null;
  }
};

// Verifica se o Supabase foi configurado (URL e chave presentes e URL http válida).
// Retorna true/false — usado para saber se o app deve tentar conectar na nuvem.
export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key && url.startsWith('http'));
};

// Detecta se uma chave é SECRETA (service_role/secret) em vez da pública "anon".
// O Supabase proíbe usar a chave secreta no navegador por segurança, por isso
// essa função protege o app de aceitar esse tipo de credencial.
export const isSecretKey = (key: string): boolean => {
  if (!key) return false;
  // Chaves de projeto (novo formato) começam com "sbp_" e são proibidas no navegador
  if (key.startsWith('sbp_')) return true;
  try {
    // Chaves JWT têm 3 partes separadas por ponto (header.payload.signature)
    const parts = key.split('.');
    if (parts.length === 3) {
      // Decodifica o payload do JWT para inspecionar o campo "role"
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      const payload = JSON.parse(jsonPayload);
      // Se o papel do token for service_role/secret, é uma chave proibida
      if (payload.role === 'service_role' || payload.role === 'secret') {
        return true;
      }
    }
  } catch (e) {
    // Ignora erros de decodificação (chave provavelmente não é JWT)
  }
  return false;
};

// Testa a conexão com o Supabase: faz um SELECT simples na tabela "empresas"
// para validar URL, chave e tabelas. Retorna { success, message } com o
// resultado amigável. Usada no formulário de configuração do Supabase.
export const testSupabaseConnection = async (urlOverride?: string, keyOverride?: string): Promise<{ success: boolean; message: string }> => {
  const config = urlOverride !== undefined && keyOverride !== undefined
    ? { url: urlOverride, key: keyOverride }
    : getSupabaseConfig();
  const { url, key } = config;

  // Bloqueia o teste antes de chamar o Supabase se a chave for secreta
  if (key && isSecretKey(key)) {
    return {
      success: false,
      message: '⚠️ Chave Secreta (service_role) detectada! O Supabase proíbe o uso da chave secreta no navegador por segurança. Vá em Settings > API no Supabase e copie a chave pública "anon (public)".'
    };
  }

  const client = getSupabaseClient(url, key);
  if (!client || !url || !key) {
    return { success: false, message: 'URL ou Chave Anônima do Supabase não configuradas.' };
  }

  try {
    // SELECT mínimo na tabela "empresas" para validar a conexão e o script SQL
    const { error } = await client.from('empresas').select('id').limit(1);
    if (error) {
      // Após a migração 007 (modo legado desativado), a role "anon" não tem
      // mais acesso às tabelas. "permission denied" = banco alcançável e RLS
      // ativa (estado correto de produção) — não é falha de conexão.
      if (error.code === '42501' || (error.message && error.message.includes('permission denied'))) {
        return { success: true, message: 'Conexão com Supabase estabelecida! (RLS ativa: acesso anônimo bloqueado)' };
      }
      // Mensagens típicas quando se usa a chave secreta (service_role) no navegador
      if (error.message && (error.message.includes('Forbidden use of secret API key') || error.message.includes('chave secreta') || error.message.includes('service_role') || error.message.includes('ambiente protegido'))) {
        return {
          success: false,
          message: '⚠️ Uso proibido de chave secreta (service_role) no navegador! Altere para a chave "anon" (pública) nas configurações de API do Supabase.'
        };
      }
      // Código 42P01 = tabela inexistente no Postgres (script SQL ainda não foi executado)
      if (error.code === '42P01') {
        return { 
          success: false, 
          message: 'Conectado ao Supabase, mas a tabela "empresas" não existe! Execute o script SQL no Supabase.' 
        };
      }
      return { success: false, message: `Erro ao conectar: ${error.message}` };
    }
    return { success: true, message: 'Conexão com Supabase estabelecida com sucesso!' };
  } catch (err: any) {
    // Captura erros lançados (ex.: rede) que também indiquem uso de chave secreta
    if (err.message && (err.message.includes('Forbidden use of secret API key') || err.message.includes('chave secreta') || err.message.includes('service_role'))) {
      return {
        success: false,
        message: '⚠️ Uso proibido de chave secreta (service_role) no navegador! Utilize a chave "anon" (pública).'
      };
    }
    return { success: false, message: `Falha na conexão: ${err.message || 'Erro desconhecido'}` };
  }
};
