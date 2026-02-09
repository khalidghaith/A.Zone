export interface Point {
  x: number;
  y: number;
}

export interface RoomStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  cornerRadius?: number;
}

export interface Room {
  id: string;
  name: string;
  area: number; // in square meters
  zone: string;
  description?: string;

  // Placement
  isPlaced: boolean;
  floor: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;

  // Custom Shape
  polygon?: Point[];
  shape?: 'rect' | 'polygon' | 'bubble';
  style?: RoomStyle;
}

export interface ZoneColor {
  bg: string;
  border: string;
  text: string;
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
}

export interface DiagramStyle {
  id: string;
  name: string;
  fontFamily: string;
  cornerRadius: string;
  borderWidth: number;
  opacity: number;
  sketchy: boolean;
  shadow: string;
  colorMode: 'default' | 'monochrome' | 'pastel';
}

export interface AnalysisResponse {
  projectName: string;
  spaces: Array<{
    name: string;
    area: number;
    zone: string;
    description: string;
  }>;
}

export const ZONE_COLORS: Record<string, ZoneColor> = {
  'Public': { bg: 'bg-orange-100 dark:bg-orange-500/20', border: 'border-orange-400 dark:border-orange-400/50', text: 'text-orange-900 dark:text-orange-100' },
  'Private': { bg: 'bg-blue-100 dark:bg-blue-500/20', border: 'border-blue-400 dark:border-blue-400/50', text: 'text-blue-900 dark:text-blue-100' },
  'Service': { bg: 'bg-gray-200 dark:bg-gray-500/20', border: 'border-gray-400 dark:border-gray-400/50', text: 'text-gray-900 dark:text-gray-200' },
  'Circulation': { bg: 'bg-yellow-100 dark:bg-yellow-500/20', border: 'border-yellow-400 dark:border-yellow-400/50', text: 'text-yellow-900 dark:text-yellow-100' },
  'Outdoor': { bg: 'bg-green-100 dark:bg-green-500/20', border: 'border-green-400 dark:border-green-400/50', text: 'text-green-900 dark:text-green-100' },
  'Admin': { bg: 'bg-purple-100 dark:bg-purple-500/20', border: 'border-purple-400 dark:border-purple-400/50', text: 'text-purple-900 dark:text-purple-100' },
  'Default': { bg: 'bg-white dark:bg-white/10', border: 'border-slate-300 dark:border-white/20', text: 'text-slate-700 dark:text-slate-300' },
};

export const DIAGRAM_STYLES: DiagramStyle[] = [
  {
    id: 'standard',
    name: 'Standard',
    fontFamily: 'font-sans',
    cornerRadius: 'rounded-lg',
    borderWidth: 2,
    opacity: 0.9,
    sketchy: false,
    shadow: 'shadow-sm',
    colorMode: 'default'
  },
  {
    id: 'minimal',
    name: 'Minimal',
    fontFamily: 'font-sans font-light',
    cornerRadius: 'rounded-sm',
    borderWidth: 1,
    opacity: 0.8,
    sketchy: false,
    shadow: 'shadow-none',
    colorMode: 'default'
  },
  {
    id: 'sketchy',
    name: 'Sketchy',
    fontFamily: 'font-sans',
    cornerRadius: 'rounded-[255px_15px_225px_15px/15px_225px_15px_255px]',
    borderWidth: 2,
    opacity: 0.9,
    sketchy: true,
    shadow: 'shadow-md',
    colorMode: 'pastel'
  },
  {
    id: 'monochrome',
    name: 'Technical',
    fontFamily: 'font-sans tracking-tight',
    cornerRadius: 'rounded-none',
    borderWidth: 1,
    opacity: 1,
    sketchy: false,
    shadow: 'shadow-none',
    colorMode: 'monochrome'
  }
];

export const FLOORS = [
  { id: -1, label: 'Basement' },
  { id: 0, label: 'Ground Floor' },
  { id: 1, label: 'Level 1' },
  { id: 2, label: 'Level 2' },
  { id: 3, label: 'Level 3' },
  { id: 4, label: 'Roof' },
];

export interface AppSettings {
  zoneTransparency: number;
  zonePadding: number;
  strokeWidth: number;
  cornerRadius: number;
  fontSize: number;
  snapTolerance: number;
  snapToGrid: boolean;
  snapToObjects: boolean;
  snapWhileScaling: boolean;
}

export type AnnotationType = 'line' | 'polyline' | 'arc' | 'bezier' | 'text' | 'rect' | 'circle' | 'arrow';
export type ArrowCapType = 'none' | 'arrow' | 'circle' | 'square';

export interface Annotation {
  id: string;
  type: AnnotationType;
  points: Point[];
  floor: number;
  style: {
    stroke: string;
    strokeWidth: number;
    strokeDash?: string;
    fill?: string;
    opacity: number;
    startCap?: ArrowCapType;
    endCap?: ArrowCapType;
    fillet?: number; // for polylines
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    textAlign?: 'left' | 'center' | 'right';
    text?: string;
  };
  handles?: Point[]; // for Bezier curves
}
