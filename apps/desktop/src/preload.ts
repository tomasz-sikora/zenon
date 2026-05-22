import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload script – exposes a minimal API to the renderer via contextBridge.
 * The renderer can access these via `window.electronAPI`.
 */
contextBridge.exposeInMainWorld("electronAPI", {
  /** Returns true – indicates the app is running inside Electron */
  isElectron: true,

  /** Get the app version from package.json */
  getVersion: (): string => {
    // ipcRenderer is available in preload but we can read version from process
    return process.env.npm_package_version ?? "0.0.0";
  },

  /** Get the platform (darwin, win32, linux) */
  getPlatform: (): string => process.platform,

  /** Get the user data path for persistent storage */
  getUserDataPath: (): Promise<string> => ipcRenderer.invoke("get-user-data-path"),
});

// Type augmentation for window.electronAPI
export interface ElectronAPI {
  isElectron: true;
  getVersion: () => string;
  getPlatform: () => string;
  getUserDataPath: () => Promise<string>;
}
