import { GoogleGenAI, Type } from "@google/genai";
import { CommandGenerationResult, LinuxDistro, CommandStep, CommandStatus, CommandFix } from "../types";

// NOTE: In a production app, the key would be securely managed.
// For this frontend-only demo, we assume process.env.API_KEY is available.
// If not available (e.g. running in browser without env injection), we fallback to a placeholder or user input.
// However, since we are in a sandbox, we might need to handle the case where it's missing gracefully to prevent app crash on load.
const apiKey = process.env.API_KEY || 'dummy_key_for_dev';
const ai = new GoogleGenAI({ apiKey });

export const generateLinuxCommand = async (
  naturalLanguage: string,
  distro: string
): Promise<CommandGenerationResult> => {
  try {
    const prompt = `
      You are an expert Linux System Administrator.
      Break down the following natural language request into a sequence of executable Linux commands for the operating system: ${distro}.

      Request: "${naturalLanguage}"

      Requirements:
      1. Return a LIST of commands.
      2. Each command must be a single executable string.
      3. Determine if each command is potentially dangerous (e.g., rm -rf, system modifications).
      4. Provide a brief explanation for each step.
      5. The sequence should be logical (e.g., update repo -> install -> start service).

      Return a JSON object with a "steps" array.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  command: { type: Type.STRING, description: "The actual Linux shell command" },
                  explanation: { type: Type.STRING, description: "Brief explanation of the command" },
                  dangerous: { type: Type.BOOLEAN, description: "True if command deletes data or modifies system core" },
                },
                required: ["command", "explanation", "dangerous"],
              },
            },
          },
          required: ["steps"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const parsed = JSON.parse(text);

    // Map to CommandStep with ID and Status
    const steps: CommandStep[] = parsed.steps.map((s: any) => ({
      ...s,
      id: crypto.randomUUID(),
      status: CommandStatus.Pending
    }));

    return { steps };
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw new Error("Failed to translate command.");
  }
};

export const generateCommandFix = async (
  command: string,
  errorOutput: string,
  distro: LinuxDistro
): Promise<CommandFix> => {
  try {
    const prompt = `
      You are an expert Linux System Administrator.
      A command executed with a non-zero exit code. Please suggest a fix or next steps.

      OS: ${distro}
      Executed Command: "${command}"
      Output (stderr/stdout): "${errorOutput || '(No output returned)'}"

      Requirements:
      1. Analyze the output (if any) to determine if this is a critical ERROR (e.g. syntax error, missing permission, missing package) or just a SUGGESTION/INFO (e.g. command returned empty but failed, or returned warning text that isn't a hard stop).
      2. If the output is empty, treat it as a 'suggestion' and suggest what to do next or how to verify the result.
      3. Provide a corrected command or a next logical step.
      4. Set 'classification' to 'error' if it's a hard failure, or 'suggestion' if it's benign or informational.

      Provide a corrected command that addresses the error.
      If the error implies a missing dependency or prerequisite, provide that command instead (or chained).
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
              command: { type: Type.STRING, description: "The corrected Linux shell command" },
              explanation: { type: Type.STRING, description: "Why this fix works" },
              dangerous: { type: Type.BOOLEAN, description: "True if dangerous" },
              classification: { type: Type.STRING, enum: ["error", "suggestion"], description: "Classify as 'error' or 'suggestion'" }
            },
            required: ["command", "explanation", "dangerous", "classification"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const parsed = JSON.parse(text);

    return {
      ...parsed,
      id: crypto.randomUUID(),
      status: CommandStatus.Pending
    };
  } catch (error) {
    console.error("Gemini Fix Generation Error:", error);
    throw new Error("Failed to generate fix.");
  }
};
