// ============================================================================
// idb.ts — WRAPPER INDEXEDDB HÍBRIDO (Fase 7: offline durável)
// ----------------------------------------------------------------------------
// Armazena os mesmos dados que vão ao localStorage, mas sem o limite de ~5MB
// e com escrita assíncrona. O localStorage continua como CACHE síncrono (os
// useState iniciam lendo dele); o IndexedDB é a cópia DURÁVEL de maior volume.
// Toda falha é silenciosa: se IndexedDB não estiver disponível (modo privado/
// bloqueado), o app segue 100% no localStorage.
// ============================================================================

const DB_NAME = 'sst_offline';
const STORE_NAME = 'kv';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB indisponível'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      // Falha ao abrir (modo privado/bloqueado): limpa a promise para que a
      // próxima chamada tente novamente em vez de falhar permanentemente.
      dbPromise = null;
      reject(request.error);
    };
    request.onblocked = () => {
      // O banco está bloqueado por outra conexão (raro: upgrade concorrente
      // em outra aba). Limpa a promise para a próxima chamada tentar de novo,
      // e REJEITA a promise atual para não deixá-la pendente para sempre.
      dbPromise = null;
      reject(new Error('IndexedDB bloqueado por outra conexão (upgrade em andamento em outra aba)'));
    };
  });
  return dbPromise;
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then(db =>
    db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
  );
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const store = await tx('readwrite');
    await new Promise<void>((resolve, reject) => {
      const req = store.put(JSON.stringify(value), key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[idb] Falha ao gravar ${key}:`, err);
  }
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const store = await tx('readonly');
    const raw = await new Promise<string | undefined>((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as string | undefined);
      req.onerror = () => reject(req.error);
    });
    if (raw === undefined || raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  } catch (err) {
    console.warn(`[idb] Falha ao ler ${key}:`, err);
    return null;
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    const store = await tx('readwrite');
    await new Promise<void>((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[idb] Falha ao remover ${key}:`, err);
  }
}