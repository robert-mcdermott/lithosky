// SPDX-License-Identifier: Apache-2.0
// Panel widgets built from small specs. A slider drag is one gesture: `begin` fires on the
// first movement, `input` on every movement and `end` on release, so the whole drag is a
// single undo step.

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
export function slider(spec, { begin, input, end }) {
  const row = element('label', 'control');
  const name = element('span', 'control-name', spec.label);
  const value = element('output', 'control-value');
  const range = element('input');
  range.type = 'range';
  range.min = spec.min;
  range.max = spec.max;
  range.step = spec.step;
  let active = false;
  const show = () => {
    value.textContent = spec.format(Number(range.value));
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
  row.append(name, range, value);
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
  const row = element('label', 'control control-choice');
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

export function button(label, action, className = 'button') {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

// A collapsible panel section.
export function section(title, open = true) {
  const node = element('details', 'section');
  node.open = open;
  node.append(element('summary', 'section-title', title));
  const body = element('div', 'section-body');
  node.append(body);
  return { node, body };
}
