import { create } from "zustand";
import { persist } from "zustand/middleware";
import { generateId } from "@/lib/utils";
export const useMcpStore = create()(persist((set) => ({
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
            servers: s.servers.map((srv) => srv.id === id ? { ...srv, ...patch } : srv),
        }));
    },
    removeServer: (id) => {
        set((s) => ({ servers: s.servers.filter((srv) => srv.id !== id) }));
    },
    toggleServer: (id, enabled) => {
        set((s) => ({
            servers: s.servers.map((srv) => srv.id === id ? { ...srv, enabled } : srv),
        }));
    },
}), { name: "zenon-mcp-servers" }));
