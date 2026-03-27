"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { syncAPI, cardsAPI, voiceAPI } from "@/lib/api";
import { useUserStore, useCardsStore } from "@/lib/store";
import SacredGeometryLogo from "@/components/SacredGeometryLogo";

const MicIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
);

export default function SyncPage() {
    const router = useRouter();
    const params = useParams();
    const { userId } = useUserStore();

    const [messages, setMessages] = useState<{ role: string, content: string }[]>([]);
    const [sessionId, setSessionId] = useState<number | null>(null);
    const [currentPhase, setCurrentPhase] = useState(0);
    const [userInput, setUserInput] = useState("");
    const [isComplete, setIsComplete] = useState(false);
    const [loading, setLoading] = useState(false);
    const [starting, setStarting] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    const [card, setCard] = useState<any>(null);
    const [insights, setInsights] = useState<any>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Voice state
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    useEffect(() => {
        if (!userId || !params.id) return;
        const cardId = Number(params.id);
        cardsAPI.getOne(userId, cardId).then(r => setCard(r.data));
    }, [userId, params.id]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    const handleStartSync = async () => {
        if (!userId || !params.id) return;
        setStarting(true);
        setHasStarted(true);
        const cardId = Number(params.id);
        try {
            const r = await syncAPI.start(userId, cardId);
            setSessionId(r.data.session_id);
            setCurrentPhase(r.data.current_phase);
            setMessages([{ role: "assistant", content: r.data.phase_content }]);
        } catch (e: any) {
            alert(e.response?.data?.detail || "Ошибка запуска");
            setHasStarted(false);
        } finally {
            setStarting(false);
        }
    };

    // Auto-resize textarea when content changes
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, window.innerHeight * 0.5)}px`;
        }
    }, [userInput, isTranscribing]);

    const handleSend = async () => {
        if (!sessionId || !userId || !userInput.trim() || loading) return;
        const currentInput = userInput;
        setUserInput("");
        setLoading(true);

        // Add user message to history
        const newHistory = [...messages, { role: "user", content: currentInput }];
        setMessages(newHistory);

        try {
            const res = await syncAPI.phase(userId, sessionId, currentPhase, currentInput);
            setCurrentPhase(res.data.current_phase);

            // Add new assistant message to history
            setMessages([...newHistory, { role: "assistant", content: res.data.phase_content }]);

            if (res.data.is_complete) {
                setIsComplete(true);
                useCardsStore.getState().updateCard(Number(params.id), { status: "synced" });
            }
            if (res.data.insights) setInsights(res.data.insights);
            if (textareaRef.current) textareaRef.current.style.height = "auto";
        } catch (e: any) {
            alert(e.response?.data?.detail || "Ошибка");
        } finally {
            setLoading(false);
        }
    };

    // ── Voice recording ────────────────────────────────────────────────────────
    const startRecording = useCallback(async () => {
        if (isRecording || isTranscribing) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus"
                : MediaRecorder.isTypeSupported("audio/webm")
                    ? "audio/webm"
                    : "audio/mp4";
            const recorder = new MediaRecorder(stream, { mimeType });
            chunksRef.current = [];
            recorder.ondataavailable = e => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                if (chunksRef.current.length === 0) return;
                const blob = new Blob(chunksRef.current, { type: mimeType });
                setIsTranscribing(true);
                try {
                    const res = await voiceAPI.transcribe(userId!, blob, "sync");
                    const transcript = res.data.transcript?.trim();
                    if (transcript) {
                        setUserInput(prev => prev ? prev + " " + transcript : transcript);
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
        } catch {
            alert("Нет доступа к микрофону");
        }
    }, [isRecording, isTranscribing, userId]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
    }, []);

    const toggleRecording = () => {
        if (isRecording) stopRecording();
        else startRecording();
    };

    const needsInput = hasStarted && !isComplete;

    if (starting) return (
        <div className="flex items-center justify-center min-h-screen flex-col gap-4" style={{ background: "#060818" }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full" />
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Открываем врата...</p>
        </div>
    );

    const getHawkinsColor = (score: number) => {
        if (score <= 200) {
            const ratio = score / 200;
            const r = Math.round(239 + (245 - 239) * ratio);
            const g = Math.round(68 + (158 - 68) * ratio);
            const b = Math.round(68 + (11 - 68) * ratio);
            return `rgb(${r}, ${g}, ${b})`;
        } else {
            const ratio = Math.min(1, (score - 200) / 300);
            const r = Math.round(245 + (16 - 245) * ratio);
            const g = Math.round(158 + (185 - 158) * ratio);
            const b = Math.round(11 + (129 - 11) * ratio);
            return `rgb(${r}, ${g}, ${b})`;
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: "fixed", inset: 0, display: "flex", flexDirection: "column",
                background: "#060818", zIndex: 10, overflow: "hidden"
            }}
        >
            {/* Background decorative glows */}
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
                <div style={{
                    position: "absolute", top: "10%", left: "15%", width: 280, height: 280,
                    background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
                    borderRadius: "50%", filter: "blur(40px)"
                }} />
                <div style={{
                    position: "absolute", bottom: "15%", right: "10%", width: 220, height: 220,
                    background: "radial-gradient(circle, rgba(245,158,11,0.10) 0%, transparent 70%)",
                    borderRadius: "50%", filter: "blur(32px)"
                }} />
            </div>

            {/* Top bar */}
            <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0, position: "relative", zIndex: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <button
                        onClick={() => router.back()}
                        style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
                    >
                        Назад
                    </button>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", textTransform: "uppercase" }}>☼ Синхронизация</span>
                    <span style={{ fontSize: 10, color: "rgba(139,92,246,0.5)", fontWeight: 700 }}>
                        {isComplete ? "ГОТОВО" : hasStarted ? `${currentPhase}/5` : "0/5"}
                    </span>
                </div>
            </div>

            {/* Chat content area */}
            <div
                ref={scrollRef}
                style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10, scrollbarWidth: "none", position: "relative", zIndex: 5 }}
            >
                {!hasStarted ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70vh", padding: "0 20px" }}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1 }} style={{ marginBottom: 20 }}>
                            <SacredGeometryLogo size={180} progress={0.7} />
                        </motion.div>
                        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12, color: "#fff", textAlign: "center" }}>
                            Врата Синхронизации
                        </h2>
                        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, textAlign: "center", maxWidth: 280, margin: 0 }}>
                            Подготовка к глубокому погружению в 5 слоев вашего подсознания. Настройтесь на свои внутренние образы...
                        </p>
                    </div>
                ) : isComplete ? (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ paddingBottom: 20 }}>
                        <div style={{ textAlign: "center", marginBottom: 32 }}>
                            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: "#fff" }}>
                                Синхронизация завершена
                            </h2>
                            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Протоколы синхронизации активны</p>
                        </div>

                        {insights?.hawkins_score && (
                            <div style={{
                                background: "rgba(255,255,255,0.03)", borderRadius: 28, padding: "32px 16px",
                                marginBottom: 24, border: "1px solid rgba(255,255,255,0.05)", textAlign: "center"
                            }}>
                                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 8, fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase" }}>УРОВЕНЬ ЭНЕРГИИ</p>
                                <div style={{
                                    fontSize: 64, fontWeight: 900, color: getHawkinsColor(insights.hawkins_score),
                                    lineHeight: 1, fontFamily: "'Outfit', sans-serif", marginBottom: 8
                                }}>
                                    {insights.hawkins_score}
                                </div>
                                <p style={{
                                    fontSize: 20, fontWeight: 800, color: getHawkinsColor(insights.hawkins_score),
                                    textTransform: "uppercase", letterSpacing: "0.1em"
                                }}>
                                    {insights.hawkins_level}
                                </p>
                            </div>
                        )}

                        {insights && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                                {insights.key_choice && (
                                    <div style={{ background: "rgba(139,92,246,0.08)", padding: 16, borderRadius: 20, borderLeft: "4px solid #8B5CF6" }}>
                                        <p style={{ fontSize: 10, color: "#A78BFA", fontWeight: 800, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>КЛЮЧЕВОЙ ВЫБОР</p>
                                        <p style={{ fontSize: 14, color: "#fff", lineHeight: 1.5, margin: 0 }}>{insights.key_choice}</p>
                                    </div>
                                )}

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    {[
                                        { title: "Мышление", data: insights.mental_thinking, color: "#60A5FA" },
                                        { title: "Реакции", data: insights.mental_reactions, color: "#F87171" },
                                        { title: "Паттерны", data: insights.mental_patterns, color: "#A78BFA" },
                                        { title: "Стремления", data: insights.mental_aspirations, color: "#34D399" }
                                    ].map((cell, idx) => (
                                        <div key={idx} style={{
                                            background: "rgba(255,255,255,0.03)",
                                            padding: 12,
                                            borderRadius: 16,
                                            border: "1px solid rgba(255,255,255,0.05)"
                                        }}>
                                            <p style={{ fontSize: 9, color: cell.color, fontWeight: 800, marginBottom: 4, textTransform: "uppercase" }}>{cell.title}</p>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                                {(Array.isArray(cell.data)
                                                    ? cell.data
                                                    : (typeof cell.data === 'string' ? cell.data.split(', ') : [])
                                                ).filter(Boolean).map((item: string, i: number) => (
                                                    <p key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", margin: 0 }}>• {item}</p>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {insights.first_insight && (
                                    <div style={{ background: "rgba(255,255,255,0.04)", padding: 16, borderRadius: 20, border: "1px solid rgba(255,255,255,0.05)" }}>
                                        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 800, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>ИНСАЙТ</p>
                                        <p style={{ fontSize: 14, color: "#fff", lineHeight: 1.6, margin: 0, fontWeight: 500 }}>{insights.first_insight}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{
                            padding: "16px 20px", borderRadius: 20, background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.05)", fontSize: 14, lineHeight: 1.6,
                            color: "rgba(255,255,255,0.6)", fontStyle: "italic"
                        }}>
                            {messages[messages.length - 1]?.content}
                        </div>
                    </motion.div>
                ) : (
                    <>
                        {messages.map((msg, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}
                            >
                                <div style={{
                                    padding: "10px 14px",
                                    borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                                    maxWidth: "85%", fontSize: 14, lineHeight: 1.5,
                                    background: msg.role === "user" ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.06)",
                                    color: msg.role === "user" ? "#FEF3C7" : "rgba(255,255,255,0.9)",
                                    border: msg.role === "user" ? "1px solid rgba(245,158,11,0.15)" : "1px solid rgba(255,255,255,0.08)",
                                }}>
                                    {msg.content}
                                </div>
                            </motion.div>
                        ))}
                        {loading && (
                            <div style={{ display: "flex", justifyContent: "flex-start" }}>
                                <div style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 4px", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", fontSize: 12 }} className="animate-pulse">
                                    Печатаю...
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Bottom panel */}
            <div style={{ flexShrink: 0, padding: "10px 16px 20px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "#060818" }}>
                {!isComplete ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {!hasStarted ? (
                            <motion.button
                                whileTap={{ scale: 0.98 }}
                                onClick={handleStartSync}
                                style={{
                                    width: "100%", padding: "18px", borderRadius: 20, border: "none", cursor: "pointer",
                                    background: "linear-gradient(135deg, #8B5CF6, #6366F1)",
                                    color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: "0.05em", textTransform: "uppercase",
                                    boxShadow: "0 8px 24px rgba(139,92,246,0.3)",
                                }}
                            >
                                Войти во Врата
                            </motion.button>
                        ) : (
                            <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
                                <div style={{ flex: 1, position: "relative" }}>
                                    <textarea
                                        ref={textareaRef}
                                        rows={1}
                                        value={isTranscribing ? "Транскрибирую в текст..." : userInput}
                                        onChange={(e) => setUserInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSend();
                                            }
                                        }}
                                        placeholder="Ваш ответ..."
                                        disabled={loading || isTranscribing}
                                        style={{
                                            width: "100%", background: "rgba(255,255,255,0.06)",
                                            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
                                            padding: "14px 48px 14px 16px", fontSize: 14, color: "#fff",
                                            outline: "none", resize: "none", lineHeight: "1.5", display: "block",
                                            maxHeight: "50vh", fontFamily: "inherit"
                                        }}
                                        className="placeholder:text-white/20 focus:border-amber-500/50"
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={!userInput.trim() || loading || isTranscribing}
                                        style={{
                                            position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                                            width: 32, height: 32, borderRadius: 10, border: "none", cursor: "pointer",
                                            background: "rgba(245,158,11,0.2)", color: "#FCD34D",
                                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                                            opacity: (!userInput.trim() || loading) ? 0.3 : 1, transition: "all 0.2s"
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
                                    style={{
                                        flexShrink: 0, width: 52, height: 52, borderRadius: 16, cursor: "pointer",
                                        background: isRecording ? "#EF4444" : "rgba(255,255,255,0.06)",
                                        border: isRecording ? "none" : "1px solid rgba(255,255,255,0.1)",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        transition: "all 0.15s", transform: isRecording ? "scale(0.95)" : "scale(1)"
                                    }}
                                >
                                    {isRecording ? "🔴" : <MicIcon className="w-5 h-5 text-amber-500/60" />}
                                </button>
                            </div>
                        )}
                        {hasStarted && !loading && (
                            <p style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "4px 0 0" }}>
                                ☼ Идет синхронизация состояния
                            </p>
                        )}
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={() => router.replace(`/session/${params.id}`)}
                            style={{
                                width: "100%", padding: "18px", borderRadius: 20, border: "none",
                                cursor: "pointer", fontSize: 15, fontWeight: 800, textTransform: "uppercase",
                                background: "linear-gradient(135deg, #F59E0B, #D97706)", color: "#000",
                                boxShadow: "0 8px 24px rgba(245,158,11,0.3)",
                            }}
                        >
                            Сессия выравнивания · 40 ✦
                        </motion.button>
                        <button
                            onClick={() => router.replace(`/card/${params.id}`)}
                            style={{
                                width: "100%", padding: "12px", background: "none",
                                border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                                color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em"
                            }}
                        >
                            Вернуться к карточке
                        </button>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// v1.8-sync-fixed-history
