import { useEffect, useState } from "react";
import { Eye, EyeOff, Save, Trash2, Plus, ChevronDown, Wifi, WifiOff, Loader2, FileText, X } from "lucide-react";
import { useProviderStore } from "@/store/providerStore";
import { useMcpStore, type McpServerConfig, type McpTransport } from "@/store/mcpStore";
import { useSkillStore } from "@/store/skillStore";
import { connectMcpServer, testMcpConnection } from "@/lib/mcp/client";
import { useTheme } from "@/app/ThemeProvider";
import { cn } from "@/lib/utils";
import type { ModelInfo, ProviderConfig } from "@zenon/shared-types";
import { toast } from "@/components/ui/Toaster";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"providers" | "mcp" | "general" | "proxy" | "skills">("providers");

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <div className="flex gap-4">
          {(["providers", "mcp", "proxy", "skills", "general"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "py-2 text-sm font-medium border-b-2 transition-colors capitalize",
                activeTab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab === "mcp" ? "MCP Servers" : tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {activeTab === "providers" && <ProvidersSettings />}
        {activeTab === "mcp" && <McpSettings />}
        {activeTab === "proxy" && <ProxySettings />}
        {activeTab === "skills" && <SkillsSettings />}
        {activeTab === "general" && <GeneralSettings />}
      </div>
    </div>
  );
}

function ProvidersSettings() {
  const providers = useProviderStore((s) => s.providers);
  const setApiKey = useProviderStore((s) => s.setApiKey);
  const getApiKey = useProviderStore((s) => s.getApiKey);
  const clearApiKey = useProviderStore((s) => s.clearApiKey);
  const toggleProvider = useProviderStore((s) => s.toggleProvider);
  const addCustomProvider = useProviderStore((s) => s.addCustomProvider);
  const updateProvider = useProviderStore((s) => s.updateProvider);
  const removeProvider = useProviderStore((s) => s.removeProvider);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customModels, setCustomModels] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");

  const handleSaveKey = (providerId: string) => {
    const key = keys[providerId];
    if (key !== undefined) {
      setApiKey(providerId, key);
      setKeys((prev) => ({ ...prev, [providerId]: "" }));
      toast.success("API key saved");
    }
  };

  const handleAddCustomProvider = () => {
    const name = customName.trim();
    const baseUrl = normalizeBaseUrl(customBaseUrl);
    const models = parseModels(customModels);

    if (!name || !baseUrl || models.length === 0) return;

    const id = addCustomProvider({
      type: "openai-compatible",
      name,
      baseUrl,
      hasApiKey: customApiKey.trim().length > 0,
      enabled: true,
      models,
    });

    if (customApiKey.trim()) {
      setApiKey(id, customApiKey.trim());
    }

    setCustomName("");
    setCustomBaseUrl("");
    setCustomModels("");
    setCustomApiKey("");
    setShowCustomForm(false);
    setExpanded(id);
    toast.success(`Added provider "${name}"`);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-sm font-semibold mb-1">AI Providers</h2>
        <p className="text-sm text-muted-foreground">
          Add API keys for each provider. Keys are stored only in your browser.
        </p>
      </div>

      {providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          isExpanded={expanded === provider.id}
          onToggleExpand={() =>
            setExpanded(expanded === provider.id ? null : provider.id)
          }
          savedKey={getApiKey(provider.id)}
          inputKey={keys[provider.id] ?? ""}
          showKey={showKey[provider.id] ?? false}
          onKeyChange={(v) =>
            setKeys((k) => ({ ...k, [provider.id]: v }))
          }
          onToggleShow={() =>
            setShowKey((s) => ({ ...s, [provider.id]: !s[provider.id] }))
          }
          onSave={() => handleSaveKey(provider.id)}
          onClear={() => clearApiKey(provider.id)}
          onToggleEnable={(enabled) => toggleProvider(provider.id, enabled)}
          onUpdate={(patch) => updateProvider(provider.id, patch)}
          onRemove={
            isBuiltInProvider(provider.id)
              ? undefined
              : () => {
                  removeProvider(provider.id);
                  toast.success(`Removed provider "${provider.name}"`);
                }
          }
        />
      ))}

      {showCustomForm ? (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="text-sm font-medium">Add Custom OpenAI-compatible Provider</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Provider name</span>
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="LocalAI"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Base URL</span>
              <input
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                placeholder="http://192.168.1.10:11434/v1"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Model IDs (comma or newline separated)</span>
            <textarea
              value={customModels}
              onChange={(e) => setCustomModels(e.target.value)}
              placeholder="llama3.2&#10;mistral&#10;qwen2.5"
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">API key (optional)</span>
            <input
              value={customApiKey}
              onChange={(e) => setCustomApiKey(e.target.value)}
              placeholder="Leave empty for Ollama/local endpoints"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCustomForm(false)}
              className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddCustomProvider}
              disabled={
                !customName.trim() ||
                !customBaseUrl.trim() ||
                parseModels(customModels).length === 0
              }
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              Add Provider
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowCustomForm(true)}
          className="flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 w-full justify-center transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Custom Provider
        </button>
      )}
    </div>
  );
}

interface ProviderCardProps {
  provider: ProviderConfig;
  isExpanded: boolean;
  onToggleExpand: () => void;
  savedKey?: string;
  inputKey: string;
  showKey: boolean;
  onKeyChange: (v: string) => void;
  onToggleShow: () => void;
  onSave: () => void;
  onClear: () => void;
  onToggleEnable: (enabled: boolean) => void;
  onUpdate: (patch: Partial<ProviderConfig>) => void;
  onRemove?: () => void;
}

function ProviderCard({
  provider,
  isExpanded,
  onToggleExpand,
  savedKey,
  inputKey,
  showKey,
  onKeyChange,
  onToggleShow,
  onSave,
  onClear,
  onToggleEnable,
  onUpdate,
  onRemove,
}: ProviderCardProps) {
  const hasKey = !!savedKey;
  const canEditEndpoint = provider.type === "openai-compatible";
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? "");
  const [modelsText, setModelsText] = useState(modelsToText(provider.models));

  useEffect(() => {
    setBaseUrl(provider.baseUrl ?? "");
    setModelsText(modelsToText(provider.models));
  }, [provider.baseUrl, provider.models]);

  const saveEndpoint = () => {
    const nextBaseUrl = normalizeBaseUrl(baseUrl);
    const models = parseModels(modelsText, provider.models, provider.id === "ollama");
    if (!nextBaseUrl || models.length === 0) return;
    onUpdate({ baseUrl: nextBaseUrl, models });
    toast.success("Provider settings saved");
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={onToggleExpand}
        className="flex w-full items-center gap-3 px-4 py-3 hover:bg-accent/50 text-left"
      >
        <div className="flex-1 flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{provider.name}</span>
              {hasKey && (
                <span className="text-[10px] bg-green-500/15 text-green-600 dark:text-green-400 rounded px-1.5">
                  configured
                </span>
              )}
              {!provider.enabled && (
                <span className="text-[10px] bg-muted text-muted-foreground rounded px-1.5">
                  disabled
                </span>
              )}
            </div>
            {provider.baseUrl && (
              <p className="text-xs text-muted-foreground">{provider.baseUrl}</p>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            isExpanded && "rotate-180",
          )}
        />
      </button>

      {isExpanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {/* Enable/disable */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Enabled</span>
            <button
              onClick={() => onToggleEnable(!provider.enabled)}
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                provider.enabled ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                  provider.enabled ? "translate-x-4.5" : "translate-x-0.5",
                )}
              />
            </button>
          </div>

          {canEditEndpoint && (
            <div className="space-y-3 rounded-md border border-border p-3 bg-muted/20">
              <div className="space-y-1">
                <label className="text-sm font-medium">OpenAI-compatible base URL</label>
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {provider.id === "ollama" && (
                  <p className="text-xs text-muted-foreground">
                    Use <code className="font-mono bg-muted px-1 rounded">/ollama/v1</code>
                    {" "}for Ollama running on this Docker host. Nginx forwards it over the
                    same HTTPS origin to avoid browser mixed-content and CORS errors.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Model IDs</label>
                <textarea
                  value={modelsText}
                  onChange={(e) => setModelsText(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <button
                onClick={saveEndpoint}
                disabled={!normalizeBaseUrl(baseUrl) || parseModels(modelsText).length === 0}
                className="flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-primary/90"
              >
                <Save className="h-3.5 w-3.5" />
                Save endpoint
              </button>
            </div>
          )}

          {/* API Key input */}
          {provider.type !== "local-webgpu" && provider.type !== "local-wasm" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {provider.type === "bedrock"
                  ? "Credentials (access_key:secret_key:region)"
                  : "API Key"}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? "text" : "password"}
                    value={inputKey || (hasKey ? "••••••••••••••••" : "")}
                    onChange={(e) => onKeyChange(e.target.value)}
                    placeholder={`Enter ${provider.name} ${provider.type === "bedrock" ? "credentials" : "API key"}…`}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm pr-9 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={onToggleShow}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <button
                  onClick={onSave}
                  disabled={!inputKey}
                  className="flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-primary/90"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save
                </button>
                {hasKey && (
                  <button
                    onClick={onClear}
                    className="flex items-center gap-1 rounded-md border border-destructive/30 text-destructive px-3 py-1.5 text-sm hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {provider.type === "bedrock" && (
                <p className="text-xs text-muted-foreground">
                  Format: <code className="font-mono bg-muted px-1 rounded">ACCESS_KEY:SECRET_KEY:us-east-1</code>
                </p>
              )}
            </div>
          )}

          {/* Models list */}
          <div>
            <p className="text-sm font-medium mb-2">Available Models ({provider.models.length})</p>
            <div className="space-y-1">
              {provider.models.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center justify-between rounded px-2 py-1.5 bg-muted/50 text-sm"
                >
                  <span>{model.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {(model.contextWindow / 1000).toFixed(0)}k ctx
                  </span>
                </div>
              ))}
            </div>
          </div>

          {onRemove && (
            <button
              onClick={onRemove}
              className="flex items-center gap-1 rounded-md border border-destructive/30 text-destructive px-3 py-1.5 text-sm hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove provider
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function isBuiltInProvider(id: string): boolean {
  return ["openai", "anthropic", "gemini", "bedrock", "ollama"].includes(id);
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function modelsToText(models: ModelInfo[]): string {
  return models.map((model) => model.id).join("\n");
}

function parseModels(
  value: string,
  existing: ModelInfo[] = [],
  isLocal = false,
): ModelInfo[] {
  const existingById = new Map(existing.map((model) => [model.id, model]));
  const seen = new Set<string>();

  return value
    .split(/[\n,]+/)
    .map((model) => model.trim())
    .filter(Boolean)
    .filter((model) => {
      if (seen.has(model)) return false;
      seen.add(model);
      return true;
    })
    .map((id) => {
      const current = existingById.get(id);
      return current ?? {
        id,
        name: id,
        contextWindow: 32768,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        isLocal,
      };
    });
}

function ProxySettings() {
  const [proxyUrl, setProxyUrl] = useState(
    () => localStorage.getItem("zenon-proxy-url") ?? "",
  );
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem("zenon-proxy-url", proxyUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-sm font-semibold mb-1">Proxy Server</h2>
        <p className="text-sm text-muted-foreground">
          Configure the Zenon proxy server URL. Required for AWS Bedrock and helps
          avoid CORS issues with Anthropic. Leave empty to call APIs directly.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Proxy Base URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="http://localhost:3001"
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleSave}
              className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm hover:bg-primary/90"
            >
              {saved ? "Saved!" : "Save"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Run <code className="font-mono bg-muted px-1 rounded">pnpm --filter @zenon/proxy dev</code> to start the proxy locally.
          </p>
        </div>

        <div className="rounded-lg border border-border p-4 bg-muted/20">
          <h3 className="text-sm font-medium mb-2">Proxy routes</h3>
          <div className="space-y-1 text-xs text-muted-foreground font-mono">
            <div><span className="text-green-600 dark:text-green-400">POST</span> /api/chat — OpenAI-compatible forwarding</div>
            <div><span className="text-green-600 dark:text-green-400">POST</span> /api/anthropic/messages — Anthropic forwarding</div>
            <div><span className="text-green-600 dark:text-green-400">POST</span> /api/bedrock — AWS Bedrock (SigV4 signing)</div>
            <div><span className="text-blue-600 dark:text-blue-400">GET</span>  /api/mcp/* — MCP server proxy (future)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function McpSettings() {
  const { servers, addServer, updateServer, removeServer, toggleServer } = useMcpStore();
  const [showForm, setShowForm] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  // New server form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formTransport, setFormTransport] = useState<McpTransport>("http");
  const [formAuthHeader, setFormAuthHeader] = useState("");

  function resetForm() {
    setFormName("");
    setFormUrl("");
    setFormTransport("http");
    setFormAuthHeader("");
    setShowForm(false);
  }

  async function handleAdd() {
    if (!formName.trim() || !formUrl.trim()) return;
    const headers: Record<string, string> = {};
    if (formAuthHeader.trim()) {
      headers["Authorization"] = formAuthHeader.trim();
    }
    addServer({ name: formName.trim(), url: formUrl.trim(), transport: formTransport, headers });
    resetForm();
    toast.success("MCP server added");
  }

  async function handleConnect(server: McpServerConfig) {
    setConnecting(server.id);
    try {
      const toolNames = await connectMcpServer(server);
      updateServer(server.id, {
        discoveredTools: toolNames,
        lastConnected: Date.now(),
        error: undefined,
      });
      toast.success(`Connected — ${toolNames.length} tool(s) registered`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateServer(server.id, { error: msg });
      toast.error("Connection failed", msg);
    } finally {
      setConnecting(null);
    }
  }

  async function handleTest(server: McpServerConfig) {
    setConnecting(server.id);
    try {
      const count = await testMcpConnection(server);
      toast.success(`Connected — ${count} tool(s) available`);
    } catch (err) {
      toast.error("Test failed", err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(null);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-sm font-semibold mb-1">MCP Servers</h2>
        <p className="text-sm text-muted-foreground">
          Connect to external Model Context Protocol (MCP) servers to extend Zenon
          with additional tools. Servers must support HTTP or SSE transport.
        </p>
      </div>

      {servers.map((srv) => (
        <div key={srv.id} className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{srv.name}</span>
                <span className={cn(
                  "text-[10px] rounded px-1.5 py-0.5",
                  srv.lastConnected && !srv.error
                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : srv.error
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
                )}>
                  {srv.lastConnected && !srv.error ? "connected" : srv.error ? "error" : "not connected"}
                </span>
                <span className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono">
                  {srv.transport}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{srv.url}</p>
              {srv.discoveredTools && srv.discoveredTools.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {srv.discoveredTools.length} tool(s) registered
                </p>
              )}
              {srv.error && (
                <p className="text-xs text-destructive truncate">{srv.error}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* enable/disable toggle */}
              <button
                onClick={() => toggleServer(srv.id, !srv.enabled)}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  srv.enabled ? "bg-primary" : "bg-muted"
                )}
              >
                <span className={cn(
                  "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                  srv.enabled ? "translate-x-4" : "translate-x-0.5"
                )} />
              </button>
              <button
                onClick={() => handleConnect(srv)}
                disabled={!!connecting}
                title="Connect & register tools"
                className="flex items-center gap-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
              >
                {connecting === srv.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wifi className="h-3.5 w-3.5" />
                )}
                Connect
              </button>
              <button
                onClick={() => removeServer(srv.id)}
                title="Remove server"
                className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}

      {showForm ? (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="text-sm font-medium">Add MCP Server</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="My MCP Server"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Transport</label>
              <select
                value={formTransport}
                onChange={(e) => setFormTransport(e.target.value as McpTransport)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="http">HTTP (JSON-RPC)</option>
                <option value="sse">SSE (Server-Sent Events)</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Server URL</label>
            <input
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://mcp.example.com/rpc"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Authorization header (optional)</label>
            <input
              value={formAuthHeader}
              onChange={(e) => setFormAuthHeader(e.target.value)}
              placeholder="Bearer sk-..."
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={resetForm}
              className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleAdd()}
              disabled={!formName.trim() || !formUrl.trim()}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              Add Server
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 w-full justify-center transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add MCP Server
        </button>
      )}

      <div className="rounded-lg border border-border p-4 bg-muted/20">
        <h3 className="text-sm font-medium mb-2">About MCP</h3>
        <p className="text-xs text-muted-foreground">
          The Model Context Protocol (MCP) lets AI models interact with external tools and data sources.
          Zenon implements MCP JSON-RPC 2.0 over HTTP. External servers must be publicly accessible
          or reachable through the Zenon proxy.
        </p>
      </div>
    </div>
  );
}

function SkillsSettings() {
  const { skills, addSkill, updateSkill, deleteSkill, toggleSkill } = useSkillStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  function handleAdd() {
    if (!newName.trim()) return;
    const id = addSkill(newName.trim(), "");
    setNewName("");
    setShowAddForm(false);
    setEditingId(id);
    toast.success("Global skill added");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" /> Global Skill Files
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Global skills (like <code className="font-mono text-xs">CLAUDE.md</code>) are markdown documents
          prepended to every agent's system prompt. Use them for project conventions, coding standards,
          or any context that should always be available.
        </p>
      </div>

      <div className="space-y-3">
        {skills.length === 0 && !showAddForm && (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No global skills yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Add a markdown document to pre-load into every conversation.</p>
          </div>
        )}

        {skills.map((sk) => (
          <div key={sk.id} className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40">
              {/* Toggle */}
              <button
                onClick={() => toggleSkill(sk.id)}
                className={cn(
                  "h-4 w-7 rounded-full transition-colors relative shrink-0",
                  sk.enabled ? "bg-primary" : "bg-muted-foreground/30"
                )}
                title={sk.enabled ? "Disable" : "Enable"}
              >
                <div className={cn(
                  "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform",
                  sk.enabled ? "translate-x-3.5" : "translate-x-0.5"
                )} />
              </button>
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 text-sm font-medium truncate">{sk.name}</span>
              <button
                onClick={() => setEditingId(editingId === sk.id ? null : sk.id)}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted transition-colors"
              >
                {editingId === sk.id ? "Collapse" : "Edit"}
              </button>
              <button
                onClick={() => { deleteSkill(sk.id); if (editingId === sk.id) setEditingId(null); }}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {editingId === sk.id && (
              <div className="px-3 py-2 space-y-2 border-t border-border">
                <input
                  value={sk.name}
                  onChange={(e) => updateSkill(sk.id, { name: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Skill name (e.g. CONVENTIONS.md)"
                />
                <textarea
                  value={sk.content}
                  onChange={(e) => updateSkill(sk.id, { content: e.target.value })}
                  rows={12}
                  placeholder="Enter markdown content..."
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => { setEditingId(null); toast.success("Skill saved"); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Save className="h-3.5 w-3.5" /> Save
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {showAddForm ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowAddForm(false); }}
              placeholder="Skill name (e.g. CONVENTIONS.md)"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button onClick={handleAdd} className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Add</button>
            <button onClick={() => setShowAddForm(false)} className="px-3 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/50 transition-colors w-full"
          >
            <Plus className="h-4 w-4" /> Add global skill file
          </button>
        )}
      </div>
    </div>
  );
}

function GeneralSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-sm font-semibold mb-1">Appearance</h2>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium">Theme</p>
          <p className="text-xs text-muted-foreground">Light, dark, or follow system</p>
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {(["light", "dark", "system"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium capitalize transition-colors",
                theme === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border px-4 py-3">
        <p className="text-sm font-medium mb-2">Data & Privacy</p>
        <p className="text-xs text-muted-foreground">
          All conversation history is stored locally in your browser (localStorage + IndexedDB).
          Workspace files are stored in OPFS (Origin Private File System).
          API keys are stored only in your browser and never sent to any server except the
          configured AI provider.
        </p>
        <button className="mt-3 text-sm text-destructive hover:underline">
          Clear all local data
        </button>
      </div>
    </div>
  );
}
