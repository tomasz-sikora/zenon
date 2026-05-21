import { create } from "zustand";
import { persist } from "zustand/middleware";
import { generateId } from "@/lib/utils";
export const useSkillStore = create()(persist((set) => ({
    skills: [],
    addSkill: (name, content) => {
        const id = generateId();
        set((s) => ({
            skills: [...s.skills, { id, name, content, enabled: true }],
        }));
        return id;
    },
    updateSkill: (id, patch) => {
        set((s) => ({
            skills: s.skills.map((sk) => (sk.id === id ? { ...sk, ...patch } : sk)),
        }));
    },
    deleteSkill: (id) => {
        set((s) => ({ skills: s.skills.filter((sk) => sk.id !== id) }));
    },
    toggleSkill: (id) => {
        set((s) => ({
            skills: s.skills.map((sk) => sk.id === id ? { ...sk, enabled: !sk.enabled } : sk),
        }));
    },
}), { name: "zenon-skills" }));
