/**
 * RAG (Retrieval-Augmented Generation) pipeline.
 * Handles document ingestion, chunking, embedding, and retrieval.
 * Vector index is persisted to OPFS.
 */
import { writeFile, readFileText, fileExists } from "@/lib/storage/opfs";
import { workspacePaths } from "@/lib/storage/workspace";
import { generateId } from "@/lib/utils";
// ─── Embedder bridge ────────────────────────────────────────────────────────
let ragWorker = null;
let workerReady = false;
let reqCounter = 0;
const pending = new Map();
function getWorker() {
    if (!ragWorker) {
        ragWorker = new Worker(new URL("../../workers/rag.worker.ts", import.meta.url), { type: "module" });
        ragWorker.onmessage = (e) => {
            const msg = e.data;
            if (msg.id === "__init__" && msg.type === "ready") {
                workerReady = true;
                return;
            }
            const req = pending.get(msg.id);
            if (!req)
                return;
            if (msg.type === "embedding") {
                req.resolve(msg.embedding);
                pending.delete(msg.id);
            }
            else if (msg.type === "error") {
                req.reject(new Error(msg.error));
                pending.delete(msg.id);
            }
        };
    }
    return ragWorker;
}
async function embedText(text) {
    const w = getWorker();
    while (!workerReady)
        await new Promise((r) => setTimeout(r, 200));
    const id = `rag-${++reqCounter}`;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        w.postMessage({ id, type: "embed", text });
    });
}
function chunkText(text, source, chunkSize = 500, overlap = 50) {
    // Split into sentences first
    const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
    const chunks = [];
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
        }
        else {
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
function cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}
async function loadIndex(workspaceId) {
    const path = `${workspacePaths.vectors(workspaceId)}/index.json`;
    if (await fileExists(path)) {
        const text = await readFileText(path);
        return JSON.parse(text);
    }
    return { version: 1, entries: [] };
}
async function saveIndex(workspaceId, index) {
    const path = `${workspacePaths.vectors(workspaceId)}/index.json`;
    await writeFile(path, JSON.stringify(index));
}
export async function ingestDocument(opts) {
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
export async function searchDocuments(workspaceId, query, topK = 5) {
    const index = await loadIndex(workspaceId);
    if (index.entries.length === 0)
        return [];
    const queryEmbedding = await embedText(query);
    const scored = index.entries.map((entry) => ({
        id: entry.id,
        text: entry.text,
        metadata: entry.metadata,
        score: cosineSimilarity(queryEmbedding, entry.embedding),
    }));
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
export async function listSources(workspaceId) {
    const index = await loadIndex(workspaceId);
    return [...new Set(index.entries.map((e) => e.metadata.source))];
}
export async function removeSource(workspaceId, source) {
    const index = await loadIndex(workspaceId);
    index.entries = index.entries.filter((e) => e.metadata.source !== source);
    await saveIndex(workspaceId, index);
}
export async function getIndexStats(workspaceId) {
    const index = await loadIndex(workspaceId);
    const sources = new Set(index.entries.map((e) => e.metadata.source));
    return { chunks: index.entries.length, sources: sources.size };
}
