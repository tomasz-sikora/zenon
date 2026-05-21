/**
 * MCP (Model Context Protocol) JSON-RPC 2.0 client.
 *
 * Supports HTTP/SSE transports for connecting to external MCP servers.
 * Tools discovered from MCP servers are registered in the local tool registry.
 */
import { toolRegistry } from "@/lib/tools/registry";
let _reqId = 1;
async function sendRequest(url, method, params, headers) {
    const request = {
        jsonrpc: "2.0",
        id: _reqId++,
        method,
        params,
    };
    // Route through the local proxy to avoid CORS when calling external MCP servers.
    // The proxy reads X-MCP-URL and X-MCP-Headers and forwards the JSON-RPC request.
    const proxyHeaders = {
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
    const json = (await response.json());
    if (json.error) {
        throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
    }
    return json.result;
}
/** Initialize an MCP session (handshake). */
async function initialize(url, headers) {
    await sendRequest(url, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        clientInfo: { name: "Zenon", version: "0.1.0" },
    }, headers);
}
/** List tools from an MCP server. */
async function listTools(url, headers) {
    const result = await sendRequest(url, "tools/list", {}, headers);
    return result.tools ?? [];
}
/** Call a tool on an MCP server. */
async function callTool(url, name, args, headers) {
    return sendRequest(url, "tools/call", { name, arguments: args }, headers);
}
/**
 * Connect to an MCP server: initialize, discover tools, register them in the tool registry.
 * Returns the list of tool names discovered.
 */
export async function connectMcpServer(server) {
    const { url, headers } = server;
    await initialize(url, headers);
    const tools = await listTools(url, headers);
    const toolNames = [];
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
export async function testMcpConnection(server) {
    await initialize(server.url, server.headers);
    const tools = await listTools(server.url, server.headers);
    return tools.length;
}
