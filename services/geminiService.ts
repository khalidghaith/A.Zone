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
      
      CRITICAL: Do not group circulation as a single, bulk area. Instead, identify and list individual corridors, hallways, and lobbies needed to logically connect all other spaces.
      
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

export const generateSpatialLayout = async (spaces: { id: string, name: string, area: number, zone: string }[], fixedSpaces: { id: string, name: string, x: number, y: number, width: number, height: number, zone: string, floor: number }[], floors: { id: number, label: string }[], apiKey: string): Promise<{ id: string, name: string, x: number, y: number, width: number, height: number, floor: number }[]> => {
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error("Gemini API Key is missing. Please provide a key in the settings.");
  }

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert architectural programmer. 
      Input: 
      1. "spaces": Array of spaces to arrange (id, name, area, zone).
      2. "fixedSpaces": Array of existing spaces that are locked in position (id, name, x, y, width, height, zone, floor).
      3. "floors": Array of available floors (id, label).
      
      Architectural Logic: The AI must act as a Senior Architect. It should:
      1. Group "spaces" by Zone (e.g., keeping "Private" bedroom clusters away from "Public" living areas).
      2. Calculate a Proximity Matrix: Determine which rooms must be adjacent (e.g., Kitchen next to Dining).
      3. **Circulation as Connectors**: Do not clump all spaces directly adjacent to each other. Position spaces identified as Circulation (corridors, hallways, lobbies) between or extending alongside other spaces so they act as functional connectors. Leave logical realistic gaps for corridors between different zones.
      4. Assign Coordinates & Floors: Generate x, y positions and assign a floor for each space in "spaces".
      5. **Respect Fixed Spaces**: Do NOT move "fixedSpaces". Place "spaces" around or adjacent to "fixedSpaces" where logically appropriate. Ensure no overlaps with "fixedSpaces" on the same floor.
      6. **Vertical Connections**: Consider vertical adjacency (e.g. stacking plumbing, connecting circulation). Distribute spaces across floors logically (e.g. Public/Service on lower floors, Private on upper floors, unless specified otherwise).
      
      Geometric Output: Use responseSchema to enforce a JSON output where each space in "spaces" includes { id: string, x: number, y: number, width: number, height: number, floor: number }.
      Note: Calculate width and height based on the space's area while maintaining a reasonable aspect ratio (between 1:1 and 1:2).
      Canvas Integration: The coordinates should be scaled for a canvas where 1 unit = 1 meter.
      
      Spaces to Arrange:
      ${JSON.stringify(spaces)}

      Fixed/Locked Spaces (Do not move):
      ${JSON.stringify(fixedSpaces)}

      Available Floors:
      ${JSON.stringify(floors)}
      
      Task:
      Given these architectural spaces, organize the "spaces" into a functional floor plan layout across the available floors. Determine their positions based on standard residential/commercial flow. Output the absolute coordinates and floor ID for each space in "spaces" to ensure a tight, logical cluster without overlaps with each other or fixed spaces on the same floor.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              width: { type: Type.NUMBER },
              height: { type: Type.NUMBER },
              floor: { type: Type.NUMBER },
            },
            required: ["id", "name", "x", "y", "width", "height", "floor"],
          },
        },
      },
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    throw new Error("No response text from Gemini");
  } catch (error) {
    console.error("Error generating spatial layout:", error);
    throw error;
  }
};