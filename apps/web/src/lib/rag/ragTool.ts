/**
 * RAG search tool — registered in the tool registry.
 * Agents call this to retrieve relevant document chunks from the workspace vector index.
 * Includes automatic text-search fallback when embedding model is unavailable.
 */

import { readFileText, writeFile } from "@/lib/storage/opfs";
import { workspacePaths } from "@/lib/storage/workspace";
import { toolRegistry } from "@/lib/tools/registry";
import { ingestCsvAsTable, ingestDocument, listCsvTables, queryCsvTable, searchDocuments } from "./pipeline";

function csvEscape(value: string): string {
  return value.includes(",") || value.includes('"') || value.includes("\n")
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

toolRegistry.register({
  name: "rag_search",
  description:
    "Search workspace knowledge base for relevant document chunks. " +
    "Falls back to keyword search if embedding model is unavailable.",
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
  name: "load_file_to_rag",
  description:
    "Ingest a workspace file into the RAG knowledge base for semantic search. CSV files also become SQL-queryable tables.",
  inputSchema: {
    type: "object",
    properties: {
      workspace_id: { type: "string", description: "The workspace ID" },
      filename: {
        type: "string",
        description: "Filename within the workspace files directory (e.g. 'data.csv', 'notes.txt')",
      },
    },
    required: ["workspace_id", "filename"],
  },
  execute: async (args: Record<string, unknown>) => {
    const workspaceId = args["workspace_id"] as string;
    const filename = args["filename"] as string;
    const filePath = workspacePaths.file(workspaceId, filename);
    const text = await readFileText(filePath);
    if (!text.trim()) throw new Error("File is empty or has no text content");

    const results: Record<string, unknown> = {};

    if (filename.toLowerCase().endsWith(".csv")) {
      const meta = await ingestCsvAsTable(workspaceId, filename, text);
      results["sql_table"] = meta;
    }

    const chunks = await ingestDocument({ workspaceId, source: filename, text });
    results["chunks_indexed"] = chunks;
    results["source"] = filename;

    return results;
  },
});

toolRegistry.register({
  name: "query_csv_table",
  description:
    "Query an ingested CSV table with column filters. Use list_csv_tables first to see available tables.",
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
  name: "run_sql_query",
  description:
    "Run a SQL-like query (SELECT/WHERE/ORDER BY/LIMIT) on ingested CSV tables. Use list_csv_tables first.",
  inputSchema: {
    type: "object",
    properties: {
      workspace_id: { type: "string", description: "The workspace ID" },
      table_name: { type: "string", description: "Table name to query" },
      columns: {
        type: "array",
        items: { type: "string" },
        description: "Columns to select (default: all)",
      },
      where: {
        type: "object",
        description: "WHERE filter condition",
        properties: {
          column: { type: "string" },
          operator: { type: "string", description: "=, !=, >, <, >=, <=, LIKE" },
          value: { type: "string" },
        },
      },
      order_by: { type: "string", description: "Column to sort by" },
      order_direction: {
        type: "string",
        enum: ["asc", "desc"],
        description: "Sort direction (default: asc)",
      },
      limit: { type: "number", description: "Max rows (default: 100)" },
      export_csv: { type: "boolean", description: "If true, also export results as a CSV file in the workspace" },
      export_filename: { type: "string", description: "Filename for CSV export (default: query_result.csv)" },
    },
    required: ["workspace_id", "table_name"],
  },
  execute: async (args: Record<string, unknown>) => {
    const workspaceId = args["workspace_id"] as string;
    const tableName = args["table_name"] as string;
    const limit = (args["limit"] as number | undefined) ?? 100;
    const columns = args["columns"] as string[] | undefined;
    const orderBy = args["order_by"] as string | undefined;
    const orderDir = ((args["order_direction"] as string | undefined) ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";
    const exportCsv = args["export_csv"] as boolean | undefined;
    const exportFilename = (args["export_filename"] as string | undefined) ?? "query_result.csv";
    const where = args["where"] as { column: string; operator: string; value: string } | undefined;

    const tableMeta = (await listCsvTables(workspaceId)).find((table) => table.tableName === tableName);
    const fetchLimit = orderBy ? (tableMeta?.rowCount ?? limit) : limit;
    const result = await queryCsvTable(workspaceId, tableName, where, fetchLimit);
    let rows = result.rows;

    if (columns && columns.length > 0) {
      rows = rows.map((row) => {
        const filtered: Record<string, string> = {};
        for (const col of columns) {
          if (col in row) filtered[col] = row[col];
        }
        return filtered;
      });
    }

    if (orderBy) {
      rows = [...rows].sort((a, b) => {
        const va = a[orderBy] ?? "";
        const vb = b[orderBy] ?? "";
        const na = Number(va);
        const nb = Number(vb);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) {
          return orderDir === "desc" ? nb - na : na - nb;
        }
        return orderDir === "desc"
          ? String(vb).localeCompare(String(va))
          : String(va).localeCompare(String(vb));
      });
    }

    rows = rows.slice(0, limit);

    const selectedColumns = columns && columns.length > 0 ? columns : result.columns;
    const output: Record<string, unknown> = {
      columns: selectedColumns,
      rows,
      rowCount: rows.length,
    };

    if (exportCsv) {
      const csvLines = [selectedColumns.join(",")];
      for (const row of rows) {
        csvLines.push(selectedColumns.map((column) => csvEscape(row[column] ?? "")).join(","));
      }
      const exportPath = workspacePaths.file(workspaceId, exportFilename);
      await writeFile(exportPath, csvLines.join("\n"));
      output["exported_to"] = exportPath;
    }

    return output;
  },
});

toolRegistry.register({
  name: "list_csv_tables",
  description:
    "List all ingested CSV tables in a workspace with their columns and row counts.",
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
