"use client";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { calcAPI, api, voiceAPI, visualAPI } from "@/lib/api";
import { useUserStore } from "@/lib/store";

const MicIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
);

const useVoiceRecorder = (userId: number | null, setInput: React.Dispatch<React.SetStateAction<string>>) => {
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
                    const res = await voiceAPI.transcribe(userId, blob, "onboarding");
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

// Constants for date/time selection
const YEARS = Array.from({ length: 101 }, (_, i) => String(2025 - i));
const MONTHS = [
    { value: "01", label: "Январь" }, { value: "02", label: "Февраль" }, { value: "03", label: "Март" },
    { value: "04", label: "Апрель" }, { value: "05", label: "Май" }, { value: "06", label: "Июнь" },
    { value: "07", label: "Июль" }, { value: "08", label: "Август" }, { value: "09", label: "Сентябрь" },
    { value: "10", label: "Октябрь" }, { value: "11", label: "Ноябрь" }, { value: "12", label: "Декабрь" },
];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

const GENDER_OPTIONS = [
    { value: "male", label: "Мужской", icon: "♂" },
    { value: "female", label: "Женский", icon: "♀" }
];

const CustomSelect = ({ value, onChange, options, flex, label }: any) => (
    <div style={{ flex: flex || 1, position: "relative" }}>
        {label && <p className="text-[11px] text-white/20 uppercase tracking-widest mb-1 ml-1">{label}</p>}
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full text-base outline-none appearance-none transition-all"
            style={{
                padding: "8px 12px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                color: "var(--text-primary)",
                fontSize: 15,
                WebkitTapHighlightColor: "transparent",
                colorScheme: "dark",
                cursor: "pointer"
            }}
        >
            {options.map((opt: any) => (
                <option key={opt.value || opt} value={opt.value || opt}>
                    {opt.label || opt}
                </option>
            ))}
        </select>
        <div style={{
            position: "absolute", right: 10, bottom: 10,
            pointerEvents: "none", opacity: 0.3, fontSize: 8
        }}>▼</div>
    </div>
);

function AstroFlow({ step, setStep, onBack }: { step: number, setStep: React.Dispatch<React.SetStateAction<number>>, onBack: () => void }) {
    const router = useRouter();
    const { userId, setUser, reset } = useUserStore();
    // step state moved up
    const [form, setForm] = useState({
        gender: "male",
        birth_year: "1990", birth_month: "01", birth_day: "15",
        birth_hour: "12", birth_minute: "00", birth_place: ""
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [geoResult, setGeoResult] = useState<any>(null);

    const steps = [
        { id: "gender", title: "Ваш пол", hint: "Это поможет подобрать стиль общения", icon: "👤", iconColor: "var(--cyan)", description: "Выберите ваш пол для персонализации ответов ИИ" },
        { id: "date", title: "Дата рождения", hint: "Точная дата — основа вашей карты", icon: "✦", iconColor: "var(--gold)", description: "Дата рождения формирует ядро вашей архетипической карты" },
        { id: "time", title: "Время рождения", hint: "Если не знаете — укажите 12:00", icon: "◉", iconColor: "var(--violet-l)", description: "Точное время раскрывает Асцендент и расположение домов" },
        { id: "place", title: "Место рождения", placeholder: "Москва, Россия", hint: "Введите город и страну", icon: "◈", iconColor: "var(--green)", description: "Географические координаты влияют на точность расчётов" },
        { id: "confirm", title: "Подтверждение", hint: "Проверьте координаты места", icon: "✓", iconColor: "var(--emerald)", description: "Убедитесь, что место определено верно для точных расчётов" },
    ];

    const currentStep = steps[step];

    const handleNext = async () => {
        setError("");
        if (currentStep.id === "place") {
            setLoading(true);
            try {
                const res = await calcAPI.geocode(form.birth_place);
                setGeoResult(res.data);
                setStep(s => s + 1);
            } catch (e: any) {
                const msg = e.response?.data?.detail || e.message || "";
                if (msg.toLowerCase().includes("user not found")) {
                    console.warn("User state is stale. Resetting and redirecting...");
                    reset();
                    router.push("/");
                    return;
                }
                setError("Не удалось найти место. Попробуйте уточнить название.");
            } finally {
                setLoading(false);
            }
            return;
        }

        if (step < steps.length - 1) {
            setStep(s => s + 1);
            return;
        }

        setLoading(true);
        try {
            await calcAPI.calculate({
                birth_date: `${form.birth_year}-${form.birth_month}-${form.birth_day}`,
                birth_time: `${form.birth_hour}:${form.birth_minute}`,
                birth_place: form.birth_place,
                user_id: userId!,
                gender: form.gender
            });
            setUser({ onboardingDone: true });
            router.push("/");
        } catch (e: any) {
            const msg = e.response?.data?.detail || e.message || "";
            if (msg.toLowerCase().includes("user not found")) {
                console.warn("User state is stale. Resetting and redirecting...");
                reset();
                router.push("/");
                return;
            }
            setError(msg || "Ошибка расчёта. Проверьте данные.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    className="p-5 rounded-[1.5rem] border border-white/10 mb-5 shadow-2xl mx-1"
                    style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)" }}
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div style={{
                            width: 38, height: 38, borderRadius: 12, background: "rgba(255,255,255,0.05)",
                            border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 16, color: currentStep.iconColor, flexShrink: 0
                        }}>{currentStep.icon}</div>
                        <div className="min-w-0">
                            <h2 className="text-base font-bold text-white/90 truncate">{currentStep.title}</h2>
                            <p className="text-xs text-white/40 leading-tight mt-0.5">{currentStep.description}</p>
                        </div>
                    </div>
                    <div className="h-px bg-white/5 mb-4" />

                    <div className="space-y-3">
                        {currentStep.id === "gender" ? (
                            <div className="grid grid-cols-2 gap-3">
                                {GENDER_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setForm(f => ({ ...f, gender: opt.value }))}
                                        className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-2 ${
                                            form.gender === opt.value 
                                            ? "bg-violet-500/10 border-violet-500/40 text-white" 
                                            : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                                        }`}
                                    >
                                        <span className="text-xl">{opt.icon}</span>
                                        <span className="text-[11px] font-bold uppercase tracking-wider">{opt.label}</span>
                                    </button>
                                ))}
                            </div>
                        ) : currentStep.id === "date" ? (
                            <div className="flex gap-2">
                                <CustomSelect label="День" value={form.birth_day} onChange={(v: string) => setForm(f => ({ ...f, birth_day: v }))} options={DAYS} flex={0.6} />
                                <CustomSelect label="Месяц" value={form.birth_month} onChange={(v: string) => setForm(f => ({ ...f, birth_month: v }))} options={MONTHS} flex={1.2} />
                                <CustomSelect label="Год" value={form.birth_year} onChange={(v: string) => setForm(f => ({ ...f, birth_year: v }))} options={YEARS} />
                            </div>
                        ) : currentStep.id === "time" ? (
                            <div className="flex gap-2 items-end">
                                <CustomSelect label="Час" value={form.birth_hour} onChange={(v: string) => setForm(f => ({ ...f, birth_hour: v }))} options={HOURS} />
                                <div className="text-white/20 pb-3 font-bold">:</div>
                                <CustomSelect label="Мин" value={form.birth_minute} onChange={(v: string) => setForm(f => ({ ...f, birth_minute: v }))} options={MINUTES} />
                            </div>
                        ) : currentStep.id === "place" ? (
                            <div className="relative">
                                <input
                                    type="text" value={form.birth_place}
                                    onChange={(e) => setForm(f => ({ ...f, birth_place: e.target.value }))}
                                    placeholder={currentStep.placeholder} autoFocus
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-[16px] text-white placeholder:text-white/20 outline-none focus:border-emerald-500/50 transition-all font-medium"
                                />
                            </div>
                        ) : (
                            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 text-center">
                                <div className="flex flex-col items-center mb-4">
                                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mb-2">
                                        <span className="text-emerald-400">📍</span>
                                    </div>
                                    <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Место определено</p>
                                    <p className="text-lg font-bold text-white leading-tight">{geoResult?.place}</p>
                                </div>
                                <div className="grid grid-cols-3 gap-2 py-3 border-t border-emerald-500/10 text-[10px] text-white/40 font-mono">
                                    <div className="flex flex-col">
                                        <span className="mb-0.5">ШИРОТА</span>
                                        <span className="text-white/80 font-bold">{geoResult?.lat != null ? geoResult.lat.toFixed(4) : "—"}°</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="mb-0.5">ДОЛГОТА</span>
                                        <span className="text-white/80 font-bold">{geoResult?.lon != null ? geoResult.lon.toFixed(4) : "—"}°</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="mb-0.5">ЗОНА</span>
                                        <span className="text-white/80 font-bold truncate">{geoResult?.tz_name?.split('/').pop() || "—"}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <p className="text-[11px] text-white/20 mt-4 flex items-center gap-2">
                        <span style={{ color: currentStep.iconColor }}>●</span>{currentStep.hint}
                    </p>
                </motion.div>
            </AnimatePresence>

            {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl mb-4 text-center">
                    <p className="text-xs text-rose-400">{error}</p>
                </motion.div>
            )}

            <button
                onClick={handleNext}
                disabled={loading || (currentStep.id === "place" && !form.birth_place)}
                className="w-full py-4 rounded-2xl font-black text-sm transition-all shadow-xl disabled:opacity-20 relative overflow-hidden group"
                style={{
                    background: (currentStep.id === "place" && !form.birth_place) ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, var(--violet), #6366f1)",
                    color: "#fff"
                }}
            >
                <span className="relative z-10">{loading ? (currentStep.id === "place" ? "Поиск..." : "Синхронизация...") : step < steps.length - 1 ? "Продолжить" : "Построить Аватара ✨"}</span>
                {!(currentStep.id === "place" && !form.birth_place) && !loading && (
                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12" />
                )}
            </button>

            <button 
                onClick={() => step > 0 ? setStep(s => s - 1) : onBack()} 
                className="w-full mt-4 text-[10px] font-bold text-white/20 uppercase tracking-widest hover:text-white/40 transition-colors"
                style={{ display: step === 0 && !onBack ? 'none' : 'block' }}
            >
                Назад
            </button>
        </motion.div>
    );
}

function AIFlow({ onBack }: { onBack: () => void }) {
    const router = useRouter();
    const { userId, setUser, reset } = useUserStore();
    const [messages, setMessages] = useState<{ role: string, content: string }[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [ready, setReady] = useState(false);
    const [calcLoading, setCalcLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { isRecording, isTranscribing, startRecording, stopRecording } = useVoiceRecorder(userId, setInput);

    // Initial message
    useEffect(() => {
        sendChat([{ role: "user", content: "Привет! Я готов к диагностике и узнать какие у меня активные архетипы." }]);
    }, []);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    const sendChat = async (hist: { role: string, content: string }[]) => {
        setLoading(true);
        setMessages(hist);
        try {
            const res = await api.post("/api/onboarding/ai/chat", { user_id: userId, chat_history: hist });
            setMessages([...hist, { role: "assistant", content: res.data.text }]);
            if (res.data.ready) {
                setReady(true);
            }
        } catch (e: any) {
            console.error(e);
            setMessages([...hist, { role: "assistant", content: "Ошибка связи с ядром. Попробуйте еще раз." }]);
        } finally {
            setLoading(false);
        }
    };

    const handleSend = () => {
        if (!input.trim() || loading || calcLoading) return;
        const newHistory = [...messages, { role: "user", content: input }];
        setInput("");
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
        sendChat(newHistory);
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

    const handleCalculate = async () => {
        setCalcLoading(true);
        try {
            await api.post("/api/onboarding/ai/calculate", { user_id: userId, chat_history: messages });
            setUser({ onboardingDone: true });
            router.push("/");
        } catch (e: any) {
            console.error(e);
            const msg = e.response?.data?.detail || e.message || "";
            if (msg.toLowerCase().includes("user not found")) {
                console.warn("User state is stale. Resetting and redirecting...");
                reset();
                router.push("/");
                return;
            }
            alert("Ошибка расчета карт.");
            setCalcLoading(false);
        }
    };



    const isReadyForSync = messages.length >= 7; // User sent 3+ responses

    // full-screen layout for AI flow
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: "fixed",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                background: "#060818",
                zIndex: 10,
            }}
        >
            {/* Top bar */}
            <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <button
                        onClick={onBack}
                        disabled={calcLoading}
                        style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
                    >
                        ← Назад
                    </button>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", textTransform: "uppercase" }}>☼ ИИ-диагностика</span>
                    <span style={{ fontSize: 10, color: "rgba(245,158,11,0.5)" }}>{Math.min(messages.length, 7)}/7</span>
                </div>
            </div>

            {/* Chat messages – fills all available space */}
            <div
                ref={scrollRef}
                style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10, scrollbarWidth: "none" }}
            >
                {messages.filter(m => !(m.role === 'user' && m.content.startsWith('Привет! Я готов'))).map((msg, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
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
                        <div style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 4px", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", fontSize: 12 }} className="animate-pulse">
                            Печатаю...
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom panel – always pinned to bottom */}
            <div style={{ flexShrink: 0, padding: "10px 16px 20px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Input row */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
                    <div style={{ flex: 1, position: "relative" }}>
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            value={isTranscribing ? "Транскрибирую в текст..." : input}
                            onChange={handleTextChange}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder="Ваш ответ..."
                            disabled={loading || calcLoading || isTranscribing}
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
                            disabled={!input.trim() || loading || calcLoading || isTranscribing}
                            style={{
                                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                                width: 32, height: 32, borderRadius: 10, border: "none", cursor: "pointer",
                                background: "rgba(245,158,11,0.2)", color: "#FCD34D",
                                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                                opacity: (!input.trim() || loading) ? 0.3 : 1,
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
                            transform: isRecording ? "scale(0.95)" : "scale(1)",
                            transition: "all 0.15s",
                        }}
                    >
                        {isRecording ? "🔴" : <MicIcon className="w-5 h-5 text-amber-500/60" />}
                    </button>
                </div>

                {/* CTA or progress hint */}
                {ready ? (
                    <motion.button
                        onClick={handleCalculate}
                        disabled={calcLoading}
                        animate={calcLoading ? {
                            boxShadow: ["0 4px 24px rgba(245,158,11,0.35)", "0 4px 32px rgba(245,158,11,0.6)", "0 4px 24px rgba(245,158,11,0.35)"],
                            opacity: [1, 0.8, 1]
                        } : {
                            boxShadow: "0 4px 24px rgba(245,158,11,0.35)",
                            opacity: 1
                        }}
                        transition={calcLoading ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : {}}
                        style={{
                            width: "100%", padding: "15px", borderRadius: 18, border: "none", cursor: "pointer",
                            background: "linear-gradient(135deg, #F59E0B, #F97316)",
                            color: "#fff", fontWeight: 900, fontSize: 15, letterSpacing: "0.02em",
                        }}
                    >
                        {calcLoading ? "Расчет карт..." : "Получить карты"}
                    </motion.button>
                ) : (
                    <p style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
                        {loading ? "Анализирую..." : "☼ Идет диагностика состояния"}
                    </p>
                )}
            </div>
        </motion.div>
    );
}

import SacredGeometryLogo from "@/components/SacredGeometryLogo";

export default function OnboardingPage() {
    const { userId, setUser } = useUserStore();
    const [path, setPath] = useState<"astro" | "ai" | "visual" | null>("astro");
    const [step, setStep] = useState(0); // Moved step state up to track progress globally
    
    // total steps for astro flow
    const totalAstroSteps = 5;
    const progress = ((step + 1) / totalAstroSteps) * 100;

    useEffect(() => {
        const checkDebug = async () => {
            const params = new URLSearchParams(window.location.search);
            const isDebug = params.get("debug") === "true";
            const testUserId = params.get("user_id");
            
            // Re-authenticate if in debug mode, especially if we have a specific user_id in URL
            // OR if we don't have a userId in the store at all.
            if (isDebug) {
                try {
                    console.log("Onboarding: Debug mode detected, authenticating test user...", testUserId);
                    const authRes = await api.post("/api/auth", { 
                        initData: "", 
                        test_mode: true, 
                        test_user_id: testUserId ? parseInt(testUserId) : 12345678 
                    });
                    const d = authRes.data;
                    console.log("Onboarding: Debug auth success, user_id:", d.user_id);
                    
                    setUser({
                        userId: d.user_id, tgId: d.tg_id, firstName: d.first_name,
                        token: d.token, energy: d.energy, streak: d.streak,
                        evolutionLevel: d.evolution_level, title: d.title,
                        onboardingDone: d.onboarding_done,
                    });
                    if (typeof window !== "undefined")
                        localStorage.setItem("avatar_token", d.token);
                } catch (e) {
                    console.error("Debug login failed", e);
                }
            }
        };
        checkDebug();
        console.log("OnboardingPage initialized, path:", path, "step:", step);
    }, [setUser]); // Remove userId from deps to avoid loop if we always re-auth in debug

    useEffect(() => {
        console.log("Onboarding progress update:", { path, step, progress });
    }, [path, step, progress]);

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
        <div className={`min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden bg-[#060818]`}>
            <div className="absolute inset-0 pointer-events-none">
                <div style={{
                    position: "absolute", top: "10%", left: "15%", width: 280, height: 280,
                    background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
                    borderRadius: "50%", filter: "blur(32px)"
                }} />
                <div style={{
                    position: "absolute", bottom: "15%", right: "10%", width: 220, height: 220,
                    background: "radial-gradient(circle, rgba(245,158,11,0.10) 0%, transparent 70%)",
                    borderRadius: "50%", filter: "blur(28px)"
                }} />
            </div>

            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {particles.map((p, i) => (
                    <motion.div key={i}
                        className="absolute rounded-full bg-white"
                        style={{ left: p.left, top: p.top, width: p.size, height: p.size, opacity: p.opacity }}
                        animate={{ opacity: [p.opacity, p.opacity * 3, p.opacity] }}
                        transition={{ duration: p.duration, repeat: Infinity, delay: p.delay }}
                    />
                ))}
            </div>

            <div className="relative z-10 w-full max-w-[340px]" style={{ transform: "translateY(-6vh)" }}>
                {/* Logo & Header */}
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
                    <div style={{ marginBottom: 2 }}>
                        <SacredGeometryLogo size={200} progress={0.9} />
                    </div>
                    <h1 className="text-[44px] font-bold tracking-tight" style={{
                        marginBottom: -4,
                        background: "linear-gradient(to right, #EF4444 5%, #F97316, #EAB308, #10B981, #3B82F6, #6366F1, #A855F7 95%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                        color: "transparent"
                    }}>AVATAR</h1>
                    <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] mb-6">Платформа эволюции</p>
                    
                    {path === 'astro' && (
                        <div className="w-full px-4 mb-4">
                            <div className="flex justify-between mb-1.5 text-white/20">
                                <span className="text-[11px] uppercase font-bold tracking-widest">Шаг {step + 1} из {totalAstroSteps}</span>
                                <span className="text-[11px] font-bold">{Math.round(progress)}%</span>
                            </div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <motion.div className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 rounded-full" animate={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    )}
                </motion.div>

                {path === 'astro' && <AstroFlow step={step} setStep={setStep} onBack={() => {}} />}
                {path === 'ai' && <AIFlow onBack={() => setPath('astro')} />}
            </div>
        </div>
    );
}

function VisualFlow({ onBack, onComplete }: { onBack: () => void, onComplete: () => void }) {
    const { userId, reset } = useUserStore();
    const router = useRouter();
    const [stimuli, setStimuli] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [startTime, setStartTime] = useState<number>(0);
    const [step, setStep] = useState(0);
    const totalSteps = 3;

    // Telemetry state
    const interactionsRef = useRef<Record<number, any>>({});
    const [sessionId, setSessionId] = useState<number | null>(null);

    useEffect(() => {
        visualAPI.logEvent({ user_id: userId!, event_type: "SESSION_START", payload: { mode: "onboarding" } });
        fetchSet();
    }, []);

    const fetchSet = async () => {
        setLoading(true);
        try {
            const res = await visualAPI.getSet(userId!, 4);
            setStimuli(res.data);
            setStartTime(Date.now());

            // Log IMAGES_SHOWN
            visualAPI.logEvent({
                user_id: userId!,
                session_id: sessionId || undefined,
                event_type: "IMAGES_SHOWN",
                payload: { image_ids: res.data.map((s: any) => s.id) }
            });
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleHover = (id: number, enter: boolean) => {
        if (enter) {
            visualAPI.logEvent({ user_id: userId!, session_id: sessionId || undefined, event_type: "IMAGE_HOVER", payload: { image_id: id } });
            if (!interactionsRef.current[id]) {
                interactionsRef.current[id] = { image_id: id, hover_time: 0, start: Date.now() };
            } else {
                interactionsRef.current[id].start = Date.now();
            }
        } else {
            if (interactionsRef.current[id]?.start) {
                const duration = Date.now() - interactionsRef.current[id].start;
                interactionsRef.current[id].hover_time += duration;
                interactionsRef.current[id].start = null;
            }
        }
    };

    const handleSelect = async (selectedId: number) => {
        handleHover(selectedId, false);
        const reactionTime = Date.now() - startTime;

        const interactionList = Object.values(interactionsRef.current).map(inter => ({
            image_id: inter.image_id,
            hover_time: inter.hover_time,
            selected: inter.image_id === selectedId,
            reaction_time: inter.image_id === selectedId ? reactionTime : null
        }));

        try {
            const res = await visualAPI.report({
                user_id: userId!,
                shown_ids: stimuli.map(s => s.id),
                selected_id: selectedId,
                reaction_time_ms: reactionTime,
                interactions: interactionList
            });

            if (!sessionId) setSessionId(res.data.session_id);

            visualAPI.logEvent({
                user_id: userId!,
                session_id: res.data.session_id,
                event_type: "IMAGE_SELECTED",
                payload: { image_id: selectedId, reaction_time: reactionTime }
            });

            if (step < totalSteps - 1) {
                interactionsRef.current = {};
                setStep(s => s + 1);
                fetchSet();
            } else {
                visualAPI.logEvent({ user_id: userId!, session_id: res.data.session_id, event_type: "SESSION_END", payload: {} });
                onComplete();
            }
        } catch (e: any) {
            console.error(e);
            const msg = e.response?.data?.detail || e.message || "";
            if (msg.toLowerCase().includes("user not found")) {
                console.warn("User state is stale. Resetting and redirecting...");
                reset();
                router.push("/");
            }
        }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onMouseMove={(e) => {
                // Throttle would be better, but for now simple logging
                if (Math.random() > 0.98) {
                    visualAPI.logEvent({ user_id: userId!, session_id: sessionId || undefined, event_type: "CURSOR_MOVE", payload: { x: e.clientX, y: e.clientY } });
                }
            }}
            style={{ position: "fixed", inset: 0, background: "#060818", zIndex: 20, display: "flex", flexDirection: "column", padding: 20 }}>
            <div style={{ textAlign: "center", marginBottom: 30, marginTop: 20 }}>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: 8 }}>
                    Визуальный Резонанс ({step + 1}/{totalSteps})
                </p>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>Выберите образ, который откликается в моменте</h2>
            </div>

            {loading ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignContent: "center" }}>
                    {stimuli.map((s) => (
                        <motion.button
                            key={s.id}
                            whileTap={{ scale: 0.95 }}
                            onMouseEnter={() => handleHover(s.id, true)}
                            onMouseLeave={() => handleHover(s.id, false)}
                            onClick={() => handleSelect(s.id)}
                            style={{
                                aspectRatio: "1/1",
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                borderRadius: 24,
                                overflow: "hidden",
                                position: "relative"
                            }}
                        >
                            <img src={s.image_url} alt="Stimulus" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.8 }} />
                            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.4), transparent)" }} />
                        </motion.button>
                    ))}
                </div>
            )}

            <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 20 }}>
                Не анализируйте — выбирайте импульсивно
            </p>
        </motion.div>
    );
}
