export type McpTransport = "http" | "sse";
export interface McpServerConfig {
    id: string;
    name: string;
    url: string;
    transport: McpTransport;
    enabled: boolean;
    /** Headers to include in every request (e.g. authorization) */
    headers?: Record<string, string>;
    /** Tools discovered from this server */
    discoveredTools?: string[];
    lastConnected?: number;
    error?: string;
}
interface McpStore {
    servers: McpServerConfig[];
    addServer: (server: Omit<McpServerConfig, "id" | "enabled">) => string;
    updateServer: (id: string, patch: Partial<McpServerConfig>) => void;
    removeServer: (id: string) => void;
    toggleServer: (id: string, enabled: boolean) => void;
}
export declare const useMcpStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<McpStore>, "setState" | "persist"> & {
    setState(partial: McpStore | Partial<McpStore> | ((state: McpStore) => McpStore | Partial<McpStore>), replace?: false | undefined): unknown;
    setState(state: McpStore | ((state: McpStore) => McpStore), replace: true): unknown;
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<McpStore, McpStore, unknown>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: McpStore) => void) => () => void;
        onFinishHydration: (fn: (state: McpStore) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<McpStore, McpStore, unknown>>;
    };
}>;
export {};
