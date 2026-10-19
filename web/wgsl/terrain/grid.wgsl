// SPDX-License-Identifier: Apache-2.0
// A square height grid. Vertex (i, j) sits at origin + (i, j) * spacing in world metres.

struct FieldGrid {
    origin: vec2f,
    spacing: f32,
    size: u32,
}

fn gridIndex(cell: vec2u, size: u32) -> u32 {
    return cell.y * size + cell.x;
}

fn gridWorld(cell: vec2u, grid: FieldGrid) -> vec2f {
    return grid.origin + vec2f(cell) * grid.spacing;
}
