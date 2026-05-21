import type { ProviderConfig, ModelInfo } from "@zenon/shared-types";
interface ProviderStore {
    providers: ProviderConfig[];
    apiKeys: Record<string, string>;
    selectedProviderId: string;
    selectedModelId: string;
    setApiKey: (providerId: string, key: string) => void;
    getApiKey: (providerId: string) => string | undefined;
    clearApiKey: (providerId: string) => void;
    addCustomProvider: (config: Omit<ProviderConfig, "id">) => string;
    updateProvider: (id: string, patch: Partial<ProviderConfig>) => void;
    removeProvider: (id: string) => void;
    toggleProvider: (id: string, enabled: boolean) => void;
    setSelectedModel: (providerId: string, modelId: string) => void;
    getAvailableModels: () => Array<ModelInfo & {
        providerId: string;
        providerName: string;
    }>;
}
export declare const useProviderStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<ProviderStore>, "setState" | "persist"> & {
    setState(partial: ProviderStore | Partial<ProviderStore> | ((state: ProviderStore) => ProviderStore | Partial<ProviderStore>), replace?: false | undefined): unknown;
    setState(state: ProviderStore | ((state: ProviderStore) => ProviderStore), replace: true): unknown;
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<ProviderStore, {
            apiKeys: {};
            providers: ProviderConfig[];
            selectedProviderId: string;
            selectedModelId: string;
            setApiKey: (providerId: string, key: string) => void;
            getApiKey: (providerId: string) => string | undefined;
            clearApiKey: (providerId: string) => void;
            addCustomProvider: (config: Omit<ProviderConfig, "id">) => string;
            updateProvider: (id: string, patch: Partial<ProviderConfig>) => void;
            removeProvider: (id: string) => void;
            toggleProvider: (id: string, enabled: boolean) => void;
            setSelectedModel: (providerId: string, modelId: string) => void;
            getAvailableModels: () => Array<ModelInfo & {
                providerId: string;
                providerName: string;
            }>;
        }, unknown>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: ProviderStore) => void) => () => void;
        onFinishHydration: (fn: (state: ProviderStore) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<ProviderStore, {
            apiKeys: {};
            providers: ProviderConfig[];
            selectedProviderId: string;
            selectedModelId: string;
            setApiKey: (providerId: string, key: string) => void;
            getApiKey: (providerId: string) => string | undefined;
            clearApiKey: (providerId: string) => void;
            addCustomProvider: (config: Omit<ProviderConfig, "id">) => string;
            updateProvider: (id: string, patch: Partial<ProviderConfig>) => void;
            removeProvider: (id: string) => void;
            toggleProvider: (id: string, enabled: boolean) => void;
            setSelectedModel: (providerId: string, modelId: string) => void;
            getAvailableModels: () => Array<ModelInfo & {
                providerId: string;
                providerName: string;
            }>;
        }, unknown>>;
    };
}>;
export {};
