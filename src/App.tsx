import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, Terminal, Settings, History, Play, Plus, ChevronRight, X, Clock, Target, AlertCircle, Upload, FileText, CheckCircle } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { extractTextFromFile } from "./lib/FileService";
import { Button, Card, Input, Textarea } from "./components/ui/BaseComponents";
import { AudioWaveform } from "./components/AudioWaveform";
import { InterviewConfig, InterviewSessionStatus, TranscriptTurn, DebriefData, InterviewSession } from "./types";
import { MultimodalLiveClient } from "./lib/MultimodalLiveClient";
import { GeminiService } from "./lib/GeminiService";
import { cn, formatDuration, generateId } from "./lib/utils";

export default function App() {
  const [status, setStatus] = React.useState<InterviewSessionStatus>("idle");
  const [sessions, setSessions] = React.useState<InterviewSession[]>([]);
  const [activeSession, setActiveSession] = React.useState<InterviewSession | null>(null);
  const [config, setConfig] = React.useState<InterviewConfig>({
    mode: "Technical",
    difficulty: "Medium",
    plannedDuration: 30,
    interviewerCount: 1,
  });
  const [transcript, setTranscript] = React.useState<TranscriptTurn[]>([]);
  const [debrief, setDebrief] = React.useState<DebriefData | null>(null);
  const [elapsedTime, setElapsedTime] = React.useState(0);
  const [isSpeaking, setIsSpeaking] = React.useState(false);

  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    if (status === "interviewing") {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  React.useEffect(() => {
    const saved = localStorage.getItem("interview_sessions");
    if (saved) {
      try {
        setSessions(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load sessions", e);
      }
    }
  }, []);

  React.useEffect(() => {
    localStorage.setItem("interview_sessions", JSON.stringify(sessions));
  }, [sessions]);

  const startSetup = () => setStatus("setup");
  const clientRef = React.useRef<MultimodalLiveClient | null>(null);

  const startInterview = async () => {
    setStatus("connecting");
    const systemInstruction = `
      You are an AI Interviewer for a ${config.mode} interview. 
      Difficulty: ${config.difficulty}.
      Planned Duration: ${config.plannedDuration} minutes.
      Company Context: ${config.companyWebsite || "N/A"}.
      Job Description: ${config.jobDescription || "N/A"}.
      User's Resume: ${config.resumeText || "N/A"}.

      ${config.difficulty === "Easy" ? "Be supportive, give hints, and guide the user toward STAR format answers." : ""}
      ${config.difficulty === "Medium" ? "Be professional and neutral. Probe for metrics and tradeoffs." : ""}
      ${config.difficulty === "Hard" ? "Be strict, skeptical, and blunt. If an answer is vague, call it out and force specificity. Ask tough follow-ups about tradeoffs and edge cases." : ""}

      Always stay in character. If the user stops talking, ask the next question.
    `;

    clientRef.current = new MultimodalLiveClient({
      onMessage: (msg) => {
        // Handle other messages if needed
      },
      onStateChange: (s) => {
        if (s === "connected") setStatus("interviewing");
        if (s === "error") setStatus("fallback_text");
      },
      onTranscript: (turn) => {
        setTranscript(prev => [...prev, turn]);
      },
      onError: (err) => {
        console.error(err);
        setStatus("fallback_text");
      },
      onVolumeChange: (vol) => {
        setIsSpeaking(vol > 0.05);
      }
    });

    try {
      await clientRef.current.connect(process.env.GEMINI_API_KEY!, { systemInstruction });
      await clientRef.current.startMic();
    } catch (e) {
      console.error(e);
      setStatus("fallback_text");
    }
  };

  const endSession = async () => {
    setStatus("analyzing");
    if (clientRef.current) clientRef.current.disconnect();
    
    const service = new GeminiService(process.env.GEMINI_API_KEY!);
    try {
      const data = await service.generateDebrief(transcript, config);
      setDebrief(data);
      
      const newSession: InterviewSession = {
        id: generateId(),
        createdAt: new Date().toISOString(),
        config: { ...config },
        transcript: [...transcript],
        debrief: data,
        duration: elapsedTime
      };
      setSessions(prev => [newSession, ...prev]);
      setStatus("debriefing");
    } catch (e) {
      console.error(e);
      // Fallback to error UI or at least show partial data
    }
  };

  return (
    <div className="min-h-screen aurora-bg relative overflow-hidden flex flex-col items-center">
      <div className="absolute inset-0 noise-overlay opacity-[0.03] pointer-events-none" />
      
      {/* Header */}
      <nav className="w-full max-w-[1200px] px-10 h-20 flex justify-between items-center z-10 bg-white/70 backdrop-blur-xl border-b border-clean-border">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-brand-emerald rounded-full" />
          <h1 className="text-xl font-bold tracking-tight text-clean-ink">Interview<span className="font-medium">Pulse</span></h1>
        </div>
        
        {status === "interviewing" && (
          <div className="bg-emerald-50 text-brand-emerald px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-brand-emerald rounded-full animate-pulse" />
            LIVE INTERVIEW MODE
          </div>
        )}

        <div className="flex items-center gap-6">
          {status === "interviewing" && (
            <div className="text-right">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Session Duration</div>
              <div className="text-sm font-bold">{formatDuration(elapsedTime)}</div>
            </div>
          )}
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="hidden sm:flex items-center gap-2"
              onClick={() => setStatus("history")}
            >
              <History size={16} />
            </Button>
            <Button variant="ghost" size="sm" className="hidden sm:flex items-center gap-2">
              <Settings size={16} />
            </Button>
          </div>
        </div>
      </nav>

      <main className="w-full max-w-[1240px] px-10 flex-1 flex flex-col z-10 py-6">
        <AnimatePresence mode="wait">
          {status === "idle" && (
            <LandingView key="idle" onStart={startSetup} />
          )}
          {status === "setup" && (
            <SetupView key="setup" config={config} setConfig={setConfig} onStart={startInterview} />
          )}
          {status === "connecting" && (
            <ConnectingView key="connecting" onConnected={() => setStatus("interviewing")} onFail={() => setStatus("fallback_text")} />
          )}
          {status === "interviewing" && (
            <InterviewRoomView 
              key="interview" 
              config={config} 
              elapsedTime={elapsedTime} 
              transcript={transcript}
              onEnd={endSession}
              isSpeaking={isSpeaking}
            />
          )}
          {status === "fallback_text" && (
            <FallbackTextView 
              key="fallback"
              transcript={transcript}
              onSend={(text) => {
                setTranscript(prev => [...prev, { speaker: "user", text, timestamp_start: new Date().toISOString(), timestamp_end: new Date().toISOString() }]);
                // Here we would normally send to Gemini Chat API for fallback
              }}
              onEnd={endSession}
            />
          )}
          {status === "analyzing" && (
            <AnalysisView key="analysis" onComplete={(data) => {
              setDebrief(data);
              setStatus("debriefing");
            }} />
          )}
          {status === "debriefing" && debrief && (
            <DebriefView key="debrief" data={debrief} onRestart={() => setStatus("idle")} />
          )}
          {status === "history" && (
            <HistoryView 
              sessions={sessions} 
              onBack={() => setStatus("idle")} 
              onSelect={(s) => {
                setActiveSession(s);
                setStatus("replay");
              }}
              onDelete={(id) => setSessions(prev => prev.filter(s => s.id !== id))}
            />
          )}
          {status === "replay" && activeSession && (
            <ReplayView 
              session={activeSession} 
              onBack={() => setStatus("history")} 
            />
          )}
        </AnimatePresence>
      </main>

      {/* Footer Meta */}
      <footer className="w-full max-w-[1100px] px-8 py-8 flex justify-between items-center text-gray-400 text-xs font-mono uppercase tracking-widest z-10">
        <div>Pulse.V1 // Beta Access</div>
        <div>Gemini 3.1 Live Interface</div>
      </footer>
    </div>
  );
}

function LandingView({ onStart, ...props }: { onStart: () => void; [key: string]: any }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex-1 flex flex-col justify-center items-center text-center py-20"
    >
      <h2 className="text-5xl sm:text-7xl font-display font-light leading-tight mb-6">
        Master the Art of the <br /> 
        <span className="italic text-brand-emerald font-medium">Conversation.</span>
      </h2>
      <p className="text-lg text-gray-500 max-w-2xl mb-12">
        A premium AI-powered interview simulation designed for low-latency, 
        voice-first sessions. Real-time feedback, deep analysis, 
        and bespoke interviewer personas.
      </p>
      <Button size="lg" onClick={onStart} className="gap-2 group">
        Initialize Session
        <ChevronRight className="group-hover:translate-x-1 transition-transform" />
      </Button>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mt-24 text-left w-full">
        <FeatureItem 
          icon={<Mic className="text-brand-emerald" />} 
          title="Voice First" 
          desc="Gemini Live API provides near-zero latency bidirectional voice." 
        />
        <FeatureItem 
          icon={<Target className="text-brand-emerald" />} 
          title="Adaptive Difficulty" 
          desc="From guiding mentor to skeptical panel experts." 
        />
        <FeatureItem 
          icon={<History className="text-brand-emerald" />} 
          title="Deep Debrief" 
          desc="Instant JSON analysis with timestamped evidence of performance." 
        />
      </div>
    </motion.div>
  );
}

function FeatureItem({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <Card className="flex flex-col gap-4 border-clean-border bg-white shadow-sm">
      <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold mb-1 text-clean-ink">{title}</h3>
        <p className="text-sm text-gray-500">{desc}</p>
      </div>
    </Card>
  );
}

function SetupView({ config, setConfig, onStart, ...props }: { config: InterviewConfig, setConfig: any, onStart: () => void | Promise<void>; [key: string]: any }) {
  const [isParsing, setIsParsing] = React.useState(false);

  const onDrop = React.useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsParsing(true);
    try {
      const text = await extractTextFromFile(file);
      setConfig({ ...config, resumeText: text, resumeFileName: file.name });
    } catch (error) {
      console.error("Extraction failed:", error);
    } finally {
      setIsParsing(false);
    }
  }, [config, setConfig]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    multiple: false
  } as any);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 max-w-3xl mx-auto w-full py-12"
    >
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-display font-medium mb-2 text-clean-ink">Initialize Your Profile</h2>
        <p className="text-gray-500">Configure your session parameters to ground the AI in your professional context.</p>
      </div>

      <div className="space-y-10">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="text-[11px] font-bold uppercase text-gray-400 tracking-widest">Interview Mode</label>
            <select 
              className="w-full bg-white border border-clean-border rounded-xl px-4 py-3 text-clean-ink shadow-sm appearance-none focus:ring-2 focus:ring-brand-emerald/10 transition-all"
              value={config.mode}
              onChange={(e) => setConfig({ ...config, mode: e.target.value })}
            >
              <option>Technical</option>
              <option>HR</option>
              <option>Coding</option>
              <option>Situational</option>
              <option>Custom</option>
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-[11px] font-bold uppercase text-gray-400 tracking-widest">Difficulty</label>
            <select 
              className="w-full bg-white border border-clean-border rounded-xl px-4 py-3 text-clean-ink shadow-sm appearance-none focus:ring-2 focus:ring-brand-emerald/10 transition-all"
              value={config.difficulty}
              onChange={(e) => setConfig({ ...config, difficulty: e.target.value })}
            >
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[11px] font-bold uppercase text-gray-400 tracking-widest">Target Context</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input 
              placeholder="Company Website (e.g. google.com)" 
              value={config.companyWebsite} 
              onChange={(e) => setConfig({ ...config, companyWebsite: e.target.value })}
              className="py-3"
            />
            <div className="text-xs text-gray-400 flex items-center italic">
              AI will scrape public info to tailor questions.
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[11px] font-bold uppercase text-gray-400 tracking-widest">Job Description</label>
          <Textarea 
            placeholder="Paste the role responsibilities and requirements here..."
            className="min-h-[120px]"
            value={config.jobDescription || ""}
            onChange={(e) => setConfig({ ...config, jobDescription: e.target.value })}
          />
        </div>

        <div className="space-y-4">
          <label className="text-[11px] font-bold uppercase text-gray-400 tracking-widest">Resume / CV</label>
          
          {!config.resumeFileName ? (
            <div 
              {...getRootProps()} 
              className={cn(
                "border-2 border-dashed rounded-2xl p-10 transition-all text-center cursor-pointer flex flex-col items-center gap-4",
                isDragActive ? "border-brand-emerald bg-emerald-50" : "border-gray-200 hover:border-brand-emerald/40 hover:bg-gray-50/50"
              )}
            >
              <input {...getInputProps()} />
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-brand-emerald">
                <Upload size={24} />
              </div>
              <div>
                <p className="font-semibold text-clean-ink">Drop your CV here or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">Supports PDF or DOCX</p>
              </div>
            </div>
          ) : (
            <Card className="flex items-center justify-between py-6 px-8 border-brand-emerald/20 bg-emerald-50/30">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-brand-emerald/10 flex items-center justify-center text-brand-emerald">
                  <FileText size={24} />
                </div>
                <div>
                  <div className="font-bold text-clean-ink leading-none mb-1">{config.resumeFileName}</div>
                  <div className="text-[10px] uppercase font-bold text-brand-emerald tracking-wider flex items-center gap-1">
                    <CheckCircle size={12} /> Successfully Scanned
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setConfig({ ...config, resumeText: "", resumeFileName: "" })}>
                <X size={16} />
              </Button>
            </Card>
          )}

          {isParsing && (
            <div className="flex items-center gap-2 text-xs text-brand-emerald animate-pulse">
              <div className="w-2 h-2 rounded-full bg-brand-emerald" />
              Intelligence engine parsing career history...
            </div>
          )}

          <div className="space-y-2">
            <details className="text-xs text-gray-400 cursor-pointer">
              <summary className="hover:text-brand-emerald transition-colors">Or paste text manually</summary>
              <div className="mt-3">
                <Textarea 
                  placeholder="Paste CV text content here..."
                  className="min-h-[150px] text-xs font-mono"
                  value={config.resumeText || ""}
                  onChange={(e) => setConfig({ ...config, resumeText: e.target.value })}
                />
              </div>
            </details>
          </div>
        </div>

        <div className="flex justify-between items-center pt-10 border-t border-clean-border">
          <div className="flex gap-8">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Duration</span>
              <div className="flex items-center gap-2 font-bold text-clean-ink">
                <Clock size={16} className="text-brand-emerald" />
                {config.plannedDuration} Minutes
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Panel</span>
              <div className="flex items-center gap-2 font-bold text-clean-ink">
                <Target size={16} className="text-brand-emerald" />
                {config.interviewerCount < 2 ? "1 AI Interviewer" : "2 Expert Panel"}
              </div>
            </div>
          </div>
          <Button onClick={onStart} size="lg" className="min-w-[240px] rounded-2xl py-4 flex items-center gap-2 group">
            Start AI Interview
            <ChevronRight className="group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function ConnectingView({ onConnected, onFail, ...props }: { onConnected: () => void, onFail: () => void; [key: string]: any }) {
  React.useEffect(() => {
    const timer = setTimeout(onConnected, 2000); // Simulated connection
    return () => clearTimeout(timer);
  }, [onConnected]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <motion.div 
        animate={{ scale: [1, 1.05, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="w-24 h-24 rounded-full border-2 border-brand-emerald flex items-center justify-center mb-8 bg-emerald-50"
      >
        <Mic className="text-brand-emerald w-10 h-10" />
      </motion.div>
      <h3 className="text-xl font-display font-medium mb-2 text-clean-ink">Connecting to Live API...</h3>
      <p className="text-gray-400 font-mono text-xs uppercase tracking-widest">Initializing Neural Bridge v3.1</p>
    </div>
  );
}

function InterviewRoomView({ config, elapsedTime, transcript, onEnd, isSpeaking, ...props }: { 
  config: InterviewConfig, 
  elapsedTime: number, 
  transcript: TranscriptTurn[],
  onEnd: () => void | Promise<void>,
  isSpeaking: boolean;
  [key: string]: any;
}) {
  const interviewerAvatars = React.useMemo(() => {
    const diff = config.difficulty;
    const items = [];
    
    if (diff === "Easy") {
      items.push({ name: "Elena", role: "Talent Mentor", img: "https://picsum.photos/seed/approachable/400/400" });
    } else if (diff === "Medium") {
      items.push({ name: "Marcus", role: "Principal Engineer", img: "https://picsum.photos/seed/professional/400/400" });
      if (config.interviewerCount > 1) {
        items.push({ name: "Jasmine", role: "Tech Lead", img: "https://picsum.photos/seed/coding/400/400" });
      }
    } else { // Hard
      items.push({ name: "Dr. Aris", role: "Critical Director", img: "https://picsum.photos/seed/strict/400/400" });
      if (config.interviewerCount > 1) {
        items.push({ name: "Sarah", role: "Senior Partner", img: "https://picsum.photos/seed/expert/400/400" });
      }
    }
    return items;
  }, [config.difficulty, config.interviewerCount]);

  return (
    <div className="flex-1 flex flex-col gap-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex-1 grid grid-cols-12 gap-6"
      >
        {/* Stage */}
        <div className="col-span-12 lg:col-span-8">
          <Card className="h-full flex flex-col items-center justify-center relative overflow-hidden bg-white/70 backdrop-blur-xl group">
            <div className="flex gap-16 items-center mb-12">
              <div className="flex flex-col items-center gap-4">
                <div className="w-40 h-40 rounded-full bg-gray-100 flex items-center justify-center border-4 border-white shadow-lg relative">
                  <span className="text-4xl grayscale opacity-50">👤</span>
                  <div className="absolute -bottom-10 w-32 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Candidate (You)
                  </div>
                </div>
              </div>

              <div className="flex gap-8">
                {interviewerAvatars.map((ai, idx) => (
                  <div key={idx} className="flex flex-col items-center gap-4">
                    <div className={cn(
                      "w-40 h-40 rounded-full bg-clean-ink flex items-center justify-center border-4 border-white shadow-2xl relative transition-all duration-500 overflow-hidden",
                      isSpeaking && "ring-emerald-500/20 ring-offset-[8px] ring-2 scale-105"
                    )}>
                      <img 
                        src={ai.img} 
                        alt={ai.name} 
                        className={cn("w-full h-full object-cover grayscale brightness-90 contrast-110", !isSpeaking && "opacity-60")}
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-brand-emerald/10 mix-blend-overlay" />
                      <div className="absolute -bottom-10 w-32 text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-emerald">
                          {ai.name} ({ai.role})
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-sm font-medium text-gray-500 mb-8 mt-4">
              {isSpeaking ? "AI is responding..." : "Listening for your response..."}
            </div>

            <AudioWaveform isSpeaking={isSpeaking} />

            <div className="absolute bottom-6 left-6">
               <div className="px-3 py-1 bg-gray-100 rounded-full text-[10px] font-bold tracking-wider text-gray-500 uppercase">
                {config.mode} // {config.difficulty}
              </div>
            </div>
          </Card>
        </div>

        {/* Panel */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-5">
          <Card className="p-5 flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Current Context</label>
            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold text-clean-ink leading-tight">Senior Solutions Architect</div>
                <div className="text-xs text-gray-500">Google • Tech Ops</div>
              </div>
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest",
                config.difficulty === "Hard" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-brand-emerald"
              )}>
                {config.difficulty} MODE
              </span>
            </div>
          </Card>

          <Card className="p-5 flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Interviewer Panel</label>
            <div className="font-bold text-clean-ink mb-1">
              {config.difficulty === "Easy" && "Elena (Talent Mentor)"}
              {config.difficulty === "Medium" && (config.interviewerCount > 1 ? "Marcus & Jasmine" : "Marcus (Principal)")}
              {config.difficulty === "Hard" && (config.interviewerCount > 1 ? "Dr. Aris & Sarah" : "Dr. Aris (Expert)")}
            </div>
            <p className="text-xs text-gray-500 italic leading-relaxed">
              {config.difficulty === "Easy" && "\"Supportive and guiding session focused on core alignment and potential.\""}
              {config.difficulty === "Medium" && "\"Standard technical assessment focused on implementation details and system knowledge.\""}
              {config.difficulty === "Hard" && "\"Skeptical senior panel focus on metrics and tradeoff grilling. They will call out vague answers.\""}
            </p>
          </Card>

          <Card className="p-5 flex flex-col gap-1 flex-1 overflow-hidden">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Live Transcript</label>
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-hide">
              {transcript.length === 0 && (
                <p className="text-gray-300 text-center py-6 italic text-xs">Transcript appearing...</p>
              )}
              {transcript.map((turn, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <span className={cn("text-[8px] uppercase font-bold tracking-widest", turn.speaker === "user" ? "text-brand-emerald text-right" : "text-gray-400")}>
                    {turn.speaker}
                  </span>
                  <p className={cn("text-xs leading-loose", turn.speaker === "user" ? "text-right" : "text-gray-600")}>{turn.text}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </motion.div>

      {/* Control Bar */}
      <div className="h-20 bg-clean-ink rounded-2xl flex items-center justify-between px-8 shadow-2xl">
        <div className="flex gap-4">
          <button className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors">
            <Mic size={18} />
          </button>
          <button className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors">
            <Terminal size={18} />
          </button>
          <button className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors">
            <Settings size={18} />
          </button>
        </div>

        <div className="text-gray-400 text-xs font-medium tracking-wide">
          Real-time bidirectional streaming active
        </div>

        <button 
          onClick={onEnd}
          className="bg-red-500 hover:bg-red-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-lg shadow-red-500/20"
        >
          End Interview & Get Debrief
        </button>
      </div>
    </div>
  );
}

function AnalysisView({ onComplete, ...props }: { onComplete: (data: DebriefData) => void; [key: string]: any }) {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      // Mock debrief data for preview
      onComplete({
        session_summary: {
          session_status: "completed",
          planned_duration_minutes: 30,
          actual_duration_minutes: 5,
          role_guess: "Senior Frontend Engineer",
          company: "Google",
          interview_type: "Technical",
          difficulty: "Hard",
          topics_discussed: [{ topic: "React Architecture", notes: ["Discussed hydration issues", "Server Components tradeoffs"] }]
        },
        scores: {
          overall: 82, communication: 90, structure_star: 75, role_fit: 85, confidence_clarity: 88, delivery: 78, technical_depth: 80
        },
        strengths: [{ title: "Analytical Depth", evidence: { timestamp_start: "01:22", timestamp_end: "01:45", quote: "I would opt for optimistic updates to reduce perceived latency..." }, why_it_matters: "Shows user-centric technical thinking." }],
        improvements: [{ title: "Quantify Impact", issue: "Answers lacked metrics.", evidence: { timestamp_start: "03:10", timestamp_end: "03:30", quote: "I led the migration to Vite..." }, better_answer_example: "I led the migration to Vite, reducing build times by 40%.", micro_exercise: "Practice the 'Result' phase of STAR specifically." }],
        delivery_metrics: { filler_word_estimate: 4, pace_wpm_estimate: 145, long_pause_estimate: 2 },
        moments_that_mattered: [{ label: "The Handoff", timestamp_start: "02:15", timestamp_end: "02:20", reason: "Clean transition from technical constraints to UX impact." }],
        practice_plan_7_days: [{ day: 1, focus: "STAR Framework", tasks: ["Map 3 projects to STAR"], time_minutes: 45 }],
        next_interview_checklist: ["Prepare 2 metrics for every project", "Check audio quality"],
        notes_if_low_data: ""
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div className="w-16 h-16 border-t-2 border-brand-emerald rounded-full animate-spin mb-8" />
      <h3 className="text-xl font-display font-medium mb-2 text-clean-ink">Analyzing Session Architecture...</h3>
      <p className="text-gray-400 font-mono text-xs uppercase tracking-widest text-center max-w-xs">
        Synthesizing transcript metrics and cross-referencing industry benchmarks.
      </p>
    </div>
  );
}

function DebriefView({ data, onRestart, ...props }: { data: DebriefData, onRestart: () => void; [key: string]: any }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 py-12 space-y-12"
    >
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-display font-medium mb-2 text-clean-ink">Session Debrief</h2>
          <p className="text-gray-400 tracking-widest font-mono text-xs uppercase">Report // ID-{generateId()}</p>
        </div>
        <Button variant="secondary" onClick={onRestart}>Exit to Dashboard</Button>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Main Stats */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Card className="text-center p-12">
            <span className="text-sm font-mono text-gray-400 uppercase tracking-widest mb-4 block">Overall Performance</span>
            <div className="text-8xl font-display font-light text-brand-emerald">{data.scores.overall}</div>
            <div className="w-full bg-gray-100 h-1 mt-8 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${data.scores.overall}%` }}
                className="bg-brand-emerald h-full"
                transition={{ duration: 1, delay: 0.5 }}
              />
            </div>
          </Card>

          <Card className="space-y-4">
            <h4 className="text-xs font-mono uppercase text-gray-400 tracking-widest">Detail Metrics</h4>
            {Object.entries(data.scores).filter(([k]) => k !== "overall").map(([key, val]) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-xs font-mono uppercase">
                  <span className="text-gray-500">{key.replace("_", " ")}</span>
                  <span className="text-clean-ink">{val}</span>
                </div>
                <div className="w-full bg-gray-100 h-0.5 rounded-full overflow-hidden">
                  <div className="bg-brand-emerald/50 h-full" style={{ width: `${val}%` }} />
                </div>
              </div>
            ))}
          </Card>
        </div>

        {/* Detailed Feedback */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          <section className="space-y-4">
            <h3 className="text-xl font-display font-medium flex items-center gap-2 text-clean-ink">
              <Target className="text-brand-emerald" size={20} />
              Key Strengths
            </h3>
            <div className="grid gap-4">
              {data.strengths.map((s, i) => (
                <Card key={i} className="border-none bg-gray-50/50">
                  <h4 className="font-semibold mb-2 text-clean-ink">{s.title}</h4>
                  <p className="text-sm text-gray-500 mb-4 italic">"{s.evidence.quote}"</p>
                  <div className="bg-brand-emerald/10 px-3 py-2 rounded text-[11px] text-brand-emerald font-medium uppercase tracking-wider">
                    Impact: {s.why_it_matters}
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-display font-medium flex items-center gap-2 text-clean-ink">
              <AlertCircle className="text-brand-emerald" size={20} />
              Growth Opportunities
            </h3>
            <div className="grid gap-4">
              {data.improvements.map((imp, i) => (
                <Card key={i} className="border-none bg-gray-50/50">
                  <h4 className="font-semibold mb-2 text-clean-ink">{imp.title}</h4>
                  <p className="text-sm text-gray-500 mb-3">{imp.issue}</p>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase text-gray-400">Better Approach</label>
                      <p className="text-xs text-gray-600 leading-relaxed">{imp.better_answer_example}</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase text-gray-400">Action Task</label>
                      <p className="text-xs text-gray-600 leading-relaxed">{imp.micro_exercise}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
}

function FallbackTextView({ transcript, onSend, onEnd, ...props }: { transcript: TranscriptTurn[], onSend: (t: string) => void, onEnd: () => void | Promise<void>; [key: string]: any }) {
  const [input, setInput] = React.useState("");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col gap-6 py-8">
      <Card className="flex items-center gap-3 bg-red-500/10 border-red-500/30">
        <AlertCircle className="text-red-400" />
        <p className="text-sm text-red-100">Live Voice API disconnected. Switched to Text Fallback mode. Session transcript is preserved.</p>
      </Card>

      <div className="flex-1 grid grid-cols-12 gap-8">
        <Card className="col-span-12 lg:col-span-8 flex flex-col gap-4 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {transcript.map((turn, i) => (
              <div key={i} className={cn("flex flex-col gap-1", turn.speaker === "user" ? "items-end" : "items-start")}>
                 <span className="text-[10px] uppercase font-mono text-gray-400">{turn.speaker}</span>
                 <div className={cn("px-4 py-2 rounded-2xl max-w-[80%]", turn.speaker === "user" ? "bg-brand-emerald text-white rounded-tr-none" : "bg-gray-100 border border-clean-border rounded-tl-none text-clean-ink")}>
                   {turn.text}
                 </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-4 border-t border-white/10">
            <Input 
              placeholder="Type your response..." 
              value={input} 
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) {
                  onSend(input);
                  setInput("");
                }
              }}
            />
            <Button onClick={() => { if(input.trim()) { onSend(input); setInput(""); } }}>Send</Button>
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-4 flex flex-col items-center justify-center gap-6">
          <div className="text-center">
             <h4 className="font-display font-medium text-lg mb-2 text-clean-ink">Continue Session</h4>
             <p className="text-sm text-gray-500">You can still record your answers via text. Debrief will be generated as usual.</p>
          </div>
          <Button variant="danger" onClick={onEnd} className="w-full">End Session & Analyze</Button>
        </Card>
      </div>
    </motion.div>
  );
}

function HistoryView({ sessions, onBack, onSelect, onDelete }: { 
  sessions: InterviewSession[], 
  onBack: () => void, 
  onSelect: (s: InterviewSession) => void,
  onDelete: (id: string) => void
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 max-w-5xl mx-auto w-full py-12">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h2 className="text-3xl font-display font-medium mb-1">Session History</h2>
          <p className="text-gray-500">Relive and reflect on your growth journey.</p>
        </div>
        <Button variant="ghost" onClick={onBack}>Back to Home</Button>
      </div>

      {sessions.length === 0 ? (
        <Card className="p-20 text-center border-dashed border-2 flex flex-col items-center gap-4 bg-transparent shadow-none">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-300">
            <History size={32} />
          </div>
          <div>
            <p className="font-semibold text-clean-ink">No interviews recorded yet.</p>
            <p className="text-sm text-gray-400">Your practice sessions will appear here once completed.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessions.map(session => (
            <Card key={session.id} className="group hover:border-brand-emerald/40 transition-all cursor-pointer p-0 overflow-hidden flex flex-col h-full" onClick={() => onSelect(session)}>
              <div className="p-6 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-emerald-50 text-brand-emerald px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                    {session.config.mode}
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono">
                    {new Date(session.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <h3 className="font-bold text-lg text-clean-ink mb-1">
                  {session.config.jobDescription?.substring(0, 30) || "Standard Interview"}...
                </h3>
                <div className="flex items-center gap-4 text-xs text-gray-500 mt-4">
                  <div className="flex items-center gap-1">
                    <Clock size={12} />
                    {formatDuration(session.duration)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Target size={12} />
                    {session.config.difficulty}
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50/50 border-t border-clean-border flex items-center justify-between">
                <div className="text-sm font-bold text-clean-ink">
                  Score: <span className="text-brand-emerald">{session.debrief?.scores.overall ?? "N/A"}%</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
                  className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ReplayView({ session, onBack }: { session: InterviewSession, onBack: () => void }) {
  const [activeStep, setActiveStep] = React.useState<number | null>(null);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 max-w-[1200px] mx-auto w-full py-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
           <Button variant="ghost" size="sm" onClick={onBack}>
             <ChevronRight className="rotate-180" size={16} />
           </Button>
           <div>
             <h2 className="text-2xl font-display font-medium text-clean-ink">Session Replay</h2>
             <p className="text-xs text-gray-500">{new Date(session.createdAt).toLocaleString()} • {session.config.mode} Mode</p>
           </div>
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" className="text-sm">Summary</Button>
          <Button className="text-sm">Download PDF</Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8 flex-1 overflow-hidden">
        {/* Replay Transcript */}
        <div className="col-span-12 lg:col-span-12 h-[600px]">
          <Card className="h-full flex flex-col overflow-hidden p-0">
             <div className="px-8 py-5 border-b border-clean-border flex items-center justify-between bg-gray-50/50">
               <h3 className="font-bold text-sm uppercase tracking-widest text-gray-400">Interaction Timeline</h3>
               <div className="text-[10px] font-bold text-brand-emerald bg-emerald-50 px-2 py-1 rounded">
                 {session.transcript.length} MOMENTS RECORDED
               </div>
             </div>
             
             <div className="flex-1 overflow-y-auto p-8 space-y-12">
               {session.transcript.map((turn, i) => (
                 <motion.div 
                   key={i} 
                   initial={{ opacity: 0, x: -10 }}
                   animate={{ opacity: 1, x: 0 }}
                   transition={{ delay: i * 0.05 }}
                   className={cn(
                     "flex gap-6 group transition-all p-4 rounded-2xl hover:bg-gray-50",
                     activeStep === i && "bg-emerald-50/50 ring-1 ring-brand-emerald/20"
                   )}
                   onClick={() => setActiveStep(i)}
                 >
                   <div className="w-12 h-12 rounded-full bg-white border border-clean-border shadow-sm flex-shrink-0 flex items-center justify-center font-bold text-clean-ink">
                     {turn.speaker === "user" ? "ME" : "AI"}
                   </div>
                   <div className="flex-1 pt-1">
                     <div className="flex items-center justify-between mb-2">
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-[0.2em]",
                          turn.speaker === "user" ? "text-brand-emerald" : "text-gray-400"
                        )}>
                          {turn.speaker === "user" ? "Candidate Response" : "Interviewer Prompt"}
                        </span>
                        <span className="text-[10px] font-mono text-gray-300">T+{i * 45}s</span>
                     </div>
                     <p className={cn(
                       "text-lg leading-relaxed",
                       turn.speaker === "user" ? "text-clean-ink" : "text-gray-500 font-medium italic"
                     )}>
                       {turn.text}
                     </p>

                     {turn.speaker === "user" && session.debrief && (
                       <div className="mt-6 flex flex-wrap gap-2">
                         <div className="px-3 py-1 bg-white border border-clean-border rounded-full text-[10px] font-bold text-gray-400 hover:text-brand-emerald hover:border-brand-emerald transition-colors cursor-pointer">
                            View Feedback
                         </div>
                       </div>
                     )}
                   </div>
                   <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="rounded-full w-8 h-8 p-0">
                        <Play size={12} className="fill-current" />
                      </Button>
                   </div>
                 </motion.div>
               ))}
             </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
