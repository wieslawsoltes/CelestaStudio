import { createProject, createObject, createLayer, clone, uid } from './model.js';
export function createDemo() {
    const p = createProject();
    p.name = 'A little space';
    p.duration = 96;
    p.background = '#f7f3eb';
    const rect = (x, y, w, h, fill, radius = 0, extra = {}) => createObject('rect', { x, y, w, h, fill, radius, ...extra });
    const circle = (x, y, w, h, fill, extra = {}) => createObject('ellipse', { x, y, w, h, fill, ...extra });
    const path = (points, fill, extra = {}) => { const xs = points.map(p => p[0]), ys = points.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys); return createObject('path', { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, fill, closed: true, points: points.map(p => ({ x: p[0] - x, y: p[1] - y })), ...extra }); };
    const text = (x, y, w, h, value, size, fill = '#343044', extra = {}) => createObject('text', { x, y, w, h, text: value, fontSize: size, fontFamily: 'Arial', fontWeight: 400, fill, name: value, ...extra });
    const star = (x, y, size, fill) => path([[x + size / 2, y], [x + size * .62, y + size * .38], [x + size, y + size / 2], [x + size * .62, y + size * .62], [x + size / 2, y + size], [x + size * .38, y + size * .62], [x, y + size / 2], [x + size * .38, y + size * .38]], fill, { name: 'Starlight' });
    const rocketParts = [
        path([[24, 103], [7, 132], [8, 165], [38, 141]], '#df6a4f', { name: 'Port fin' }),
        path([[77, 102], [95, 132], [94, 164], [63, 142]], '#ed8862', { name: 'Starboard fin' }),
        createObject('path', { name: 'Hull', x: 20, y: 0, w: 64, h: 147, fill: '#f1a17a', closed: true, points: [{ x: 32, y: 0, outX: 58, outY: 24 }, { x: 64, y: 78, inX: 64, inY: 36, outX: 64, outY: 119 }, { x: 54, y: 147, inX: 61, inY: 132 }, { x: 10, y: 147 }, { x: 0, y: 78, inX: 0, inY: 122, outX: 0, outY: 39 }] }),
        createObject('path', { name: 'Sunlit hull', x: 22, y: 0, w: 32, h: 145, fill: '#ffc39d', closed: true, points: [{ x: 30, y: 0, outX: 15, outY: 41 }, { x: 22, y: 144, inX: 16, inY: 115 }, { x: 8, y: 144 }, { x: 0, y: 79, inX: 0, inY: 119, outX: 0, outY: 41 }] }),
        circle(32, 57, 42, 42, '#434153', { name: 'Window rim' }), circle(38, 63, 30, 30, '#b8dcd5', { name: 'Window' }), circle(42, 67, 12, 12, '#e9f8ef', { name: 'Reflection' }),
        rect(35, 143, 35, 9, '#504558', 3, { name: 'Engine' }),
        createObject('path', { name: 'Flame', x: 35, y: 153, w: 35, h: 69, fill: '#f4c177', closed: true, points: [{ x: 0, y: 0 }, { x: 35, y: 0 }, { x: 18, y: 69, inX: 37, inY: 36, outX: 0, outY: 38 }] }),
        createObject('path', { name: 'Flame core', x: 43, y: 153, w: 19, h: 43, fill: '#ffe6b5', closed: true, points: [{ x: 0, y: 0 }, { x: 19, y: 0 }, { x: 10, y: 43, inX: 20, inY: 23, outX: 0, outY: 24 }] })
    ];
    const rocket = { id: uid('s'), name: 'Explorer / rocket', w: 104, h: 222, objects: rocketParts };
    const planetParts = [circle(0, 0, 220, 220, '#baa6e2', { name: 'Planet', fillEnd: '#8773b4' }), circle(36, 34, 41, 37, '#a48fcb', { name: 'Crater 01', opacity: .6 }), circle(118, 126, 65, 57, '#917bb9', { name: 'Crater 02', opacity: .5 }), circle(140, 39, 20, 19, '#d5c6ee', { name: 'Crater 03', opacity: .7 }), circle(43, 136, 22, 22, '#cbb9e7', { name: 'Crater 04', opacity: .7 })];
    const planet = { id: uid('s'), name: 'Lavender / planet', w: 220, h: 220, objects: planetParts };
    const sparkle = { id: uid('s'), name: 'Four-point / star', w: 32, h: 32, objects: [star(0, 0, 32, '#8873ab')] };
    p.symbols = [rocket, planet, sparkle];
    const backdrop = createLayer('Atmosphere', [
        circle(743, 117, 360, 360, '#f0ebe4', { name: 'Soft halo' }),
        circle(647, 97, 566, 405, 'none', { name: 'Orbit / outer', stroke: '#d8d0da', strokeWidth: 1.4, rotation: -24 }),
        circle(710, 164, 448, 285, 'none', { name: 'Orbit / inner', stroke: '#ded6df', strokeWidth: 1, rotation: -24 }),
        circle(688, 561, 34, 34, '#d8e4dc', { name: 'Distant world' }), circle(701, 564, 21, 26, '#b4c9bf', { name: 'Distant shadow', opacity: .7 }),
        rect(94, 567, 1092, 1, '#ded8d1', 0, { name: 'Editorial rule' })
    ], '#b3abb9');
    backdrop.locked = true;
    const lettering = createLayer('Typography', [
        text(96, 101, 390, 20, 'A SMALL JOURNEY. A BIG POSSIBILITY.', 12, '#8a8087', { fontWeight: 600 }),
        text(92, 214, 515, 89, 'Ideas need', 78, '#3a3449', { fontWeight: 600 }),
        text(94, 290, 440, 116, 'space.', 108, '#7d67a7', { fontFamily: 'Georgia', italic: true }),
        text(98, 431, 440, 30, 'A little curiosity can take you a long way.', 18, '#8d8390'),
        text(96, 610, 410, 24, 'LET YOUR IMAGINATION WANDER  ↗', 12, '#6b5b80', { fontWeight: 600 }),
        text(956, 104, 226, 18, 'CELESTA ORIGINALS / 001', 11, '#9e94a1', { align: 'right' }),
        text(928, 611, 259, 20, 'AN EXPLORATION IN MOTION', 10, '#9e94a1', { align: 'right' })
    ], '#d3b386');
    lettering.locked = true;
    const world = createObject('symbol', { name: 'Lavender planet', symbolId: planet.id, x: 814, y: 275, w: 220, h: 220, rotation: -12 });
    const worlds = createLayer('Little worlds', [world, circle(1110, 210, 56, 56, '#dc9f7b', { name: 'Peach moon', fillEnd: '#be795e' }), circle(604, 173, 21, 21, '#b8cfc0', { name: 'Mint moon' })], '#77bcae');
    worlds.keys[0].tween = 'motion';
    worlds.keys[0].ease = 'ease-in-out';
    for (const [frame, dy, rotation] of [[47, -14, 8], [95, 0, -12]]) {
        const objs = clone(worlds.keys[0].objects);
        objs[0].y += dy;
        objs[0].rotation = rotation;
        worlds.keys.push({ frame, objects: objs, tween: 'motion', ease: 'ease-in-out' });
    }
    const stars = [];
    const coords = [[760, 149, 20], [1119, 401, 27], [686, 354, 18], [1048, 130, 11], [1204, 305, 12], [808, 523, 13], [966, 206, 13], [676, 456, 8], [1162, 529, 16], [566, 496, 10]];
    for (const [x, y, s] of coords)
        stars.push(star(x, y, s, '#b7a7c8'));
    for (const [x, y, r] of [[746, 262, 3], [1040, 521, 2], [1192, 167, 3], [667, 228, 2], [762, 466, 3], [1134, 332, 2], [883, 119, 2], [591, 280, 2], [1098, 575, 2]])
        stars.push(circle(x, y, r * 2, r * 2, '#bdb0c6', { name: 'Stardust' }));
    const starfield = createLayer('Starlight', stars, '#d69aad');
    starfield.keys[0].tween = 'motion';
    starfield.keys[0].ease = 'ease-in-out';
    const starsMid = clone(stars);
    starsMid.forEach((s, i) => { s.opacity = i % 2 ? .4 : .85; s.rotation = i % 2 ? 40 : -20; });
    starfield.keys.push({ frame: 47, objects: starsMid, tween: 'motion', ease: 'ease-in-out' }, { frame: 95, objects: clone(stars), tween: 'none', ease: 'linear' });
    const ship = createObject('symbol', { name: 'Explorer', symbolId: rocket.id, x: 933, y: 162, w: 104, h: 222, rotation: 32, scaleX: .75, scaleY: .75 });
    const flight = createLayer('Explorer', [ship], '#a38be7');
    flight.keys[0].tween = 'motion';
    flight.keys[0].ease = 'ease-in-out';
    for (const [frame, x, y, r] of [[23, 983, 128, 40], [47, 927, 92, 20], [71, 873, 134, 14], [95, 933, 162, 32]]) {
        const s = clone(ship);
        s.x = x;
        s.y = y;
        s.rotation = r;
        flight.keys.push({ frame, objects: [s], tween: 'motion', ease: 'ease-in-out' });
    }
    const orbit = createLayer('Orbit accents', [circle(773, 495, 8, 8, '#ba93cb', { name: 'Orbiting dot' }), circle(1134, 126, 5, 5, '#d3b886', { name: 'Distant dot' })], '#a3a6d5');
    orbit.keys[0].tween = 'motion';
    orbit.keys[0].ease = 'linear';
    const end = clone(orbit.keys[0].objects);
    end[0].x = 1160;
    end[0].y = 216;
    orbit.keys.push({ frame: 47, objects: end, tween: 'motion', ease: 'linear' }, { frame: 95, objects: clone(orbit.keys[0].objects), tween: 'none', ease: 'linear' });
    p.layers = [backdrop, lettering, worlds, starfield, flight, orbit];
    return p;
}
