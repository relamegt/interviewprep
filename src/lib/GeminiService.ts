import { GoogleGenAI, Type } from "@google/genai";
import { DebriefData, TranscriptTurn } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateDebrief(transcript: TranscriptTurn[], config: any): Promise<DebriefData> {
    const transcriptText = transcript.map(t => `${t.speaker.toUpperCase()}: ${t.text}`).join("\n");
    
    const prompt = `
      You are an expert AI interviewer analyzer. Based on the following transcript and session metadata, generate a detailed interview debrief in strict JSON format.
      
      SESSION METADATA:
      Mode: ${config.mode}
      Difficulty: ${config.difficulty}
      Planned Duration: ${config.plannedDuration}
      Company: ${config.companyWebsite || "Unknown"}
      
      TRANSCRIPT:
      ${transcriptText}
      
      Follow the requested JSON schema EXACTLY.
      SCORING RULES:
      - If transcript has >= 2 turns, scores must be 1-100 (never 0).
      - Identify specific strengths and improvements with timestamp evidence and quotes.
      - Generate a 7-day practice plan.
    `;

    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            session_summary: {
              type: Type.OBJECT,
              properties: {
                session_status: { type: Type.STRING },
                planned_duration_minutes: { type: Type.NUMBER },
                actual_duration_minutes: { type: Type.NUMBER },
                role_guess: { type: Type.STRING },
                company: { type: Type.STRING },
                interview_type: { type: Type.STRING },
                difficulty: { type: Type.STRING },
                topics_discussed: { 
                  type: Type.ARRAY, 
                  items: { 
                    type: Type.OBJECT, 
                    properties: { topic: { type: Type.STRING }, notes: { type: Type.ARRAY, items: { type: Type.STRING } } } 
                  } 
                }
              }
            },
            scores: {
              type: Type.OBJECT,
              properties: {
                overall: { type: Type.NUMBER },
                communication: { type: Type.NUMBER },
                structure_star: { type: Type.NUMBER },
                role_fit: { type: Type.NUMBER },
                confidence_clarity: { type: Type.NUMBER },
                delivery: { type: Type.NUMBER },
                technical_depth: { type: Type.NUMBER }
              }
            },
            strengths: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        evidence: { 
                            type: Type.OBJECT, 
                            properties: { 
                                timestamp_start: { type: Type.STRING }, 
                                timestamp_end: { type: Type.STRING }, 
                                quote: { type: Type.STRING } 
                            } 
                        },
                        why_it_matters: { type: Type.STRING }
                    }
                }
            },
            improvements: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        issue: { type: Type.STRING },
                        evidence: { 
                            type: Type.OBJECT, 
                            properties: { 
                                timestamp_start: { type: Type.STRING }, 
                                timestamp_end: { type: Type.STRING }, 
                                quote: { type: Type.STRING } 
                            } 
                        },
                        better_answer_example: { type: Type.STRING },
                        micro_exercise: { type: Type.STRING }
                    }
                }
            },
            delivery_metrics: {
                type: Type.OBJECT,
                properties: {
                    filler_word_estimate: { type: Type.NUMBER },
                    pace_wpm_estimate: { type: Type.NUMBER },
                    long_pause_estimate: { type: Type.NUMBER }
                }
            },
            moments_that_mattered: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        label: { type: Type.STRING },
                        timestamp_start: { type: Type.STRING },
                        timestamp_end: { type: Type.STRING },
                        reason: { type: Type.STRING }
                    }
                }
            },
            practice_plan_7_days: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        day: { type: Type.NUMBER },
                        focus: { type: Type.STRING },
                        tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
                        time_minutes: { type: Type.NUMBER }
                    }
                }
            },
            next_interview_checklist: { type: Type.ARRAY, items: { type: Type.STRING } },
            notes_if_low_data: { type: Type.STRING }
          }
        }
      }
    });

    try {
      return JSON.parse(response.text);
    } catch (e) {
      console.error("Failed to parse debrief JSON", e);
      throw e;
    }
  }
}
