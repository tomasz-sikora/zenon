import { create } from "zustand";
import { persist } from "zustand/middleware";
import { generateId } from "@/lib/utils";

export interface GlobalSkill {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  /** Predefined skills cannot be deleted */
  predefined?: boolean;
}

export const PREDEFINED_SKILLS: GlobalSkill[] = [
  {
    id: "predefined-code-style",
    name: "CODE_STYLE.md",
    content:
`# Code Style Guidelines

- Use consistent naming conventions (camelCase for variables/functions, PascalCase for classes/components).
- Prefer \`const\` over \`let\`; avoid \`var\`.
- Keep functions small and focused on a single responsibility.
- Use meaningful variable and function names that convey intent.
- Add JSDoc or inline comments only when the logic is non-obvious.`,
    enabled: true,
    predefined: true,
  },
  {
    id: "predefined-response-format",
    name: "RESPONSE_FORMAT.md",
    content:
`# Response Formatting

- Be concise and direct.
- Use markdown formatting (headings, lists, code blocks) for readability.
- When showing code, always specify the language in fenced code blocks.
- Separate explanation from code with clear headings.
- Summarize changes at the end when modifying multiple files.`,
    enabled: true,
    predefined: true,
  },
  {
    id: "predefined-safety",
    name: "SAFETY.md",
    content:
`# Safety & Security Rules

- Never output secrets, API keys, or credentials.
- Sanitize all user inputs before use in queries or commands.
- Prefer parameterized queries over string concatenation for database access.
- Validate and escape data to prevent XSS, SQL injection, and command injection.
- Follow the principle of least privilege when suggesting permissions or access scopes.`,
    enabled: true,
    predefined: true,
  },
];

function mergePredefined(persisted: GlobalSkill[]): GlobalSkill[] {
  const existingIds = new Set(persisted.map((s) => s.id));
  const missing = PREDEFINED_SKILLS.filter((p) => !existingIds.has(p.id));
  // Ensure predefined flag is always set on predefined skills even after rehydration
  const merged = persisted.map((s) => {
    const pre = PREDEFINED_SKILLS.find((p) => p.id === s.id);
    return pre ? { ...s, predefined: true } : s;
  });
  return [...missing, ...merged];
}

interface SkillStore {
  skills: GlobalSkill[];
  addSkill: (name: string, content: string) => string;
  updateSkill: (id: string, patch: Partial<Omit<GlobalSkill, "id">>) => void;
  deleteSkill: (id: string) => void;
  toggleSkill: (id: string) => void;
}

export const useSkillStore = create<SkillStore>()(
  persist(
    (set) => ({
      skills: [...PREDEFINED_SKILLS],

      addSkill: (name, content) => {
        const id = generateId();
        set((s) => ({
          skills: [...s.skills, { id, name, content, enabled: true }],
        }));
        return id;
      },

      updateSkill: (id, patch) => {
        set((s) => ({
          skills: s.skills.map((sk) => {
            if (sk.id !== id) return sk;
            // Predefined skills cannot have their name changed
            if (sk.predefined) {
              const { name: _name, predefined: _predefined, ...allowed } = patch as Partial<GlobalSkill>;
              return { ...sk, ...allowed };
            }
            return { ...sk, ...patch };
          }),
        }));
      },

      deleteSkill: (id) => {
        set((s) => ({ skills: s.skills.filter((sk) => sk.id !== id || sk.predefined) }));
      },

      toggleSkill: (id) => {
        set((s) => ({
          skills: s.skills.map((sk) =>
            sk.id === id ? { ...sk, enabled: !sk.enabled } : sk,
          ),
        }));
      },
    }),
    {
      name: "zenon-skills",
      merge: (persisted, current) => {
        const persistedState = persisted as SkillStore | undefined;
        if (!persistedState) return current;
        return {
          ...current,
          ...persistedState,
          skills: mergePredefined(persistedState.skills ?? []),
        };
      },
    },
  ),
);
