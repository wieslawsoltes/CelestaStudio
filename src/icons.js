export const iconPaths = {
    select: 'M5 3l13 9-7 1-3 7z', transform: 'M5 5h14v14H5z M3 3h4v4H3z M17 3h4v4h-4z M3 17h4v4H3z M17 17h4v4h-4z',
    node: 'M5 19l3-8L19 3l2 2-8 11-8 3z M8 11l5 5 M5 19l-2 2', pen: 'M12 3l7 11-7 7-7-7z M12 3v10 M10 13a2 2 0 104 0a2 2 0 10-4 0',
    brush: 'M8 15L18 3l3 3L10 17 M10 17c0 5-5 5-7 4 2-1 0-5 5-6z', rect: 'M4 4h16v16H4z', ellipse: 'M21 12a9 9 0 11-18 0a9 9 0 1118 0', line: 'M4 20L20 4', text: 'M4 5V3h16v2 M12 3v18 M8 21h8',
    hand: 'M8 12V5a2 2 0 014 0v6-8a2 2 0 014 0v8-5a2 2 0 014 0v9c0 4-2 7-6 7h-2c-2 0-3-1-4-3l-5-6c-1-2 1-4 3-2l2 2',
    zoom: 'M15 15l6 6 M17 10a7 7 0 11-14 0a7 7 0 1114 0 M7 10h6 M10 7v6', bucket: 'M9 3l9 9-8 8-9-9 8-8z M3 13h14 M20 14s-3 3-3 5a3 3 0 006 0c0-2-3-5-3-5z', eraser: 'M4 15L15 4l6 6-11 11H7l-3-3z M9 10l6 6 M10 21h11',
    play: 'M8 4l12 8-12 8z', pause: 'M7 4h3v16H7z M14 4h3v16h-3z', stop: 'M5 5h14v14H5z', prev: 'M6 5v14 M18 5l-10 7 10 7z', next: 'M18 5v14 M6 5l10 7-10 7z', first: 'M5 5v14 M19 5L8 12l11 7z', last: 'M19 5v14 M5 5l11 7-11 7z',
    loop: 'M20 7l-3-3H7a4 4 0 00-4 4v2 M20 3v4h-4 M4 17l3 3h10a4 4 0 004-4v-2 M4 21v-4h4',
    onion: 'M15 3a9 9 0 100 18 M20 12a6 6 0 11-12 0a6 6 0 1112 0',
    plus: 'M12 5v14 M5 12h14', minus: 'M5 12h14', close: 'M6 6l12 12 M18 6L6 18', chevron: 'M8 4l8 8-8 8', down: 'M6 9l6 6 6-6',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M15 12a3 3 0 11-6 0a3 3 0 116 0', eyeoff: 'M3 3l18 18 M10 5h2c6 0 10 7 10 7s-1 2-4 4 M6 6c-3 2-4 6-4 6s4 7 10 7c2 0 3 0 4-1',
    lock: 'M6 10h12v11H6z M8 10V6a4 4 0 018 0v4', unlock: 'M6 10h12v11H6z M8 10V6a4 4 0 017-3',
    trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7', layer: 'M12 3L2 8l10 5 10-5z M3 12l9 5 9-5 M3 16l9 5 9-5',
    diamond: 'M12 3l9 9-9 9-9-9z', key: 'M12 5l7 7-7 7-7-7z', tween: 'M3 12h18 M16 7l5 5-5 5 M3 9v6',
    grid: 'M3 3h18v18H3z M9 3v18 M15 3v18 M3 9h18 M3 15h18', magnet: 'M5 3v10a7 7 0 0014 0V3h-4v10a3 3 0 01-6 0V3z M5 7h4 M15 7h4',
    fit: 'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M8 8h8v8H8z', undo: 'M8 4L3 9l5 5 M3 9h11a6 6 0 010 12', redo: 'M16 4l5 5-5 5 M21 9H10a6 6 0 000 12',
    export: 'M12 16V3 M7 8l5-5 5 5 M4 14v7h16v-7', save: 'M4 3h13l4 4v14H3V3z M7 3v6h9V3 M7 21v-8h10v8', folder: 'M2 6h8l2 2h10v12H2z M2 6V3h7l2 3',
    image: 'M3 3h18v18H3z M3 16l6-6 7 7 3-3 2 2 M17 7a1 1 0 11-2 0a1 1 0 112 0',
    symbol: 'M12 2l8 5v10l-8 5-8-5V7z M4 7l8 5 8-5 M12 12v10', search: 'M15 15l6 6 M17 10a7 7 0 11-14 0a7 7 0 1114 0', settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
    check: 'M4 12l5 5L20 6', more: 'M5 12h.01 M12 12h.01 M19 12h.01', back: 'M14 5l-7 7 7 7', rotate: 'M20 9a8 8 0 10.5 6 M20 3v6h-6', flip: 'M12 2v20 M9 5L2 19h7z M15 5l7 14h-7z',
    left: 'M4 3v18 M8 6h12v5H8z M8 15h7v4H8z', center: 'M12 3v18 M4 6h16v5H4z M8 15h8v4H8z', right: 'M20 3v18 M4 6h12v5H4z M9 15h7v4H9z', top: 'M3 4h18 M6 8h5v12H6z M15 8h4v7h-4z', middle: 'M3 12h18 M6 4h5v16H6z M15 8h4v8h-4z', bottom: 'M3 20h18 M6 4h5v12H6z M15 9h4v7h-4z',
    keyboard: 'M2 5h20v14H2z M5 9h1 M9 9h1 M13 9h1 M17 9h1 M6 14h12', external: 'M14 3h7v7 M21 3L10 14 M10 3H3v18h18v-7', sparkles: 'M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z M20 16v6 M17 19h6'
};
export function icon(name, size = 18) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[name] || iconPaths.diamond}"/></svg>`; }
