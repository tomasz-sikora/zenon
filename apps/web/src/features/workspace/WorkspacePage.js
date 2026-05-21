import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { FolderOpen, File, FileText, Image, FileSpreadsheet, Upload, Download, Trash2, RefreshCw, ChevronRight, Home, FolderPlus, Eye, Search, } from "lucide-react";
import { listDir, writeFile, readFileBlob, deleteFile, deleteDir, ensureDir } from "@/lib/storage/opfs";
import { workspacePaths } from "@/lib/storage/workspace";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { toast } from "@/components/ui/Toaster";
function fileIcon(entry) {
    if (entry.kind === "directory")
        return _jsx(FolderOpen, { className: "h-4 w-4 text-amber-500" });
    const mime = entry.mimeType ?? "";
    if (mime.startsWith("image/"))
        return _jsx(Image, { className: "h-4 w-4 text-green-500" });
    if (mime.includes("pdf"))
        return _jsx(FileText, { className: "h-4 w-4 text-red-500" });
    if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv")
        return _jsx(FileSpreadsheet, { className: "h-4 w-4 text-emerald-500" });
    if (mime.startsWith("text/"))
        return _jsx(FileText, { className: "h-4 w-4 text-blue-400" });
    return _jsx(File, { className: "h-4 w-4 text-muted-foreground" });
}
function formatSize(bytes) {
    if (bytes === undefined)
        return "";
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatDate(ms) {
    if (!ms)
        return "";
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
export default function WorkspacePage() {
    const { id: wsId } = useParams();
    const { workspaces, currentWorkspaceId, setCurrentWorkspace } = useWorkspaceStore();
    const activeId = wsId ?? currentWorkspaceId ?? workspaces[0]?.id;
    const workspace = workspaces.find((w) => w.id === activeId);
    const [currentPath, setCurrentPath] = useState("");
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewText, setPreviewText] = useState(null);
    const [search, setSearch] = useState("");
    const [newFolderName, setNewFolderName] = useState("");
    const [showNewFolder, setShowNewFolder] = useState(false);
    const fileInputRef = useRef(null);
    const rootPath = activeId ? workspacePaths.files(activeId) : null;
    const loadDir = useCallback(async (path) => {
        if (!path)
            return;
        setLoading(true);
        setSelected(null);
        setPreviewUrl(null);
        setPreviewText(null);
        try {
            const list = await listDir(path);
            setEntries(list);
            setCurrentPath(path);
        }
        catch (e) {
            toast.error("Failed to load directory", String(e));
            setEntries([]);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        if (rootPath) {
            ensureDir(rootPath).then(() => loadDir(rootPath));
        }
    }, [rootPath, loadDir]);
    // Auto-refresh every 5 seconds so files created by agents appear without manual refresh
    useEffect(() => {
        if (!rootPath)
            return;
        const id = setInterval(() => {
            if (!loading)
                loadDir(currentPath || rootPath);
        }, 5000);
        return () => clearInterval(id);
    }, [rootPath, currentPath, loading, loadDir]);
    useEffect(() => {
        if (activeId)
            setCurrentWorkspace(activeId);
    }, [activeId, setCurrentWorkspace]);
    const breadcrumbs = () => {
        if (!rootPath || !currentPath)
            return [];
        const parts = currentPath.slice(rootPath.length).split("/").filter(Boolean);
        const crumbs = [{ label: workspace?.name ?? "Files", path: rootPath }];
        let acc = rootPath;
        for (const part of parts) {
            acc += "/" + part;
            crumbs.push({ label: part, path: acc });
        }
        return crumbs;
    };
    const openEntry = async (entry) => {
        if (entry.kind === "directory") {
            loadDir(entry.path);
            return;
        }
        setSelected(entry);
        setPreviewUrl(null);
        setPreviewText(null);
        const mime = entry.mimeType ?? "";
        try {
            const blob = await readFileBlob(entry.path);
            if (mime.startsWith("image/")) {
                setPreviewUrl(URL.createObjectURL(blob));
            }
            else if (mime.startsWith("text/") || mime.includes("json")) {
                setPreviewText((await blob.text()).slice(0, 50000));
            }
            else if (mime === "application/pdf") {
                setPreviewUrl(URL.createObjectURL(blob));
            }
        }
        catch {
            /* no preview */
        }
    };
    const handleUpload = async (files) => {
        if (!files || !currentPath)
            return;
        for (const file of files) {
            await writeFile(`${currentPath}/${file.name}`, await file.arrayBuffer());
            toast.success(`Uploaded ${file.name}`);
        }
        loadDir(currentPath);
    };
    const handleDownload = async (entry) => {
        if (entry.kind === "directory")
            return;
        const blob = await readFileBlob(entry.path);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = entry.name;
        a.click();
        URL.revokeObjectURL(url);
    };
    const handleDelete = async (entry) => {
        if (!confirm(`Delete "${entry.name}"?`))
            return;
        try {
            entry.kind === "directory" ? await deleteDir(entry.path, true) : await deleteFile(entry.path);
            if (selected?.path === entry.path)
                setSelected(null);
            toast.success(`Deleted ${entry.name}`);
            loadDir(currentPath);
        }
        catch (e) {
            toast.error("Delete failed", String(e));
        }
    };
    const handleCreateFolder = async () => {
        if (!newFolderName.trim() || !currentPath)
            return;
        await ensureDir(`${currentPath}/${newFolderName.trim()}`);
        setNewFolderName("");
        setShowNewFolder(false);
        toast.success(`Created folder ${newFolderName}`);
        loadDir(currentPath);
    };
    const filteredEntries = search
        ? entries.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
        : entries;
    if (!activeId) {
        return (_jsx("div", { className: "flex items-center justify-center h-full text-muted-foreground", children: _jsxs("div", { className: "text-center", children: [_jsx(FolderOpen, { className: "h-12 w-12 mx-auto mb-3 opacity-40" }), _jsx("p", { className: "font-medium", children: "No workspace selected" })] }) }));
    }
    const crumbs = breadcrumbs();
    return (_jsxs("div", { className: "flex flex-col h-full overflow-hidden", children: [_jsxs("div", { className: "flex-none border-b border-border px-4 py-2 flex items-center gap-2 flex-wrap", children: [_jsx("nav", { className: "flex items-center gap-1 text-sm flex-1 min-w-0 overflow-x-auto", children: crumbs.map((crumb, i) => (_jsxs("span", { className: "flex items-center gap-1 shrink-0", children: [i > 0 && _jsx(ChevronRight, { className: "h-3 w-3 text-muted-foreground" }), _jsx("button", { onClick: () => loadDir(crumb.path), className: "hover:text-foreground text-muted-foreground transition-colors", children: i === 0 ? _jsx(Home, { className: "h-3.5 w-3.5" }) : crumb.label })] }, crumb.path))) }), _jsxs("div", { className: "relative", children: [_jsx(Search, { className: "absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" }), _jsx("input", { className: "pl-7 pr-2 py-1 text-xs rounded border border-border bg-background w-32 focus:outline-none focus:ring-1 focus:ring-ring", placeholder: "Filter...", value: search, onChange: (e) => setSearch(e.target.value) })] }), _jsxs("button", { onClick: () => fileInputRef.current?.click(), className: "flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-accent transition-colors", children: [_jsx(Upload, { className: "h-3.5 w-3.5" }), " Upload"] }), _jsx("input", { ref: fileInputRef, type: "file", multiple: true, className: "hidden", onChange: (e) => handleUpload(e.target.files) }), _jsx("button", { onClick: () => setShowNewFolder(!showNewFolder), className: "p-1 rounded hover:bg-accent transition-colors", title: "New folder", children: _jsx(FolderPlus, { className: "h-3.5 w-3.5" }) }), _jsx("button", { onClick: () => loadDir(currentPath), className: "p-1 rounded hover:bg-accent transition-colors", children: _jsx(RefreshCw, { className: `h-3.5 w-3.5 ${loading ? "animate-spin" : ""}` }) })] }), showNewFolder && (_jsxs("div", { className: "flex-none flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30", children: [_jsx("input", { autoFocus: true, className: "flex-1 text-sm bg-transparent focus:outline-none border-b border-border", placeholder: "New folder name...", value: newFolderName, onChange: (e) => setNewFolderName(e.target.value), onKeyDown: (e) => { if (e.key === "Enter")
                            handleCreateFolder(); if (e.key === "Escape")
                            setShowNewFolder(false); } }), _jsx("button", { onClick: handleCreateFolder, className: "text-xs px-2 py-1 bg-primary text-primary-foreground rounded", children: "Create" })] })), _jsxs("div", { className: "flex-1 flex overflow-hidden", children: [_jsx("div", { className: "flex-1 overflow-y-auto", onDragOver: (e) => e.preventDefault(), onDrop: (e) => { e.preventDefault(); handleUpload(e.dataTransfer.files); }, children: filteredEntries.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center h-full text-muted-foreground py-12", children: [_jsx(Upload, { className: "h-8 w-8 mb-3 opacity-40" }), _jsx("p", { className: "text-sm font-medium", children: "Drop files here or click Upload" })] })) : (_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "border-b border-border sticky top-0 bg-background z-10", children: _jsxs("tr", { className: "text-muted-foreground text-xs", children: [_jsx("th", { className: "text-left px-4 py-2 font-medium", children: "Name" }), _jsx("th", { className: "text-left px-4 py-2 font-medium", children: "Size" }), _jsx("th", { className: "text-left px-4 py-2 font-medium hidden md:table-cell", children: "Modified" }), _jsx("th", { className: "px-4 py-2" })] }) }), _jsx("tbody", { children: filteredEntries.map((entry) => (_jsxs("tr", { className: `border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors ${selected?.path === entry.path ? "bg-accent/40" : ""}`, onClick: () => openEntry(entry), children: [_jsx("td", { className: "px-4 py-2", children: _jsxs("span", { className: "flex items-center gap-2", children: [fileIcon(entry), _jsx("span", { className: "truncate max-w-[200px]", children: entry.name })] }) }), _jsx("td", { className: "px-4 py-2 text-muted-foreground text-xs", children: entry.kind === "file" ? formatSize(entry.size) : "—" }), _jsx("td", { className: "px-4 py-2 text-muted-foreground text-xs hidden md:table-cell", children: formatDate(entry.lastModified) }), _jsx("td", { className: "px-4 py-2", children: _jsxs("span", { className: "flex items-center gap-1 justify-end", children: [entry.kind === "file" && (_jsx("button", { onClick: (e) => { e.stopPropagation(); handleDownload(entry); }, className: "p-1 hover:bg-accent rounded", title: "Download", children: _jsx(Download, { className: "h-3.5 w-3.5" }) })), _jsx("button", { onClick: (e) => { e.stopPropagation(); handleDelete(entry); }, className: "p-1 hover:bg-destructive/20 text-destructive rounded", title: "Delete", children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] }) })] }, entry.path))) })] })) }), selected && (_jsxs("div", { className: "w-72 border-l border-border flex flex-col shrink-0 overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30", children: [_jsx("span", { className: "text-xs font-medium truncate", children: selected.name }), _jsx("button", { onClick: () => setSelected(null), className: "text-muted-foreground hover:text-foreground text-xs ml-2", children: "\u2715" })] }), _jsxs("div", { className: "flex-1 overflow-auto p-3", children: [previewUrl && selected.mimeType?.startsWith("image/") && _jsx("img", { src: previewUrl, alt: selected.name, className: "max-w-full rounded" }), previewUrl && selected.mimeType === "application/pdf" && _jsx("iframe", { src: previewUrl, className: "w-full h-[400px] rounded", title: selected.name }), previewText !== null && _jsx("pre", { className: "text-xs font-mono whitespace-pre-wrap break-all", children: previewText }), !previewUrl && previewText === null && (_jsxs("div", { className: "flex flex-col items-center justify-center h-32 text-muted-foreground", children: [_jsx(Eye, { className: "h-6 w-6 mb-2 opacity-40" }), _jsx("p", { className: "text-xs", children: "No preview" })] })), _jsxs("div", { className: "mt-4 space-y-1 text-xs text-muted-foreground border-t border-border pt-3", children: [_jsxs("p", { children: [_jsx("span", { className: "font-medium", children: "Size:" }), " ", formatSize(selected.size)] }), _jsxs("p", { children: [_jsx("span", { className: "font-medium", children: "Type:" }), " ", selected.mimeType ?? "unknown"] }), _jsxs("p", { children: [_jsx("span", { className: "font-medium", children: "Modified:" }), " ", formatDate(selected.lastModified)] })] })] }), _jsx("div", { className: "flex-none border-t border-border p-2", children: _jsxs("button", { onClick: () => handleDownload(selected), className: "w-full flex items-center justify-center gap-2 text-xs py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90", children: [_jsx(Download, { className: "h-3.5 w-3.5" }), " Download"] }) })] }))] })] }));
}
