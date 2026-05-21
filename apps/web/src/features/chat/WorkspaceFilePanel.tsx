/**
 * WorkspaceFilePanel — a compact right-side panel showing the current
 * workspace's file tree. Opens automatically when the agent calls any
 * workspace-related tool and can also be toggled manually.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  RefreshCw,
  FolderOpen,
  Folder,
  File,
  FileText,
  Image,
  FileSpreadsheet,
  FileCode,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { listDir, ensureDir } from "@/lib/storage/opfs";
import type { FileEntry } from "@/lib/storage/opfs";
import { workspacePaths } from "@/lib/storage/workspace";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { cn } from "@/lib/utils";

// ─── File icon helper ─────────────────────────────────────────────────────────

function fileIcon(entry: FileEntry) {
  const mime = entry.mimeType ?? "";
  if (mime.startsWith("image/")) return <Image className="h-3.5 w-3.5 shrink-0 text-green-500" />;
  if (mime.includes("pdf")) return <FileText className="h-3.5 w-3.5 shrink-0 text-red-500" />;
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv")
    return <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-emerald-500" />;
  if (
    mime.startsWith("text/x-") ||
    mime === "text/javascript" ||
    mime === "text/typescript" ||
    mime === "application/json"
  )
    return <FileCode className="h-3.5 w-3.5 shrink-0 text-purple-400" />;
  if (mime.startsWith("text/")) return <FileText className="h-3.5 w-3.5 shrink-0 text-blue-400" />;
  return <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

// ─── Tree node ────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  entry: FileEntry;
  depth: number;
  refreshKey: number;
}

function TreeNode({ entry, depth, refreshKey }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  // Keep a ref so the refresh effect can read expanded without being subscribed to it
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const loadChildren = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await listDir(entry.path);
      setChildren(entries);
    } catch {
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }, [entry.path]);

  // Re-fetch children when refreshKey changes (if already expanded)
  useEffect(() => {
    if (expandedRef.current) {
      void loadChildren();
    }
  }, [refreshKey, loadChildren]);

  const handleToggle = async () => {
    if (!expanded) {
      await loadChildren();
    }
    setExpanded((v) => !v);
  };

  const isDir = entry.kind === "directory";

  return (
    <div>
      <div
        role={isDir ? "button" : undefined}
        data-testid={`panel-entry-${entry.name}`}
        className={cn(
          "flex items-center gap-1 py-0.5 rounded text-xs",
          isDir && "cursor-pointer hover:bg-accent/50",
          !isDir && "cursor-default",
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px`, paddingRight: "8px" }}
        onClick={isDir ? handleToggle : undefined}
      >
        {isDir ? (
          loading ? (
            <RefreshCw className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
          ) : expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="h-3 w-3 shrink-0" />
        )}
        {isDir ? (
          expanded ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )
        ) : (
          fileIcon(entry)
        )}
        <span className="truncate text-foreground/80">{entry.name}</span>
      </div>
      {expanded && (
        <div>
          {children.length === 0 && !loading ? (
            <div
              className="text-[10px] text-muted-foreground italic"
              style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }}
            >
              empty
            </div>
          ) : (
            children.map((child) => (
              <TreeNode key={child.path} entry={child} depth={depth + 1} refreshKey={refreshKey} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Panel ─────────────────────────────────────────────────────────────────────

export interface WorkspaceFilePanelProps {
  /** Incrementing this triggers a re-fetch of the file tree root. */
  refreshKey?: number;
  onClose: () => void;
}

export function WorkspaceFilePanel({ refreshKey = 0, onClose }: WorkspaceFilePanelProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const workspace = workspaces.find((w) => w.id === currentWorkspaceId);
  const rootPath = currentWorkspaceId ? workspacePaths.files(currentWorkspaceId) : null;

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRoot = useCallback(async () => {
    if (!rootPath) return;
    setLoading(true);
    try {
      await ensureDir(rootPath);
      const list = await listDir(rootPath);
      setEntries(list);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    void loadRoot();
  }, [loadRoot, refreshKey]);

  return (
    <aside
      data-testid="workspace-file-panel"
      className="flex flex-col w-64 shrink-0 border-l border-border bg-background overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span className="text-xs font-medium truncate" title={workspace?.name}>
            {workspace?.name ?? "Workspace files"}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => void loadRoot()}
            title="Refresh"
            aria-label="Refresh file tree"
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </button>
          <button
            onClick={onClose}
            title="Close panel"
            aria-label="Close workspace file panel"
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {!rootPath ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">No workspace selected.</p>
        ) : loading && entries.length === 0 ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : entries.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground italic">No files yet.</p>
        ) : (
          entries.map((entry) => (
            <TreeNode key={entry.path} entry={entry} depth={0} refreshKey={refreshKey} />
          ))
        )}
      </div>
    </aside>
  );
}
