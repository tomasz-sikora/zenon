import { useState, useEffect, useRef } from "react";
import { BookOpen, Upload, Trash2, RefreshCw, Search, FileText, AlertCircle, CheckCircle, Database, Settings2 } from "lucide-react";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useRagStore } from "@/store/ragStore";
import { ingestDocument, listSources, removeSource, getIndexStats, searchDocuments, ingestCsvAsTable, listCsvTables, removeCsvTable } from "@/lib/rag/pipeline";
import type { SearchResult, CsvTableMeta } from "@/lib/rag/pipeline";
import { readFileBlob } from "@/lib/storage/opfs";
import { toast } from "@/components/ui/Toaster";
import { useNavigate } from "react-router-dom";

async function extractText(file: File): Promise<string> {
  const text = await file.text();
  // For text-based files just return content
  if (file.type.startsWith("text/") || file.name.endsWith(".md") || file.name.endsWith(".txt")) {
    return text;
  }
  // For other types we return raw text (PDF.js / mammoth integration in Phase 8)
  return text;
}

function isCsvFile(filename: string): boolean {
  return filename.toLowerCase().endsWith(".csv");
}

export default function RagPage() {
  const { workspaces, currentWorkspaceId } = useWorkspaceStore();
  const { chunking, csvHandling, embeddingModelId } = useRagStore();
  const navigate = useNavigate();
  const wsId = currentWorkspaceId ?? workspaces[0]?.id;

  const [sources, setSources] = useState<string[]>([]);
  const [csvTables, setCsvTables] = useState<CsvTableMeta[]>([]);
  const [stats, setStats] = useState<{ chunks: number; sources: number } | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    if (!wsId) return;
    const [srcs, st, tables] = await Promise.all([
      listSources(wsId),
      getIndexStats(wsId),
      listCsvTables(wsId),
    ]);
    setSources(srcs);
    setStats(st);
    setCsvTables(tables);
  };

  useEffect(() => { reload(); }, [wsId]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || !wsId) return;
    setIngesting(true);
    for (const file of files) {
      try {
        const text = await extractText(file);
        if (!text.trim()) { toast.error(`${file.name} has no extractable text`); continue; }

        // CSV files in SQL mode → store as table
        if (isCsvFile(file.name) && csvHandling === "sql") {
          const meta = await ingestCsvAsTable(wsId, file.name, text);
          toast.success(`Stored ${file.name} as table "${meta.tableName}" (${meta.rowCount} rows)`);
          continue;
        }

        await ingestDocument({
          workspaceId: wsId,
          source: file.name,
          text,
          chunkSize: chunking.chunkSize,
          overlap: chunking.overlap,
          embeddingModelId,
          onProgress: (done, total) => setProgress({ done, total }),
        });
        toast.success(`Indexed ${file.name}`);
      } catch (e) {
        toast.error(`Failed to index ${file.name}`, String(e));
      }
    }
    setIngesting(false);
    setProgress(null);
    reload();
  };

  const handleRemove = async (source: string) => {
    if (!wsId || !confirm(`Remove "${source}" from the knowledge base?`)) return;
    await removeSource(wsId, source);
    toast.success(`Removed ${source}`);
    reload();
  };

  const handleRemoveTable = async (tableName: string) => {
    if (!wsId || !confirm(`Remove table "${tableName}"?`)) return;
    await removeCsvTable(wsId, tableName);
    toast.success(`Removed table ${tableName}`);
    reload();
  };

  const handleSearch = async () => {
    if (!query.trim() || !wsId) return;
    setSearching(true);
    try {
      const r = await searchDocuments(wsId, query, 5);
      setResults(r);
    } catch (e) {
      toast.error("Search failed", String(e));
    } finally {
      setSearching(false);
    }
  };

  if (!wsId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No workspace selected</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">Upload documents to create a searchable RAG index</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => navigate("/settings", { state: { tab: "rag" } })}
            className="p-1.5 rounded hover:bg-accent"
            title="RAG Settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button onClick={reload} className="p-1.5 rounded hover:bg-accent">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Config summary */}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="px-2 py-0.5 rounded bg-muted">Model: {embeddingModelId?.split("/").pop() ?? "default"}</span>
        <span className="px-2 py-0.5 rounded bg-muted">Chunks: {chunking.chunkSize} / {chunking.overlap}</span>
        <span className="px-2 py-0.5 rounded bg-muted">CSV: {csvHandling === "sql" ? "SQL" : "Chunks"}</span>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="border border-border rounded-lg p-3">
            <p className="text-2xl font-bold">{stats.sources}</p>
            <p className="text-sm text-muted-foreground">Documents</p>
          </div>
          <div className="border border-border rounded-lg p-3">
            <p className="text-2xl font-bold">{stats.chunks}</p>
            <p className="text-sm text-muted-foreground">Indexed chunks</p>
          </div>
          <div className="border border-border rounded-lg p-3">
            <p className="text-2xl font-bold">{csvTables.length}</p>
            <p className="text-sm text-muted-foreground">SQL tables</p>
          </div>
        </div>
      )}

      {/* Upload */}
      <div
        className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="font-medium">Upload documents to index</p>
        <p className="text-sm text-muted-foreground mt-1">
          TXT, MD, CSV, JSON • PDF and DOCX support coming soon
          {csvHandling === "sql" && " • CSV files will be stored as SQL tables"}
        </p>
        {ingesting && progress && (
          <div className="mt-3">
            <div className="w-full bg-muted rounded-full h-1.5">
              <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Embedding chunk {progress.done}/{progress.total}…</p>
          </div>
        )}
        {ingesting && !progress && <p className="text-xs text-muted-foreground mt-2">Processing…</p>}
      </div>
      <input ref={fileInputRef} type="file" multiple className="hidden" accept=".txt,.md,.csv,.json,.html"
        onChange={(e) => handleUpload(e.target.files)} />

      {/* CSV Tables */}
      {csvTables.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" /> SQL Tables
          </h2>
          <div className="space-y-1">
            {csvTables.map((table) => (
              <div key={table.tableName} className="flex items-center gap-2 px-3 py-2 rounded hover:bg-muted/40 group">
                <Database className="h-4 w-4 text-blue-500 shrink-0" />
                <span className="text-sm font-mono">{table.tableName}</span>
                <span className="text-xs text-muted-foreground">
                  {table.rowCount} rows · {table.columns.length} cols
                </span>
                <span className="text-xs text-muted-foreground truncate ml-auto mr-2" title={table.columns.join(", ")}>
                  ({table.columns.slice(0, 4).join(", ")}{table.columns.length > 4 ? "…" : ""})
                </span>
                <button onClick={() => handleRemoveTable(table.tableName)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-all" title="Remove">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sources list */}
      {sources.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Indexed documents</h2>
          <div className="space-y-1">
            {sources.map((src) => (
              <div key={src} className="flex items-center gap-2 px-3 py-2 rounded hover:bg-muted/40 group">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm truncate">{src}</span>
                <button onClick={() => handleRemove(src)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-all" title="Remove">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test search */}
      <div>
        <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Test search</h2>
        <div className="flex gap-2">
          <input
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Ask a question to test retrieval…"
            value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button onClick={handleSearch} disabled={searching || !query.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
            {searching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Search
          </button>
        </div>
        {results.length > 0 && (
          <div className="mt-3 space-y-2">
            {results.map((r, i) => (
              <div key={r.id} className="border border-border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                  <span className="text-xs text-muted-foreground">{r.metadata.source}</span>
                  <span className="ml-auto text-xs font-mono text-green-600">{(r.score * 100).toFixed(1)}%</span>
                </div>
                <p className="text-sm">{r.text.slice(0, 300)}{r.text.length > 300 ? "…" : ""}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
