// SPDX-License-Identifier: Apache-2.0
// The control strip: labelled sliders, selects and buttons built from small specs.

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

// `spec.live` sliders report every movement; the others report on release.
function slider(spec, state, onChange) {
  const label = element('label', 'control');
  const name = element('span', 'control-name', spec.label);
  const value = element('output', 'control-value');
  const input = element('input');
  input.type = 'range';
  input.min = spec.min;
  input.max = spec.max;
  input.step = spec.step;
  input.value = state[spec.key];
  input.name = spec.key;
  const show = () => {
    value.textContent = spec.format(Number(input.value));
  };
  show();
  input.addEventListener('input', () => {
    show();
    if (spec.live) {
      onChange(spec.key, Number(input.value));
    }
  });
  input.addEventListener('change', () => onChange(spec.key, Number(input.value)));
  label.append(name, input, value);
  const set = number => {
    input.value = number;
    show();
  };
  return { node: label, set };
}

function choice(spec, state, onChange) {
  const label = element('label', 'control control-choice');
  const name = element('span', 'control-name', spec.label);
  const select = element('select');
  select.name = spec.key;
  for (const [value, text] of spec.options) {
    const option = element('option', null, text);
    option.value = value;
    select.append(option);
  }
  select.value = String(state[spec.key]);
  select.addEventListener('change', () => onChange(spec.key, spec.parse(select.value)));
  label.append(name, select);
  return { node: label, set: value => { select.value = String(value); } };
}

export function buildControls(root, specs, state, onChange) {
  const handles = new Map();
  for (const spec of specs) {
    if (spec.type === 'button') {
      const button = element('button', 'control-button', spec.label);
      button.type = 'button';
      button.addEventListener('click', spec.action);
      root.append(button);
      continue;
    }
    const handle = spec.type === 'choice' ? choice(spec, state, onChange) : slider(spec, state, onChange);
    handles.set(spec.key, handle);
    root.append(handle.node);
  }
  // Moves the widgets to match `values` without firing change events.
  return values => {
    for (const [key, value] of Object.entries(values)) {
      handles.get(key)?.set(value);
    }
  };
}
