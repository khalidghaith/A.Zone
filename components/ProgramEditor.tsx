import React, { useState, useEffect, useMemo } from 'react';
import { Room, ZONE_COLORS } from '../types';
import { Plus, Trash2, Wand2, ClipboardPaste, Save, Table as TableIcon, FileSpreadsheet, Download, PieChart as PieChartIcon } from 'lucide-react';
import { analyzeProgram } from '../services/geminiService';

interface ProgramEditorProps {
  initialRooms: Room[];
  onSave: (rooms: Room[], projectName: string) => void;
  onProgramChange?: (rooms: Room[]) => void;
  initialProjectName?: string;
}

// Helper: Map standard zones to Hex colors for the Pie Chart (since Tailwind classes don't work in gradients)
const getZoneColorHex = (zone: string): string => {
    if (zone.includes('Public')) return '#fb923c'; // orange-400
    if (zone.includes('Private')) return '#60a5fa'; // blue-400
    if (zone.includes('Service')) return '#9ca3af'; // gray-400
    if (zone.includes('Circulation')) return '#facc15'; // yellow-400
    if (zone.includes('Outdoor')) return '#4ade80'; // green-400
    if (zone.includes('Admin')) return '#c084fc'; // purple-400
    
    // Hash string to color for custom zones
    let hash = 0;
    for (let i = 0; i < zone.length; i++) {
        hash = zone.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
};

// Helper component for smooth inputs
const InputCell = ({ 
    value, 
    onChange, 
    type = 'text',
    className = '',
    placeholder = '',
    list
}: {
    value: string | number;
    onChange: (val: any) => void;
    type?: 'text' | 'number';
    className?: string;
    placeholder?: string;
    list?: string;
}) => {
    const [localValue, setLocalValue] = useState(value?.toString() || '');
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (!isFocused) {
            setLocalValue(value?.toString() || '');
        }
    }, [value, isFocused]);

    const handleCommit = () => {
        if (type === 'number') {
            const num = parseFloat(localValue);
            onChange(isNaN(num) ? 0 : num);
        } else {
            onChange(localValue);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
        }
    };

    return (
        <input
            type={type === 'number' ? 'text' : type} 
            list={list}
            value={localValue}
            placeholder={placeholder}
            onFocus={() => setIsFocused(true)}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => {
                setIsFocused(false);
                handleCommit();
            }}
            onKeyDown={handleKeyDown}
            className={`text-slate-900 placeholder:text-slate-400 ${className}`} 
        />
    );
};

export const ProgramEditor: React.FC<ProgramEditorProps> = ({ initialRooms, onSave, onProgramChange, initialProjectName = "New Project" }) => {
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [projectName, setProjectName] = useState(initialProjectName);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteInput, setPasteInput] = useState('');
  
  // Analytics State
  const [circulationPct, setCirculationPct] = useState(0.15); // 15% default

  // Ensure at least one row
  useEffect(() => {
    if (rooms.length === 0) {
      handleAddRow();
    }
  }, []);

  // Real-time update trigger
  const updateParent = (updatedRooms: Room[]) => {
      setRooms(updatedRooms);
      if (onProgramChange) {
          onProgramChange(updatedRooms);
      }
  };

  // --- Statistics Calculation ---
  const stats = useMemo(() => {
      const netArea = rooms.reduce((sum, r) => sum + (Number(r.area) || 0), 0);
      const circulationArea = netArea * circulationPct;
      const grossArea = netArea + circulationArea;

      const zoneBreakdown: Record<string, number> = {};
      rooms.forEach(r => {
          const z = r.zone || 'Unassigned';
          zoneBreakdown[z] = (zoneBreakdown[z] || 0) + (Number(r.area) || 0);
      });

      // Prepare Pie Chart Data
      let currentAngle = 0;
      const chartSegments = Object.entries(zoneBreakdown).map(([zone, area]) => {
          const percentage = (area / netArea) * 100;
          const color = getZoneColorHex(zone);
          const start = currentAngle;
          currentAngle += percentage;
          return { zone, area, percentage, color, start, end: currentAngle };
      }).sort((a,b) => b.area - a.area);

      return { netArea, circulationArea, grossArea, zoneBreakdown, chartSegments };
  }, [rooms, circulationPct]);

  // --- Actions ---

  const handleAddRow = () => {
    const newRoom: Room = {
      id: `room-${Date.now()}-${Math.random()}`,
      name: '',
      area: 0,
      zone: 'Default',
      isPlaced: false,
      floor: 0,
      x: 0, y: 0, width: 100, height: 100, color: 'gray'
    };
    const updated = [...rooms, newRoom];
    updateParent(updated);
  };

  const handleDeleteRow = (id: string) => {
    const updated = rooms.filter(r => r.id !== id);
    updateParent(updated);
  };

  const handleChange = (id: string, field: keyof Room, value: any) => {
    const updated = rooms.map(r => r.id === id ? { ...r, [field]: value } : r);
    updateParent(updated);
  };

  const handlePasteFromExcel = () => {
    const rows = pasteInput.trim().split('\n');
    const newRooms: Room[] = rows.map((row, idx) => {
      const cols = row.split('\t');
      return {
        id: `room-import-${Date.now()}-${idx}`,
        name: cols[0]?.trim() || 'Untitled',
        area: parseFloat(cols[1]) || 10,
        zone: cols[2]?.trim() || 'Default',
        isPlaced: false,
        floor: 0,
        x: 0, y: 0, width: 100, height: 100, color: 'gray'
      };
    });
    const updated = [...rooms.filter(r => r.name !== ''), ...newRooms];
    updateParent(updated);
    setPasteMode(false);
    setPasteInput('');
  };

  const handleAiGenerate = async () => {
    setIsAiLoading(true);
    try {
      const data = await analyzeProgram(aiPrompt);
      const generatedRooms: Room[] = data.spaces.map((space, index) => ({
        id: `room-ai-${Date.now()}-${index}`,
        name: space.name,
        area: space.area,
        zone: space.zone,
        isPlaced: false,
        floor: 0,
        x: 0, y: 0, width: 100, height: 100, color: 'gray',
        description: space.description
      }));
      if (data.projectName) setProjectName(data.projectName);
      updateParent(generatedRooms);
      setShowAiModal(false);
    } catch (e) {
      console.error(e);
      alert("AI Generation failed. Please try again.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleExportCSV = () => {
      const headers = "Room Name,Area (sqm),Zone,Description\n";
      const rows = rooms.map(r => `"${r.name}",${r.area},"${r.zone}","${r.description || ''}"`).join("\n");
      const csvContent = "data:text/csv;charset=utf-8," + headers + rows;
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${projectName.replace(/\s+/g, '_')}_program.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // Build Conic Gradient string
  const pieGradient = stats.chartSegments.length > 0 
      ? `conic-gradient(${stats.chartSegments.map(s => `${s.color} 0 ${s.end}%`).join(', ')})`
      : 'conic-gradient(#e2e8f0 0 100%)';

  const defaultZones = Object.keys(ZONE_COLORS);

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-xl overflow-hidden text-slate-900">
      
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
        <div>
           <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
             <TableIcon className="text-primary" size={20} />
             Program Editor
           </h2>
           <p className="text-xs text-slate-500">Define spaces, custom zones, or import data.</p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={handleExportCSV}
                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-md text-xs font-medium hover:bg-slate-50 flex items-center gap-1"
                title="Export to Excel/CSV"
            >
                <Download size={14} /> Export CSV
            </button>
            <div className="w-px h-6 bg-slate-300 mx-1"></div>
            <button 
                onClick={() => setShowAiModal(true)}
                className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-md text-xs font-medium hover:bg-indigo-200 flex items-center gap-1"
            >
                <Wand2 size={14} /> AI Magic Fill
            </button>
            <button 
                onClick={() => setPasteMode(!pasteMode)}
                className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-md text-xs font-medium hover:bg-emerald-200 flex items-center gap-1"
            >
                <FileSpreadsheet size={14} /> Import Data
            </button>
        </div>
      </div>

      {/* Project Name */}
      <div className="p-4 border-b border-slate-100 shrink-0">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Project Name</label>
          <input 
            type="text" 
            value={projectName} 
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full text-lg font-semibold border border-slate-200 rounded px-2 bg-white focus:border-primary focus:outline-none py-1 text-slate-900 placeholder:text-slate-300"
            placeholder="Enter Project Name..."
          />
      </div>

      {/* Paste & AI Modals */}
      {pasteMode && (
          <div className="p-4 bg-emerald-50 border-b border-emerald-100 shrink-0">
              <label className="block text-xs font-bold text-emerald-700 mb-2">Paste data from Excel / Google Sheets</label>
              <textarea 
                className="w-full h-32 p-2 border border-emerald-200 rounded text-xs font-mono mb-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none text-slate-900 bg-white"
                placeholder={`Living Room\t40\tPublic\nKitchen\t20\tService`}
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                  <button onClick={() => setPasteMode(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800">Cancel</button>
                  <button onClick={handlePasteFromExcel} className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700">Process Data</button>
              </div>
          </div>
      )}

      {showAiModal && (
          <div className="absolute inset-0 bg-white z-50 p-6 flex flex-col">
              <h3 className="text-lg font-bold text-slate-800 mb-1">AI Program Generator</h3>
              <textarea 
                 className="flex-1 border border-slate-200 rounded-lg p-4 text-sm resize-none focus:ring-2 focus:ring-primary focus:outline-none mb-4 text-slate-900 bg-white"
                 placeholder="e.g. A 3-bedroom modern house..."
                 value={aiPrompt}
                 onChange={(e) => setAiPrompt(e.target.value)}
              />
              <div className="flex justify-end gap-2 shrink-0">
                  <button onClick={() => setShowAiModal(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded">Cancel</button>
                  <button onClick={handleAiGenerate} disabled={isAiLoading || !aiPrompt.trim()} className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-600 flex items-center gap-2">
                      {isAiLoading ? <Wand2 className="animate-spin" size={16} /> : <Wand2 size={16} />} Generate
                  </button>
              </div>
          </div>
      )}

      {/* Main Content: Split View */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT: Table */}
        <div className="flex-1 overflow-auto p-4 flex flex-col">
            <table className="w-full text-sm border-collapse mb-4">
                <thead className="sticky top-0 bg-white z-10 shadow-sm">
                    <tr className="border-b-2 border-slate-200">
                        <th className="text-left py-2 px-2 text-slate-500 font-semibold w-[40%]">Room Name</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-semibold w-[20%]">Area</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-semibold w-[30%]">Zone</th>
                        <th className="w-[10%]"></th>
                    </tr>
                </thead>
                <tbody>
                    {rooms.map((room) => (
                        <tr key={room.id} className="border-b border-slate-100 group hover:bg-slate-50">
                            <td className="p-1">
                                <InputCell
                                    value={room.name}
                                    onChange={(val) => handleChange(room.id, 'name', val)}
                                    placeholder="Room Name"
                                    className="w-full px-2 py-1.5 rounded border border-slate-200 focus:border-primary focus:outline-none bg-white shadow-sm"
                                />
                            </td>
                            <td className="p-1">
                                <div className="relative">
                                    <InputCell
                                        type="number"
                                        value={room.area}
                                        onChange={(val) => handleChange(room.id, 'area', val)}
                                        className="w-full px-2 py-1.5 rounded border border-slate-200 focus:border-primary focus:outline-none bg-white shadow-sm"
                                    />
                                    <span className="absolute right-8 top-1.5 text-slate-400 text-xs pointer-events-none">sqm</span>
                                </div>
                            </td>
                            <td className="p-1">
                                <InputCell
                                    list="zone-options"
                                    value={room.zone}
                                    onChange={(val) => handleChange(room.id, 'zone', val)}
                                    placeholder="Select or type..."
                                    className="w-full px-2 py-1.5 rounded border border-slate-200 focus:border-primary focus:outline-none bg-white shadow-sm cursor-pointer"
                                />
                            </td>
                            <td className="p-1 text-center">
                                <button 
                                    onClick={() => handleDeleteRow(room.id)}
                                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            
            <datalist id="zone-options">
                {defaultZones.map(z => <option key={z} value={z} />)}
            </datalist>

            <button 
                onClick={handleAddRow}
                className="self-start flex items-center gap-2 text-sm text-primary font-medium hover:text-blue-700 px-2 py-1 border border-dashed border-primary/30 rounded-md hover:bg-blue-50"
            >
                <Plus size={16} /> Add Room
            </button>
        </div>

        {/* RIGHT: Infographics Sidebar */}
        <div className="w-80 bg-slate-50 border-l border-slate-200 flex flex-col overflow-y-auto">
            <div className="p-5 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-4">
                    <PieChartIcon size={16} /> Area Analysis
                </h3>

                {/* Metrics */}
                <div className="space-y-3 mb-6">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500">Net Area</span>
                        <span className="font-mono font-medium">{Math.round(stats.netArea)} m²</span>
                    </div>
                    
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500 flex items-center gap-1">
                                Circulation 
                                <span className="text-[10px] bg-slate-200 px-1 rounded text-slate-600">
                                    {Math.round(circulationPct * 100)}%
                                </span>
                            </span>
                            <span className="font-mono text-slate-400">{Math.round(stats.circulationArea)} m²</span>
                        </div>
                        <input 
                            type="range" 
                            min="0" max="0.5" step="0.05"
                            value={circulationPct}
                            onChange={(e) => setCirculationPct(parseFloat(e.target.value))}
                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                    </div>

                    <div className="h-px bg-slate-200 my-2"></div>

                    <div className="flex justify-between items-center text-sm font-bold text-slate-800">
                        <span>Gross Area</span>
                        <span className="font-mono text-lg">{Math.round(stats.grossArea)} m²</span>
                    </div>
                </div>

                {/* Pie Chart */}
                {stats.netArea > 0 && (
                    <div className="flex flex-col items-center">
                        <div 
                            className="w-40 h-40 rounded-full border-4 border-white shadow-sm mb-6 relative"
                            style={{ background: pieGradient }}
                        >
                            {/* Inner Circle for Donut effect */}
                            <div className="absolute inset-0 m-auto w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center flex-col">
                                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Zones</span>
                                <span className="text-xl font-bold text-slate-700">{stats.chartSegments.length}</span>
                            </div>
                        </div>

                        {/* Legend */}
                        <div className="w-full space-y-2">
                            {stats.chartSegments.map((seg) => (
                                <div key={seg.zone} className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <div 
                                            className="w-3 h-3 rounded-full shadow-sm" 
                                            style={{ backgroundColor: seg.color }}
                                        />
                                        <span className="text-slate-600 font-medium truncate max-w-[120px]" title={seg.zone}>
                                            {seg.zone}
                                        </span>
                                    </div>
                                    <div className="flex gap-3 text-right">
                                        <span className="text-slate-400 font-mono w-10">{Math.round(seg.percentage)}%</span>
                                        <span className="text-slate-700 font-mono w-12">{Math.round(seg.area)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {stats.netArea === 0 && (
                    <div className="text-center py-8 text-slate-400 text-xs italic">
                        Add rooms and areas to see analysis.
                    </div>
                )}
            </div>
        </div>

      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
          <button 
            onClick={() => onSave(rooms, projectName)}
            className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-medium shadow-md transition-transform active:scale-95"
          >
              <Save size={18} /> Close & Save
          </button>
      </div>
    </div>
  );
};