import { Hono } from "hono";

export const mcpRoutes = new Hono();

/**
 * Proxy POST /api/mcp → any MCP server (JSON-RPC 2.0)
 *
 * The browser passes:
 *   X-MCP-URL: https://target-mcp-server.example.com/rpc
 *   X-MCP-Headers: {"Authorization":"Bearer token",...}  (optional, JSON)
 *   Body: JSON-RPC 2.0 request
 */
mcpRoutes.post("/", async (c) => {
  const targetUrl = c.req.header("X-MCP-URL");
  if (!targetUrl) {
    return c.json({ error: "Missing X-MCP-URL header" }, 400);
  }

  // Parse optional extra headers the MCP server requires
  let extraHeaders: Record<string, string> = {};
  const headersJson = c.req.header("X-MCP-Headers");
  if (headersJson) {
    try {
      extraHeaders = JSON.parse(headersJson) as Record<string, string>;
    } catch {
      // ignore malformed extra headers
    }
  }

  const body = await c.req.text();

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Cannot reach MCP server: ${msg}` }, 502);
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    return c.json({ error: errText }, upstream.status as 400 | 401 | 403 | 404 | 500 | 502);
  }

  const data = await upstream.json() as unknown;
  return c.json(data);
});
