import { Hono } from "hono";
import { stream } from "hono/streaming";

export const anthropicRoutes = new Hono();

/**
 * Proxy POST /api/anthropic/messages → api.anthropic.com/v1/messages
 * Forwards Anthropic API requests to bypass CORS restrictions in browser.
 */
anthropicRoutes.post("/messages", async (c) => {
  const apiKey = c.req.header("x-api-key");
  const anthropicVersion =
    c.req.header("anthropic-version") ?? "2023-06-01";
  const body = await c.req.text();

  if (!apiKey) {
    return c.json({ error: "x-api-key header required" }, 401);
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": anthropicVersion,
    },
    body,
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return c.json({ error: errText }, upstream.status as 400 | 401 | 403 | 429 | 500);
  }

  const contentType = upstream.headers.get("content-type") ?? "application/json";
  c.header("Content-Type", contentType);

  if (upstream.body) {
    return stream(c, async (s) => {
      const reader = upstream.body!.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await s.write(value);
      }
    });
  }

  const data = await upstream.json() as unknown;
  return c.json(data);
});
