/**
 * RAG (Retrieval-Augmented Generation) pipeline.
 * Handles document ingestion, chunking, embedding, and retrieval.
 * Vector index is persisted to OPFS.
 */

import { writeFile, readFileText, fileExists } from "@/lib/storage/opfs";
import { workspacePaths } from "@/lib/storage/workspace";
import { generateId } from "@/lib/utils";

// ─── Embedder bridge ────────────────────────────────────────────────────────

let ragWorker: Worker | null = null;
let workerReady = false;
let workerError: Error | null = null;
let reqCounter = 0;
const pending = new Map<string, { resolve: (v: number[]) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!ragWorker) {
    ragWorker = new Worker(new URL("../../workers/rag.worker.ts", import.meta.url), { type: "module" });
    ragWorker.onmessage = (e) => {
      const msg = e.data as { id: string; type: string; embedding?: number[]; error?: string };
      if (msg.id === "__init__") {
        if (msg.type === "ready") { workerReady = true; return; }
        if (msg.type === "error") {
          workerError = new Error(msg.error ?? "Embedding worker failed to initialise");
          // Reject all pending requests that were waiting for init
          for (const [, req] of pending) req.reject(workerError);
          pending.clear();
          return;
        }
        return;
      }
      const req = pending.get(msg.id);
      if (!req) return;
      if (msg.type === "embedding") { req.resolve(msg.embedding!); pending.delete(msg.id); }
      else if (msg.type === "error") { req.reject(new Error(msg.error)); pending.delete(msg.id); }
    };
    ragWorker.onerror = (e) => {
      workerError = new Error(`Embedding worker crashed: ${e.message}`);
      for (const [, req] of pending) req.reject(workerError);
      pending.clear();
      ragWorker = null; // allow recreation on next call
      workerReady = false;
    };
  }
  return ragWorker;
}

async function embedText(text: string): Promise<number[]> {
  const w = getWorker();
  while (!workerReady) {
    if (workerError) throw workerError;
    await new Promise((r) => setTimeout(r, 200));
  }
  const id = `rag-${++reqCounter}`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type: "embed", text });
  });
}

// ─── Chunking ────────────────────────────────────────────────────────────────

export interface Chunk {
  id: string;
  text: string;
  metadata: {
    source: string;
    page?: number;
    chunkIndex: number;
    totalChunks?: number;
  };
  embedding?: number[];
}

function chunkText(text: string, source: string, chunkSize = 500, overlap = 50): Chunk[] {
  // Split into sentences first
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const chunks: Chunk[] = [];
  let current = "";
  let chunkIndex = 0;

  for (const sentence of sentences) {
    if (current.length + sentence.length > chunkSize && current.length > 0) {
      chunks.push({
        id: generateId(),
        text: current.trim(),
        metadata: { source, chunkIndex: chunkIndex++ },
      });
      // Keep overlap
      const words = current.split(" ");
      current = words.slice(-Math.floor(overlap / 5)).join(" ") + " " + sentence;
    } else {
      current += sentence + " ";
    }
  }
  if (current.trim()) {
    chunks.push({
      id: generateId(),
      text: current.trim(),
      metadata: { source, chunkIndex: chunkIndex++ },
    });
  }
  return chunks.map((c) => ({ ...c, metadata: { ...c.metadata, totalChunks: chunkIndex } }));
}

// ─── Vector store (OPFS-backed) ───────────────────────────────────────────────

interface VectorEntry {
  id: string;
  text: string;
  embedding: number[];
  metadata: Chunk["metadata"];
}

interface VectorIndex {
  version: number;
  entries: VectorEntry[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

async function loadIndex(workspaceId: string): Promise<VectorIndex> {
  const path = `${workspacePaths.vectors(workspaceId)}/index.json`;
  if (await fileExists(path)) {
    const text = await readFileText(path);
    return JSON.parse(text) as VectorIndex;
  }
  return { version: 1, entries: [] };
}

async function saveIndex(workspaceId: string, index: VectorIndex): Promise<void> {
  const path = `${workspacePaths.vectors(workspaceId)}/index.json`;
  await writeFile(path, JSON.stringify(index));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface IngestOptions {
  workspaceId: string;
  source: string;
  text: string;
  onProgress?: (done: number, total: number) => void;
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata: Chunk["metadata"];
}

export async function ingestDocument(opts: IngestOptions): Promise<number> {
  const { workspaceId, source, text, onProgress } = opts;
  const chunks = chunkText(text, source);
  const index = await loadIndex(workspaceId);

  // Remove existing entries for this source
  index.entries = index.entries.filter((e) => e.metadata.source !== source);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await embedText(chunk.text);
    index.entries.push({ id: chunk.id, text: chunk.text, embedding, metadata: chunk.metadata });
    onProgress?.(i + 1, chunks.length);
  }

  await saveIndex(workspaceId, index);
  return chunks.length;
}

export async function searchDocuments(
  workspaceId: string,
  query: string,
  topK = 5,
): Promise<SearchResult[]> {
  const index = await loadIndex(workspaceId);
  if (index.entries.length === 0) return [];

  const queryEmbedding = await embedText(query);
  const scored = index.entries.map((entry) => ({
    id: entry.id,
    text: entry.text,
    metadata: entry.metadata,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

export async function listSources(workspaceId: string): Promise<string[]> {
  const index = await loadIndex(workspaceId);
  return [...new Set(index.entries.map((e) => e.metadata.source))];
}

export async function removeSource(workspaceId: string, source: string): Promise<void> {
  const index = await loadIndex(workspaceId);
  index.entries = index.entries.filter((e) => e.metadata.source !== source);
  await saveIndex(workspaceId, index);
}

export async function getIndexStats(workspaceId: string): Promise<{ chunks: number; sources: number }> {
  const index = await loadIndex(workspaceId);
  const sources = new Set(index.entries.map((e) => e.metadata.source));
  return { chunks: index.entries.length, sources: sources.size };
}
