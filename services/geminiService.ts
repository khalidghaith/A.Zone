import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResponse } from "../types";

export const analyzeProgram = async (programText: string, apiKey: string): Promise<AnalysisResponse> => {
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error("Gemini API Key is missing. Please provide a key in the settings.");
  }

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert architectural programmer. Analyze the following architectural functional program description. 
      Break it down into individual spaces/rooms.
      For each space, estimate a reasonable area in square meters if not explicitly stated (assume standard architectural sizing).
      Assign a logical "Zone" (e.g., Public, Private, Service, Outdoor, Admin, Circulation).
      
      Program Description:
      ${programText}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectName: { type: Type.STRING },
            spaces: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  area: { type: Type.NUMBER, description: "Area in square meters" },
                  zone: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ["name", "area", "zone"],
              },
            },
          },
          required: ["projectName", "spaces"],
        },
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as AnalysisResponse;
    }
    throw new Error("No response text from Gemini");
  } catch (error) {
    console.error("Error analyzing program:", error);
    throw error;
  }
};