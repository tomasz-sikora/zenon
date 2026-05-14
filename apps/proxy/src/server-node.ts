/** Node.js entry point — used by Docker. Uses @hono/node-server. */
import { serve } from "@hono/node-server";
import { app, port } from "./index.js";

serve(
  { fetch: app.fetch, port, hostname: "0.0.0.0" },
  () => console.log(`🚀 Zenon proxy (Node.js) listening on http://0.0.0.0:${port}`),
);
