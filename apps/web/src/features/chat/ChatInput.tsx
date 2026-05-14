import { useRef, useState, type KeyboardEvent } from "react";
import { Send, Square, Paperclip, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { transcribeAudio } from "@/lib/speech/service";
import { toast } from "@/components/ui/Toaster";

interface ChatInputProps {
  onSend: (content: string, attachments?: File[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

export function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleSend = () => {
    if (isStreaming) { onStop(); return; }
    if (!input.trim() && attachments.length === 0) return;
    onSend(input.trim(), attachments.length > 0 ? attachments : undefined);
    setInput("");
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInput = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAttachments((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
    e.target.value = "";
  };

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setTranscribing(true);
        try {
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const arrayBuf = await blob.arrayBuffer();
          const audioCtx = new AudioContext();
          const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
          const transcript = await transcribeAudio(audioBuf);
          setInput((prev) => prev ? prev + " " + transcript : transcript);
          textareaRef.current?.focus();
        } catch (e) {
          toast.error("Transcription failed", String(e));
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (e) {
      toast.error("Microphone access denied", String(e));
    }
  };

  return (
    <div className="border-t border-border bg-background px-4 py-3">
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((file, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[120px] truncate">{file.name}</span>
              <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} className="ml-1 text-muted-foreground hover:text-foreground">×</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 rounded-xl border border-border bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring px-3 py-2">
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled || isStreaming}
          className="shrink-0 p-1 text-muted-foreground hover:text-foreground disabled:opacity-40" aria-label="Attach file">
          <Paperclip className="h-4 w-4" />
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange}
          accept="image/*,.pdf,.txt,.md,.csv,.xlsx,.xls,.docx,.doc" />

        <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown} onInput={handleInput}
          placeholder={transcribing ? "Transcribing…" : "Message Zenon… (Shift+Enter for newline)"}
          rows={1} disabled={disabled || transcribing}
          className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
          style={{ minHeight: "24px", maxHeight: "200px" }} />

        <button type="button" onClick={toggleRecording} disabled={disabled || isStreaming || transcribing}
          className={cn("shrink-0 p-1 transition-colors disabled:opacity-40",
            recording ? "text-red-500 animate-pulse" : "text-muted-foreground hover:text-foreground")}
          aria-label={recording ? "Stop recording" : "Voice input"} title={recording ? "Stop recording" : "Voice input (Whisper)"}>
          {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>

        <button type="button" onClick={handleSend}
          disabled={disabled || (!input.trim() && attachments.length === 0 && !isStreaming)}
          className={cn("shrink-0 flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-30",
            isStreaming ? "bg-destructive/15 text-destructive hover:bg-destructive/25" : "bg-primary text-primary-foreground hover:bg-primary/90")}
          aria-label={isStreaming ? "Stop" : "Send"}>
          {isStreaming ? <Square className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>

      <p className="mt-1.5 text-center text-xs text-muted-foreground/50">
        Zenon runs AI locally or via your own API keys. Nothing is stored externally.
      </p>
    </div>
  );
}
