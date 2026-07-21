/* Videogame map layer: sprite injection, measured dirt path, terrain, scatter, parallax, particles.
   All diary placement is authored in TRACK-SPACE (% of #diary-track width) against
   sides that are fixed in HTML via data-side — nothing can shift after load. */
(async function () {
  const NS = 'http://www.w3.org/2000/svg';

  const svgText = await fetch('sprites.svg?v=7').then((r) => r.text());
  const mount = document.createElement('div');
  mount.setAttribute('aria-hidden', 'true');
  mount.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  mount.innerHTML = svgText;
  document.body.prepend(mount);

  const DIMS = {
    'moon': [80, 80], 'treeline-far': [400, 80], 'treeline-near': [400, 120],
    'fir-1': [80, 200], 'fir-2': [100, 160], 'fir-3': [60, 110],
    'stone': [40, 22], 'stone-2': [30, 18], 'log-bench': [140, 50],
    'sauna-hut': [180, 150], 'signpost': [70, 130], 'lantern-string': [300, 60],
    'hammock': [200, 90], 'sapling-shovel': [70, 100], 'human-sit': [50, 60],
    'human-walk': [40, 80], 'human-pair': [80, 80], 'cat-tail': [10, 14], 'grass-1': [60, 30],
    'grass-2': [60, 30], 'grass-3': [60, 30], 'fern': [70, 40],
    'mushroom': [30, 26], 'cat': [50, 30], 'deer': [90, 90],
    'suitcase': [50, 40], 'backpack': [40, 50], 'guitar-log': [100, 70],
    'wine-bottle': [24, 60],
    'porch': [200, 170], 'ledge': [400, 80], 'lake-shore': [240, 70],
    'wildflower': [50, 40], 'pumpkin-cluster': [90, 50], 'owl': [50, 60],
  };

  const DAY_ZONE = { 1: 'predawn', 2: 'dawn', 3: 'day', 4: 'golden', 5: 'golden', 6: 'dusk', 7: 'night2' };
  // Dirt tones per zone — slightly warmer + lighter than the bg colorStops at the same depth.
  const DIRT = { predawn: '#5b5468', dawn: '#7d5c4b', day: '#8a7a55', golden: '#a37f52', dusk: '#6b4a50', night2: '#413d4d' };

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeSprite(sym, w) {
    const [vw, vh] = DIMS[sym];
    const h = Math.round((w * vh) / vw);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.classList.add('sprite');
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#' + sym);
    svg.appendChild(use);
    return svg;
  }

  const track = document.getElementById('diary-track');
  const dayBlocks = Array.from(document.querySelectorAll('.day-block'));
  const diarySvg = document.querySelector('.diary-svg');

  // Track-level layers (no parallax so they stay glued to the path geometry).
  const pathLayer = document.createElement('div');
  pathLayer.className = 'path-layer';
  track.prepend(pathLayer);
  const terrainLayer = document.createElement('div');
  terrainLayer.className = 'terrain-layer';
  diarySvg.after(terrainLayer);

  /* ---------- measurement ---------- */

  function measure() {
    const t = track.getBoundingClientRect();
    const rel = (r) => ({ left: r.left - t.left, right: r.right - t.left, top: r.top - t.top, bottom: r.bottom - t.top });
    return {
      w: t.width, h: t.height, left: t.left,
      blocks: dayBlocks.map((b) => ({
        day: +b.dataset.day,
        side: b.dataset.side,
        zone: DAY_ZONE[+b.dataset.day] || 'day',
        el: b,
        rect: rel(b.getBoundingClientRect()),
        keepout: [...b.querySelectorAll('.polaroid, .diary-text')].map((el) => {
          const r = rel(el.getBoundingClientRect());
          r.kind = el.classList.contains('polaroid') ? 'polaroid' : 'text';
          return r;
        }),
      })),
    };
  }

  /* ---------- path: Catmull-Rom through measured waypoints ---------- */

  const LANE = 0.75;      // swing lane center (fraction of track width), mirrored per side
  const LANE_JITTER = 0.025;

  function catmullRomD(pts) {
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  let pathSamples = [];

  function buildPath(geom) {
    // On narrow screens there is no empty half: the trail slims down, hugs the
    // margin opposite the text, and may pass under opaque polaroids.
    const mobile = geom.w < 520;
    const lane = mobile ? 0.87 : LANE;
    const jitter = mobile ? 0.008 : LANE_JITTER;
    const rand = mulberry32(1234);
    const cx = geom.w / 2;
    const pts = [{ x: cx, y: 0 }];
    for (const blk of geom.blocks) {
      pts.push({ x: cx + (rand() - 0.5) * (mobile ? 0.03 : 0.07) * geom.w, y: blk.rect.top });
      const laneX = (blk.side === 'left' ? lane : 1 - lane) * geom.w;
      const kept = blk.keepout.filter((k) => !mobile || k.kind === 'text');
      const ys = mobile
        // hold the lane across the whole keepout span, not just its middle
        ? kept.flatMap((k) => [k.top - 24, k.bottom + 24])
        : kept.map((k) => (k.top + k.bottom) / 2);
      for (const my of ys.sort((a, b) => a - b)) {
        pts.push({ x: laneX + (rand() - 0.5) * 2 * jitter * geom.w, y: my });
      }
    }
    pts.push({ x: cx, y: geom.h });

    const d = catmullRomD(pts);
    diarySvg.setAttribute('viewBox', `0 0 ${geom.w} ${geom.h}`);
    diarySvg.removeAttribute('preserveAspectRatio');
    diarySvg.innerHTML = '';

    const defs = document.createElementNS(NS, 'defs');
    const grad = document.createElementNS(NS, 'linearGradient');
    grad.setAttribute('id', 'dirtGrad');
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', String(geom.h));
    const stops = [['0', '#4e4a5e']];
    for (const blk of geom.blocks) {
      stops.push([(((blk.rect.top + blk.rect.bottom) / 2) / geom.h).toFixed(3), DIRT[blk.zone]]);
    }
    stops.push(['1', '#3a3646']);
    for (const [off, col] of stops) {
      const s = document.createElementNS(NS, 'stop');
      s.setAttribute('offset', off);
      s.setAttribute('stop-color', col);
      grad.appendChild(s);
    }
    defs.appendChild(grad);
    diarySvg.appendChild(defs);

    const g = document.createElementNS(NS, 'g');
    g.setAttribute('filter', 'url(#roughPath)');
    const mk = (stroke, width, opacity, dash) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', stroke);
      p.setAttribute('stroke-width', width);
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('opacity', opacity);
      if (dash) p.setAttribute('stroke-dasharray', dash);
      g.appendChild(p);
      return p;
    };
    mk('rgba(22,14,8,0.5)', mobile ? 34 : 54, 1);                     // packed edge / shadow
    const body = mk('url(#dirtGrad)', mobile ? 25 : 40, 0.85);        // dirt body, tinted by depth
    mk('#ffffff', mobile ? 9 : 15, 0.09, '84 46 132 38');             // footworn patches
    diarySvg.appendChild(g);

    pathSamples = [];
    const len = body.getTotalLength();
    for (let dd = 0; dd <= len; dd += 8) pathSamples.push(body.getPointAtLength(dd));
  }

  function pathXAtY(y) {
    let best = pathSamples[0] || { x: 0 }, bd = Infinity;
    for (const p of pathSamples) {
      const dy = Math.abs(p.y - y);
      if (dy < bd) { bd = dy; best = p; }
    }
    return best.x;
  }

  /* ---------- terrain ledges (full-bleed, gap at measured path crossing) ---------- */

  const LEDGE_DAYS = [1];
  const LEDGE_H = 72;
  const LEDGE_GAP = 150;

  function buildLedges(geom) {
    terrainLayer.innerHTML = '';
    const vw = document.documentElement.clientWidth;
    const [lvw, lvh] = DIMS.ledge;

    for (const dayN of LEDGE_DAYS) {
      const blk = geom.blocks.find((b) => b.day === dayN);
      if (!blk) continue;
      const wrap = document.createElement('div');
      wrap.className = 'ledge zone-tint';
      wrap.setAttribute('data-zone', blk.zone);
      wrap.style.left = (-geom.left) + 'px';
      wrap.style.width = vw + 'px';
      wrap.style.top = (blk.rect.top - LEDGE_H * 0.15) + 'px';
      wrap.style.height = LEDGE_H + 'px';

      const gapCenter = geom.left + pathXAtY(blk.rect.top);
      const seg = (x, w) => {
        if (w <= 0) return;
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${lvw} ${lvh}`);
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('width', w);
        svg.setAttribute('height', LEDGE_H);
        svg.classList.add('sprite');
        svg.style.left = x + 'px';
        svg.style.top = '0';
        const use = document.createElementNS(NS, 'use');
        use.setAttribute('href', '#ledge');
        svg.appendChild(use);
        wrap.appendChild(svg);
      };
      seg(0, gapCenter - LEDGE_GAP / 2);
      seg(gapCenter + LEDGE_GAP / 2, vw - (gapCenter + LEDGE_GAP / 2));
      terrainLayer.appendChild(wrap);
    }
  }

  /* ---------- edge pebbles along the path ---------- */

  function zoneAtY(geom, y) {
    for (const blk of geom.blocks) if (y >= blk.rect.top && y <= blk.rect.bottom) return blk.zone;
    return y < geom.h / 2 ? 'predawn' : 'night2';
  }

  function buildStones(geom) {
    pathLayer.innerHTML = '';
    const rand = mulberry32(42);
    for (let i = 2; i < pathSamples.length - 2; i += 4) {
      if (rand() < 0.45) continue;
      const pt = pathSamples[i];
      const ahead = pathSamples[i + 1];
      const dx = ahead.x - pt.x, dy = ahead.y - pt.y;
      const nl = Math.hypot(dx, dy) || 1;
      const nx = -dy / nl, ny = dx / nl;
      const sideSign = rand() < 0.5 ? -1 : 1;
      const perp = (30 + rand() * 9) * sideSign;
      const sym = rand() < 0.55 ? 'stone-2' : 'stone';
      const sw = 14 + rand() * 10;
      const el = makeSprite(sym, sw);
      el.classList.add('zone-tint');
      el.setAttribute('data-zone', zoneAtY(geom, pt.y));
      el.style.left = (pt.x + nx * perp - sw / 2) + 'px';
      el.style.top = (pt.y + ny * perp - 5) + 'px';
      el.style.transform = `rotate(${rand() * 40 - 20}deg)`;
      el.style.opacity = (0.55 + rand() * 0.3).toFixed(2);
      pathLayer.appendChild(el);
    }
  }

  /* ---------- decor overlays ---------- */

  const overlays = new Map();
  function getOverlay(anchor, zone) {
    if (!overlays.has(anchor)) {
      const decor = document.createElement('div');
      decor.className = 'decor zone-tint';
      decor.setAttribute('data-zone', zone);
      const layers = {};
      for (const name of ['far', 'mid', 'near']) {
        const l = document.createElement('div');
        l.className = 'decor-layer decor-' + name;
        decor.appendChild(l);
        layers[name] = l;
      }
      const scatter = document.createElement('div');
      scatter.className = 'scatter-layer';
      decor.appendChild(scatter);
      anchor.prepend(decor);
      overlays.set(anchor, { layers, scatter, decor });
    }
    return overlays.get(anchor);
  }

  /* ---------- placements ----------
     Day entries: x is % of TRACK width (may exceed [0,100] to spill into viewport margins).
     Section entries (sec): x is % of the section, as before.
     b = % of anchor height from bottom; bpx = px from block bottom (for precise attachment).

     Safe lanes at max track width (1000px):
       LEFT block:  content 5..50 | path 66..84 | free 52..64, 86..114
       RIGHT block: content 50..95 | path 16..34 | free -14..14, 36..48 */

  const P = [
    // hero — night sky
    { sec: '#hero', zone: 'night', layer: 'far', sym: 'moon', x: 72, b: 58, w: 92 },
    { sec: '#hero', zone: 'night', layer: 'far', sym: 'treeline-far', x: -6, b: -3, w: 560, o: 0.9 },
    { sec: '#hero', zone: 'night', layer: 'far', sym: 'treeline-far', x: 32, b: -3, w: 560, o: 0.9, flip: true },
    { sec: '#hero', zone: 'night', layer: 'far', sym: 'treeline-far', x: 70, b: -3, w: 560, o: 0.9 },

    // fire scene — framing firs, bench + folks on the left, owl perched on the big fir
    { sec: '#fire-scene', zone: 'night', layer: 'near', sym: 'fir-1', x: -3, b: 0, w: 230 },
    { sec: '#fire-scene', zone: 'night', layer: 'near', sym: 'owl', x: 6.5, b: 52, w: 40 },
    { sec: '#fire-scene', zone: 'night', layer: 'near', sym: 'fir-2', x: 88, b: 0, w: 200, flip: true },
    { sec: '#fire-scene', zone: 'night', layer: 'mid', sym: 'fir-3', x: 8, b: 4, w: 90 },
    { sec: '#fire-scene', zone: 'night', layer: 'mid', sym: 'log-bench', x: 16, b: 4, w: 140 },
    { sec: '#fire-scene', zone: 'night', layer: 'mid', sym: 'human-sit', x: 20, b: 8, w: 48,
      fx: [{ cls: 'fire-rim', x: 0.62, y: 0.12 }] },
    { sec: '#fire-scene', zone: 'night', layer: 'mid', sym: 'human-sit', x: 27, b: 8, w: 44, flip: true,
      fx: [{ cls: 'fire-rim', x: 0.62, y: 0.12 }] },

    // day 1 — LEFT block, predawn. Arrival goodies in the right margin strip.
    { day: 1, layer: 'mid', sym: 'signpost', x: 87, b: 10, w: 84 },
    { day: 1, layer: 'near', sym: 'suitcase', x: 96, b: 3, w: 54 },
    { day: 1, layer: 'near', sym: 'pumpkin-cluster', x: 89, b: 0, w: 74 },
    { day: 1, layer: 'far', sym: 'fir-3', x: 105, b: 34, w: 68, o: 0.75 },

    // day 2 — RIGHT block, dawn. Sauna in the left margin strip.
    { day: 2, layer: 'far', sym: 'treeline-far', x: -26, b: 58, w: 460, o: 0.26 },
    { day: 2, layer: 'mid', sym: 'sauna-hut', x: -8, b: 2, w: 200,
      fx: [
        { cls: 'smoke', spans: 3, x: 0.69, y: 0.8 },
        { cls: 'window-glow', x: 0.74, y: 0.3 },
      ] },
    { day: 2, layer: 'near', sym: 'log-bench', x: 26, b: 1, w: 105 },
    { day: 2, layer: 'near', sym: 'human-walk', x: 41, b: 6, w: 44, onPath: true },

    // day 3 — LEFT block, day. Forest walk + lake on the right.
    { day: 3, layer: 'far', sym: 'fir-3', x: 97, b: 58, w: 78, o: 0.7 },
    { day: 3, layer: 'mid', sym: 'lake-shore', x: 52, b: 56, w: 160, o: 0.85 },
    { day: 3, layer: 'mid', sym: 'human-walk', x: 60, b: 52, w: 42, onPath: true },
    { day: 3, layer: 'mid', sym: 'fir-2', x: 107, b: 26, w: 115, flip: true },
    { day: 3, layer: 'near', sym: 'fir-1', x: 99, b: 2, w: 150 },
    { day: 3, layer: 'mid', sym: 'deer', x: 88, b: 6, w: 82 },

    // day 4 — RIGHT block, golden. Jam under lanterns strung between two firs (left strip).
    { day: 4, layer: 'mid', compose: [
        { sym: 'fir-2', x: -18, bpx: 26, w: 112 },
        { sym: 'fir-2', x: 22, bpx: 26, w: 108, flip: true,
          fx: [{ cls: 'leaves', spans: 4, x: 0.5, y: 0.6 }] },
        { sym: 'lantern-string', x: -12.4, bpx: 82, w: 398 },
    ] },
    { day: 4, layer: 'near', sym: 'guitar-log', x: 6, b: 1, w: 108 },
    { day: 4, layer: 'near', sym: 'human-sit', x: 16, b: 3, w: 46 },
    { day: 4, layer: 'near', sym: 'wine-bottle', x: 13.5, b: 2, w: 22 },

    // day 5 — LEFT block, golden. Porch + fir with the hammock strung between them (right strip).
    { day: 5, layer: 'mid', compose: [
        { sym: 'fir-2', x: 84.5, bpx: 18, w: 110,
          fx: [{ cls: 'leaves', spans: 3, x: 0.45, y: 0.6 }] },
        { sym: 'porch', x: 96, bpx: 6, w: 170,
          fx: [
            { cls: 'smoke', spans: 3, x: 0.2, y: 0.87 },
            { cls: 'window-glow', x: 0.18, y: 0.45 },
          ] },
        { sym: 'hammock', x: 88.7, bpx: 14, w: 171 },
    ] },
    { day: 5, layer: 'near', sym: 'cat', x: 61, b: 2, w: 48,
      fx: [{ cls: 'tail-flick', sym: 'cat-tail', w: 10, x: 0, y: 0.02 }] },
    { day: 5, layer: 'near', sym: 'wildflower', x: 46, b: 7, w: 44 },
    { day: 5, layer: 'near', sym: 'wildflower', x: 63, b: 1, w: 40, flip: true },
    { day: 5, layer: 'near', sym: 'wildflower', x: 92.5, b: 0, w: 42 },

    // day 6 — RIGHT block, dusk. Party lanterns + tree planting (left strip).
    { day: 6, layer: 'mid', compose: [
        { sym: 'fir-2', x: -20, bpx: 26, w: 114 },
        { sym: 'fir-2', x: 21, bpx: 26, w: 110, flip: true },
        { sym: 'lantern-string', x: -14.6, bpx: 84, w: 402 },
    ] },
    { day: 6, layer: 'near', sym: 'sapling-shovel', x: 6, b: 2, w: 74 },
    { day: 6, layer: 'mid', sym: 'human-pair', x: 12, b: 3, w: 82 },
    { day: 6, layer: 'near', sym: 'wildflower', x: 38, b: 1, w: 42 },

    // day 7 — LEFT block, night2. Departure.
    { day: 7, layer: 'far', sym: 'treeline-far', x: 30, b: 34, w: 420, o: 0.4 },
    { day: 7, layer: 'near', sym: 'backpack', x: 88, b: 2, w: 46 },
    { day: 7, layer: 'mid', sym: 'fir-3', x: 96, b: 8, w: 68 },

    // letter — flanking firs + arriving stones
    { sec: '#letter-scene', zone: 'night2', layer: 'far', sym: 'fir-1', x: 1, b: 12, w: 165, o: 0.7 },
    { sec: '#letter-scene', zone: 'night2', layer: 'far', sym: 'fir-2', x: 87, b: 14, w: 145, o: 0.7, flip: true },
    { sec: '#letter-scene', zone: 'night2', layer: 'mid', sym: 'stone-2', x: 46, b: 96, w: 26, o: 0.8 },
    { sec: '#letter-scene', zone: 'night2', layer: 'mid', sym: 'stone', x: 50, b: 91, w: 32, o: 0.85 },
    { sec: '#letter-scene', zone: 'night2', layer: 'mid', sym: 'stone-2', x: 47, b: 86, w: 28, o: 0.9 },
    { sec: '#letter-scene', zone: 'night2', layer: 'mid', sym: 'stone', x: 49, b: 81, w: 34 },
  ];

  function placeInto(container, item, blk, geom) {
    const el = makeSprite(item.sym, item.w);
    if (blk && item.onPath) {
      const blockH = blk.rect.bottom - blk.rect.top;
      const bottomPx = item.bpx != null ? item.bpx : ((item.b || 0) / 100) * blockH;
      const yAbs = blk.rect.bottom - bottomPx;
      el.style.left = (pathXAtY(yAbs) - item.w / 2 - blk.rect.left) + 'px';
    } else if (blk) {
      el.style.left = ((item.x / 100) * geom.w - blk.rect.left) + 'px';
    } else {
      el.style.left = item.x + '%';
    }
    if (item.bpx != null) el.style.bottom = item.bpx + 'px';
    else el.style.bottom = (item.b || 0) + '%';
    if (item.o != null) el.style.opacity = item.o;
    if (item.flip) el.style.transform = 'scaleX(-1)';
    container.appendChild(el);
    // fx: effect overlays (smoke, glow, leaves, tail) anchored to the sprite.
    // f.x / f.y are fractions of sprite width/height in screen space, from bottom-left.
    if (item.fx) {
      const [vw, vh] = DIMS[item.sym];
      const h = item.w * vh / vw;
      for (const f of item.fx) {
        const d = document.createElement('div');
        d.className = f.cls;
        if (f.spans) for (let i = 0; i < f.spans; i++) d.appendChild(document.createElement('span'));
        if (f.sym) {
          const [fvw, fvh] = DIMS[f.sym];
          d.innerHTML = `<svg viewBox="0 0 ${fvw} ${fvh}" width="${f.w}" height="${(f.w * fvh / fvw).toFixed(1)}"><use href="#${f.sym}"></use></svg>`;
        }
        d.style.left = `calc(${el.style.left} + ${(f.x * item.w).toFixed(1)}px)`;
        d.style.bottom = `calc(${el.style.bottom} + ${(f.y * h).toFixed(1)}px)`;
        container.appendChild(d);
      }
    }
    return el;
  }

  function placeAll(geom) {
    for (const { layers } of overlays.values()) {
      for (const name of ['far', 'mid', 'near']) layers[name].innerHTML = '';
    }
    for (const p of P) {
      let anchor, blk = null, zone = p.zone;
      if (p.day) {
        blk = geom.blocks.find((b) => b.day === p.day);
        if (!blk) continue;
        anchor = blk.el;
        zone = blk.zone;
      } else {
        anchor = document.querySelector(p.sec);
        if (!anchor) continue;
      }
      const { layers } = getOverlay(anchor, zone);
      const target = layers[p.layer];
      if (p.compose) {
        const wrap = document.createElement('div');
        wrap.className = 'compose-group';
        target.appendChild(wrap);
        for (const c of p.compose) placeInto(wrap, c, blk, geom);
      } else {
        placeInto(target, p, blk, geom);
      }
    }
  }

  /* ---------- scatter: sparse ground cover, avoids path + content ---------- */

  const SCATTER_MIX = [
    { sym: 'grass-1', p: 0.17 }, { sym: 'grass-2', p: 0.17 }, { sym: 'grass-3', p: 0.13 },
    { sym: 'stone-2', p: 0.11 }, { sym: 'fern', p: 0.09 }, { sym: 'mushroom', p: 0.05 },
    { sym: 'wildflower', p: 0.04 },
  ];
  function pickScatter(rand) {
    let r = rand();
    for (const s of SCATTER_MIX) { if ((r -= s.p) < 0) return s.sym; }
    return null;
  }

  const SCATTER_CELL = 150;
  const CORRIDOR = 62;

  function buildScatter(geom) {
    const vw = document.documentElement.clientWidth;
    const spillL = Math.min(geom.left, 200);
    const spillR = Math.min(vw - geom.left - geom.w, 200);

    for (const blk of geom.blocks) {
      const { scatter } = getOverlay(blk.el, blk.zone);
      scatter.innerHTML = '';
      const rand = mulberry32(blk.day * 31 + 7);
      const blockH = blk.rect.bottom - blk.rect.top;
      const xMin = -spillL, xMax = geom.w + spillR;
      const cols = Math.max(3, Math.round((xMax - xMin) / SCATTER_CELL));
      const rows = Math.max(3, Math.round(blockH / SCATTER_CELL));
      const keep = blk.keepout.map((k) => ({ left: k.left - 24, right: k.right + 24, top: k.top - 24, bottom: k.bottom + 24 }));

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const t = (r + 0.5) / rows;
          // sparser mid-block, denser near block edges → seams read continuous
          if (rand() < 0.3 * (1 - Math.abs(0.5 - t) * 2) + 0.18) { rand(); rand(); continue; }
          const sym = pickScatter(rand);
          if (!sym) continue;
          const cw = (xMax - xMin) / cols;
          const x = xMin + (c + 0.5 + (rand() - 0.5) * 0.9) * cw;             // track px
          const y = blk.rect.top + (r + 0.5 + (rand() - 0.5) * 0.9) * (blockH / rows); // track px
          if (Math.abs(x - pathXAtY(y)) < CORRIDOR) continue;
          if (keep.some((k) => x > k.left && x < k.right && y > k.top && y < k.bottom)) continue;
          const w = 24 + rand() * 20;
          const el = makeSprite(sym, w);
          el.style.left = (x - blk.rect.left - w / 2) + 'px';
          el.style.top = (y - blk.rect.top) + 'px';
          el.style.bottom = 'auto';
          el.style.opacity = (0.5 + rand() * 0.3).toFixed(2);
          if (rand() < 0.5) el.style.transform = 'scaleX(-1)';
          scatter.appendChild(el);
        }
      }
    }
  }

  /* ---------- build + rebuild ---------- */

  function rebuild() {
    const geom = measure();
    buildPath(geom);
    buildLedges(geom);
    buildStones(geom);
    placeAll(geom);
    buildScatter(geom);
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  rebuild();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, 250);
  });
  window.addEventListener('load', rebuild);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => rebuild());

  /* ---------- parallax ---------- */

  const DEPTH = { far: 9, mid: 18, near: 30 };
  for (const [anchor, { layers }] of overlays) {
    for (const name of ['far', 'mid', 'near']) {
      gsap.fromTo(layers[name], { y: DEPTH[name] }, {
        y: -DEPTH[name],
        ease: 'none',
        scrollTrigger: {
          trigger: anchor,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      });
    }
  }

  /* ---------- particles ---------- */

  function spawnParticles(parent, cls, count) {
    const wrap = document.createElement('div');
    wrap.className = cls;
    for (let i = 0; i < count; i++) wrap.appendChild(document.createElement('span'));
    parent.appendChild(wrap);
  }

  const fireDecor = document.querySelector('#fire-scene .decor');
  if (fireDecor) spawnParticles(fireDecor, 'sparks', 10);

  const day6Decor = document.querySelector('.day-block[data-day="6"] .decor');
  if (day6Decor) spawnParticles(day6Decor, 'fireflies', 14);

  const day7Decor = document.querySelector('.day-block[data-day="7"] .decor');
  if (day7Decor) spawnParticles(day7Decor, 'fireflies', 5);

  const heroDecor = document.querySelector('#hero .decor');
  if (heroDecor) spawnParticles(heroDecor, 'shooting-star', 1);

  /* ---------- starfields ---------- */

  function spawnStars(decor, count, seed, maxTop) {
    if (!decor || decor.querySelector('.stars')) return;
    const rand = mulberry32(seed);
    const wrap = document.createElement('div');
    wrap.className = 'stars';
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      const tier = rand();
      const size = tier < 0.6 ? 1 : tier < 0.88 ? 1.6 : 2.3;
      s.style.left = (rand() * 100).toFixed(1) + '%';
      s.style.top = (rand() * maxTop).toFixed(1) + '%';
      s.style.width = s.style.height = size + 'px';
      s.style.setProperty('--tw-dur', (2.5 + rand() * 4).toFixed(1) + 's');
      s.style.setProperty('--tw-del', (rand() * 6).toFixed(1) + 's');
      s.style.setProperty('--o', (0.35 + rand() * 0.5).toFixed(2));
      wrap.appendChild(s);
    }
    decor.appendChild(wrap);
    return wrap;
  }

  const heroStars = spawnStars(heroDecor, 60, 77, 72);
  spawnStars(day7Decor, 16, 78, 55);
  spawnStars(document.querySelector('#letter-scene .decor'), 22, 79, 60);

  // Ursa Minor over the hero's left shoulder — Polaris brightest, at the tip.
  if (heroStars) {
    const UMI = [[22, 12, 1], [24.5, 18, 0.55], [26, 24, 0.6], [28.5, 30, 0.55], [26.5, 37, 0.65], [31, 41, 0.55], [33.5, 35, 0.6]];
    for (const [x, y, glow] of UMI) {
      const s = document.createElement('span');
      s.className = 'constellation-star';
      s.style.left = x + '%';
      s.style.top = y + '%';
      const size = glow === 1 ? 3.2 : 2.2;
      s.style.width = s.style.height = size + 'px';
      s.style.setProperty('--o', glow === 1 ? '1' : '0.75');
      s.style.setProperty('--tw-dur', '5s');
      s.style.setProperty('--tw-del', (x * 0.3).toFixed(1) + 's');
      heroStars.appendChild(s);
    }
  }

  ScrollTrigger.refresh();
})();
