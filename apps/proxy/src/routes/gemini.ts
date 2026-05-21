import { Hono } from "hono";
import { stream } from "hono/streaming";

export const geminiRoutes = new Hono();

/**
 * Proxy POST /api/gemini/* → generativelanguage.googleapis.com/v1beta/*
 *
 * The browser passes:
 *   X-Gemini-API-Key: <apiKey>
 *   Body: Gemini generateContent / streamGenerateContent request
 *
 * The proxy reconstructs the real URL (with key as query param) and forwards.
 */
geminiRoutes.post("/*", async (c) => {
  // c.req.path is like /api/gemini/models/gemini-2.5-flash:streamGenerateContent
  // Strip the /api/gemini prefix to get the downstream path segment
  const fullPath = c.req.path; // e.g. /api/gemini/models/foo:streamGenerateContent
  const downstream = fullPath.replace(/^\/api\/gemini\/?/, ""); // models/foo:streamGenerateContent

  const apiKey = c.req.header("X-Gemini-API-Key");
  const body = await c.req.text();

  // Preserve any query params from the original request (e.g. alt=sse)
  const originalQuery = new URL(c.req.url).search; // "?alt=sse" or ""
  const keySuffix = apiKey
    ? (originalQuery ? `&key=${apiKey}` : `?key=${apiKey}`)
    : "";
  const url = `https://generativelanguage.googleapis.com/v1beta/${downstream}${originalQuery}${keySuffix}`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
