import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Room, FLOORS, Connection, DIAGRAM_STYLES, DiagramStyle, Point, ZONE_COLORS, AppSettings, ZoneColor } from './types';
import { ProgramEditor } from './components/ProgramEditor';
import { Bubble } from './components/Bubble';
import { ApiKeyModal } from './components/ApiKeyModal';
import { ZoneOverlay } from './components/ZoneOverlay'; // Newly added
import { ExportModal } from './components/ExportModal';
import { SettingsModal } from './components/SettingsModal';
import { applyMagneticPhysics } from './utils/physics'; // Newly added
import { handleExport, getHexColorForZone, getHexBorderForZone } from './utils/exportSystem';
import { arrangeRooms } from './utils/layout';
import {
    Plus, Map as MapIcon, Package, Download, Upload, Settings2, Undo2, Redo2, RotateCcw,
    TableProperties, Hexagon, Circle, Square,
    LandPlot, ChevronRight, ChevronLeft, Key, X, Settings, LayoutTemplate, Trash2, Lock, Unlock, BrushCleaning,
    Link, Magnet, Grid, Moon, Sun, Maximize, ChevronUp, ChevronDown, Atom, FileImage, Image as ImageIcon, Scaling
} from 'lucide-react';
import { Annotation, AnnotationType, ArrowCapType, ReferenceImage, ReferenceScaleState } from './types';
import { SketchToolbar } from './components/SketchToolbar';
import { AnnotationLayer } from './components/AnnotationLayer';
import { ReferenceLayer } from './components/ReferenceLayer';
import { ReferenceToolbar } from './components/ReferenceToolbar';

// Shim process for libs that might expect it in Vite
if (typeof window !== 'undefined' && !window.process) {
    (window as any).process = { env: {} };
}

// Configuration
const PIXELS_PER_METER = 20;

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

type ViewMode = 'EDITOR' | 'CANVAS';

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
    const [showSettingsModal, setShowSettingsModal] = useState(false);

    // Sketch State
    const [annotations, setAnnotations] = useState<Annotation[]>(initialData?.annotations || []);
    const [isSketchMode, setIsSketchMode] = useState(false);
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
    const [isZoneDragging, setIsZoneDragging] = useState(false);
    const [isBubbleDragging, setIsBubbleDragging] = useState(false);
    const [isInventoryHovered, setIsInventoryHovered] = useState(false);
    const [editingFloorId, setEditingFloorId] = useState<number | null>(null);
    const [hasInitialZoomed, setHasInitialZoomed] = useState(false);

    const roomsRef = useRef(rooms);
    roomsRef.current = rooms;


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
                referenceImages
            };
            localStorage.setItem('SOAP_PROJECT_AUTOSAVE', JSON.stringify(saveData));
            console.log("Project auto-saved (debounced)");
        }, 500);

        return () => clearTimeout(timer);
    }, [projectName, rooms, connections, zoneColors, appSettings, floors, currentFloor, annotations, referenceImages]);

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
        const otherRooms = currentRooms.filter(r => r.isPlaced && r.id !== excludeId && r.floor === currentFloor);

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
    }, [currentFloor, snapEnabled, appSettings]);

    // Canvas Refs
    const mainRef = useRef<HTMLElement>(null);
    const isPanning = useRef(false);
    const inventoryRef = useRef<HTMLElement>(null);
    const prevMainRect = useRef<{ width: number, height: number } | null>(null);
    const lastMousePos = useRef<Point>({ x: 0, y: 0 });

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
        // Allow pan on Middle Button OR Left Click on Background
        if (e.button === 1 || e.button === 0) {
            isPanning.current = true;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            // If dragging background, we might also want to clear selection?
            // Let's clear selection if we started a pan on background and it wasn't valid selection target
            if (e.target === e.currentTarget) {
                setSelectedRoomIds(new Set());
                if (connectionSourceId) setConnectionSourceId(null);
                // Auto-lock all text when clicking empty space
                setRooms(prev => prev.map(r => r.isTextUnlocked ? { ...r, isTextUnlocked: false } : r));
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning.current) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            setViewport(prev => ({
                ...prev,
                offset: { x: prev.offset.x + dx, y: prev.offset.y + dy }
            }));
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseUp = () => {
        isPanning.current = false;
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
                    setViewMode(prev => prev === 'EDITOR' ? 'CANVAS' : 'EDITOR');
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
        const styles = Object.values(ZONE_COLORS);
        const randomStyle = styles[Math.floor(Math.random() * styles.length)];
        setZoneColors(prev => ({ ...prev, [name]: randomStyle }));
    };

    const handleAutoArrange = () => {
        addToHistory();
        setRooms(prev => arrangeRooms(prev, currentFloor));
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
    }, []);

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
    }, []);

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

    const handleUpdateReferenceImage = (id: string, updates: Partial<ReferenceImage>) => {
        setReferenceImages(prev => prev.map(img => img.id === id ? { ...img, ...updates } : img));
    };

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
            const p1 = referenceScaleState.points[0];
            const p2 = p;
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
            } else {
                setConnections(prev => prev.filter(c => c.id !== existing.id));
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

    const handleZoneClick = useCallback((z: string) => {
        setSelectedZone(z);
        setSelectedRoomIds(new Set());
    }, []);

    const renameZone = useCallback((oldZone: string, newZone: string) => {
        addToHistory();
        if (!newZone.trim()) return;
        setRooms(prev => prev.map(r => r.zone === oldZone ? { ...r, zone: newZone } : r));
        setSelectedZone(newZone);
    }, []);

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

    const handleConvertShape = (shape: 'rect' | 'polygon' | 'bubble') => {
        addToHistory();
        setRooms(prev => prev.map(r => {
            if (!selectedRoomIds.has(r.id)) return r;
            if ((r.shape || 'rect') === shape) return r;

            const roomStyle = r.style || {};
            // Only carry over styles that are actually defined (custom overrides).
            // If they are undefined, we let the new shape inherit from the Zone/AppSettings defaults naturally.
            const newStyle: any = { ...roomStyle };

            // Preserve specific overrides if they exist, otherwise leave undefined to use defaults
            if (roomStyle.fill) newStyle.fill = roomStyle.fill;
            if (roomStyle.stroke) newStyle.stroke = roomStyle.stroke;
            if (roomStyle.strokeWidth) newStyle.strokeWidth = roomStyle.strokeWidth;
            if (roomStyle.opacity) newStyle.opacity = roomStyle.opacity;
            if (roomStyle.cornerRadius) newStyle.cornerRadius = roomStyle.cornerRadius;
            if (roomStyle.strokeDasharray) newStyle.strokeDasharray = roomStyle.strokeDasharray;

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
            `}</style>
            {/* Premium Header */}
            <header className="h-12 bg-white/70 dark:bg-dark-surface/70 backdrop-blur-xl border-b border-slate-200/50 dark:border-dark-border flex items-center justify-between px-4 shrink-0 z-40 shadow-[0_1px_10px_rgba(0,0,0,0.02)] relative transition-colors duration-300">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 group cursor-pointer">
                        <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-orange-200/50 group-hover:scale-105">
                            <MapIcon size={16} />
                        </div>
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
                            <LandPlot size={14} /> Canvas
                        </button>
                    </div>
                </div>


                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setShowExportModal(true)} className="h-8 px-3 text-slate-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 group"
                    >
                        <Upload size={14} className="group-hover:-translate-y-0.5" /> Export
                    </button>

                    <div className="flex items-center">
                        <label className="h-8 px-3 text-slate-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 cursor-pointer group">
                            <Download size={14} className="group-hover:-translate-y-0.5" /> Project
                            <input type="file" accept={viewMode === 'EDITOR' ? ".json,.csv" : ".json"} className="hidden" onChange={handleImportProject} />
                        </label>
                        {viewMode === 'CANVAS' && (
                            <label className="h-8 px-3 text-slate-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 cursor-pointer group">
                                <FileImage size={14} className="group-hover:-translate-y-0.5" /> Site
                                <input type="file" accept="image/*" className="hidden" onChange={handleImportReference} />
                            </label>
                        )}
                    </div>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden relative">
                {viewMode === 'EDITOR' ? (
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
                ) : (
                    <>
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
                                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm ${ZONE_COLORS[room.zone]?.bg || 'bg-slate-100'} ${ZONE_COLORS[room.zone]?.text || 'text-slate-500'}`}>{room.zone}</span>
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
                            onMouseDown={isSketchMode ? undefined : handlePanStart}
                            onMouseMove={isSketchMode ? undefined : handleMouseMove}
                            onMouseUp={isSketchMode ? undefined : handleMouseUp}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            style={{
                                cursor: isSketchMode ? 'crosshair' : (isPanning.current ? 'grabbing' : 'grab'),
                                ...(showGrid ? {
                                    backgroundImage: `
                                        linear-gradient(to right, ${darkMode ? '#333' : '#e2e8f0'} 1px, transparent 1px),
                                        linear-gradient(to bottom, ${darkMode ? '#333' : '#e2e8f0'} 1px, transparent 1px)
                                    `,
                                    backgroundSize: `${gridSize * PIXELS_PER_METER * scale}px ${gridSize * PIXELS_PER_METER * scale}px`,
                                    backgroundPosition: `${offset.x}px ${offset.y}px`
                                } : {})
                            }}
                        >        {/* Reset selection if clicking background (unless panning) */}
                            {/* The onMouseDown handler above already handles this */}

                            {/* Background Reference Images */}
                            <div
                                className="absolute inset-0 origin-top-left"
                                style={{
                                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                                    pointerEvents: !!referenceScaleState || !!selectedReferenceImageId ? 'all' : 'none'
                                }}
                            >
                                <svg className="absolute inset-0 overflow-visible" style={{ pointerEvents: 'all' }}>
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
                                    />
                                </svg>
                            </div>

                            {/* Zone Overlay Layer - Behind everything */}
                            <div
                                className="absolute inset-0 origin-top-left pointer-events-none"
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

                            {/* Bubbles Layer */}
                            <div
                                className="absolute inset-0 origin-top-left pointer-events-none"
                                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
                            >
                                {(() => {
                                    const visibleRooms = rooms.filter(r => r.isPlaced && r.floor === currentFloor);
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
                                            otherRooms={selectedRoomIds.has(room.id) ? visibleRooms.filter(r => r.id !== room.id) : undefined}
                                            isSketchMode={isSketchMode}
                                        />
                                    ));
                                })()}
                            </div>

                            {/* Annotation Layer - Above all spaces and zones */}
                            <div
                                className={`absolute inset-0 ${isSketchMode ? '' : 'pointer-events-none'}`}
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
                            <div className="absolute top-6 left-6 flex flex-col gap-2 z-[200]">
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

                                    <button onClick={() => setSnapEnabled(!snapEnabled)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${!snapEnabled ? 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50'}`} title="Toggle Snapping"><Magnet size={16} /></button>

                                    <button
                                        onClick={() => setIsMagnetMode(!isMagnetMode)}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${!isMagnetMode ? 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50 shadow-inner'}`}
                                        title="Physics / Magnetic Zones"
                                    >
                                        <Atom size={16} className={isMagnetMode ? "animate-spin" : ""} />
                                    </button>

                                    <SketchToolbar
                                        isActive={isSketchMode}
                                        onToggle={() => setIsSketchMode(!isSketchMode)}
                                        activeType={activeSketchType}
                                        onTypeChange={setActiveSketchType}
                                        properties={selectedAnnotation ? selectedAnnotation.style : sketchProperties}
                                        onPropertyChange={handleAnnotationPropertyChange}
                                        selectedAnnotation={selectedAnnotation}
                                        onZIndex={handleZIndex}
                                        onDelete={() => selectedAnnotationId && deleteAnnotation(selectedAnnotationId)}
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

                            <div className="absolute top-6 right-6 flex flex-col items-end gap-2 z-[200]">
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

                                <ReferenceToolbar
                                    selectedImage={referenceImages.find(i => i.id === selectedReferenceImageId) || null}
                                    onUpdateImage={handleUpdateReferenceImage}
                                    onDeleteImage={handleDeleteReferenceImage}
                                    onStartScaling={(id) => setReferenceScaleState({ imageId: id, points: [], step: 'point1' })}
                                    isScalingMode={!!referenceScaleState}
                                    onCancelScaling={() => setReferenceScaleState(null)}
                                />
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
                            <div className="absolute bottom-0 left-0 right-0 h-8 bg-slate-200/50 dark:bg-black/40 flex items-start px-4 gap-1 z-40 backdrop-blur-sm border-t border-slate-200/50 dark:border-dark-border">
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
                                                                        value={selectedRoom!.area}
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
                                                                {multiSelectionStats?.totalArea.toFixed(1)} <span className="text-sm font-sans text-slate-400 dark:text-gray-500 font-bold">m²</span>
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

                                                <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border">
                                                    <div className="flex justify-between items-center mb-4">
                                                        <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase">Total Stats</span>
                                                        <span className="text-[10px] font-bold text-orange-600 bg-orange-500/10 px-2 py-1 rounded-md">{selectedZoneRooms.length} Spaces</span>
                                                    </div>
                                                    <div className="text-3xl font-sans font-bold text-slate-800 dark:text-gray-100 tracking-tight">
                                                        {zoneArea} <span className="text-sm font-sans text-slate-400 dark:text-gray-500 font-bold">m²</span>
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
                                            <div className="text-center py-24 opacity-30 px-10">
                                                <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6">
                                                    <Settings2 size={32} className="text-slate-400 dark:text-gray-500" />
                                                </div>
                                                <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed text-slate-500 dark:text-gray-500">No Selection<br />Select an object to modify its geometry and metadata.</p>
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
                    </>
                )}
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
                        onClose={() => setShowExportModal(false)}
                        viewMode={viewMode}
                        onExport={(format) => {
                            if (format === 'csv') {
                                // CSV Export Logic
                                const headers = "Name,Area,Zone,Floor\n";
                                const csvContent = rooms.map(r => `${r.name},${r.area},${r.zone},${floors.find(f => f.id === r.floor)?.label || 'Unplaced'}`).join('\n');
                                const blob = new Blob([headers + csvContent], { type: 'text/csv;charset=utf-8;' });
                                const link = document.createElement("a");
                                if (link.download !== undefined) {
                                    const url = URL.createObjectURL(blob);
                                    link.setAttribute("href", url);
                                    link.setAttribute("download", `${projectName}.csv`);
                                    link.style.visibility = 'hidden';
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                }
                                setShowExportModal(false);
                                return;
                            }
                            handleExport(format, projectName, rooms, connections, currentFloor, darkMode, zoneColors, floors, appSettings, annotations);
                            setShowExportModal(false);
                        }}
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
        </div >
    );
}