// SPDX-License-Identifier: Apache-2.0
import {transportDefaults,areaLightDefaults} from './model.js';
import {updateSceneVersion} from '../scene/document.js';
export function lightingControls(getScene,edit) {
 const $=id=>document.getElementById(id);let selected=0;
 $('enable-transport').addEventListener('click',()=>edit(s=>{s.lighting.transport=transportDefaults();updateSceneVersion(s);}));
 $('disable-transport').addEventListener('click',()=>edit(s=>{delete s.lighting.transport;updateSceneVersion(s);}));
 for(const key of ['bounces','exposure','sun','sky','roughness','ior'])$('transport-'+key).addEventListener('change',()=>{
  const input=$('transport-'+key);if(input.value===''||!input.checkValidity()){sync();return;}const value=Number(input.value);edit(s=>{s.lighting.transport[key]=value;});
 });
 $('transport-toneMap').addEventListener('change',()=>{const value=$('transport-toneMap').value;edit(s=>{s.lighting.transport.toneMap=value;});});
 $('area-select').addEventListener('change',()=>{selected=Number($('area-select').value);sync();});
 $('area-add').addEventListener('click',()=>{selected=getScene().lighting.transport.lights.length;edit(s=>{s.lighting.transport.lights.push({...areaLightDefaults(),name:'Area light '+(selected+1)});});});
 $('area-remove').addEventListener('click',()=>edit(s=>{s.lighting.transport.lights.splice(selected,1);selected=Math.max(0,selected-1);}));
 $('area-enabled').addEventListener('change',()=>{const value=$('area-enabled').checked;edit(s=>{s.lighting.transport.lights[selected].enabled=value;});});
 for(const key of ['name','x','y','z','yaw','pitch','width','height','intensity','red','green','blue'])$('area-'+key).addEventListener('change',()=>{
  const input=$('area-'+key);if(input.value.trim()===''||!input.checkValidity()){sync();return;}const value=key==='name'?input.value.trim():Number(input.value);edit(s=>{s.lighting.transport.lights[selected][key]=value;});
 });
 function sync() {
  const t=getScene().lighting.transport;$('enable-transport').hidden=!!t;$('transport-editor').hidden=!t;if(!t)return;
  for(const key of ['bounces','exposure','sun','sky','roughness','ior','toneMap'])$('transport-'+key).value=t[key];
  selected=Math.min(selected,Math.max(0,t.lights.length-1));
  const select=$('area-select');select.replaceChildren(...t.lights.map((l,i)=>{const o=document.createElement('option');o.value=i;o.textContent=l.name;return o;}));select.value=selected;
  select.disabled=!t.lights.length;$('area-add').disabled=t.lights.length>=4;$('area-fields').hidden=!t.lights.length;
  const l=t.lights[selected];if(l){$('area-enabled').checked=l.enabled;for(const key of ['name','x','y','z','yaw','pitch','width','height','intensity','red','green','blue'])$('area-'+key).value=l[key];}
 }
 return {sync};
}
