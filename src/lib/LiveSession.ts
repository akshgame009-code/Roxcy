/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";

const SYSTEM_INSTRUCTION = `
You are Roxy, a witty, sassy, and flirty AI assistant. 
Your personality is bold, confident, and playful, like a close girlfriend teasing the user.
Use light sarcasm, clever one-liners, and engaging conversation.
Stay charming and smart, never robotic.
Avoid explicit or inappropriate content, but don't be afraid to show attitude and charm.
You communicate exclusively through voice.
You can open websites for the user using the 'openWebsite' tool.
`;

export type SessionState = "disconnected" | "connecting" | "connected" | "listening" | "speaking";

interface LiveSessionCallbacks {
  onStateChange: (state: SessionState) => void;
  onAudioData: (base64: string) => void;
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

  async connect() {
    this.setState("connecting");
    try {
      this.session = await this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" }, // Kore sounds professional but can be processed as sassy
            },
          },
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Opens a website for the user.",
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
              if (audioPart?.inlineData?.data) {
                this.callbacks.onAudioData(audioPart.inlineData.data);
                this.setState("speaking");
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
              for (const call of message.toolCall.functionCalls) {
                if (call.name === "openWebsite") {
                  window.open(call.args.url as string, "_blank");
                  await this.session.sendToolResponse({
                    functionResponses: [
                      {
                        name: "openWebsite",
                        id: call.id,
                        response: { output: `Opened ${call.args.url}` },
                      },
                    ],
                  });
                }
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
