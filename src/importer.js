import { identity, multiply, objectMatrix, assignMatrix, unionBounds, clamp } from './math.js';
import { createObject } from './model.js';
function svgTransform(value = '') { let matrix = identity(); for (const m of value.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const v = m[2].trim().split(/[\s,]+/).map(Number);
    if (v.some(n => !Number.isFinite(n)))
        continue;
    let n = identity();
    const a = (v[0] || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    switch (m[1]) {
        case 'matrix':
            if (v.length === 6)
                n = v;
            break;
        case 'translate':
            n = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
            break;
        case 'scale':
            n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
            break;
        case 'rotate':
            n = [c, s, -s, c, 0, 0];
            if (v.length > 2)
                n = multiply(multiply([1, 0, 0, 1, v[1], v[2]], n), [1, 0, 0, 1, -v[1], -v[2]]);
            break;
        case 'skewX':
            n = [1, 0, Math.tan(a), 1, 0, 0];
            break;
        case 'skewY':
            n = [1, Math.tan(a), 0, 1, 0, 0];
            break;
    }
    matrix = multiply(matrix, n);
} return matrix; }
function arcCubics(x1, y1, rx, ry, rotation, large, sweep, x2, y2) {
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    if (!rx || !ry || (x1 === x2 && y1 === y2))
        return [];
    const phi = rotation * Math.PI / 180, c = Math.cos(phi), s = Math.sin(phi), dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x = c * dx + s * dy, y = -s * dx + c * dy;
    const scale = x * x / (rx * rx) + y * y / (ry * ry);
    if (scale > 1) {
        rx *= Math.sqrt(scale);
        ry *= Math.sqrt(scale);
    }
    const sign = large === sweep ? -1 : 1, n = Math.max(0, (rx * rx * ry * ry - rx * rx * y * y - ry * ry * x * x) / (rx * rx * y * y + ry * ry * x * x)), coef = sign * Math.sqrt(n), cxp = coef * rx * y / ry, cyp = -coef * ry * x / rx, cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
    const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy), start = angle(1, 0, (x - cxp) / rx, (y - cyp) / ry);
    let delta = angle((x - cxp) / rx, (y - cyp) / ry, (-x - cxp) / rx, (-y - cyp) / ry);
    if (!sweep && delta > 0)
        delta -= Math.PI * 2;
    if (sweep && delta < 0)
        delta += Math.PI * 2;
    const count = Math.ceil(Math.abs(delta) / (Math.PI / 2)), step = delta / count, at = t => ({ x: cx + rx * c * Math.cos(t) - ry * s * Math.sin(t), y: cy + rx * s * Math.cos(t) + ry * c * Math.sin(t) }), deriv = t => ({ x: -rx * c * Math.sin(t) - ry * s * Math.cos(t), y: -rx * s * Math.sin(t) + ry * c * Math.cos(t) }), out = [];
    for (let i = 0; i < count; i++) {
        const a = start + i * step, b = a + step, k = 4 / 3 * Math.tan(step / 4), pa = at(a), pb = at(b), da = deriv(a), db = deriv(b);
        out.push([{ x: pa.x + k * da.x, y: pa.y + k * da.y }, { x: pb.x - k * db.x, y: pb.y - k * db.y }, pb]);
    }
    return out;
}
export function parseSVGPath(data) {
    const tokens = (data || '').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || [];
    if (tokens.length > 200000)
        throw new Error('SVG path is too large.');
    const paths = [];
    let i = 0, command = '', x = 0, y = 0, startX = 0, startY = 0, current = null, previous = '', lastControl = null, lastQuadratic = null;
    const isCmd = t => /^[a-zA-Z]$/.test(t), number = () => { if (i >= tokens.length || isCmd(tokens[i]))
        throw new Error('Malformed SVG path.'); const n = Number(tokens[i++]); if (!Number.isFinite(n))
        throw new Error('Invalid SVG number.'); return n; };
    const append = (nx, ny, c1 = null, c2 = null) => { if (!current) {
        current = { points: [{ x, y }], closed: false };
        paths.push(current);
    } if (c1) {
        const a = current.points.at(-1);
        a.outX = c1.x;
        a.outY = c1.y;
    } const p = { x: nx, y: ny }; if (c2) {
        p.inX = c2.x;
        p.inY = c2.y;
    } current.points.push(p); x = nx; y = ny; };
    while (i < tokens.length) {
        if (isCmd(tokens[i]))
            command = tokens[i++];
        else if (!command)
            throw new Error('SVG path requires a command.');
        const rel = command === command.toLowerCase(), cmd = command.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
        if (cmd === 'Z') {
            if (current) {
                current.closed = true;
                const a = current.points[0], b = current.points.at(-1);
                if (a !== b && Math.hypot(a.x - b.x, a.y - b.y) < 1e-8) {
                    if (b.inX !== undefined) {
                        a.inX = b.inX;
                        a.inY = b.inY;
                    }
                    current.points.pop();
                }
            }
            x = startX;
            y = startY;
            command = '';
            previous = 'Z';
            lastControl = lastQuadratic = null;
            continue;
        }
        if (cmd === 'M') {
            x = number() + ox;
            y = number() + oy;
            startX = x;
            startY = y;
            current = { points: [{ x, y }], closed: false };
            paths.push(current);
            command = rel ? 'l' : 'L';
        }
        else if (cmd === 'L')
            append(number() + ox, number() + oy);
        else if (cmd === 'H')
            append(number() + ox, y);
        else if (cmd === 'V')
            append(x, number() + oy);
        else if (cmd === 'C') {
            const c1 = { x: number() + ox, y: number() + oy }, c2 = { x: number() + ox, y: number() + oy }, nx = number() + ox, ny = number() + oy;
            append(nx, ny, c1, c2);
            lastControl = c2;
        }
        else if (cmd === 'S') {
            const c1 = ['C', 'S'].includes(previous) && lastControl ? { x: 2 * x - lastControl.x, y: 2 * y - lastControl.y } : { x, y }, c2 = { x: number() + ox, y: number() + oy };
            append(number() + ox, number() + oy, c1, c2);
            lastControl = c2;
        }
        else if (cmd === 'Q' || cmd === 'T') {
            const q = cmd === 'Q' ? { x: number() + ox, y: number() + oy } : ['Q', 'T'].includes(previous) && lastQuadratic ? { x: 2 * x - lastQuadratic.x, y: 2 * y - lastQuadratic.y } : { x, y };
            const nx = number() + ox, ny = number() + oy, c1 = { x: x + 2 / 3 * (q.x - x), y: y + 2 / 3 * (q.y - y) }, c2 = { x: nx + 2 / 3 * (q.x - nx), y: ny + 2 / 3 * (q.y - ny) };
            append(nx, ny, c1, c2);
            lastQuadratic = q;
        }
        else if (cmd === 'A') {
            const rx = number(), ry = number(), r = number(), large = number(), sweep = number(), nx = number() + ox, ny = number() + oy;
            const curves = arcCubics(x, y, rx, ry, r, large, sweep, nx, ny);
            if (!curves.length)
                append(nx, ny);
            else
                for (const [c1, c2, end] of curves)
                    append(end.x, end.y, c1, c2);
        }
        else
            throw new Error('Unsupported SVG path command: ' + cmd);
        previous = cmd;
        if (!['C', 'S'].includes(cmd))
            lastControl = null;
        if (!['Q', 'T'].includes(cmd))
            lastQuadratic = null;
    }
    return paths;
}
export function normalizePathObject(o) {
    if (!o.points?.length)
        return o;
    const xs = [], ys = [];
    for (const p of o.points) {
        xs.push(p.x);
        ys.push(p.y);
        if (p.inX !== undefined) {
            xs.push(p.inX);
            ys.push(p.inY);
        }
        if (p.outX !== undefined) {
            xs.push(p.outX);
            ys.push(p.outY);
        }
    }
    const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(.01, Math.max(...xs) - x), h = Math.max(.01, Math.max(...ys) - y);
    for (const p of o.points) {
        p.x -= x;
        p.y -= y;
        if (p.inX !== undefined) {
            p.inX -= x;
            p.inY -= y;
        }
        if (p.outX !== undefined) {
            p.outX -= x;
            p.outY -= y;
        }
    }
    o.x += x;
    o.y += y;
    o.w = w;
    o.h = h;
    return o;
}
export function importSVG(source) {
    if (source.length > 16 * 1024 * 1024)
        throw new Error('SVG files are limited to 16 MiB.');
    const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'svg')
        throw new Error('Invalid SVG document.');
    const objects = [], warnings = new Set();
    let nodes = 0;
    const num = (e, k, def = 0) => { const n = parseFloat(e.getAttribute(k)); return Number.isFinite(n) ? clamp(n, -1e6, 1e6) : def; };
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    const colorContext = probe.getContext('2d', { willReadFrequently: true });
    const cssColor = v => { if (!v || v === 'none' || v === 'transparent')
        return v || '#000000'; colorContext.clearRect(0, 0, 1, 1); colorContext.fillStyle = '#000000'; colorContext.fillStyle = v; colorContext.fillRect(0, 0, 1, 1); const rgba = colorContext.getImageData(0, 0, 1, 1).data; return '#' + [...rgba].map(n => n.toString(16).padStart(2, '0')).join(''); };
    const visit = (el, parent, style, alpha, depth) => {
        if (++nodes > 10000 || depth > 32)
            throw new Error('SVG nesting or element limit exceeded.');
        const tag = el.localName, own = { ...style };
        for (const entry of (el.getAttribute('style') || '').split(';')) {
            const n = entry.indexOf(':');
            if (n > 0)
                own[entry.slice(0, n).trim()] = entry.slice(n + 1).trim();
        }
        for (const k of ['fill', 'stroke', 'stroke-width', 'font-family', 'font-size', 'font-weight', 'fill-opacity', 'stroke-opacity', 'display', 'visibility'])
            if (el.hasAttribute(k))
                own[k] = el.getAttribute(k);
        if (own.display === 'none' || own.visibility === 'hidden')
            return;
        const m = multiply(parent, svgTransform(el.getAttribute('transform') || '')), opacity = alpha * num(el, 'opacity', 1);
        if (['defs', 'metadata', 'title', 'desc', 'script', 'style', 'foreignObject', 'clipPath', 'mask', 'linearGradient', 'radialGradient'].includes(tag)) {
            if (['clipPath', 'mask', 'style'].includes(tag))
                warnings.add('Masks, clip paths, and CSS stylesheets are not imported.');
            return;
        }
        if (tag === 'svg' || tag === 'g' || tag === 'a') {
            for (const child of el.children)
                visit(child, m, own, opacity, depth + 1);
            return;
        }
        if (el.hasAttribute('filter') || el.hasAttribute('clip-path') || el.hasAttribute('mask'))
            warnings.add('SVG filters, clipping, and masks were omitted.');
        const props = { name: el.getAttribute('id') || tag, fill: cssColor(own.fill || '#000000'), stroke: cssColor(own.stroke || 'none'), strokeWidth: parseFloat(own['stroke-width']) || 1, opacity: opacity * (Number.isFinite(parseFloat(own['fill-opacity'])) ? parseFloat(own['fill-opacity']) : 1) };
        if (/^url\(/.test(own.fill || '')) {
            props.fill = '#9b82e9';
            warnings.add('SVG paint-server gradients are replaced with a solid color.');
        }
        let shapes = [];
        if (tag === 'rect')
            shapes = [createObject('rect', { ...props, x: num(el, 'x'), y: num(el, 'y'), w: num(el, 'width', 100), h: num(el, 'height', 100), radius: num(el, 'rx') })];
        else if (tag === 'circle' || tag === 'ellipse') {
            const rx = num(el, tag === 'circle' ? 'r' : 'rx', 50), ry = tag === 'circle' ? rx : num(el, 'ry', 50);
            shapes = [createObject('ellipse', { ...props, x: num(el, 'cx') - rx, y: num(el, 'cy') - ry, w: rx * 2, h: ry * 2 })];
        }
        else if (tag === 'line')
            shapes = [normalizePathObject(createObject('line', { ...props, fill: 'none', points: [{ x: num(el, 'x1'), y: num(el, 'y1') }, { x: num(el, 'x2'), y: num(el, 'y2') }] }))];
        else if (tag === 'polyline' || tag === 'polygon') {
            const ns = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
            const points = [];
            for (let i = 0; i + 1 < ns.length; i += 2)
                if (Number.isFinite(ns[i]) && Number.isFinite(ns[i + 1]))
                    points.push({ x: ns[i], y: ns[i + 1] });
            shapes = [normalizePathObject(createObject('path', { ...props, points, closed: tag === 'polygon' }))];
        }
        else if (tag === 'path') {
            const paths = parseSVGPath(el.getAttribute('d'));
            if (paths.length > 1)
                warnings.add('Compound SVG subpaths are separate shapes; cutout holes are not preserved.');
            shapes = paths.map(path => normalizePathObject(createObject('path', { ...props, ...path })));
        }
        else if (tag === 'text') {
            const fontSize = parseFloat(own['font-size']) || 24;
            shapes = [createObject('text', { ...props, x: num(el, 'x'), y: num(el, 'y') - fontSize * .8, w: Math.max(50, el.textContent.length * fontSize * .65), h: fontSize * 1.3, text: el.textContent, fontSize, fontFamily: (own['font-family'] || 'Arial').split(',')[0].replace(/["']/g, ''), fontWeight: parseInt(own['font-weight']) || 400 })];
        }
        else {
            warnings.add(`SVG <${tag}> elements are not imported.`);
            return;
        }
        for (const o of shapes) {
            if (o.w <= 0 || o.h <= 0)
                continue;
            assignMatrix(o, multiply(m, objectMatrix(o)));
            objects.push(o);
        }
    };
    visit(xml.documentElement, identity(), {}, 1, 0);
    if (!objects.length)
        throw new Error('No supported vector shapes were found in this SVG.');
    const b = unionBounds(objects);
    objects.forEach(o => { o.x -= b.x; o.y -= b.y; });
    return { object: createObject('group', { name: 'Imported SVG', w: Math.max(1, b.w), h: Math.max(1, b.h), children: objects, fill: 'none' }), warnings: [...warnings] };
}
