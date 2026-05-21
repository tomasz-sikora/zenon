import { describe, it, expect } from "vitest";
import { BUILTIN_AGENTS, DEFAULT_AGENT_TOOLS } from "@/store/agentStore";

describe("built-in agent definitions", () => {
  it("includes python and workspace file operation defaults in every built-in agent", () => {
    for (const agent of BUILTIN_AGENTS) {
      for (const tool of DEFAULT_AGENT_TOOLS) {
        expect(agent.tools).toContain(tool);
      }
    }
  });

  it("includes additional built-in agent ideas", () => {
    const ids = BUILTIN_AGENTS.map((agent) => agent.id);
    expect(ids).toContain("office-assistant");
    expect(ids).toContain("workflow-designer");
  });

  it("provides example skill files for built-in agents", () => {
    for (const agent of BUILTIN_AGENTS) {
      expect(agent.skillFiles?.length ?? 0).toBeGreaterThan(0);
      expect(agent.skillFiles?.[0]?.name).toBeTruthy();
      expect(agent.skillFiles?.[0]?.content).toBeTruthy();
    }
  });
});
