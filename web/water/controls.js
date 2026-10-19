// SPDX-License-Identifier: Apache-2.0
import {waterDefaults} from './model.js';
import {updateSceneVersion} from '../scene/document.js';
export function waterControls(getScene,edit) {
 const $=id=>document.getElementById(id),keys=['metresPerUnit','density','ripples','wavelength','shore'];
 $('enable-water-optics').addEventListener('click',()=>edit(s=>{s.water.optics=waterDefaults();updateSceneVersion(s);}));
 $('disable-water-optics').addEventListener('click',()=>edit(s=>{delete s.water.optics;updateSceneVersion(s);}));
 for(const key of keys)$('water-'+key).addEventListener('change',()=>{const input=$('water-'+key);if(input.value===''||!input.checkValidity()){sync();return;}const value=Number(input.value);edit(s=>{s.water.optics[key]=value;});});
 function sync(){const w=getScene().water.optics;$('enable-water-optics').hidden=!!w;$('water-optics-editor').hidden=!w;if(w)for(const key of keys)$('water-'+key).value=w[key];}
 return {sync};
}
