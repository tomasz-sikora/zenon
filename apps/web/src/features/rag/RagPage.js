import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from "react";
import { BookOpen, Upload, Trash2, RefreshCw, Search, FileText, CheckCircle } from "lucide-react";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { ingestDocument, listSources, removeSource, getIndexStats, searchDocuments } from "@/lib/rag/pipeline";
import { toast } from "@/components/ui/Toaster";
async function extractText(file) {
    const text = await file.text();
    // For text-based files just return content
    if (file.type.startsWith("text/") || file.name.endsWith(".md") || file.name.endsWith(".txt")) {
        return text;
    }
    // For other types we return raw text (PDF.js / mammoth integration in Phase 8)
    return text;
}
export default function RagPage() {
    const { workspaces, currentWorkspaceId } = useWorkspaceStore();
    const wsId = currentWorkspaceId ?? workspaces[0]?.id;
    const [sources, setSources] = useState([]);
    const [stats, setStats] = useState(null);
    const [ingesting, setIngesting] = useState(false);
    const [progress, setProgress] = useState(null);
    const [query, setQuery] = useState("");
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState([]);
    const fileInputRef = useRef(null);
    const reload = async () => {
        if (!wsId)
            return;
        const [srcs, st] = await Promise.all([listSources(wsId), getIndexStats(wsId)]);
        setSources(srcs);
        setStats(st);
    };
    useEffect(() => { reload(); }, [wsId]);
    const handleUpload = async (files) => {
        if (!files || !wsId)
            return;
        setIngesting(true);
        for (const file of files) {
            try {
                const text = await extractText(file);
                if (!text.trim()) {
                    toast.error(`${file.name} has no extractable text`);
                    continue;
                }
                await ingestDocument({
                    workspaceId: wsId,
                    source: file.name,
                    text,
                    onProgress: (done, total) => setProgress({ done, total }),
                });
                toast.success(`Indexed ${file.name}`);
            }
            catch (e) {
                toast.error(`Failed to index ${file.name}`, String(e));
            }
        }
        setIngesting(false);
        setProgress(null);
        reload();
    };
    const handleRemove = async (source) => {
        if (!wsId || !confirm(`Remove "${source}" from the knowledge base?`))
            return;
        await removeSource(wsId, source);
        toast.success(`Removed ${source}`);
        reload();
    };
    const handleSearch = async () => {
        if (!query.trim() || !wsId)
            return;
        setSearching(true);
        try {
            const r = await searchDocuments(wsId, query, 5);
            setResults(r);
        }
        catch (e) {
            toast.error("Search failed", String(e));
        }
        finally {
            setSearching(false);
        }
    };
    if (!wsId) {
        return (_jsx("div", { className: "flex items-center justify-center h-full text-muted-foreground", children: _jsx("p", { children: "No workspace selected" }) }));
    }
    return (_jsxs("div", { className: "max-w-3xl mx-auto px-4 py-6 space-y-6", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(BookOpen, { className: "h-6 w-6 text-primary" }), _jsxs("div", { children: [_jsx("h1", { className: "text-xl font-semibold", children: "Knowledge Base" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Upload documents to create a searchable RAG index" })] }), _jsx("button", { onClick: reload, className: "ml-auto p-1.5 rounded hover:bg-accent", children: _jsx(RefreshCw, { className: "h-4 w-4" }) })] }), stats && (_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { className: "border border-border rounded-lg p-3", children: [_jsx("p", { className: "text-2xl font-bold", children: stats.sources }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Documents" })] }), _jsxs("div", { className: "border border-border rounded-lg p-3", children: [_jsx("p", { className: "text-2xl font-bold", children: stats.chunks }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Indexed chunks" })] })] })), _jsxs("div", { className: "border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer", onClick: () => fileInputRef.current?.click(), onDragOver: (e) => e.preventDefault(), onDrop: (e) => { e.preventDefault(); handleUpload(e.dataTransfer.files); }, children: [_jsx(Upload, { className: "h-8 w-8 mx-auto mb-2 text-muted-foreground" }), _jsx("p", { className: "font-medium", children: "Upload documents to index" }), _jsx("p", { className: "text-sm text-muted-foreground mt-1", children: "TXT, MD, CSV, JSON \u2022 PDF and DOCX support coming soon" }), ingesting && progress && (_jsxs("div", { className: "mt-3", children: [_jsx("div", { className: "w-full bg-muted rounded-full h-1.5", children: _jsx("div", { className: "bg-primary h-1.5 rounded-full transition-all", style: { width: `${(progress.done / progress.total) * 100}%` } }) }), _jsxs("p", { className: "text-xs text-muted-foreground mt-1", children: ["Embedding chunk ", progress.done, "/", progress.total, "\u2026"] })] })), ingesting && !progress && _jsx("p", { className: "text-xs text-muted-foreground mt-2", children: "Processing\u2026" })] }), _jsx("input", { ref: fileInputRef, type: "file", multiple: true, className: "hidden", accept: ".txt,.md,.csv,.json,.html", onChange: (e) => handleUpload(e.target.files) }), sources.length > 0 && (_jsxs("div", { children: [_jsx("h2", { className: "text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide", children: "Indexed documents" }), _jsx("div", { className: "space-y-1", children: sources.map((src) => (_jsxs("div", { className: "flex items-center gap-2 px-3 py-2 rounded hover:bg-muted/40 group", children: [_jsx(CheckCircle, { className: "h-4 w-4 text-green-500 shrink-0" }), _jsx(FileText, { className: "h-4 w-4 text-muted-foreground shrink-0" }), _jsx("span", { className: "flex-1 text-sm truncate", children: src }), _jsx("button", { onClick: () => handleRemove(src), className: "opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-all", title: "Remove", children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] }, src))) })] })), _jsxs("div", { children: [_jsx("h2", { className: "text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide", children: "Test search" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { className: "flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring", placeholder: "Ask a question to test retrieval\u2026", value: query, onChange: (e) => setQuery(e.target.value), onKeyDown: (e) => e.key === "Enter" && handleSearch() }), _jsxs("button", { onClick: handleSearch, disabled: searching || !query.trim(), className: "px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1", children: [searching ? _jsx(RefreshCw, { className: "h-3.5 w-3.5 animate-spin" }) : _jsx(Search, { className: "h-3.5 w-3.5" }), "Search"] })] }), results.length > 0 && (_jsx("div", { className: "mt-3 space-y-2", children: results.map((r, i) => (_jsxs("div", { className: "border border-border rounded-lg p-3", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsxs("span", { className: "text-xs font-medium text-muted-foreground", children: ["#", i + 1] }), _jsx("span", { className: "text-xs text-muted-foreground", children: r.metadata.source }), _jsxs("span", { className: "ml-auto text-xs font-mono text-green-600", children: [(r.score * 100).toFixed(1), "%"] })] }), _jsxs("p", { className: "text-sm", children: [r.text.slice(0, 300), r.text.length > 300 ? "…" : ""] })] }, r.id))) }))] })] }));
}
