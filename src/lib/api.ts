// ============================================================================
// api.ts — CONFIGURAÇÃO CENTRALIZADA DA API (Web + Capacitor)
// ----------------------------------------------------------------------------
// Todas as chamadas ao backend Express devem passar por aqui.
//
// Web dev (npm run dev via server.ts):  VITE_API_URL='' → usa '/api/...' (mesma origem)
// Web produção / Capacitor:             VITE_API_URL='https://SEU_BACKEND' → usa URL absoluta
//
// No Capacitor NÃO existe "mesma origem" (o app roda em capacitor://localhost),
// então '/api/...' relativo FALHARIA. Por isso centralizamos: basta definir
// VITE_API_URL no .env / build do mobile.
// ============================================================================

const RAW = ((import.meta as any)?.env?.VITE_API_URL as string | undefined) || '';
export const API_URL: string = RAW.trim().replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_URL}${p}`;
}

export function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  const token = ((import.meta as any)?.env?.VITE_API_TOKEN as string | undefined) || '';
  if (token.trim()) headers['x-api-token'] = token.trim();
  return headers;
}

/** fetch() com base URL centralizada. Uso: apiFetch('/api/health') */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}
