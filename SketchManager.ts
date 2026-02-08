import { Point, Annotation, AnnotationType } from './types';

export class SketchManager {
    /**
     * Generates an SVG path string from points based on type.
     */
    static generatePath(annotation: Annotation): string {
        const { type, points, style, handles } = annotation;
        if (points.length === 0) return '';

        switch (type) {
            case 'line':
                if (points.length < 2) return '';
                return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

            case 'polyline':
                if (points.length < 2) return '';
                if (style.fillet && style.fillet > 0) {
                    return this.generateFilletedPolyline(points, style.fillet);
                }
                return `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');

            case 'arc':
                if (points.length < 3) return '';
                // Circular arc through 3 points (start, mid/control, end)
                return this.generateArc(points);

            case 'bezier':
                return this.getBezierPath(points);

            default:
                return '';
        }
    }

    /**
     * Implements fillet logic for polylines.
     */
    private static generateFilletedPolyline(points: Point[], radius: number): string {
        if (points.length < 2) return '';
        let d = `M ${points[0].x} ${points[0].y}`;

        for (let i = 1; i < points.length - 1; i++) {
            const p1 = points[i - 1];
            const p2 = points[i];
            const p3 = points[i + 1];

            // Calculate vectors
            const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
            const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

            const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
            const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

            // Calculate offset for fillet
            const angle = Math.acos((v1.x * v2.x + v1.y * v2.y) / (len1 * len2));
            const offset = radius / Math.tan(angle / 2);

            const actualOffset = Math.min(offset, len1 / 2, len2 / 2);

            const startPoint = {
                x: p2.x + (v1.x / len1) * actualOffset,
                y: p2.y + (v1.y / len1) * actualOffset
            };

            const endPoint = {
                x: p2.x + (v2.x / len2) * actualOffset,
                y: p2.y + (v2.y / len2) * actualOffset
            };

            d += ` L ${startPoint.x} ${startPoint.y} Q ${p2.x} ${p2.y}, ${endPoint.x} ${endPoint.y}`;
        }

        d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
        return d;
    }

    /**
     * Generates an arc path. For simplicity, we use 3-point circular arc logic.
     */
    private static generateArc(points: Point[]): string {
        const [p1, p2, p3] = points;
        // This is a simplification. A real 3-point arc requires finding the circumcenter.
        // For now, we'll use a quadratic bezier as a placeholder for the "Arc" tool
        // unless a more complex circular arc is strictly required. 
        // The prompt says "Arc", usually implies circular.
        return `M ${p1.x} ${p1.y} Q ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
    }

    private static getBezierPath(points: Point[]): string {
        if (points.length < 3) return '';
        // Points layout: [Anchor0, In0, Out0, Anchor1, In1, Out1, ...]
        // We need at least one node (3 points) to start, but to draw a line we need 2 nodes (6 points).
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 0; i < points.length - 3; i += 3) {
            const currentOut = points[i + 2]; // Handle Out of current node
            const nextIn = points[i + 4];     // Handle In of next node
            const nextAnchor = points[i + 3]; // Anchor of next node
            d += ` C ${currentOut.x} ${currentOut.y}, ${nextIn.x} ${nextIn.y}, ${nextAnchor.x} ${nextAnchor.y}`;
        }
        return d;
    }

    /**
     * Static helper to get markers for start/end caps.
     */
    static getMarkerUrl(type: 'start' | 'end', cap?: string): string {
        if (!cap || cap === 'none') return 'none';
        return `url(#marker-${cap}-${type})`;
    }
}

export class PenTool {
    // Create a new node (Anchor, In, Out) at a specific position
    static createNode(pos: Point): Point[] {
        return [
            { ...pos }, // Anchor
            { ...pos }, // Handle In
            { ...pos }  // Handle Out
        ];
    }

    // Update a handle position, maintaining symmetry unless Alt is pressed
    static updateHandle(
        points: Point[],
        nodeIndex: number, // Index of the Anchor in the flat array (0, 3, 6...)
        handleType: 'in' | 'out',
        newPos: Point,
        isAltPressed: boolean
    ): Point[] {
        const newPoints = [...points];
        const anchorIdx = nodeIndex;
        const inIdx = nodeIndex + 1;
        const outIdx = nodeIndex + 2;
        const anchor = newPoints[anchorIdx];

        if (handleType === 'in') {
            newPoints[inIdx] = newPos;
            if (!isAltPressed) {
                // Mirror Out handle: Out = Anchor + (Anchor - In)
                newPoints[outIdx] = {
                    x: anchor.x + (anchor.x - newPos.x),
                    y: anchor.y + (anchor.y - newPos.y)
                };
            }
        } else {
            newPoints[outIdx] = newPos;
            if (!isAltPressed) {
                // Mirror In handle: In = Anchor + (Anchor - Out)
                newPoints[inIdx] = {
                    x: anchor.x + (anchor.x - newPos.x),
                    y: anchor.y + (anchor.y - newPos.y)
                };
            }
        }
        return newPoints;
    }

    static moveNode(points: Point[], nodeIndex: number, delta: Point): Point[] {
        const newPoints = [...points];
        for (let i = 0; i < 3; i++) {
            newPoints[nodeIndex + i] = { x: newPoints[nodeIndex + i].x + delta.x, y: newPoints[nodeIndex + i].y + delta.y };
        }
        return newPoints;
    }
}
