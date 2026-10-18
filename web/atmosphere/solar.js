// SPDX-License-Identifier: Apache-2.0
const rad=Math.PI/180;
export const leapYear=year=>year%4===0&&(year%100!==0||year%400===0);
export function atmosphereDefaults(sunElevation=38) {
  return {model:'earth-single-v1',mode:'manual',sunElevation,sunAzimuth:306.869897645844,latitude:47.6062,longitude:-122.3321,year:2026,day:172,utcMinutes:1200,altitude:0,metresPerUnit:100,aerosols:1,ozone:1};
}
// NOAA fractional-year approximation, UTC throughout; no refraction correction.
export function solarPosition({latitude,longitude,year,day,utcMinutes}) {
  const g=2*Math.PI/(leapYear(year)?366:365)*(day-1+(utcMinutes/60-12)/24);
  const equation=229.18*(.000075+.001868*Math.cos(g)-.032077*Math.sin(g)-.014615*Math.cos(2*g)-.040849*Math.sin(2*g));
  const declination=.006918-.399912*Math.cos(g)+.070257*Math.sin(g)-.006758*Math.cos(2*g)+.000907*Math.sin(2*g)-.002697*Math.cos(3*g)+.00148*Math.sin(3*g);
  const hour=(utcMinutes+equation+4*longitude)/4*rad-Math.PI,lat=latitude*rad;
  const east=-Math.cos(declination)*Math.sin(hour);
  const north=Math.cos(lat)*Math.sin(declination)-Math.sin(lat)*Math.cos(declination)*Math.cos(hour);
  const up=Math.sin(lat)*Math.sin(declination)+Math.cos(lat)*Math.cos(declination)*Math.cos(hour);
  return {elevation:Math.asin(Math.max(-1,Math.min(1,up)))/rad,azimuth:(Math.atan2(east,north)/rad+360)%360};
}
export function sunAngles(a) { return a.mode==='geographic'?solarPosition(a):{elevation:a.sunElevation,azimuth:a.sunAzimuth}; }
// +X east, -Z north. Azimuth clockwise from north, elevation above horizontal.
export function sunDirection(a) {const {elevation,azimuth}=sunAngles(a),e=elevation*rad,z=azimuth*rad;return [Math.sin(z)*Math.cos(e),Math.sin(e),-Math.cos(z)*Math.cos(e)];}
