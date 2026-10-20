// SPDX-License-Identifier: Apache-2.0
// The fixed world layout. The editable tile is centred on the origin; the far field
// surrounds it. Moving the camera never moves terrain, so the camera is free.
// The procedural generator carves a glacial trough with a lake basin that starts at
// `valleyOrigin` and runs along `valleyDirection` (north).

import { FAR_SIZE, FAR_SPACING, NEAR_EXTENT } from './terrain.js';

const FAR_HALF = (FAR_SIZE - 1) * FAR_SPACING / 2;

export const PLACEMENT = Object.freeze({
  nearOrigin: [-NEAR_EXTENT / 2, -NEAR_EXTENT / 2],
  farOrigin: [-FAR_HALF, -FAR_HALF],
  // Earth curvature is measured from here, so it is exact near the middle of the tile.
  cameraXZ: [0, 0],
  valleyOrigin: [0, 3800],
  valleyDirection: [0, -1],
});

export const TILE_HALF_EXTENT = NEAR_EXTENT / 2;
