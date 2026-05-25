import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProviderConfig, ModelInfo } from "@zenon/shared-types";
import { generateId } from "../lib/utils";

interface ProviderStore {
  providers: ProviderConfig[];
  apiKeys: Record<string, string>; // providerId → key (stored in memory, not persisted)
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
  getAvailableModels: () => Array<ModelInfo & { providerId: string; providerName: string }>;
}

const BUILTIN_PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    type: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    hasApiKey: false,
    enabled: true,
    models: [
      { id: "gpt-4o", name: "GPT-4o", contextWindow: 128000, supportsVision: true, supportsFunctionCalling: true, supportsStreaming: true },
      { id: "gpt-4o-mini", name: "GPT-4o mini", contextWindow: 128000, supportsVision: true, supportsFunctionCalling: true, supportsStreaming: true },
      { id: "gpt-4.1", name: "GPT-4.1", contextWindow: 1047576, supportsVision: true, supportsFunctionCalling: true, supportsStreaming: true },
      { id: "gpt-4.1-mini", name: "GPT-4.1 mini", contextWindow: 1047576, supportsVision: true, supportsFunctionCalling: true, supportsStreaming: true },
      { id: "o3", name: "o3", contextWindow: 200000, supportsFunctionCalling: true, supportsStreaming: true },
      { id: "o4-mini", name: "o4-mini", contextWindow: 200000, supportsFunctionCalling: true, supportsStreaming: true },
    ],
  },
  {
    id: "anthropic",
    type: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    hasApiKey: false,
    enabled: true,
    models: [
      { id: "claude-opus-4-5", name: "Claude Opus 4.5", contextWindow: 200000, supportsVision: true, supportsFunctionCalling: true, supportsStreaming: true },
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", contextWindow: 200000, supportsVision: true, supportsFunctionCalling: true, supportsStreaming: true },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", contextWindow: 200000, supportsVision: true, supportsFunctionCalling: true, supportsStreaming: true },
    ],
  },
  {
    id: "gemini",
    type: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    hasApiKey: false,
    enabled: true,
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", contextWindow: 1048576, supportsVision: true, supportsFunctionCalling: true, supportsStreaming: true },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", contextWindow: 1048576, supportsVision: true, supportsFunctionCalling: true, supportsStreaming: true },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", contextWindow: 1048576, supportsVision: true, supportsFunctionCalling: true, supportsStreaming: true },
    ],
  },
  {
    id: "bedrock",
    type: "bedrock",
    name: "AWS Bedrock",
    hasApiKey: false,
    enabled: false,
    models: [
      { id: "anthropic.claude-opus-4-5-v1:0", name: "Claude Opus 4.5 (Bedrock)", contextWindow: 200000, supportsVision: true, supportsFunctionCalling: true, supportsStreaming: true },
      { id: "anthropic.claude-sonnet-4-5-v1:0", name: "Claude Sonnet 4.5 (Bedrock)", contextWindow: 200000, supportsVision: true, supportsFunctionCalling: true, supportsStreaming: true },
      { id: "amazon.nova-pro-v1:0", name: "Amazon Nova Pro", contextWindow: 300000, supportsVision: true, supportsFunctionCalling: true, supportsStreaming: true },
      { id: "amazon.nova-lite-v1:0", name: "Amazon Nova Lite", contextWindow: 300000, supportsVision: true, supportsFunctionCalling: true, supportsStreaming: true },
      { id: "meta.llama3-3-70b-instruct-v1:0", name: "Llama 3.3 70B", contextWindow: 128000, supportsFunctionCalling: true, supportsStreaming: true },
    ],
  },
  {
    id: "ollama",
    type: "openai-compatible",
    name: "Ollama (local)",
    baseUrl: "/ollama/v1",
    hasApiKey: false,
    enabled: true,
    models: [
      { id: "qwen3.6:35b-a3b-q4_K_M", name: "Qwen 3.6 35B A3B Q4_K_M", contextWindow: 262144, supportsFunctionCalling: true, supportsStreaming: true, isLocal: true },
      { id: "llama3.2", name: "Llama 3.2 3B", contextWindow: 131072, supportsFunctionCalling: true, supportsStreaming: true, isLocal: true },
      { id: "mistral", name: "Mistral 7B", contextWindow: 32768, supportsFunctionCalling: true, supportsStreaming: true, isLocal: true },
      { id: "qwen2.5", name: "Qwen 2.5 7B", contextWindow: 128000, supportsFunctionCalling: true, supportsStreaming: true, isLocal: true },
    ],
  },
  {
    id: "local-webgpu",
    type: "local-webgpu",
    name: "Local (WebGPU)",
    hasApiKey: false,
    enabled: true,
    models: [
      {
        id: "mistralai/Ministral-3-3B-Instruct-2512-ONNX",
        name: "Ministral 3B Instruct (WebGPU)",
        contextWindow: 131072,
        supportsVision: false,
        supportsFunctionCalling: false,
        supportsStreaming: true,
        isLocal: true,
      },
    ],
  },
];

const BUILTIN_PROVIDER_IDS = new Set(BUILTIN_PROVIDERS.map((p) => p.id));

function mergePersistedProviders(
  persistedProviders: ProviderConfig[] | undefined,
): ProviderConfig[] {
  if (!persistedProviders) return BUILTIN_PROVIDERS;

  const persistedById = new Map(persistedProviders.map((p) => [p.id, p]));
  const builtIns = BUILTIN_PROVIDERS.map((current) => {
    const persisted = persistedById.get(current.id);
    if (!persisted) return current;

    return {
      ...current,
      hasApiKey: persisted.hasApiKey,
      enabled:
        current.id === "ollama"
          ? true
          : persisted.enabled,
    };
  });

  const customProviders = persistedProviders.filter(
    (provider) => !BUILTIN_PROVIDER_IDS.has(provider.id),
  );

  return [...builtIns, ...customProviders];
}

export const useProviderStore = create<ProviderStore>()(
  persist(
    (set, get) => ({
      providers: BUILTIN_PROVIDERS,
      apiKeys: {},
      selectedProviderId: "openai",
      selectedModelId: "gpt-4o",

      setApiKey: (providerId, key) => {
        // Store in memory AND mark provider as having a key
        set((s) => ({
          apiKeys: { ...s.apiKeys, [providerId]: key },
          providers: s.providers.map((p) =>
            p.id === providerId ? { ...p, hasApiKey: key.length > 0 } : p,
          ),
        }));
        // Also store encrypted in localStorage separately
        try {
          localStorage.setItem(`zenon-key-${providerId}`, key);
        } catch {
          // ignore
        }
      },

      getApiKey: (providerId) => {
        const inMemory = get().apiKeys[providerId];
        if (inMemory) return inMemory;
        // Load from localStorage if available
        try {
          return localStorage.getItem(`zenon-key-${providerId}`) ?? undefined;
        } catch {
          return undefined;
        }
      },

      clearApiKey: (providerId) => {
        set((s) => {
          const { [providerId]: _, ...rest } = s.apiKeys;
          return {
            apiKeys: rest,
            providers: s.providers.map((p) =>
              p.id === providerId ? { ...p, hasApiKey: false } : p,
            ),
          };
        });
        try {
          localStorage.removeItem(`zenon-key-${providerId}`);
        } catch {
          // ignore
        }
      },

      addCustomProvider: (config) => {
          const id = generateId();
        set((s) => ({
          providers: [...s.providers, { ...config, id }],
        }));
        return id;
      },

      updateProvider: (id, patch) => {
        set((s) => ({
          providers: s.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }));
      },

      removeProvider: (id) => {
        const builtin = BUILTIN_PROVIDERS.map((p) => p.id);
        if (builtin.includes(id)) return;
        set((s) => ({
          providers: s.providers.filter((p) => p.id !== id),
        }));
      },

      toggleProvider: (id, enabled) => {
        set((s) => ({
          providers: s.providers.map((p) => (p.id === id ? { ...p, enabled } : p)),
        }));
      },

      setSelectedModel: (providerId, modelId) => {
        set({ selectedProviderId: providerId, selectedModelId: modelId });
      },

      getAvailableModels: () => {
        return get()
          .providers.filter((p) => p.enabled)
          .flatMap((p) =>
            p.models.map((m) => ({
              ...m,
              providerId: p.id,
              providerName: p.name,
            })),
          );
      },
    }),
    {
      name: "zenon-providers",
      merge: (persisted, current) => {
        const persistedState =
          persisted &&
          typeof persisted === "object" &&
          "providers" in persisted
            ? (persisted as Partial<ProviderStore>)
            : undefined;

        return {
          ...current,
          ...persistedState,
          providers: mergePersistedProviders(persistedState?.providers),
          apiKeys: {},
        };
      },
      // Don't persist API keys in zustand persist (use localStorage directly)
      partialize: (s) => ({
        ...s,
        apiKeys: {},
      }),
    },
  ),
);
