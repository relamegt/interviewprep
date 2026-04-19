import { TranscriptTurn } from "../types";

export class MultimodalLiveClient {
  private socket: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private stream: MediaStream | null = null;
  private audioQueue: Float32Array[] = [];
  private isProcessingAudio = false;
  
  private onMessage: (msg: any) => void;
  private onStateChange: (state: string) => void;
  private onTranscript: (turn: TranscriptTurn) => void;
  private onError: (err: any) => void;
  private onVolumeChange: (volume: number) => void;

  constructor(handlers: {
    onMessage: (msg: any) => void;
    onStateChange: (state: string) => void;
    onTranscript: (turn: TranscriptTurn) => void;
    onError: (err: any) => void;
    onVolumeChange: (volume: number) => void;
  }) {
    this.onMessage = handlers.onMessage;
    this.onStateChange = handlers.onStateChange;
    this.onTranscript = handlers.onTranscript;
    this.onError = handlers.onError;
    this.onVolumeChange = handlers.onVolumeChange;
  }

  async connect(apiKey: string, config: any) {
    try {
      this.onStateChange("connecting");
      
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BiDiGenerateContent?key=${apiKey}`;
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        this.onStateChange("connected");
        this.sendSetup(config);
      };

      this.socket.onmessage = (event) => {
        if (typeof event.data === "string") {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } else {
          // Binary audio usually comes as blob or arraybuffer
          this.handleAudioData(event.data);
        }
      };

      this.socket.onerror = (error) => {
        this.onError(error);
        this.onStateChange("error");
      };

      this.socket.onclose = () => {
        this.onStateChange("idle");
      };

    } catch (error) {
      this.onError(error);
      this.onStateChange("error");
    }
  }

  private sendSetup(config: any) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        setup: {
          model: "models/gemini-2.0-flash-exp", // Using latest live capable model if available or fallback
          generation_config: {
            response_modalities: ["AUDIO"],
            speech_config: {
              voice_config: { prebuilt_voice_config: { voice_name: "Puck" } }
            }
          },
          system_instruction: config.systemInstruction
        }
      }));
    }
  }

  private handleServerMessage(data: any) {
    if (data.server_content?.model_turn?.parts) {
      for (const part of data.server_content.model_turn.parts) {
        if (part.inline_data?.mime_type === "audio/pcm;rate=24000") {
          const pcmData = this.base64ToFloat32(part.inline_data.data);
          this.queueAudio(pcmData);
        }
        if (part.text) {
          // Add to transcript
          this.onTranscript({
            speaker: "interviewer",
            text: part.text,
            timestamp_start: new Date().toISOString(),
            timestamp_end: new Date().toISOString()
          });
        }
      }
    }
    this.onMessage(data);
  }

  private handleAudioData(data: Blob) {
    // Some implementations send raw binary
  }

  private base64ToFloat32(base64: string): Float32Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
    return float32;
  }

  private queueAudio(pcm: Float32Array) {
    this.audioQueue.push(pcm);
    if (!this.isProcessingAudio) this.playNextInQueue();
  }

  private async playNextInQueue() {
    if (this.audioQueue.length === 0) {
      this.isProcessingAudio = false;
      return;
    }
    this.isProcessingAudio = true;
    const pcm = this.audioQueue.shift()!;
    
    if (!this.audioContext) this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    const buffer = this.audioContext.createBuffer(1, pcm.length, 24000);
    buffer.getChannelData(0).set(pcm);
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.onended = () => this.playNextInQueue();
    source.start();
  }

  async startMic() {
    if (!this.audioContext) this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);

    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate volume for UI
      let sum = 0;
      for(let i=0; i<inputData.length; i++) sum += inputData[i]*inputData[i];
      this.onVolumeChange(Math.sqrt(sum / inputData.length));

      const pcm16 = this.floatTo16BitPCM(inputData);
      this.sendAudio(pcm16);
    };
  }

  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }

  private sendAudio(pcm: Int16Array) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm.buffer)));
      this.socket.send(JSON.stringify({
        realtime_input: {
          media_chunks: [
            {
              mime_type: "audio/pcm;rate=16000",
              data: base64
            }
          ]
        }
      }));
    }
  }

  disconnect() {
    this.socket?.close();
    this.stream?.getTracks().forEach(t => t.stop());
    this.processor?.disconnect();
    this.audioContext?.close();
    this.audioQueue = [];
    this.isProcessingAudio = false;
  }
}
