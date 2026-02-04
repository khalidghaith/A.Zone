import React, { useState } from 'react';
import { Loader2, Wand2, FileText } from 'lucide-react';
import { analyzeProgram } from '../services/geminiService';
import { Room } from '../types';

interface InputSectionProps {
  onDataParsed: (projectName: string, rooms: Room[]) => void;
  apiKey: string;
  onRequestKey: () => void;
}

const TEMPLATES = {
  "3-Bedroom House": `Project: Family Villa\n- Living: 45 sqm, Public\n- Dining: 20 sqm, Public\n- Kitchen: 15 sqm, Service\n- Master Bed: 25 sqm, Private\n- Bed 2: 15 sqm, Private\n- Garage: 30 sqm, Service`,
  "Small Clinic": `Project: Health Hub\n- Reception: 30 sqm, Public\n- Exam 1: 15 sqm, Private\n- Exam 2: 15 sqm, Private\n- Staff: 12 sqm, Admin`,
};

export const InputSection: React.FC<InputSectionProps> = ({ onDataParsed, apiKey, onRequestKey }) => {
  const [input, setInput] = useState(TEMPLATES["3-Bedroom House"]);
  const [isLoading, setIsLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!apiKey) {
      onRequestKey();
      return;
    }
    setIsLoading(true);
    try {
      const data = await analyzeProgram(input, apiKey);
      const rooms: Room[] = (data.spaces as any[]).map((s, i) => ({
        id: `room-${Date.now()}-${i}`,
        name: s.name,
        area: s.area,
        zone: s.zone,
        description: s.description,
        isPlaced: false,
        floor: 0,
        x: 0, y: 0,
        width: Math.sqrt(s.area) * 20,
        height: Math.sqrt(s.area) * 20,
      }));
      onDataParsed(data.projectName || "New Project", rooms);
    } catch (err: any) {
      alert("AI analysis failed: " + (err.message || "Unknown error") + ". Check your API key in settings.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 max-w-xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-5xl font-black text-slate-900 tracking-tight">A.Zone</h1>
        <p className="text-slate-500 font-medium mt-2">AI-Driven Architectural Space Planner</p>
      </div>

      <div className="w-full bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
        <textarea
          className="w-full h-48 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:outline-none font-mono text-sm resize-none"
          placeholder="Describe your architectural program..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          onClick={handleAnalyze}
          disabled={isLoading || !input.trim()}
          className="w-full mt-4 py-3 bg-primary text-white rounded-xl font-bold hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? <Loader2 className="animate-spin" /> : <Wand2 size={18} />}
          Generate Project
        </button>
      </div>

      <div className="flex gap-2">
        {Object.keys(TEMPLATES).map(name => (
          <button key={name} onClick={() => setInput(TEMPLATES[name as keyof typeof TEMPLATES])} className="px-3 py-1.5 bg-slate-100 text-[10px] font-bold text-slate-500 rounded-full hover:bg-slate-200 uppercase tracking-wider">
            {name}
          </button>
        ))}
      </div>
    </div>
  );
};