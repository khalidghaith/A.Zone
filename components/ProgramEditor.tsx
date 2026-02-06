import React, { useState } from 'react';
import { Room, ZoneColor } from '../types';
import {
    X, Search, Trash2, LayoutGrid,
    ChevronDown, Plus, Wand2
} from 'lucide-react';
import { ApiKeyModal } from './ApiKeyModal';
import { analyzeProgram } from '../services/geminiService';

interface ProgramEditorProps {
    rooms: Room[];
    updateRoom: (id: string, updates: Partial<Room>) => void;
    deleteRoom: (id: string) => void;
    addRoom: (room: Partial<Room>) => void;
    apiKey: string;
    onSaveApiKey: (key: string) => void;
    setRooms: (rooms: Room[]) => void;
    zoneColors: Record<string, ZoneColor>;
    onAddZone: (name: string) => void;
    onInteractionStart?: () => void;
}

export const ProgramEditor: React.FC<ProgramEditorProps> = ({
    rooms, updateRoom, deleteRoom, addRoom, apiKey, onSaveApiKey, setRooms, zoneColors, onAddZone, onInteractionStart
}) => {
    const [showAiModal, setShowAiModal] = useState(false);
    const [aiPrompt, setAiPrompt] = useState("");
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [showApiKeySettings, setShowApiKeySettings] = useState(false);

    const totalsByZone = rooms.reduce((acc, r) => {
        acc[r.zone] = (acc[r.zone] || 0) + r.area;
        return acc;
    }, {} as Record<string, number>);

    const totalArea = rooms.reduce((acc, r) => acc + r.area, 0);

    const handleAiGenerate = async () => {
        if (!apiKey) {
            setShowApiKeySettings(true);
            return;
        }
        setIsAiLoading(true);
        try {
            const data = await analyzeProgram(aiPrompt, apiKey);
            const newRooms: Room[] = (data.spaces as any[]).map((s, i) => ({
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
            setRooms([...rooms, ...newRooms]);
            setShowAiModal(false);
        } catch (err: any) {
            alert("AI analysis failed: " + (err.message || "Unknown error"));
        } finally {
            setIsAiLoading(false);
        }
    };

    return (
        <div className="h-full w-full bg-slate-50 dark:bg-dark-bg flex font-sans text-slate-900 dark:text-gray-100 transition-colors duration-300">
            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                <div className="h-full flex flex-col w-full py-6 px-6">
                    {/* Action bar */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="relative flex-1 max-w-xs">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input className="w-full pl-9 pr-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-dark-border rounded-lg text-xs font-medium focus:ring-2 focus:ring-orange-500 focus:outline-none shadow-sm dark:text-gray-200" placeholder="Filter spaces..." />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowAiModal(true)} className="h-8 px-3 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/30 rounded-lg text-[10px] font-black hover:bg-orange-100 dark:hover:bg-orange-900/30 flex items-center gap-2 uppercase tracking-widest transition-colors">
                                <Wand2 size={16} /> AI Suggest
                            </button>
                            <button onClick={() => addRoom({ name: 'New Space', area: 15, zone: 'Default' })} className="h-8 px-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-dark-border text-slate-700 dark:text-gray-300 rounded-lg text-[10px] font-black hover:border-orange-500 hover:text-orange-600 flex items-center gap-2 uppercase tracking-widest shadow-sm transition-all">
                                <Plus size={16} /> Add Space
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border overflow-hidden flex flex-col transition-colors">
                        <div className="overflow-y-auto flex-1">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-white/5 sticky top-0 z-10 border-b border-slate-200 dark:border-dark-border">
                                    <tr>
                                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-16">#</th>
                                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Space Name</th>
                                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32">Area (m²)</th>
                                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-48">Zone Category</th>
                                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-20 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {rooms.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-20 text-center text-slate-400">
                                                <div className="flex flex-col items-center gap-2">
                                                    <LayoutGrid size={40} className="mb-2 opacity-20 text-orange-500" />
                                                    <p className="text-sm font-medium">No spaces defined yet.</p>
                                                    <button onClick={() => addRoom({ name: 'Living Room', area: 25, zone: 'Public' })} className="text-primary text-xs font-bold hover:underline">Add your first space</button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    {rooms.map((room, idx) => (
                                        <tr key={room.id} className="group hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors">
                                            <td className="px-8 py-4 text-xs font-mono text-slate-400">{idx + 1}</td>
                                            <td className="px-8 py-4">
                                                <input
                                                    className="w-full bg-transparent font-bold text-slate-700 dark:text-gray-200 text-sm focus:outline-none focus:text-orange-600 transition-colors border-b border-transparent focus:border-orange-500/20"
                                                    value={room.name}
                                                    onChange={(e) => updateRoom(room.id, { name: e.target.value })}
                                                    onFocus={onInteractionStart}
                                                    placeholder="Space Name"
                                                />
                                            </td>
                                            <td className="px-8 py-4">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        className="w-20 bg-slate-100/50 dark:bg-white/5 rounded-lg px-3 py-2 text-sm font-black text-slate-600 dark:text-gray-300 focus:outline-none focus:bg-white dark:focus:bg-white/10 focus:ring-1 focus:ring-orange-500 transition-all text-right"
                                                        value={room.area}
                                                        onChange={(e) => updateRoom(room.id, { area: Number(e.target.value) })}
                                                        onFocus={onInteractionStart}
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-8 py-4">
                                                <div className="relative">
                                                    <select
                                                        className={`w-full appearance-none pl-3 pr-8 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider focus:outline-none cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-white/20 focus:border-orange-500 transition-all ${zoneColors[room.zone]?.bg} ${zoneColors[room.zone]?.text}`}
                                                        value={room.zone}
                                                        onChange={(e) => updateRoom(room.id, { zone: e.target.value })}
                                                        onFocus={onInteractionStart}
                                                    >
                                                        {Object.keys(zoneColors).map(z => <option key={z} value={z}>{z}</option>)}
                                                    </select>
                                                    <ChevronDown size={12} className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${zoneColors[room.zone]?.text}`} />
                                                </div>
                                            </td>
                                            <td className="px-8 py-4 text-center">
                                                <button onClick={() => deleteRoom(room.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="bg-slate-50 dark:bg-white/5 border-t border-slate-200 dark:border-dark-border p-4 flex justify-between items-center text-xs font-bold text-slate-500 dark:text-gray-400">
                            <span className="font-mono">{rooms.length} Spaces</span>
                            <span>Total Area: {totalArea} m²</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Sidebar - Analytics */}
            <aside className="w-80 bg-white dark:bg-dark-surface border-l border-slate-200 dark:border-dark-border flex flex-col z-20 shadow-xl overflow-y-auto shrink-0">
                <div className="p-6 space-y-8">
                    <div>
                        <h2 className="text-lg font-black text-slate-800 dark:text-gray-100 mb-1">Analytics</h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Project Statistics</p>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-dark-border">
                            <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Gross (x1.3)</span>
                            <span className="text-base font-black text-slate-700 dark:text-gray-200">{((totalArea as number) * 1.3).toFixed(0)} m²</span>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-dark-border">
                            <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Count</span>
                            <span className="text-base font-black text-orange-600">{rooms.length}</span>
                        </div>
                    </div>

                    {/* Net Area Circle */}
                    <div className="flex flex-col items-center justify-center py-4">
                        <div className="w-32 h-32 rounded-full border-[8px] border-slate-50 dark:border-white/5 flex flex-col items-center justify-center shadow-inner bg-white dark:bg-dark-surface relative">
                            <div className="absolute inset-0 rounded-full border border-slate-200 dark:border-white/10" />
                            <span className="text-2xl font-black text-slate-800 dark:text-gray-100 tracking-tight">{(totalArea as number).toFixed(0)}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Net m²</span>
                        </div>
                    </div>

                    {/* Zone Distribution */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Zone Distribution</h3>
                            <button 
                                onClick={() => {
                                    const name = prompt("Enter new zone name:");
                                    if (name) onAddZone(name);
                                }}
                                className="px-3 py-2 rounded-lg text-[10px] font-black border border-dashed border-slate-300 dark:border-white/20 text-slate-400 hover:text-orange-600 hover:border-orange-400 transition-all flex items-center justify-center gap-1"
                            >
                                <Plus size={12} /> New
                            </button>
                        </div>
                        <div className="space-y-4">
                            {Object.entries(totalsByZone).map(([zone, area]) => (
                                <div key={zone}>
                                    <div className="flex justify-between text-sm font-bold text-slate-700 dark:text-gray-300 mb-1.5">
                                        <span>{zone}</span>
                                        <span>{(area as number).toFixed(0)} m²</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${zoneColors[zone]?.bg.replace('bg-', 'bg-') || 'bg-slate-400'} ${zoneColors[zone]?.border?.replace('border-', 'bg-')} transition-all duration-1000`}
                                            style={{ width: `${((area as number) / (totalArea as number)) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </aside>

            {/* AI Modal */}
            {showAiModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-8">
                    <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-purple-50/50">
                            <h2 className="text-purple-900 font-black text-lg flex items-center gap-2">
                                <Wand2 size={20} className="text-purple-600" /> AI Program Generator
                            </h2>
                            <button onClick={() => setShowAiModal(false)} className="w-8 h-8 rounded-full hover:bg-black/5 flex items-center justify-center text-slate-400 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-8">
                            <p className="text-slate-500 text-sm mb-4 font-medium">Describe your building project (e.g., "A modern 3-bedroom house with a large open kitchen and a home office"). our AI will generate a space program for you.</p>
                            <textarea
                                className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none text-sm font-medium text-slate-700"
                                placeholder="Type your description here..."
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                            />
                            <div className="mt-6 flex justify-end gap-3">
                                <button onClick={() => setShowAiModal(false)} className="px-5 py-2.5 text-slate-500 font-bold text-xs uppercase tracking-wider hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
                                <button
                                    onClick={handleAiGenerate}
                                    disabled={isAiLoading || !aiPrompt.trim()}
                                    className="px-6 py-2.5 bg-purple-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-200 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isAiLoading ? "Generating..." : "Generate Program"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showApiKeySettings && (
                <ApiKeyModal
                    currentKey={apiKey}
                    onSave={onSaveApiKey}
                    onClose={() => setShowApiKeySettings(false)}
                />
            )}
        </div>
    );
};
