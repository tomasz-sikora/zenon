import type { AgentDefinition } from "@zenon/shared-types";
interface AgentStore {
    agents: AgentDefinition[];
    createAgent: (agent: Omit<AgentDefinition, "id" | "createdAt" | "updatedAt">) => string;
    updateAgent: (id: string, patch: Partial<AgentDefinition>) => void;
    deleteAgent: (id: string) => void;
    getAgent: (id: string) => AgentDefinition | undefined;
    duplicateAgent: (id: string) => string | undefined;
}
export declare const useAgentStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<AgentStore>, "setState" | "persist"> & {
    setState(partial: AgentStore | Partial<AgentStore> | ((state: AgentStore) => AgentStore | Partial<AgentStore>), replace?: false | undefined): unknown;
    setState(state: AgentStore | ((state: AgentStore) => AgentStore), replace: true): unknown;
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<AgentStore, AgentStore, unknown>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: AgentStore) => void) => () => void;
        onFinishHydration: (fn: (state: AgentStore) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<AgentStore, AgentStore, unknown>>;
    };
}>;
export {};
