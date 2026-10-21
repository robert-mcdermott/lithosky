// SPDX-License-Identifier: Apache-2.0
// The sky seen from above, north up: drag the sun around the compass for its direction and
// toward the centre (the zenith) to raise it. The wedge shows what the camera sees, so it's
// clear whether the light comes from behind, beside or into the view.

import { element } from './controls.js';

const NS = 'http://www.w3.org/2000/svg';
const SIZE = 240;
const CENTRE = SIZE / 2;
const HORIZON = 92;
export const SUN_LIMITS = Object.freeze({ min: -5, max: 70 });

function svg(tag, attributes = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, value);
  }
  return node;
}

// Elevation 90° is the centre, 0° the horizon ring; below the horizon sits just outside it.
export function domeRadius(elevation) {
  return HORIZON * (1 - elevation / 90);
}

// Sun angles for a point on the dome (offsets from the centre, y down).
export function domeAngles(dx, dy) {
  const elevation = 90 * (1 - Math.hypot(dx, dy) / HORIZON);
  const azimuth = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  return {
    elevation: Math.round(Math.min(SUN_LIMITS.max, Math.max(SUN_LIMITS.min, elevation)) * 10) / 10,
    azimuth: Math.round(azimuth * 2) / 2,
  };
}

function polar(azimuth, radius) {
  const angle = azimuth * Math.PI / 180;
  return [CENTRE + Math.sin(angle) * radius, CENTRE - Math.cos(angle) * radius];
}

// handlers: { begin(), input({ elevation, azimuth }), end() }. Returns { node, set(sun, view) }
// where view is { heading, fieldOfView } in degrees.
export function sunDome({ begin, input, end }) {
  const node = element('div', 'sun-dome');
  const root = svg('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, role: 'slider', 'aria-label': 'Sun position', tabindex: '0' });
  root.append(
    svg('circle', { class: 'dome-sky', cx: CENTRE, cy: CENTRE, r: HORIZON }),
    svg('circle', { class: 'dome-ring', cx: CENTRE, cy: CENTRE, r: domeRadius(30) }),
    svg('circle', { class: 'dome-ring', cx: CENTRE, cy: CENTRE, r: domeRadius(60) }),
  );
  const wedge = svg('path', { class: 'dome-view' });
  root.append(wedge, svg('circle', { class: 'dome-horizon', cx: CENTRE, cy: CENTRE, r: HORIZON }));
  for (const [label, azimuth] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
    const [x, y] = polar(azimuth, HORIZON + 13);
    const text = svg('text', { class: 'dome-label', x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    text.textContent = label;
    root.append(text);
  }
  const ray = svg('line', { class: 'dome-ray', x1: CENTRE, y1: CENTRE });
  const glow = svg('circle', { class: 'dome-glow', r: 15 });
  const sun = svg('circle', { class: 'dome-sun', r: 7 });
  root.append(ray, glow, sun);
  node.append(root);

  let current = { elevation: 0, azimuth: 0 };
  const place = ({ elevation, azimuth }) => {
    const [x, y] = polar(azimuth, domeRadius(elevation));
    for (const shape of [sun, glow]) {
      shape.setAttribute('cx', x);
      shape.setAttribute('cy', y);
    }
    ray.setAttribute('x2', x);
    ray.setAttribute('y2', y);
    root.setAttribute('aria-valuetext', `${Math.round(elevation)}° high, ${Math.round(azimuth)}° from north`);
    root.classList.toggle('below', elevation < 0);
  };

  const anglesAt = event => {
    const box = root.getBoundingClientRect();
    const scale = SIZE / box.width;
    return domeAngles((event.clientX - box.left) * scale - CENTRE, (event.clientY - box.top) * scale - CENTRE);
  };
  let dragging = false;
  root.addEventListener('pointerdown', event => {
    event.preventDefault();
    root.setPointerCapture(event.pointerId);
    dragging = true;
    root.classList.add('dragging');
    begin();
    current = anglesAt(event);
    place(current);
    input(current);
  });
  root.addEventListener('pointermove', event => {
    if (dragging) {
      current = anglesAt(event);
      place(current);
      input(current);
    }
  });
  const stop = () => {
    if (dragging) {
      dragging = false;
      root.classList.remove('dragging');
      end();
    }
  };
  root.addEventListener('pointerup', stop);
  root.addEventListener('pointercancel', stop);
  // Arrow keys: left/right turn the sun, up/down raise and lower it.
  root.addEventListener('keydown', event => {
    const turn = { ArrowLeft: [0, -5], ArrowRight: [0, 5], ArrowUp: [1, 0], ArrowDown: [-1, 0] }[event.key];
    if (!turn) {
      return;
    }
    event.preventDefault();
    const step = event.shiftKey ? 0.2 : 1;
    const elevation = Math.min(SUN_LIMITS.max, Math.max(SUN_LIMITS.min, current.elevation + turn[0] * step));
    const azimuth = (current.azimuth + turn[1] * step + 360) % 360;
    begin();
    current = { elevation, azimuth };
    place(current);
    input(current);
    end();
  });

  return {
    node,
    set(sunSettings, view) {
      if (!dragging) {
        current = { elevation: sunSettings.elevation, azimuth: sunSettings.azimuth };
        place(current);
      }
      const half = Math.min(view.fieldOfView, 179) / 2;
      const [x0, y0] = polar(view.heading - half, HORIZON);
      const [x1, y1] = polar(view.heading + half, HORIZON);
      wedge.setAttribute('d', `M ${CENTRE} ${CENTRE} L ${x0} ${y0} A ${HORIZON} ${HORIZON} 0 0 1 ${x1} ${y1} Z`);
    },
  };
}
