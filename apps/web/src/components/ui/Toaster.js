import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateId } from "@/lib/utils";
let addToastFn = null;
export function toast(t) {
    addToastFn?.(t);
}
toast.success = (title, description) => toast({ title, description, variant: "default" });
toast.error = (title, description) => toast({ title, description, variant: "destructive" });
export function Toaster() {
    const [toasts, setToasts] = useState([]);
    const addToast = useCallback((t) => {
        const id = generateId();
        setToasts((prev) => [...prev, { ...t, id }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((x) => x.id !== id));
        }, 5000);
    }, []);
    // Register globally
    addToastFn = addToast;
    return (_jsx("div", { className: "fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm", children: toasts.map((t) => (_jsxs("div", { className: cn("flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg animate-fade-in bg-background", t.variant === "destructive"
                ? "border-destructive/30 bg-destructive/10"
                : "border-border"), children: [_jsxs("div", { className: "flex-1", children: [_jsx("p", { className: "text-sm font-medium", children: t.title }), t.description && (_jsx("p", { className: "text-xs text-muted-foreground mt-0.5", children: t.description }))] }), _jsx("button", { onClick: () => setToasts((prev) => prev.filter((x) => x.id !== t.id)), className: "text-muted-foreground hover:text-foreground", children: _jsx(X, { className: "h-4 w-4" }) })] }, t.id))) }));
}
