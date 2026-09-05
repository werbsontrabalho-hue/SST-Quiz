// ============================================================================
// capacitor.ts — HELPERS MULTIPLATAFORMA (Web + Android + iOS)
// ----------------------------------------------------------------------------
// Centraliza a detecção de plataforma nativa e o compartilhamento de arquivos
// (PDF/JSON) de forma compatível com Web e Capacitor.
//
// - Web: mantém o comportamento atual (link.download / window.open)
// - Android/iOS: usa Share + Filesystem do Capacitor quando disponível
//   (import dinâmico → Web continua funcionando SEM os plugins instalados)
// ============================================================================

export function isNativePlatform(): boolean {
  try {
    const w = window as any;
    // Capacitor injeta window.Capacitor.isNativePlatform() no WebView nativo
    if (w?.Capacitor?.isNativePlatform) return w.Capacitor.isNativePlatform() === true;
    const url = window.location?.protocol || '';
    if (url === 'capacitor:') return true;
    return false;
  } catch {
    return false;
  }
}

export function platformName(): 'web' | 'android' | 'ios' {
  try {
    const w = window as any;
    const p = w?.Capacitor?.getPlatform?.();
    if (p === 'android' || p === 'ios') return p;
  } catch { /* segue web */ }
  return 'web';
}

/** Converte Blob → base64 (sem prefixo data:) para gravar via Filesystem nativo. */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as any);
  }
  return btoa(binary);
}

/**
 * Salva + compartilha um arquivo no dispositivo.
 * - Web: faz download via <a download> (comportamento atual preservado).
 * - Nativo: grava em cache via Filesystem e abre o Share sheet (salvar/abrir/compartilhar).
 * Retorna true quando o arquivo foi entregue ao usuário.
 */
export async function saveOrShareFile(blob: Blob, filename: string, mimeType = 'application/octet-stream'): Promise<boolean> {
  if (!isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }
  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const base64 = await blobToBase64(blob);
    const safe = filename.replace(/[^\w.\-()[\] ]+/g, '_').slice(0, 120) || 'arquivo';
    const res = await Filesystem.writeFile({ path: safe, data: base64, directory: Directory.Cache });
    await Share.share({
      title: safe,
      text: `Arquivo ${safe} gerado pelo SST Quiz`,
      url: res.uri,
      dialogTitle: 'Salvar / Compartilhar',
    });
    return true;
  } catch (err) {
    console.warn('[capacitor] Share nativo indisponível, tentando download web:', err);
    try {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      return true;
    } catch {
      return false;
    }
  }
}

/** Solicita foco/scroll seguro para campos cobertos pelo teclado (auxiliar web + nativo). */
export function scrollIntoViewOnFocus(el: HTMLElement | null) {
  if (!el) return;
  try {
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  } catch { /* noop */ }
}
