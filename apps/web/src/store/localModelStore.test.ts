import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useLocalModelStore } from "@/store/localModelStore";

// ─── Mock the local-webgpu provider ─────────────────────────────────────────
vi.mock("@/lib/providers/local-webgpu", () => ({
  localWebGPUProvider: {
    preload: vi.fn(),
  },
}));

import { localWebGPUProvider } from "@/lib/providers/local-webgpu";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const VALID_MODEL = "mistralai/Ministral-3-3B-Instruct-2512-ONNX";
const UNKNOWN_MODEL = "onnx-community/Llama-3.2-1B-Instruct";

function resetStore() {
  useLocalModelStore.getState().reset();
}

function setWebGPU(supported: boolean | null) {
  useLocalModelStore.setState({ webGPUSupported: supported });
}

describe("useLocalModelStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── checkWebGPU ────────────────────────────────────────────────────────────

  describe("checkWebGPU", () => {
    it("sets webGPUSupported=false when navigator.gpu is absent", async () => {
      const original = (navigator as Record<string, unknown>).gpu;
      delete (navigator as Record<string, unknown>).gpu;

      await useLocalModelStore.getState().checkWebGPU();
      expect(useLocalModelStore.getState().webGPUSupported).toBe(false);

      if (original !== undefined) {
        (navigator as Record<string, unknown>).gpu = original;
      }
    });

    it("sets webGPUSupported=false when requestAdapter returns null", async () => {
      Object.defineProperty(navigator, "gpu", {
        value: { requestAdapter: vi.fn().mockResolvedValue(null) },
        configurable: true,
        writable: true,
      });

      await useLocalModelStore.getState().checkWebGPU();
      expect(useLocalModelStore.getState().webGPUSupported).toBe(false);
    });

    it("sets webGPUSupported=true when requestAdapter returns an adapter", async () => {
      Object.defineProperty(navigator, "gpu", {
        value: { requestAdapter: vi.fn().mockResolvedValue({}) },
        configurable: true,
        writable: true,
      });

      await useLocalModelStore.getState().checkWebGPU();
      expect(useLocalModelStore.getState().webGPUSupported).toBe(true);
    });

    it("sets webGPUSupported=false when requestAdapter throws", async () => {
      Object.defineProperty(navigator, "gpu", {
        value: { requestAdapter: vi.fn().mockRejectedValue(new Error("GPU error")) },
        configurable: true,
        writable: true,
      });

      await useLocalModelStore.getState().checkWebGPU();
      expect(useLocalModelStore.getState().webGPUSupported).toBe(false);
    });
  });

  // ── loadModel — unsupported model ─────────────────────────────────────────

  describe("loadModel — unsupported model ID", () => {
    it("sets status=error for an unrecognised model ID", async () => {
      setWebGPU(true);
      await useLocalModelStore.getState().loadModel(UNKNOWN_MODEL);

      const state = useLocalModelStore.getState();
      expect(state.status).toBe("error");
      expect(state.modelId).toBe(UNKNOWN_MODEL);
      expect(state.error).toMatch(/Unsupported local model/i);
      // Preload must NOT have been called for an unknown model
      expect(localWebGPUProvider.preload).not.toHaveBeenCalled();
    });
  });

  // ── loadModel — WebGPU not supported ─────────────────────────────────────

  describe("loadModel — WebGPU not supported", () => {
    it("sets status=error when WebGPU is unavailable", async () => {
      setWebGPU(false);
      await useLocalModelStore.getState().loadModel(VALID_MODEL);

      const state = useLocalModelStore.getState();
      expect(state.status).toBe("error");
      expect(state.error).toMatch(/WebGPU is not supported/i);
      expect(localWebGPUProvider.preload).not.toHaveBeenCalled();
    });
  });

  // ── loadModel — success paths ─────────────────────────────────────────────

  describe("loadModel — success", () => {
    beforeEach(() => {
      setWebGPU(true);
      // Simulate preload resolving immediately (model ready)
      vi.mocked(localWebGPUProvider.preload).mockImplementation(
        async (onProgress: (msg: { status: string; progress?: number; data?: string }) => void) => {
          onProgress({ status: "ready", progress: 100, data: "Model ready" });
        },
      );
    });

    it("loads Ministral 3B successfully", async () => {
      await useLocalModelStore.getState().loadModel(VALID_MODEL);

      const state = useLocalModelStore.getState();
      expect(state.status).toBe("ready");
      expect(state.modelId).toBe(VALID_MODEL);
      expect(state.progress).toBe(100);
      expect(state.error).toBeNull();
    });

    it("invokes preload for Ministral 3B", async () => {
      await useLocalModelStore.getState().loadModel(VALID_MODEL);
      expect(localWebGPUProvider.preload).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  // ── loadModel — progress callbacks ───────────────────────────────────────

  describe("loadModel — progress reporting", () => {
    it("updates progress state while loading", async () => {
      setWebGPU(true);
      const progressEvents: number[] = [];

      vi.mocked(localWebGPUProvider.preload).mockImplementation(
        async (onProgress: (msg: { status: string; file?: string; progress?: number; data?: string }) => void) => {
          onProgress({ status: "progress", file: "model_q4f16.onnx", progress: 25 });
          progressEvents.push(useLocalModelStore.getState().progress);
          onProgress({ status: "progress", file: "model_q4f16.onnx", progress: 75 });
          progressEvents.push(useLocalModelStore.getState().progress);
          onProgress({ status: "ready", progress: 100, data: "Model ready" });
        },
      );

      await useLocalModelStore.getState().loadModel(VALID_MODEL);

      expect(progressEvents[0]).toBeGreaterThan(0);
      expect(progressEvents[1]).toBeGreaterThan(progressEvents[0]!);
      expect(useLocalModelStore.getState().progress).toBe(100);
    });
  });

  // ── loadModel — preload error ─────────────────────────────────────────────

  describe("loadModel — preload error", () => {
    it("sets status=error when preload rejects", async () => {
      setWebGPU(true);
      vi.mocked(localWebGPUProvider.preload).mockRejectedValue(
        new Error("Failed to load local WebGPU model."),
      );

      await useLocalModelStore.getState().loadModel(VALID_MODEL);

      const state = useLocalModelStore.getState();
      expect(state.status).toBe("error");
      expect(state.error).toBe("Failed to load local WebGPU model.");
    });

    it("preserves error message from string rejection", async () => {
      setWebGPU(true);
      vi.mocked(localWebGPUProvider.preload).mockRejectedValue("network error");

      await useLocalModelStore.getState().loadModel(VALID_MODEL);

      expect(useLocalModelStore.getState().error).toBe("network error");
    });
  });

  // ── loadModel — auto-checks WebGPU if unknown ─────────────────────────────

  describe("loadModel — auto WebGPU check", () => {
    it("calls checkWebGPU automatically when webGPUSupported is null", async () => {
      // Leave webGPUSupported as null (initial state)
      expect(useLocalModelStore.getState().webGPUSupported).toBeNull();

      Object.defineProperty(navigator, "gpu", {
        value: { requestAdapter: vi.fn().mockResolvedValue(null) },
        configurable: true,
        writable: true,
      });

      await useLocalModelStore.getState().loadModel(VALID_MODEL);

      // WebGPU check ran and found it unsupported
      expect(useLocalModelStore.getState().webGPUSupported).toBe(false);
      expect(useLocalModelStore.getState().status).toBe("error");
    });
  });

  // ── reset ─────────────────────────────────────────────────────────────────

  describe("reset", () => {
    it("restores initial state", async () => {
      setWebGPU(true);
      vi.mocked(localWebGPUProvider.preload).mockResolvedValue(undefined);
      await useLocalModelStore.getState().loadModel(VALID_MODEL);
      expect(useLocalModelStore.getState().status).not.toBe("idle");

      useLocalModelStore.getState().reset();

      const state = useLocalModelStore.getState();
      expect(state.status).toBe("idle");
      expect(state.modelId).toBeNull();
      expect(state.error).toBeNull();
      expect(state.progress).toBe(0);
      expect(state.loadingText).toBe("");
      expect(state.webGPUSupported).toBeNull();
    });
  });
});
