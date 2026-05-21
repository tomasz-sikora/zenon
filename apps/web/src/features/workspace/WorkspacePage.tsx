import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FolderOpen,
  File,
  FileText,
  Image,
  FileSpreadsheet,
  FileCode,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  ChevronRight,
  Home,
  FolderPlus,
  Eye,
  Search,
  Plus,
  Package,
  BarChart2,
  Archive,
  X,
  Check,
  Pencil,
} from "lucide-react";
import {
  listDir,
  writeFile,
  readFileBlob,
  deleteFile,
  deleteDir,
  ensureDir,
  getDirStats,
  createTarGz,
} from "@/lib/storage/opfs";
import type { FileEntry } from "@/lib/storage/opfs";
import { workspacePaths } from "@/lib/storage/workspace";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { toast } from "@/components/ui/Toaster";

// ─── Icons ────────────────────────────────────────────────────────────────────

function fileIcon(entry: FileEntry) {
  if (entry.kind === "directory") return <FolderOpen className="h-4 w-4 text-amber-500" />;
  const mime = entry.mimeType ?? "";
  if (mime.startsWith("image/")) return <Image className="h-4 w-4 text-green-500" />;
  if (mime.includes("pdf")) return <FileText className="h-4 w-4 text-red-500" />;
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv")
    return <FileSpreadsheet className="h-4 w-4 text-emerald-500" />;
  if (
    mime.startsWith("text/x-") ||
    mime === "text/javascript" ||
    mime === "text/typescript" ||
    mime === "application/json"
  )
    return <FileCode className="h-4 w-4 text-purple-400" />;
  if (mime.startsWith("text/")) return <FileText className="h-4 w-4 text-blue-400" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ms?: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isPreviewable(mime: string): boolean {
  return (
    mime.startsWith("image/") ||
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime === "application/json"
  );
}

// ─── CSV Table Preview ────────────────────────────────────────────────────────

function CsvTable({ text }: { text: string }) {
  const lines = text.trim().split("\n").slice(0, 52);
  const headers = lines[0]?.split(",") ?? [];
  const rows = lines.slice(1, 52);
  return (
    <div className="overflow-auto max-h-64">
      <table className="text-xs w-full border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="border border-border px-2 py-1 text-left bg-muted/50 font-medium whitespace-nowrap">
                {h.replace(/^"|"$/g, "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-muted/30">
              {row.split(",").map((cell, ci) => (
                <td key={ci} className="border border-border px-2 py-0.5 whitespace-nowrap">
                  {cell.replace(/^"|"$/g, "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {lines.length > 52 && (
        <p className="text-xs text-muted-foreground mt-1 text-center">Showing first 50 rows</p>
      )}
    </div>
  );
}

// ─── Workspace Stats ──────────────────────────────────────────────────────────

function WorkspaceStatsBar({ workspaceId, refreshKey }: { workspaceId: string; refreshKey?: number }) {
  const [stats, setStats] = useState<{ fileCount: number; totalSize: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDirStats(workspacePaths.files(workspaceId)).then((s) => {
      if (!cancelled) setStats(s);
    }).catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, refreshKey]);

  if (!stats) return <span className="text-xs text-muted-foreground">…</span>;

  return (
    <span className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <BarChart2 className="h-3 w-3" />
        {stats.fileCount} file{stats.fileCount !== 1 ? "s" : ""}
      </span>
      <span>{formatSize(stats.totalSize)}</span>
    </span>
  );
}

// ─── Workspace Manager Panel ──────────────────────────────────────────────────

function WorkspaceManagerPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { workspaces, currentWorkspaceId, createWorkspace, deleteWorkspace, renameWorkspace, setCurrentWorkspace } =
    useWorkspaceStore();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const id = await createWorkspace(newName.trim());
    setNewName("");
    navigate(`/workspace/${id}`);
    onClose();
    toast.success(`Created workspace "${newName.trim()}"`);
  };

  const handleDelete = async (id: string) => {
    const ws = workspaces.find((w) => w.id === id);
    if (!confirm(`Delete workspace "${ws?.name}"? This will permanently delete all files.`)) return;
    await deleteWorkspace(id);
    toast.success(`Deleted workspace "${ws?.name}"`);
    if (currentWorkspaceId === id) navigate("/workspace");
    onClose();
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    renameWorkspace(id, editName.trim());
    setEditingId(null);
  };

  const handleDownload = async (id: string) => {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return;
    setDownloading(id);
    try {
      const blob = await createTarGz(workspacePaths.files(id));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ws.name.replace(/\s+/g, "-")}.tar.gz`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Download failed", String(e));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="absolute inset-0 z-20 bg-background/90 backdrop-blur-sm flex items-start justify-center pt-8 px-4">
      <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-semibold text-sm flex items-center gap-2">
            <Package className="h-4 w-4" /> Manage Workspaces
          </span>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="divide-y divide-border max-h-80 overflow-y-auto">
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              data-testid={`workspace-row-${ws.id}`}
              className={`flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors ${ws.id === currentWorkspaceId ? "bg-accent/20" : ""}`}
            >
              <div className="flex-1 min-w-0">
                {editingId === ws.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(ws.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 text-sm bg-transparent border-b border-border focus:outline-none"
                      aria-label="Rename workspace"
                    />
                    <button onClick={() => handleRename(ws.id)} className="p-0.5 hover:text-primary" aria-label="Confirm rename">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-0.5 hover:text-muted-foreground" aria-label="Cancel rename">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setCurrentWorkspace(ws.id); navigate(`/workspace/${ws.id}`); onClose(); }}
                    className="text-sm font-medium text-left w-full truncate hover:text-primary"
                  >
                    {ws.name}
                    {ws.id === currentWorkspaceId && (
                      <span className="ml-2 text-xs text-muted-foreground font-normal">(active)</span>
                    )}
                  </button>
                )}
                <WorkspaceStatsBar workspaceId={ws.id} />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { setEditingId(ws.id); setEditName(ws.name); }}
                  title="Rename"
                  aria-label={`Rename ${ws.name}`}
                  className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDownload(ws.id)}
                  title="Download as tar.gz"
                  aria-label={`Download ${ws.name} as tar.gz`}
                  disabled={downloading === ws.id}
                  className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {downloading === ws.id ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Archive className="h-3.5 w-3.5" />
                  )}
                </button>
                {ws.id !== "default" && (
                  <button
                    onClick={() => handleDelete(ws.id)}
                    title="Delete workspace"
                    aria-label={`Delete ${ws.name}`}
                    className="p-1 hover:bg-destructive/20 rounded text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              placeholder="New workspace name…"
              aria-label="New workspace name"
              className="flex-1 text-sm bg-transparent border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="flex items-center gap-1 text-sm px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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
  const [previewMime, setPreviewMime] = useState<string>("");
  const [search, setSearch] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [statsKey, setStatsKey] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const rootPath = activeId ? workspacePaths.files(activeId) : null;

  const loadDir = useCallback(async (path: string) => {
    if (!path) return;
    setLoading(true);
    setSelected(null);
    setPreviewUrl(null);
    setPreviewText(null);
    setPreviewMime("");
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

  // Auto-refresh every 5 s so files created by Python appear without manual refresh
  useEffect(() => {
    if (!rootPath) return;
    const id = setInterval(() => {
      if (!loading) {
        loadDir(currentPath || rootPath);
        setStatsKey((k) => k + 1);
      }
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
    setPreviewMime(mime);
    try {
      const blob = await readFileBlob(entry.path);
      if (mime.startsWith("image/")) {
        setPreviewUrl(URL.createObjectURL(blob));
      } else if (mime === "application/pdf") {
        setPreviewUrl(URL.createObjectURL(blob));
      } else if (
        mime.startsWith("text/") ||
        mime === "application/json"
      ) {
        setPreviewText((await blob.text()).slice(0, 100_000));
      }
      // binary → no preview, download only
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
    setStatsKey((k) => k + 1);
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
      entry.kind === "directory"
        ? await deleteDir(entry.path, true)
        : await deleteFile(entry.path);
      if (selected?.path === entry.path) setSelected(null);
      toast.success(`Deleted ${entry.name}`);
      loadDir(currentPath);
      setStatsKey((k) => k + 1);
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

  const handleDownloadWorkspace = async () => {
    if (!activeId || !workspace) return;
    try {
      toast.success("Building archive…");
      const blob = await createTarGz(workspacePaths.files(activeId));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workspace.name.replace(/\s+/g, "-")}.tar.gz`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Download failed", String(e));
    }
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
          <button onClick={() => setShowManager(true)} className="mt-3 text-sm text-primary hover:underline">
            Manage workspaces
          </button>
        </div>
      </div>
    );
  }

  const crumbs = breadcrumbs();

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {showManager && <WorkspaceManagerPanel onClose={() => setShowManager(false)} />}

      {/* Workspace header bar */}
      <div className="flex-none border-b border-border px-4 py-2 bg-muted/20 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowManager(true)}
          className="flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-colors"
          aria-label="Manage workspaces"
        >
          <Package className="h-3.5 w-3.5" />
          {workspace?.name ?? "Workspace"}
        </button>
        <span className="text-muted-foreground/40">·</span>
        {activeId && <WorkspaceStatsBar workspaceId={activeId} refreshKey={statsKey} />}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={handleDownloadWorkspace}
            title="Download workspace as tar.gz"
            className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <Archive className="h-3.5 w-3.5" /> Download
          </button>
        </div>
      </div>

      {/* File browser header */}
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
            placeholder="Filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Filter files"
          />
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-accent transition-colors"
        >
          <Upload className="h-3.5 w-3.5" /> Upload
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
        <button onClick={() => setShowNewFolder(!showNewFolder)} className="p-1 rounded hover:bg-accent transition-colors" title="New folder">
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => loadDir(currentPath)} className="p-1 rounded hover:bg-accent transition-colors" aria-label="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {showNewFolder && (
        <div className="flex-none flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
          <input
            autoFocus
            className="flex-1 text-sm bg-transparent focus:outline-none border-b border-border"
            placeholder="New folder name…"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
            aria-label="Folder name"
          />
          <button onClick={handleCreateFolder} className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded">
            Create
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* File list */}
        <div
          className="flex-1 overflow-y-auto"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
        >
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
              <Upload className="h-8 w-8 mb-3 opacity-40" />
              <p className="text-sm font-medium">Drop files here or click Upload</p>
              <p className="text-xs mt-1 opacity-60">Files created by Python code appear here automatically</p>
            </div>
          ) : (
            <table className="w-full text-sm" data-testid="file-table">
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
                  <tr
                    key={entry.path}
                    data-testid={`file-row-${entry.name}`}
                    className={`border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors ${selected?.path === entry.path ? "bg-accent/40" : ""}`}
                    onClick={() => openEntry(entry)}
                  >
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        {fileIcon(entry)}
                        <span className="truncate max-w-[200px]">{entry.name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      {entry.kind === "file" ? formatSize(entry.size) : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs hidden md:table-cell">
                      {formatDate(entry.lastModified)}
                    </td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-1 justify-end">
                        {entry.kind === "file" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(entry); }}
                            className="p-1 hover:bg-accent rounded"
                            title="Download"
                            aria-label={`Download ${entry.name}`}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(entry); }}
                          className="p-1 hover:bg-destructive/20 text-destructive rounded"
                          title="Delete"
                          aria-label={`Delete ${entry.name}`}
                        >
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
          <div className="w-80 border-l border-border flex flex-col shrink-0 overflow-hidden" data-testid="preview-pane">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
              <span className="text-xs font-medium truncate flex items-center gap-1.5">
                {fileIcon(selected)}
                {selected.name}
              </span>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground ml-2" aria-label="Close preview">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-3 space-y-3">
              {previewUrl && previewMime.startsWith("image/") && (
                <img src={previewUrl} alt={selected.name} className="max-w-full rounded border border-border" />
              )}

              {previewUrl && previewMime === "application/pdf" && (
                <iframe src={previewUrl} className="w-full h-64 rounded border border-border" title={selected.name} />
              )}

              {previewText !== null && previewMime === "text/csv" && (
                <CsvTable text={previewText} />
              )}

              {previewText !== null && previewMime !== "text/csv" && (
                <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/30 rounded p-2 max-h-72 overflow-auto">
                  {previewText}
                </pre>
              )}

              {!previewUrl && previewText === null && !isPreviewable(previewMime) && (
                <div className="flex flex-col items-center justify-center h-24 text-muted-foreground">
                  <Eye className="h-6 w-6 mb-2 opacity-40" />
                  <p className="text-xs">Binary file — download to view</p>
                </div>
              )}

              <div className="space-y-1 text-xs text-muted-foreground border-t border-border pt-3">
                <p><span className="font-medium">Size:</span> {formatSize(selected.size)}</p>
                <p><span className="font-medium">Type:</span> {selected.mimeType ?? "unknown"}</p>
                <p><span className="font-medium">Modified:</span> {formatDate(selected.lastModified)}</p>
              </div>
            </div>

            <div className="flex-none border-t border-border p-2">
              <button
                onClick={() => handleDownload(selected)}
                className="w-full flex items-center justify-center gap-2 text-xs py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
