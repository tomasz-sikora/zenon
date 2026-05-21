/**
 * MCP (Model Context Protocol) JSON-RPC 2.0 client.
 *
 * Supports HTTP/SSE transports for connecting to external MCP servers.
 * Tools discovered from MCP servers are registered in the local tool registry.
 */
import type { McpServerConfig } from "@/store/mcpStore";
/**
 * Connect to an MCP server: initialize, discover tools, register them in the tool registry.
 * Returns the list of tool names discovered.
 */
export declare function connectMcpServer(server: McpServerConfig): Promise<string[]>;
/**
 * Test connection to an MCP server.
 * Returns tool count on success, throws on failure.
 */
export declare function testMcpConnection(server: McpServerConfig): Promise<number>;
