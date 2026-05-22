import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Embedding model catalog ─────────────────────────────────────────────────

export interface EmbeddingModelInfo {
  id: string;
  name: string;
  dimensions: number;
  /** Approximate download size in MB */
  sizeMB: number;
}

export const EMBEDDING_MODELS: EmbeddingModelInfo[] = [
  { id: "Xenova/all-MiniLM-L6-v2", name: "all-MiniLM-L6-v2 (default)", dimensions: 384, sizeMB: 80 },
  { id: "Xenova/bge-small-en-v1.5", name: "BGE Small EN v1.5", dimensions: 384, sizeMB: 130 },
  { id: "Xenova/all-MiniLM-L12-v2", name: "all-MiniLM-L12-v2", dimensions: 384, sizeMB: 130 },
  { id: "Xenova/gte-small", name: "GTE Small", dimensions: 384, sizeMB: 70 },
];

// ─── CSV handling modes ──────────────────────────────────────────────────────

export type CsvHandlingMode = "chunk" | "sql";

// ─── Store shape ─────────────────────────────────────────────────────────────

export interface ChunkingConfig {
  chunkSize: number;
  overlap: number;
}

export interface RagConfig {
  /** HuggingFace model ID used for embeddings */
  embeddingModelId: string;
  /** Chunking parameters */
  chunking: ChunkingConfig;
  /** How to handle CSV / table files */
  csvHandling: CsvHandlingMode;
  /** Model IDs that have been pre-downloaded */
  downloadedModels: string[];
}

interface RagStore extends RagConfig {
  setEmbeddingModel: (modelId: string) => void;
  setChunking: (config: Partial<ChunkingConfig>) => void;
  setCsvHandling: (mode: CsvHandlingMode) => void;
  markModelDownloaded: (modelId: string) => void;
  removeDownloadedModel: (modelId: string) => void;
}

const DEFAULT_CONFIG: RagConfig = {
  embeddingModelId: "Xenova/all-MiniLM-L6-v2",
  chunking: { chunkSize: 500, overlap: 50 },
  csvHandling: "chunk",
  downloadedModels: [],
};

export const useRagStore = create<RagStore>()(
  persist(
    (set) => ({
      ...DEFAULT_CONFIG,

      setEmbeddingModel: (modelId) => set({ embeddingModelId: modelId }),

      setChunking: (config) =>
        set((s) => ({ chunking: { ...s.chunking, ...config } })),

      setCsvHandling: (mode) => set({ csvHandling: mode }),

      markModelDownloaded: (modelId) =>
        set((s) => ({
          downloadedModels: s.downloadedModels.includes(modelId)
            ? s.downloadedModels
            : [...s.downloadedModels, modelId],
        })),

      removeDownloadedModel: (modelId) =>
        set((s) => ({
          downloadedModels: s.downloadedModels.filter((id) => id !== modelId),
        })),
    }),
    { name: "zenon-rag-config" },
  ),
);
