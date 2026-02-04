export interface Point {
  x: number;
  y: number;
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

  // Custom Shape
  polygon?: Point[];
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
  'Public': { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-900' },
  'Private': { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-900' },
  'Service': { bg: 'bg-gray-200', border: 'border-gray-400', text: 'text-gray-900' },
  'Circulation': { bg: 'bg-yellow-100', border: 'border-yellow-400', text: 'text-yellow-900' },
  'Outdoor': { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-900' },
  'Admin': { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-900' },
  'Default': { bg: 'bg-white', border: 'border-slate-300', text: 'text-slate-700' },
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
    fontFamily: 'font-mono',
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
    fontFamily: 'font-mono tracking-tight',
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