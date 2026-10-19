// SPDX-License-Identifier: Apache-2.0
// Shared numeric constants.

const PI: f32 = 3.14159265358979;
const TWO_PI: f32 = 6.28318530717959;
const INV_PI: f32 = 0.318309886183791;
const INV_FOUR_PI: f32 = 0.0795774715459477;
const BIG: f32 = 1.0e30;

// Heights travel through erosion as 16.16 fixed-point metres so atomics can add them.
const FIXED_SCALE: f32 = 65536.0;
const INV_FIXED_SCALE: f32 = 1.0 / 65536.0;
