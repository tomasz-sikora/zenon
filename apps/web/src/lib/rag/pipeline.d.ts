/**
 * RAG (Retrieval-Augmented Generation) pipeline.
 * Handles document ingestion, chunking, embedding, and retrieval.
 * Vector index is persisted to OPFS.
 */
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
export declare function ingestDocument(opts: IngestOptions): Promise<number>;
export declare function searchDocuments(workspaceId: string, query: string, topK?: number): Promise<SearchResult[]>;
export declare function listSources(workspaceId: string): Promise<string[]>;
export declare function removeSource(workspaceId: string, source: string): Promise<void>;
export declare function getIndexStats(workspaceId: string): Promise<{
    chunks: number;
    sources: number;
}>;
