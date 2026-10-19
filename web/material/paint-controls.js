// SPDX-License-Identifier: Apache-2.0
import {pickTerrain,projectPoint,fieldHeight} from '../scene/sculpt-view.js';
import {sceneView,entityScene,kindOf,entityState} from '../scene/entities.js';
import {MAX_PAINT_POINTS,MAX_PAINT_STROKES} from './masks.js';
export function paintControls({viewport,getState,getScene,getField,isReady,command,prepare}){
 const $=id=>document.getElementById(id),overlay=$('paint-overlay');let stroke=null,pointer=null,cursor=[0,0],raf=0;
 const mode=()=>$('paint-tool').value,enabled=()=>mode()!=='off';
 const message=t=>$('paint-status').textContent=t;
 function available(){const graph=entityScene(getScene()),land=graph.entities.find(n=>kindOf(n)==='terrain');return isReady()&&getState().terrainVisible!==false&&!entityState(graph,land.id).locked;}
 function cancel(){stroke=null;const id=pointer;pointer=null;if(id!==null&&viewport.hasPointerCapture(id))viewport.releasePointerCapture(id);draw();}
 function sync(){const strokes=sceneView(getScene()).surface?.paint??[],points=strokes.reduce((n,s)=>n+s.points.length,0);$('paint-budget').textContent=strokes.length+' / 32 strokes · '+points+' / 512 points · 64 × 64 mask';$('paint-clear').disabled=!strokes.length||!available();$('paint-apply').disabled=!enabled()||!available()||strokes.length>=32||points>=512;draw();}
 function draw(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;overlay.hidden=!enabled()||!available()||!$('render-image').hidden;if(overlay.hidden)return;const r=viewport.getBoundingClientRect();overlay.width=Math.max(1,Math.round(r.width));overlay.height=Math.max(1,Math.round(r.height));const c=overlay.getContext('2d');c.strokeStyle='#f2c982';c.lineWidth=2;c.beginPath();const radius=Number($('paint-radius').value);let start=true;for(let i=0;i<=48;i++){const x=Math.max(-32,Math.min(32,cursor[0]+radius*Math.cos(i/48*Math.PI*2))),z=Math.max(-32,Math.min(32,cursor[1]+radius*Math.sin(i/48*Math.PI*2))),uv=projectPoint(getState(),r.width/r.height,[x,fieldHeight(getField(),x,z)+.03,z]);if(!uv){start=true;continue;}if(start)c.moveTo(uv[0]*r.width,uv[1]*r.height);else c.lineTo(uv[0]*r.width,uv[1]*r.height);start=false;}c.stroke();});}
 function addPoint(){if(!stroke)return;if(stroke.points.length&&Math.hypot(...cursor.map((x,i)=>x-stroke.points.at(-1)[i]))<.2)return;const used=(sceneView(getScene()).surface?.paint??[]).reduce((n,s)=>n+s.points.length,0);if(stroke.points.length<Math.min(32,512-used))stroke.points.push([...cursor]);else message('Stroke point limit reached. Release to apply.');}
 function newStroke(){const strokes=sceneView(getScene()).surface?.paint??[];if(!available()||!enabled())return null;if(strokes.length>=MAX_PAINT_STROKES||strokes.reduce((n,s)=>n+s.points.length,0)>=MAX_PAINT_POINTS){message('Paint budget reached. Undo or clear paint to continue.');return null;}return {material:mode(),radius:Number($('paint-radius').value),strength:Number($('paint-strength').value),points:[]};}
 function apply(s){if(s?.points.length&&command('paint',{stroke:s})){message('Material stroke applied. Undo restores the previous mask.');}sync();}
 function hit(e){const r=viewport.getBoundingClientRect(),p=pickTerrain(getField(),getState(),r.width/r.height,(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);if(p){cursor=[p[0],p[2]];for(const [i,k]of ['x','z'].entries())$('paint-'+k).value=cursor[i].toFixed(2);}return !!p;}
 const consume=e=>{e.preventDefault();e.stopImmediatePropagation();};
 viewport.addEventListener('pointerdown',e=>{if(!enabled()||e.button!==0)return;consume(e);viewport.focus();if(!available()||!hit(e))return;stroke=newStroke();if(!stroke)return;addPoint();pointer=e.pointerId;viewport.setPointerCapture(pointer);draw();},true);
 viewport.addEventListener('pointermove',e=>{if(!enabled())return;consume(e);if(!available()||pointer!==null&&pointer!==e.pointerId||!hit(e))return;addPoint();draw();},true);
 viewport.addEventListener('pointerup',e=>{if(!enabled())return;consume(e);if(pointer!==e.pointerId)return;const s=stroke;cancel();apply(s);},true);
 for(const name of ['pointercancel','lostpointercapture'])viewport.addEventListener(name,e=>{if(pointer===e.pointerId){consume(e);cancel();message('Paint stroke canceled.');}},true);
 viewport.addEventListener('keydown',e=>{if(!enabled()||e.ctrlKey||e.metaKey||e.altKey)return;if(['Escape','Enter',' ','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){consume(e);if(e.key==='Escape'){cancel();$('paint-tool').value='off';sync();message('Paint canceled.');return;}if(e.key==='Enter'||e.key===' '){if(!e.repeat)$('paint-apply').click();return;}const axis=['ArrowLeft','ArrowRight'].includes(e.key)?0:1;cursor[axis]=Math.max(-32,Math.min(32,cursor[axis]+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)*(e.shiftKey?4:1)));for(const [i,k]of ['x','z'].entries())$('paint-'+k).value=cursor[i];draw();}},true);
 $('paint-tool').addEventListener('change',()=>{cancel();if(enabled()){const selected=mode();prepare();$('paint-tool').value=selected;}sync();message(enabled()?'Drag on terrain to paint. Escape cancels; Space applies at the brush coordinates.':'Paint brush off.');});
 $('paint-apply').addEventListener('click',()=>{const s=newStroke();if(s){s.points=[[...cursor]];apply(s);}});
 $('paint-clear').addEventListener('click',()=>{cancel();command('paint-clear');sync();});
 for(const [i,k]of ['x','z'].entries())$('paint-'+k).addEventListener('change',()=>{cancel();const el=$('paint-'+k);if(el.value!==''&&el.checkValidity())cursor[i]=Number(el.value);draw();});
 for(const id of ['paint-radius','paint-strength'])$(id).addEventListener('change',()=>{cancel();sync();});
 for(const id of ['select-object','place-primitive','tool-move','tool-rotate','tool-scale','camera-focus-pick','region-pick','sculpt-tool'])$(id).addEventListener(id==='sculpt-tool'?'change':'click',()=>{cancel();$('paint-tool').value='off';sync();});
 window.addEventListener('blur',cancel);new ResizeObserver(()=>{cancel();draw();}).observe(viewport);
 return {sync,draw,cancel,stop(){cancel();$('paint-tool').value='off';sync();}};
}
