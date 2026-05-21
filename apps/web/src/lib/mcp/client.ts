/**
 * MCP (Model Context Protocol) JSON-RPC 2.0 client.
 *
 * Supports HTTP/SSE transports for connecting to external MCP servers.
 * Tools discovered from MCP servers are registered in the local tool registry.
 */

import type { McpServerConfig } from "@/store/mcpStore";
import { toolRegistry } from "@/lib/tools/registry";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, { type: string; description?: string; [k: string]: unknown }>;
    required?: string[];
  };
}

interface McpToolsListResult {
  tools: McpTool[];
}

interface McpToolCallResult {
  content: Array<{ type: string; text?: string; [k: string]: unknown }>;
  isError?: boolean;
}

let _reqId = 1;

async function sendRequest<T>(
  url: string,
  method: string,
  params?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: _reqId++,
    method,
    params,
  };

  // Route through the local proxy to avoid CORS when calling external MCP servers.
  // The proxy reads X-MCP-URL and X-MCP-Headers and forwards the JSON-RPC request.
  const proxyHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "X-MCP-URL": url,
  };
  if (headers && Object.keys(headers).length > 0) {
    proxyHeaders["X-MCP-Headers"] = JSON.stringify(headers);
  }

  const response = await fetch("/api/mcp", {
    method: "POST",
    headers: proxyHeaders,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`MCP HTTP error ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as JsonRpcResponse<T>;

  if (json.error) {
    throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
  }

  return json.result as T;
}

/** Initialize an MCP session (handshake). */
async function initialize(
  url: string,
  headers?: Record<string, string>,
): Promise<void> {
  await sendRequest(
    url,
    "initialize",
    {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      clientInfo: { name: "Zenon", version: "0.1.0" },
    },
    headers,
  );
}

/** List tools from an MCP server. */
async function listTools(
  url: string,
  headers?: Record<string, string>,
): Promise<McpTool[]> {
  const result = await sendRequest<McpToolsListResult>(
    url,
    "tools/list",
    {},
    headers,
  );
  return result.tools ?? [];
}

/** Call a tool on an MCP server. */
async function callTool(
  url: string,
  name: string,
  args: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<McpToolCallResult> {
  return sendRequest<McpToolCallResult>(
    url,
    "tools/call",
    { name, arguments: args },
    headers,
  );
}

/**
 * Connect to an MCP server: initialize, discover tools, register them in the tool registry.
 * Returns the list of tool names discovered.
 */
export async function connectMcpServer(
  server: McpServerConfig,
): Promise<string[]> {
  const { url, headers } = server;

  await initialize(url, headers);
  const tools = await listTools(url, headers);

  const toolNames: string[] = [];

  for (const tool of tools) {
    const toolName = `mcp:${server.id}:${tool.name}`;
    toolNames.push(toolName);

    toolRegistry.register({
      name: toolName,
      description: `[${server.name}] ${tool.description ?? tool.name}`,
      inputSchema: {
        type: "object",
        properties: tool.inputSchema.properties ?? {},
        required: tool.inputSchema.required,
      },
      category: "web",
      execute: async (args) => {
        const result = await callTool(url, tool.name, args, headers);
        const text = result.content
          .map((c) => c.text ?? JSON.stringify(c))
          .join("\n");
        if (result.isError) {
          throw new Error(text);
        }
        return text;
      },
    });
  }

  return toolNames;
}

/**
 * Test connection to an MCP server.
 * Returns tool count on success, throws on failure.
 */
export async function testMcpConnection(
  server: McpServerConfig,
): Promise<number> {
  await initialize(server.url, server.headers);
  const tools = await listTools(server.url, server.headers);
  return tools.length;
}
