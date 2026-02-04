import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Room, FLOORS, Connection, DIAGRAM_STYLES, DiagramStyle, Point, ZONE_COLORS } from './types';
import { ProgramEditor } from './components/ProgramEditor';
import { Bubble } from './components/Bubble';
import { ApiKeyModal } from './components/ApiKeyModal';
import { ZoneOverlay } from './components/ZoneOverlay'; // Newly added
import { applyMagneticPhysics } from './utils/physics'; // Newly added
import { downloadDXF } from './utils/dxf';
import {
    Plus, Layers, Map as MapIcon, Box, Download, Settings2,
    TableProperties, LayoutPanelLeft, MousePointer2, Link,
    LandPlot, Undo2, ChevronRight, ChevronLeft, SlidersHorizontal, Palette, Trash2, Key,
    Zap, Magnet, Grid, Ruler
} from 'lucide-react';

// Shim process for libs that might expect it in Vite
if (typeof window !== 'undefined' && !window.process) {
    (window as any).process = { env: {} };
}

// Configuration
const PIXELS_PER_METER = 20;

type ViewMode = 'EDITOR' | 'CANVAS';

export default function App() {
    // App State
    const [viewMode, setViewMode] = useState<ViewMode>('EDITOR');
    const [projectName, setProjectName] = useState("New Project");
    const [rooms, setRooms] = useState<Room[]>([]);
    const [connections, setConnections] = useState<Connection[]>([]);

    // API Key State
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('A_ZONE_GEMINI_KEY') || import.meta.env.VITE_GEMINI_API_KEY || "");
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);

    // View State
    const [currentFloor, setCurrentFloor] = useState(0);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState<Point>({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const [is3DMode, setIs3DMode] = useState(false);
    const [currentStyle, setCurrentStyle] = useState<DiagramStyle>(DIAGRAM_STYLES[0]);
    const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());

    // Tools State
    const [isMagnetMode, setIsMagnetMode] = useState(false);
    const [showGrid, setShowGrid] = useState(true);

    // UI State
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
    const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
    const [snapGuides, setSnapGuides] = useState<{ x?: number, y?: number } | null>(null);

    // --- Utilities ---
    const getSnappedPosition = useCallback((room: Room, excludeId: string) => {
        if (!excludeId) {
            setSnapGuides(null);
            return { x: room.x, y: room.y };
        }
        const threshold = 10;
        let snappedX = room.x;
        let snappedY = room.y;
        let activeGuideX: number | undefined;
        let activeGuideY: number | undefined;

        const otherRooms = rooms.filter(r => r.isPlaced && r.id !== excludeId && r.floor === currentFloor);

        for (const other of otherRooms) {
            // Horizontal Snapping
            const snapsH = [
                { val: other.x, type: 'left-left' },
                { val: other.x + other.width, type: 'left-right' },
                { val: other.x - room.width, type: 'right-left' },
                { val: other.x + other.width - room.width, type: 'right-right' }
            ];

            for (const s of snapsH) {
                if (Math.abs(room.x - s.val) < threshold) {
                    snappedX = s.val;
                    activeGuideX = s.val + (s.type.startsWith('right') ? room.width : 0);
                    break;
                }
            }

            // Vertical Snapping
            const snapsV = [
                { val: other.y, type: 'top-top' },
                { val: other.y + other.height, type: 'top-bottom' },
                { val: other.y - room.height, type: 'bottom-top' },
                { val: other.y + other.height - room.height, type: 'bottom-bottom' }
            ];

            for (const s of snapsV) {
                if (Math.abs(room.y - s.val) < threshold) {
                    snappedY = s.val;
                    activeGuideY = s.val + (s.type.startsWith('bottom') ? room.height : 0);
                    break;
                }
            }
        }

        setSnapGuides(activeGuideX || activeGuideY ? { x: activeGuideX, y: activeGuideY } : null);
        return { x: snappedX, y: snappedY };
    }, [rooms, currentFloor]);

    // Canvas Refs
    const mainRef = useRef<HTMLElement>(null);
    const isPanning = useRef(false);
    const lastMousePos = useRef<Point>({ x: 0, y: 0 });

    // Update offset on resize to keep center
    useEffect(() => {
        const handleResize = () => {
            setOffset({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Physics Loop
    useEffect(() => {
        if (!isMagnetMode) return;

        const interval = setInterval(() => {
            setRooms(currentRooms => {
                const updated = applyMagneticPhysics(currentRooms);
                return updated === currentRooms ? currentRooms : updated;
            });
        }, 50); // 20fps for physics to save CPU

        return () => clearInterval(interval);
    }, [isMagnetMode]);


    // --- Core Handlers ---
    // --- Core Handlers ---
    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault(); // Prevent browser zoom if possible, though often handled by preventing default on document level
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;
        const newScale = Math.min(Math.max(0.1, scale + delta), 5); // Using additive scale for smoother feel, or multiplicative?

        // Multiplicative zoom often feels better: scale *= (1 + sensitivity)
        // Let's stick to current addictive logic but fix the origin.

        // Calculate mouse position relative to window
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // Calculate world position before zoom
        // World = (Screen - Offset) / Scale
        // Screen = World * Scale + Offset

        // We want the point under mouse to stay at same screen position:
        // mouseX = WorldX * newScale + newOffsetX
        // newOffsetX = mouseX - WorldX * newScale
        // newOffsetX = mouseX - ((mouseX - offset.x) / scale) * newScale

        const newOffsetX = mouseX - ((mouseX - offset.x) / scale) * newScale;
        const newOffsetY = mouseY - ((mouseY - offset.y) / scale) * newScale;

        setScale(newScale);
        setOffset({ x: newOffsetX, y: newOffsetY });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        // Allow pan on Middle Button OR Left Click on Background
        if (e.button === 1 || (e.button === 0 && (e.shiftKey || e.target === e.currentTarget))) {
            isPanning.current = true;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            // If dragging background, we might also want to clear selection?
            // Let's clear selection if we started a pan on background and it wasn't valid selection target
            if (e.target === e.currentTarget) {
                setSelectedRoomIds(new Set());
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning.current) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseUp = () => {
        isPanning.current = false;
    };

    // --- Drag & Drop Handlers ---
    const handleDragStart = (e: React.DragEvent, room: Room) => {
        e.dataTransfer.setData('roomId', room.id);
        e.dataTransfer.effectAllowed = 'move';
        // Optional: Create a custom drag image if needed
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const roomId = e.dataTransfer.getData('roomId');
        if (!roomId) return;

        const room = rooms.find(r => r.id === roomId);
        if (!room) return;

        if (mainRef.current) {
            const rect = mainRef.current.getBoundingClientRect();
            // Calculate mouse position relative to the main container
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Convert to World Coordinates
            // WorldX = (ScreenX - OffsetX) / Scale
            // Center the room on the cursor by subtracting width/2, height/2
            const worldX = (mouseX - offset.x) / scale - room.width / 2;
            const worldY = (mouseY - offset.y) / scale - room.height / 2;

            updateRoom(roomId, { isPlaced: true, floor: currentFloor, x: worldX, y: worldY });
            setSelectedRoomIds(new Set([roomId]));
        }
    };

    // --- Room Handlers ---
    const updateRoom = useCallback((id: string, updates: Partial<Room>) => {
        setRooms(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    }, []);

    const deleteRoom = useCallback((id: string) => {
        setRooms(prev => prev.filter(r => r.id !== id));
        setSelectedRoomIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, []);

    const addRoom = useCallback((roomData: Partial<Room>) => {
        const area = roomData.area || 15;
        const side = Math.sqrt(area) * PIXELS_PER_METER;
        const newRoom: Room = {
            id: `room-${Date.now()}`,
            name: roomData.name || 'New Space',
            area,
            zone: roomData.zone || 'Default',
            isPlaced: false,
            floor: 0,
            x: 0, y: 0,
            width: side,
            height: side,
            ...roomData
        };
        setRooms(prev => [...prev, newRoom]);
    }, []);

    const handleSaveApiKey = (key: string) => {
        setApiKey(key);
        localStorage.setItem('A_ZONE_GEMINI_KEY', key);
    };

    const toggleLink = (roomId: string) => {
        if (connectionSourceId === roomId) {
            setConnectionSourceId(null);
        } else if (connectionSourceId) {
            const existing = connections.find(c =>
                (c.fromId === connectionSourceId && c.toId === roomId) ||
                (c.fromId === roomId && c.toId === connectionSourceId)
            );
            if (!existing) {
                setConnections(prev => [...prev, {
                    id: `conn-${Date.now()}`,
                    fromId: connectionSourceId,
                    toId: roomId
                }]);
            }
            setConnectionSourceId(null);
        } else {
            setConnectionSourceId(roomId);
        }
    };

    // --- Zone Handlers ---
    const [selectedZone, setSelectedZone] = useState<string | null>(null);

    const handleZoneDrag = useCallback((zone: string, dx: number, dy: number) => {
        setRooms(prev => prev.map(r => {
            if (r.zone === zone && r.floor === currentFloor && r.isPlaced) {
                return { ...r, x: r.x + dx, y: r.y + dy };
            }
            return r;
        }));
    }, [currentFloor]);

    const renameZone = useCallback((oldZone: string, newZone: string) => {
        if (!newZone.trim()) return;
        setRooms(prev => prev.map(r => r.zone === oldZone ? { ...r, zone: newZone } : r));
        setSelectedZone(newZone);
    }, []);

    // --- Render Helpers ---
    const selectedRoom = rooms.find(r => selectedRoomIds.has(r.id));
    const unplacedRooms = rooms.filter(r => !r.isPlaced);

    // Zone Stats
    const selectedZoneRooms = useMemo(() => {
        if (!selectedZone) return [];
        return rooms.filter(r => r.zone === selectedZone);
    }, [rooms, selectedZone]);

    const zoneArea = selectedZoneRooms.reduce((acc, r) => acc + r.area, 0);

    if (viewMode === 'EDITOR') {
        return (
            <ProgramEditor
                rooms={rooms}
                updateRoom={updateRoom}
                deleteRoom={deleteRoom}
                addRoom={addRoom}
                onStartCanvas={() => setViewMode('CANVAS')}
                apiKey={apiKey}
                onSaveApiKey={handleSaveApiKey}
                setRooms={setRooms}
            />
        );
    }

    return (
        <div className="h-screen w-screen flex flex-col bg-slate-50 overflow-hidden font-sans selection:bg-primary/20">
            {/* Premium Header */}
            <header className="h-16 bg-white/70 backdrop-blur-xl border-b border-slate-200/50 flex items-center justify-between px-6 shrink-0 z-40 shadow-[0_1px_10px_rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 group cursor-pointer">
                        <div className="w-10 h-10 bg-gradient-to-br from-primary to-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-200 group-hover:scale-105 transition-transform duration-300">
                            <MapIcon size={20} />
                        </div>
                        <div>
                            <h1 className="font-black text-slate-900 tracking-tight leading-none mb-0.5">{projectName}</h1>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Architectural Project</p>
                        </div>
                    </div>
                    <div className="h-8 w-px bg-slate-200/60 mx-1" />
                    <button
                        onClick={() => setViewMode('EDITOR')}
                        className="flex items-center gap-2.5 px-4 py-2 bg-slate-100/50 border border-slate-200/50 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-white hover:shadow-md hover:border-primary transition-all duration-300"
                    >
                        <TableProperties size={14} className="text-primary" /> Program Editor
                    </button>

                    <div className="h-8 w-px bg-slate-200/60 mx-1" />

                    {/* Scale Bar (Header Version - Optional, but easier to see) */}
                    <div className="flex items-center gap-2 text-slate-400">
                        <div className="h-1 w-16 bg-slate-300 rounded-full relative">
                            <div className="absolute -top-3 left-0 text-[8px] font-bold">0m</div>
                            <div className="absolute -top-3 right-0 text-[8px] font-bold">{(16 / scale / PIXELS_PER_METER * 4).toFixed(1)}m</div>{/* Just a visual indicative, better one on canvas */}
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest">Scale</span>
                    </div>

                </div>

                <div className="flex items-center bg-slate-100/80 p-1.5 rounded-2xl gap-1 border border-slate-200 relative shadow-inner">
                    {FLOORS.map(f => (
                        <button
                            key={f.id}
                            onClick={() => setCurrentFloor(f.id)}
                            className={`px-5 py-2 text-[10px] font-black uppercase tracking-tighter rounded-xl transition-all duration-300 ${currentFloor === f.id ? 'bg-white text-primary shadow-lg shadow-black/5' : 'text-slate-400 hover:text-slate-700'}`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowApiKeyModal(true)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${apiKey ? 'text-slate-400 hover:text-primary hover:bg-blue-50' : 'text-orange-500 bg-orange-50 animate-pulse border border-orange-200 shadow-lg shadow-orange-100'}`}
                        title="Gemini API Key Settings"
                    >
                        <Key size={18} />
                    </button>

                    <div className="w-px h-8 bg-slate-200/60 mx-1" />

                    <div className="flex items-center bg-slate-100/50 rounded-xl p-1 border border-slate-200/50">
                        {DIAGRAM_STYLES.map(s => (
                            <button
                                key={s.id}
                                onClick={() => setCurrentStyle(s)}
                                title={s.name}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 ${currentStyle.id === s.id ? 'bg-white text-primary shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}
                            >
                                {s.id === 'standard' ? <LayoutPanelLeft size={16} /> : s.id === 'minimal' ? <MousePointer2 size={16} /> : s.id === 'sketchy' ? <Palette size={16} /> : <SlidersHorizontal size={16} />}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setShowGrid(!showGrid)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${!showGrid ? 'text-slate-400 hover:bg-slate-50' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}
                        title="Toggle Grid"
                    >
                        <Grid size={18} />
                    </button>

                    <button
                        onClick={() => setIsMagnetMode(!isMagnetMode)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${!isMagnetMode ? 'text-slate-400 hover:bg-slate-50' : 'bg-purple-50 text-purple-600 border border-purple-100 shadow-inner'}`}
                        title="Magnetic Zones Response"
                    >
                        <Magnet size={18} className={isMagnetMode ? "animate-pulse" : ""} />
                    </button>

                    <button
                        onClick={() => setIs3DMode(!is3DMode)}
                        className={`h-10 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest border flex items-center gap-2.5 transition-all duration-300 ${is3DMode ? 'bg-primary border-primary text-white shadow-xl shadow-blue-200' : 'bg-white border-slate-200 text-slate-600 hover:border-primary hover:text-primary shadow-sm hover:shadow-md'}`}
                    >
                        <Box size={16} /> 3D Perspective
                    </button>

                    <button
                        onClick={() => downloadDXF(projectName, rooms)}
                        className="h-10 px-6 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary transition-all duration-500 flex items-center gap-2.5 shadow-xl shadow-slate-200 hover:shadow-blue-200 group"
                    >
                        <Download size={16} className="group-hover:-translate-y-0.5 transition-transform" /> Export CAD
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Sleek Catalog Sidebar */}
                <aside className="w-80 bg-white border-r border-slate-200/50 flex flex-col z-30 shadow-[10px_0_30px_rgba(0,0,0,0.02)] translate-x-0 transition-transform duration-500">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                        <div>
                            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-1">
                                <Zap size={12} className="text-yellow-500" /> Space Inventory
                            </h2>
                            <p className="text-[10px] font-bold text-slate-500">{unplacedRooms.length} spaces pending placement</p>
                        </div>
                        <span className="w-8 h-8 flex items-center justify-center bg-slate-200/50 rounded-xl text-xs font-black text-slate-600 border border-slate-200/50">{unplacedRooms.length}</span>
                    </div>
                    <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-gradient-to-b from-white to-slate-50/50">
                        {unplacedRooms.length > 0 ? unplacedRooms.map(room => (
                            <div
                                key={room.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, room)}
                                className="p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-primary/20 hover:-translate-y-1 transition-all duration-300 cursor-grab active:cursor-grabbing group bg-white"
                                onClick={() => {
                                    /* Optional: keep click to place at center if drag fails or as alternative */
                                    /* placeRoom(room); */
                                }}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <span className="font-black text-slate-800 text-sm tracking-tight block group-hover:text-primary transition-colors">{room.name}</span>
                                        <span className="text-[10px] text-slate-400 font-medium">Drag to canvas to place</span>
                                    </div>
                                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-primary/10 group-hover:text-primary transition-all">
                                        <Plus size={16} />
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="px-2 py-1 bg-slate-100 rounded-lg text-[10px] font-black text-slate-500 uppercase tracking-wider">{room.area} m²</span>
                                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm ${ZONE_COLORS[room.zone]?.bg || 'bg-slate-100'} ${ZONE_COLORS[room.zone]?.text || 'text-slate-500'}`}>{room.zone}</span>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-24 opacity-30 px-10">
                                <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                                    <Box size={32} className="text-slate-400" />
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">Inventory Clear<br />All elements are in the design context.</p>
                            </div>
                        )}
                    </div>
                    <div className="p-6 bg-slate-50/50 border-t border-slate-100">
                        <button onClick={() => addRoom({})} className="w-full py-4 bg-white border border-slate-200/80 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-700 hover:border-primary hover:text-primary hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-3 shadow-sm group">
                            <Plus size={18} className="group-hover:rotate-90 transition-transform" /> Add Manual Space
                        </button>
                    </div>
                </aside>

                <main
                    ref={mainRef}
                    className={`flex-1 relative overflow-hidden bg-[#f0f2f5] transition-colors duration-500 ${showGrid ? 'grid-pattern' : ''}`}
                    onWheel={handleWheel}
                    onMouseDown={(e) => {
                        handleMouseDown(e);
                        // Reset selection if clicking background (unless panning)
                        if (e.target === e.currentTarget && !e.shiftKey) {
                            setSelectedRoomIds(new Set());
                            setSelectedZone(null);
                        }
                    }}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    {/* Zone Overlay Layer - Behind everything */}
                    <div
                        className="absolute inset-0 transition-transform duration-75 origin-top-left pointer-events-none"
                        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
                    >
                        <ZoneOverlay
                            rooms={rooms}
                            currentFloor={currentFloor}
                            scale={scale}
                            onZoneDrag={handleZoneDrag}
                            onSelectZone={(z) => {
                                setSelectedZone(z);
                                setSelectedRoomIds(new Set());
                            }}
                        />
                    </div>

                    {/* Canvas Connection Layer (Placeholder for Polishing) */}
                    <svg className="absolute inset-0 pointer-events-none z-0">
                        {/* Dynamic lines will be rendered here based on connections state */}
                    </svg>

                    <div
                        className="absolute inset-0 transition-transform duration-75 origin-top-left"
                        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
                    >
                        {/* Connection Lines Layer */}
                        <svg className="absolute inset-0 overflow-visible pointer-events-none">
                            <defs>
                                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                                </marker>
                            </defs>
                            {connections.map(conn => {
                                const fromRoom = rooms.find(r => r.id === conn.fromId);
                                const toRoom = rooms.find(r => r.id === conn.toId);
                                if (!fromRoom || !toRoom || !fromRoom.isPlaced || !toRoom.isPlaced || fromRoom.floor !== currentFloor || toRoom.floor !== currentFloor) return null;

                                const x1 = fromRoom.x + fromRoom.width / 2;
                                const y1 = fromRoom.y + fromRoom.height / 2;
                                const x2 = toRoom.x + toRoom.width / 2;
                                const y2 = toRoom.y + toRoom.height / 2;

                                return (
                                    <g key={conn.id}>
                                        <line
                                            x1={x1} y1={y1} x2={x2} y2={y2}
                                            stroke="#cbd5e1"
                                            strokeWidth={2 / scale}
                                            strokeDasharray={currentStyle.sketchy ? "5,5" : "none"}
                                            className="transition-all duration-300"
                                        />
                                        <circle cx={x1} cy={y1} r={4 / scale} fill="#94a3b8" />
                                        <circle cx={x2} cy={y2} r={4 / scale} fill="#94a3b8" />
                                    </g>
                                );
                            })}

                            {/* Snapping Guides */}
                            {snapGuides && (
                                <>
                                    {snapGuides.x !== undefined && (
                                        <line
                                            x1={snapGuides.x} y1="-10000" x2={snapGuides.x} y2="10000"
                                            stroke="#3b82f6" strokeWidth={1 / scale} strokeDasharray="5,5"
                                            className="opacity-50"
                                        />
                                    )}
                                    {snapGuides.y !== undefined && (
                                        <line
                                            x1="-10000" y1={snapGuides.y} x2="10000" y2={snapGuides.y}
                                            stroke="#3b82f6" strokeWidth={1 / scale} strokeDasharray="5,5"
                                            className="opacity-50"
                                        />
                                    )}
                                </>
                            )}
                        </svg>

                        {rooms.filter(r => r.isPlaced && r.floor === currentFloor).map(room => (
                            <Bubble
                                key={room.id}
                                room={room}
                                zoomScale={scale}
                                updateRoom={updateRoom}
                                isSelected={selectedRoomIds.has(room.id)}
                                isLinkingSource={connectionSourceId === room.id}
                                onLinkToggle={toggleLink}
                                getSnappedPosition={getSnappedPosition}
                                onSelect={(id, multi) => {
                                    setSelectedRoomIds(prev => {
                                        const next = new Set(multi ? prev : []);
                                        if (next.has(id)) next.delete(id);
                                        else next.add(id);
                                        return next;
                                    });
                                    if (!multi) setSelectedZone(null); // Clear zone selection on room click unless multi?
                                }}
                                diagramStyle={currentStyle}
                                snapEnabled={true}
                                snapPixelUnit={10}
                            />
                        ))}
                    </div>

                    <div className="absolute bottom-6 left-6 flex flex-col gap-2 scale-110 origin-bottom-left">
                        <div className="bg-white/90 backdrop-blur-md p-3 rounded-2xl border border-white shadow-2xl flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-primary/10 rounded-md flex items-center justify-center text-primary">
                                    <MousePointer2 size={12} />
                                </div>
                                <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">ArchiMode</span>
                            </div>
                            <div className="w-px h-3 bg-slate-200" />
                            <div className="flex items-center gap-3 px-1">
                                <button className="text-slate-400 hover:text-slate-600 transition-colors"><Link size={14} /></button>
                                <button className="text-slate-400 hover:text-slate-600 transition-colors"><LandPlot size={14} /></button>
                                <div className="w-px h-3 bg-slate-200" />
                                <button className="text-slate-400 hover:text-slate-600 transition-colors"><Undo2 size={14} /></button>
                            </div>
                        </div>
                    </div>

                    <div className="absolute top-6 right-6 flex flex-col gap-2">
                        <div className="bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full border border-slate-100 shadow-lg flex items-center gap-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase">Zoom</span>
                            <span className="text-xs font-mono font-bold text-slate-700">{(scale * 100).toFixed(0)}%</span>
                        </div>
                    </div>

                    {/* Scale Bar on Canvas - Dynamic */}
                    <div className="absolute bottom-6 right-6 flex flex-col items-end gap-1 pointer-events-none">
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-slate-400 text-shadow-sm">10 meters</span>
                            <div className="h-2 border-x border-b border-slate-400/80 bg-white/20 backdrop-blur-sm"
                                style={{ width: 10 * PIXELS_PER_METER * scale }} />
                        </div>
                    </div>

                </main>

                {isRightSidebarOpen && (
                    <aside className="w-72 bg-white border-l border-slate-200 flex flex-col z-20 shadow-2xl">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {selectedRoom ? 'Space Detail' : selectedZone ? 'Zone Detail' : 'Properties'}
                            </h2>
                            <button onClick={() => setIsRightSidebarOpen(false)} className="text-slate-300 hover:text-slate-600"><ChevronRight size={18} /></button>
                        </div>
                        <div className="flex-1 p-6 overflow-y-auto">
                            {selectedRoom ? (
                                <div className="space-y-6 slide-in-bottom">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Space Name</label>
                                        <input
                                            className="w-full text-xl font-black text-slate-800 focus:outline-none focus:text-primary transition-colors bg-transparent"
                                            value={selectedRoom.name}
                                            onChange={(e) => updateRoom(selectedRoom.id, { name: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Area</span>
                                            <span className="text-lg font-mono font-bold text-slate-700">{selectedRoom.area} <small className="text-[10px] opacity-40">m²</small></span>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Floor</span>
                                            <span className="text-lg font-mono font-bold text-slate-700">{selectedRoom.floor}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Zone Category</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {Object.keys(ZONE_COLORS).map(z => (
                                                <button
                                                    key={z}
                                                    onClick={() => updateRoom(selectedRoom.id, { zone: z })}
                                                    className={`px-3 py-2 rounded-lg text-[10px] font-bold border transition-all ${selectedRoom.zone === z ? 'bg-primary border-primary text-white shadow-lg shadow-blue-200' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300'}`}
                                                >
                                                    {z}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="pt-6 border-t border-slate-100">
                                        <button onClick={() => deleteRoom(selectedRoom.id)} className="w-full py-3 bg-red-50 text-red-500 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2">
                                            <Trash2 size={16} /> Delete Space
                                        </button>
                                    </div>
                                </div>
                            ) : selectedZone ? (
                                <div className="space-y-6 slide-in-bottom">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Zone Name</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                className="w-full text-xl font-black text-slate-800 focus:outline-none focus:text-primary transition-colors bg-transparent border-b border-dashed border-slate-300 focus:border-primary pb-1"
                                                value={selectedZone}
                                                onChange={(e) => renameZone(selectedZone, e.target.value)}
                                            />
                                            <div className={`w-4 h-4 rounded-full ${ZONE_COLORS[selectedZone]?.bg || 'bg-slate-200'}`} />
                                        </div>
                                    </div>

                                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div className="flex justify-between items-center mb-4">
                                            <span className="text-[10px] font-black text-slate-400 uppercase">Total Stats</span>
                                            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-md">{selectedZoneRooms.length} Spaces</span>
                                        </div>
                                        <div className="text-3xl font-mono font-bold text-slate-800 tracking-tight">
                                            {zoneArea} <span className="text-sm font-sans text-slate-400 font-bold">m²</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block flex justify-between">
                                            Included Spaces
                                        </label>
                                        <div className="space-y-2">
                                            {selectedZoneRooms.map(r => (
                                                <div key={r.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:shadow-md transition-all cursor-pointer"
                                                    onClick={() => setSelectedRoomIds(new Set([r.id]))}>
                                                    <span className="text-xs font-bold text-slate-700">{r.name}</span>
                                                    <span className="text-[10px] font-mono text-slate-400">{r.area} m²</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-20">
                                    <Settings2 size={48} className="mx-auto text-slate-50 mb-6" />
                                    <p className="text-xs font-black text-slate-300 uppercase tracking-widest leading-relaxed px-10 text-center">Select an object to modify its geometry and metadata.</p>
                                </div>
                            )}
                        </div>
                    </aside>
                )}
            </div>

            {showApiKeyModal && (
                <ApiKeyModal
                    onSave={handleSaveApiKey}
                    onClose={() => setShowApiKeyModal(false)}
                    currentKey={apiKey}
                />
            )}
        </div>
    );
}