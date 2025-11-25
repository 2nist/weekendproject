export interface SandboxMetadataSnapshot {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  file_path?: string | null;
  file_extension?: string | null;
  format?: string | null;
}

export interface SandboxSnapshot {
  id?: string | number | null;
  fileHash?: string | null;
  file_hash?: string | null;
  file_path?: string | null;
  metadata?: SandboxMetadataSnapshot;
  timestamp: number;
}

export const SANDBOX_STORAGE_KEY = 'progression:lastSandboxContext';

const hasWindow = typeof window !== 'undefined';

const getDetailFromEvent = (event: Event): SandboxSnapshot | null => {
  if (!('detail' in event)) return null;
  const customEvent = event as CustomEvent<SandboxSnapshot | null>;
  return customEvent.detail || null;
};

export const buildSandboxSnapshot = (data: any): SandboxSnapshot | null => {
  if (!data) return null;
  const fileHash = data.fileHash || data.file_hash || null;
  const metadata = data.metadata || data.linear_analysis?.metadata || null;

  return {
    id: data.id || null,
    fileHash,
    file_hash: fileHash,
    file_path: data.file_path || metadata?.file_path || null,
    metadata: metadata
      ? {
          title: metadata.title || metadata.file_name || null,
          artist: metadata.artist || null,
          album: metadata.album || null,
          file_path: metadata.file_path || null,
          file_extension: metadata.file_extension || metadata.fileExtension || null,
          format: metadata.format || null,
        }
      : undefined,
    timestamp: Date.now(),
  };
};

export const persistSandboxContext = (data: any | null): void => {
  if (!hasWindow || !window.localStorage) return;
  try {
    if (!data) {
      window.localStorage.removeItem(SANDBOX_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('SANDBOX_CONTEXT_UPDATED', { detail: null }));
      return;
    }
    const snapshot = buildSandboxSnapshot(data);
    if (!snapshot || !(snapshot.fileHash || snapshot.file_hash)) {
      return;
    }
    window.localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(snapshot));
    window.dispatchEvent(new CustomEvent('SANDBOX_CONTEXT_UPDATED', { detail: snapshot }));
  } catch (err) {
    console.warn('[sandboxState] Failed to persist sandbox context:', err);
  }
};

export const readPersistedSandboxContext = (): SandboxSnapshot | null => {
  if (!hasWindow || !window.localStorage) return null;
  try {
    const stored = window.localStorage.getItem(SANDBOX_STORAGE_KEY);
    if (!stored) return null;
    const snapshot = JSON.parse(stored) as SandboxSnapshot;
    if (!snapshot || !(snapshot.fileHash || snapshot.file_hash)) {
      return null;
    }
    return snapshot;
  } catch (err) {
    console.warn('[sandboxState] Failed to read sandbox context:', err);
    return null;
  }
};

export const subscribeToSandboxContext = (
  listener: (snapshot: SandboxSnapshot | null) => void,
): (() => void) => {
  if (!hasWindow) {
    return () => {};
  }
  const handler = (event: Event) => {
    listener(getDetailFromEvent(event));
  };
  window.addEventListener('SANDBOX_CONTEXT_UPDATED', handler as EventListener);
  return () => window.removeEventListener('SANDBOX_CONTEXT_UPDATED', handler as EventListener);
};
