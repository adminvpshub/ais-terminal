import { GoogleGenAI, Type } from "@google/genai";
import { CommandGenerationResult, LinuxDistro } from "../types";

// NOTE: In a production app, the key would be securely managed.
// For this frontend-only demo, we assume process.env.API_KEY is available.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateLinuxCommand = async (
  naturalLanguage: string,
  distro: LinuxDistro
): Promise<CommandGenerationResult> => {
  try {
    const prompt = `
      You are an expert Linux System Administrator.
      Translate the following natural language request into a single, valid, executable Linux command for the operating system: ${distro}.
      
      Request: "${naturalLanguage}"
      
      If the request requires multiple commands, chain them with && or ;.
      Determine if the command is potentially dangerous (e.g., rm -rf, system modifications).
      Provide a brief explanation of what the command does.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            command: { type: Type.STRING, description: "The actual Linux shell command" },
            explanation: { type: Type.STRING, description: "Brief explanation of the command" },
            dangerous: { type: Type.BOOLEAN, description: "True if command deletes data or modifies system core" },
          },
          required: ["command", "explanation", "dangerous"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as CommandGenerationResult;
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw new Error("Failed to translate command.");
  }
};