// SPDX-License-Identifier: Apache-2.0
import {enableCamera} from '../camera/model.js';
import { updateSceneVersion } from '../scene/document.js';
import {atmosphereFromLegacy,sunAngles,leapYear} from './solar.js';
export function atmosphereControls(getScene,edit) {
  const $=id=>document.getElementById(id),keys=['sunElevation','sunAzimuth','latitude','longitude','year','day','utcMinutes','altitude','metresPerUnit','aerosols','ozone'];
  $('natural-horizon').addEventListener('change',()=>{const checked=$('natural-horizon').checked;edit(s=>{if(checked){enableCamera(s);s.atmosphere.groundAlbedo=.12;}else delete s.atmosphere.groundAlbedo;updateSceneVersion(s);});});
  $('horizon-albedo').addEventListener('change',()=>{const input=$('horizon-albedo');if(input.value===''||!input.checkValidity()){sync();return;}const value=Number(input.value);edit(s=>{enableCamera(s);s.atmosphere.groundAlbedo=value;});});
  $('enable-atmosphere').addEventListener('click',()=>edit(s=>{s.atmosphere=atmosphereFromLegacy(s.lighting.sunElevation);if(s.terrain.generator==='layers-v1')s.terrain.sculpt??=[];updateSceneVersion(s);}));
  $('disable-atmosphere').addEventListener('click',()=>edit(s=>{delete s.atmosphere;updateSceneVersion(s);}));
  $('atmosphere-mode').addEventListener('change',()=>{const mode=$('atmosphere-mode').value;edit(s=>{s.atmosphere.mode=mode;});});
  for(const key of keys)$('atmosphere-'+key).addEventListener('change',()=>{
    const input=$('atmosphere-'+key),value=Number(input.value);if(input.value===''||!input.checkValidity()){sync();return;}
    edit(s=>{s.atmosphere[key]=value;if(!leapYear(s.atmosphere.year)&&s.atmosphere.day===366)s.atmosphere.day=365;});
  });
  function sync() {
    const a=getScene().atmosphere;$('enable-atmosphere').hidden=!!a;$('atmosphere-editor').hidden=!a;$('legacy-sun').hidden=!!a;
    if(!a)return;
    $('natural-horizon').checked=a.groundAlbedo!==undefined;$('horizon-albedo').value=a.groundAlbedo??.12;$('horizon-albedo').disabled=a.groundAlbedo===undefined;
    $('atmosphere-mode').value=a.mode;for(const key of keys)$('atmosphere-'+key).value=a[key];
    $('atmosphere-day').max=leapYear(a.year)?366:365;
    $('atmosphere-manual').hidden=a.mode!=='manual';$('atmosphere-geographic').hidden=a.mode!=='geographic';
    const sun=sunAngles(a);$('atmosphere-status').textContent=`Sun ${sun.elevation.toFixed(2)}° above horizon · ${sun.azimuth.toFixed(2)}° clockwise from north. Physical sky and aerial perspective appear in rendered stills; preview lighting follows the same sun.`;
  }
  return {sync};
}
