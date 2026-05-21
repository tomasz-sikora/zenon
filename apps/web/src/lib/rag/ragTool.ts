/**
 * RAG search tool — registered in the tool registry.
 * Agents call this to retrieve relevant document chunks from the workspace vector index.
 * Includes automatic text-search fallback when embedding model is unavailable.
 */

import { toolRegistry } from "@/lib/tools/registry";
import { searchDocuments, queryCsvTable, listCsvTables } from "./pipeline";

toolRegistry.register({
  name: "rag_search",
  description:
    "Search the workspace knowledge base (RAG index) for documents relevant to a query. " +
    "Returns the most semantically similar text chunks from uploaded documents. " +
    "Falls back to keyword-based text search if the embedding model is unavailable. " +
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
  execute: async (args: Record<string, unknown>) => {
    const query = args["query"] as string;
    const workspaceId = args["workspace_id"] as string;
    const topK = (args["top_k"] as number | undefined) ?? 5;

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

toolRegistry.register({
  name: "query_csv_table",
  description:
    "Query a CSV file that has been ingested as a table in the workspace. " +
    "Supports filtering by column with operators: =, !=, >, <, >=, <=, LIKE. " +
    "Use list_csv_tables first to see available tables and their columns.",
  inputSchema: {
    type: "object",
    properties: {
      workspace_id: {
        type: "string",
        description: "The workspace ID",
      },
      table_name: {
        type: "string",
        description: "The table name (derived from CSV filename, e.g. 'sales_data' for sales_data.csv)",
      },
      filter_column: {
        type: "string",
        description: "Column name to filter on (optional)",
      },
      filter_operator: {
        type: "string",
        description: "Filter operator: =, !=, >, <, >=, <=, LIKE (optional)",
      },
      filter_value: {
        type: "string",
        description: "Value to filter against (optional)",
      },
      limit: {
        type: "number",
        description: "Max rows to return (default: 100)",
        default: 100,
      },
    },
    required: ["workspace_id", "table_name"],
  },
  execute: async (args: Record<string, unknown>) => {
    const workspaceId = args["workspace_id"] as string;
    const tableName = args["table_name"] as string;
    const limit = (args["limit"] as number | undefined) ?? 100;

    const filter = args["filter_column"]
      ? {
          column: args["filter_column"] as string,
          operator: (args["filter_operator"] as string) ?? "=",
          value: (args["filter_value"] as string) ?? "",
        }
      : undefined;

    const result = await queryCsvTable(workspaceId, tableName, filter, limit);
    return { ...result, rowCount: result.rows.length };
  },
});

toolRegistry.register({
  name: "list_csv_tables",
  description:
    "List all CSV files that have been ingested as queryable tables in a workspace. " +
    "Shows table names, columns, and row counts.",
  inputSchema: {
    type: "object",
    properties: {
      workspace_id: {
        type: "string",
        description: "The workspace ID",
      },
    },
    required: ["workspace_id"],
  },
  execute: async (args: Record<string, unknown>) => {
    const workspaceId = args["workspace_id"] as string;
    const tables = await listCsvTables(workspaceId);
    if (tables.length === 0) {
      return { tables: [], message: "No CSV tables found. Upload a CSV with SQL mode enabled." };
    }
    return { tables };
  },
});
