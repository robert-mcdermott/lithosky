// SPDX-License-Identifier: Apache-2.0
// Original homogeneous lake model. Coefficients are artistic RGB presets, in
// inverse metres, not measured spectral water data. See docs/water.md.
export function waterDefaults() {return {model:'lake-v1',metresPerUnit:100,density:1,ripples:.35,wavelength:1,shore:.06};}
export function waterCoefficients(density=1) {return {absorption:[.055,.014,.006].map(x=>x*density),scattering:[.001,.003,.004].map(x=>x*density)};}
export function waterTransmittance(distance,optics=waterDefaults()) {
  const c=waterCoefficients(optics.density);
  return c.absorption.map((a,i)=>Math.exp(-(a+c.scattering[i])*Math.max(0,distance)*optics.metresPerUnit));
}
export function waterNormal(x,z,optics=waterDefaults(),footprint=0) {
  let dx=0,dz=0;
  for(const [kx,kz,phase,amplitude] of [[.8,.6,.4,.09],[-.45,.893,2.3,.055],[.97,-.24,4.1,.025]]) {
    const i=amplitude===.09?1:amplitude===.055?2.17:4.61,k=2*Math.PI*i/optics.wavelength;
    const filter=Math.exp(-.5*(k*footprint)**2),v=amplitude*optics.ripples*filter*Math.cos((x*kx+z*kz)*k+phase);
    dx+=v*kx;dz+=v*kz;
  }
  const length=Math.hypot(dx,1,dz);return [-dx/length,1/length,-dz/length];
}
export function waterUniforms(optics) {return optics?new Float32Array([1,optics.metresPerUnit,optics.density,optics.ripples,optics.wavelength,optics.shore,0,0]):new Float32Array(8);}
