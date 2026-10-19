// SPDX-License-Identifier: Apache-2.0
import {percentRegion} from '../camera/model.js';
// Region selection is transient render configuration. It never edits scene data.
export function regionControls(invalidate) {
 const $=id=>document.getElementById(id),overlay=$('render-region'),box=$('region-box'),keys=['x','y','width','height'];let selecting=false,drag=null;
 let region={x:25,y:25,width:50,height:50};
 function sync(){for(const k of keys)$('region-'+k).value=Number(region[k].toFixed(2));overlay.hidden=!$('region-enabled').checked;overlay.classList.toggle('selecting',selecting);$('region-pick').setAttribute('aria-pressed',String(selecting));box.style.left=region.x+'%';box.style.top=region.y+'%';box.style.width=region.width+'%';box.style.height=region.height+'%';$('region-fields').hidden=!$('region-enabled').checked;}
 function finish(){if(drag){const id=drag.id;drag=null;if(overlay.hasPointerCapture(id))overlay.releasePointerCapture(id);}selecting=false;sync();}
 const point=e=>{const r=overlay.getBoundingClientRect();return {x:Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),y:Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100))};};
 $('region-enabled').addEventListener('change',()=>{finish();invalidate('Render region changed. Start a new render.');});
 for(const k of keys)$('region-'+k).addEventListener('change',()=>{if($('region-'+k).value===''){sync();return;}const next={...region,[k]:Number($('region-'+k).value)};try{percentRegion(10000,10000,next);region=next;invalidate('Render region changed. Start a new render.');}catch{$('region-status').textContent='Choose a rectangle inside the full frame.';}sync();});
 $('region-pick').addEventListener('click',()=>{selecting=!selecting;$('region-status').textContent=selecting?'Drag a rectangle in the view. Escape cancels.':'';sync();if(selecting)overlay.focus();});
 overlay.addEventListener('pointerdown',e=>{if(!selecting||e.button!==0)return;e.preventDefault();overlay.setPointerCapture(e.pointerId);drag={...point(e),id:e.pointerId,before:{...region}};});
 overlay.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const p=point(e);region={x:Math.min(drag.x,p.x),y:Math.min(drag.y,p.y),width:Math.abs(p.x-drag.x),height:Math.abs(p.y-drag.y)};sync();});
 overlay.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;if(region.width<1||region.height<1)region=drag.before;finish();invalidate('Render region selected. Start a new render.');});
 const cancel=()=>{if(drag)region=drag.before;finish();};
 for(const e of ['pointercancel','lostpointercapture'])overlay.addEventListener(e,cancel);
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();cancel();$('region-pick').focus();}});
 sync();return {get(width,height){return $('region-enabled').checked?percentRegion(width,height,region):undefined;},busy(value){if(value)finish();for(const id of ['region-enabled','region-pick',...keys.map(k=>'region-'+k)])$(id).disabled=value;}};
}
