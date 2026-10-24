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

// Reads a typed number, ignoring units, thousands separators and a typographic minus.
export function parseNumber(text) {
  return Number.parseFloat(String(text).replace(/\u2212/g, '-').replace(/[^0-9.+-]/g, ''));
}

// Width of a full-range scrub, in pixels; Shift scrubs ten times finer.
const SCRUB_PIXELS = 240;

// spec: { label, min, max, step, format(value), parse?(text) }. Returns { node, set(value) }.
// The name and rounded value sit above a full-width track. Dragging the value scrubs it;
// clicking it turns it into a field for typing a number.
export function slider(spec, { begin, input, end }) {
  const row = element('div', spec.compact ? 'control slider compact' : 'control slider');
  const head = element('span', 'control-head');
  const name = element('span', 'control-name', spec.label);
  if (spec.hint) {
    name.title = spec.hint;
  }
  const value = element('span', 'control-value scrub');
  value.tabIndex = 0;
  value.setAttribute('role', 'button');
  value.title = 'Drag to adjust, click to type';
  const range = element('input');
  range.type = 'range';
  range.min = spec.min;
  range.max = spec.max;
  range.step = spec.step;
  range.setAttribute('aria-label', spec.label);
  let active = false;
  const show = () => {
    const number = Number(range.value);
    value.textContent = spec.format(number);
    range.style.setProperty('--fill', `${((number - spec.min) / (spec.max - spec.min)) * 100}%`);
  };
  const fit = number => {
    const stepped = spec.min + Math.round((number - spec.min) / spec.step) * spec.step;
    return Math.min(spec.max, Math.max(spec.min, Number(stepped.toFixed(6))));
  };
  // A whole change as one gesture (one undo step).
  const commit = number => {
    begin();
    range.value = fit(number);
    show();
    input(Number(range.value));
    end();
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

  let scrub = null;
  value.addEventListener('pointerdown', event => {
    event.preventDefault();
    value.setPointerCapture(event.pointerId);
    scrub = { x: event.clientX, start: Number(range.value), moved: false };
  });
  value.addEventListener('pointermove', event => {
    if (!scrub) {
      return;
    }
    const dx = event.clientX - scrub.x;
    if (!scrub.moved) {
      if (Math.abs(dx) < 3) {
        return;
      }
      scrub.moved = true;
      active = true;
      value.classList.add('scrubbing');
      begin();
    }
    const perPixel = (spec.max - spec.min) / SCRUB_PIXELS * (event.shiftKey ? 0.1 : 1);
    range.value = fit(scrub.start + dx * perPixel);
    show();
    input(Number(range.value));
  });
  const finishScrub = typeIt => {
    if (!scrub) {
      return;
    }
    const moved = scrub.moved;
    scrub = null;
    value.classList.remove('scrubbing');
    if (moved) {
      active = false;
      end();
    } else if (typeIt) {
      startTyping();
    }
  };
  value.addEventListener('pointerup', () => finishScrub(true));
  value.addEventListener('pointercancel', () => finishScrub(false));
  value.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      startTyping();
    }
  });

  function startTyping() {
    const field = element('input', 'control-field');
    field.type = 'text';
    field.inputMode = 'decimal';
    field.value = value.textContent;
    field.setAttribute('aria-label', spec.label);
    let done = false;
    const close = accept => {
      if (done) {
        return;
      }
      done = true;
      const number = (spec.parse ?? parseNumber)(field.value);
      field.replaceWith(value);
      if (accept && Number.isFinite(number)) {
        commit(number);
      }
      value.focus();
    };
    field.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        close(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(false);
      }
    });
    field.addEventListener('blur', () => close(true));
    value.replaceWith(field);
    field.focus();
    field.select();
  }

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
// show(id, url), setItems(items) }; tiles without an image show a quiet loading shimmer
// until `show`. With `options.remove(id)` each tile gets a remove button, and with
// `options.rename(id, name)` double-clicking a label renames it.
export function gallery(items, onPick, options = {}) {
  const node = element('div', 'gallery');
  let tiles = new Map();
  let selected = null;

  function build(item, previous) {
    // A div with a button inside, so the remove button isn't nested in a button.
    const tile = element('div', 'tile');
    const pick = element('button', 'tile-pick');
    pick.type = 'button';
    pick.setAttribute('aria-pressed', 'false');
    pick.setAttribute('aria-label', item.label);
    const frame = element('span', 'tile-image loading');
    const image = element('img');
    image.alt = '';
    image.draggable = false;
    image.decoding = 'async';
    image.addEventListener('load', () => frame.classList.remove('loading'));
    frame.append(image);
    const label = element('span', 'tile-label', item.label);
    pick.append(frame);
    pick.addEventListener('click', () => onPick(item.id));
    tile.append(pick, label);
    if (options.remove) {
      const remove = iconButton('close', `Remove ${item.label}`, () => options.remove(item.id));
      remove.classList.add('tile-remove');
      tile.append(remove);
    }
    if (options.rename) {
      label.title = 'Double-click to rename';
      label.addEventListener('dblclick', () => {
        const field = element('input', 'tile-field');
        field.value = item.label;
        field.maxLength = 40;
        let done = false;
        const close = accept => {
          if (done) {
            return;
          }
          done = true;
          field.replaceWith(label);
          const name = field.value.trim();
          if (accept && name && name !== item.label) {
            options.rename(item.id, name);
          }
        };
        field.addEventListener('keydown', event => {
          if (event.key === 'Enter') {
            close(true);
          } else if (event.key === 'Escape') {
            event.stopPropagation();
            close(false);
          }
        });
        field.addEventListener('blur', () => close(true));
        label.replaceWith(field);
        field.focus();
        field.select();
      });
    }
    const source = item.image ?? previous?.image.getAttribute('src');
    if (source) {
      image.src = source;
    }
    return { tile, pick, image };
  }

  function setItems(list) {
    const next = new Map();
    for (const item of list) {
      next.set(item.id, build(item, tiles.get(item.id)));
    }
    tiles = next;
    node.replaceChildren(...[...tiles.values()].map(entry => entry.tile));
    view.select(selected);
  }

  const view = {
    node,
    select(id) {
      selected = id;
      for (const [key, { tile, pick }] of tiles) {
        tile.classList.toggle('selected', key === id);
        pick.setAttribute('aria-pressed', String(key === id));
      }
    },
    show(id, url) {
      const entry = tiles.get(id);
      if (entry && url && entry.image.getAttribute('src') !== url) {
        entry.image.src = url;
      }
    },
    setItems,
  };
  setItems(items);
  return view;
}

// A row of mutually exclusive choices. spec: { label, options: [[value, text, title?]] }.
// Returns { node, set(value) }.
export function segmented(spec, onChange) {
  const row = element('div', 'control segmented-control');
  const name = element('span', 'control-name', spec.label);
  const group = element('div', 'segmented');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', spec.label);
  const buttons = new Map();
  for (const [value, text, title] of spec.options) {
    const option = element('button', 'segment', text);
    option.type = 'button';
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', 'false');
    if (title) {
      option.title = title;
    }
    option.addEventListener('click', () => onChange(value));
    group.append(option);
    buttons.set(value, option);
  }
  row.append(name, group);
  return {
    node: row,
    set(value) {
      for (const [key, option] of buttons) {
        option.setAttribute('aria-checked', String(key === value));
      }
    },
  };
}
