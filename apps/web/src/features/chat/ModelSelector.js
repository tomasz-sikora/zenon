import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ChevronDown } from "lucide-react";
import { useProviderStore } from "@/store/providerStore";
import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
export function ModelSelector({ selectedProviderId, selectedModelId, onSelect, }) {
    const providers = useProviderStore((s) => s.providers);
    const models = useMemo(() => providers
        .filter((p) => p.enabled)
        .flatMap((p) => p.models.map((m) => ({ ...m, providerId: p.id, providerName: p.name }))), [providers]);
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const selected = models.find((m) => m.providerId === selectedProviderId && m.id === selectedModelId);
    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);
    // Group by provider
    const grouped = models.reduce((acc, m) => {
        if (!acc[m.providerId]) {
            acc[m.providerId] = { name: m.providerName, models: [] };
        }
        acc[m.providerId].models.push(m);
        return acc;
    }, {});
    return (_jsxs("div", { ref: ref, className: "relative", children: [_jsxs("button", { onClick: () => setOpen((v) => !v), className: "flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors", children: [selected ? (_jsxs(_Fragment, { children: [_jsx("span", { children: selected.name }), _jsxs("span", { className: "text-muted-foreground text-[10px]", children: ["(", selected.providerName, ")"] })] })) : (_jsx("span", { className: "text-muted-foreground", children: "Select model" })), _jsx(ChevronDown, { className: cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180") })] }), open && (_jsx("div", { className: "absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-border bg-popover shadow-lg overflow-hidden", children: _jsxs("div", { className: "max-h-80 overflow-y-auto py-1", children: [Object.entries(grouped).map(([providerId, group]) => (_jsxs("div", { children: [_jsx("div", { className: "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", children: group.name }), group.models.map((model) => (_jsxs("button", { onClick: () => {
                                        onSelect(providerId, model.id);
                                        setOpen(false);
                                    }, className: cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-accent text-left", selectedProviderId === providerId &&
                                        selectedModelId === model.id &&
                                        "bg-accent"), children: [_jsx("span", { children: model.name }), _jsxs("div", { className: "flex gap-1 shrink-0", children: [model.supportsVision && (_jsx("span", { className: "text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded px-1", children: "vision" })), model.isLocal && (_jsx("span", { className: "text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 rounded px-1", children: "local" }))] })] }, model.id)))] }, providerId))), models.length === 0 && (_jsx("div", { className: "px-3 py-4 text-center text-sm text-muted-foreground", children: "No providers enabled. Configure them in Settings." }))] }) }))] }));
}
