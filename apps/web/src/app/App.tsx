import { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./routes";
import { ThemeProvider } from "./ThemeProvider";
import { Toaster } from "@/components/ui/Toaster";
import { useMcpStore } from "@/store/mcpStore";
import { connectMcpServer } from "@/lib/mcp/client";

function McpAutoConnect() {
  const servers = useMcpStore((s) => s.servers);
  const updateServer = useMcpStore((s) => s.updateServer);

  useEffect(() => {
    const enabled = servers.filter((s) => s.enabled);
    if (enabled.length === 0) return;

    for (const server of enabled) {
      connectMcpServer(server)
        .then((toolNames) => {
          updateServer(server.id, {
            discoveredTools: toolNames,
            lastConnected: Date.now(),
            error: undefined,
          });
        })
        .catch((err: unknown) => {
          updateServer(server.id, {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
  // Run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <McpAutoConnect />
        <AppRoutes />
        <Toaster />
      </BrowserRouter>
    </ThemeProvider>
  );
}
