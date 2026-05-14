import { Hono } from "hono";
import { stream } from "hono/streaming";

export const chatRoutes = new Hono();

/**
 * Proxy POST /api/chat → any OpenAI-compatible endpoint
 * 
 * The client passes:
 * - Authorization: Bearer <apikey>
 * - X-Provider-Base-URL: https://api.openai.com/v1  (optional, defaults to OpenAI)
 * - Body: OpenAI chat completions request
 */
chatRoutes.post("/completions", async (c) => {
  const auth = c.req.header("Authorization");
  const baseUrl =
    c.req.header("X-Provider-Base-URL") ?? "https://api.openai.com/v1";
  const body = await c.req.text();

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth ?? "",
    },
    body,
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return c.json({ error: errText }, upstream.status as 400 | 401 | 403 | 404 | 429 | 500);
  }

  // Stream the response back
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
