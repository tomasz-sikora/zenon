/**
 * Speech service — ASR and TTS bridging main thread to Speech Worker.
 * Exposes: transcribeAudio(), speak(), stopSpeech()
 */
export declare function transcribeAudio(audioBuffer: AudioBuffer): Promise<string>;
export declare function speak(text: string, options?: {
    lang?: string;
    rate?: number;
    pitch?: number;
}): void;
export declare function stopSpeech(): void;
export declare function isSpeaking(): boolean;
