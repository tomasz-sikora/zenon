import type { AIProvider, CompletionOptions, StreamCallback } from "./base";
export declare class LocalWebGPUProvider implements AIProvider {
    static worker: Worker | null;
    static readyModelId: string | null;
    static loadPromise: Promise<void> | null;
    id: string;
    name: string;
    constructor({ id, name }: {
        id: string;
        name: string;
    });
    static getWorker(): Worker;
    static isLoaded(modelId: string): boolean;
    preload(onProgress: (msg: {
        status: string;
        file?: string;
        loaded?: number;
        total?: number;
        data?: string;
        progress?: number;
    }) => void, modelId?: string): Promise<void>;
    complete(opts: CompletionOptions, onChunk: StreamCallback): Promise<void>;
}
export declare const localWebGPUProvider: LocalWebGPUProvider;
