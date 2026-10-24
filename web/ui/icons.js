// SPDX-License-Identifier: Apache-2.0
// Line icons on a 24-unit grid, drawn in the current text colour.

const PATHS = {
  brand: '<path d="M2.5 19.5 9 9l3.5 5.5L15 11l6.5 8.5z"/><circle cx="17" cy="5.5" r="2"/>',
  scenes: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.4"/>',
  terrain: '<path d="M2 19.5 8.5 8.5l4 6.5 2.5-4 7 8.5z"/><path d="m6.6 11.8 1.9 1.2 1.6-1.4"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  sky: '<path d="M7 18.5h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6-.9A4.5 4.5 0 0 0 7 18.5z"/>',
  ground: '<path d="m12 3.5 9 5-9 5-9-5z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 16.5 9 5 9-5"/>',
  camera: '<path d="M3.5 8h3.5l2-3h6l2 3h3.5v11.5h-17z"/><circle cx="12" cy="13.5" r="3.5"/>',
  image: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2-2.4 3.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  previous: '<path d="m14.5 6-6 6 6 6"/>',
  next: '<path d="m9.5 6 6 6-6 6"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/>',
  chevron: '<path d="m6 9.5 6 6 6-6"/>',
  target: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  region: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M9 12h6M12 9v6"/>',
};

export function icon(name) {
  const template = document.createElement('template');
  template.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
  return template.content.firstChild;
}
