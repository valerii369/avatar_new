"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { assistantAPI, voiceAPI } from "@/lib/api";
import { useUserStore } from "@/lib/store";
import { useTmaSafeArea } from "@/lib/useTmaSafeArea";
import BottomNav from "@/components/BottomNav";

const MicIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
);

const useVoiceRecorder = (userId: string | null, setInput: React.Dispatch<React.SetStateAction<string>>) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const startRecording = useCallback(async () => {
        if (!userId || isRecording || isTranscribing) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus" : "audio/webm";

            const recorder = new MediaRecorder(stream, { mimeType });
            chunksRef.current = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            recorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                if (chunksRef.current.length === 0) return;
                const blob = new Blob(chunksRef.current, { type: mimeType });
                setIsTranscribing(true);
                try {
                    const res = await voiceAPI.transcribe(userId, blob, "assistant");
                    const transcript = res.data.transcript?.trim();
                    if (transcript) {
                        setInput(prev => prev ? prev + " " + transcript : transcript);
                    }
                } catch (err) {
                    console.error("Transcription error:", err);
                } finally {
                    setIsTranscribing(false);
                }
            };
            recorder.start(100);
            mediaRecorderRef.current = recorder;
            setIsRecording(true);
        } catch (err) {
            console.error("Microphone access error:", err);
        }
    }, [isRecording, isTranscribing, userId, setInput]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    }, [isRecording]);

    return { isRecording, isTranscribing, startRecording, stopRecording };
};

export default function AssistantPage() {
    const router = useRouter();
    const tmaSafeTop = useTmaSafeArea();
    const { userId, assistantMessages, setAssistantMessages } = useUserStore();
    const [messages, setMessages] = useState<{ role: string, content: string }[]>(assistantMessages);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState<number | null>(null);
    const [isFirstTouch, setIsFirstTouch] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [diarySummary, setDiarySummary] = useState<string | null>(null);
    const [isSavingDiary, setIsSavingDiary] = useState(false);
    
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const { isRecording, isTranscribing, startRecording, stopRecording } = useVoiceRecorder(userId, setInput);

    useEffect(() => {
        if (!userId) return;
        const init = async () => {
            try {
                setLoading(true);
                const res = await assistantAPI.init(userId);
                const sid = res.data.session_id;
                setSessionId(sid);
                setIsFirstTouch(res.data.is_first_touch);

                // Use greeting from init response directly (no extra chat call)
                if (messages.length === 0 && res.data.ai_response) {
                    const greeting = { role: "assistant", content: res.data.ai_response };
                    setMessages([greeting]);
                    setAssistantMessages([greeting]);
                }
            } catch (err) {
                console.error("Assistant init error:", err);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [userId]);

    // Save messages to store whenever they change
    useEffect(() => {
        if (messages.length > 0) {
            setAssistantMessages(messages);
        }
    }, [messages, setAssistantMessages]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading || !sessionId || !userId || isTranscribing || isFinished) return;
        
        const userMsg = input.trim();
        const newHistory = [...messages, { role: "user", content: userMsg }];
        setMessages(newHistory);
        setInput("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        setLoading(true);

        try {
            const res = await assistantAPI.chat(userId, sessionId, userMsg);
            setMessages([...newHistory, { role: "assistant", content: res.data.ai_response }]);
        } catch (err) {
            console.error("Assistant chat error:", err);
            setMessages([...newHistory, { role: "assistant", content: "Простите, моё зеркало помутнело. Давайте попробуем еще раз?" }]);
        } finally {
            setLoading(false);
        }
    };

    const handleFinish = async () => {
        if (!sessionId || !userId || loading || isFinished) return;
        setLoading(true);
        try {
            const res = await assistantAPI.finish(userId, sessionId);
            setIsFinished(true);
            setDiarySummary(res.data.diary_summary);
        } catch (err) {
            console.error("Assistant finish error:", err);
            router.push("/");
        } finally {
            setLoading(false);
        }
    };

    const handleSaveDiary = async () => {
        if (!sessionId || !userId || isSavingDiary) return;
        setIsSavingDiary(true);
        try {
            await assistantAPI.saveToDiary(userId, sessionId);
            router.push("/diary");
        } catch (err) {
            console.error("Save to diary error:", err);
            setIsSavingDiary(false);
        }
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, window.innerHeight * 0.5)}px`;
        }
    };

    // Auto-adjust on transcript arrival
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, window.innerHeight * 0.5)}px`;
        }
    }, [input]);

    const particles = useMemo(() =>
        Array.from({ length: 24 }, (_, i) => ({
            left: `${(i * 37 + 5) % 100}%`,
            top: `${(i * 53 + 10) % 100}%`,
            opacity: 0.04 + (i % 5) * 0.04,
            duration: 2.5 + (i % 4),
            delay: (i % 6) * 0.4,
            size: i % 3 === 0 ? 2 : 1,
        })), []);

    return (
        <div
            className="flex flex-col bg-[#060818] overflow-hidden"
            style={{ height: "100dvh", paddingTop: tmaSafeTop > 0 ? tmaSafeTop : undefined }}
        >

            {/* Top bar — offset for TMA header */}
            <div style={{ padding: "14px 16px 8px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0, position: "relative", zIndex: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <button
                        onClick={() => router.push("/")}
                        style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
                    >
                        ← Назад
                    </button>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", textTransform: "uppercase" }}>☼ Чат с внутренним миром</span>
                    <button
                        onClick={handleFinish}
                        disabled={isFinished || loading}
                        style={{ fontSize: 10, color: "rgba(245,158,11,0.6)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, padding: "4px 8px", opacity: isFinished ? 0.3 : 1 }}
                    >
                        Завершить
                    </button>
                </div>
            </div>

            {/* Chat messages */}
            <div
                ref={scrollRef}
                style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10, scrollbarWidth: "none", position: "relative", zIndex: 10 }}
                className="no-scrollbar"
            >
                {messages.map((msg, i) => (
                    <div 
                        key={i} 
                        style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}
                    >
                        <div style={{
                            padding: "10px 14px",
                            borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                            maxWidth: "85%",
                            fontSize: 14,
                            lineHeight: 1.5,
                            background: msg.role === "user" ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.06)",
                            color: msg.role === "user" ? "#FEF3C7" : "rgba(255,255,255,0.9)",
                            border: msg.role === "user" ? "1px solid rgba(245,158,11,0.15)" : "1px solid rgba(255,255,255,0.08)",
                        }}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                
                {loading && (
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                        <div style={{ 
                            padding: "10px 14px", 
                            borderRadius: "18px 18px 18px 4px", 
                            background: "rgba(255,255,255,0.05)", 
                            display: "flex", 
                            gap: 4, 
                            alignItems: "center" 
                        }}>
                            {[0, 1, 2].map(i => (
                                <motion.div key={i}
                                    style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.3)" }}
                                    animate={{ opacity: [0.3, 1, 0.3] }}
                                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Diary Prompt Dialog */}
                <AnimatePresence>
                    {isFinished && diarySummary && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            style={{
                                marginTop: 20,
                                padding: 20,
                                background: "rgba(13,18,38,0.7)",
                                backdropFilter: "blur(20px)",
                                borderRadius: 24,
                                border: "1px solid rgba(255,255,255,0.1)",
                                textAlign: "center",
                                display: "flex",
                                flexDirection: "column",
                                gap: 15,
                                zIndex: 30
                            }}
                        >
                            <h3 style={{ fontSize: 16, color: "rgba(255,255,255,0.9)", margin: 0 }}>Внести итоги в дневник?</h3>
                            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, fontStyle: "italic" }}>
                                "{diarySummary}"
                            </p>
                            <div style={{ display: "flex", gap: 10 }}>
                                <button
                                    onClick={() => router.push("/")}
                                    style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px", color: "rgba(255,255,255,0.4)", fontSize: 13 }}
                                >
                                    Пропустить
                                </button>
                                <button
                                    onClick={handleSaveDiary}
                                    disabled={isSavingDiary}
                                    style={{ flex: 1, background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, padding: "12px", color: "#FCD34D", fontSize: 13, fontWeight: 600 }}
                                >
                                    {isSavingDiary ? "Сохраняю..." : "Внести в дневник"}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom panel — above BottomNav */}
            <div style={{ flexShrink: 0, padding: "10px 16px 12px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", gap: 8, position: "relative", zIndex: 20, background: "rgba(6,8,24,0.95)", backdropFilter: "blur(10px)", opacity: isFinished ? 0.3 : 1, pointerEvents: isFinished ? "none" : "auto" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
                    <div style={{ flex: 1, position: "relative" }}>
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            value={isTranscribing ? "Транскрибирую..." : input}
                            onChange={handleTextChange}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder="задайте вопрос"
                            disabled={loading || isTranscribing || isFinished}
                            style={{
                                width: "100%",
                                background: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: 16,
                                padding: "14px 48px 14px 16px",
                                fontSize: 14,
                                color: "#fff",
                                outline: "none",
                                fontFamily: "inherit",
                                boxSizing: "border-box",
                                resize: "none",
                                overflowY: "auto",
                                maxHeight: "50vh",
                                lineHeight: "1.5",
                                display: "block",
                            }}
                            className="placeholder:text-white/20 focus:border-amber-500/50"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || loading || isTranscribing || isFinished}
                            style={{
                                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                                width: 32, height: 32, borderRadius: 10, border: "none", cursor: "pointer",
                                background: "rgba(245,158,11,0.2)", color: "#FCD34D",
                                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                                opacity: (!input.trim() || loading || isFinished) ? 0.3 : 1,
                            }}
                        >
                            ↑
                        </button>
                        <AnimatePresence>
                            {isRecording && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    style={{ position: "absolute", inset: 0, background: "rgba(245,158,11,0.1)", backdropFilter: "blur(8px)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(245,158,11,0.2)", pointerEvents: "none" }}>
                                    <div style={{ display: "flex", gap: 4 }}>
                                        {[0, 1, 2].map(i => (
                                            <motion.div key={i} style={{ width: 4, height: 16, borderRadius: 4, background: "rgba(251,191,36,0.6)" }}
                                                animate={{ scaleY: [1, 2, 1] }}
                                                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }} />
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                    <button
                        onPointerDown={startRecording}
                        onPointerUp={stopRecording}
                        onPointerLeave={stopRecording}
                        disabled={isFinished}
                        style={{
                            flexShrink: 0, width: 52, height: 52, borderRadius: 16, cursor: "pointer",
                            background: isRecording ? "#EF4444" : "rgba(255,255,255,0.06)",
                            border: isRecording ? "none" : "1px solid rgba(255,255,255,0.1)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transform: isRecording ? "scale(0.95)" : "scale(1)",
                            transition: "all 0.15s",
                            opacity: isFinished ? 0.3 : 1
                        }}
                    >
                        {isRecording ? "🔴" : <MicIcon className="w-5 h-5 text-amber-500/60" />}
                    </button>
                </div>
            </div>

            <BottomNav />
        </div>
    );
}
