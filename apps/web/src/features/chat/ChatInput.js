import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { Send, Square, Paperclip, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { transcribeAudio } from "@/lib/speech/service";
import { toast } from "@/components/ui/Toaster";
export function ChatInput({ onSend, onStop, isStreaming, disabled }) {
    const [input, setInput] = useState("");
    const [attachments, setAttachments] = useState([]);
    const [recording, setRecording] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const handleSend = () => {
        if (isStreaming) {
            onStop();
            return;
        }
        if (!input.trim() && attachments.length === 0)
            return;
        onSend(input.trim(), attachments.length > 0 ? attachments : undefined);
        setInput("");
        setAttachments([]);
        if (textareaRef.current)
            textareaRef.current.style.height = "auto";
    };
    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };
    const handleInput = () => {
        const ta = textareaRef.current;
        if (!ta)
            return;
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    };
    const handleFileChange = (e) => {
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
                }
                catch (e) {
                    toast.error("Transcription failed", String(e));
                }
                finally {
                    setTranscribing(false);
                }
            };
            recorder.start();
            mediaRecorderRef.current = recorder;
            setRecording(true);
        }
        catch (e) {
            toast.error("Microphone access denied", String(e));
        }
    };
    return (_jsxs("div", { className: "border-t border-border bg-background px-4 py-3", children: [attachments.length > 0 && (_jsx("div", { className: "mb-2 flex flex-wrap gap-2", children: attachments.map((file, i) => (_jsxs("div", { className: "flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs", children: [_jsx(Paperclip, { className: "h-3 w-3" }), _jsx("span", { className: "max-w-[120px] truncate", children: file.name }), _jsx("button", { onClick: () => setAttachments((prev) => prev.filter((_, j) => j !== i)), className: "ml-1 text-muted-foreground hover:text-foreground", children: "\u00D7" })] }, i))) })), _jsxs("div", { className: "flex items-end gap-2 rounded-xl border border-border bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring px-3 py-2", children: [_jsx("button", { type: "button", onClick: () => fileInputRef.current?.click(), disabled: disabled || isStreaming, className: "shrink-0 p-1 text-muted-foreground hover:text-foreground disabled:opacity-40", "aria-label": "Attach file", children: _jsx(Paperclip, { className: "h-4 w-4" }) }), _jsx("input", { ref: fileInputRef, type: "file", multiple: true, className: "hidden", onChange: handleFileChange, accept: "image/*,.pdf,.txt,.md,.csv,.xlsx,.xls,.docx,.doc" }), _jsx("textarea", { ref: textareaRef, value: input, onChange: (e) => setInput(e.target.value), onKeyDown: handleKeyDown, onInput: handleInput, placeholder: transcribing ? "Transcribing…" : "Message Zenon… (Shift+Enter for newline)", rows: 1, disabled: disabled || transcribing, className: "flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50", style: { minHeight: "24px", maxHeight: "200px" } }), _jsx("button", { type: "button", onClick: toggleRecording, disabled: disabled || isStreaming || transcribing, className: cn("shrink-0 p-1 transition-colors disabled:opacity-40", recording ? "text-red-500 animate-pulse" : "text-muted-foreground hover:text-foreground"), "aria-label": recording ? "Stop recording" : "Voice input", title: recording ? "Stop recording" : "Voice input (Whisper)", children: recording ? _jsx(MicOff, { className: "h-4 w-4" }) : _jsx(Mic, { className: "h-4 w-4" }) }), _jsx("button", { type: "button", onClick: handleSend, disabled: disabled || (!input.trim() && attachments.length === 0 && !isStreaming), className: cn("shrink-0 flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-30", isStreaming ? "bg-destructive/15 text-destructive hover:bg-destructive/25" : "bg-primary text-primary-foreground hover:bg-primary/90"), "aria-label": isStreaming ? "Stop" : "Send", children: isStreaming ? _jsx(Square, { className: "h-3.5 w-3.5" }) : _jsx(Send, { className: "h-3.5 w-3.5" }) })] }), _jsx("p", { className: "mt-1.5 text-center text-xs text-muted-foreground/50", children: "Zenon runs AI locally or via your own API keys. Nothing is stored externally." })] }));
}
