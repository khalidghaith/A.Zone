import { Room } from '../types';

/**
 * Generates a basic DXF string from rooms.
 * This is a simplified implementation for the rebuild.
 */
export const generateDXF = (projectName: string, rooms: Room[]): string => {
  let dxf = "0\nSECTION\n2\nENTITIES\n";

  rooms.filter(r => r.isPlaced).forEach(room => {
    // Add Room Name
    dxf += "0\nTEXT\n8\nROOM_NAMES\n10\n" + (room.x + room.width / 2) + "\n20\n" + (room.y + room.height / 2) + "\n40\n2.0\n1\n" + room.name + "\n";

    // Add Room Boundary (LWPOLYLINE)
    const points = room.polygon || [
      { x: room.x, y: room.y },
      { x: room.x + room.width, y: room.y },
      { x: room.x + room.width, y: room.y + room.height },
      { x: room.x, y: room.y + room.height }
    ];

    dxf += "0\nLWPOLYLINE\n8\nROOM_BOUNDARIES\n90\n" + points.length + "\n70\n1\n";
    points.forEach(p => {
      dxf += "10\n" + p.x + "\n20\n" + p.y + "\n";
    });
  });

  dxf += "0\nENDSEC\n0\nEOF";
  return dxf;
};

export const downloadDXF = (projectName: string, rooms: Room[]) => {
  const dxfContent = generateDXF(projectName, rooms);
  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${projectName.replace(/\s+/g, '_')}.dxf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};