interface LocalModelState {
    status: "idle" | "loading" | "ready" | "error";
    modelId: string | null;
    loadingText: string;
    progress: number;
    progressFiles: Record<string, number>;
    error: string | null;
    webGPUSupported: boolean | null;
    checkWebGPU: () => Promise<void>;
    loadModel: (modelId: string) => Promise<void>;
    reset: () => void;
}
export declare const useLocalModelStore: import("zustand").UseBoundStore<import("zustand").StoreApi<LocalModelState>>;
export {};
