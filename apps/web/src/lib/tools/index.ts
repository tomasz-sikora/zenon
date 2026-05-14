// Bootstrap file: import all tool registrations
// This file is imported once at app startup to register all tools

import "./builtinTools";
import "./workspaceTools";
import "./pyodideTools";
import "./officeTools";
import "./visualTools";
import "@/lib/rag/ragTool";

// Phase 11: Speech tools
// import "./speechTools";

export { toolRegistry } from "./registry";
