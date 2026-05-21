import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { chatRoutes } from "./routes/chat";
import { anthropicRoutes } from "./routes/anthropic";
import { bedrockRoutes } from "./routes/bedrock";
import { geminiRoutes } from "./routes/gemini";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-api-key", "anthropic-version", "X-Provider-Base-URL", "X-Gemini-API-Key", "X-MCP-URL", "X-MCP-Headers"],
    exposeHeaders: ["Content-Type"],
  }),
);

// Health check
app.get("/health", (c) =>
  c.json({ status: "ok", version: "0.1.0", timestamp: new Date().toISOString() }),
);

// Routes
app.route("/api/chat", chatRoutes);
app.route("/api/anthropic", anthropicRoutes);
app.route("/api/bedrock", bedrockRoutes);
app.route("/api/gemini", geminiRoutes);

/**
 * MCP proxy: POST /api/mcp
 * Forwards JSON-RPC 2.0 to any MCP server URL passed via X-MCP-URL header.
 */
app.post("/api/mcp", async (c) => {
  const targetUrl = c.req.header("X-MCP-URL");
  if (!targetUrl) {
    return c.json({ error: "Missing X-MCP-URL header" }, 400);
  }

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
      headers: { "Content-Type": "application/json", ...extraHeaders },
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

// 404
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Proxy error:", err);
  return c.json({ error: err.message }, 500);
});

const port = parseInt(process.env["PORT"] ?? "3001", 10);
console.log(`🚀 Zenon proxy listening on http://0.0.0.0:${port}`);

export { app, port };

// Bun entry point
export default {
  port,
  fetch: app.fetch,
};
