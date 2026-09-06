export function ccw(ax, ay, bx, by, cx, cy) {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
}

export function segmentsIntersect(p1, p2, p3, p4) {
    const [x1, y1] = p1;
    const [x2, y2] = p2;
    const [x3, y3] = p3;
    const [x4, y4] = p4;

    const cross1 = ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4);
    const cross2 = ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4);
    return cross1 && cross2;
}

export function sideOfLine(lineStart, lineEnd, point) {
    const [x1, y1] = lineStart;
    const [x2, y2] = lineEnd;
    const [px, py] = point;
    const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
    if (Math.abs(cross) < 1e-7) return 0;
    return cross > 0 ? 1 : -1;
}

export function checkTripwireCrossing(lineStart, lineEnd, prevPoint, currPoint, allowedDirection = 'both') {
    if (!segmentsIntersect(lineStart, lineEnd, prevPoint, currPoint)) {
        return null;
    }

    const sideBefore = sideOfLine(lineStart, lineEnd, prevPoint);
    const sideAfter = sideOfLine(lineStart, lineEnd, currPoint);

    if (sideBefore === 0 || sideAfter === 0 || sideBefore === sideAfter) {
        return null;
    }

    const crossingDirection = sideBefore > 0 && sideAfter < 0 ? 'left_to_right' : 'right_to_left';

    if (allowedDirection === 'both') {
        return { crossed: true, direction: crossingDirection };
    }

    if (allowedDirection === crossingDirection) {
        return { crossed: true, direction: crossingDirection };
    }

    return null;
}
