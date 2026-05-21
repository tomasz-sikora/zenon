import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { chatRoutes } from "./routes/chat";
import { anthropicRoutes } from "./routes/anthropic";
import { bedrockRoutes } from "./routes/bedrock";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-api-key", "anthropic-version", "X-Provider-Base-URL"],
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
