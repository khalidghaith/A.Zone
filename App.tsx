import React, { useState, useCallback, useRef, useEffect } from 'react';
import { InputSection } from './components/InputSection';
import { ProgramEditor } from './components/ProgramEditor';
import { Bubble } from './components/Bubble';
import { Room, FLOORS, ZONE_COLORS, Point, Connection, DIAGRAM_STYLES, DiagramStyle } from './types';
import { generateDXF } from './utils/dxf';
import { 
  Layers, Undo2, Save, Map as MapIcon, Maximize2, Trash2, 
  AlertCircle, ZoomIn, ZoomOut, MousePointer2, LandPlot, 
  Sun, Box, Link, Download, Settings2, RotateCcw, Grid3x3, ChevronDown,
  Ruler, TableProperties, X, ChevronRight, ChevronLeft, Palette, SlidersHorizontal
} from 'lucide-react';

// Configuration
const PIXELS_PER_METER = 20; // 1 meter = 20 pixels
const FT_PER_METER = 3.28084;

export default function App() {
  // App State
  const [hasStarted, setHasStarted] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  
  // UI State
  const [showProgramEditor, setShowProgramEditor] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [activeRightTab, setActiveRightTab] = useState<'properties' | 'styles'>('properties');

  // View State
  const [currentFloor, setCurrentFloor] = useState(0); 
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  
  // Snap & Grid State
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const [snapStep, setSnapStep] = useState(1); // Value in current units (1m or 1ft)
  const [showGridMenu, setShowGridMenu] = useState(false);
  
  // Modes & Tools
  const [is3DMode, setIs3DMode] = useState(false);
  const [toolMode, setToolMode] = useState<'select' | 'boundary' | 'connect'>('select');
  const [sitePolygon, setSitePolygon] = useState<Point[]>([]);
  const [northAngle, setNorthAngle] = useState(0); // 0 = Up
  const [circulationFactor, setCirculationFactor] = useState(0.15); // 15%
  const [connectingSourceId, setConnectingSourceId] = useState<string | null>(null);

  // Diagram Styles
  const [currentStyle, setCurrentStyle] = useState<DiagramStyle>(DIAGRAM_STYLES[0]);

  // Refs for Canvas interaction
  const mainRef = useRef<HTMLElement>(null);
  const isPanning = useRef(false);
  const lastMousePos = useRef<Point>({ x: 0, y: 0 });

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
             setConnectingSourceId(null);
             if (toolMode === 'connect') setToolMode('select');
             setSelectedRoomIds(new Set());
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toolMode]);


  // --- Input Handlers ---

  const handleProgramSave = (updatedRooms: Room[], name: string) => {
    setProjectName(name);
    // Logic mostly handled by real-time sync, but this confirms final state and closes modal
    setHasStarted(true);
    setShowProgramEditor(false);
    
    // Initial center if first start
    if (!hasStarted) {
        setOffset({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    }
  };

  const handleProgramChange = (updatedRooms: Room[]) => {
      setRooms(currentRooms => {
          // 1. Map existing rooms to find matches
          const roomMap = new Map(currentRooms.map(r => [r.id, r]));
          
          return updatedRooms.map(newRoom => {
              const existing = roomMap.get(newRoom.id);
              if (existing) {
                  // If area changed significantly in editor, resize bubble (reset to square)
                  // Use a small epsilon for float comparison
                  const areaChanged = Math.abs(existing.area - newRoom.area) > 0.01;
                  
                  let width = existing.width;
                  let height = existing.height;

                  if (areaChanged) {
                      const side = Math.sqrt(newRoom.area) * PIXELS_PER_METER;
                      width = side;
                      height = side;
                  }

                  return {
                      ...existing,
                      name: newRoom.name,
                      area: newRoom.area,
                      zone: newRoom.zone,
                      description: newRoom.description,
                      width,
                      height
                  };
              } else {
                  // New Room
                  const side = Math.sqrt(newRoom.area) * PIXELS_PER_METER;
                  return {
                      ...newRoom,
                      width: side,
                      height: side,
                      isPlaced: false // Ensure new rooms aren't placed by default
                  };
              }
          });
      });

      // Handle Deletions (Remove connections for missing rooms)
      const newIds = new Set(updatedRooms.map(r => r.id));
      setConnections(prev => prev.filter(c => newIds.has(c.fromId) && newIds.has(c.toId)));
  };

  // --- Canvas Coordinate Helpers ---
  const screenToWorld = (x: number, y: number) => {
    if (!mainRef.current) return { x: 0, y: 0 };
    const rect = mainRef.current.getBoundingClientRect();
    return {
      x: (x - rect.left - offset.x) / scale,
      y: (y - rect.top - offset.y) / scale
    };
  };

  // --- Unit Helpers ---
  const pixelsPerUnit = unitSystem === 'metric' ? PIXELS_PER_METER : PIXELS_PER_METER / FT_PER_METER;
  
  const toggleUnits = () => {
      const newSystem = unitSystem === 'metric' ? 'imperial' : 'metric';
      setUnitSystem(newSystem);
      setSnapStep(newSystem === 'metric' ? 1 : 5); // Default to 1m or 5ft
  };

  // --- Interaction Handlers ---

  const handleWheel = (e: React.WheelEvent) => {
     if (showProgramEditor) return;
     e.preventDefault();
     const rect = mainRef.current?.getBoundingClientRect();
     if (!rect) return;
     
     const mouseX = e.clientX - rect.left;
     const mouseY = e.clientY - rect.top;

     const worldX = (mouseX - offset.x) / scale;
     const worldY = (mouseY - offset.y) / scale;

     const zoomSensitivity = 0.001;
     const newScale = Math.min(Math.max(0.1, scale - e.deltaY * zoomSensitivity), 5);
     
     const newOffsetX = mouseX - worldX * newScale;
     const newOffsetY = mouseY - worldY * newScale;

     setScale(newScale);
     setOffset({ x: newOffsetX, y: newOffsetY });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (showProgramEditor) return;
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        isPanning.current = true;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        return;
    }

    // Cancel connection if clicking background
    if (connectingSourceId && !(e.target as HTMLElement).closest('[data-room-id]')) {
        setConnectingSourceId(null);
        setToolMode('select');
        return;
    }

    if (toolMode === 'boundary') {
        const point = screenToWorld(e.clientX, e.clientY);
        setSitePolygon(prev => [...prev, point]);
    }
    
    // Clear selection if clicking background
    if (toolMode === 'select' && !(e.target as HTMLElement).closest('[data-room-id]')) {
        setSelectedRoomIds(new Set());
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

  // --- Feature Logic ---

  const handleSelectRoom = useCallback((id: string, multi: boolean) => {
    setSelectedRoomIds(prev => {
        if (multi) {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        } else {
             if (prev.has(id)) return prev;
             return new Set([id]);
        }
    });
    // Auto-switch to properties tab on selection
    if (!multi) setActiveRightTab('properties');
  }, []);

  const updateRoom = useCallback((id: string, updates: Partial<Room>) => {
    setRooms(prev => {
        if (selectedRoomIds.has(id) && (updates.x !== undefined || updates.y !== undefined)) {
            const targetRoom = prev.find(r => r.id === id);
            if (!targetRoom) return prev;
            
            const dx = updates.x !== undefined ? updates.x - targetRoom.x : 0;
            const dy = updates.y !== undefined ? updates.y - targetRoom.y : 0;
            
            if (dx === 0 && dy === 0) {
                 return prev.map(r => r.id === id ? { ...r, ...updates } : r);
            }

            return prev.map(r => {
                if (selectedRoomIds.has(r.id)) {
                    const newX = r.id === id && updates.x !== undefined ? updates.x : r.x + dx;
                    const newY = r.id === id && updates.y !== undefined ? updates.y : r.y + dy;
                    return { ...r, x: newX, y: newY };
                }
                return r;
            });
        }
        return prev.map(r => r.id === id ? { ...r, ...updates } : r);
    });
  }, [selectedRoomIds]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const roomId = e.dataTransfer.getData("roomId");
    if (!roomId) return;

    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    const worldPos = screenToWorld(e.clientX, e.clientY);
    
    // Calculate Snap in Pixels
    const snapPixelSize = snapStep * pixelsPerUnit;
    const snap = (val: number) => snapEnabled ? Math.round(val / snapPixelSize) * snapPixelSize : val;

    // Initial Size Calculation (Always based on Area)
    const sideInMeters = Math.sqrt(room.area);
    const sideInPixels = sideInMeters * PIXELS_PER_METER; 
    
    let dropX = worldPos.x - (sideInPixels / 2);
    let dropY = worldPos.y - (sideInPixels / 2);

    if (snapEnabled) {
        dropX = snap(dropX);
        dropY = snap(dropY);
    }

    updateRoom(roomId, {
      isPlaced: true,
      floor: currentFloor,
      x: dropX,
      y: dropY,
      width: sideInPixels,
      height: sideInPixels
    });
    setSelectedRoomIds(new Set([roomId]));
  };

  const handleConnect = (targetId: string) => {
      if (connectingSourceId === targetId) {
          setConnectingSourceId(null);
          setToolMode('select');
          return;
      }

      if (connectingSourceId && connectingSourceId !== targetId) {
          const exists = connections.some(c => 
             (c.fromId === connectingSourceId && c.toId === targetId) ||
             (c.fromId === targetId && c.toId === connectingSourceId)
          );
          
          if (!exists) {
              setConnections(prev => [...prev, {
                  id: `conn-${Date.now()}`,
                  fromId: connectingSourceId,
                  toId: targetId
              }]);
          }
          setConnectingSourceId(null);
          setToolMode('select');
      } else {
          setConnectingSourceId(targetId);
          setToolMode('connect');
      }
  };

  const handleDeleteSelected = () => {
      const idsToRemove = Array.from(selectedRoomIds);
      if (idsToRemove.length === 0) return;
      
      setRooms(prev => prev.map(r => idsToRemove.includes(r.id) ? { ...r, isPlaced: false } : r));
      setSelectedRoomIds(new Set());
      setConnections(prev => prev.filter(c => !idsToRemove.includes(c.fromId) && !idsToRemove.includes(c.toId)));
  };

  const exportDXF = () => {
      const content = generateDXF(rooms, PIXELS_PER_METER);
      const blob = new Blob([content], { type: 'application/dxf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectName.replace(/\s+/g, '_')}.dxf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // --- Derived Metrics & Render Helpers ---
  const roomsOnCurrentFloor = rooms.filter(r => r.isPlaced && r.floor === currentFloor);
  const placedArea = rooms.filter(r => r.isPlaced).reduce((acc, r) => acc + r.area, 0);
  const circulationArea = Math.round(placedArea * circulationFactor);

  const formatArea = (sqm: number) => {
      if (unitSystem === 'imperial') return `${Math.round(sqm * 10.7639)} ft²`;
      return `${Math.round(sqm)} m²`;
  }

  const checkSunWarning = (room: Room) => {
      if (!room.name.toLowerCase().includes('bed')) return false;
      const allX = rooms.filter(r => r.isPlaced).map(r => r.x + r.width/2);
      if (allX.length === 0) return false;
      const centerX = (Math.min(...allX) + Math.max(...allX)) / 2;
      return room.x + room.width/2 < centerX && northAngle < 45; 
  };
  
  const scaleBarWidthPx = 100;
  const unitsInBar = scaleBarWidthPx / (pixelsPerUnit * scale);
  const scaleBarLabel = `${Math.round(unitsInBar * 10) / 10} ${unitSystem === 'metric' ? 'm' : 'ft'}`;
  const visualGridSize = snapStep * pixelsPerUnit * scale;
  const gridOptions = unitSystem === 'metric' ? [0.5, 1, 2, 5] : [1, 2, 5, 10];

  const selectedRoom = selectedRoomIds.size === 1 ? rooms.find(r => r.id === Array.from(selectedRoomIds)[0]) : null;

  // --- INITIAL VIEW (Program Editor) ---
  if (!hasStarted) {
    return (
        <div className="h-screen w-screen bg-slate-100 flex items-center justify-center p-8">
            <div className="w-full max-w-4xl h-full max-h-[90vh]">
                <ProgramEditor 
                    initialRooms={rooms} 
                    initialProjectName={projectName}
                    onSave={handleProgramSave} 
                    onProgramChange={handleProgramChange}
                />
            </div>
        </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 overflow-hidden">
      
      {/* Top Bar */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold">
              <MapIcon size={18} />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800">{projectName}</h1>
              <div className="text-[10px] text-slate-500 flex items-center gap-2">
                 <span>Gross: {formatArea(placedArea + circulationArea)} (+{Math.round(circulationFactor*100)}% circ)</span>
              </div>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-200 mx-2" />
          <button onClick={() => setShowProgramEditor(true)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium transition-colors border border-slate-200">
             <TableProperties size={14} /> Edit Program
          </button>
          
          <div className="h-6 w-px bg-slate-200 mx-2" />

          {/* Tools */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg gap-0.5">
             <button onClick={() => setToolMode('select')} className={`p-1.5 rounded-md transition-colors ${toolMode === 'select' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-800'}`} title="Select & Move">
               <MousePointer2 size={16} />
             </button>
             <div className="flex gap-1 items-center bg-slate-200/50 rounded p-0.5">
                 <button onClick={() => setToolMode('boundary')} className={`p-1.5 rounded-md transition-colors ${toolMode === 'boundary' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-800'}`} title="Draw Site Boundary">
                   <LandPlot size={16} />
                 </button>
                 {sitePolygon.length > 0 && (
                     <button onClick={() => setSitePolygon([])} className="p-1 hover:bg-slate-300 rounded text-red-500" title="Clear Boundary">
                         <RotateCcw size={12} />
                     </button>
                 )}
             </div>
             <button onClick={() => setToolMode('connect')} className={`p-1.5 rounded-md transition-colors ${toolMode === 'connect' || connectingSourceId ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-800'}`} title="Connect Spaces">
               <Link size={16} />
             </button>
             <div className="w-px bg-slate-300 mx-1 h-4 self-center" />
             
             {/* Grid Tools */}
             <div className="relative flex items-center bg-slate-200/50 rounded-md">
                <button onClick={() => setSnapEnabled(!snapEnabled)} className={`p-1.5 rounded-l-md transition-colors ${snapEnabled ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-800'}`} title="Snap to Grid">
                    <Grid3x3 size={16} />
                </button>
                {snapEnabled && (
                    <>
                        <div className="w-px h-4 bg-slate-300"></div>
                        <button onClick={() => setShowGridMenu(!showGridMenu)} className="p-1.5 pl-2 pr-2 rounded-r-md bg-white text-slate-500 hover:text-slate-800 text-[10px] font-medium flex items-center transition-all">
                            {snapStep}{unitSystem === 'metric' ? 'm' : 'ft'} <ChevronDown size={12} className="ml-0.5"/>
                        </button>
                        {showGridMenu && (
                            <div className="absolute top-full right-0 mt-1 bg-white rounded-md shadow-lg border border-slate-200 py-1 z-50 flex flex-col min-w-[80px]">
                                {gridOptions.map(m => (
                                    <button key={m} onClick={() => { setSnapStep(m); setShowGridMenu(false); }} className={`px-3 py-1.5 text-left text-xs hover:bg-slate-50 ${snapStep === m ? 'text-primary font-bold' : 'text-slate-600'}`}>
                                        {m}{unitSystem === 'metric' ? 'm' : 'ft'}
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}
             </div>
             <div className="w-px bg-slate-300 mx-1 h-4 self-center" />
             <button onClick={toggleUnits} className="p-1.5 px-2 rounded-md text-[10px] font-bold text-slate-600 hover:bg-white hover:text-primary transition-colors flex items-center gap-1 min-w-[3rem] justify-center">
               <Ruler size={14} /> {unitSystem === 'metric' ? 'M' : 'FT'}
             </button>
          </div>

          <button onClick={() => setIs3DMode(!is3DMode)} className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${is3DMode ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'}`}>
            <Box size={14} /> 3D View
          </button>
        </div>

        {/* Floor Selector */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
          {FLOORS.map((f) => (
            <button key={f.id} onClick={() => setCurrentFloor(f.id)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${currentFloor === f.id ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={() => setHasStarted(false)} className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md" title="Restart">
            <Undo2 size={18} />
          </button>
          <button onClick={exportDXF} className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 flex items-center gap-2">
            <Download size={14} /> DXF
          </button>
        </div>
      </header>

      {/* Sub-toolbar */}
      <div className="h-8 bg-white border-b border-slate-100 flex items-center px-4 gap-4 text-xs z-10">
          <div className="flex items-center gap-2">
             <Settings2 size={12} className="text-slate-400" />
             <span className="text-slate-500">Circulation:</span>
             <input type="range" min="0" max="0.5" step="0.05" value={circulationFactor} onChange={(e) => setCirculationFactor(parseFloat(e.target.value))} className="w-24 accent-primary" />
             <span className="w-8">{Math.round(circulationFactor*100)}%</span>
          </div>
          <div className="w-px h-4 bg-slate-200" />
          <div className="flex items-center gap-2">
             <Sun size={12} className="text-orange-400" />
             <span className="text-slate-500">North Angle:</span>
             <input type="range" min="0" max="360" value={northAngle} onChange={(e) => setNorthAngle(parseInt(e.target.value))} className="w-24 accent-orange-400" />
             <span className="w-8">{northAngle}°</span>
          </div>
          <div className="w-px h-4 bg-slate-200" />
          <div className="flex items-center gap-2 text-slate-500">
             <span className="font-semibold text-primary">{Math.round(scale*100)}%</span> Zoom
          </div>
          
          <div className="flex-1" />
          <button onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)} className="p-1 hover:bg-slate-100 rounded text-slate-500">
              {isRightSidebarOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
      </div>

      <div className="flex flex-1 h-full overflow-hidden">
        
        {/* Left Sidebar (Catalog) */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-lg z-10 shrink-0">
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Room Catalog</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {(Object.entries(rooms.filter(r => !r.isPlaced).reduce((acc, room) => {
                const z = room.zone || 'Other';
                if (!acc[z]) acc[z] = [];
                acc[z].push(room);
                return acc;
            }, {} as Record<string, Room[]>)) as [string, Room[]][]).map(([zone, zoneRooms]) => {
                const key = Object.keys(ZONE_COLORS).find(k => zone.toLowerCase().includes(k.toLowerCase()));
                const colorStyle = key ? ZONE_COLORS[key] : ZONE_COLORS['Default'];
                return (
                  <div key={zone}>
                    <div className={`flex items-center gap-2 mb-2 px-2 py-1 rounded ${colorStyle.bg} ${colorStyle.text} bg-opacity-50`}>
                      <Layers size={14} />
                      <span className="text-xs font-bold uppercase">{zone}</span>
                    </div>
                    <div className="space-y-2">
                      {zoneRooms.map(room => (
                        <div
                          key={room.id}
                          draggable
                          onDragStart={(e) => {
                             e.dataTransfer.setData("roomId", room.id);
                             e.dataTransfer.effectAllowed = "move";
                          }}
                          className="group flex flex-col bg-white border border-slate-200 rounded-lg p-3 cursor-grab hover:border-primary hover:shadow-md transition-all active:cursor-grabbing"
                        >
                          <div className="flex justify-between items-start">
                            <span className="text-sm font-medium text-slate-700">{room.name}</span>
                            <span className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{formatArea(room.area)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
            })}
          </div>
        </aside>

        {/* Canvas */}
        <main 
          ref={mainRef}
          className="flex-1 relative bg-canvas overflow-hidden grid-pattern"
          style={{
             backgroundSize: snapEnabled ? `${visualGridSize}px ${visualGridSize}px` : '40px 40px',
             backgroundPosition: `${offset.x}px ${offset.y}px`,
             filter: currentStyle.colorMode === 'monochrome' ? 'grayscale(100%)' : 'none'
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        >
          {/* North Arrow UI */}
          <div className="absolute top-4 left-4 w-12 h-12 rounded-full border-2 border-slate-300 flex items-center justify-center pointer-events-none z-10 opacity-50">
             <div className="flex flex-col items-center" style={{ transform: `rotate(${northAngle}deg)` }}>
                <span className="text-red-500 text-xs font-bold">N</span>
                <div className="w-0.5 h-4 bg-slate-800" />
             </div>
          </div>

          {/* Background Image Layer */}
          <div 
             className="absolute inset-0 pointer-events-none transition-transform duration-75 origin-top-left"
             style={{ 
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                perspective: is3DMode ? '1000px' : 'none'
             }}
          >
             {/* 3D Container Wrapper */}
             <div 
                className="absolute inset-0"
                style={{
                    transform: is3DMode ? 'rotateX(60deg) rotateZ(45deg)' : 'none',
                    transformStyle: 'preserve-3d',
                    transition: 'transform 0.5s ease-in-out'
                }}
             >
                {/* Site Polygon */}
                {sitePolygon.length > 2 && (
                    <svg className="absolute top-0 left-0 w-[5000px] h-[5000px] overflow-visible pointer-events-none" style={{ transform: 'translateZ(0)' }}>
                        <polygon 
                            points={sitePolygon.map(p => `${p.x},${p.y}`).join(' ')} 
                            fill="rgba(34, 197, 94, 0.1)" 
                            stroke="#16a34a" 
                            strokeWidth="2"
                            strokeDasharray="5,5"
                        />
                    </svg>
                )}

                {/* Connection Lines */}
                <svg className="absolute top-0 left-0 w-[5000px] h-[5000px] overflow-visible pointer-events-none z-0" style={{ transform: 'translateZ(0)' }}>
                   {connections.map(conn => {
                       const r1 = rooms.find(r => r.id === conn.fromId);
                       const r2 = rooms.find(r => r.id === conn.toId);
                       if (!r1 || !r2 || !r1.isPlaced || !r2.isPlaced) return null;
                       if (r1.floor !== currentFloor || r2.floor !== currentFloor) return null;

                       const p1 = { x: r1.x + r1.width/2, y: r1.y + r1.height/2 };
                       const p2 = { x: r2.x + r2.width/2, y: r2.y + r2.height/2 };
                       const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
                       const warningDist = 10 * PIXELS_PER_METER;
                       const isTooFar = dist > warningDist; 

                       return (
                           <line key={conn.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={isTooFar ? 'red' : '#94a3b8'} strokeWidth="2" strokeDasharray={isTooFar ? "4,4" : ""} />
                       );
                   })}
                   {connectingSourceId && (
                       (() => {
                            const r1 = rooms.find(r => r.id === connectingSourceId);
                            if (!r1) return null;
                            const p1 = { x: r1.x + r1.width/2, y: r1.y + r1.height/2 };
                            return <circle cx={p1.x} cy={p1.y} r={5} fill="#2563eb" className="animate-ping" />
                       })()
                   )}
                </svg>

                {/* Rooms */}
                {roomsOnCurrentFloor.map(room => (
                    <Bubble
                    key={room.id}
                    room={room}
                    pixelsPerMeter={PIXELS_PER_METER}
                    zoomScale={scale}
                    updateRoom={updateRoom}
                    onFloorChange={(id, d) => {
                        const r = rooms.find(rm => rm.id === id);
                        if (!r) return;
                        const idx = FLOORS.findIndex(f => f.id === r.floor);
                        const next = idx + d;
                        if (next >= 0 && next < FLOORS.length) updateRoom(id, { floor: FLOORS[next].id });
                    }}
                    isSelected={selectedRoomIds.has(room.id)}
                    onSelect={handleSelectRoom}
                    is3D={is3DMode}
                    showSunWarning={checkSunWarning(room)}
                    onConnectionStart={handleConnect}
                    isConnecting={toolMode === 'connect' || !!connectingSourceId}
                    snapEnabled={snapEnabled}
                    snapPixelUnit={snapStep * pixelsPerUnit}
                    unitSystem={unitSystem}
                    isConnectionSource={connectingSourceId === room.id}
                    otherRooms={roomsOnCurrentFloor.filter(r => r.id !== room.id)}
                    diagramStyle={currentStyle}
                    />
                ))}
             </div>
          </div>

          {/* Scale Bar */}
          <div className="absolute bottom-4 left-4 bg-white/90 p-2 rounded shadow-sm border border-slate-200 pointer-events-none select-none flex flex-col items-start z-20">
             <div className="flex flex-col items-start gap-1">
                 <div className="flex justify-between w-[100px] text-[9px] text-slate-400 font-mono">
                     <span>|</span>
                     <span>|</span>
                 </div>
                 <div className="h-2 border-l border-r border-b border-slate-800 w-[100px]"></div>
                 <span className="text-[10px] font-mono font-bold text-slate-700">{scaleBarLabel}</span>
             </div>
          </div>
        </main>

        {/* RIGHT SIDEBAR (Properties & Styles) */}
        {isRightSidebarOpen && (
            <aside className="w-72 bg-white border-l border-slate-200 flex flex-col shadow-xl z-20 shrink-0">
                <div className="flex border-b border-slate-200">
                    <button 
                        onClick={() => setActiveRightTab('properties')}
                        className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider ${activeRightTab === 'properties' ? 'text-primary border-b-2 border-primary bg-slate-50' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        Properties
                    </button>
                    <button 
                        onClick={() => setActiveRightTab('styles')}
                        className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider ${activeRightTab === 'styles' ? 'text-primary border-b-2 border-primary bg-slate-50' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        Styles
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
                    {activeRightTab === 'properties' ? (
                        <div className="space-y-6">
                            {selectedRoom ? (
                                <>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-400 uppercase">Room Name</label>
                                        <input 
                                            type="text" 
                                            value={selectedRoom.name} 
                                            onChange={(e) => updateRoom(selectedRoom.id, { name: e.target.value })}
                                            className="w-full p-2 border border-slate-300 rounded text-sm focus:border-primary focus:outline-none"
                                        />
                                    </div>
                                    
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-400 uppercase">Zone</label>
                                        <select 
                                            value={Object.keys(ZONE_COLORS).some(z => selectedRoom.zone.includes(z)) ? Object.keys(ZONE_COLORS).find(z => selectedRoom.zone.includes(z)) : 'Default'}
                                            onChange={(e) => updateRoom(selectedRoom.id, { zone: e.target.value })}
                                            className="w-full p-2 border border-slate-300 rounded text-sm focus:border-primary focus:outline-none bg-white"
                                        >
                                            {Object.keys(ZONE_COLORS).map(z => (
                                                <option key={z} value={z}>{z}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-400 uppercase">Area ({unitSystem === 'metric' ? 'm²' : 'ft²'})</label>
                                            <input 
                                                type="number" 
                                                value={unitSystem === 'imperial' ? Math.round(selectedRoom.area * 10.7639) : selectedRoom.area} 
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    const newArea = unitSystem === 'imperial' ? val / 10.7639 : val;
                                                    // Maintain aspect ratio if possible, simplify to square root for now or just area
                                                    const side = Math.sqrt(newArea) * PIXELS_PER_METER;
                                                    updateRoom(selectedRoom.id, { area: newArea, width: side, height: side });
                                                }}
                                                className="w-full p-2 border border-slate-300 rounded text-sm focus:border-primary focus:outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-400 uppercase">Floor</label>
                                            <select
                                                value={selectedRoom.floor}
                                                onChange={(e) => updateRoom(selectedRoom.id, { floor: parseInt(e.target.value) })}
                                                className="w-full p-2 border border-slate-300 rounded text-sm focus:border-primary focus:outline-none bg-white"
                                            >
                                                {FLOORS.map(f => <option key={f.id} value={f.id}>{f.id}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-200">
                                         <button onClick={handleDeleteSelected} className="w-full py-2 bg-red-50 text-red-600 rounded hover:bg-red-100 flex items-center justify-center gap-2 text-sm font-medium">
                                             <Trash2 size={16} /> Delete Room
                                         </button>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-10 text-slate-400 flex flex-col items-center">
                                    <MousePointer2 size={32} className="mb-2 opacity-50" />
                                    <p className="text-sm">Select a room to view properties</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                                    <Palette size={14} /> Preset Styles
                                </label>
                                <div className="grid grid-cols-1 gap-2">
                                    {DIAGRAM_STYLES.map(style => (
                                        <button
                                            key={style.id}
                                            onClick={() => setCurrentStyle(style)}
                                            className={`p-3 text-left rounded-lg border flex items-center justify-between transition-all ${currentStyle.id === style.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                                        >
                                            <span className="text-sm font-medium text-slate-700">{style.name}</span>
                                            {currentStyle.id === style.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="h-px bg-slate-200 my-4" />
                            
                            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                                <h4 className="text-xs font-bold text-blue-800 mb-1 flex items-center gap-2">
                                    <SlidersHorizontal size={12} /> Customization
                                </h4>
                                <p className="text-[10px] text-blue-600 leading-relaxed">
                                    Select a preset above to change the diagram's visual language. Styles affect borders, fonts, rounded corners, and color palettes.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </aside>
        )}

      </div>
      
      {/* Program Editor Modal */}
      {showProgramEditor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="relative w-full max-w-5xl h-[85vh] bg-white rounded-lg shadow-2xl flex flex-col">
                <button onClick={() => setShowProgramEditor(false)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 z-10"><X size={24} /></button>
                <div className="flex-1 overflow-hidden p-1">
                    <ProgramEditor 
                        initialRooms={rooms} 
                        initialProjectName={projectName} 
                        onSave={handleProgramSave} 
                        onProgramChange={handleProgramChange}
                    />
                </div>
            </div>
        </div>
      )}
    </div>
  );
}