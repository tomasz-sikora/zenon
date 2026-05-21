import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./AppShell";
const ChatPage = lazy(() => import("@/features/chat/ChatPage"));
const WorkspacePage = lazy(() => import("@/features/workspace/WorkspacePage"));
const AgentsPage = lazy(() => import("@/features/agents/AgentsPage"));
const RagPage = lazy(() => import("@/features/rag/RagPage"));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage"));
function PageLoader() {
    return (_jsx("div", { className: "flex h-full items-center justify-center", children: _jsx("div", { className: "h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" }) }));
}
export function AppRoutes() {
    return (_jsx(Routes, { children: _jsxs(Route, { element: _jsx(AppShell, {}), children: [_jsx(Route, { index: true, element: _jsx(Navigate, { to: "/chat", replace: true }) }), _jsx(Route, { path: "chat", element: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(ChatPage, {}) }) }), _jsx(Route, { path: "chat/:conversationId", element: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(ChatPage, {}) }) }), _jsx(Route, { path: "workspace", element: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(WorkspacePage, {}) }) }), _jsx(Route, { path: "workspace/:workspaceId", element: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(WorkspacePage, {}) }) }), _jsx(Route, { path: "agents", element: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(AgentsPage, {}) }) }), _jsx(Route, { path: "agents/:agentId", element: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(AgentsPage, {}) }) }), _jsx(Route, { path: "rag", element: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(RagPage, {}) }) }), _jsx(Route, { path: "settings", element: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(SettingsPage, {}) }) })] }) }));
}
