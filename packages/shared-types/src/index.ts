// ─── Message & Conversation ────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  /** data: URI or OPFS path */
  url: string;
  mimeType: string;
}

export interface FileContent {
  type: "file";
  name: string;
  /** OPFS path or data URI */
  url: string;
  mimeType: string;
  size: number;
}

export interface ToolUseContent {
  type: "tool_use";
  toolCallId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface ToolResultContent {
  type: "tool_result";
  toolCallId: string;
  toolName: string;
  isError: boolean;
  content: string;
}

export interface ThinkingContent {
  type: "thinking";
  /** Extended reasoning / chain-of-thought text from the model */
  thinking: string;
}

export type MessageContent =
  | TextContent
  | ImageContent
  | FileContent
  | ToolUseContent
  | ToolResultContent
  | ThinkingContent;

export interface Message {
  id: string;
  role: MessageRole;
  content: MessageContent[];
  createdAt: number;
  /** If this message was regenerated from a parent */
  parentId?: string;
  /** Branch index for forked conversations */
  branchIndex?: number;
  modelId?: string;
  providerId?: string;
  /** Token usage for assistant messages */
  usage?: TokenUsage;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  title: string;
  agentId?: string;
  model: ModelRef;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  tags?: string[];
}

export interface ModelRef {
  providerId: string;
  modelId: string;
}

// ─── Providers ─────────────────────────────────────────────────────────────

export type ProviderType =
  | "openai"
  | "openai-compatible"
  | "anthropic"
  | "gemini"
  | "bedrock"
  | "local-webgpu"
  | "local-wasm";

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  baseUrl?: string;
  /** Stored encrypted in localStorage */
  hasApiKey: boolean;
  models: ModelInfo[];
  enabled: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  supportsVision?: boolean;
  supportsFunctionCalling?: boolean;
  supportsStreaming?: boolean;
  isLocal?: boolean;
}

// ─── Tools & MCP ───────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
  };
  category: ToolCategory;
  requiresWorker?: boolean;
}

export type ToolCategory =
  | "code"
  | "workspace"
  | "web"
  | "office"
  | "visual"
  | "speech"
  | "rag"
  | "utility";

export interface JsonSchemaProperty {
  type: string;
  description?: string;
  enum?: unknown[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  default?: unknown;
}

export interface ToolCall {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  isError: boolean;
  content: string;
  /** Optional artifact saved to workspace */
  artifactPath?: string;
}

// ─── Agents ────────────────────────────────────────────────────────────────

/** A named markdown skill document pre-loaded into the agent context (like CLAUDE.md) */
export interface AgentSkillFile {
  name: string;
  content: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  avatar: string;
  instructions: string;
  model: ModelRef;
  tools: string[];
  /** OPFS file paths for RAG knowledge */
  knowledgeFiles: string[];
  ragEnabled: boolean;
  createdAt: number;
  updatedAt: number;
  isBuiltIn?: boolean;
  tags?: string[];
  /** Named markdown skill files prepended to the system prompt */
  skillFiles?: AgentSkillFile[];
}

// ─── Workspaces ────────────────────────────────────────────────────────────

export interface WorkspaceMeta {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  conversationCount: number;
  fileCount: number;
  totalSize: number;
}

export interface WorkspaceFile {
  name: string;
  path: string;
  size: number;
  mimeType: string;
  createdAt: number;
  updatedAt: number;
  isDirectory: boolean;
  children?: WorkspaceFile[];
}

// ─── RAG ───────────────────────────────────────────────────────────────────

export interface RagDocument {
  id: string;
  workspaceId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  chunkCount: number;
  indexedAt: number;
}

export interface RagChunk {
  id: string;
  documentId: string;
  text: string;
  pageNumber?: number;
  startChar: number;
  endChar: number;
}

export interface RagSearchResult {
  chunk: RagChunk;
  document: RagDocument;
  score: number;
}

// ─── Settings ──────────────────────────────────────────────────────────────

export interface UserSettings {
  theme: "light" | "dark" | "system";
  language: string;
  defaultProviderId: string;
  defaultModelId: string;
  defaultWorkspaceId?: string;
  streamingEnabled: boolean;
  sendOnEnter: boolean;
  showTokenCount: boolean;
  ttsEnabled: boolean;
  ttsVoice?: string;
  asrEnabled: boolean;
  asrLanguage: string;
}

// ─── Worker Messages ───────────────────────────────────────────────────────

export interface WorkerRequest<T = unknown> {
  requestId: string;
  type: string;
  payload: T;
}

export interface WorkerResponse<T = unknown> {
  requestId: string;
  type: string;
  success: boolean;
  payload?: T;
  error?: string;
}

export interface StreamChunk {
  requestId: string;
  type: "stream_chunk";
  text: string;
  done: boolean;
}

// ─── Proxy API ─────────────────────────────────────────────────────────────

export interface ProxyChatRequest {
  providerId: string;
  modelId: string;
  messages: Array<{
    role: MessageRole;
    content: string | MessageContent[];
  }>;
  tools?: ToolDefinition[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export type ApiError = {
  code: string;
  message: string;
  statusCode: number;
};
