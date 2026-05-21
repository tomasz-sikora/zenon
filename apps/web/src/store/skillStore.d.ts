export interface GlobalSkill {
    id: string;
    name: string;
    content: string;
    enabled: boolean;
}
interface SkillStore {
    skills: GlobalSkill[];
    addSkill: (name: string, content: string) => string;
    updateSkill: (id: string, patch: Partial<Omit<GlobalSkill, "id">>) => void;
    deleteSkill: (id: string) => void;
    toggleSkill: (id: string) => void;
}
export declare const useSkillStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<SkillStore>, "setState" | "persist"> & {
    setState(partial: SkillStore | Partial<SkillStore> | ((state: SkillStore) => SkillStore | Partial<SkillStore>), replace?: false | undefined): unknown;
    setState(state: SkillStore | ((state: SkillStore) => SkillStore), replace: true): unknown;
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<SkillStore, SkillStore, unknown>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: SkillStore) => void) => () => void;
        onFinishHydration: (fn: (state: SkillStore) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<SkillStore, SkillStore, unknown>>;
    };
}>;
export {};
