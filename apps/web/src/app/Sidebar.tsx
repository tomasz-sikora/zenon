import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  MessageSquare, FolderOpen, Bot, Database, Settings, Plus,
  Moon, Sun, Monitor, X, Zap, ChevronDown, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "./ThemeProvider";
import { useConversationStore } from "@/store/conversationStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useAgentStore } from "@/store/agentStore";
import { toast } from "@/components/ui/Toaster";

interface SidebarProps { onClose: () => void; }

const navItems = [
  { to: "/chat", icon: MessageSquare, label: "Chat" },
  { to: "/workspace", icon: FolderOpen, label: "Workspace" },
  { to: "/agents", icon: Bot, label: "Agents" },
  { to: "/rag", icon: Database, label: "Knowledge" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar({ onClose }: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { createConversation, conversations, activeConversationId, deleteConversation } = useConversationStore();
  const { workspaces, currentWorkspaceId, setCurrentWorkspace, createWorkspace, deleteWorkspace } = useWorkspaceStore();
  const agents = useAgentStore((s) => s.agents);
  const [wsOpen, setWsOpen] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [showNewWs, setShowNewWs] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);

  const currentWs = workspaces.find((w) => w.id === currentWorkspaceId) ?? workspaces[0];

  const handleNewChat = (agentId?: string) => {
    const id = createConversation({ workspaceId: currentWs?.id ?? "default", agentId });
    navigate(`/chat/${id}`);
    onClose();
    setAgentPickerOpen(false);
  };

  const cycleTheme = () => {
    const next: Record<string, "light" | "dark" | "system"> = { light: "dark", dark: "system", system: "light" };
    setTheme(next[theme] ?? "system");
  };

  const handleCreateWorkspace = async () => {
    if (!newWsName.trim()) return;
    const id = await createWorkspace(newWsName.trim());
    setNewWsName(""); setShowNewWs(false); setWsOpen(false);
    navigate(`/workspace/${id}`);
    toast.success(`Created workspace "${newWsName}"`);
  };

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-sidebar-border">
        <Zap className="h-5 w-5 text-primary" />
        <span className="font-semibold text-sidebar-foreground">Zenon</span>
        <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground md:hidden">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Workspace selector */}
      <div className="px-3 pt-2 pb-1">
        <button onClick={() => setWsOpen(!wsOpen)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors">
          <FolderOpen className="h-3.5 w-3.5" />
          <span className="flex-1 text-left truncate">{currentWs?.name ?? "No workspace"}</span>
          <ChevronDown className={cn("h-3 w-3 transition-transform", wsOpen && "rotate-180")} />
        </button>
        {wsOpen && (
          <div className="mt-1 ml-1 border-l border-sidebar-border pl-3 space-y-0.5">
            {workspaces.map((ws) => (
              <div key={ws.id} className="flex items-center gap-1 group">
                <button onClick={() => { setCurrentWorkspace(ws.id); setWsOpen(false); navigate(`/workspace/${ws.id}`); }}
                  className={cn("flex-1 text-left text-xs px-2 py-1 rounded truncate transition-colors hover:bg-sidebar-accent",
                    ws.id === currentWorkspaceId ? "text-sidebar-foreground font-medium" : "text-sidebar-foreground/60")}>
                  {ws.name}
                </button>
                {ws.id !== "default" && (
                  <button onClick={() => deleteWorkspace(ws.id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-all">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {showNewWs ? (
              <div className="flex items-center gap-1 pt-1">
                <input autoFocus value={newWsName} onChange={(e) => setNewWsName(e.target.value)}
                  className="flex-1 text-xs bg-sidebar px-1 py-0.5 rounded border border-sidebar-border focus:outline-none"
                  placeholder="Workspace name"
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateWorkspace(); if (e.key === "Escape") setShowNewWs(false); }} />
                <button onClick={handleCreateWorkspace} className="text-xs px-1.5 py-0.5 bg-primary text-primary-foreground rounded">+</button>
              </div>
            ) : (
              <button onClick={() => setShowNewWs(true)} className="flex items-center gap-1 text-xs px-2 py-1 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
                <Plus className="h-3 w-3" /> New workspace
              </button>
            )}
          </div>
        )}
      </div>

      {/* New Chat button */}
      <div className="px-3 py-1 relative">
        <div className="flex rounded-md overflow-hidden border border-primary/30">
          <button
            onClick={() => handleNewChat()}
            className="flex flex-1 items-center gap-2 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Chat
          </button>
          <button
            onClick={() => setAgentPickerOpen((v) => !v)}
            className="px-2 py-2 bg-primary text-primary-foreground hover:bg-primary/80 border-l border-primary/30 transition-colors"
            aria-label="Select agent"
            title="Select agent for new chat"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", agentPickerOpen && "rotate-180")} />
          </button>
        </div>
        {agentPickerOpen && (
          <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Start chat with…
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleNewChat(agent.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                >
                  <span className="text-base">{agent.avatar}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{agent.name}</span>
                    <span className="block text-xs text-muted-foreground truncate">{agent.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent conversations */}
      <div className="flex-1 overflow-y-auto px-2 py-1 scrollbar-hide">
        {conversations.length > 0 && (
          <div className="mb-2">
            <p className="px-2 py-1 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wide">Recent</p>
            <div className="space-y-0.5">
              {conversations.slice(0, 20).map((conv) => (
                <div key={conv.id} className="flex items-center group">
                  <NavLink to={`/chat/${conv.id}`} onClick={onClose}
                    className={cn("flex-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors truncate",
                      activeConversationId === conv.id && "bg-sidebar-accent")} title={conv.title}>
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="truncate">{conv.title || "New Chat"}</span>
                  </NavLink>
                  <button onClick={() => deleteConversation(conv.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-all mr-1">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="border-t border-sidebar-border px-2 py-2 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} onClick={onClose}
            className={({ isActive }) => cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors", isActive && "bg-sidebar-accent font-medium")}>
            <Icon className="h-4 w-4 shrink-0" /> {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-2 py-2">
        <button onClick={cycleTheme}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
          <ThemeIcon className="h-4 w-4" />
          <span className="capitalize">{theme} theme</span>
        </button>
      </div>
    </div>
  );
}
