import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Room, FLOORS, Connection, DIAGRAM_STYLES, DiagramStyle, Point, ZONE_COLORS, AppSettings, ZoneColor, Floor, VerticalConnection } from './types';
import { ProgramEditor } from './components/ProgramEditor';
import { Bubble } from './components/Bubble';
import { HelpModal } from './components/HelpModal';
import { AboutModal } from './components/AboutModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { ZoneOverlay } from './components/ZoneOverlay'; // Newly added
import { ExportModal } from './components/ExportModal';
import { SettingsModal } from './components/SettingsModal';
import { VolumesView, VolumesViewHandle } from './components/VolumesView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyMagneticPhysics } from './utils/physics'; // Newly added
import { handleExport, getHexColorForZone, getHexBorderForZone } from './utils/exportSystem';
import { arrangeRooms } from './utils/layout';
import {
    Plus, Package, Download, Upload, Settings2, Undo2, Redo2, RotateCcw,
    TableProperties, Hexagon, Circle, Square,
    PencilRuler, ChevronRight, ChevronLeft, Key, X, Settings, LayoutTemplate, Sparkles, Trash2, Lock, Unlock, BrushCleaning,
    Link, Magnet, Grid, Moon, Sun, Maximize, ChevronUp, ChevronDown, Atom, FileImage, Image as ImageIcon, Scaling, Box, Layers, Save,
    Eye, EyeOff, CircleHelp, Info
} from 'lucide-react';
import { Annotation, AnnotationType, ArrowCapType, ReferenceImage, ReferenceScaleState } from './types';
import { SketchToolbar, SketchPanel } from './components/SketchToolbar';
import { AnnotationLayer } from './components/AnnotationLayer';
import { ReferenceLayer } from './components/ReferenceLayer';
import { ReferenceToolbar } from './components/ReferenceToolbar';
import SoapLogo from './lib/symbols/SOAP-Logo.svg';
import * as htmlToImage from 'html-to-image';
import { analyzeProgram, generateSpatialLayout } from './services/geminiService';

// Shim process for libs that might expect it in Vite
if (typeof window !== 'undefined' && !window.process) {
    (window as any).process = { env: {} };
}

// Configuration
const PIXELS_PER_METER = 20;

const COLOR_PALETTE: ZoneColor[] = [
    { bg: 'bg-[#f44336]/50', text: 'text-white', border: 'border-[#f44336]' },
    { bg: 'bg-[#e81e63]/50', text: 'text-white', border: 'border-[#e81e63]' },
    { bg: 'bg-[#9c27b0]/50', text: 'text-white', border: 'border-[#9c27b0]' },
    { bg: 'bg-[#673ab7]/50', text: 'text-white', border: 'border-[#673ab7]' },
    { bg: 'bg-[#3f51b5]/50', text: 'text-white', border: 'border-[#3f51b5]' },
    { bg: 'bg-[#2196f3]/50', text: 'text-white', border: 'border-[#2196f3]' },
    { bg: 'bg-[#03a9f4]/50', text: 'text-slate-900', border: 'border-[#03a9f4]' },
    { bg: 'bg-[#00bcd4]/50', text: 'text-slate-900', border: 'border-[#00bcd4]' },
    { bg: 'bg-[#009688]/50', text: 'text-white', border: 'border-[#009688]' },
    { bg: 'bg-[#4caf50]/50', text: 'text-slate-900', border: 'border-[#4caf50]' },
    { bg: 'bg-[#8bc34a]/50', text: 'text-slate-900', border: 'border-[#8bc34a]' },
    { bg: 'bg-[#cddc39]/50', text: 'text-slate-900', border: 'border-[#cddc39]' },
    { bg: 'bg-[#ffeb3b]/50', text: 'text-slate-900', border: 'border-[#ffeb3b]' },
    { bg: 'bg-[#ffc107]/50', text: 'text-slate-900', border: 'border-[#ffc107]' },
    { bg: 'bg-[#ff9800]/50', text: 'text-slate-900', border: 'border-[#ff9800]' },
    { bg: 'bg-[#ff5722]/50', text: 'text-white', border: 'border-[#ff5722]' },
];

// --- Geometry Helpers for Shape Conversion ---
const calculateCentroid = (points: Point[]): Point => {
    let x = 0, y = 0;
    for (const p of points) {
        x += p.x;
        y += p.y;
    }
    return { x: x / points.length, y: y / points.length };
};

const calculateCurvedArea = (points: Point[]): number => {
    if (points.length < 3) return 0;
    let area = 0;
    const steps = 20;
    for (let i = 0; i < points.length; i++) {
        const p0 = points[(i - 1 + points.length) % points.length];
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const p3 = points[(i + 2) % points.length];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        let prevX = p1.x;
        let prevY = p1.y;
        for (let j = 1; j <= steps; j++) {
            const t = j / steps;
            const it = 1 - t;
            const x = it * it * it * p1.x + 3 * it * it * t * cp1x + 3 * it * t * t * cp2x + t * t * t * p2.x;
            const y = it * it * it * p1.y + 3 * it * it * t * cp1y + 3 * it * t * t * cp2y + t * t * t * p2.y;
            area += prevX * y - x * prevY;
            prevX = x;
            prevY = y;
        }
    }
    return Math.abs(area) / 2;
};

const calculatePolygonArea = (points: Point[]): number => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
};

const isPointInPolygon = (p: Point, polygon: Point[]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > p.y) !== (yj > p.y))
            && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

// Helper for file saving
const saveFile = async (blob: Blob, suggestedName: string, extension: string) => {
    try {
        if ('showSaveFilePicker' in window) {
            const handle = await (window as any).showSaveFilePicker({
                suggestedName: `${suggestedName}.${extension}`,
                types: [{
                    description: 'File',
                    accept: { [blob.type]: [`.${extension}`] },
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
        } else {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${suggestedName}.${extension}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    } catch (err: any) {
        if (err.name !== 'AbortError') {
            console.error('Failed to save file:', err);
            alert('Failed to save file.');
        }
    }
};

type ViewMode = 'EDITOR' | 'CANVAS' | 'VOLUMES';

export default function App() {
    // Load autosave data
    const [initialData] = useState(() => {
        if (typeof window === 'undefined') return null;
        try {
            const saved = localStorage.getItem('SOAP_PROJECT_AUTOSAVE');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            console.error("Failed to load autosave", e);
            return null;
        }
    });

    // App State
    const [viewMode, setViewMode] = useState<ViewMode>('EDITOR');
    const [projectName, setProjectName] = useState(initialData?.projectName || "New Project");
    const [rooms, setRooms] = useState<Room[]>(initialData?.rooms || []);
    const [connections, setConnections] = useState<Connection[]>(initialData?.connections || []);
    const [zoneColors, setZoneColors] = useState<Record<string, ZoneColor>>(initialData?.zoneColors || ZONE_COLORS);
    const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>(initialData?.referenceImages || []);
    const [referenceScaleState, setReferenceScaleState] = useState<ReferenceScaleState | null>(null);
    const [selectedReferenceImageId, setSelectedReferenceImageId] = useState<string | null>(null);

    // API Key State
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('SOAP_GEMINI_KEY') || import.meta.env.VITE_GEMINI_API_KEY || "");
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showHelpModal, setShowHelpModal] = useState(false);
    const [showAboutModal, setShowAboutModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [isAiLayoutLoading, setIsAiLayoutLoading] = useState(false);

    // Sketch State
    const [annotations, setAnnotations] = useState<Annotation[]>(initialData?.annotations || []);
    const [isSketchMode, setIsSketchMode] = useState(false);
    const [isReferenceMode, setIsReferenceMode] = useState(false);
    const [activeSketchType, setActiveSketchType] = useState<AnnotationType | 'eraser' | 'select'>('select');
    const [sketchProperties, setSketchProperties] = useState({
        stroke: '#f97316',
        strokeWidth: 2,
        strokeDash: '',
        startCap: 'none' as ArrowCapType,
        endCap: 'none' as ArrowCapType,
        fillet: 0,
        fontSize: 16,
        fontFamily: 'sans-serif',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none'
    });
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

    const selectedAnnotation = useMemo(() => annotations.find(a => a.id === selectedAnnotationId), [annotations, selectedAnnotationId]);


    const [appSettings, setAppSettings] = useState<AppSettings>(initialData?.appSettings || {
        zoneTransparency: 0.5,
        zonePadding: 10,
        strokeWidth: 2,
        cornerRadius: 12,
        fontSize: 12,
        snapTolerance: 10,
        snapToGrid: true,
        snapToObjects: true,
        snapWhileScaling: false
    });

    // View State
    const [floors, setFloors] = useState(initialData?.floors || FLOORS);
    const [currentFloor, setCurrentFloor] = useState(initialData?.currentFloor || 0);
    const [viewport, setViewport] = useState({
        scale: 1,
        offset: { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    });
    const { scale, offset } = viewport;

    const toWorld = useCallback((x: number, y: number) => {
        if (!mainRef.current) return { x: 0, y: 0 };
        const rect = mainRef.current.getBoundingClientRect();
        return {
            x: (x - rect.left - offset.x) / scale,
            y: (y - rect.top - offset.y) / scale
        };
    }, [offset.x, offset.y, scale]);

    const toScreen = useCallback((x: number, y: number) => {
        if (!mainRef.current) return { x: 0, y: 0 };
        const rect = mainRef.current.getBoundingClientRect();
        return {
            x: x * scale + offset.x + rect.left,
            y: y * scale + offset.y + rect.top
        };
    }, [offset.x, offset.y, scale]);
    const [is3DMode, setIs3DMode] = useState(false);
    const [currentStyle, setCurrentStyle] = useState<DiagramStyle>(DIAGRAM_STYLES[0]);
    const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
    const [selectedZone, setSelectedZone] = useState<string | null>(null);
    const [volumesViewState, setVolumesViewState] = useState<{
        cameraPosition: [number, number, number];
        target: [number, number, number];
        zoom: number;
        viewType: 'perspective' | 'isometric';
        hasInitialZoomed: boolean;
    }>({
        cameraPosition: [-300, -300, 300],
        target: [0, 0, 0],
        zoom: 1.5,
        viewType: 'perspective',
        hasInitialZoomed: false
    });

    const [cameraVersion, setCameraVersion] = useState(0);

    const volumesViewRef = useRef<VolumesViewHandle>(null);

    // Extracted Handlers for Volumes View (to avoid conditional hook calls)
    const handleViewStateChange = useCallback((updates: any, incrementVersion = false) => {
        setVolumesViewState(prev => ({ ...prev, ...updates }));
        if (incrementVersion) {
            setCameraVersion(v => v + 1);
        }
    }, []);

    const handleVolumeRoomSelect = useCallback((id: string | null, multi: boolean) => {
        if (id === null) {
            setSelectedRoomIds(new Set());
            setSelectedZone(null);
            setSelectedAnnotationId(null);
            setConnectionSourceId(null);
            return;
        }
        setSelectedRoomIds(prev => {
            const next = new Set(multi ? prev : []);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        // Optional: Focus camera on room select?
        // For now, let's not force move camera on select to avoid jarring jumps
    }, []);

    // Tools State
    const [isMagnetMode, setIsMagnetMode] = useState(false);
    const [showGrid, setShowGrid] = useState(true);
    const [snapEnabled, setSnapEnabled] = useState(true);
    const GRID_SIZES = [0.5, 1, 2, 5, 10];
    const [gridSizeIndex, setGridSizeIndex] = useState(2); // Default 2m
    const gridSize = GRID_SIZES[gridSizeIndex];

    // UI State
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
    const [isInventoryOpen, setIsInventoryOpen] = useState(true);
    const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
    const [snapGuides, setSnapGuides] = useState<{ x?: number, y?: number } | null>(null);
    const [floorOverlays, setFloorOverlays] = useState<Record<number, number | null>>(initialData?.floorOverlays || {});
    const activeOverlayFloorId = floorOverlays[currentFloor] ?? null;
    const [isOverlaySelectorOpen, setIsOverlaySelectorOpen] = useState(false);
    const [isZoneDragging, setIsZoneDragging] = useState(false);
    const [isBubbleDragging, setIsBubbleDragging] = useState(false);
    const [isInventoryHovered, setIsInventoryHovered] = useState(false);
    const [editingFloorId, setEditingFloorId] = useState<number | null>(null);
    const [hasInitialZoomed, setHasInitialZoomed] = useState(false);
    const [floorGap, setFloorGap] = useState(4);
    const [hiddenFloorIds, setHiddenFloorIds] = useState<Set<number>>(new Set());
    const [showVolumeLabels, setShowVolumeLabels] = useState(true);
    const [volumeLabelFontSize, setVolumeLabelFontSize] = useState(11);

    const roomsRef = useRef(rooms);
    roomsRef.current = rooms;

    const overlaySelectorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOverlaySelectorOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (overlaySelectorRef.current && !overlaySelectorRef.current.contains(event.target as Node)) {
                setIsOverlaySelectorOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOverlaySelectorOpen]);


    // Dark Mode Local State
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('SOAP_DARK_MODE') === 'true';
        }
        return false;
    });

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('SOAP_DARK_MODE', 'true');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('SOAP_DARK_MODE', 'false');
        }
    }, [darkMode]);

    // Debounced Auto-save
    useEffect(() => {
        const timer = setTimeout(() => {
            const saveData = {
                projectName,
                rooms,
                connections,
                zoneColors,
                appSettings,
                floors,
                currentFloor,
                annotations,
                referenceImages,
                floorOverlays
            };
            localStorage.setItem('SOAP_PROJECT_AUTOSAVE', JSON.stringify(saveData));
            console.log("Project auto-saved (debounced)");
        }, 500);

        return () => clearTimeout(timer);
    }, [projectName, rooms, connections, zoneColors, appSettings, floors, currentFloor, annotations, referenceImages, floorOverlays]);

    // --- 3D / Volumes View Computations ---
    const verticalConnections = useMemo(() => {
        const vconns: VerticalConnection[] = [];
        connections.forEach(conn => {
            const from = rooms.find(r => r.id === conn.fromId);
            const to = rooms.find(r => r.id === conn.toId);
            if (from && to && from.floor !== to.floor) {
                vconns.push({
                    id: conn.id,
                    fromId: conn.fromId,
                    toId: conn.toId,
                    fromFloor: from.floor,
                    toFloor: to.floor
                });
            }
        });
        return vconns;
    }, [connections, rooms]);

    // --- History System ---
    const [history, setHistory] = useState<{
        rooms: Room[];
        connections: Connection[];
        floors: typeof floors;
        zoneColors: Record<string, ZoneColor>;
        projectName: string;
        annotations: Annotation[];
        referenceImages: ReferenceImage[];
    }[]>([]);
    const [future, setFuture] = useState<{
        rooms: Room[];
        connections: Connection[];
        floors: typeof floors;
        zoneColors: Record<string, ZoneColor>;
        projectName: string;
        annotations: Annotation[];
        referenceImages: ReferenceImage[];
    }[]>([]);

    const addToHistory = useCallback(() => {
        setHistory(prev => {
            const newHistory = [...prev, { rooms, connections, floors, zoneColors, projectName, annotations, referenceImages }];
            if (newHistory.length > 50) newHistory.shift();
            return newHistory;
        });
        setFuture([]);
    }, [rooms, connections, floors, zoneColors, projectName, annotations, referenceImages]);

    const undo = useCallback(() => {
        if (history.length === 0) return;
        const previous = history[history.length - 1];
        const newHistory = history.slice(0, -1);

        setFuture(prev => [{ rooms, connections, floors, zoneColors, projectName, annotations, referenceImages }, ...prev]);

        setRooms(previous.rooms);
        setConnections(previous.connections);
        setFloors(previous.floors);
        setZoneColors(previous.zoneColors);
        setProjectName(previous.projectName);
        setAnnotations(previous.annotations || []);
        setReferenceImages(previous.referenceImages || []);
        setHistory(newHistory);
    }, [history, rooms, connections, floors, zoneColors, projectName, annotations, referenceImages]);

    const redo = useCallback(() => {
        if (future.length === 0) return;
        const next = future[0];
        const newFuture = future.slice(1);

        setHistory(prev => [...prev, { rooms, connections, floors, zoneColors, projectName, annotations, referenceImages }]);

        setRooms(next.rooms);
        setConnections(next.connections);
        setFloors(next.floors);
        setZoneColors(next.zoneColors);
        setProjectName(next.projectName);
        setAnnotations(next.annotations || []);
        setReferenceImages(next.referenceImages || []);
        setFuture(newFuture);
    }, [future, rooms, connections, floors, zoneColors, projectName, annotations, referenceImages]);

    // Clear selection when exiting reference mode
    useEffect(() => {
        if (!isReferenceMode) {
            setSelectedReferenceImageId(null);
        }
    }, [isReferenceMode]);

    // Clear selection when exiting sketch mode
    useEffect(() => {
        if (!isSketchMode) {
            setSelectedAnnotationId(null);
        }
    }, [isSketchMode]);

    const handleResetProject = () => {
        if (window.confirm("Are you sure you want to reset the project? This will clear all data and cannot be undone.")) {
            localStorage.removeItem('SOAP_PROJECT_AUTOSAVE');
            setProjectName("New Project");
            setRooms([]);
            setConnections([]);
            setFloors(FLOORS);
            setCurrentFloor(0);
            setZoneColors(ZONE_COLORS);
            setHistory([]);
            setFuture([]);
            setAnnotations([]);
            setReferenceImages([]);
        }
    };

    // --- Utilities ---
    const getSnappedPosition = useCallback((room: Room, excludeId: string) => {
        if (!room) return { x: 0, y: 0 };

        if (!snapEnabled) {
            setSnapGuides(null);
            return { x: room.x, y: room.y };
        }
        if (!excludeId) {
            setSnapGuides(null);
            return { x: room.x, y: room.y };
        }
        const threshold = appSettings.snapTolerance;
        let snappedX = room.x;
        let snappedY = room.y;
        let activeGuideX: number | undefined;
        let activeGuideY: number | undefined;

        const currentRooms = roomsRef.current || [];
        const overlayId = floorOverlays[currentFloor] ?? null;
        const otherRooms = currentRooms.filter(r => r.isPlaced && r.id !== excludeId && (r.floor === currentFloor || (overlayId !== null && r.floor === overlayId)));

        if (appSettings.snapToObjects) {
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
        }

        if (appSettings.snapToGrid && !activeGuideX && !activeGuideY) {
            // Fallback to grid snapping if no object snap
            // (Already handled by snapPixelUnit in Bubble, but for whole room drag we might want it here too if we want grid snap)
        }

        const newGuides = activeGuideX || activeGuideY ? { x: activeGuideX, y: activeGuideY } : null;
        setSnapGuides(prev => {
            if (!prev && !newGuides) return prev;
            if (prev && newGuides && prev.x === newGuides.x && prev.y === newGuides.y) return prev;
            return newGuides;
        });
        return { x: snappedX, y: snappedY };
    }, [currentFloor, snapEnabled, appSettings, floorOverlays]);

    // Canvas Refs
    const mainRef = useRef<HTMLElement>(null);
    const [isPanning, setIsPanning] = useState(false);
    const inventoryRef = useRef<HTMLElement>(null);
    const prevMainRect = useRef<{ width: number, height: number } | null>(null);
    const lastMousePos = useRef<Point>({ x: 0, y: 0 });

    // Touch State
    const touchState = useRef<{
        mode: 'none' | 'pan' | 'zoom';
        startDist: number;
        startScale: number;
        startOffset: Point;
        lastCenter: Point;
    }>({ mode: 'none', startDist: 0, startScale: 1, startOffset: { x: 0, y: 0 }, lastCenter: { x: 0, y: 0 } });

    // Update offset on resize to keep center
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

    // Inventory Hover Detection during Drag
    useEffect(() => {
        if (!isZoneDragging && !isBubbleDragging) {
            setIsInventoryHovered(false);
            return;
        }

        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (inventoryRef.current) {
                const rect = inventoryRef.current.getBoundingClientRect();
                const isOver = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
                setIsInventoryHovered(isOver);
            }
        };
        window.addEventListener('mousemove', handleGlobalMouseMove);
        return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
    }, [isZoneDragging, isBubbleDragging]);

    // --- Core Handlers ---
    useEffect(() => {
        const element = mainRef.current;
        if (!element) return;

        const onWheel = (e: WheelEvent) => {
            // Only handle wheel events for the 2D canvas to avoid interfering with 3D view controls.
            if (viewMode !== 'CANVAS') {
                return;
            }

            e.preventDefault();
            const rect = element.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            setViewport(prev => {
                const { scale: currentScale, offset: currentOffset } = prev;
                const zoomSensitivity = 0.001;
                const delta = -e.deltaY * zoomSensitivity;
                const newScale = Math.min(Math.max(0.1, currentScale + delta), 5);

                const newOffsetX = mouseX - ((mouseX - currentOffset.x) / currentScale) * newScale;
                const newOffsetY = mouseY - ((mouseY - currentOffset.y) / currentScale) * newScale;

                return {
                    scale: newScale,
                    offset: { x: newOffsetX, y: newOffsetY }
                };
            });
        };

        element.addEventListener('wheel', onWheel, { passive: false });
        return () => element.removeEventListener('wheel', onWheel);
    }, [viewMode]);

    const handlePanStart = (e: React.MouseEvent) => {
        // Allow pan on Middle Button (1) OR Right Button (2)
        if (e.button === 1 || e.button === 2) {
            setIsPanning(true);
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        }
        // Left Click (0) on Background -> Deselect
        else if (e.button === 0 && e.target === mainRef.current) {
                setSelectedRoomIds(new Set());
                setSelectedZone(null);
                setSelectedAnnotationId(null);
                if (connectionSourceId) setConnectionSourceId(null);
                // Auto-lock all text when clicking empty space
                setRooms(prev => prev.map(r => r.isTextUnlocked ? { ...r, isTextUnlocked: false } : r));
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            setViewport(prev => ({
                ...prev,
                offset: { x: prev.offset.x + dx, y: prev.offset.y + dy }
            }));
        }
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (viewMode === 'VOLUMES') return;

        if (e.touches.length === 1) {
            // Single touch - Pan (if on background)
            if (e.target === mainRef.current) {
                setIsPanning(true);
                lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

                // Clear selection if background
                setSelectedRoomIds(new Set());
                setSelectedZone(null);
                setSelectedAnnotationId(null);
                if (connectionSourceId) setConnectionSourceId(null);
            }
        } else if (e.touches.length === 2) {
            // Two touch - Zoom & Pan
            setIsPanning(true);

            const t1 = e.touches[0];
            const t2 = e.touches[1];

            const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            const center = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };

            touchState.current = {
                mode: 'zoom',
                startDist: dist,
                startScale: scale,
                startOffset: { ...offset },
                lastCenter: center
            };
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (viewMode === 'VOLUMES') return;

        if (e.touches.length === 1 && isPanning) {
            const dx = e.touches[0].clientX - lastMousePos.current.x;
            const dy = e.touches[0].clientY - lastMousePos.current.y;
            setViewport(prev => ({
                ...prev,
                offset: { x: prev.offset.x + dx, y: prev.offset.y + dy }
            }));
            lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];

            const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            const center = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
            const state = touchState.current;

            if (state.mode !== 'zoom') return;

            const rect = mainRef.current?.getBoundingClientRect();
            if (!rect) return;

            // Calculate Zoom
            const scaleFactor = dist / state.startDist;
            const newScale = Math.min(Math.max(0.1, state.startScale * scaleFactor), 5);

            // Calculate Pan (movement of the center point)
            const panX = center.x - state.lastCenter.x;
            const panY = center.y - state.lastCenter.y;

            setViewport(prev => {
                // Apply Pan first
                const intermediateOffset = { x: prev.offset.x + panX, y: prev.offset.y + panY };

                // Apply Zoom around the center (relative to container)
                const relCenterX = center.x - rect.left;
                const relCenterY = center.y - rect.top;

                // Formula: newOffset = center - (center - oldOffset) * (newScale / oldScale)
                const zoomRatio = newScale / prev.scale;
                const finalOffsetX = relCenterX - (relCenterX - intermediateOffset.x) * zoomRatio;
                const finalOffsetY = relCenterY - (relCenterY - intermediateOffset.y) * zoomRatio;

                return {
                    scale: newScale,
                    offset: { x: finalOffsetX, y: finalOffsetY }
                };
            });

            touchState.current.lastCenter = center;
        }
    };

    const handleTouchEnd = () => {
        if (viewMode === 'VOLUMES') return;
        setIsPanning(false);
        touchState.current.mode = 'none';
    };

    const handleMouseUp = () => {
        setIsPanning(false);
    };

    const handleZoomToFit = useCallback(() => {
        const getCenter = () => {
            if (mainRef.current) {
                const { width, height } = mainRef.current.getBoundingClientRect();
                return { x: width / 2, y: height / 2 };
            }
            return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        };

        const currentFloorRooms = rooms.filter(r => r.isPlaced && r.floor === currentFloor);
        const currentFloorAnnotations = annotations.filter(a =>
            a.floor === currentFloor &&
            a.points && a.points.length > 0 // Ensure annotation has points
        );

        if (currentFloorRooms.length === 0 && currentFloorAnnotations.length === 0) {
            setViewport({
                scale: 1,
                offset: getCenter()
            });
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        currentFloorRooms.forEach(r => {
            if (r.polygon && r.polygon.length > 0) {
                r.polygon.forEach(p => {
                    minX = Math.min(minX, r.x + p.x);
                    minY = Math.min(minY, r.y + p.y);
                    maxX = Math.max(maxX, r.x + p.x);
                    maxY = Math.max(maxY, r.y + p.y);
                });
            } else if (!r.polygon) {
                minX = Math.min(minX, r.x);
                minY = Math.min(minY, r.y);
                maxX = Math.max(maxX, r.x + r.width);
                maxY = Math.max(maxY, r.y + r.height);
            }
        });

        currentFloorAnnotations.forEach(a => {
            if (!a.points) return;
            a.points.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
        });

        // If bounds are still infinite (e.g. empty points arrays), reset view
        if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
            setViewport({ scale: 1, offset: getCenter() });
            return;
        }

        const padding = 100;
        const contentWidth = maxX - minX + padding * 2;
        const contentHeight = maxY - minY + padding * 2;

        if (mainRef.current) {
            const { width, height } = mainRef.current.getBoundingClientRect();
            const scaleX = width / contentWidth;
            const scaleY = height / contentHeight;
            const newScale = Math.min(Math.min(scaleX, scaleY), 2);
            const newOffsetX = (width / 2) - ((minX + maxX) / 2) * newScale;
            const newOffsetY = (height / 2) - ((minY + maxY) / 2) * newScale;
            setViewport({
                scale: newScale,
                offset: { x: newOffsetX, y: newOffsetY }
            });
        }
    }, [rooms, annotations, currentFloor]);

    // Resize Observer for Canvas
    useEffect(() => {
        if (!mainRef.current) return;

        // Initialize prevRect
        const { width, height } = mainRef.current.getBoundingClientRect();
        prevMainRect.current = { width, height };

        const resizeObserver = new ResizeObserver(() => {
            if (!mainRef.current || !prevMainRect.current) return;
            const { width: newW, height: newH } = mainRef.current.getBoundingClientRect();
            const { width: oldW, height: oldH } = prevMainRect.current;

            // Adjust offset to keep the center of the view stable
            setViewport(prev => ({
                ...prev,
                offset: {
                    x: prev.offset.x + (newW - oldW) / 2,
                    y: prev.offset.y + (newH - oldH) / 2
                }
            }));

            prevMainRect.current = { width: newW, height: newH };
        });
        resizeObserver.observe(mainRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) redo();
                else undo();
                e.preventDefault();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                redo();
                e.preventDefault();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                handleZoomToFit();
            } else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                // Do not hijack tab if user is in an input field.
                const activeEl = document.activeElement;
                const inInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

                if (!inInput) {
                    e.preventDefault();
                    setViewMode(prev => {
                        if (prev === 'EDITOR') return 'CANVAS';
                        if (prev === 'CANVAS') return 'VOLUMES';
                        return 'EDITOR';
                    });
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, handleZoomToFit]);

    // Auto-zoom when switching to Canvas
    useEffect(() => {
        if (viewMode === 'CANVAS' && !hasInitialZoomed) {
            const timer = setTimeout(() => {
                handleZoomToFit();
                setHasInitialZoomed(true);
            }, 50);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode, hasInitialZoomed]);

    const handlePlaceCenter = (room: Room) => {
        addToHistory();
        if (mainRef.current) {
            const rect = mainRef.current.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            // Convert to World Coordinates
            const worldX = (centerX - offset.x) / scale - room.width / 2;
            const worldY = (centerY - offset.y) / scale - room.height / 2;

            updateRoom(room.id, { isPlaced: true, floor: currentFloor, x: worldX, y: worldY });
            setSelectedRoomIds(new Set([room.id]));
        }
    };

    const handleAddFloor = () => {
        addToHistory();
        const newId = floors.length > 0 ? Math.max(...floors.map(f => f.id)) + 1 : 0;
        const newFloor = { id: newId, label: `Floor ${newId}` };
        setFloors([...floors, newFloor]);
        setCurrentFloor(newId);
    };

    const handleDeleteFloor = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        addToHistory();
        // Return rooms to inventory
        setRooms(prev => prev.map(r => r.floor === id ? { ...r, isPlaced: false } : r));

        const newFloors = floors.filter(f => f.id !== id);
        setFloors(newFloors);

        if (currentFloor === id) {
            if (newFloors.length > 0) {
                const deletedIndex = floors.findIndex(f => f.id === id);
                const newIndex = Math.max(0, deletedIndex - 1);
                setCurrentFloor(newFloors[newIndex].id);
            } else {
                // If all floors deleted, create a default one
                const defaultFloor = { id: 0, label: 'Ground Floor' };
                setFloors([defaultFloor]);
                setCurrentFloor(0);
            }
        }
    };

    const handleRenameFloor = (id: number, newName: string) => {
        setFloors(prev => prev.map(f => f.id === id ? { ...f, label: newName } : f));
    };

    const handleUpdateFloor = (id: number, updates: Partial<Floor>) => {
        addToHistory();
        setFloors(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
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

    const handleInventoryDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleInventoryDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const roomId = e.dataTransfer.getData('roomId');
        if (roomId) {
            updateRoom(roomId, { isPlaced: false });
            setSelectedRoomIds(new Set());
        }
    };

    const handleAddZone = (name: string) => {
        addToHistory();
        if (zoneColors[name] || !name.trim()) return;
        // Assign a random color style from existing ones for now
        const randomStyle = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
        setZoneColors(prev => ({ ...prev, [name]: randomStyle }));
    };

    const handleAutoArrange = () => {
        addToHistory();
        setRooms(prev => {
            // Sort rooms by Zone then Area (descending) before passing to layout engine
            const sortedRooms = [...prev].sort((a, b) => {
                // Primary: Zone
                if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
                // Secondary: Area (Largest first)
                return b.area - a.area;
            });
            return arrangeRooms(sortedRooms, currentFloor);
        });
        setRooms(prev => arrangeRooms(prev, currentFloor));
    };

    const handleAiSpatialLayout = async () => {
        if (!apiKey) {
            setShowApiKeyModal(true);
            return;
        }

        // Select rooms to arrange: either currently selected, or all unplaced/current floor rooms
        const roomsToArrange = selectedRoomIds.size > 0
            ? rooms.filter(r => selectedRoomIds.has(r.id))
            : rooms.filter(r => r.floor === currentFloor || !r.isPlaced);

        if (roomsToArrange.length === 0) return;

        // Identify fixed rooms (placed rooms that are NOT in roomsToArrange)
        const fixedRooms = rooms.filter(r => 
            r.isPlaced && 
            !roomsToArrange.some(rta => rta.id === r.id)
        );

        setIsAiLayoutLoading(true);
        try {
            // Convert fixed rooms to meters for the AI context
            const fixedSpacesForAi = fixedRooms.map(r => ({
                id: r.id,
                name: r.name,
                x: r.x / PIXELS_PER_METER,
                y: r.y / PIXELS_PER_METER,
                width: r.width / PIXELS_PER_METER,
                height: r.height / PIXELS_PER_METER,
                zone: r.zone,
                floor: r.floor
            }));

            const floorsForAi = floors.map(f => ({ id: f.id, label: f.label }));

            const layout = await generateSpatialLayout(
                roomsToArrange.map(r => ({ id: r.id, name: r.name, area: r.area, zone: r.zone })), 
                fixedSpacesForAi,
                floorsForAi,
                apiKey
            );
            
            addToHistory();
            setRooms(prev => prev.map(r => {
                const match = layout.find(l => l.id === r.id);
                if (match) {
                    return { ...r, x: match.x * PIXELS_PER_METER, y: match.y * PIXELS_PER_METER, width: match.width * PIXELS_PER_METER, height: match.height * PIXELS_PER_METER, isPlaced: true, floor: match.floor };
                }
                return r;
            }));
        } catch (error) {
            console.error("AI Layout failed:", error);
            alert("Failed to generate AI layout. Please check your API key and try again.");
        } finally {
            setIsAiLayoutLoading(false);
        }
    };

    const handleClearCanvas = () => {
        addToHistory();
        if (window.confirm("Are you sure you want to clear the canvas and return all spaces to the inventory?")) {
            setRooms(prev => prev.map(r => ({ ...r, isPlaced: false })));
            setSelectedRoomIds(new Set());
            setSelectedZone(null);
        }
    };

    const handleImportProject = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target?.result as string;

                // Handle CSV Import
                if (file.name.toLowerCase().endsWith('.csv')) {
                    const lines = content.split('\n');
                    const newRooms: Room[] = [];
                    // Skip header if present (simple check)
                    const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;

                    for (let i = startIndex; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;
                        // Expecting: Name, Area, Zone
                        const parts = line.split(',');
                        if (parts.length >= 2) {
                            const name = parts[0].trim();
                            const area = parseFloat(parts[1].trim());
                            const zone = parts[2]?.trim() || 'Default';

                            if (name && !isNaN(area)) {
                                const side = Math.sqrt(area) * PIXELS_PER_METER;
                                newRooms.push({
                                    id: `room-${Date.now()}-${i}`,
                                    name,
                                    area,
                                    zone,
                                    isPlaced: false,
                                    floor: 0,
                                    x: 0, y: 0,
                                    width: side,
                                    height: side
                                });
                            }
                        }
                    }
                    if (newRooms.length > 0) {
                        addToHistory();
                        setRooms(prev => [...prev, ...newRooms]);
                        alert(`Imported ${newRooms.length} spaces from CSV.`);
                    } else {
                        alert("No valid spaces found in CSV.");
                    }
                    return;
                }

                const data = JSON.parse(content);

                if (data.rooms && Array.isArray(data.rooms)) {
                    addToHistory();
                    if (data.projectName) setProjectName(data.projectName);
                    setRooms(data.rooms);
                    if (data.connections) setConnections(data.connections);
                    if (data.floors) setFloors(data.floors);
                    if (data.currentFloor !== undefined) setCurrentFloor(data.currentFloor);
                    if (data.zoneColors) setZoneColors(data.zoneColors);
                    if (data.appSettings) setAppSettings(data.appSettings);
                    if (data.referenceImages) setReferenceImages(data.referenceImages);
                    if (data.floorOverlays) setFloorOverlays(data.floorOverlays);

                    setHasInitialZoomed(false);
                    setViewMode('CANVAS');
                } else {
                    alert("Invalid project file.");
                }
            } catch (error) {
                console.error("Failed to import project:", error);
                alert("Failed to import project file.");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // --- Room Handlers ---
    const updateRoom = useCallback((id: string, updates: Partial<Room>) => {
        setRooms(prev => prev.map(r => {
            if (r.id !== id) return r;

            const updatedRoom = { ...r, ...updates };

            // Auto-resize bubble if Area changes without explicit dimension updates
            // Only applies to standard bubbles (no polygon)
            if (updates.area !== undefined &&
                updates.width === undefined &&
                updates.height === undefined &&
                !r.polygon &&
                !updates.polygon) {

                const side = Math.sqrt(Math.max(0, updates.area)) * PIXELS_PER_METER;
                updatedRoom.width = side;
                updatedRoom.height = side;
            }

            return updatedRoom;
        }));
    }, []);

    const handleMoveRoom = useCallback((id: string, x: number, y: number) => {
        setRooms(prev => {
            const leader = prev.find(r => r.id === id);
            if (!leader) return prev;

            const dx = x - leader.x;
            const dy = y - leader.y;

            if (dx === 0 && dy === 0) return prev;

            if (selectedRoomIds.has(id) && selectedRoomIds.size > 1) {
                return prev.map(r => {
                    if (selectedRoomIds.has(r.id) && r.floor === currentFloor && r.isPlaced) {
                        return { ...r, x: r.x + dx, y: r.y + dy };
                    }
                    return r;
                });
            } else {
                return prev.map(r => r.id === id ? { ...r, x, y } : r);
            }
        });
    }, [selectedRoomIds, currentFloor]);

    const deleteRoom = useCallback((id: string) => {
        addToHistory();
        setRooms(prev => prev.filter(r => r.id !== id));
        setSelectedRoomIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, [addToHistory]);

    const addRoom = useCallback((roomData: Partial<Room>) => {
        addToHistory();
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
    }, [addToHistory]);

    const updateAnnotation = useCallback((id: string, updates: Partial<Annotation>) => {
        setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    }, []);

    const handleAnnotationPropertyChange = (key: string, value: any) => {
        if (selectedAnnotationId) {
            addToHistory();
            updateAnnotation(selectedAnnotationId, { style: { ...selectedAnnotation!.style, [key]: value } });
        } else {
            setSketchProperties(prev => ({ ...prev, [key]: value }));
        }
    };

    const handleZIndex = (action: 'front' | 'back') => {
        if (!selectedAnnotationId) return;
        addToHistory();
        setAnnotations(prev => {
            const index = prev.findIndex(a => a.id === selectedAnnotationId);
            if (index === -1) return prev;
            const item = prev[index];
            const newArr = [...prev];
            newArr.splice(index, 1);
            if (action === 'front') newArr.push(item);
            else newArr.unshift(item);
            return newArr;
        });
    };

    const handleImportReference = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Support Images
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const url = event.target?.result as string;
                const img = new Image();
                img.onload = () => {
                    const newImage: ReferenceImage = {
                        id: `ref-${Date.now()}`,
                        url,
                        name: file.name,
                        x: 0,
                        y: 0,
                        width: img.width,
                        height: img.height,
                        scale: 1,
                        rotation: 0,
                        opacity: 0.5,
                        isLocked: false,
                        floor: currentFloor
                    };
                    addToHistory();
                    setReferenceImages(prev => [...prev, newImage]);
                };
                img.src = url;
            };
            reader.readAsDataURL(file);
        } else if (file.type === 'application/pdf') {
            alert("PDF support coming soon! Please use PNG/JPG for now.");
        }

        e.target.value = '';
    };

    const handleUpdateReferenceImage = useCallback((id: string, updates: Partial<ReferenceImage>) => {
        setReferenceImages(prev => prev.map(img => img.id === id ? { ...img, ...updates } : img));
    }, []);

    const handleDeleteReferenceImage = (id: string) => {
        addToHistory();
        setReferenceImages(prev => prev.filter(img => img.id !== id));
        if (selectedReferenceImageId === id) setSelectedReferenceImageId(null);
    };

    const handleScalingPointClick = (p: Point) => {
        if (!referenceScaleState) return;

        if (referenceScaleState.step === 'point1') {
            setReferenceScaleState({ ...referenceScaleState, points: [p], step: 'point2' });
        } else if (referenceScaleState.step === 'point2') {
            // Add the second point immediately to show the line
            const newPoints = [referenceScaleState.points[0], p];
            setReferenceScaleState({ ...referenceScaleState, points: newPoints });

            // Delay the prompt slightly to allow React to render the line
            setTimeout(() => {
                const p1 = newPoints[0];
                const p2 = newPoints[1];
                const distPx = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

                const input = window.prompt("Enter real-world distance between points (meters):");
                if (input) {
                    const distMeters = parseFloat(input);
                    if (!isNaN(distMeters) && distMeters > 0) {
                        const img = referenceImages.find(i => i.id === referenceScaleState.imageId);
                        if (img) {
                            const targetPx = distMeters * PIXELS_PER_METER;
                            const newScale = (img.scale * targetPx) / distPx;
                            addToHistory();
                            handleUpdateReferenceImage(img.id, { scale: newScale });
                        }
                    }
                }
                setReferenceScaleState(null);
            }, 50);
        }
    };

    const deleteAnnotation = useCallback((id: string) => {
        addToHistory();
        setAnnotations(prev => prev.filter(a => a.id !== id));
    }, [addToHistory]);

    const handleSaveApiKey = (key: string) => {
        setApiKey(key);
        localStorage.setItem('SOAP_GEMINI_KEY', key);
    };

    const toggleLink = useCallback((roomId: string) => {
        if (connectionSourceId === roomId) {
            setConnectionSourceId(null);
        } else if (connectionSourceId) {
            setConnections(prev => {
                const existing = prev.find(c =>
                    (c.fromId === connectionSourceId && c.toId === roomId) ||
                    (c.fromId === roomId && c.toId === connectionSourceId)
                );
                if (!existing) {
                    return [...prev, {
                        id: `conn-${Date.now()}`,
                        fromId: connectionSourceId,
                        toId: roomId
                    }];
                } else {
                    return prev.filter(c => c.id !== existing.id);
                }
            });
            setConnectionSourceId(null);
        } else {
            setConnectionSourceId(roomId);
        }
    }, [connectionSourceId]);

    const toggleFloorVisibility = useCallback((floorId: number) => {
        setHiddenFloorIds(prev => {
            const next = new Set(prev);
            if (next.has(floorId)) {
                next.delete(floorId);
            } else {
                next.add(floorId);
            }
            return next;
        });
    }, []);

    // --- Zone Handlers ---
    const handleZoneDrag = useCallback((zone: string, dx: number, dy: number) => {
        setRooms(prev => prev.map(r => {
            if (r.zone === zone && r.floor === currentFloor && r.isPlaced) {
                return { ...r, x: r.x + dx, y: r.y + dy };
            }
            return r;
        }));
    }, [currentFloor]);

    const handleZoneClick = useCallback((z: string) => {
        setSelectedZone(z);
        setSelectedRoomIds(new Set());
    }, []);

    const renameZone = useCallback((oldZone: string, newZone: string) => {
        addToHistory();
        if (!newZone.trim()) return;
        setRooms(prev => prev.map(r => r.zone === oldZone ? { ...r, zone: newZone } : r));
        setSelectedZone(newZone);
    }, [addToHistory]);

    const handleBubbleDragEnd = useCallback((room: Room, e: MouseEvent) => {
        setIsBubbleDragging(false);
        if (!room || !e) return;

        if (inventoryRef.current) {
            const rect = inventoryRef.current.getBoundingClientRect();
            if (
                e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom
            ) {
                if (selectedRoomIds.has(room.id) && selectedRoomIds.size > 1) {
                    setRooms(prev => prev.map(r => selectedRoomIds.has(r.id) ? { ...r, isPlaced: false } : r));
                    setSelectedRoomIds(new Set());
                } else {
                    updateRoom(room.id, { isPlaced: false });
                    setSelectedRoomIds(new Set());
                }
            }
        }
    }, [updateRoom, selectedRoomIds]);

    const handleZoneDragEnd = useCallback((e: MouseEvent) => {
        setIsZoneDragging(false);
        if (selectedZone && inventoryRef.current) {
            const rect = inventoryRef.current.getBoundingClientRect();
            if (
                e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom
            ) {
                // Return zone to inventory
                addToHistory();
                setRooms(prev => prev.map(r => {
                    if (r.zone === selectedZone && r.floor === currentFloor) {
                        return { ...r, isPlaced: false };
                    }
                    return r;
                }));
                setSelectedZone(null);
            }
        }
    }, [selectedZone, currentFloor, addToHistory]);

    // --- Render Helpers ---
    const selectedRoom = rooms.find(r => selectedRoomIds.has(r.id));
    const selectedRoomsList = rooms.filter(r => selectedRoomIds.has(r.id));

    // Multi-selection stats
    const isMultiSelection = selectedRoomIds.size > 1;
    const multiSelectionStats = useMemo(() => {
        if (!isMultiSelection) return null;
        const totalArea = selectedRoomsList.reduce((acc, r) => acc + r.area, 0);
        const types = selectedRoomsList.reduce((acc, r) => {
            const type = r.shape === 'bubble' ? 'Bubble' : (r.polygon ? 'Polygon' : 'Rectangle');
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        const breakdown = Object.entries(types).map(([t, c]) => `${c} ${t}${(c as number) > 1 ? 's' : ''}`).join(', ');

        // Determine common shape state
        const firstShape = selectedRoomsList[0].shape || 'rect';
        const isMixed = selectedRoomsList.some(r => (r.shape || 'rect') !== (firstShape || 'rect'));
        const commonShape = isMixed ? null : (firstShape || 'rect');

        return { totalArea, breakdown, commonShape };
    }, [selectedRoomsList, isMultiSelection]);

    const handleMoveSelectionFloors = (direction: 1 | -1) => {
        addToHistory();
        setRooms(prev => prev.map(r => {
            if (selectedRoomIds.has(r.id)) {
                const currentIdx = floors.findIndex(f => f.id === r.floor);
                if (currentIdx === -1) return r;
                const newIdx = currentIdx + direction;
                if (newIdx >= 0 && newIdx < floors.length) {
                    return { ...r, floor: floors[newIdx].id };
                }
            }
            return r;
        }));
    };

    const handleConvertShape = (shape: 'rect' | 'polygon' | 'bubble') => {
        addToHistory();
        setRooms(prev => prev.map(r => {
            if (!selectedRoomIds.has(r.id)) return r;
            if ((r.shape || 'rect') === shape) return r;

            const roomStyle = r.style;
            const newStyle: any = { ...roomStyle };

            if (roomStyle?.fill) newStyle.fill = roomStyle.fill;
            if (roomStyle?.stroke) newStyle.stroke = roomStyle.stroke;
            if (roomStyle?.strokeWidth) newStyle.strokeWidth = roomStyle.strokeWidth;
            if (roomStyle?.opacity) newStyle.opacity = roomStyle.opacity;
            if (roomStyle?.cornerRadius) newStyle.cornerRadius = roomStyle.cornerRadius;
            if (roomStyle?.strokeDasharray) newStyle.strokeDasharray = roomStyle.strokeDasharray;

            // If the original room had no style object, newStyle might be empty, which is perfect.
            const newRoom = { ...r, shape, style: Object.keys(newStyle).length > 0 ? newStyle : undefined };

            if (shape === 'rect') {
                newRoom.polygon = undefined;
                const side = Math.sqrt(r.area) * PIXELS_PER_METER;
                newRoom.width = side;
                newRoom.height = side;
            } else {
                let points = r.polygon;
                if (!points || points.length === 0) {
                    points = [{ x: 0, y: 0 }, { x: r.width, y: 0 }, { x: r.width, y: r.height }, { x: 0, y: r.height }];
                }
                if (shape === 'bubble') {
                    const targetAreaPx = r.area * (PIXELS_PER_METER * PIXELS_PER_METER);
                    const centroid = calculateCentroid(points);
                    let scale = 0.9;
                    points = points.map(p => ({ x: centroid.x + (p.x - centroid.x) * scale, y: centroid.y + (p.y - centroid.y) * scale }));
                    for (let i = 0; i < 10; i++) {
                        const currentArea = calculateCurvedArea(points);
                        if (currentArea === 0 || Math.abs(currentArea - targetAreaPx) < 10) break;
                        const correction = Math.sqrt(targetAreaPx / currentArea);
                        points = points.map(p => ({ x: centroid.x + (p.x - centroid.x) * correction, y: centroid.y + (p.y - centroid.y) * correction }));
                    }
                }
                newRoom.polygon = points;
            }
            return newRoom;
        }));
    };

    const unplacedRooms = rooms.filter(r => !r.isPlaced);

    // Zone Stats
    const selectedZoneRooms = useMemo(() => {
        if (!selectedZone) return [];
        return rooms.filter(r => r.zone === selectedZone);
    }, [rooms, selectedZone]);

    const zoneArea = selectedZoneRooms.reduce((acc, r) => acc + r.area, 0);



    const handleSave = async (format: 'json' | 'png' | 'pdf' | 'obj' | 'csv', options?: any) => {
        setShowExportModal(false);
        const name = options?.filename || projectName || 'project';
        const finalName = name.trim().replace(/[\\/:"*?<>|]/g, '_'); // Sanitize filename

        if (format === 'json') {
            const data = {
                projectName,
                rooms,
                connections,
                floors,
                currentFloor,
                zoneColors,
                appSettings,
                referenceImages,
                floorOverlays,
                annotations
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            await saveFile(blob, finalName, 'json');
        } else if (format === 'csv') {
            const headers = "Name,Area,Zone,Floor\n";
            const csvContent = rooms.map(r => `${r.name},${r.area},${r.zone},${floors.find(f => f.id === r.floor)?.label || 'Unplaced'}`).join('\n');
            const blob = new Blob([headers + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${finalName}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } else if (format === 'obj') {
            if (volumesViewRef.current) {
                const blob = volumesViewRef.current.exportOBJ();
                if (blob) {
                    await saveFile(blob, finalName, 'obj');
                } else {
                    alert("Failed to export 3D model.");
                }
            }
        } else if (format === 'png') {
            try {
                if (viewMode === 'VOLUMES' && volumesViewRef.current) {
                    const blob = await volumesViewRef.current.captureScreenshot();
                    if (blob) await saveFile(blob, finalName, 'png');
                } else if ((viewMode === 'CANVAS' || viewMode === 'EDITOR') && mainRef.current) {
                    const scale = options?.scale || 2;
                    const blob = await htmlToImage.toBlob(mainRef.current, {
                        pixelRatio: scale,
                        filter: (node) => {
                            // Exclude UI elements
                            if (node.classList && node.classList.contains('export-exclude')) return false;
                            // Exclude Grid if transparent background is requested
                            if (options?.transparentBackground && node.classList && node.classList.contains('grid-layer')) return false;
                            return true;
                        },
                        backgroundColor: options?.transparentBackground ? null : (darkMode ? '#020617' : '#f0f2f5'),
                        style: options?.transparentBackground ? { backgroundColor: 'rgba(0,0,0,0)' } : undefined
                    });
                    if (blob) await saveFile(blob, finalName, 'png');
                }
            } catch (err) {
                console.error("Image export failed", err);
                alert("Failed to export image.");
            }
        } else if (format === 'pdf') {
            const blob = await handleExport(format, finalName, rooms, connections, currentFloor, darkMode, zoneColors, floors, appSettings, annotations, options, currentStyle, referenceImages);
            if (blob) await saveFile(blob, finalName, 'pdf');
        }
    };

    const getCanvasPreview = useCallback(async (options?: any) => {
        if (viewMode === 'VOLUMES' && volumesViewRef.current) {
            const blob = await volumesViewRef.current.captureScreenshot();
            return blob ? URL.createObjectURL(blob) : null;
        } else if ((viewMode === 'CANVAS' || viewMode === 'EDITOR') && mainRef.current) {
            try {
                const pixelRatio = 0.5;
                const dataUrl = await htmlToImage.toPng(mainRef.current, {
                    pixelRatio, // Low res for preview
                    filter: (node) => {
                        if (node.classList && node.classList.contains('export-exclude')) return false;
                        return true;
                    },
                    backgroundColor: darkMode ? '#020617' : '#f0f2f5' // Preview with background
                });

                // If PDF options are present, draw the page boundary
                if (options && options.pageSize && options.pdfScale) {
                    return new Promise<string>((resolve) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) {
                                resolve(dataUrl);
                                return;
                            }

                            // Draw the screenshot
                            ctx.drawImage(img, 0, 0);

                            // Calculate Content Bounds
                            const placedRooms = rooms.filter(r => r.isPlaced && r.floor === currentFloor);
                            if (placedRooms.length > 0) {
                                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                                placedRooms.forEach(r => {
                                    if (r.polygon && r.polygon.length > 0) {
                                        r.polygon.forEach(p => {
                                            minX = Math.min(minX, r.x + p.x);
                                            minY = Math.min(minY, r.y + p.y);
                                            maxX = Math.max(maxX, r.x + p.x);
                                            maxY = Math.max(maxY, r.y + p.y);
                                        });
                                    } else {
                                        minX = Math.min(minX, r.x);
                                        minY = Math.min(minY, r.y);
                                        maxX = Math.max(maxX, r.x + r.width);
                                        maxY = Math.max(maxY, r.y + r.height);
                                    }
                                });

                                const centerX = (minX + maxX) / 2;
                                const centerY = (minY + maxY) / 2;

                                // Calculate Page Size in World Pixels
                                const PAGE_SIZES: Record<string, [number, number]> = {
                                    'A4': [210, 297],
                                    'A3': [297, 420],
                                    'Letter': [215.9, 279.4]
                                };
                                const size = PAGE_SIZES[options.pageSize] || PAGE_SIZES['A4'];
                                let widthMm = size[0];
                                let heightMm = size[1];

                                if (options.orientation === 'landscape') {
                                    [widthMm, heightMm] = [heightMm, widthMm];
                                }

                                // 1 unit on paper = scaleFactor units in world
                                // e.g. 1:100 -> 1mm on paper = 100mm (0.1m) in world
                                const scaleFactor = options.pdfScale;
                                const worldWidthPx = (widthMm / 1000) * scaleFactor * PIXELS_PER_METER;
                                const worldHeightPx = (heightMm / 1000) * scaleFactor * PIXELS_PER_METER;

                                // Calculate Screen Coordinates (relative to container, not window)
                                // screenX = worldX * scale + offset.x
                                const worldLeft = centerX - worldWidthPx / 2;
                                const worldTop = centerY - worldHeightPx / 2;

                                const screenLeft = worldLeft * scale + offset.x;
                                const screenTop = worldTop * scale + offset.y;
                                const screenWidth = worldWidthPx * scale;
                                const screenHeight = worldHeightPx * scale;

                                // Scale to Image Coordinates (pixelRatio)
                                const rectX = screenLeft * pixelRatio;
                                const rectY = screenTop * pixelRatio;
                                const rectW = screenWidth * pixelRatio;
                                const rectH = screenHeight * pixelRatio;

                                // Draw Boundary
                                ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)';
                                ctx.lineWidth = 5 * pixelRatio;
                                ctx.setLineDash([10 * pixelRatio, 10 * pixelRatio]);
                                ctx.strokeRect(rectX, rectY, rectW, rectH);

                                // Draw Label
                                ctx.fillStyle = 'rgba(255, 50, 50, 0.8)';
                                ctx.font = `bold ${12 * pixelRatio}px sans-serif`;
                                ctx.fillText(`Page Boundary (1:${scaleFactor})`, rectX + 5, rectY - 5);
                            }

                            resolve(canvas.toDataURL('image/png'));
                        };
                        img.src = dataUrl;
                    });
                }

                return dataUrl;
            } catch (e) {
                console.error("Preview generation failed", e);
                return null;
            }
        }
        return null;
    }, [viewMode, darkMode, rooms, connections, currentFloor, scale, offset]);

    return (
        <div className="h-screen w-screen flex flex-col bg-slate-50 dark:bg-dark-bg overflow-hidden font-sans selection:bg-orange-500/20 transition-colors duration-300">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
                :root, body, .font-sans { font-family: 'Inter', sans-serif; }
                input[type=number]::-webkit-inner-spin-button, 
                input[type=number]::-webkit-outer-spin-button { 
                    -webkit-appearance: none; 
                    margin: 0; 
                }
                input[type=number] {
                    -moz-appearance: textfield;
                }
                @media print {
                    header, aside, .export-exclude { display: none !important; }
                    main { position: static !important; overflow: visible !important; }
                    body { background: white !important; }
                }
            `}</style>
            {/* Premium Header */}
            <header className="h-[42px] bg-white/70 dark:bg-dark-surface/70 backdrop-blur-xl border-b border-slate-200/50 dark:border-dark-border flex items-center justify-between pr-4 shrink-0 z-40 shadow-[0_1px_10px_rgba(0,0,0,0.02)] relative transition-colors duration-300">
                <div className="flex items-center gap-4 h-full">
                    <div className="flex items-center gap-3 group cursor-pointer h-full">
                        <img src={SoapLogo} className="w-[42px] h-[42px] object-cover" alt="SOAP" />
                        <div>
                            <input className="font-black text-slate-900 dark:text-gray-100 tracking-tight leading-none bg-transparent border-none focus:outline-none focus:ring-0 w-full p-0 text-sm" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
                            <p className="text-[9px] font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest">SOAP Project</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setDarkMode(!darkMode)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${!darkMode ? 'text-slate-400 hover:text-orange-500 hover:bg-orange-50' : 'text-slate-400 hover:text-orange-400 hover:bg-white/5'}`}
                            title="Toggle Dark Mode"
                        >
                            {darkMode ? <Moon size={14} /> : <Sun size={14} />}
                        </button>
                        <button
                            onClick={() => setShowApiKeyModal(true)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${apiKey ? 'text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-white/5' : 'text-orange-500 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 shadow-lg shadow-orange-100'}`}
                            title="Gemini API Key Settings"
                        >
                            <Key size={14} />
                        </button>
                        <button onClick={() => setShowSettingsModal(true)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-white/5" title="Settings">
                            <Settings size={14} />
                        </button>
                        <button onClick={() => setShowHelpModal(true)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-white/5" title="Help">
                            <CircleHelp size={14} />
                        </button>
                        <button onClick={() => setShowAboutModal(true)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-white/5" title="About">
                            <Info size={14} />
                        </button>
                    </div>

                    <div className="h-6 w-px bg-slate-200/60 dark:bg-dark-border mx-1" />

                    <div className="flex items-center gap-1">
                        <button onClick={undo} disabled={history.length === 0} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-30" title="Undo (Ctrl+Z)">
                            <Undo2 size={14} />
                        </button>
                        <button onClick={redo} disabled={future.length === 0} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-30" title="Redo (Ctrl+Y)">
                            <Redo2 size={14} />
                        </button>
                        <div className="w-px h-3 bg-slate-200 dark:bg-dark-border mx-1" />
                        <button onClick={handleResetProject} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Reset Project">
                            <RotateCcw size={14} />
                        </button>
                    </div>
                </div>

                {/* Workspace Toggle - Centered */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="flex bg-slate-100/50 dark:bg-white/5 p-1 rounded-xl border border-slate-200/50 dark:border-dark-border shadow-sm">
                        <button
                            onClick={() => setViewMode('EDITOR')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${viewMode === 'EDITOR' ? 'bg-orange-500 text-white shadow-md' : 'text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-200/50 dark:hover:bg-white/10'}`}
                        >
                            <TableProperties size={14} /> Program
                        </button>
                        <button
                            onClick={() => setViewMode('CANVAS')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${viewMode === 'CANVAS' ? 'bg-orange-500 text-white shadow-md' : 'text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-200/50 dark:hover:bg-white/10'}`}
                        >
                            <PencilRuler size={14} /> Canvas
                        </button>
                        <button
                            onClick={() => setViewMode('VOLUMES')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${viewMode === 'VOLUMES' ? 'bg-orange-500 text-white shadow-md' : 'text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-200/50 dark:hover:bg-white/10'}`}
                        >
                            <Box size={14} /> Volumes
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setShowExportModal(true)} className="h-8 px-3 text-slate-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 group"
                    >
                        <Save size={14} className="group-hover:-translate-y-0.5" /> Save
                    </button>

                    <div className="flex items-center">
                        <label className="h-8 px-3 text-slate-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 cursor-pointer group">
                            <Download size={14} className="group-hover:-translate-y-0.5" /> Project
                            <input type="file" accept={viewMode === 'EDITOR' ? ".json,.csv" : ".json"} className="hidden" onChange={handleImportProject} />
                        </label>
                    </div>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden relative">
                <div
                    className="absolute inset-0 z-50 bg-slate-50 dark:bg-dark-bg flex flex-col"
                    style={{
                        visibility: viewMode === 'EDITOR' ? 'visible' : 'hidden',
                        pointerEvents: viewMode === 'EDITOR' ? 'auto' : 'none',
                    }}
                >
                    <ProgramEditor
                        rooms={rooms}
                        updateRoom={updateRoom}
                        deleteRoom={deleteRoom}
                        addRoom={addRoom}
                        apiKey={apiKey}
                        onSaveApiKey={handleSaveApiKey}
                        setRooms={setRooms}
                        zoneColors={zoneColors}
                        onAddZone={handleAddZone}
                        onInteractionStart={addToHistory}
                    />
                </div>

                <aside
                    ref={inventoryRef}
                    className={`${isInventoryOpen ? 'w-80' : 'w-10'} bg-white dark:bg-dark-surface border-r border-slate-200/50 dark:border-dark-border flex flex-col z-30 shadow-[10px_0_30px_rgba(0,0,0,0.02)] transition-all duration-300 ${isInventoryHovered ? 'ring-2 ring-orange-400 ring-inset bg-orange-50/30 dark:bg-orange-900/10' : ''}`}
                    onDragOver={handleInventoryDragOver}
                    onDrop={handleInventoryDrop}
                >
                    {isInventoryOpen ? (
                                <>
                                    <div className="p-6 border-b border-slate-100 dark:border-dark-border flex justify-between items-center bg-slate-50/30 dark:bg-white/5 h-20">
                                        <div>
                                            <h2 className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-1">
                                                Space Inventory
                                            </h2>
                                            <p className="text-[10px] font-bold text-slate-500 dark:text-gray-400">{unplacedRooms.length} spaces pending placement</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="w-8 h-8 flex items-center justify-center bg-slate-200/50 dark:bg-white/10 rounded-xl text-xs font-black text-slate-600 dark:text-gray-300 border border-slate-200/50 dark:border-white/5">{unplacedRooms.length}</span>
                                            <button onClick={() => setIsInventoryOpen(false)} className="text-slate-300 hover:text-slate-600 dark:text-gray-600 dark:hover:text-gray-400"><ChevronLeft size={18} /></button>
                                        </div>
                                    </div>
                                    <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-gradient-to-b from-white to-slate-50/50 dark:from-dark-surface dark:to-dark-bg">
                                        {unplacedRooms.length > 0 ? unplacedRooms.map(room => (
                                            <div
                                                key={room.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, room)}
                                                className="p-5 rounded-2xl border border-slate-100 dark:border-dark-border shadow-sm hover:shadow-xl hover:border-primary/20 hover:-translate-y-1 cursor-grab active:cursor-grabbing group bg-white dark:bg-dark-surface"
                                                onClick={() => {
                                                    /* Optional: keep click to place at center if drag fails or as alternative */
                                                    /* placeRoom(room); */
                                                }}
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <span className="font-black text-slate-800 dark:text-gray-200 text-sm tracking-tight block group-hover:text-orange-600">{room.name}</span>
                                                        <span className="text-[10px] text-slate-400 dark:text-gray-500 font-medium">Drag to canvas to place</span>
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handlePlaceCenter(room); }}
                                                        className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-white/5 flex items-center justify-center text-slate-300 dark:text-gray-500 group-hover:bg-orange-500/10 group-hover:text-orange-600 hover:scale-110 active:scale-95"
                                                    >
                                                        <Plus size={16} />
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="px-2 py-1 bg-slate-100 dark:bg-white/5 rounded-lg text-[10px] font-black text-slate-500 dark:text-gray-400 uppercase tracking-wider">{room.area} m²</span>
                                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm ${zoneColors[room.zone]?.bg || 'bg-slate-100'} ${zoneColors[room.zone]?.text || 'text-slate-500'}`}>{room.zone}</span>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="text-center py-24 opacity-30 px-10">
                                                <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6">
                                                    <Package size={32} className="text-slate-400 dark:text-gray-500" />
                                                </div>
                                                <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed text-slate-500 dark:text-gray-500">Inventory Clear<br />All elements are in the design context.</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-6 bg-slate-50/50 dark:bg-white/5 border-t border-slate-100 dark:border-dark-border">
                                        <button onClick={() => addRoom({})} className="w-full py-4 bg-white dark:bg-dark-surface border border-slate-200/80 dark:border-dark-border rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-gray-300 hover:border-orange-500 hover:text-orange-600 hover:shadow-lg flex items-center justify-center gap-3 shadow-sm group">
                                            <Plus size={18} className="group-hover:rotate-90" /> Add Manual Space
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="h-full flex flex-col items-center py-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => setIsInventoryOpen(true)}>
                                    <div className="flex-1 flex items-center justify-center">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-gray-500 whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Inventory</span>
                                    </div>
                                    <ChevronRight size={18} className="text-slate-400 mb-4" />
                                </div>
                            )}
                </aside>

                <main
                    ref={mainRef}
                    className={`flex-1 relative overflow-hidden bg-[#f0f2f5] dark:bg-dark-bg transition-colors duration-500 ${isZoneDragging ? 'no-transition' : ''}`}
                    onMouseDown={viewMode === 'VOLUMES' ? undefined : handlePanStart}
                    onMouseMove={viewMode === 'VOLUMES' ? undefined : handleMouseMove}
                    onMouseUp={viewMode === 'VOLUMES' ? undefined : handleMouseUp}
                    onContextMenu={(e) => e.preventDefault()}
                    onTouchStart={isSketchMode || viewMode === 'VOLUMES' ? undefined : handleTouchStart}
                    onTouchMove={isSketchMode || viewMode === 'VOLUMES' ? undefined : handleTouchMove}
                    onTouchEnd={isSketchMode || viewMode === 'VOLUMES' ? undefined : handleTouchEnd}
                    onDragOver={viewMode === 'VOLUMES' ? undefined : handleDragOver}
                    onDrop={viewMode === 'VOLUMES' ? undefined : handleDrop}
                    style={{
                        touchAction: 'none',
                        cursor: viewMode === 'VOLUMES' ? 'default' : (isSketchMode ? 'crosshair' : (isPanning ? 'grabbing' : 'default'))
                    }}
                >        {/* Reset selection if clicking background (unless panning) */}
                            {/* The onMouseDown handler above already handles this */}

                            {/* Grid Layer - Separate for export filtering */}
                            {viewMode !== 'VOLUMES' && showGrid && (
                                <div
                                    className="absolute inset-0 pointer-events-none grid-layer"
                                    style={{
                                        zIndex: 0,
                                        backgroundImage: `
                                            linear-gradient(to right, ${darkMode ? '#333' : '#e2e8f0'} 1px, transparent 1px),
                                            linear-gradient(to bottom, ${darkMode ? '#333' : '#e2e8f0'} 1px, transparent 1px)
                                        `,
                                        backgroundSize: `${gridSize * PIXELS_PER_METER * scale}px ${gridSize * PIXELS_PER_METER * scale}px`,
                                        backgroundPosition: `${offset.x}px ${offset.y}px`
                                    }}
                                />
                            )}

                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                opacity: viewMode === 'VOLUMES' ? 1 : 0,
                                pointerEvents: viewMode === 'VOLUMES' ? 'auto' : 'none',
                                zIndex: viewMode === 'VOLUMES' ? 10 : 0,
                            }}>
                               <ErrorBoundary fallback={
                                   <div className="flex items-center justify-center h-full text-red-500 bg-red-50 p-8 rounded-lg flex-col gap-4">
                                       <p className="font-bold text-lg">Failed to load Volumes View</p>
                                       <p className="text-sm text-red-700">Please check the console for more details.</p>
                                       <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-600 text-white rounded shadow hover:bg-red-700 transition">Reload App</button>
                                   </div>
                               }>
                                   <VolumesView
                                       ref={volumesViewRef}
                                       rooms={rooms}
                                       floors={floors}
                                       verticalConnections={verticalConnections}
                                       zoneColors={zoneColors}
                                       pixelsPerMeter={PIXELS_PER_METER}
                                       connectionSourceId={connectionSourceId}
                                       onLinkToggle={toggleLink}
                                       appSettings={appSettings}
                                       diagramStyle={currentStyle}
                                       selectedRoomIds={selectedRoomIds}
                                       darkMode={darkMode}
                                       gridSize={gridSize}
                                       viewState={volumesViewState}
                                       onViewStateChange={handleViewStateChange}
                                       onRoomSelect={handleVolumeRoomSelect}
                                       cameraVersion={cameraVersion}
                                       active={viewMode === 'VOLUMES'}
                                       floorGap={floorGap}
                                       hiddenFloorIds={hiddenFloorIds}
                                       showLabels={showVolumeLabels}
                                       labelFontSize={volumeLabelFontSize}
                                   />
                               </ErrorBoundary>
                            </div>
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                opacity: viewMode === 'CANVAS' ? 1 : 0,
                                pointerEvents: 'none',
                                zIndex: viewMode === 'CANVAS' ? 10 : 0,
                            }}>
                                {/* Background Reference Images */}
                                    <div
                                        className="absolute inset-0 origin-top-left"
                                        style={{
                                            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                                            pointerEvents: isReferenceMode ? 'auto' : 'none'
                                        }}
                                    >
                                        <svg className="absolute inset-0 overflow-visible" style={{ pointerEvents: 'none' }}>
                                            <ReferenceLayer
                                                images={referenceImages}
                                                currentFloor={currentFloor}
                                                scale={scale}
                                                offset={offset}
                                                selectedImageId={selectedReferenceImageId}
                                                onSelectImage={setSelectedReferenceImageId}
                                                onUpdateImage={handleUpdateReferenceImage}
                                                isScalingMode={!!referenceScaleState}
                                                scalingState={referenceScaleState}
                                                onScalingPointClick={handleScalingPointClick}
                                                toWorld={toWorld}
                                                isReferenceMode={isReferenceMode}
                                            />
                                        </svg>
                                    </div>

                                    {/* Zone Overlay Layer - Behind everything */}
                                    <div
                                        className={`absolute inset-0 origin-top-left pointer-events-none ${isReferenceMode || isSketchMode ? '[&_*]:pointer-events-none' : ''}`}
                                        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
                                    >
                                        <ZoneOverlay
                                            rooms={rooms}
                                            currentFloor={currentFloor}
                                            scale={scale}
                                            onZoneDrag={handleZoneDrag}
                                            onSelectZone={handleZoneClick}
                                            onDragStart={() => { setIsZoneDragging(true); addToHistory(); }}
                                            onDragEnd={handleZoneDragEnd}
                                            appSettings={appSettings}
                                            zoneColors={zoneColors}
                                        />
                                    </div>

                                    {/* Yellow Filter for Sketch Mode */}
                                    {isSketchMode && (
                                        <div className="absolute inset-0 bg-yellow-400/5 dark:bg-yellow-500/10 pointer-events-none z-30" />
                                    )}

                                    {/* Connection Lines Layer - Explicitly behind bubbles */}
                                    <div
                                        className="absolute inset-0 origin-top-left pointer-events-none"
                                        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
                                    >
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
                                                            strokeWidth={2 / scale}
                                                            strokeDasharray={currentStyle.sketchy ? "5,5" : "none"}
                                                            className="stroke-slate-300 dark:stroke-slate-700"
                                                        />
                                                        <circle cx={x1} cy={y1} r={4 / scale} className="fill-slate-400 dark:fill-slate-600" />
                                                        <circle cx={x2} cy={y2} r={4 / scale} className="fill-slate-400 dark:fill-slate-600" />
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
                                    </div>

                                    {/* Floor Overlay Layer */}
                                    {activeOverlayFloorId !== null && (() => {
                                        const overlayFloor = floors.find(f => f.id === activeOverlayFloorId);
                                        if (overlayFloor) {
                                            const overlayRooms = rooms.filter(r => r.isPlaced && r.floor === overlayFloor.id);
                                            return (
                                                <div
                                                    className="absolute inset-0 origin-top-left pointer-events-none"
                                                    style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
                                                >
                                                    {overlayRooms.map(room => (
                                                        <Bubble
                                                            key={`overlay-${room.id}`}
                                                            room={room}
                                                            zoomScale={scale}
                                                            updateRoom={() => { }}
                                                            onSelect={() => { }}
                                                            isSelected={false}
                                                            diagramStyle={currentStyle}
                                                            snapEnabled={false}
                                                            snapPixelUnit={1}
                                                            pixelsPerMeter={PIXELS_PER_METER}
                                                            floors={floors}
                                                            appSettings={appSettings}
                                                            zoneColors={zoneColors}
                                                            isOverlay={true}
                                                        />
                                                    ))}
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}

                                    {/* Bubbles Layer */}
                                    <div
                                        className="absolute inset-0 origin-top-left pointer-events-none"
                                        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
                                    >
                                        {(() => {
                                            const visibleRooms = rooms.filter(r => r.isPlaced && r.floor === currentFloor);
                                            const overlayRooms = activeOverlayFloorId !== null
                                                ? rooms.filter(r => r.isPlaced && r.floor === activeOverlayFloorId)
                                                : [];

                                            return visibleRooms.map(room => (
                                                <Bubble
                                                    key={room.id}
                                                    room={room}
                                                    zoomScale={scale}
                                                    updateRoom={updateRoom}
                                                    onMove={(x, y) => handleMoveRoom(room.id, x, y)}
                                                    isSelected={selectedRoomIds.has(room.id)}
                                                    isLinkingSource={connectionSourceId === room.id}
                                                    onLinkToggle={toggleLink}
                                                    getSnappedPosition={getSnappedPosition}
                                                    onSelect={(id, multi) => {
                                                        // Strict hit testing to avoid selecting when clicking bounding box corners
                                                        const room = rooms.find(r => r.id === id);
                                                        if (room) {
                                                            const worldPos = toWorld(lastMousePos.current.x, lastMousePos.current.y);
                                                            let isHit = false;
                                                            
                                                            if (room.polygon && room.polygon.length > 0) {
                                                                const poly = room.polygon.map(pt => ({ x: room.x + pt.x, y: room.y + pt.y }));
                                                                isHit = isPointInPolygon(worldPos, poly);
                                                            } else if (room.shape === 'bubble') {
                                                                // Ellipse check
                                                                const centerX = room.x + room.width / 2;
                                                                const centerY = room.y + room.height / 2;
                                                                const rx = room.width / 2;
                                                                const ry = room.height / 2;
                                                                if (rx > 0 && ry > 0) {
                                                                    const val = Math.pow(worldPos.x - centerX, 2) / Math.pow(rx, 2) + 
                                                                                Math.pow(worldPos.y - centerY, 2) / Math.pow(ry, 2);
                                                                    isHit = val <= 1;
                                                                }
                                                            } else {
                                                                // Rect check (default)
                                                                isHit = worldPos.x >= room.x && worldPos.x <= room.x + room.width &&
                                                                        worldPos.y >= room.y && worldPos.y <= room.y + room.height;
                                                            }

                                                            if (!isHit) {
                                                                // Clicked outside visual shape (but inside bounding box) -> Deselect
                                                                if (!multi) {
                                                                    setSelectedRoomIds(new Set());
                                                                    setSelectedZone(null);
                                                                    setSelectedAnnotationId(null);
                                                                    if (connectionSourceId) setConnectionSourceId(null);
                                                                }
                                                                return;
                                                            }
                                                        }

                                                        if (connectionSourceId) {
                                                            toggleLink(id);
                                                            return;
                                                        }
                                                        // Auto-lock text of other rooms when selecting a new one
                                                        if (!multi) {
                                                            setRooms(prev => prev.map(r => (r.id !== id && r.isTextUnlocked) ? { ...r, isTextUnlocked: false } : r));
                                                        }
                                                        setSelectedRoomIds(prev => {
                                                            const next = new Set(multi ? prev : []);
                                                            if (next.has(id)) next.delete(id);
                                                            else next.add(id);
                                                            return next;
                                                        });
                                                        if (!multi) setSelectedZone(null); // Clear zone selection on room click unless multi?
                                                    }}
                                                    diagramStyle={currentStyle}
                                                    snapEnabled={snapEnabled}
                                                    snapPixelUnit={appSettings.snapToGrid ? gridSize * PIXELS_PER_METER : 1}
                                                    pixelsPerMeter={PIXELS_PER_METER}
                                                    floors={floors}
                                                    appSettings={appSettings}
                                                    zoneColors={zoneColors}
                                                    onDragEnd={handleBubbleDragEnd}
                                                    onDragStart={() => { setIsBubbleDragging(true); addToHistory(); }}
                                                    isAnyDragging={isBubbleDragging}
                                                    otherRooms={selectedRoomIds.has(room.id) ? [...visibleRooms.filter(r => r.id !== room.id), ...overlayRooms] : undefined}
                                                    isSketchMode={isSketchMode || isReferenceMode}
                                                />
                                            ));
                                        })()}
                                    </div>

                                    {/* Annotation Layer - Above all spaces and zones */}
                                    <div
                                        className={`absolute inset-0 ${isSketchMode ? 'pointer-events-auto' : 'pointer-events-none'}`}
                                        style={{ zIndex: 100 }}
                                    >
                                        <AnnotationLayer
                                            annotations={annotations}
                                            isSketchMode={isSketchMode}
                                            activeType={activeSketchType}
                                            properties={selectedAnnotation ? selectedAnnotation.style : sketchProperties}
                                            currentFloor={currentFloor}
                                            scale={scale}
                                            offset={offset}
                                            selectedAnnotationId={selectedAnnotationId}
                                            onSelectAnnotation={setSelectedAnnotationId}
                                            onAddAnnotation={(ann) => {
                                                addToHistory();
                                                setAnnotations(prev => [...prev, ann]);
                                            }}
                                            onUpdateAnnotation={updateAnnotation}
                                            onDeleteAnnotation={deleteAnnotation}
                                            onInteractionStart={addToHistory}
                                        />
                                    </div>

                                    {/* Tools Bar (Top Left) */}
                                    <div className="absolute top-6 left-6 flex flex-col gap-2 z-[200] export-exclude pointer-events-auto">
                                        <div className="bg-white/80 dark:bg-dark-surface/80 backdrop-blur-sm p-1.5 rounded-full border border-slate-100 dark:border-dark-border shadow-lg flex items-center gap-1">
                                            <div className="flex items-center bg-slate-100/50 dark:bg-white/5 rounded-full px-2 py-1 border border-slate-200/50 dark:border-dark-border gap-2 mr-1">
                                                <span className="text-xs font-bold font-sans w-8 text-center">{gridSize}m</span>
                                                <div className="flex flex-col -space-y-1">
                                                    <button onClick={() => setGridSizeIndex(prev => Math.min(prev + 1, GRID_SIZES.length - 1))} className="text-slate-400 hover:text-orange-600"><ChevronUp size={12} /></button>
                                                    <button onClick={() => setGridSizeIndex(prev => Math.max(prev - 1, 0))} className="text-slate-400 hover:text-orange-600"><ChevronDown size={12} /></button>
                                                </div>
                                                <button
                                                    onClick={() => setShowGrid(!showGrid)}
                                                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${!showGrid ? 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5' : 'bg-white dark:bg-dark-surface text-orange-600 dark:text-orange-400 shadow-sm'}`}
                                                    title="Toggle Grid"
                                                >
                                                    <Grid size={12} />
                                                </button>
                                            </div>

                                            <button
                                                onClick={handleAutoArrange}
                                                className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-orange-600"
                                                title="Auto Arrange Layout"
                                            >
                                                <LayoutTemplate size={16} />
                                            </button>

                                            <button
                                                onClick={handleAiSpatialLayout}
                                                disabled={isAiLayoutLoading}
                                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${isAiLayoutLoading ? 'bg-orange-100 text-orange-400 animate-pulse' : 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-purple-600'}`}
                                                title="AI Spatial Layout"
                                            >
                                                <Sparkles size={16} className={isAiLayoutLoading ? "animate-spin" : ""} />
                                            </button>

                                            <div className="relative" ref={overlaySelectorRef}>
                                                <button
                                                    onClick={() => setIsOverlaySelectorOpen(prev => !prev)}
                                                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${activeOverlayFloorId !== null ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50' : 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                                                    title="Select Overlay Floor"
                                                >
                                                    <Layers size={16} />
                                                </button>
                                                {isOverlaySelectorOpen && (
                                                    <div className="absolute top-full mt-2 w-48 bg-white/90 dark:bg-dark-surface/90 backdrop-blur-md p-2 rounded-2xl border border-slate-200 dark:border-dark-border shadow-xl flex flex-col gap-1 origin-top z-50">
                                                        <div className="px-2 py-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Overlay Floor</div>
                                                        {floors.filter(f => f.id !== currentFloor).map(floor => (
                                                            <button
                                                                key={floor.id}
                                                                onClick={() => {
                                                                    setFloorOverlays(prev => ({
                                                                        ...prev,
                                                                        [currentFloor]: prev[currentFloor] === floor.id ? null : floor.id
                                                                    }));
                                                                    setIsOverlaySelectorOpen(false);
                                                                }}
                                                                className={`w-full text-left px-2 py-1.5 rounded-md text-xs font-bold ${activeOverlayFloorId === floor.id ? 'bg-orange-100 dark:bg-orange-900/20 text-orange-600' : 'text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5'}`}
                                                            >
                                                                {floor.label}
                                                            </button>
                                                        ))}
                                                        {floors.length > 1 && <div className="h-px bg-slate-200 dark:bg-dark-border my-1" />}
                                                        <button
                                                            onClick={() => {
                                                                setFloorOverlays(prev => ({
                                                                    ...prev,
                                                                    [currentFloor]: null
                                                                }));
                                                                setIsOverlaySelectorOpen(false);
                                                            }}
                                                            className={`w-full text-left px-2 py-1.5 rounded-md text-xs font-bold ${activeOverlayFloorId === null ? 'bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-white' : 'text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5'}`}
                                                        >
                                                            None
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            <button onClick={() => setSnapEnabled(!snapEnabled)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${!snapEnabled ? 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50'}`} title="Toggle Snapping"><Magnet size={16} /></button>

                                            <button
                                                onClick={() => setIsMagnetMode(!isMagnetMode)}
                                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${!isMagnetMode ? 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50 shadow-inner'}`}
                                                title="Physics / Magnetic Zones"
                                            >
                                                <Atom size={16} className={isMagnetMode ? "animate-spin" : ""} />
                                            </button>

                                            <button
                                                onClick={() => {
                                                    const newValue = !isReferenceMode;
                                                    setIsReferenceMode(newValue);
                                                    if (newValue) setIsSketchMode(false);
                                                }}
                                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${isReferenceMode ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-orange-600'}`}
                                                title="Edit Reference Images"
                                            >
                                                <ImageIcon size={16} />
                                            </button>

                                            <SketchToolbar
                                                isActive={isSketchMode}
                                                onToggle={() => {
                                                    const newValue = !isSketchMode;
                                                    setIsSketchMode(newValue);
                                                    if (newValue) setIsReferenceMode(false);
                                                }}
                                            />

                                            <button
                                                onClick={handleClearCanvas}
                                                className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 text-slate-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500"
                                                title="Clear Canvas"
                                            >
                                                <BrushCleaning size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Reference Panel - Moved to Top Left (Below Toolbar) */}
                                    <div className="absolute top-20 left-6 z-[190] export-exclude pointer-events-auto">
                                        <ReferenceToolbar
                                            isReferenceMode={isReferenceMode}
                                            selectedImage={referenceImages.find(i => i.id === selectedReferenceImageId) || null}
                                            onUpdateImage={handleUpdateReferenceImage}
                                            onDeleteImage={handleDeleteReferenceImage}
                                            onImportImage={handleImportReference}
                                            onStartScaling={(id) => setReferenceScaleState({ imageId: id, points: [], step: 'point1' })}
                                            isScalingMode={!!referenceScaleState}
                                            onCancelScaling={() => setReferenceScaleState(null)}
                                        />
                                    </div>

                                    {/* Sketch Panel - Aligned with Reference Panel */}
                                    <div className="absolute top-20 left-6 z-[190] export-exclude pointer-events-auto">
                                        <SketchPanel
                                            isActive={isSketchMode}
                                            activeType={activeSketchType}
                                            onTypeChange={setActiveSketchType}
                                            properties={selectedAnnotation ? selectedAnnotation.style : sketchProperties}
                                            onPropertyChange={handleAnnotationPropertyChange}
                                            selectedAnnotation={selectedAnnotation}
                                            onZIndex={handleZIndex}
                                            onDelete={() => selectedAnnotationId && deleteAnnotation(selectedAnnotationId)}
                                        />
                                    </div>

                                    <div className="absolute top-6 right-6 flex flex-col items-end gap-2 z-[200] export-exclude pointer-events-auto">
                                        <div className="h-12 bg-white/90 dark:bg-dark-surface/90 backdrop-blur-md px-4 rounded-full border border-slate-200 dark:border-dark-border shadow-xl flex items-center gap-4 animate-in slide-in-from-right-4 transition-all duration-300">
                                            <div className="flex items-center gap-2 text-slate-400">
                                                <div className="h-1 w-12 bg-slate-300/50 dark:bg-white/10 rounded-full relative">
                                                    <div className="absolute -top-3 left-0 text-[8px] font-bold">0m</div>
                                                    <div className="absolute -top-3 right-0 text-[8px] font-bold">{(16 / scale / PIXELS_PER_METER * 4).toFixed(1)}m</div>
                                                </div>
                                            </div>
                                            <div className="h-4 w-px bg-slate-200 dark:bg-dark-border" />
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-sans font-black text-slate-700 dark:text-gray-300">{(scale * 100).toFixed(0)}%</span>
                                                <button onClick={handleZoomToFit} className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 flex items-center justify-center hover:bg-orange-500 hover:text-white transition-all shadow-sm" title="Zoom to Fit">
                                                    <Maximize size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Scale Bar on Canvas - Dynamic */}
                                    <div className="absolute bottom-12 right-6 flex flex-col items-end gap-1 pointer-events-none">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-400 text-shadow-sm">10 meters</span>
                                            <div className="h-2 border-x border-b border-slate-400/80 bg-white/20 backdrop-blur-sm"
                                                style={{ width: 10 * PIXELS_PER_METER * scale }} />
                                        </div>
                                    </div>

                                    {/* Floor Tabs Bar */}
                                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-slate-200/50 dark:bg-black/40 flex items-start px-4 gap-1 z-40 backdrop-blur-sm border-t border-slate-200/50 dark:border-dark-border export-exclude pointer-events-auto">
                                        {floors.map(f => (
                                            <div
                                                key={f.id}
                                                onClick={() => setCurrentFloor(f.id)}
                                                onDoubleClick={() => setEditingFloorId(f.id)}
                                                className={`group
                                            relative px-4 py-1.5 text-[9px] font-black uppercase tracking-widest cursor-pointer rounded-b-lg flex items-center gap-2 select-none border-b border-x border-transparent
                                            ${currentFloor === f.id
                                                        ? 'bg-[#f0f2f5] dark:bg-dark-bg text-orange-600 border-slate-200/50 dark:border-dark-border !border-t-transparent h-full -translate-y-px'
                                                        : 'bg-slate-300/50 dark:bg-white/5 text-slate-500 dark:text-gray-500 hover:bg-slate-100/50 dark:hover:bg-white/10 h-[85%] mt-0'
                                                    }
                                        `}
                                            >
                                                {editingFloorId === f.id ? (
                                                    <input
                                                        autoFocus
                                                        className="bg-transparent border-none outline-none w-20 text-center font-black uppercase tracking-widest p-0 text-[10px] text-orange-600"
                                                        value={f.label}
                                                        onChange={(e) => handleRenameFloor(f.id, e.target.value)}
                                                        onBlur={() => setEditingFloorId(null)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') setEditingFloorId(null);
                                                            e.stopPropagation();
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                ) : (
                                                    <>
                                                        {f.label}
                                                        {currentFloor === f.id && (
                                                            <button
                                                                onClick={(e) => floors.length > 1 && handleDeleteFloor(e, f.id)}
                                                                className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 ml-1"
                                                                title="Delete Floor"
                                                            >
                                                                <X size={8} />
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                        <button
                                            onClick={handleAddFloor}
                                            className="h-[85%] w-8 flex items-center justify-center rounded-b-lg bg-slate-300/50 dark:bg-white/5 hover:bg-orange-600 hover:text-white text-slate-500"
                                            title="Add Floor"
                                        >
                                            <Plus size={12} />
                                        </button>
                                    </div>
                    </div>
                </main>

                <aside className={`${isRightSidebarOpen ? 'w-80' : 'w-10'} bg-white dark:bg-dark-surface border-l border-slate-200 dark:border-dark-border flex flex-col z-20 shadow-2xl transition-all duration-300`}>
                    {isRightSidebarOpen ? (
                                <>
                                    <div className="p-6 border-b border-slate-100 dark:border-dark-border flex justify-between items-center bg-slate-50/50 dark:bg-white/5 h-20">
                                        <h2 className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest truncate max-w-[180px]">
                                            {isMultiSelection ? 'Multi-Selection' : selectedRoom ? 'Space Detail' : selectedZone ? 'Zone Detail' : 'Properties'}
                                        </h2>
                                        <button onClick={() => setIsRightSidebarOpen(false)} className="text-slate-300 dark:text-gray-600 hover:text-slate-600 dark:hover:text-gray-400"><ChevronRight size={18} /></button>
                                    </div>
                                    <div className="flex-1 p-6 overflow-y-auto">
                                        {selectedRoom || isMultiSelection ? (
                                            <div className="space-y-6">
                                                <div>
                                                    <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2 block">Space Name</label>
                                                    {isMultiSelection ? (
                                                        <div className="text-sm font-bold text-slate-500 italic">{selectedRoomIds.size} spaces selected</div>
                                                    ) : (
                                                        <input
                                                            className="w-full text-xl font-black text-slate-800 dark:text-gray-100 focus:outline-none focus:text-orange-600 bg-transparent border-b border-transparent focus:border-orange-500 pb-1"
                                                            value={selectedRoom!.name}
                                                            onChange={(e) => updateRoom(selectedRoom!.id, { name: e.target.value })}
                                                        />
                                                    )}
                                                </div>

                                                {/* Shape Conversion Buttons */}
                                                <div>
                                                    <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2 block">Shape Type</label>
                                                    <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
                                                        <button onClick={() => handleConvertShape('rect')} className={`flex-1 flex items-center justify-center py-2 rounded-lg ${(!isMultiSelection && (!selectedRoom?.shape || selectedRoom?.shape === 'rect')) || (isMultiSelection && multiSelectionStats?.commonShape === 'rect') ? 'bg-white dark:bg-dark-surface shadow-sm text-orange-600' : 'text-slate-400 hover:text-slate-600'}`} title="Rectangle"><Square size={16} /></button>
                                                        <button onClick={() => handleConvertShape('polygon')} className={`flex-1 flex items-center justify-center py-2 rounded-lg ${(!isMultiSelection && selectedRoom?.shape === 'polygon') || (isMultiSelection && multiSelectionStats?.commonShape === 'polygon') ? 'bg-white dark:bg-dark-surface shadow-sm text-orange-600' : 'text-slate-400 hover:text-slate-600'}`} title="Polygon"><Hexagon size={16} /></button>
                                                        <button onClick={() => handleConvertShape('bubble')} className={`flex-1 flex items-center justify-center py-2 rounded-lg ${(!isMultiSelection && selectedRoom?.shape === 'bubble') || (isMultiSelection && multiSelectionStats?.commonShape === 'bubble') ? 'bg-white dark:bg-dark-surface shadow-sm text-orange-600' : 'text-slate-400 hover:text-slate-600'}`} title="Bubble"><Circle size={16} /></button>
                                                    </div>
                                                </div>

                                                {/* Link Logic Button */}
                                                {!isMultiSelection && (
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => toggleLink(selectedRoom!.id)}
                                                            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border flex items-center justify-center gap-2 ${connectionSourceId === selectedRoom!.id ? 'bg-yellow-50 border-yellow-300 text-yellow-600 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-400' : 'bg-white dark:bg-white/5 border-slate-200 dark:border-dark-border text-slate-500 dark:text-gray-400 hover:border-orange-500 hover:text-orange-600'}`}
                                                        >
                                                            <Link size={14} className={connectionSourceId === selectedRoom!.id ? 'fill-current' : ''} /> {connectionSourceId === selectedRoom!.id ? 'Cancel' : 'Link'}
                                                        </button>

                                                        <div className="flex items-center bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-dark-border p-1 gap-1">
                                                            <span className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest px-2">Text</span>
                                                            <button
                                                                onClick={() => updateRoom(selectedRoom!.id, { isTextUnlocked: !selectedRoom!.isTextUnlocked })}
                                                                className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedRoom!.isTextUnlocked ? 'bg-white dark:bg-dark-surface text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-gray-200'}`}
                                                                title={selectedRoom!.isTextUnlocked ? "Lock Text Position" : "Unlock Text to Move"}
                                                            >
                                                                {selectedRoom!.isTextUnlocked ? <Unlock size={14} /> : <Lock size={14} />}
                                                            </button>
                                                            <button
                                                                onClick={() => updateRoom(selectedRoom!.id, { textPos: undefined })}
                                                                disabled={!selectedRoom!.textPos}
                                                                className={`w-8 h-8 rounded-lg flex items-center justify-center ${!selectedRoom!.textPos ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-orange-600 hover:bg-white dark:hover:bg-dark-surface hover:shadow-sm dark:text-gray-400'}`}
                                                                title="Reset Text Position"
                                                            >
                                                                <RotateCcw size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {!isMultiSelection && (
                                                    <div className="space-y-3">

                                                        {/* Linked Spaces List */}
                                                        {(() => {
                                                            const linkedConnections = connections.filter(c => c.fromId === selectedRoom!.id || c.toId === selectedRoom!.id);
                                                            if (linkedConnections.length > 0) {
                                                                return (
                                                                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 border border-slate-100 dark:border-dark-border">
                                                                        <span className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block mb-2">Linked Spaces</span>
                                                                        <div className="space-y-1.5">
                                                                            {linkedConnections.map(conn => {
                                                                                const otherId = conn.fromId === selectedRoom!.id ? conn.toId : conn.fromId;
                                                                                const otherRoom = rooms.find(r => r.id === otherId);
                                                                                if (!otherRoom) return null;
                                                                                return (
                                                                                    <div key={conn.id} className="flex items-center justify-between text-xs group">
                                                                                        <span className="font-bold text-slate-600 dark:text-gray-300 flex items-center gap-2">
                                                                                            <div className={`w-2 h-2 rounded-full ${zoneColors[otherRoom.zone]?.bg || 'bg-slate-300'}`} />
                                                                                            {otherRoom.name}
                                                                                        </span>
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                setConnections(prev => prev.filter(c => c.id !== conn.id));
                                                                                            }}
                                                                                            className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 p-1"
                                                                                            title="Unlink"
                                                                                        >
                                                                                            <X size={12} />
                                                                                        </button>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>
                                                )}

                                                {!isMultiSelection ? (
                                                    <>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border">
                                                                <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase block mb-1">Area</span>
                                                                <div className="flex items-baseline gap-1">
                                                                    <input
                                                                        type="number"
                                                                        className="text-lg font-sans font-bold text-slate-700 dark:text-gray-200 bg-transparent border-b border-transparent focus:border-orange-500 outline-none w-full"
                                                                        value={Number(selectedRoom!.area.toFixed(2))}
                                                                        onChange={(e) => {
                                                                            const val = parseFloat(e.target.value);
                                                                            if (!isNaN(val)) updateRoom(selectedRoom!.id, { area: val });
                                                                        }} />
                                                                    <small className="text-xs opacity-60">m²</small>
                                                                </div>
                                                            </div>
                                                            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border flex justify-between items-center">
                                                                <div>
                                                                    <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase block mb-1">Floor</span>
                                                                    <span className="text-lg font-sans font-bold text-slate-700 dark:text-gray-200">{floors.find(f => f.id === selectedRoom!.floor)?.label || 'N/A'}</span>
                                                                </div>
                                                                <div className="flex flex-col gap-1">
                                                                    <button
                                                                        onClick={() => {
                                                                            const currentIdx = floors.findIndex(f => f.id === selectedRoom!.floor);
                                                                            if (currentIdx < floors.length - 1) {
                                                                                updateRoom(selectedRoom!.id, { floor: floors[currentIdx + 1].id });
                                                                            }
                                                                        }}
                                                                        disabled={floors.findIndex(f => f.id === selectedRoom!.floor) >= floors.length - 1}
                                                                        className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded text-slate-400 hover:text-orange-600 disabled:opacity-30"
                                                                        title="Move Up"
                                                                    >
                                                                        <ChevronUp size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            const currentIdx = floors.findIndex(f => f.id === selectedRoom!.floor);
                                                                            if (currentIdx > 0) {
                                                                                updateRoom(selectedRoom!.id, { floor: floors[currentIdx - 1].id });
                                                                            }
                                                                        }}
                                                                        disabled={floors.findIndex(f => f.id === selectedRoom!.floor) <= 0}
                                                                        className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded text-slate-400 hover:text-orange-600 disabled:opacity-30"
                                                                        title="Move Down"
                                                                    >
                                                                        <ChevronDown size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-3 block">Zone Category</label>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {Object.keys(zoneColors).map(z => (
                                                                    <button
                                                                        key={z}
                                                                        onClick={() => updateRoom(selectedRoom!.id, { zone: z })}
                                                                        className={`px-3 py-2 rounded-lg text-[10px] font-bold border ${selectedRoom!.zone === z ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white dark:bg-white/5 border-slate-100 dark:border-white/10 text-slate-500 dark:text-gray-400 hover:border-slate-300 dark:hover:border-white/20'}`}
                                                                    >
                                                                        {z}
                                                                    </button>
                                                                ))}
                                                                <button
                                                                    onClick={() => {
                                                                        const name = prompt("Enter new zone name:");
                                                                        if (name) handleAddZone(name);
                                                                    }}
                                                                    className="px-3 py-2 rounded-lg text-[10px] font-bold border border-dashed border-slate-300 dark:border-white/20 text-slate-400 hover:text-orange-600 hover:border-orange-400 flex items-center justify-center gap-1"
                                                                >
                                                                    <Plus size={12} /> New
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    // Multi-selection Summary
                                                    <div className="space-y-4">
                                                        <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border">
                                                            <div className="flex justify-between items-center mb-2">
                                                                <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase">Total Area</span>
                                                            </div>
                                                            <div className="text-2xl font-sans font-bold text-slate-800 dark:text-gray-100 tracking-tight">
                                                                {Number(multiSelectionStats?.totalArea.toFixed(2))} <span className="text-sm font-sans text-slate-400 dark:text-gray-500 font-bold">m²</span>
                                                            </div>
                                                        </div>
                                                        <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border flex justify-between items-center">
                                                            <div>
                                                                <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase block mb-1">Floor</span>
                                                                <span className="text-lg font-sans font-bold text-slate-700 dark:text-gray-200">
                                                                    {(() => {
                                                                        if (selectedRoomsList.length === 0) return 'N/A';
                                                                        const firstFloor = selectedRoomsList[0].floor;
                                                                        const allSame = selectedRoomsList.every(r => r.floor === firstFloor);
                                                                        return allSame ? (floors.find(f => f.id === firstFloor)?.label || 'N/A') : 'Mixed';
                                                                    })()}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-col gap-1">
                                                                <button
                                                                    onClick={() => handleMoveSelectionFloors(1)}
                                                                    disabled={selectedRoomsList.every(r => floors.findIndex(f => f.id === r.floor) >= floors.length - 1)}
                                                                    className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded text-slate-400 hover:text-orange-600 disabled:opacity-30"
                                                                    title="Move Selection Up"
                                                                >
                                                                    <ChevronUp size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleMoveSelectionFloors(-1)}
                                                                    disabled={selectedRoomsList.every(r => floors.findIndex(f => f.id === r.floor) <= 0)}
                                                                    className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded text-slate-400 hover:text-orange-600 disabled:opacity-30"
                                                                    title="Move Selection Down"
                                                                >
                                                                    <ChevronDown size={14} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="p-4 bg-white dark:bg-dark-bg border border-slate-100 dark:border-dark-border rounded-xl">
                                                            <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase block mb-2">Breakdown</span>
                                                            <p className="text-xs font-medium text-slate-600 dark:text-gray-300">{multiSelectionStats?.breakdown}</p>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="pt-6 border-t border-slate-100 dark:border-dark-border mt-auto">
                                                    <button onClick={() => {
                                                        if (isMultiSelection) {
                                                            selectedRoomIds.forEach(id => deleteRoom(id));
                                                            setSelectedRoomIds(new Set());
                                                        } else {
                                                            deleteRoom(selectedRoom!.id);
                                                        }
                                                    }} className="w-full py-3 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white flex items-center justify-center gap-2">
                                                        <Trash2 size={16} /> Delete Space
                                                    </button>
                                                </div>
                                            </div>
                                        ) : selectedZone ? (
                                            <div className="space-y-6">
                                                <div>
                                                    <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2 block">Zone Name</label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            className="w-full text-xl font-black text-slate-800 dark:text-gray-100 focus:outline-none focus:text-orange-600 bg-transparent border-b border-dashed border-slate-300 dark:border-dark-border focus:border-orange-500 pb-1"
                                                            value={selectedZone}
                                                            onChange={(e) => renameZone(selectedZone, e.target.value)}
                                                        />
                                                        <div className={`w-4 h-4 rounded-full ${zoneColors[selectedZone]?.bg || 'bg-slate-200'}`} />
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2 block">Zone Color</label>
                                                    <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-dark-border">
                                                        {COLOR_PALETTE.map((style, i) => (
                                                            <button
                                                                    key={i}
                                                                    onClick={() => {
                                                                        addToHistory();
                                                                        setZoneColors(prev => ({ ...prev, [selectedZone]: style }));
                                                                    }}
                                                                    className={`w-6 h-6 rounded-full ${style.bg} shadow-sm ring-2 ring-offset-2 ring-offset-white dark:ring-offset-dark-surface ${zoneColors[selectedZone]?.bg === style.bg ? 'ring-slate-900 dark:ring-white scale-110' : 'ring-transparent hover:scale-110 transition-transform'}`}
                                                                    title="Select Color"
                                                                />
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border">
                                                    <div className="flex justify-between items-center mb-4">
                                                        <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase">Total Stats</span>
                                                        <span className="text-[10px] font-bold text-orange-600 bg-orange-500/10 px-2 py-1 rounded-md">{selectedZoneRooms.length} Spaces</span>
                                                    </div>
                                                    <div className="text-3xl font-sans font-bold text-slate-800 dark:text-gray-100 tracking-tight">
                                                        {Number(zoneArea.toFixed(2))} <span className="text-sm font-sans text-slate-400 dark:text-gray-500 font-bold">m²</span>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-3 block flex justify-between">
                                                        Included Spaces
                                                    </label>
                                                    <div className="space-y-2">
                                                        {selectedZoneRooms.map(r => (
                                                            <div key={r.id} className="flex items-center justify-between p-3 bg-white dark:bg-dark-bg border border-slate-100 dark:border-dark-border rounded-xl hover:shadow-md hover:border-orange-300 dark:hover:border-orange-800 cursor-pointer group"
                                                                onClick={() => setSelectedRoomIds(new Set([r.id]))}>
                                                                <span className="text-sm font-bold text-slate-700 dark:text-gray-300 group-hover:text-orange-600">{r.name}</span>
                                                                <span className="text-[10px] font-sans text-slate-400 dark:text-gray-500">{r.area} m²</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-8 animate-in fade-in duration-500">
                                                {/* Floor Settings - Shown when nothing is selected */}
                                                {viewMode === 'VOLUMES' ? (
                                                    <div className="space-y-6">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                                                                <Box size={14} className="text-orange-600" />
                                                            </div>
                                                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-gray-300">Volumes Settings</h3>
                                                        </div>

                                                        <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border space-y-4">
                                                            <div>
                                                                <div className="flex justify-between items-center mb-1.5">
                                                                    <label className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block">Floor Gap</label>
                                                                    <span className="text-[10px] font-bold text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-1.5 rounded">{(floorGap / 2).toFixed(1)}m</span>
                                                                </div>
                                                                <input
                                                                    type="range"
                                                                    min="0"
                                                                    max="40"
                                                                    step="0.5"
                                                                    value={floorGap}
                                                                    onChange={(e) => setFloorGap(parseFloat(e.target.value))}
                                                                    className="w-full accent-orange-500 h-1 bg-slate-200 dark:bg-dark-border rounded-lg appearance-none cursor-pointer"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border space-y-4">
                                                            <div className="flex items-center justify-between">
                                                                <label className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">Show Labels</label>
                                                                <button
                                                                    onClick={() => setShowVolumeLabels(!showVolumeLabels)}
                                                                    className={`w-8 h-5 rounded-full relative transition-colors ${showVolumeLabels ? 'bg-orange-500' : 'bg-slate-300 dark:bg-white/10'}`}
                                                                >
                                                                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${showVolumeLabels ? 'left-4' : 'left-1'}`} />
                                                                </button>
                                                            </div>

                                                            {showVolumeLabels && (
                                                                <div>
                                                                    <div className="flex justify-between items-center mb-1.5">
                                                                        <label className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block">Label Size</label>
                                                                        <span className="text-[10px] font-bold text-slate-600 dark:text-gray-300">{volumeLabelFontSize}px</span>
                                                                    </div>
                                                                    <input
                                                                        type="range"
                                                                        min="4"
                                                                        max="24"
                                                                        step="1"
                                                                        value={volumeLabelFontSize}
                                                                        onChange={(e) => setVolumeLabelFontSize(parseFloat(e.target.value))}
                                                                        className="w-full accent-orange-500 h-1 bg-slate-200 dark:bg-dark-border rounded-lg appearance-none cursor-pointer"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="space-y-3">
                                                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-gray-500 px-1">Floors Configuration</h3>
                                                            {floors.map(floor => {
                                                                const floorRooms = rooms.filter(r => r.floor === floor.id && r.isPlaced);
                                                                const floorArea = floorRooms.reduce((acc, r) => acc + r.area, 0);
                                                                const isHidden = hiddenFloorIds.has(floor.id);
                                                                
                                                                return (
                                                                    <div key={floor.id} className="p-4 bg-white dark:bg-dark-bg border border-slate-100 dark:border-dark-border rounded-xl space-y-3">
                                                                        <div className="flex items-center justify-between">
                                                                            <div className="flex items-center gap-2">
                                                                                <button
                                                                                    onClick={() => toggleFloorVisibility(floor.id)}
                                                                                    className={`p-1 rounded-md transition-colors ${isHidden ? 'text-slate-400 hover:text-slate-600' : 'text-orange-600 hover:text-orange-700 bg-orange-50 dark:bg-orange-900/20'}`}
                                                                                    title={isHidden ? "Show Floor" : "Hide Floor"}
                                                                                >
                                                                                    {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                                                                                </button>
                                                                                <span className={`text-xs font-bold ${isHidden ? 'text-slate-400' : 'text-slate-700 dark:text-gray-200'}`}>{floor.label}</span>
                                                                            </div>
                                                                            <span className="text-[10px] font-mono text-slate-400">{floorRooms.length} Spaces</span>
                                                                        </div>
                                                                        
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="flex-1">
                                                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Height (m)</label>
                                                                                <input
                                                                                    type="number"
                                                                                    step="0.1"
                                                                                    className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-lg px-2 py-1 text-xs font-bold text-slate-700 dark:text-gray-200 focus:ring-1 focus:ring-orange-500 outline-none"
                                                                                    value={floor.height}
                                                                                    onChange={(e) => handleUpdateFloor(floor.id, { height: parseFloat(e.target.value) || 0 })}
                                                                                />
                                                                            </div>
                                                                            <div className="flex-1">
                                                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Area</label>
                                                                                <div className="px-2 py-1 text-xs font-bold text-slate-500 dark:text-gray-400">
                                                                                    {Math.round(floorArea)} m²
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-6">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                                                                <Layers size={14} className="text-orange-600" />
                                                            </div>
                                                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-gray-300">Floor Settings</h3>
                                                        </div>

                                                        <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border space-y-4">
                                                            <div>
                                                                <label className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-1.5 block">Current Floor Label</label>
                                                                <input
                                                                    className="w-full text-lg font-black text-slate-800 dark:text-gray-100 bg-transparent border-b border-dashed border-slate-300 dark:border-dark-border focus:border-orange-500 outline-none pb-1"
                                                                    value={floors.find(f => f.id === currentFloor)?.label || ""}
                                                                    onChange={(e) => handleUpdateFloor(currentFloor, { label: e.target.value })}
                                                                />
                                                            </div>

                                                            <div>
                                                                <div className="flex justify-between items-center mb-1.5">
                                                                    <label className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block">Floor Height</label>
                                                                    <span className="text-[10px] font-bold text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-1.5 rounded">meters</span>
                                                                </div>
                                                                <div className="flex items-center gap-3">
                                                                    <input
                                                                        type="number"
                                                                        step="0.1"
                                                                        className="flex-1 text-2xl font-mono font-bold text-slate-700 dark:text-gray-200 bg-transparent outline-none"
                                                                        value={floors.find(f => f.id === currentFloor)?.height || 3}
                                                                        onChange={(e) => handleUpdateFloor(currentFloor, { height: parseFloat(e.target.value) || 0 })}
                                                                    />
                                                                    <div className="flex flex-col gap-1">
                                                                        <button
                                                                            onClick={() => handleUpdateFloor(currentFloor, { height: (floors.find(f => f.id === currentFloor)?.height || 3) + 0.1 })}
                                                                            className="p-1 hover:bg-white dark:hover:bg-white/10 rounded shadow-sm border border-slate-200 dark:border-dark-border text-slate-400 hover:text-orange-600"
                                                                        >
                                                                            <ChevronUp size={14} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleUpdateFloor(currentFloor, { height: Math.max(0, (floors.find(f => f.id === currentFloor)?.height || 3) - 0.1) })}
                                                                            className="p-1 hover:bg-white dark:hover:bg-white/10 rounded shadow-sm border border-slate-200 dark:border-dark-border text-slate-400 hover:text-orange-600"
                                                                        >
                                                                            <ChevronDown size={14} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <p className="text-[9px] text-slate-400 dark:text-gray-600 leading-relaxed px-2 italic">
                                                            Changing the height affects 3D extrusions and spatial stacking for all spaces on this floor.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="h-full flex flex-col items-center py-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => setIsRightSidebarOpen(true)}>
                                    <div className="flex-1 flex items-center justify-center">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-gray-500 whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Properties</span>
                                    </div>
                                    <ChevronLeft size={18} className="text-slate-400 mb-4" />
                                </div>
                            )}
                </aside>
            </div>

            {
                showApiKeyModal && (
                    <ApiKeyModal
                        onSave={handleSaveApiKey}
                        onClose={() => setShowApiKeyModal(false)}
                        currentKey={apiKey}
                    />
                )
            }

            {
                showExportModal && (
                    <ExportModal
                        projectName={projectName}
                        onClose={() => setShowExportModal(false)}
                        viewMode={viewMode}
                        onExport={handleSave}
                        onPreview={getCanvasPreview}
                    />
                )
            }

            {
                showSettingsModal && (
                    <SettingsModal
                        settings={appSettings}
                        onUpdate={setAppSettings}
                        onClose={() => setShowSettingsModal(false)}
                    />
                )
            }

            {
                showHelpModal && (
                    <HelpModal
                        isOpen={showHelpModal}
                        onClose={() => setShowHelpModal(false)}
                    />
                )
            }

            {
                showAboutModal && (
                    <AboutModal
                        onClose={() => setShowAboutModal(false)}
                    />
                )
            }
        </div >
    );
}