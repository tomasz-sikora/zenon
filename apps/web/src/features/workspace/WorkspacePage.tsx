import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  FolderOpen,
  File,
  FileText,
  Image,
  FileSpreadsheet,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  ChevronRight,
  Home,
  FolderPlus,
  Eye,
  Search,
} from "lucide-react";
import { listDir, writeFile, readFileBlob, deleteFile, deleteDir, ensureDir } from "@/lib/storage/opfs";
import type { FileEntry } from "@/lib/storage/opfs";
import { workspacePaths } from "@/lib/storage/workspace";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { toast } from "@/components/ui/Toaster";

function fileIcon(entry: FileEntry) {
  if (entry.kind === "directory") return <FolderOpen className="h-4 w-4 text-amber-500" />;
  const mime = entry.mimeType ?? "";
  if (mime.startsWith("image/")) return <Image className="h-4 w-4 text-green-500" />;
  if (mime.includes("pdf")) return <FileText className="h-4 w-4 text-red-500" />;
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv")
    return <FileSpreadsheet className="h-4 w-4 text-emerald-500" />;
  if (mime.startsWith("text/")) return <FileText className="h-4 w-4 text-blue-400" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ms?: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function WorkspacePage() {
  const { id: wsId } = useParams<{ id: string }>();
  const { workspaces, currentWorkspaceId, setCurrentWorkspace } = useWorkspaceStore();

  const activeId = wsId ?? currentWorkspaceId ?? workspaces[0]?.id;
  const workspace = workspaces.find((w) => w.id === activeId);

  const [currentPath, setCurrentPath] = useState<string>("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const rootPath = activeId ? workspacePaths.files(activeId) : null;

  const loadDir = useCallback(async (path: string) => {
    if (!path) return;
    setLoading(true);
    setSelected(null);
    setPreviewUrl(null);
    setPreviewText(null);
    try {
      const list = await listDir(path);
      setEntries(list);
      setCurrentPath(path);
    } catch (e) {
      toast.error("Failed to load directory", String(e));
      setEntries([]);
    } finally {
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
    if (!rootPath) return;
    const id = setInterval(() => {
      if (!loading) loadDir(currentPath || rootPath);
    }, 5000);
    return () => clearInterval(id);
  }, [rootPath, currentPath, loading, loadDir]);

  useEffect(() => {
    if (activeId) setCurrentWorkspace(activeId);
  }, [activeId, setCurrentWorkspace]);

  const breadcrumbs = () => {
    if (!rootPath || !currentPath) return [];
    const parts = currentPath.slice(rootPath.length).split("/").filter(Boolean);
    const crumbs: { label: string; path: string }[] = [{ label: workspace?.name ?? "Files", path: rootPath }];
    let acc = rootPath;
    for (const part of parts) {
      acc += "/" + part;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  };

  const openEntry = async (entry: FileEntry) => {
    if (entry.kind === "directory") { loadDir(entry.path); return; }
    setSelected(entry);
    setPreviewUrl(null);
    setPreviewText(null);
    const mime = entry.mimeType ?? "";
    try {
      const blob = await readFileBlob(entry.path);
      if (mime.startsWith("image/")) {
        setPreviewUrl(URL.createObjectURL(blob));
      } else if (mime.startsWith("text/") || mime.includes("json")) {
        setPreviewText((await blob.text()).slice(0, 50000));
      } else if (mime === "application/pdf") {
        setPreviewUrl(URL.createObjectURL(blob));
      }
    } catch {
      /* no preview */
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || !currentPath) return;
    for (const file of files) {
      await writeFile(`${currentPath}/${file.name}`, await file.arrayBuffer());
      toast.success(`Uploaded ${file.name}`);
    }
    loadDir(currentPath);
  };

  const handleDownload = async (entry: FileEntry) => {
    if (entry.kind === "directory") return;
    const blob = await readFileBlob(entry.path);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = entry.name; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (entry: FileEntry) => {
    if (!confirm(`Delete "${entry.name}"?`)) return;
    try {
      entry.kind === "directory" ? await deleteDir(entry.path, true) : await deleteFile(entry.path);
      if (selected?.path === entry.path) setSelected(null);
      toast.success(`Deleted ${entry.name}`);
      loadDir(currentPath);
    } catch (e) {
      toast.error("Delete failed", String(e));
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentPath) return;
    await ensureDir(`${currentPath}/${newFolderName.trim()}`);
    setNewFolderName(""); setShowNewFolder(false);
    toast.success(`Created folder ${newFolderName}`);
    loadDir(currentPath);
  };

  const filteredEntries = search
    ? entries.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : entries;

  if (!activeId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No workspace selected</p>
        </div>
      </div>
    );
  }

  const crumbs = breadcrumbs();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b border-border px-4 py-2 flex items-center gap-2 flex-wrap">
        <nav className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-x-auto">
          {crumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <button onClick={() => loadDir(crumb.path)} className="hover:text-foreground text-muted-foreground transition-colors">
                {i === 0 ? <Home className="h-3.5 w-3.5" /> : crumb.label}
              </button>
            </span>
          ))}
        </nav>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            className="pl-7 pr-2 py-1 text-xs rounded border border-border bg-background w-32 focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Filter..." value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-accent transition-colors">
          <Upload className="h-3.5 w-3.5" /> Upload
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
        <button onClick={() => setShowNewFolder(!showNewFolder)} className="p-1 rounded hover:bg-accent transition-colors" title="New folder">
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => loadDir(currentPath)} className="p-1 rounded hover:bg-accent transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {showNewFolder && (
        <div className="flex-none flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
          <input autoFocus className="flex-1 text-sm bg-transparent focus:outline-none border-b border-border"
            placeholder="New folder name..." value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
          />
          <button onClick={handleCreateFolder} className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded">Create</button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* File list */}
        <div className="flex-1 overflow-y-auto" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}>
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
              <Upload className="h-8 w-8 mb-3 opacity-40" />
              <p className="text-sm font-medium">Drop files here or click Upload</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border sticky top-0 bg-background z-10">
                <tr className="text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Size</th>
                  <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Modified</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={entry.path}
                    className={`border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors ${selected?.path === entry.path ? "bg-accent/40" : ""}`}
                    onClick={() => openEntry(entry)}>
                    <td className="px-4 py-2"><span className="flex items-center gap-2">{fileIcon(entry)}<span className="truncate max-w-[200px]">{entry.name}</span></span></td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">{entry.kind === "file" ? formatSize(entry.size) : "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground text-xs hidden md:table-cell">{formatDate(entry.lastModified)}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-1 justify-end">
                        {entry.kind === "file" && (
                          <button onClick={(e) => { e.stopPropagation(); handleDownload(entry); }} className="p-1 hover:bg-accent rounded" title="Download">
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(entry); }} className="p-1 hover:bg-destructive/20 text-destructive rounded" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Preview pane */}
        {selected && (
          <div className="w-72 border-l border-border flex flex-col shrink-0 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
              <span className="text-xs font-medium truncate">{selected.name}</span>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground text-xs ml-2">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-3">
              {previewUrl && selected.mimeType?.startsWith("image/") && <img src={previewUrl} alt={selected.name} className="max-w-full rounded" />}
              {previewUrl && selected.mimeType === "application/pdf" && <iframe src={previewUrl} className="w-full h-[400px] rounded" title={selected.name} />}
              {previewText !== null && <pre className="text-xs font-mono whitespace-pre-wrap break-all">{previewText}</pre>}
              {!previewUrl && previewText === null && (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <Eye className="h-6 w-6 mb-2 opacity-40" /><p className="text-xs">No preview</p>
                </div>
              )}
              <div className="mt-4 space-y-1 text-xs text-muted-foreground border-t border-border pt-3">
                <p><span className="font-medium">Size:</span> {formatSize(selected.size)}</p>
                <p><span className="font-medium">Type:</span> {selected.mimeType ?? "unknown"}</p>
                <p><span className="font-medium">Modified:</span> {formatDate(selected.lastModified)}</p>
              </div>
            </div>
            <div className="flex-none border-t border-border p-2">
              <button onClick={() => handleDownload(selected)} className="w-full flex items-center justify-center gap-2 text-xs py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90">
                <Download className="h-3.5 w-3.5" /> Download
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
