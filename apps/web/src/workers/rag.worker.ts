/**
 * RAG Web Worker — handles embedding generation using @huggingface/transformers.
 * Runs all-MiniLM-L6-v2 model to create 384-dimensional sentence embeddings.
 */

import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

let embedder: FeatureExtractionPipeline | null = null;
let loading = false;
let loadError: string | null = null;

interface WorkerMessage {
  id: string;
  type: "embed" | "embed_batch";
  text?: string;
  texts?: string[];
}

interface WorkerResponse {
  id: string;
  type: "ready" | "embedding" | "embeddings" | "error" | "progress";
  embedding?: number[];
  embeddings?: number[][];
  error?: string;
  progress?: number;
  message?: string;
}

function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (embedder) return embedder;
  if (loading) {
    while (loading) await new Promise((r) => setTimeout(r, 100));
    if (loadError) throw new Error(loadError);
    return embedder!;
  }
  loading = true;
  try {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      progress_callback: (info: { status?: string; progress?: number; file?: string }) => {
        if (info.status === "progress") {
          post({
            id: "__progress__",
            type: "progress",
            progress: info.progress ?? 0,
            message: `Loading model: ${info.file ?? ""}`,
          });
        }
      },
    });
    post({ id: "__init__", type: "ready" });
    return embedder!;
  } catch (e) {
    loadError = String(e);
    throw e;
  } finally {
    loading = false;
  }
}

async function embed(text: string): Promise<number[]> {
  const pipe = await getEmbedder();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

// Start loading model immediately
getEmbedder().catch((e) => {
  post({ id: "__init__", type: "error", error: String(e) });
});

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, type } = event.data;
  try {
    if (type === "embed") {
      const text = event.data.text!;
      const embedding = await embed(text);
      post({ id, type: "embedding", embedding });
    } else if (type === "embed_batch") {
      const texts = event.data.texts!;
      const embeddings = await Promise.all(texts.map(embed));
      post({ id, type: "embeddings", embeddings });
    }
  } catch (e) {
    post({ id, type: "error", error: e instanceof Error ? e.message : String(e) });
  }
};
