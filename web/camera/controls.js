// SPDX-License-Identifier: Apache-2.0
import {intersectPrimitive} from '../scene/primitives.js';
import {enableCamera,cameraRay,cameraFrame,frameAspect} from './model.js';
import {intersectHeightfield} from '../render/heightfield.js';
export function cameraControls({getScene,getState,getField,edit,viewport}) {
 const $=id=>document.getElementById(id),keys=['focalLength','fNumber','focusDistance','metresPerUnit','targetX','targetY','targetZ','roll'];let focusing=false;
 $('enable-camera').addEventListener('click',()=>edit(enableCamera));
 for(const key of keys)$('camera-'+key).addEventListener('change',()=>{const input=$('camera-'+key);if(input.value===''||!input.checkValidity()){sync();return;}const value=Number(input.value);edit(s=>{s.camera.lens[key]=value;});});
 $('camera-frame').addEventListener('change',()=>{const frame=$('camera-frame').value;edit(s=>{s.camera.lens.frame=frame;});});
 $('camera-dof').addEventListener('change',()=>{const dof=$('camera-dof').checked;edit(s=>{s.camera.lens.dof=dof;});});
 $('camera-focus-pick').addEventListener('click',()=>{focusing=!focusing;$('camera-focus-pick').setAttribute('aria-pressed',String(focusing));$('camera-status').textContent=focusing?'Click the landscape to focus. Escape cancels.':'';viewport.focus();});
 viewport.addEventListener('pointerdown',e=>{
  if(!focusing||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();
  const state=getState(),rect=viewport.getBoundingClientRect(),u=(e.clientX-rect.left)/rect.width,v=(e.clientY-rect.top)/rect.height,aspect=frameAspect(state),ray=cameraRay({...state,lens:{...state.lens,dof:false}},aspect,u,v);
  let distance=state.terrainVisible!==false&&getField()?intersectHeightfield(getField(),ray.origin,ray.direction)?.t:undefined;
  if(state.waterEnabled&&Math.abs(ray.direction[1])>1e-8){const t=(state.waterLevel-ray.origin[1])/ray.direction[1],p=ray.origin.map((x,i)=>x+ray.direction[i]*t);if(t>0&&Math.abs(p[0])<=32&&Math.abs(p[2])<=32&&t<(distance??Infinity))distance=t;}
  for(const object of state.primitives??[]){const h=intersectPrimitive(object,ray.origin,ray.direction,distance??1e6);if(h)distance=h.t;}
  if(distance===undefined){$('camera-status').textContent='No visible scene surface at that point. Choose another point.';return;}
  const frame=cameraFrame(state,aspect),axial=distance*ray.direction.reduce((s,x,i)=>s+x*frame[12+i],0)*state.lens.metresPerUnit;
  if(axial<.01||axial>10000000){$('camera-status').textContent='Focus point is outside the supported distance.';return;}
  focusing=false;$('camera-focus-pick').setAttribute('aria-pressed','false');edit(s=>{s.camera.lens.focusDistance=axial;});$('camera-status').textContent='Focus set to '+axial.toFixed(2)+' metres.';
 },true);
 viewport.addEventListener('keydown',e=>{if(focusing&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();focusing=false;$('camera-focus-pick').setAttribute('aria-pressed','false');$('camera-status').textContent='Focus selection canceled.';}},true);
 function sync(){const l=getScene().camera.lens;$('enable-camera').hidden=!!l;$('camera-editor').hidden=!l;document.querySelector('.viewport-wrap').style.aspectRatio=String(frameAspect(getState()));
  if(!l){focusing=false;$('camera-focus-pick').setAttribute('aria-pressed','false');return;}$('camera-frame').value=l.frame;$('camera-dof').checked=l.dof;for(const key of keys)$('camera-'+key).value=l[key];
 }
 return {sync,cancel(){focusing=false;$('camera-focus-pick').setAttribute('aria-pressed','false');}};
}
