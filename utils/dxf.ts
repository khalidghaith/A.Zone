import { Room } from "../types";

export const generateDXF = (rooms: Room[], pixelsPerMeter: number): string => {
  let dxf = `0
SECTION
2
HEADER
0
ENDSEC
0
SECTION
2
TABLES
0
ENDSEC
0
SECTION
2
ENTITIES
`;

  // Helper to convert pixel coords to CAD units (meters), flipping Y for CAD
  // Assuming 0,0 is roughly top-left in web, we might want to invert Y
  const p2m = (val: number) => val / pixelsPerMeter;

  rooms.filter(r => r.isPlaced).forEach(room => {
    const x = p2m(room.x);
    const y = -p2m(room.y); // Flip Y
    const w = p2m(room.width);
    const h = p2m(room.height);

    // Create a closed polyline (LWPOLYLINE)
    dxf += `0
LWPOLYLINE
8
${room.zone}
100
AcDbEntity
100
AcDbPolyline
62
${getColorCode(room.zone)}
90
4
70
1
10
${x}
20
${y}
10
${x + w}
20
${y}
10
${x + w}
20
${y - h}
10
${x}
20
${y - h}
`;
    
    // Add Text Label
    dxf += `0
TEXT
8
TEXT
100
AcDbEntity
100
AcDbText
10
${x + w/2}
20
${y - h/2}
40
${Math.min(w, h) * 0.15}
1
${room.name}
`;
  });

  dxf += `0
ENDSEC
0
EOF`;

  return dxf;
};

// Simple AutoCAD color index mapping
const getColorCode = (zone: string): number => {
  if (zone.includes("Public")) return 1; // Red
  if (zone.includes("Private")) return 5; // Blue
  if (zone.includes("Service")) return 253; // Gray
  if (zone.includes("Outdoor")) return 3; // Green
  return 7; // White/Black
};