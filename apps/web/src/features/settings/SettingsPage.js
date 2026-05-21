import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Eye, EyeOff, Save, Trash2, Plus, ChevronDown, Wifi, Loader2, FileText, X } from "lucide-react";
import { useProviderStore } from "@/store/providerStore";
import { useMcpStore } from "@/store/mcpStore";
import { useSkillStore } from "@/store/skillStore";
import { connectMcpServer, testMcpConnection } from "@/lib/mcp/client";
import { useTheme } from "@/app/ThemeProvider";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/Toaster";
export default function SettingsPage() {
    const location = useLocation();
    const initialTab = location.state?.tab;
    const [activeTab, setActiveTab] = useState(initialTab === "skills" ? "skills" : "providers");
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsx("div", { className: "border-b border-border px-6 py-4", children: _jsx("h1", { className: "text-lg font-semibold", children: "Settings" }) }), _jsx("div", { className: "border-b border-border px-6", children: _jsx("div", { className: "flex gap-4", children: ["providers", "mcp", "proxy", "skills", "general"].map((tab) => (_jsx("button", { onClick: () => setActiveTab(tab), className: cn("py-2 text-sm font-medium border-b-2 transition-colors capitalize", activeTab === tab
                            ? "border-primary text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground"), children: tab === "mcp" ? "MCP Servers" : tab }, tab))) }) }), _jsxs("div", { className: "flex-1 overflow-y-auto px-6 py-6", children: [activeTab === "providers" && _jsx(ProvidersSettings, {}), activeTab === "mcp" && _jsx(McpSettings, {}), activeTab === "proxy" && _jsx(ProxySettings, {}), activeTab === "skills" && _jsx(SkillsSettings, {}), activeTab === "general" && _jsx(GeneralSettings, {})] })] }));
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
    const [expanded, setExpanded] = useState(null);
    const [keys, setKeys] = useState({});
    const [showKey, setShowKey] = useState({});
    const [showCustomForm, setShowCustomForm] = useState(false);
    const [customName, setCustomName] = useState("");
    const [customBaseUrl, setCustomBaseUrl] = useState("");
    const [customModels, setCustomModels] = useState("");
    const [customApiKey, setCustomApiKey] = useState("");
    const handleSaveKey = (providerId) => {
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
        if (!name || !baseUrl || models.length === 0)
            return;
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
    return (_jsxs("div", { className: "space-y-4 max-w-2xl", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-sm font-semibold mb-1", children: "AI Providers" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Add API keys for each provider. Keys are stored only in your browser." })] }), providers.map((provider) => (_jsx(ProviderCard, { provider: provider, isExpanded: expanded === provider.id, onToggleExpand: () => setExpanded(expanded === provider.id ? null : provider.id), savedKey: getApiKey(provider.id), inputKey: keys[provider.id] ?? "", showKey: showKey[provider.id] ?? false, onKeyChange: (v) => setKeys((k) => ({ ...k, [provider.id]: v })), onToggleShow: () => setShowKey((s) => ({ ...s, [provider.id]: !s[provider.id] })), onSave: () => handleSaveKey(provider.id), onClear: () => clearApiKey(provider.id), onToggleEnable: (enabled) => toggleProvider(provider.id, enabled), onUpdate: (patch) => updateProvider(provider.id, patch), onRemove: isBuiltInProvider(provider.id)
                    ? undefined
                    : () => {
                        removeProvider(provider.id);
                        toast.success(`Removed provider "${provider.name}"`);
                    } }, provider.id))), showCustomForm ? (_jsxs("div", { className: "rounded-lg border border-border p-4 space-y-3", children: [_jsx("h3", { className: "text-sm font-medium", children: "Add Custom OpenAI-compatible Provider" }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("label", { className: "space-y-1", children: [_jsx("span", { className: "text-xs text-muted-foreground", children: "Provider name" }), _jsx("input", { value: customName, onChange: (e) => setCustomName(e.target.value), placeholder: "LocalAI", className: "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" })] }), _jsxs("label", { className: "space-y-1", children: [_jsx("span", { className: "text-xs text-muted-foreground", children: "Base URL" }), _jsx("input", { value: customBaseUrl, onChange: (e) => setCustomBaseUrl(e.target.value), placeholder: "http://192.168.1.10:11434/v1", className: "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" })] })] }), _jsxs("label", { className: "block space-y-1", children: [_jsx("span", { className: "text-xs text-muted-foreground", children: "Model IDs (comma or newline separated)" }), _jsx("textarea", { value: customModels, onChange: (e) => setCustomModels(e.target.value), placeholder: "llama3.2\nmistral\nqwen2.5", rows: 3, className: "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" })] }), _jsxs("label", { className: "block space-y-1", children: [_jsx("span", { className: "text-xs text-muted-foreground", children: "API key (optional)" }), _jsx("input", { value: customApiKey, onChange: (e) => setCustomApiKey(e.target.value), placeholder: "Leave empty for Ollama/local endpoints", className: "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" })] }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { onClick: () => setShowCustomForm(false), className: "px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors", children: "Cancel" }), _jsx("button", { onClick: handleAddCustomProvider, disabled: !customName.trim() ||
                                    !customBaseUrl.trim() ||
                                    parseModels(customModels).length === 0, className: "px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors", children: "Add Provider" })] })] })) : (_jsxs("button", { onClick: () => setShowCustomForm(true), className: "flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 w-full justify-center transition-colors", children: [_jsx(Plus, { className: "h-4 w-4" }), "Add Custom Provider"] }))] }));
}
function ProviderCard({ provider, isExpanded, onToggleExpand, savedKey, inputKey, showKey, onKeyChange, onToggleShow, onSave, onClear, onToggleEnable, onUpdate, onRemove, }) {
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
        if (!nextBaseUrl || models.length === 0)
            return;
        onUpdate({ baseUrl: nextBaseUrl, models });
        toast.success("Provider settings saved");
    };
    return (_jsxs("div", { className: "rounded-lg border border-border overflow-hidden", children: [_jsxs("button", { onClick: onToggleExpand, className: "flex w-full items-center gap-3 px-4 py-3 hover:bg-accent/50 text-left", children: [_jsx("div", { className: "flex-1 flex items-center gap-3", children: _jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm font-medium", children: provider.name }), hasKey && (_jsx("span", { className: "text-[10px] bg-green-500/15 text-green-600 dark:text-green-400 rounded px-1.5", children: "configured" })), !provider.enabled && (_jsx("span", { className: "text-[10px] bg-muted text-muted-foreground rounded px-1.5", children: "disabled" }))] }), provider.baseUrl && (_jsx("p", { className: "text-xs text-muted-foreground", children: provider.baseUrl }))] }) }), _jsx(ChevronDown, { className: cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180") })] }), isExpanded && (_jsxs("div", { className: "border-t border-border px-4 py-4 space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-sm", children: "Enabled" }), _jsx("button", { onClick: () => onToggleEnable(!provider.enabled), className: cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", provider.enabled ? "bg-primary" : "bg-muted"), children: _jsx("span", { className: cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform", provider.enabled ? "translate-x-4.5" : "translate-x-0.5") }) })] }), canEditEndpoint && (_jsxs("div", { className: "space-y-3 rounded-md border border-border p-3 bg-muted/20", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-sm font-medium", children: "OpenAI-compatible base URL" }), _jsx("input", { value: baseUrl, onChange: (e) => setBaseUrl(e.target.value), placeholder: "http://localhost:11434/v1", className: "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" }), provider.id === "ollama" && (_jsxs("p", { className: "text-xs text-muted-foreground", children: ["Use ", _jsx("code", { className: "font-mono bg-muted px-1 rounded", children: "/ollama/v1" }), " ", "for Ollama running on this Docker host. Nginx forwards it over the same HTTPS origin to avoid browser mixed-content and CORS errors."] }))] }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-sm font-medium", children: "Model IDs" }), _jsx("textarea", { value: modelsText, onChange: (e) => setModelsText(e.target.value), rows: 4, className: "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" })] }), _jsxs("button", { onClick: saveEndpoint, disabled: !normalizeBaseUrl(baseUrl) || parseModels(modelsText).length === 0, className: "flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-primary/90", children: [_jsx(Save, { className: "h-3.5 w-3.5" }), "Save endpoint"] })] })), provider.type !== "local-webgpu" && provider.type !== "local-wasm" && (_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-sm font-medium", children: provider.type === "bedrock"
                                    ? "Credentials (access_key:secret_key:region)"
                                    : "API Key" }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx("input", { type: showKey ? "text" : "password", value: inputKey || (hasKey ? "••••••••••••••••" : ""), onChange: (e) => onKeyChange(e.target.value), placeholder: `Enter ${provider.name} ${provider.type === "bedrock" ? "credentials" : "API key"}…`, className: "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm pr-9 focus:outline-none focus:ring-1 focus:ring-ring" }), _jsx("button", { type: "button", onClick: onToggleShow, className: "absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground", children: showKey ? (_jsx(EyeOff, { className: "h-4 w-4" })) : (_jsx(Eye, { className: "h-4 w-4" })) })] }), _jsxs("button", { onClick: onSave, disabled: !inputKey, className: "flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-primary/90", children: [_jsx(Save, { className: "h-3.5 w-3.5" }), "Save"] }), hasKey && (_jsx("button", { onClick: onClear, className: "flex items-center gap-1 rounded-md border border-destructive/30 text-destructive px-3 py-1.5 text-sm hover:bg-destructive/10", children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) }))] }), provider.type === "bedrock" && (_jsxs("p", { className: "text-xs text-muted-foreground", children: ["Format: ", _jsx("code", { className: "font-mono bg-muted px-1 rounded", children: "ACCESS_KEY:SECRET_KEY:us-east-1" })] }))] })), _jsxs("div", { children: [_jsxs("p", { className: "text-sm font-medium mb-2", children: ["Available Models (", provider.models.length, ")"] }), _jsx("div", { className: "space-y-1", children: provider.models.map((model) => (_jsxs("div", { className: "flex items-center justify-between rounded px-2 py-1.5 bg-muted/50 text-sm", children: [_jsx("span", { children: model.name }), _jsxs("span", { className: "text-xs text-muted-foreground font-mono", children: [(model.contextWindow / 1000).toFixed(0), "k ctx"] })] }, model.id))) })] }), onRemove && (_jsxs("button", { onClick: onRemove, className: "flex items-center gap-1 rounded-md border border-destructive/30 text-destructive px-3 py-1.5 text-sm hover:bg-destructive/10", children: [_jsx(Trash2, { className: "h-3.5 w-3.5" }), "Remove provider"] }))] }))] }));
}
function isBuiltInProvider(id) {
    return ["openai", "anthropic", "gemini", "bedrock", "ollama"].includes(id);
}
function normalizeBaseUrl(value) {
    return value.trim().replace(/\/+$/, "");
}
function modelsToText(models) {
    return models.map((model) => model.id).join("\n");
}
function parseModels(value, existing = [], isLocal = false) {
    const existingById = new Map(existing.map((model) => [model.id, model]));
    const seen = new Set();
    return value
        .split(/[\n,]+/)
        .map((model) => model.trim())
        .filter(Boolean)
        .filter((model) => {
        if (seen.has(model))
            return false;
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
    const [proxyUrl, setProxyUrl] = useState(() => localStorage.getItem("zenon-proxy-url") ?? "");
    const [saved, setSaved] = useState(false);
    const handleSave = () => {
        localStorage.setItem("zenon-proxy-url", proxyUrl);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };
    return (_jsxs("div", { className: "space-y-6 max-w-2xl", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-sm font-semibold mb-1", children: "Proxy Server" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Configure the Zenon proxy server URL. Required for AWS Bedrock and helps avoid CORS issues with Anthropic. Leave empty to call APIs directly." })] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-sm font-medium", children: "Proxy Base URL" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "url", value: proxyUrl, onChange: (e) => setProxyUrl(e.target.value), placeholder: "http://localhost:3001", className: "flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" }), _jsx("button", { onClick: handleSave, className: "rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm hover:bg-primary/90", children: saved ? "Saved!" : "Save" })] }), _jsxs("p", { className: "text-xs text-muted-foreground", children: ["Run ", _jsx("code", { className: "font-mono bg-muted px-1 rounded", children: "pnpm --filter @zenon/proxy dev" }), " to start the proxy locally."] })] }), _jsxs("div", { className: "rounded-lg border border-border p-4 bg-muted/20", children: [_jsx("h3", { className: "text-sm font-medium mb-2", children: "Proxy routes" }), _jsxs("div", { className: "space-y-1 text-xs text-muted-foreground font-mono", children: [_jsxs("div", { children: [_jsx("span", { className: "text-green-600 dark:text-green-400", children: "POST" }), " /api/chat \u2014 OpenAI-compatible forwarding"] }), _jsxs("div", { children: [_jsx("span", { className: "text-green-600 dark:text-green-400", children: "POST" }), " /api/anthropic/messages \u2014 Anthropic forwarding"] }), _jsxs("div", { children: [_jsx("span", { className: "text-green-600 dark:text-green-400", children: "POST" }), " /api/bedrock \u2014 AWS Bedrock (SigV4 signing)"] }), _jsxs("div", { children: [_jsx("span", { className: "text-blue-600 dark:text-blue-400", children: "GET" }), "  /api/mcp/* \u2014 MCP server proxy (future)"] })] })] })] })] }));
}
function McpSettings() {
    const { servers, addServer, updateServer, removeServer, toggleServer } = useMcpStore();
    const [showForm, setShowForm] = useState(false);
    const [connecting, setConnecting] = useState(null);
    // New server form state
    const [formName, setFormName] = useState("");
    const [formUrl, setFormUrl] = useState("");
    const [formTransport, setFormTransport] = useState("http");
    const [formAuthHeader, setFormAuthHeader] = useState("");
    function resetForm() {
        setFormName("");
        setFormUrl("");
        setFormTransport("http");
        setFormAuthHeader("");
        setShowForm(false);
    }
    async function handleAdd() {
        if (!formName.trim() || !formUrl.trim())
            return;
        const headers = {};
        if (formAuthHeader.trim()) {
            headers["Authorization"] = formAuthHeader.trim();
        }
        addServer({ name: formName.trim(), url: formUrl.trim(), transport: formTransport, headers });
        resetForm();
        toast.success("MCP server added");
    }
    async function handleConnect(server) {
        setConnecting(server.id);
        try {
            const toolNames = await connectMcpServer(server);
            updateServer(server.id, {
                discoveredTools: toolNames,
                lastConnected: Date.now(),
                error: undefined,
            });
            toast.success(`Connected — ${toolNames.length} tool(s) registered`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            updateServer(server.id, { error: msg });
            toast.error("Connection failed", msg);
        }
        finally {
            setConnecting(null);
        }
    }
    async function handleTest(server) {
        setConnecting(server.id);
        try {
            const count = await testMcpConnection(server);
            toast.success(`Connected — ${count} tool(s) available`);
        }
        catch (err) {
            toast.error("Test failed", err instanceof Error ? err.message : String(err));
        }
        finally {
            setConnecting(null);
        }
    }
    return (_jsxs("div", { className: "space-y-4 max-w-2xl", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-sm font-semibold mb-1", children: "MCP Servers" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Connect to external Model Context Protocol (MCP) servers to extend Zenon with additional tools. Servers must support HTTP or SSE transport." })] }), servers.map((srv) => (_jsx("div", { className: "rounded-lg border border-border overflow-hidden", children: _jsxs("div", { className: "flex items-center gap-3 px-4 py-3", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm font-medium", children: srv.name }), _jsx("span", { className: cn("text-[10px] rounded px-1.5 py-0.5", srv.lastConnected && !srv.error
                                                ? "bg-green-500/15 text-green-600 dark:text-green-400"
                                                : srv.error
                                                    ? "bg-destructive/10 text-destructive"
                                                    : "bg-muted text-muted-foreground"), children: srv.lastConnected && !srv.error ? "connected" : srv.error ? "error" : "not connected" }), _jsx("span", { className: "text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono", children: srv.transport })] }), _jsx("p", { className: "text-xs text-muted-foreground truncate", children: srv.url }), srv.discoveredTools && srv.discoveredTools.length > 0 && (_jsxs("p", { className: "text-xs text-muted-foreground", children: [srv.discoveredTools.length, " tool(s) registered"] })), srv.error && (_jsx("p", { className: "text-xs text-destructive truncate", children: srv.error }))] }), _jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [_jsx("button", { onClick: () => toggleServer(srv.id, !srv.enabled), className: cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", srv.enabled ? "bg-primary" : "bg-muted"), children: _jsx("span", { className: cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform", srv.enabled ? "translate-x-4" : "translate-x-0.5") }) }), _jsxs("button", { onClick: () => handleConnect(srv), disabled: !!connecting, title: "Connect & register tools", className: "flex items-center gap-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50", children: [connecting === srv.id ? (_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" })) : (_jsx(Wifi, { className: "h-3.5 w-3.5" })), "Connect"] }), _jsx("button", { onClick: () => removeServer(srv.id), title: "Remove server", className: "p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors", children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] })] }) }, srv.id))), showForm ? (_jsxs("div", { className: "rounded-lg border border-border p-4 space-y-3", children: [_jsx("h3", { className: "text-sm font-medium", children: "Add MCP Server" }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs text-muted-foreground", children: "Name" }), _jsx("input", { value: formName, onChange: (e) => setFormName(e.target.value), placeholder: "My MCP Server", className: "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs text-muted-foreground", children: "Transport" }), _jsxs("select", { value: formTransport, onChange: (e) => setFormTransport(e.target.value), className: "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring", children: [_jsx("option", { value: "http", children: "HTTP (JSON-RPC)" }), _jsx("option", { value: "sse", children: "SSE (Server-Sent Events)" })] })] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs text-muted-foreground", children: "Server URL" }), _jsx("input", { value: formUrl, onChange: (e) => setFormUrl(e.target.value), placeholder: "https://mcp.example.com/rpc", className: "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs text-muted-foreground", children: "Authorization header (optional)" }), _jsx("input", { value: formAuthHeader, onChange: (e) => setFormAuthHeader(e.target.value), placeholder: "Bearer sk-...", className: "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" })] }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { onClick: resetForm, className: "px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors", children: "Cancel" }), _jsx("button", { onClick: () => void handleAdd(), disabled: !formName.trim() || !formUrl.trim(), className: "px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors", children: "Add Server" })] })] })) : (_jsxs("button", { onClick: () => setShowForm(true), className: "flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 w-full justify-center transition-colors", children: [_jsx(Plus, { className: "h-4 w-4" }), "Add MCP Server"] })), _jsxs("div", { className: "rounded-lg border border-border p-4 bg-muted/20", children: [_jsx("h3", { className: "text-sm font-medium mb-2", children: "About MCP" }), _jsx("p", { className: "text-xs text-muted-foreground", children: "The Model Context Protocol (MCP) lets AI models interact with external tools and data sources. Zenon implements MCP JSON-RPC 2.0 over HTTP. External servers must be publicly accessible or reachable through the Zenon proxy." })] })] }));
}
function SkillsSettings() {
    const { skills, addSkill, updateSkill, deleteSkill, toggleSkill } = useSkillStore();
    const [editingId, setEditingId] = useState(null);
    const [newName, setNewName] = useState("");
    const [showAddForm, setShowAddForm] = useState(false);
    function handleAdd() {
        if (!newName.trim())
            return;
        const id = addSkill(newName.trim(), "");
        setNewName("");
        setShowAddForm(false);
        setEditingId(id);
        toast.success("Global skill added");
    }
    return (_jsxs("div", { className: "space-y-6 max-w-2xl", children: [_jsxs("div", { children: [_jsxs("h2", { className: "text-base font-semibold flex items-center gap-2", children: [_jsx(FileText, { className: "h-4 w-4" }), " Global Skill Files"] }), _jsxs("p", { className: "mt-1 text-sm text-muted-foreground", children: ["Global skills (like ", _jsx("code", { className: "font-mono text-xs", children: "CLAUDE.md" }), ") are markdown documents prepended to every agent's system prompt. Use them for project conventions, coding standards, or any context that should always be available."] })] }), _jsxs("div", { className: "space-y-3", children: [skills.length === 0 && !showAddForm && (_jsxs("div", { className: "rounded-lg border border-dashed border-border px-4 py-8 text-center", children: [_jsx(FileText, { className: "mx-auto h-8 w-8 text-muted-foreground/40 mb-2" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "No global skills yet." }), _jsx("p", { className: "text-xs text-muted-foreground mt-1", children: "Add a markdown document to pre-load into every conversation." })] })), skills.map((sk) => (_jsxs("div", { className: "rounded-lg border border-border overflow-hidden", children: [_jsxs("div", { className: "flex items-center gap-2 px-3 py-2.5 bg-muted/40", children: [_jsx("button", { onClick: () => toggleSkill(sk.id), className: cn("h-4 w-7 rounded-full transition-colors relative shrink-0", sk.enabled ? "bg-primary" : "bg-muted-foreground/30"), title: sk.enabled ? "Disable" : "Enable", children: _jsx("div", { className: cn("absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform", sk.enabled ? "translate-x-3.5" : "translate-x-0.5") }) }), _jsx(FileText, { className: "h-3.5 w-3.5 text-muted-foreground shrink-0" }), _jsx("span", { className: "flex-1 text-sm font-medium truncate", children: sk.name }), _jsx("button", { onClick: () => setEditingId(editingId === sk.id ? null : sk.id), className: "text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted transition-colors", children: editingId === sk.id ? "Collapse" : "Edit" }), _jsx("button", { onClick: () => { deleteSkill(sk.id); if (editingId === sk.id)
                                            setEditingId(null); }, className: "p-1 text-muted-foreground hover:text-destructive transition-colors", title: "Delete", children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] }), editingId === sk.id && (_jsxs("div", { className: "px-3 py-2 space-y-2 border-t border-border", children: [_jsx("input", { value: sk.name, onChange: (e) => updateSkill(sk.id, { name: e.target.value }), className: "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring", placeholder: "Skill name (e.g. CONVENTIONS.md)" }), _jsx("textarea", { value: sk.content, onChange: (e) => updateSkill(sk.id, { content: e.target.value }), rows: 12, placeholder: "Enter markdown content...", className: "w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y" }), _jsx("div", { className: "flex justify-end", children: _jsxs("button", { onClick: () => { setEditingId(null); toast.success("Skill saved"); }, className: "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors", children: [_jsx(Save, { className: "h-3.5 w-3.5" }), " Save"] }) })] }))] }, sk.id))), showAddForm ? (_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { autoFocus: true, value: newName, onChange: (e) => setNewName(e.target.value), onKeyDown: (e) => { if (e.key === "Enter")
                                    handleAdd(); if (e.key === "Escape")
                                    setShowAddForm(false); }, placeholder: "Skill name (e.g. CONVENTIONS.md)", className: "flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" }), _jsx("button", { onClick: handleAdd, className: "px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors", children: "Add" }), _jsx("button", { onClick: () => setShowAddForm(false), className: "px-3 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors", children: _jsx(X, { className: "h-4 w-4" }) })] })) : (_jsxs("button", { onClick: () => setShowAddForm(true), className: "flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/50 transition-colors w-full", children: [_jsx(Plus, { className: "h-4 w-4" }), " Add global skill file"] }))] })] }));
}
function GeneralSettings() {
    const { theme, setTheme } = useTheme();
    return (_jsxs("div", { className: "space-y-6 max-w-2xl", children: [_jsx("div", { children: _jsx("h2", { className: "text-sm font-semibold mb-1", children: "Appearance" }) }), _jsxs("div", { className: "flex items-center justify-between rounded-lg border border-border px-4 py-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium", children: "Theme" }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Light, dark, or follow system" })] }), _jsx("div", { className: "flex gap-1 rounded-md border border-border p-0.5", children: ["light", "dark", "system"].map((t) => (_jsx("button", { onClick: () => setTheme(t), className: cn("rounded px-3 py-1 text-xs font-medium capitalize transition-colors", theme === t
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"), children: t }, t))) })] }), _jsxs("div", { className: "rounded-lg border border-border px-4 py-3", children: [_jsx("p", { className: "text-sm font-medium mb-2", children: "Data & Privacy" }), _jsx("p", { className: "text-xs text-muted-foreground", children: "All conversation history is stored locally in your browser (localStorage + IndexedDB). Workspace files are stored in OPFS (Origin Private File System). API keys are stored only in your browser and never sent to any server except the configured AI provider." }), _jsx("button", { className: "mt-3 text-sm text-destructive hover:underline", children: "Clear all local data" })] })] }));
}
