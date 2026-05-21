import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";
export function AppShell() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const closeSidebarOnMobile = () => {
        if (window.matchMedia("(max-width: 767px)").matches) {
            setSidebarOpen(false);
        }
    };
    return (_jsxs("div", { className: "flex h-screen w-full overflow-hidden bg-background", children: [_jsx("aside", { className: cn("flex h-full flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200", sidebarOpen ? "w-64 min-w-[16rem]" : "w-0 overflow-hidden min-w-0"), children: _jsx(Sidebar, { onClose: closeSidebarOnMobile }) }), _jsx("main", { className: "flex flex-1 flex-col overflow-hidden", children: _jsx(Outlet, { context: { sidebarOpen, setSidebarOpen } }) }), sidebarOpen && (_jsx("div", { className: "fixed inset-0 z-20 bg-black/50 md:hidden", onClick: () => setSidebarOpen(false) }))] }));
}
