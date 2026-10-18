# Physical sun and atmosphere

Choose **Use physical atmosphere** under **Sky & atmosphere**, then render a
still. This explicitly upgrades the scene to v6; Undo restores the prior scene.
**Use artistic sky** removes the atmosphere and returns to the appropriate older
format. Existing scenes retain their sky, haze and sun behavior until upgraded.
The new sun direction also drives preview lighting, but WebGPU/WebGL previews
retain their approximate background and haze. The physical sky appears in stills.

## Controls and coordinates

Manual mode accepts sun elevation −18…90° and azimuth 0…360°, clockwise from
north. North is −Z, east is +X, and +Y is up. Geographic mode uses latitude
(north positive), longitude (east positive), UTC year, day of year, and minutes
after midnight. Day 1 is January 1; 720 minutes is noon UTC. Leap years accept day
366; changing to a non-leap year clamps that day to 365. Values persist exactly;
there is no geolocation request, time-zone inference or external network lookup.

Geographic positioning uses the [NOAA fractional-year equations](https://gml.noaa.gov/grad/solcalc/solareqns.PDF).
This is an approximate geometric sun position, with no atmospheric refraction,
local mountain horizon, ephemeris or precision surveying claim. Polar locations
remain finite; below-horizon sun directions are supported, including polar night.

Terrain origin altitude is in metres above sea level. **Atmosphere metres per
scene unit** sets the optical distance and height of the scene in the atmosphere;
it does not resize geometry or alter imported-heightmap scale metadata. Defaults
are sea level and 100 metres/unit. Below-sea-level sample heights are clamped to
sea level for local air density. Aerosol density scales Mie scattering/extinction;
Ozone amount scales absorption. Zero removes the corresponding component.
The color palette continues to affect terrain; this atmosphere represents Earth.

## Transport and units

The implementation in `web/atmosphere/` is original code, using published
radiative-transfer mathematics. It adds no runtime or build dependency and copies
no reference implementation, shader, image or dataset.

The spherical model uses a 6,360 km radius and a 60 km atmosphere. Rayleigh and
Mie densities decay exponentially with 8 km and 1.2 km scale heights. Ozone is a
triangular layer from 10 to 40 km, peaking at 25 km. The three channels approximate
680/550/440 nm; coefficients are in inverse kilometres:

| Component | Red | Green | Blue |
|---|---:|---:|---:|
| Rayleigh scattering/extinction | 0.005802 | 0.013558 | 0.033100 |
| Mie scattering | 0.003996 | 0.003996 | 0.003996 |
| Mie extinction | 0.004440 | 0.004440 | 0.004440 |
| Ozone absorption | 0.000650 | 0.001881 | 0.000085 |

These rounded Earth parameters follow the [published atmosphere demo parameters](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/demo/demo.cc.html).
The Rayleigh phase is normalized; the aerosol phase is Cornette–Shanks with
asymmetry 0.8. Optical depth gives Beer–Lambert transmittance. The source integral
includes view attenuation, attenuation toward the sun, density and phase. Planet
shadow removes direct sunlight along rays that intersect the spherical ground.
The [reference transport derivation](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/functions.glsl.html)
provides the equations used for comparison.

Solar irradiance is normalized to one in each channel. The disk has a 0.004675
radian angular radius; its radiance integrates to unit irradiance. Surface direct
light uses the attenuated sun and a Lambertian factor; sky sampling excludes the
disk to avoid counting it again as ambient light. Atmospheric render output uses
a fixed development exposure of four and the existing display transform. This
is a three-channel approximation, not spectral-to-CIE colorimetry or calibrated
radiometric output. The full material/color pipeline belongs to W3.S2.

## Tables, integration and budgets

The CPU prepares a 256 × 64 transmittance lookup table and a 128 × 64 directional
sky-radiance table. The first uses horizon-relative squared coordinates and 256
quadratic integration segments; the second uses 64 segments per direction and
additional angular resolution near the horizontal plane. Tables include their
boundary samples, with a continuous azimuth seam. Float32 RGBA storage is exactly
393,216 bytes (384 KiB) on the CPU and in one GPU buffer per tracer. No tables
are saved in scene files. Builds yield to the UI between row batches and honor
render cancellation before upload. Each render builds tables for its scene and
camera; there is no unbounded cache.

The GPU interpolates these tables and applies 16 bounded integration segments
for aerial perspective between the camera and the first visible surface. The
sky table uses the camera altitude for sky, ambient and reflected sky directions.
It is an approximation when those secondary rays originate at different heights.
There is no atmospheric multiple scattering, terrain shadowing within air,
ground-bounce contribution to the sky, cloud scattering, stars or moon. Distant
ground outside the finite terrain patch is black beneath its atmospheric path.
Secondary terrain/water paths retain the earlier simplified water model; this
slice does not provide a complete underwater atmospheric interface. Low sun and
night will be darker than a multiple-scattering sky, and low-sample renders can
be noisy. These limitations are visible model boundaries, not hidden color fog.

## Reference validation

`tests/atmosphere.test.mjs` compares with the analytic cases in the
[published reference tests](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/reference/functions_test.cc.html):
a 1,000–1,500 km atmosphere, 60/30 km density scales, scattering coefficients
0.001/0.0015 km⁻¹, aerosol extinction 0.002 km⁻¹ and solar irradiance 123.
The closed-form vertical transmittance is 0.8869332312. Applying the reference
single-scattering integrals and normalized phases gives zenith radiance
20.75805056; the reverse vertical ray is checked separately without aerosols.
These are comparisons to published analytic reference cases, not measured sky
photographs or the reference implementation's multiple-scattering images.

Earth LUT samples are also compared with denser integration at sea level,
horizon, altitude and oblique directions. Phase normalization, vacuum identity,
planet shadow, ozone attenuation, finite polar/night values, azimuth continuity,
GPU/CPU lookup agreement and cancellation are tested. This checks numerical
consistency; it does not establish global atmospheric accuracy.

For geographic positioning, the [NREL report, table A5.1](https://docs.nlr.gov/docs/fy08osti/34302.pdf)
reports zenith 50.11162° and azimuth 194.34024° at 39.742476° N, 105.1786° W,
2003-10-17 19:30:30 UTC. The simpler NOAA approximation gives elevation
40.09787° and azimuth 194.47719°; the test allows 0.3°. The reference's high
precision is not claimed for this approximation. No NREL software is included.

See [validation results](validation.md) for the executed checks and platform limits.
