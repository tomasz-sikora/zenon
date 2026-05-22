/**
 * Runtime environment detection.
 * Detects whether Zenon is running as an installed PWA, inside Electron, or in a regular browser.
 */

export type RuntimeEnvironment = "electron" | "pwa" | "browser";

/** Check if running inside Electron */
export function isElectron(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof window !== "undefined" && !!(window as any).electronAPI;
}

/** Check if running as an installed PWA (standalone mode) */
export function isInstalledPWA(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari standalone mode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true
  );
}

/** Get the current runtime environment */
export function getRuntimeEnvironment(): RuntimeEnvironment {
  if (isElectron()) return "electron";
  if (isInstalledPWA()) return "pwa";
  return "browser";
}

/** Check if the app supports persistent storage (OPFS, localStorage) */
export function supportsPersistentStorage(): boolean {
  return typeof navigator !== "undefined" && "storage" in navigator;
}

/** Check if WebGPU is available for local model inference */
export function supportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** Check if SharedArrayBuffer is available (requires COOP/COEP headers) */
export function supportsSharedArrayBuffer(): boolean {
  return typeof SharedArrayBuffer !== "undefined";
}

/** Request persistent storage to prevent browser from evicting data */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!supportsPersistentStorage()) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Get storage quota estimate */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!supportsPersistentStorage() || !navigator.storage.estimate) return null;
  try {
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
  } catch {
    return null;
  }
}
