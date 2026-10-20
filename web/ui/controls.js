// SPDX-License-Identifier: Apache-2.0
// Lab widgets built from small specs. A slider drag is one gesture: `begin` fires on the
// first movement, `input` on every movement and `end` on release, so the whole drag is a
// single undo step.

import { icon } from './icons.js';

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

// spec: { label, min, max, step, format(value) }. Returns { node, set(value) }.
// The name and rounded value sit above a full-width track.
export function slider(spec, { begin, input, end }) {
  const row = element('label', 'control slider');
  const head = element('span', 'control-head');
  const name = element('span', 'control-name', spec.label);
  const value = element('output', 'control-value');
  const range = element('input');
  range.type = 'range';
  range.min = spec.min;
  range.max = spec.max;
  range.step = spec.step;
  let active = false;
  const show = () => {
    const number = Number(range.value);
    value.textContent = spec.format(number);
    range.style.setProperty('--fill', `${((number - spec.min) / (spec.max - spec.min)) * 100}%`);
  };
  range.addEventListener('input', () => {
    if (!active) {
      active = true;
      begin();
    }
    show();
    input(Number(range.value));
  });
  range.addEventListener('change', () => {
    if (active) {
      active = false;
      end();
    }
  });
  head.append(name, value);
  row.append(head, range);
  return {
    node: row,
    set(number) {
      if (!active) {
        range.value = number;
        show();
      }
    },
  };
}

// spec: { label, options: [[value, text]] }. Returns { node, set(value) }.
export function choice(spec, onChange) {
  const row = element('label', 'control choice');
  const name = element('span', 'control-name', spec.label);
  const select = element('select');
  for (const [value, text] of spec.options) {
    const option = element('option', null, text);
    option.value = value;
    select.append(option);
  }
  select.addEventListener('change', () => onChange(select.value));
  row.append(name, select);
  return {
    node: row,
    set(value) {
      select.value = String(value);
    },
  };
}

// spec: { label }. A switch. Returns { node, set(checked) }.
export function toggle(spec, onChange) {
  const row = element('label', 'control toggle');
  const name = element('span', 'control-name', spec.label);
  const box = element('input');
  box.type = 'checkbox';
  box.setAttribute('role', 'switch');
  box.addEventListener('change', () => onChange(box.checked));
  row.append(name, box);
  return {
    node: row,
    set(checked) {
      box.checked = Boolean(checked);
    },
  };
}

export function button(label, action, className = 'button') {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

// A square button showing only an icon; `label` names it for tooltips and screen readers.
export function iconButton(name, label, action) {
  const node = element('button', 'icon-button');
  node.type = 'button';
  node.title = label;
  node.setAttribute('aria-label', label);
  node.append(icon(name));
  node.addEventListener('click', action);
  return node;
}

// A small heading inside a drawer.
export function heading(text) {
  return element('h3', 'drawer-heading', text);
}

// Options folded away under a disclosure ("Advanced").
export function fold(title) {
  const node = element('details', 'fold');
  const summary = element('summary', 'fold-title', title);
  summary.append(icon('chevron'));
  const body = element('div', 'fold-body');
  node.append(summary, body);
  return { node, body };
}

// A grid of picture tiles. items: [{ id, label, image? }]. Returns { node, select(id),
// show(id, url) }; tiles without an image show a quiet loading shimmer until `show`.
export function gallery(items, onPick) {
  const node = element('div', 'gallery');
  const tiles = new Map();
  for (const item of items) {
    const tile = element('button', 'tile');
    tile.type = 'button';
    tile.setAttribute('aria-pressed', 'false');
    const frame = element('span', 'tile-image loading');
    const image = element('img');
    image.alt = '';
    image.draggable = false;
    image.decoding = 'async';
    image.addEventListener('load', () => frame.classList.remove('loading'));
    frame.append(image);
    tile.append(frame, element('span', 'tile-label', item.label));
    tile.addEventListener('click', () => onPick(item.id));
    node.append(tile);
    tiles.set(item.id, { tile, image });
    if (item.image) {
      image.src = item.image;
    }
  }
  return {
    node,
    select(id) {
      for (const [key, { tile }] of tiles) {
        tile.classList.toggle('selected', key === id);
        tile.setAttribute('aria-pressed', String(key === id));
      }
    },
    show(id, url) {
      const entry = tiles.get(id);
      if (entry && url && entry.image.getAttribute('src') !== url) {
        entry.image.src = url;
      }
    },
  };
}
