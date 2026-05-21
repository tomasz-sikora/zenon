/**
 * RAG Web Worker — handles embedding generation using @huggingface/transformers.
 * Supports configurable embedding models; defaults to all-MiniLM-L6-v2 (384-d).
 */

import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

let embedder: FeatureExtractionPipeline | null = null;
let currentModelId: string | null = null;
let loading = false;
let loadError: string | null = null;

interface WorkerMessage {
  id: string;
  type: "embed" | "embed_batch" | "load_model" | "predownload";
  text?: string;
  texts?: string[];
  modelId?: string;
}

interface WorkerResponse {
  id: string;
  type: "ready" | "embedding" | "embeddings" | "error" | "progress" | "downloaded";
  embedding?: number[];
  embeddings?: number[][];
  error?: string;
  progress?: number;
  message?: string;
  modelId?: string;
}

function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

function progressCallback(id: string) {
  return (info: { status?: string; progress?: number; file?: string }) => {
    if (info.status === "progress") {
      post({
        id,
        type: "progress",
        progress: info.progress ?? 0,
        message: `Loading model: ${info.file ?? ""}`,
      });
    }
  };
}

async function loadModel(modelId: string, progressId: string): Promise<FeatureExtractionPipeline> {
  if (embedder && currentModelId === modelId) return embedder;

  // Dispose of old model if switching
  if (embedder && currentModelId !== modelId) {
    embedder = null;
    currentModelId = null;
  }

  loading = true;
  loadError = null;
  try {
    embedder = await pipeline("feature-extraction", modelId, {
      progress_callback: progressCallback(progressId),
    });
    currentModelId = modelId;
    return embedder!;
  } catch (e) {
    loadError = String(e);
    throw e;
  } finally {
    loading = false;
  }
}

async function getEmbedder(modelId?: string): Promise<FeatureExtractionPipeline> {
  const targetModel = modelId ?? currentModelId ?? "Xenova/all-MiniLM-L6-v2";

  if (embedder && currentModelId === targetModel) return embedder;
  if (loading) {
    while (loading) await new Promise((r) => setTimeout(r, 100));
    if (loadError) throw new Error(loadError);
    if (embedder && currentModelId === targetModel) return embedder!;
  }

  return loadModel(targetModel, "__progress__");
}

async function embed(text: string, modelId?: string): Promise<number[]> {
  const pipe = await getEmbedder(modelId);
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

// Start loading default model immediately
getEmbedder().then(() => {
  post({ id: "__init__", type: "ready" });
}).catch((e) => {
  post({ id: "__init__", type: "error", error: String(e) });
});

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, type } = event.data;
  try {
    if (type === "embed") {
      const text = event.data.text!;
      const embedding = await embed(text, event.data.modelId);
      post({ id, type: "embedding", embedding });
    } else if (type === "embed_batch") {
      const texts = event.data.texts!;
      const modelId = event.data.modelId;
      const embeddings = await Promise.all(texts.map((t) => embed(t, modelId)));
      post({ id, type: "embeddings", embeddings });
    } else if (type === "load_model") {
      const modelId = event.data.modelId ?? "Xenova/all-MiniLM-L6-v2";
      await loadModel(modelId, id);
      post({ id, type: "ready", modelId });
    } else if (type === "predownload") {
      // Pre-download a model without switching to it
      const modelId = event.data.modelId ?? "Xenova/all-MiniLM-L6-v2";
      await pipeline("feature-extraction", modelId, {
        progress_callback: progressCallback(id),
      });
      post({ id, type: "downloaded", modelId });
    }
  } catch (e) {
    post({ id, type: "error", error: e instanceof Error ? e.message : String(e) });
  }
};
