// SPDX-License-Identifier: Apache-2.0
// Parameters shared by the post passes (one uniform block, rewritten per pass).

struct PostParams {
    width: u32,
    height: u32,
    step: u32,
    padding: u32,
    // How much of the denoised image replaces the raw one (0 = raw only).
    denoiseMix: f32,
    // Exposure-meter smoothing: 1 takes the new value, smaller eases toward it.
    meterBlend: f32,
    padding1: f32,
    padding2: f32,
}

fn postLuminance(value: vec3f) -> f32 {
    return dot(value, vec3f(0.2126, 0.7152, 0.0722));
}
