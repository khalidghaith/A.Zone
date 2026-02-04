import React, { useState } from 'react';
import { Room, ZONE_COLORS } from '../types';
import {
    X, Search, Download, Upload, Trash2, LayoutGrid,
    BarChart3, ChevronDown, Plus, MoreVertical, GripVertical, ArrowRight, Wand2
} from 'lucide-react';
import { ApiKeyModal } from './ApiKeyModal';
import { analyzeProgram } from '../services/geminiService';

interface ProgramEditorProps {
    rooms: Room[];
    updateRoom: (id: string, updates: Partial<Room>) => void;
    deleteRoom: (id: string) => void;
    addRoom: (room: Partial<Room>) => void;
    onStartCanvas: () => void;
    apiKey: string;
    onSaveApiKey: (key: string) => void;
    setRooms: (rooms: Room[]) => void;
}

export const ProgramEditor: React.FC<ProgramEditorProps> = ({
    rooms, updateRoom, deleteRoom, addRoom, onStartCanvas, apiKey, onSaveApiKey, setRooms
}) => {
    const [activeTab, setActiveTab] = useState<'table' | 'analytics'>('table');
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
        <div className="h-screen w-screen bg-slate-50 flex flex-col font-sans text-slate-900">
            {/* Header */}
            <div className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 shadow-sm relative z-10">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                        <LayoutGrid size={20} />
                    </div>
                    <div>
                        <h1 className="font-black text-2xl tracking-tighter text-slate-900">Program Editor</h1>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Define your architectural requirements</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <button onClick={() => setActiveTab('table')} className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'table' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Table View</button>
                        <button onClick={() => setActiveTab('analytics')} className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'analytics' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Analytics</button>
                    </div>
                    <div className="w-px h-8 bg-slate-200 mx-2" />
                    <button onClick={onStartCanvas} className="px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary transition-all shadow-xl shadow-slate-200 hover:shadow-blue-200 flex items-center gap-2 group">
                        Start Design <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden relative">
                {activeTab === 'table' ? (
                    <div className="h-full flex flex-col max-w-6xl mx-auto py-8 px-8">
                        {/* Action bar */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="relative flex-1 max-w-md">
                                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none shadow-sm" placeholder="Filter spaces..." />
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setShowAiModal(true)} className="px-4 py-3 bg-purple-50 text-purple-600 border border-purple-100 rounded-xl text-xs font-bold hover:bg-purple-100 flex items-center gap-2 uppercase tracking-wider transition-colors">
                                    <Wand2 size={16} /> AI Suggest
                                </button>
                                <button onClick={() => addRoom({ name: 'New Space', area: 15, zone: 'Default' })} className="px-5 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:border-primary hover:text-primary flex items-center gap-2 uppercase tracking-wider shadow-sm transition-all">
                                    <Plus size={16} /> Add Manual Space
                                </button>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                            <div className="overflow-y-auto flex-1">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                                        <tr>
                                            <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-16">#</th>
                                            <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Space Name</th>
                                            <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32">Area (m²)</th>
                                            <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-48">Zone Category</th>
                                            <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-20 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {rooms.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="py-20 text-center text-slate-400">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <LayoutGrid size={40} className="mb-2 opacity-20" />
                                                        <p className="text-sm font-medium">No spaces defined yet.</p>
                                                        <button onClick={() => addRoom({ name: 'Living Room', area: 25, zone: 'Public' })} className="text-primary text-xs font-bold hover:underline">Add your first space</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        {rooms.map((room, idx) => (
                                            <tr key={room.id} className="group hover:bg-slate-50/80 transition-colors">
                                                <td className="px-8 py-4 text-xs font-mono text-slate-400">{idx + 1}</td>
                                                <td className="px-8 py-4">
                                                    <input
                                                        className="w-full bg-transparent font-bold text-slate-700 text-sm focus:outline-none focus:text-primary transition-colors border-b border-transparent focus:border-primary/20"
                                                        value={room.name}
                                                        onChange={(e) => updateRoom(room.id, { name: e.target.value })}
                                                        placeholder="Space Name"
                                                    />
                                                </td>
                                                <td className="px-8 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            className="w-20 bg-slate-100/50 rounded-lg px-3 py-2 text-sm font-black text-slate-600 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary transition-all text-right"
                                                            value={room.area}
                                                            onChange={(e) => updateRoom(room.id, { area: Number(e.target.value) })}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-8 py-4">
                                                    <div className="relative">
                                                        <select
                                                            className={`w-full appearance-none pl-3 pr-8 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider focus:outline-none cursor-pointer border border-transparent hover:border-slate-200 focus:border-primary transition-all ${ZONE_COLORS[room.zone]?.bg} ${ZONE_COLORS[room.zone]?.text}`}
                                                            value={room.zone}
                                                            onChange={(e) => updateRoom(room.id, { zone: e.target.value })}
                                                        >
                                                            {Object.keys(ZONE_COLORS).map(z => <option key={z} value={z}>{z}</option>)}
                                                        </select>
                                                        <ChevronDown size={12} className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${ZONE_COLORS[room.zone]?.text}`} />
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
                            <div className="bg-slate-50 border-t border-slate-200 p-4 flex justify-between items-center text-xs font-bold text-slate-500">
                                <span>{rooms.length} Spaces</span>
                                <span>Total Area: {totalArea} m²</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full max-w-5xl mx-auto py-8 px-8 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-8">
                            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Zone Distribution</h3>
                                <div className="space-y-6">
                                    {Object.entries(totalsByZone).map(([zone, area]) => (
                                        <div key={zone}>
                                            <div className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                                                <span>{zone}</span>
                                                <span>{(area as number).toFixed(1)} m² <span className="text-slate-400 ml-1 font-normal">({(((area as number) / (totalArea as number)) * 100).toFixed(0)}%)</span></span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${ZONE_COLORS[zone]?.bg.replace('bg-', 'bg-') || 'bg-slate-400'} ${ZONE_COLORS[zone]?.border?.replace('border-', 'bg-')} transition-all duration-1000`}
                                                    style={{ width: `${((area as number) / (totalArea as number)) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-8">
                                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center">
                                    <div className="w-40 h-40 rounded-full border-[12px] border-slate-50 flex flex-col items-center justify-center mb-6 shadow-inner bg-white relative">
                                        <div className="absolute inset-0 rounded-full border border-slate-200" />
                                        <span className="text-4xl font-black text-slate-800 tracking-tight">{(totalArea as number).toFixed(0)}</span>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Net m²</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 w-full">
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Gross Estimate (x1.3)</span>
                                            <span className="text-lg font-black text-slate-700">{((totalArea as number) * 1.3).toFixed(0)} m²</span>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Space Count</span>
                                            <span className="text-lg font-black text-primary">{rooms.length}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

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
