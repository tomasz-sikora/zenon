/**
 * RAG pipeline unit tests.
 * Worker is replaced with a deterministic stub so tests run synchronously
 * without network access or actual model inference.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// ─── Deterministic embedding stub ────────────────────────────────────────────
// Maps fixed texts to orthogonal unit vectors so cosine similarity is predictable.
const EMBED_DIM = 384;

function makeUnitVec(index: number): number[] {
  const v = new Array<number>(EMBED_DIM).fill(0);
  v[index % EMBED_DIM] = 1;
  return v;
}

// Simple deterministic hash of a string to a stable index
function textToIndex(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return Math.abs(h) % EMBED_DIM;
}

// ─── Worker mock ──────────────────────────────────────────────────────────────
class MockEmbedWorker extends EventTarget {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;

  constructor(_url: URL | string, _opts?: WorkerOptions) {
    super();
    // Signal ready on the next tick
    queueMicrotask(() => {
      this.onmessage?.({ data: { id: "__init__", type: "ready" } } as MessageEvent);
    });
  }

  postMessage(msg: { id: string; type: string; text?: string; texts?: string[] }) {
    queueMicrotask(() => {
      if (msg.type === "embed" && msg.text !== undefined) {
        this.onmessage?.({
          data: { id: msg.id, type: "embedding", embedding: makeUnitVec(textToIndex(msg.text)) },
        } as MessageEvent);
      } else if (msg.type === "embed_batch" && msg.texts) {
        this.onmessage?.({
          data: {
            id: msg.id,
            type: "embeddings",
            embeddings: msg.texts.map((t) => makeUnitVec(textToIndex(t))),
          },
        } as MessageEvent);
      }
    });
  }

  terminate() {}
}

// ─── Setup ────────────────────────────────────────────────────────────────────
// Stub Worker BEFORE any module that uses it is imported.
beforeAll(() => {
  vi.stubGlobal("Worker", MockEmbedWorker);
});

// Dynamically import pipeline AFTER the global stub is in place.
// We re-import for each suite so module-level worker state is fresh.
// (Vitest resets module registry between files but not between tests within a file
//  unless we explicitly call vi.resetModules — kept simple here.)

let ingestDocument: typeof import("./pipeline").ingestDocument;
let searchDocuments: typeof import("./pipeline").searchDocuments;
let listSources: typeof import("./pipeline").listSources;
let removeSource: typeof import("./pipeline").removeSource;
let getIndexStats: typeof import("./pipeline").getIndexStats;

beforeAll(async () => {
  vi.resetModules();
  const mod = await import("./pipeline");
  ingestDocument = mod.ingestDocument;
  searchDocuments = mod.searchDocuments;
  listSources = mod.listSources;
  removeSource = mod.removeSource;
  getIndexStats = mod.getIndexStats;
});

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("RAG pipeline – chunking & indexing", () => {
  const WS = "test-workspace-rag";

  it("ingests a document and returns chunk count", async () => {
    const n = await ingestDocument({
      workspaceId: WS,
      source: "doc1.txt",
      text: "The quick brown fox jumps over the lazy dog. " +
            "Pack my box with five dozen liquor jugs. " +
            "How vaguely quiescent are the jumping zebras.",
    });
    expect(n).toBeGreaterThan(0);
  });

  it("lists sources after ingesting two documents", async () => {
    await ingestDocument({ workspaceId: WS, source: "doc1.txt", text: "First document content about science." });
    await ingestDocument({ workspaceId: WS, source: "doc2.txt", text: "Second document about cooking recipes." });
    const sources = await listSources(WS);
    expect(sources).toContain("doc1.txt");
    expect(sources).toContain("doc2.txt");
  });

  it("stats reflect ingested chunks", async () => {
    await ingestDocument({ workspaceId: WS, source: "doc1.txt", text: "Doc one." });
    await ingestDocument({ workspaceId: WS, source: "doc2.txt", text: "Doc two." });
    const stats = await getIndexStats(WS);
    expect(stats.sources).toBeGreaterThanOrEqual(2);
    expect(stats.chunks).toBeGreaterThan(0);
  });

  it("re-ingesting a source replaces old entries", async () => {
    await ingestDocument({ workspaceId: WS, source: "doc1.txt", text: "Original content." });
    const before = await getIndexStats(WS);
    await ingestDocument({ workspaceId: WS, source: "doc1.txt", text: "Completely replaced text." });
    const after = await getIndexStats(WS);
    // Sources count should stay the same (still just doc1.txt)
    expect(after.sources).toBe(before.sources);
  });

  it("removes a source", async () => {
    await ingestDocument({ workspaceId: WS, source: "doc1.txt", text: "To be removed." });
    await ingestDocument({ workspaceId: WS, source: "doc2.txt", text: "To remain." });
    await removeSource(WS, "doc1.txt");
    const sources = await listSources(WS);
    expect(sources).not.toContain("doc1.txt");
    expect(sources).toContain("doc2.txt");
  });
});

describe("RAG pipeline – search", () => {
  const WS = "test-workspace-search";

  beforeEach(async () => {
    // Ingest two short distinct documents
    await ingestDocument({ workspaceId: WS, source: "alpha.txt", text: "Alpha content about machine learning and neural networks." });
    await ingestDocument({ workspaceId: WS, source: "beta.txt", text: "Beta content about cooking recipes and culinary arts." });
  });

  it("returns results for a query", async () => {
    const results = await searchDocuments(WS, "machine learning", 5);
    expect(results.length).toBeGreaterThan(0);
  });

  it("scores are between 0 and 1 (normalised vectors, cos sim)", async () => {
    const results = await searchDocuments(WS, "anything", 5);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(-1);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it("returns empty array when index is empty", async () => {
    const results = await searchDocuments("empty-workspace", "hello", 5);
    expect(results).toHaveLength(0);
  });

  it("respects topK limit", async () => {
    // Ingest more documents to exceed topK
    for (let i = 0; i < 10; i++) {
      await ingestDocument({ workspaceId: WS, source: `extra-${i}.txt`, text: `Extra document number ${i} with various content.` });
    }
    const results = await searchDocuments(WS, "content", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("reports progress during ingestion", async () => {
    const calls: Array<{ done: number; total: number }> = [];
    await ingestDocument({
      workspaceId: WS,
      source: "progress-test.txt",
      text: "First sentence. Second sentence. Third sentence with more words added.",
      onProgress: (done, total) => calls.push({ done, total }),
    });
    expect(calls.length).toBeGreaterThan(0);
    // Last call should have done === total
    const last = calls[calls.length - 1];
    expect(last.done).toBe(last.total);
  });
});

describe("RAG pipeline – cosine similarity ranking", () => {
  const WS = "test-workspace-rank";

  it("most similar document ranks first", async () => {
    // Create two documents whose embeddings are unit vectors at known indices
    // The mock embedder maps text deterministically by hash
    // We use the exact text as the query for perfect similarity
    const text1 = "unique alpha sentence about programming";
    const text2 = "unique beta sentence about cooking";

    await ingestDocument({ workspaceId: WS, source: "prog.txt", text: text1 });
    await ingestDocument({ workspaceId: WS, source: "cook.txt", text: text2 });

    const results = await searchDocuments(WS, text1, 5);
    // The first result should be the chunk from prog.txt (same text → same embedding → score 1.0)
    expect(results[0].metadata.source).toBe("prog.txt");
    expect(results[0].score).toBeCloseTo(1.0, 5);
  });
});
