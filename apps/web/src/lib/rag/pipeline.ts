/**
 * RAG (Retrieval-Augmented Generation) pipeline.
 * Handles document ingestion, chunking, embedding, and retrieval.
 * Vector index is persisted to OPFS.
 *
 * Features:
 * - Configurable embedding model (via ragStore)
 * - Configurable chunk size / overlap
 * - Text-search fallback when embedding model is unavailable
 * - CSV → SQL ingestion path (stores in SQLite via Pyodide)
 */

import { writeFile, readFileText, fileExists } from "@/lib/storage/opfs";
import { workspacePaths } from "@/lib/storage/workspace";
import { generateId } from "@/lib/utils";

// ─── Embedder bridge ────────────────────────────────────────────────────────

let ragWorker: Worker | null = null;
let workerReady = false;
let workerError: Error | null = null;
let reqCounter = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!ragWorker) {
    workerError = null;
    ragWorker = new Worker(new URL("../../workers/rag.worker.ts", import.meta.url), { type: "module" });
    ragWorker.onmessage = (e) => {
      const msg = e.data as {
        id: string;
        type: string;
        embedding?: number[];
        error?: string;
        modelId?: string;
      };
      if (msg.id === "__init__") {
        if (msg.type === "ready") { workerReady = true; workerError = null; return; }
        if (msg.type === "error") {
          workerError = new Error(msg.error ?? "Embedding worker failed to initialise");
          for (const [, req] of pending) req.reject(workerError);
          pending.clear();
          return;
        }
        return;
      }
      const req = pending.get(msg.id);
      if (!req) return;
      if (msg.type === "embedding") { req.resolve(msg.embedding!); pending.delete(msg.id); }
      else if (msg.type === "ready" || msg.type === "downloaded") { req.resolve(msg.modelId ?? true); pending.delete(msg.id); }
      else if (msg.type === "error") { req.reject(new Error(msg.error)); pending.delete(msg.id); }
    };
    ragWorker.onerror = (e) => {
      const details =
        e.message ||
        ("filename" in e && e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : "unknown error");
      workerError = new Error(`Embedding worker crashed: ${details}`);
      for (const [, req] of pending) req.reject(workerError);
      pending.clear();
      ragWorker = null;
      workerReady = false;
    };
  }
  return ragWorker;
}

async function embedText(text: string, modelId?: string): Promise<number[]> {
  const w = getWorker();
  while (!workerReady) {
    if (workerError) throw workerError;
    await new Promise((r) => setTimeout(r, 200));
  }
  const id = `rag-${++reqCounter}`;
  return new Promise<number[]>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ id, type: "embed", text, modelId });
  });
}

/** Pre-download an embedding model (without switching to it) */
export async function predownloadModel(
  modelId: string,
  onProgress?: (progress: number, message: string) => void,
): Promise<void> {
  const w = getWorker();
  // Wait for worker init
  while (!workerReady) {
    if (workerError) throw workerError;
    await new Promise((r) => setTimeout(r, 200));
  }

  const id = `predownload-${++reqCounter}`;

  // Listen for progress
  const progressHandler = (e: MessageEvent) => {
    const msg = e.data;
    if (msg.id === id && msg.type === "progress" && onProgress) {
      onProgress(msg.progress ?? 0, msg.message ?? "");
    }
  };
  w.addEventListener("message", progressHandler);

  try {
    await new Promise<void>((resolve, reject) => {
      pending.set(id, {
        resolve: () => resolve(),
        reject,
      });
      w.postMessage({ id, type: "predownload", modelId });
    });
  } finally {
    w.removeEventListener("message", progressHandler);
  }
}

/** Switch the worker to a different embedding model */
export async function switchEmbeddingModel(modelId: string): Promise<void> {
  const w = getWorker();
  while (!workerReady) {
    if (workerError) throw workerError;
    await new Promise((r) => setTimeout(r, 200));
  }
  const id = `loadmodel-${++reqCounter}`;
  await new Promise<void>((resolve, reject) => {
    pending.set(id, {
      resolve: () => resolve(),
      reject,
    });
    w.postMessage({ id, type: "load_model", modelId });
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

export function chunkText(text: string, source: string, chunkSize = 500, overlap = 50): Chunk[] {
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) ?? [text];
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

// ─── Text-search fallback ────────────────────────────────────────────────────

/** Simple BM25-like text search when embeddings are unavailable */
function textSearch(entries: VectorEntry[], query: string, topK: number): SearchResult[] {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (queryTerms.length === 0) return [];

  const scored = entries.map((entry) => {
    const text = entry.text.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const matches = text.match(regex);
      if (matches) {
        // TF component
        score += matches.length / Math.max(text.split(/\s+/).length, 1);
      }
    }
    // IDF-like: boost for matching more distinct terms
    const distinctMatches = queryTerms.filter((t) => text.includes(t)).length;
    score *= 1 + distinctMatches / queryTerms.length;

    return {
      id: entry.id,
      text: entry.text,
      metadata: entry.metadata,
      score: Math.min(score, 1), // clamp
    };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
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
  embeddingModelId?: string;
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

// ─── CSV → SQL storage ───────────────────────────────────────────────────────

/** Path for the SQLite database for a workspace */
function sqlDbPath(workspaceId: string): string {
  return `${workspacePaths.vectors(workspaceId)}/tables.sqlite.json`;
}

export interface CsvTableMeta {
  tableName: string;
  source: string;
  columns: string[];
  rowCount: number;
}

/** Store CSV data as a queryable JSON table (lightweight SQL-like storage) */
export async function ingestCsvAsTable(
  workspaceId: string,
  source: string,
  csvText: string,
): Promise<CsvTableMeta> {
  // Parse CSV
  const lines = csvText.split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV must have at least a header and one data row");

  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
    rows.push(row);
  }

  // Sanitize table name from filename
  const tableName = source.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();

  // Load existing tables DB
  const dbPath = sqlDbPath(workspaceId);
  let db: Record<string, { meta: CsvTableMeta; rows: Record<string, string>[] }> = {};
  if (await fileExists(dbPath)) {
    db = JSON.parse(await readFileText(dbPath));
  }

  const meta: CsvTableMeta = { tableName, source, columns: headers, rowCount: rows.length };
  db[tableName] = { meta, rows };

  await writeFile(dbPath, JSON.stringify(db));
  return meta;
}

/** List all CSV tables in a workspace */
export async function listCsvTables(workspaceId: string): Promise<CsvTableMeta[]> {
  const dbPath = sqlDbPath(workspaceId);
  if (!(await fileExists(dbPath))) return [];
  const db = JSON.parse(await readFileText(dbPath));
  return Object.values(db).map((t: unknown) => (t as { meta: CsvTableMeta }).meta);
}

/** Query a CSV table using a simple SQL-like filter or return all rows */
export async function queryCsvTable(
  workspaceId: string,
  tableName: string,
  filter?: { column: string; operator: string; value: string },
  limit = 100,
): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
  const dbPath = sqlDbPath(workspaceId);
  if (!(await fileExists(dbPath))) throw new Error("No tables database found");
  const db = JSON.parse(await readFileText(dbPath));
  const table = db[tableName];
  if (!table) throw new Error(`Table "${tableName}" not found`);

  let rows = table.rows as Record<string, string>[];
  if (filter) {
    rows = rows.filter((row) => {
      const val = row[filter.column] ?? "";
      switch (filter.operator) {
        case "=": case "==": return val === filter.value;
        case "!=": return val !== filter.value;
        case ">": return Number(val) > Number(filter.value);
        case "<": return Number(val) < Number(filter.value);
        case ">=": return Number(val) >= Number(filter.value);
        case "<=": return Number(val) <= Number(filter.value);
        case "LIKE": case "like": return val.toLowerCase().includes(filter.value.toLowerCase());
        default: return val === filter.value;
      }
    });
  }

  return { columns: table.meta.columns, rows: rows.slice(0, limit) };
}

/** Remove a CSV table */
export async function removeCsvTable(workspaceId: string, tableName: string): Promise<void> {
  const dbPath = sqlDbPath(workspaceId);
  if (!(await fileExists(dbPath))) return;
  const db = JSON.parse(await readFileText(dbPath));
  delete db[tableName];
  await writeFile(dbPath, JSON.stringify(db));
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface IngestOptions {
  workspaceId: string;
  source: string;
  text: string;
  onProgress?: (done: number, total: number) => void;
  /** Override chunk size (default from ragStore) */
  chunkSize?: number;
  /** Override overlap (default from ragStore) */
  overlap?: number;
  /** Embedding model to use */
  embeddingModelId?: string;
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata: Chunk["metadata"];
}

export async function ingestDocument(opts: IngestOptions): Promise<number> {
  const { workspaceId, source, text, onProgress, chunkSize, overlap, embeddingModelId } = opts;
  const chunks = chunkText(text, source, chunkSize, overlap);
  const index = await loadIndex(workspaceId);

  // Remove existing entries for this source
  index.entries = index.entries.filter((e) => e.metadata.source !== source);

  let useEmbeddings = true;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let embedding: number[];
    try {
      embedding = await embedText(chunk.text, embeddingModelId);
    } catch {
      // Fallback: store with empty embedding; text search will be used
      useEmbeddings = false;
      embedding = [];
    }
    index.entries.push({ id: chunk.id, text: chunk.text, embedding, metadata: chunk.metadata });
    onProgress?.(i + 1, chunks.length);

    // If embedding failed once, skip for remaining chunks
    if (!useEmbeddings) {
      for (let j = i + 1; j < chunks.length; j++) {
        const c = chunks[j];
        index.entries.push({ id: c.id, text: c.text, embedding: [], metadata: c.metadata });
        onProgress?.(j + 1, chunks.length);
      }
      break;
    }
  }

  if (embeddingModelId) {
    index.embeddingModelId = embeddingModelId;
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

  // Check if embeddings are available (non-empty)
  const hasEmbeddings = index.entries.some((e) => e.embedding.length > 0);

  if (!hasEmbeddings) {
    // Fallback to text search
    return textSearch(index.entries, query, topK);
  }

  try {
    const queryEmbedding = await embedText(query);
    const scored = index.entries
      .filter((e) => e.embedding.length > 0)
      .map((entry) => ({
        id: entry.id,
        text: entry.text,
        metadata: entry.metadata,
        score: cosineSimilarity(queryEmbedding, entry.embedding),
      }));

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  } catch {
    // Embedding failed at search time — fall back to text search
    return textSearch(index.entries, query, topK);
  }
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
