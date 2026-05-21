/**
 * RAG search tool — registered in the tool registry.
 * Agents call this to retrieve relevant document chunks from the workspace vector index.
 */
import { toolRegistry } from "@/lib/tools/registry";
import { searchDocuments } from "./pipeline";
toolRegistry.register({
    name: "rag_search",
    description: "Search the workspace knowledge base (RAG index) for documents relevant to a query. " +
        "Returns the most semantically similar text chunks from uploaded documents. " +
        "Use this before answering questions about documents, files, or uploaded knowledge.",
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "The search query or question to find relevant documents for",
            },
            workspace_id: {
                type: "string",
                description: "The workspace ID to search in",
            },
            top_k: {
                type: "number",
                description: "Number of results to return (default: 5)",
                default: 5,
            },
        },
        required: ["query", "workspace_id"],
    },
    execute: async (args) => {
        const query = args["query"];
        const workspaceId = args["workspace_id"];
        const topK = args["top_k"] ?? 5;
        const results = await searchDocuments(workspaceId, query, topK);
        if (results.length === 0) {
            return { results: [], message: "No relevant documents found in the knowledge base." };
        }
        return {
            results: results.map((r) => ({
                text: r.text,
                source: r.metadata.source,
                score: Math.round(r.score * 100) / 100,
                chunk: r.metadata.chunkIndex,
            })),
            count: results.length,
        };
    },
});
