import { Annotation, Point } from './types';

export const SketchManager = {
    generatePath: (annotation: Annotation): string => {
        const { type, points } = annotation;
        if (!points || points.length === 0) return '';

        switch (type) {
            case 'line':
            case 'arrow':
                if (points.length < 2) return '';
                return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
            case 'polyline':
                if (points.length < 2) return '';
                return `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
            case 'rect':
                if (points.length < 2) return '';
                const [p1, p2] = points;
                const x = Math.min(p1.x, p2.x);
                const y = Math.min(p1.y, p2.y);
                const w = Math.abs(p1.x - p2.x);
                const h = Math.abs(p1.y - p2.y);
                return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
            case 'circle':
                if (points.length < 2) return '';
                const [c, e] = points;
                const r = Math.sqrt(Math.pow(e.x - c.x, 2) + Math.pow(e.y - c.y, 2));
                return `M ${c.x + r} ${c.y} A ${r} ${r} 0 1 0 ${c.x - r} ${c.y} A ${r} ${r} 0 1 0 ${c.x + r} ${c.y}`;
            case 'arc':
                if (points.length < 3) return '';
                return getThreePointArc(points[0], points[1], points[2]);
            case 'bezier':
                if (points.length < 4) return '';
                return `M ${points[0].x} ${points[0].y} C ${points[1].x} ${points[1].y}, ${points[2].x} ${points[2].y}, ${points[3].x} ${points[3].y}`;
            default:
                return '';
        }
    },

    getMarkerUrl: (type: 'start' | 'end', cap: string) => {
        if (!cap || cap === 'none') return 'none';
        return `url(#marker-${cap}-${type})`;
    }
};

function getThreePointArc(p1: Point, p2: Point, p3: Point): string {
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;

    const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(D) < 0.001) return `M ${x1} ${y1} L ${x3} ${y3}`; // Collinear

    const centerX = ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1) + (x3 * x3 + y3 * y3) * (y1 - y2)) / D;
    const centerY = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / D;
    const radius = Math.sqrt(Math.pow(x1 - centerX, 2) + Math.pow(y1 - centerY, 2));

    const startAngle = Math.atan2(y1 - centerY, x1 - centerX);
    const endAngle = Math.atan2(y3 - centerY, x3 - centerX);

    // Determine sweep flag
    // Vector p1->p2
    const v1x = x2 - x1;
    const v1y = y2 - y1;
    // Vector p2->p3
    const v2x = x3 - x2;
    const v2y = y3 - y2;
    // Cross product z-component
    const cross = v1x * v2y - v1y * v2x;
    const sweepFlag = cross > 0 ? 1 : 0;

    // Determine large arc flag
    let angleDiff = endAngle - startAngle;
    if (sweepFlag === 1) {
        if (angleDiff < 0) angleDiff += 2 * Math.PI;
    } else {
        if (angleDiff > 0) angleDiff -= 2 * Math.PI;
    }
    const largeArcFlag = Math.abs(angleDiff) > Math.PI ? 1 : 0;

    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${x3} ${y3}`;
}
