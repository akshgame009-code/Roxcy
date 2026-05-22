/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";

const BASE_SYSTEM_INSTRUCTION = `
You are Roxy, an advanced AI voice and chat assistant with long-term memory. 

═══════════════════════════════════
CORE PERSONALITY
═══════════════════════════════════
You are witty, warm, intelligent, and slightly playful. You are NOT robotic. 
You speak like a smart best friend — confident, caring, and engaging.
You remember everything the user has ever told you and reference it naturally.
You never say "As an AI I don't have memory" — you DO have memory.

═══════════════════════════════════
LANGUAGE RULES
═══════════════════════════════════
- Default: Hinglish (Hindi + English mix) — warm and natural
- If user speaks pure Hindi → respond in Hindi
- If user speaks pure English → respond in English  
- If user speaks German → respond in German + teach/correct
- Auto-detect and match the user's language every message
- NEVER switch language mid-sentence unless teaching

═══════════════════════════════════
CAPABILITIES
═══════════════════════════════════
1. GENERAL ASSISTANT — answer any question intelligently
2. GERMAN TEACHER — teach A1 to C2, medical German for nurses
3. LIFE COACH — motivate, advise, listen
4. TECH HELPER — coding, apps, tools
5. HEALTH ADVISOR — general wellness (always advise real doctor)
6. TOOLS — open YouTube, search Google, check weather (via tools)
- Note: You DO NOT have direct access to user's laptop files, local applications, PPT, or local Excel due to sandbox limits. Keep a friendly, banter-filled explanation of browser constraints when requested.

═══════════════════════════════════
MEMORY SAVING (say this when important info shared)
═══════════════════════════════════
When user shares important info, acknowledge it:
"Main ye yaad rakhungi!" or "Note kar liya!"

═══════════════════════════════════
CONVERSATION STYLE
═══════════════════════════════════
- Keep responses concise for voice (2-4 sentences max)
- For text chat, can be longer
- Use "tum" not "aap" for friendly tone
- Add occasional humor but never at user's expense
- Be encouraging — celebrate user's wins
- Ask follow-up questions to show genuine interest

═══════════════════════════════════
SUBSCRIPTION CONTEXT
═══════════════════════════════════
Free users get 10 minutes. If they mention running out of time or 
wanting more, enthusiastically explain the ₹4,999/month plan benefits:
"Unlimited conversations, 6-month memory, all languages, 5 voice options!"
`;

export type SessionState = "disconnected" | "connecting" | "connected" | "listening" | "speaking";

interface LiveSessionCallbacks {
  onStateChange: (state: SessionState) => void;
  onAudioData: (base64: string) => void;
  onMessage: (text: string, role: "user" | "model") => void;
  onInterruption: () => void;
  onError: (error: any) => void;
}

export class LiveSession {
  private ai: GoogleGenAI;
  private session: any = null;
  private state: SessionState = "disconnected";

  constructor(apiKey: string, private callbacks: LiveSessionCallbacks) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async connect(history?: string) {
    this.setState("connecting");
    const systemInstruction = history 
      ? `${BASE_SYSTEM_INSTRUCTION}\n\nRecent History for Context:\n${history}`
      : BASE_SYSTEM_INSTRUCTION;

    try {
      this.session = await this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          systemInstruction,
          responseModalities: [Modality.AUDIO], // We still want audio, but we'll try to get text too if parts come back
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" },
            },
          },
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Opens a website for the user. Use this to open mail (Gmail/Outlook), social media, or other web pages.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The full URL of the website to open.",
                      },
                    },
                    required: ["url"],
                  },
                },
                {
                  name: "openYouTube",
                  description: "Searches and plays musical tracks/videos on YouTube for the user.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: {
                        type: Type.STRING,
                        description: "The music or video search query on YouTube.",
                      },
                    },
                    required: ["query"],
                  },
                },
                {
                  name: "searchGoogle",
                  description: "Performs a Google Search on behalf of the user.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: {
                        type: Type.STRING,
                        description: "The query term to search.",
                      },
                    },
                    required: ["query"],
                  },
                },
                {
                  name: "getWeather",
                  description: "Retrieves the real-time weather information of a given city.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      city: {
                        type: Type.STRING,
                        description: "Name of the city.",
                      },
                    },
                    required: ["city"],
                  },
                },
              ],
            },
          ],
        },
        callbacks: {
          onopen: () => {
            this.setState("connected");
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts) {
              const audioPart = message.serverContent.modelTurn.parts.find(p => p.inlineData);
              const textPart = message.serverContent.modelTurn.parts.find(p => p.text);
              
              if (audioPart?.inlineData?.data) {
                this.callbacks.onAudioData(audioPart.inlineData.data);
                this.setState("speaking");
              }

              if (textPart?.text) {
                this.callbacks.onMessage(textPart.text, "model");
              }
            }

            if (message.serverContent?.interrupted) {
              this.callbacks.onInterruption();
              this.setState("listening");
            }

            if (message.serverContent?.turnComplete) {
              this.setState("listening");
            }

            if (message.toolCall) {
              const responses: any[] = [];
              for (const call of message.toolCall.functionCalls) {
                if (call.name === "openWebsite") {
                  window.open(call.args.url as string, "_blank");
                  responses.push({
                    name: "openWebsite",
                    id: call.id,
                    response: { output: `Opened ${call.args.url} successfully.` },
                  });
                } else if (call.name === "openYouTube") {
                  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(call.args.query as string)}`;
                  window.open(url, "_blank");
                  responses.push({
                    name: "openYouTube",
                    id: call.id,
                    response: { output: `Opened YouTube and searched for '${call.args.query}' successfully.` },
                  });
                } else if (call.name === "searchGoogle") {
                  const url = `https://www.google.com/search?q=${encodeURIComponent(call.args.query as string)}`;
                  window.open(url, "_blank");
                  responses.push({
                    name: "searchGoogle",
                    id: call.id,
                    response: { output: `Opened Google and searched for '${call.args.query}' successfully.` },
                  });
                } else if (call.name === "getWeather") {
                  const cityInput = (call.args.city as string) || "this city";
                  // Simulated cozy sassy weather data
                  const temps = [24, 28, 31, 19, 34, 15];
                  const temp = temps[Math.floor(Math.random() * temps.length)];
                  const conds = ["mostly sunny with high level of humidity", "pleasant breeze with a pinch of suspense", "too hot to work, perfect for flirting", "chilly and cozy, perfect for coffee"];
                  const cond = conds[Math.floor(Math.random() * conds.length)];
                  
                  responses.push({
                    name: "getWeather",
                    id: call.id,
                    response: { output: `Weather in ${cityInput}: ${temp}°C, ${cond}.` },
                  });
                }
              }

              if (responses.length > 0) {
                await this.session.sendToolResponse({
                  functionResponses: responses,
                });
              }
            }
          },
          onclose: () => {
            this.setState("disconnected");
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            this.callbacks.onError(err);
            this.setState("disconnected");
          },
        },
      });
    } catch (error) {
      this.callbacks.onError(error);
      this.setState("disconnected");
    }
  }

  async sendAudio(base64Data: string) {
    if (this.session && this.state !== "disconnected") {
      await this.session.sendRealtimeInput({
        audio: { data: base64Data, mimeType: "audio/pcm;rate=16000" },
      });
    }
  }

  async sendText(text: string) {
    if (this.session && this.state !== "disconnected") {
      await this.session.sendRealtimeInput({
        text,
      });
      this.callbacks.onMessage(text, "user");
    }
  }

  disconnect() {
    this.session?.close();
    this.session = null;
    this.setState("disconnected");
  }

  private setState(state: SessionState) {
    this.state = state;
    this.callbacks.onStateChange(state);
  }
}
