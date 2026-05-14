import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./AppShell";

const ChatPage = lazy(() => import("@/features/chat/ChatPage"));
const WorkspacePage = lazy(() => import("@/features/workspace/WorkspacePage"));
const AgentsPage = lazy(() => import("@/features/agents/AgentsPage"));
const RagPage = lazy(() => import("@/features/rag/RagPage"));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage"));

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/chat" replace />} />
        <Route
          path="chat"
          element={
            <Suspense fallback={<PageLoader />}>
              <ChatPage />
            </Suspense>
          }
        />
        <Route
          path="chat/:conversationId"
          element={
            <Suspense fallback={<PageLoader />}>
              <ChatPage />
            </Suspense>
          }
        />
        <Route
          path="workspace"
          element={
            <Suspense fallback={<PageLoader />}>
              <WorkspacePage />
            </Suspense>
          }
        />
        <Route
          path="workspace/:workspaceId"
          element={
            <Suspense fallback={<PageLoader />}>
              <WorkspacePage />
            </Suspense>
          }
        />
        <Route
          path="agents"
          element={
            <Suspense fallback={<PageLoader />}>
              <AgentsPage />
            </Suspense>
          }
        />
        <Route
          path="agents/:agentId"
          element={
            <Suspense fallback={<PageLoader />}>
              <AgentsPage />
            </Suspense>
          }
        />
        <Route
          path="rag"
          element={
            <Suspense fallback={<PageLoader />}>
              <RagPage />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<PageLoader />}>
              <SettingsPage />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
