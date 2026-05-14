import { create } from "zustand";
import { persist } from "zustand/middleware";
import { generateId } from "@/lib/utils";

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

export const useMcpStore = create<McpStore>()(
  persist(
    (set) => ({
      servers: [],

      addServer: (server) => {
        const id = generateId();
        set((s) => ({
          servers: [...s.servers, { ...server, id, enabled: true }],
        }));
        return id;
      },

      updateServer: (id, patch) => {
        set((s) => ({
          servers: s.servers.map((srv) =>
            srv.id === id ? { ...srv, ...patch } : srv,
          ),
        }));
      },

      removeServer: (id) => {
        set((s) => ({ servers: s.servers.filter((srv) => srv.id !== id) }));
      },

      toggleServer: (id, enabled) => {
        set((s) => ({
          servers: s.servers.map((srv) =>
            srv.id === id ? { ...srv, enabled } : srv,
          ),
        }));
      },
    }),
    { name: "zenon-mcp-servers" },
  ),
);
