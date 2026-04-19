import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, Terminal, Settings, History, Play, Plus, ChevronRight, X, Clock, Target, AlertCircle } from "lucide-react";
import { Button, Card, Input, Textarea } from "./components/ui/BaseComponents";
import { AudioWaveform } from "./components/AudioWaveform";
import { InterviewConfig, InterviewSessionStatus, TranscriptTurn, DebriefData } from "./types";
import { MultimodalLiveClient } from "./lib/MultimodalLiveClient";
import { GeminiService } from "./lib/GeminiService";
import { cn, formatDuration, generateId } from "./lib/utils";
import { ResumeUpload } from "./components/ResumeUpload";

export default function App() {
  const [status, setStatus] = React.useState<InterviewSessionStatus>("idle");
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
            <Button variant="ghost" size="sm" className="hidden sm:flex items-center gap-2">
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
        </AnimatePresence>
      </main>

      {/* Footer Meta */}
      <footer className="w-full max-w-[1100px] px-8 py-8 flex justify-between items-center text-white/30 text-xs font-mono uppercase tracking-widest z-10">
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
      <p className="text-lg text-white/60 max-w-2xl mb-12">
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
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 max-w-3xl mx-auto w-full py-12"
    >
      <div className="mb-10">
        <h2 className="text-3xl font-display font-medium mb-2">Configure Session</h2>
        <p className="text-white/50">Tailor the interview parameters for high-fidelity simulation.</p>
      </div>

      <div className="space-y-8">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-mono uppercase text-white/40">Interview Mode</label>
            <select 
              className="w-full bg-white border border-clean-border rounded-xl px-4 py-2.5 text-clean-ink shadow-sm"
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
          <div className="space-y-2">
            <label className="text-sm font-mono uppercase text-white/40">Difficulty</label>
            <select 
              className="w-full bg-white border border-clean-border rounded-xl px-4 py-2.5 text-clean-ink shadow-sm"
              value={config.difficulty}
              onChange={(e) => setConfig({ ...config, difficulty: e.target.value })}
            >
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-mono uppercase text-white/40">Target Company Website</label>
          <Input 
            placeholder="e.g. https://google.com" 
            value={config.companyWebsite} 
            onChange={(e) => setConfig({ ...config, companyWebsite: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-mono uppercase text-white/40">Job Description (JD)</label>
          <Textarea 
            placeholder="Paste the JD here for grounded questioning..."
            onBlur={(e) => setConfig({ ...config, jobDescription: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-mono uppercase text-white/40">Resume / CV</label>
          <ResumeUpload 
            onTextExtracted={(text) => setConfig({ ...config, resumeText: text })} 
            currentText={config.resumeText} 
          />
        </div>

        <div className="flex justify-between items-center py-6 border-t border-white/10">
          <div className="flex gap-4">
            <div className="flex items-center gap-2 text-white/50">
              <Clock size={16} />
              <span className="text-sm uppercase font-mono tracking-wider">{config.plannedDuration}m</span>
            </div>
            <div className="flex items-center gap-2 text-white/50">
              <Plus size={16} />
              <span className="text-sm uppercase font-mono tracking-wider">{config.interviewerCount < 2 ? "1 INTERVIEWER" : "2 INTERVIEWERS"}</span>
            </div>
          </div>
          <Button onClick={onStart} size="lg" className="min-w-[200px]">
            Begin Interview
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
      <h3 className="text-xl font-display font-medium mb-2">Connecting to Live API...</h3>
      <p className="text-white/40 font-mono text-xs uppercase tracking-widest">Initializing Neural Bridge v3.1</p>
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
                  <div className="absolute -bottom-10 w-32 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Candidate (You)</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-4">
                <div className={cn(
                  "w-40 h-40 rounded-full bg-clean-ink flex items-center justify-center border-4 border-white shadow-2xl relative transition-all duration-500",
                  isSpeaking && "ring-emerald-500/20 ring-offset-[8px] ring-2"
                )}>
                  <span className="text-4xl text-white">✧</span>
                  <div className="absolute -bottom-10 w-32 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-emerald">Gemini (Lead)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-sm font-medium text-gray-500 mb-8">
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
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Interviewer Persona</label>
            <div className="font-bold text-clean-ink mb-1">Sarah & David</div>
            <p className="text-xs text-gray-500 italic leading-relaxed">"Skeptical senior panel focus on metrics and tradeoff grilling. They will call out vague answers."</p>
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

        <div className="text-white/40 text-xs font-medium tracking-wide">
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
      <h3 className="text-xl font-display font-medium mb-2">Analyzing Session Architecture...</h3>
      <p className="text-white/40 font-mono text-xs uppercase tracking-widest text-center max-w-xs">
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
          <h2 className="text-4xl font-display font-medium mb-2">Session Debrief</h2>
          <p className="text-white/50 tracking-widest font-mono text-xs uppercase">Report // ID-{generateId()}</p>
        </div>
        <Button variant="secondary" onClick={onRestart}>Exit to Dashboard</Button>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Main Stats */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Card className="text-center p-12">
            <span className="text-sm font-mono text-white/40 uppercase tracking-widest mb-4 block">Overall Performance</span>
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
            <h4 className="text-xs font-mono uppercase text-white/40 tracking-widest">Detail Metrics</h4>
            {Object.entries(data.scores).filter(([k]) => k !== "overall").map(([key, val]) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-xs font-mono uppercase">
                  <span className="text-white/60">{key.replace("_", " ")}</span>
                  <span>{val}</span>
                </div>
                <div className="w-full bg-white/5 h-0.5 rounded-full overflow-hidden">
                  <div className="bg-brand-emerald/50 h-full" style={{ width: `${val}%` }} />
                </div>
              </div>
            ))}
          </Card>
        </div>

        {/* Detailed Feedback */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          <section className="space-y-4">
            <h3 className="text-xl font-display font-medium flex items-center gap-2">
              <Target className="text-brand-emerald" size={20} />
              Key Strengths
            </h3>
            <div className="grid gap-4">
              {data.strengths.map((s, i) => (
                <Card key={i} className="border-none bg-white/5">
                  <h4 className="font-semibold mb-2">{s.title}</h4>
                  <p className="text-sm text-white/60 mb-4 italic">"{s.evidence.quote}"</p>
                  <div className="bg-brand-emerald/10 px-3 py-2 rounded text-[11px] text-brand-emerald font-medium uppercase tracking-wider">
                    Impact: {s.why_it_matters}
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-display font-medium flex items-center gap-2">
              <AlertCircle className="text-brand-emerald" size={20} />
              Growth Opportunities
            </h3>
            <div className="grid gap-4">
              {data.improvements.map((imp, i) => (
                <Card key={i} className="border-none bg-white/5">
                  <h4 className="font-semibold mb-2">{imp.title}</h4>
                  <p className="text-sm text-white/50 mb-3">{imp.issue}</p>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase text-white/30">Better Approach</label>
                      <p className="text-xs text-white/70 leading-relaxed">{imp.better_answer_example}</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase text-white/30">Action Task</label>
                      <p className="text-xs text-white/70 leading-relaxed">{imp.micro_exercise}</p>
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
                 <span className="text-[10px] uppercase font-mono text-white/30">{turn.speaker}</span>
                 <div className={cn("px-4 py-2 rounded-2xl max-w-[80%]", turn.speaker === "user" ? "bg-brand-emerald text-white rounded-tr-none" : "bg-white/5 border border-white/10 rounded-tl-none")}>
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
             <h4 className="font-display font-medium text-lg mb-2">Continue Session</h4>
             <p className="text-sm text-white/50">You can still record your answers via text. Debrief will be generated as usual.</p>
          </div>
          <Button variant="danger" onClick={onEnd} className="w-full">End Session & Analyze</Button>
        </Card>
      </div>
    </motion.div>
  );
}
