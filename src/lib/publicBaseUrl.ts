let cachedBaseUrl: string | null = null;

export async function getPublicBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl;

  // 1. Se o navegador estiver acessando através de um domínio público ou rede externa (não localhost),
  // a própria origem do navegador (window.location.origin) é a URL pública real e acessível!
  if (typeof window !== 'undefined' && window.location.origin) {
    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '') {
      cachedBaseUrl = window.location.origin.replace(/\/+$/, '');
      return cachedBaseUrl;
    }
  }

  // 2. Se estiver em localhost/127.0.0.1, consulta o backend para tentar obter o IP de rede local (Wi-Fi)
  try {
    const res = await fetch('/api/public-base-url');
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.baseUrl === 'string' && data.baseUrl) {
        cachedBaseUrl = data.baseUrl.replace(/\/+$/, '');
        return cachedBaseUrl;
      }
    }
  } catch (err) {
    console.warn('Não foi possível obter a URL pública do servidor:', err);
  }

  // 3. Fallback: usa a origem atual
  cachedBaseUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin.replace(/\/+$/, '') : '';
  return cachedBaseUrl;
}

