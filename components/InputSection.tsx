import React, { useState } from 'react';
import { Loader2, Wand2, FileText } from 'lucide-react';
import { analyzeProgram } from '../services/geminiService';
import { Room } from '../types';

interface InputSectionProps {
  onDataParsed: (projectName: string, rooms: Room[]) => void;
}

const TEMPLATES = {
  "3-Bedroom House": `Project: Modern Family House
- Living Room: 40 sqm, Public Zone, Connection to Dining
- Dining Room: 20 sqm, Public Zone, Connection to Kitchen
- Kitchen: 18 sqm, Service Zone
- Master Bedroom: 30 sqm, Private Zone, En-suite
- Master Bathroom: 10 sqm, Private Zone
- Bedroom 2: 15 sqm, Private Zone
- Bedroom 3: 15 sqm, Private Zone
- Shared Bathroom: 8 sqm, Private Zone
- Garage: 35 sqm, Service Zone
- Outdoor Patio: 50 sqm, Outdoor Zone`,
  "Primary School": `Project: Little Learners Academy
- Classrooms (x6): 60 sqm each, Private Zone
- Administration: 100 sqm, Admin Zone
- Library: 150 sqm, Public Zone
- Cafeteria: 200 sqm, Public Zone
- Kitchen: 50 sqm, Service Zone
- Toilets: 40 sqm, Service Zone
- Playground: 500 sqm, Outdoor Zone`,
  "Small Clinic": `Project: City Health Clinic
- Reception/Waiting: 40 sqm, Public Zone
- Exam Room 1: 15 sqm, Private Zone
- Exam Room 2: 15 sqm, Private Zone
- Doctor Office: 12 sqm, Admin Zone
- Procedure Room: 25 sqm, Service Zone
- Pharmacy: 20 sqm, Public Zone
- Staff Breakroom: 20 sqm, Admin Zone`
};

export const InputSection: React.FC<InputSectionProps> = ({ onDataParsed }) => {
  const [input, setInput] = useState(TEMPLATES["3-Bedroom House"]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await analyzeProgram(input);
      
      const rooms: Room[] = data.spaces.map((space, index) => ({
        id: `room-${Date.now()}-${index}`,
        name: space.name,
        area: space.area,
        zone: space.zone,
        description: space.description,
        isPlaced: false,
        floor: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        color: 'gray',
      }));

      onDataParsed(data.projectName || "New Project", rooms);
    } catch (err) {
      setError("Failed to analyze program. Please check your API key and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-6 max-w-2xl mx-auto justify-center">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight mb-2">ArchiZone</h1>
        <p className="text-slate-500 text-lg">AI-Assisted Architectural Programming & Zoning</p>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div className="mb-4">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Quick Start Templates</label>
            <div className="flex gap-2 overflow-x-auto pb-2">
                {Object.entries(TEMPLATES).map(([name, text]) => (
                    <button
                        key={name}
                        onClick={() => setInput(text)}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg transition-colors whitespace-nowrap"
                    >
                        <FileText size={14} />
                        {name}
                    </button>
                ))}
            </div>
        </div>

        <label className="block text-sm font-medium text-slate-700 mb-2">
          Or paste your functional program:
        </label>
        <textarea
          className="w-full h-64 p-4 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary focus:border-primary transition-all font-mono text-sm resize-none"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Living room 40sqm, Kitchen 20sqm..."
        />
        
        {error && (
          <div className="mt-3 p-3 bg-red-50 text-red-600 text-sm rounded-md border border-red-100">
            {error}
          </div>
        )}

        <button
          onClick={handleAnalyze}
          disabled={isLoading || !input.trim()}
          className="mt-4 w-full flex items-center justify-center py-3 px-4 bg-primary hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="animate-spin mr-2 h-5 w-5" />
              Analyzing Space Requirements...
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-5 w-5" />
              Generate Zoning Diagram
            </>
          )}
        </button>
      </div>
      
      <p className="mt-6 text-center text-xs text-slate-400">
        Powered by Google Gemini 2.0 Flash
      </p>
    </div>
  );
};