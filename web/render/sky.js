// SPDX-License-Identifier: Apache-2.0
// Physical sky LUTs (Hillaire 2020): transmittance, multiple scattering, sky view and
// aerial perspective. All four rebuild on the GPU whenever the sun or haze changes.

import { bindGroup, computePipeline, dispatch2d, storageTexture, uniformBuffer } from '../gpu/device.js';
import { StructWriter } from '../gpu/struct.js';

export const AERIAL_DISTANCE = 160000;
const AERIAL_SIZE = 32;

// Earth constants in km^-1 (Hillaire 2020, after Bruneton 2017).
const EARTH = {
  rayleighScattering: [5.802e-3, 13.558e-3, 33.1e-3],
  rayleighScaleHeight: 8,
  mieScattering: 3.996e-3,
  mieAbsorption: 0.444e-3,
  mieScaleHeight: 1.2,
  mieAnisotropy: 0.8,
  ozoneAbsorption: [0.65e-3, 1.881e-3, 0.085e-3],
  ozoneCentre: 25,
  bottomRadius: 6360,
  topRadius: 6460,
  groundAlbedo: 0.15,
  ozoneHalfWidth: 15,
};

export const SUN_ANGULAR_RADIUS = 0.004675;

export class Sky {
  static async create(device, frameBuffer) {
    const [transmittance, multiScatter, skyView, aerial] = await Promise.all([
      computePipeline(device, 'sky/transmittance_lut.wgsl', 'buildTransmittance'),
      computePipeline(device, 'sky/multiscatter_lut.wgsl', 'buildMultiScatter'),
      computePipeline(device, 'sky/skyview_lut.wgsl', 'buildSkyView'),
      computePipeline(device, 'sky/aerial_lut.wgsl', 'buildAerial'),
    ]);
    return new Sky(device, { transmittance, multiScatter, skyView, aerial }, frameBuffer);
  }

  constructor(device, pipelines, frameBuffer) {
    this.device = device;
    this.pipelines = pipelines;
    this.uniform = uniformBuffer(device, 'atmosphere', 96);
    const volume = { dimension: '3d' };
    const aerialSize = [AERIAL_SIZE, AERIAL_SIZE, AERIAL_SIZE];
    this.transmittance = storageTexture(device, 'transmittance LUT', [256, 64], 'rgba16float');
    this.multiScatter = storageTexture(device, 'multiple scattering LUT', [32, 32], 'rgba16float');
    this.skyView = storageTexture(device, 'sky-view LUT', [192, 108], 'rgba16float');
    this.aerialScatter = storageTexture(device, 'aerial scatter LUT', aerialSize, 'rgba16float', volume);
    this.aerialTransmittance = storageTexture(device, 'aerial transmittance LUT', aerialSize, 'rgba16float', volume);
    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      addressModeW: 'clamp-to-edge',
    });
    const transmittanceView = this.transmittance.createView();
    const multiScatterView = this.multiScatter.createView();
    this.groups = {
      transmittance: bindGroup(device, pipelines.transmittance, [this.uniform, transmittanceView]),
      multiScatter: bindGroup(device, pipelines.multiScatter, [
        this.uniform, transmittanceView, this.sampler, multiScatterView,
      ]),
      skyView: bindGroup(device, pipelines.skyView, [
        this.uniform, transmittanceView, multiScatterView, this.sampler, this.skyView.createView(),
      ]),
      aerial: bindGroup(device, pipelines.aerial, [
        this.uniform, frameBuffer, transmittanceView, multiScatterView, this.sampler,
        this.aerialScatter.createView(), this.aerialTransmittance.createView(),
      ]),
    };
  }

  // `haze` scales aerosols; 1 is a clear standard atmosphere.
  write(sunDirection, sunIlluminance, haze, cameraAltitudeKm) {
    const writer = new StructWriter(96)
      .f32(...EARTH.rayleighScattering, EARTH.rayleighScaleHeight)
      .f32(EARTH.mieScattering * haze, EARTH.mieAbsorption * haze, EARTH.mieScaleHeight, EARTH.mieAnisotropy)
      .f32(...EARTH.ozoneAbsorption, EARTH.ozoneCentre)
      .f32(EARTH.bottomRadius, EARTH.topRadius, EARTH.groundAlbedo, EARTH.ozoneHalfWidth)
      .f32(...sunDirection, SUN_ANGULAR_RADIUS)
      .f32(...sunIlluminance, cameraAltitudeKm);
    this.device.queue.writeBuffer(this.uniform, 0, writer.buffer);
  }

  // The aerial pass reads the camera from the frame uniform, which must be current.
  rebuild() {
    const encoder = this.device.createCommandEncoder({ label: 'sky LUTs' });
    const pass = encoder.beginComputePass({ label: 'sky LUTs' });
    dispatch2d(pass, this.pipelines.transmittance, this.groups.transmittance, 256, 64);
    pass.setPipeline(this.pipelines.multiScatter);
    pass.setBindGroup(0, this.groups.multiScatter);
    pass.dispatchWorkgroups(32, 32);
    dispatch2d(pass, this.pipelines.skyView, this.groups.skyView, 192, 108);
    dispatch2d(pass, this.pipelines.aerial, this.groups.aerial, AERIAL_SIZE, AERIAL_SIZE);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}
