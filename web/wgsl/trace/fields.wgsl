// SPDX-License-Identifier: Apache-2.0
// The tracer's view of the terrain: both height grids, their pyramid depths and step
// budgets, the water level and whether the trees' canopy pyramid is ready.

#include "terrain/grid.wgsl"

struct Fields {
    near: FieldGrid,
    far: FieldGrid,
    nearLevels: u32,
    farLevels: u32,
    nearSteps: u32,
    farSteps: u32,
    waterLevel: f32,
    // Height (m) of the planet's ground beyond the far field: the landform's typical level.
    horizonHeight: f32,
    // 1 once the tracer has baked the canopy pyramid for the current terrain and surface.
    canopyReady: u32,
    padding: f32,
}
