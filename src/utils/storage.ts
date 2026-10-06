// Browser storage helpers. Photos are kept in IndexedDB, which the browser may
// evict under storage pressure unless the site asks for persistent storage.
export interface StorageInfo {
  usage: number | null; // bytes
  quota: number | null; // bytes
  persisted: boolean | null;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const est = (await navigator.storage?.estimate?.().catch(() => undefined)) ?? undefined;
  const persisted = (await navigator.storage?.persisted?.().catch(() => undefined)) ?? null;
  return { usage: est?.usage ?? null, quota: est?.quota ?? null, persisted };
}

/** Asks the browser not to evict our data. Safe to call repeatedly. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
