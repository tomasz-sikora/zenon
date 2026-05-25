import { create } from "zustand";
import { localWebGPUProvider } from "@/lib/providers/local-webgpu";

const SUPPORTED_MODEL_ID = "mistralai/Ministral-3-3B-Instruct-2512-ONNX";

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

const initialState = {
  status: "idle" as const,
  modelId: null as string | null,
  loadingText: "",
  progress: 0,
  progressFiles: {},
  error: null as string | null,
  webGPUSupported: null as boolean | null,
};

export const useLocalModelStore = create<LocalModelState>((set, get) => ({
  ...initialState,

  checkWebGPU: async () => {
    if (typeof navigator === "undefined") {
      set({ webGPUSupported: false });
      return;
    }

    const gpuNavigator = navigator as Navigator & {
      gpu?: {
        requestAdapter?: () => Promise<unknown>;
      };
    };

    if (!gpuNavigator.gpu?.requestAdapter) {
      set({ webGPUSupported: false });
      return;
    }

    try {
      const adapter = await gpuNavigator.gpu.requestAdapter();
      set({ webGPUSupported: !!adapter });
    } catch {
      set({ webGPUSupported: false });
    }
  },

  loadModel: async (modelId) => {
    if (modelId !== SUPPORTED_MODEL_ID) {
      set({
        status: "error",
        modelId,
        error: `Unsupported local model: ${modelId}. Only ${SUPPORTED_MODEL_ID} is supported.`,
      });
      return;
    }

    if (get().webGPUSupported === null) {
      await get().checkWebGPU();
    }

    if (!get().webGPUSupported) {
      set({
        status: "error",
        modelId,
        error: "WebGPU is not supported in this browser.",
      });
      return;
    }

    set({
      status: "loading",
      modelId,
      loadingText: `Loading ${modelId}…`,
      progress: 0,
      progressFiles: {},
      error: null,
    });

    try {
      await localWebGPUProvider.preload((message) => {
        set((state) => {
          const fileKey = message.file;
          const progressFiles = fileKey
            ? {
                ...state.progressFiles,
                [fileKey]: message.progress ?? 0,
              }
            : state.progressFiles;

          const fileProgressValues = Object.values(progressFiles);
          const averagedProgress =
            fileProgressValues.length > 0
              ? fileProgressValues.reduce((sum, value) => sum + value, 0) / fileProgressValues.length
              : message.status === "ready"
                ? 100
                : state.progress;

          return {
            status: message.status === "ready" ? "ready" : "loading",
            modelId,
            loadingText: message.data ?? state.loadingText,
            progress: Math.max(0, Math.min(100, averagedProgress)),
            progressFiles,
            error: null,
          };
        });
      });

      set({
        status: "ready",
        modelId,
        loadingText: "Model ready",
        progress: 100,
        error: null,
      });
    } catch (error) {
      set({
        status: "error",
        modelId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  reset: () => {
    set(initialState);
  },
}));
