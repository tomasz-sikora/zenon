import type { ToolDefinition, ToolResult } from "@zenon/shared-types";
export type ToolExecutor = (input: Record<string, unknown>, signal?: AbortSignal) => Promise<ToolResult>;
export interface RegisteredTool {
    definition: ToolDefinition;
    executor: ToolExecutor;
}
/** Simplified registration format with inline execute function */
export interface SimpleToolRegistration {
    name: string;
    description: string;
    inputSchema: ToolDefinition["inputSchema"];
    category?: string;
    execute: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
}
declare class ToolRegistry {
    private tools;
    register(tool: RegisteredTool | SimpleToolRegistration): void;
    get(name: string): RegisteredTool | undefined;
    getAll(): RegisteredTool[];
    getDefinitions(): ToolDefinition[];
    getDefinitionsByNames(names: string[]): ToolDefinition[];
    execute(name: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult>;
}
export declare const toolRegistry: ToolRegistry;
export {};
