"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cardsAPI, createSessionWS, voiceAPI } from "@/lib/api";
import { useUserStore } from "@/lib/store";

const STAGE_NAMES = [
    "", "Контакт", "Осознание", "Переживание",
    "Перезапись", "Закрепление", "Мост в реальность"
];

interface Message {
    role: "user" | "ai" | "system";
    content: string;
    stage?: number;
    hawkins?: number;
}

export default function SessionPage() {
    const router = useRouter();
    const params = useParams();
    const { userId } = useUserStore();
    const wsRef = useRef<WebSocket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [card, setCard] = useState<any>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [stage, setStage] = useState(1);
    const [hawkins, setHawkins] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [isAiTyping, setIsAiTyping] = useState(true);
    const [error, setError] = useState("");
    const [expertResults, setExpertResults] = useState<any>(null);
    const [isDeepening, setIsDeepening] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Voice recording state
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const retryCountRef = useRef(0);

    const connectWS = useCallback(() => {
        if (!userId || !params.id) return;
        const cardId = Number(params.id);

        if (wsRef.current) {
            wsRef.current.close();
        }

        const ws = createSessionWS(userId, cardId);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            setError("");
            retryCountRef.current = 0;
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === "error") {
                    setError(data.content);
                    setIsAiTyping(false);
                    return;
                }

                setIsAiTyping(false);
                setMessages(prev => [...prev, {
                    role: "ai",
                    content: data.content,
                    stage: data.stage,
                    hawkins: data.hawkins_current,
                }]);

                if (data.stage) setStage(data.stage);
                if (data.hawkins_current) setHawkins(data.hawkins_current);
                if (data.expert_results) setExpertResults(data.expert_results);
                if (data.is_complete) setIsComplete(true);
                setIsDeepening(data.is_deepening || false);
            } catch (e) {
                console.error("WS parse error", e);
            }
        };

        ws.onerror = () => {
            setError("Ошибка соединения");
        };

        ws.onclose = () => {
            setIsConnected(false);
            if (retryCountRef.current < 3 && !isComplete) {
                retryCountRef.current += 1;
                setTimeout(connectWS, 2000);
            }
        };
    }, [userId, params.id, isComplete]);

    useEffect(() => {
        if (!userId || !params.id) return;
        const cardId = Number(params.id);
        cardsAPI.getOne(userId, cardId).then(r => setCard(r.data));
        connectWS();
        return () => {
            wsRef.current?.close();
        };
    }, [userId, params.id, connectWS]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
        }
    }, [input, isTranscribing]);

    const sendMessage = () => {
        if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const content = input.trim();
        setMessages(prev => [...prev, { role: "user", content, stage }]);
        setInput("");
        setIsAiTyping(true);

        wsRef.current.send(JSON.stringify({ type: "message", content, stage }));

        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    };

    const closeSession = () => {
        wsRef.current?.send(JSON.stringify({ type: "close" }));
        wsRef.current?.close();
        router.push(`/card/${params.id}`);
    };

    const startRecording = useCallback(async () => {
        if (isRecording || isTranscribing) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus"
                : "audio/webm";
            const recorder = new MediaRecorder(stream, { mimeType });
            chunksRef.current = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            recorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                if (chunksRef.current.length === 0) return;
                const blob = new Blob(chunksRef.current, { type: mimeType });
                setIsTranscribing(true);
                try {
                    const res = await voiceAPI.transcribe(userId!, blob, "session");
                    const transcript = res.data.transcript?.trim();
                    if (transcript) {
                        setInput(prev => prev ? prev + " " + transcript : transcript);
                    }
                } catch (err: any) {
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
    }, [userId, isRecording, isTranscribing]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
    }, []);

    const progress = (stage / 6) * 100;

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

    if (error) return (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 gap-4" style={{ background: "#060818" }}>
            <div className="text-4xl text-red-500">⚠️</div>
            <p className="text-center text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>{error}</p>
            <button
                onClick={() => router.back()}
                style={{
                    padding: "14px 28px", borderRadius: 16, background: "rgba(139,92,246,0.2)",
                    color: "#fff", border: "1px solid rgba(139,92,246,0.3)", fontSize: 14, fontWeight: 700
                }}
            >
                Назад
            </button>
        </div>
    );

    if (!isConnected) return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ background: "#060818" }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full" />
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Установка связи...</p>
        </div>
    );

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
            {/* Top bar */}
            <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0, position: "relative", zIndex: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <button
                        onClick={closeSession}
                        style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
                    >
                        Выйти
                    </button>
                    <div style={{ textAlign: "center" }}>
                        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>☼ Выравнивание</p>
                        {card && (
                            <p style={{ fontSize: 10, color: card.sphere_color || "#8B5CF6", fontWeight: 700, margin: 0 }}>
                                {card.archetype_name}
                            </p>
                        )}
                    </div>
                    <span style={{ fontSize: 10, color: "rgba(139,92,246,0.5)", fontWeight: 700 }}>
                        {!isComplete ? `${stage}/6` : "ГОТОВО"}
                    </span>
                </div>
            </div>

            {/* Progress bar */}
            {!isComplete && (
                <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.03)" }}>
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        style={{ height: "100%", background: "linear-gradient(90deg, #8B5CF6, #EC4899)" }}
                    />
                </div>
            )}

            {/* Messages area */}
            <div
                style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10, scrollbarWidth: "none", position: "relative", zIndex: 5 }}
            >
                {messages.map((msg, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : msg.role === "system" ? "center" : "flex-start" }}
                    >
                        {msg.role === "system" ? (
                            <div style={{ fontSize: 10, color: "rgba(139,92,246,0.5)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", margin: "8px 0" }}>
                                {msg.content}
                            </div>
                        ) : (
                            <div style={{
                                padding: "10px 14px",
                                borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                                maxWidth: "85%", fontSize: 14, lineHeight: 1.5,
                                background: msg.role === "user" ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.06)",
                                color: msg.role === "user" ? "#FEF3C7" : "rgba(255,255,255,0.9)",
                                border: msg.role === "user" ? "1px solid rgba(245,158,11,0.15)" : "1px solid rgba(255,255,255,0.08)",
                                whiteSpace: "pre-line"
                            }}>
                                {msg.content}
                            </div>
                        )}
                    </motion.div>
                ))}

                {isAiTyping && (
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                        <div style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 4px", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                            <div className="flex gap-1">
                                {[0, 1, 2].map(i => (
                                    <motion.div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(139,92,246,0.5)" }}
                                        animate={{ opacity: [0.3, 1, 0.3] }}
                                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {isComplete && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ paddingBottom: 20 }}>
                        <div style={{ textAlign: "center", marginBottom: 32 }}>
                            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: "#fff" }}>
                                Выравнивание завершено
                            </h2>
                            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Энергетический баланс восстановлен</p>
                        </div>

                        {hawkins > 0 && (
                            <div style={{
                                background: "rgba(255,255,255,0.03)", borderRadius: 28, padding: "32px 16px",
                                marginBottom: 24, border: "1px solid rgba(255,255,255,0.05)", textAlign: "center"
                            }}>
                                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 8, fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase" }}>ИТОГОВЫЙ УРОВЕНЬ</p>
                                <div style={{
                                    fontSize: 64, fontWeight: 900, color: getHawkinsColor(hawkins),
                                    lineHeight: 1, fontFamily: "'Outfit', sans-serif", marginBottom: 8
                                }}>
                                    {hawkins}
                                </div>
                                <p style={{
                                    fontSize: 20, fontWeight: 800, color: getHawkinsColor(hawkins),
                                    textTransform: "uppercase", letterSpacing: "0.1em"
                                }}>
                                    {expertResults?.hawkins_level || "..."}
                                </p>
                            </div>
                        )}

                        {expertResults && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                    <div style={{ background: "rgba(255,255,255,0.04)", padding: 14, borderRadius: 20, border: "1px solid rgba(255,255,255,0.05)" }}>
                                        <p style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 800, marginBottom: 4, textTransform: "uppercase" }}>ГЛУБИНА</p>
                                        <p style={{ fontSize: 18, color: "#fff", margin: 0, fontWeight: 800 }}>{expertResults.transformation_depth}/10</p>
                                    </div>
                                    <div style={{ background: "rgba(255,255,255,0.04)", padding: 14, borderRadius: 20, border: "1px solid rgba(255,255,255,0.05)" }}>
                                        <p style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 800, marginBottom: 4, textTransform: "uppercase" }}>ТЕНЬ</p>
                                        <p style={{ fontSize: 13, color: "#fff", margin: 0, fontWeight: 800 }}>
                                            {expertResults.is_shadow_integrated ? "ИНТЕГРИРОВАНА" : "В ПРОЦЕССЕ"}
                                        </p>
                                    </div>
                                </div>

                                {expertResults.final_state_summary && (
                                    <div style={{ background: "rgba(139,92,246,0.08)", padding: 16, borderRadius: 20, borderLeft: "4px solid #8B5CF6" }}>
                                        <p style={{ fontSize: 10, color: "#A78BFA", fontWeight: 800, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>ИТОГ ТРАНСФОРМАЦИИ</p>
                                        <p style={{ fontSize: 14, color: "#fff", lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
                                            «{expertResults.final_state_summary}»
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            onClick={() => router.push("/diary")}
                            style={{
                                width: "100%", padding: "18px 20px", borderRadius: 18, border: "none",
                                cursor: "pointer", fontSize: 14, fontWeight: 800, textTransform: "uppercase",
                                background: "linear-gradient(135deg, #8B5CF6, #6366F1)", color: "#fff",
                                boxShadow: "0 8px 24px rgba(139,92,246,0.3)",
                            }}
                        >
                            Открыть записи в дневнике
                        </button>
                    </motion.div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input panel */}
            {!isComplete && (
                <div style={{ flexShrink: 0, padding: "10px 16px 20px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "#060818" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
                            <div style={{ flex: 1, position: "relative" }}>
                                <textarea
                                    ref={textareaRef}
                                    rows={1}
                                    value={isTranscribing ? "Транскрибирую в текст..." : input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            sendMessage();
                                        }
                                    }}
                                    placeholder="Ваш ответ..."
                                    disabled={isAiTyping || isTranscribing}
                                    style={{
                                        width: "100%", background: "rgba(255,255,255,0.06)",
                                        border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
                                        padding: "14px 48px 14px 16px", fontSize: 14, color: "#fff",
                                        outline: "none", resize: "none", lineHeight: "1.5", display: "block",
                                        maxHeight: "50vh", fontFamily: "inherit"
                                    }}
                                />
                                <button
                                    onClick={sendMessage}
                                    disabled={!input.trim() || isAiTyping || isTranscribing}
                                    style={{
                                        position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                                        width: 32, height: 32, borderRadius: 10, border: "none", cursor: "pointer",
                                        background: "rgba(245,158,11,0.2)", color: "#FCD34D",
                                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                                        opacity: (!input.trim() || isAiTyping) ? 0.3 : 1, transition: "all 0.2s"
                                    }}
                                >
                                    ↑
                                </button>
                                <AnimatePresence>
                                    {isRecording && (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                            style={{ position: "absolute", inset: 0, background: "rgba(236,72,153,0.1)", backdropFilter: "blur(8px)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(236,72,153,0.2)", pointerEvents: "none" }}>
                                            <div style={{ display: "flex", gap: 4 }}>
                                                {[0, 1, 2].map(i => (
                                                    <motion.div key={i} style={{ width: 4, height: 16, borderRadius: 4, background: "rgba(236,72,153,0.6)" }}
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
                                {isRecording ? "🔴" : (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="rgba(245,158,11,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                        <line x1="12" y1="19" x2="12" y2="23" />
                                        <line x1="8" y1="23" x2="16" y2="23" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 4 }}>
                            {stage < 6 && (
                                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                                    ☼ {STAGE_NAMES[stage]} {isDeepening && "· УГЛУБЛЕНИЕ"}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
