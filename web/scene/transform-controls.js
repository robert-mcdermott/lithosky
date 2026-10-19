// SPDX-License-Identifier: Apache-2.0
import {entityScene,kindOf,entityState} from './entities.js';
import {copySelection,selectionRoots,transformable,descendants} from './spatial-editor.js';
import {transformDefaults,dot,cross,unit} from './spatial.js';
import {gizmoGeometry,hitGizmo} from './transform-gizmo.js';
import {cameraRay} from '../camera/model.js';
import {intersectHeightfield} from '../render/heightfield.js';
import {fieldHeight} from './sculpt-view.js';
import {primitiveBudget} from './primitives.js';

export function transformControls({getScene,getState,getField,objects,viewport,command,begin,end,cancel,prepareView}){
 const $=id=>document.getElementById(id),canvas=$('transform-overlay');let tool='',placing=false,drag=null,clipboard=null,frame=0;
 const graph=()=>entityScene(getScene()),message=text=>{$('entity-status').textContent=text;};
 function setTool(value){if(drag)abort();tool=tool===value?'':value;placing=false;objects.mode(false);$('sculpt-tool').value='orbit';$('sculpt-tool').dispatchEvent(new Event('change'));prepareView();sync();viewport.focus();}
 function invoke(name,value={},base){const result=command(name,objects.selection,value,base);if(result){if(!drag){objects.select(result);if(['add','paste','duplicate-selection','group-selection'].includes(name))$('library-objects').click();}sync();draw();}return result;}
 for(const mode of ['move','rotate','scale'])$('tool-'+mode).addEventListener('click',()=>setTool(mode));
 $('select-object').addEventListener('click',()=>{tool='';placing=false;if($('select-object').getAttribute('aria-pressed')==='true')prepareView(true);sync();});
 for(const id of ['camera-focus-pick','region-pick'])$(id).addEventListener('click',()=>{tool='';placing=false;if(drag)abort();sync();});
 $('sculpt-tool').addEventListener('change',()=>{if($('sculpt-tool').value!=='orbit'){tool='';placing=false;sync();}});
 $('transform-space').addEventListener('change',draw);
 $('place-primitive').addEventListener('click',()=>{if(drag)abort();placing=!placing;tool='';objects.mode(false);$('sculpt-tool').value='orbit';$('sculpt-tool').dispatchEvent(new Event('change'));prepareView();sync();viewport.focus();message(placing?'Click terrain or water to place the primitive. Escape cancels.':'Placement canceled.');});
 $('add-primitive').addEventListener('click',()=>{const state=getState();if(state.terrainVisible!==false&&!getField()){message('Wait for terrain generation before adding at the aim target.');return;}const p=[state.lens?.targetX??0,0,state.lens?.targetZ??-4];if(getField()&&state.terrainVisible!==false&&Math.abs(p[0])<=32&&Math.abs(p[2])<=32)p[1]=fieldHeight(getField(),p[0],p[2]);if(invoke('add',{shape:$('add-shape').value,position:p})){tool='move';placing=false;prepareView();sync();}});
 $('copy-objects').addEventListener('click',()=>{try{clipboard=copySelection(getScene(),objects.selection);message('Copied '+clipboard.roots.length+' object(s). The object clipboard stays in this window.');sync();}catch(e){message(e.message);}});
 $('paste-objects').addEventListener('click',()=>invoke('paste',clipboard));
 for(const [button,name]of [['duplicate-objects','duplicate-selection'],['group-objects','group-selection'],['delete-objects','delete-selection']])$(button).addEventListener('click',()=>invoke(name));
 $('drop-objects').addEventListener('click',()=>invoke('drop',{field:getField(),terrainVisible:getState().terrainVisible}));
 for(const [axis,id]of ['align-x','align-y','align-z'].entries())$(id).addEventListener('click',()=>invoke('align',{axis}));
 for(const key of ['position','rotation','scale'])for(let axis=0;axis<3;axis++)$('pose-'+key+'-'+axis).addEventListener('change',()=>{const input=$('pose-'+key+'-'+axis);if(input.value===''||!input.checkValidity()){sync();return;}const g=graph(),roots=selectionRoots(g,objects.selection);if(roots.length!==1)return;const t=structuredClone(roots[0].components.transform??transformDefaults());t[key][axis]=Number(input.value);if(key==='scale'&&kindOf(roots[0])==='group')t.scale.fill(Number(input.value));invoke('set-transform',t);sync();});
 $('apply-transform').addEventListener('click',()=>adjust(Number($('transform-amount').value)));
 function adjust(amount){const mode=tool||'move';if(!Number.isFinite(amount)||mode==='scale'&&amount<=0){message('Enter a finite adjustment; scale factors must be positive.');return;}invoke('transform',{mode,axis:Number($('transform-axis').value),amount,space:$('transform-space').value});}
 function sync(){
  const g=graph(),ids=objects.selection,roots=selectionRoots(g,ids),eligible=roots.length>0&&roots.every(n=>transformable(g,n)),locked=roots.some(n=>descendants(g,n.id).some(e=>entityState(g,e.id).locked)),one=roots.length===1&&ids.length===1;
  $('transform-editor').hidden=!ids.length;$('numeric-pose').hidden=!eligible||!one;$('transform-adjustment').hidden=!eligible;
  $('transform-note').textContent=!eligible?'Handles support primitives and groups containing only primitives. Terrain, water, camera and environment use their existing editors. Area lights use Light transport position, direction and size.':locked?'A selected object or descendant is locked. Unlock it in Objects before transforming the selection.':one?'Numeric position and rotation are relative to the parent group. Groups scale uniformly.':'Transforms apply once to each selected root around the selection pivot. Selection scaling is uniform.';
  for(const mode of ['move','rotate','scale'])$('tool-'+mode).setAttribute('aria-pressed',String(tool===mode));$('place-primitive').setAttribute('aria-pressed',String(placing));$('transform-space').disabled=tool==='scale';if(tool==='scale')$('transform-space').value='local';
  if(one&&eligible){const t=roots[0].components.transform??transformDefaults();for(const key of ['position','rotation','scale'])for(let axis=0;axis<3;axis++){const input=$('pose-'+key+'-'+axis);if(document.activeElement!==input)input.value=Number(t[key][axis].toFixed(5));input.disabled=locked;}}
  $('apply-transform').disabled=!eligible||locked;$('paste-objects').disabled=!clipboard;$('copy-objects').disabled=!ids.length;for(const id of ['duplicate-objects','delete-objects'])$(id).disabled=!ids.length;for(const id of ['group-objects','drop-objects'])$(id).disabled=!eligible||locked;for(const id of ['align-x','align-y','align-z'])$(id).disabled=!eligible||locked||roots.length<2;
  const count=g.entities.filter(n=>kindOf(n)==='primitive').length,meshBytes=primitiveBudget(getState().primitives??[]).previewBytes;$('object-budget').textContent=count+' / 32 primitives · '+(meshBytes/1048576).toFixed(2)+' MiB preview vertices · '+(Math.max(1,(getState().primitives??[]).length)*96)+' B analytic GPU records. Terrain buffers are separate.';
  if(tool||placing){$('interaction-hint').textContent=placing?'Click to place · Escape cancels':tool[0].toUpperCase()+tool.slice(1)+' handles · Escape to orbit';viewport.setAttribute('aria-label','Object editing view. Drag an axis handle; arrow keys adjust the selected axis. Escape cancels.');}draw();
 }
 function geometry(){const r=viewport.getBoundingClientRect();return gizmoGeometry(graph(),objects.selection,getState(),r.width,r.height,tool,$('transform-space').value);}
 function draw(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;const r=viewport.getBoundingClientRect();canvas.width=Math.max(1,Math.round(r.width));canvas.height=Math.max(1,Math.round(r.height));const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);const g=graph(),roots=selectionRoots(g,objects.selection);if(!tool||!roots.length||!roots.every(n=>transformable(g,n))||roots.some(n=>entityState(g,n.id).locked))return;const handles=geometry();if(!handles.center)return;
   for(const h of handles.handles){ctx.strokeStyle=['#f18e7d','#b9d886','#89baf4'][h.axis];ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=drag?.axis===h.axis?4:2;ctx.beginPath();if(tool==='rotate'){let started=false;for(const p of h.ring){if(!p){started=false;continue;}if(started)ctx.lineTo(...p);else ctx.moveTo(...p);started=true;}}else if(h.end){ctx.moveTo(...handles.center);ctx.lineTo(...h.end);}ctx.stroke();if(tool!=='rotate'&&h.end){ctx.fillRect(h.end[0]-5,h.end[1]-5,10,10);ctx.font='bold 12px sans-serif';ctx.fillText('XYZ'[h.axis],h.end[0]+9,h.end[1]-7);}}
   if(tool==='scale'){ctx.fillStyle='#edf3df';ctx.fillRect(handles.center[0]-5,handles.center[1]-5,10,10);}
  });}
 function ringVector(x,y,pivot,axis){const r=viewport.getBoundingClientRect(),ray=cameraRay(getState(),r.width/r.height,x/r.width,y/r.height),den=dot(ray.direction,axis);if(Math.abs(den)<1e-5)return null;const t=dot(pivot.map((v,i)=>v-ray.origin[i]),axis)/den;if(t<=0)return null;const v=ray.origin.map((v,i)=>v+ray.direction[i]*t-pivot[i]);return Math.hypot(...v)>1e-5?unit(v):null;}
 function abort(){if(!drag)return;const old=drag;drag=null;cancel();if(viewport.hasPointerCapture(old.pointer))viewport.releasePointerCapture(old.pointer);message('Transform canceled. Previous scene and redo history restored.');sync();}
 viewport.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;const r=viewport.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  if(placing){e.preventDefault();e.stopImmediatePropagation();const state=getState(),ray=cameraRay(state,r.width/r.height,x/r.width,y/r.height);let t=state.terrainVisible!==false&&getField()?intersectHeightfield(getField(),ray.origin,ray.direction)?.t:undefined;
   if(state.waterEnabled&&Math.abs(ray.direction[1])>1e-8){const water=(state.waterLevel-ray.origin[1])/ray.direction[1],p=ray.origin.map((v,i)=>v+ray.direction[i]*water);if(water>.001&&water<(t??Infinity)&&Math.abs(p[0])<=32&&Math.abs(p[2])<=32)t=water;}
   if(t===undefined&&state.terrainVisible===false&&!state.waterEnabled&&Math.abs(ray.direction[1])>1e-8){const plane=-ray.origin[1]/ray.direction[1];if(plane>.001)t=plane;}
   if(t===undefined){message('No placement surface here. Choose terrain or water, or use Add at the camera target.');return;}if(invoke('add',{shape:$('add-shape').value,position:ray.origin.map((v,i)=>v+ray.direction[i]*t)})){placing=false;tool='move';sync();}return;
  }
  if(!tool||!objects.selection.length)return;const g=graph(),roots=selectionRoots(g,objects.selection);if(!roots.every(n=>transformable(g,n))||roots.some(n=>descendants(g,n.id).some(e=>entityState(g,e.id).locked)))return;const geo=geometry(),hit=hitGizmo(geo,x,y,tool);if(!hit)return;
  e.preventDefault();e.stopImmediatePropagation();prepareView();begin();viewport.focus();viewport.setPointerCapture(e.pointerId);$('transform-axis').value=hit.axis;
  const h=geo.handles[hit.axis],end=h.end??geo.center.map((v,i)=>v+(i===0?80:0));drag={pointer:e.pointerId,base:getScene(),ids:objects.selection,axis:hit.axis,uniform:hit.uniform,pivot:geo.pivot,x,y,center:geo.center,screen:end.map((v,i)=>v-geo.center[i]),length:geo.length,angle:Math.atan2(y-geo.center[1],x-geo.center[0]),space:$('transform-space').value,mode:tool,axisDirection:h.direction,ringStart:ringVector(x,y,geo.pivot,h.direction)};draw();
 },true);
 viewport.addEventListener('pointermove',e=>{if(!drag||drag.pointer!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();const r=viewport.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,dx=x-drag.x,dy=y-drag.y,screenLength=Math.hypot(...drag.screen),projected=screenLength>8?(dx*drag.screen[0]+dy*drag.screen[1])/screenLength:dx-dy;let amount;
  if(drag.mode==='move')amount=projected/Math.max(8,screenLength)*drag.length;
  else if(drag.mode==='rotate'){const v=ringVector(x,y,drag.pivot,drag.axisDirection);let angle=drag.ringStart&&v?Math.atan2(dot(drag.axisDirection,cross(drag.ringStart,v)),dot(drag.ringStart,v)):Math.atan2(y-drag.center[1],x-drag.center[0])-drag.angle;angle=Math.atan2(Math.sin(angle),Math.cos(angle));amount=angle*180/Math.PI;}
  else amount=Math.exp((drag.uniform?dx-dy:projected)/100);
  if($('transform-snap').checked){const step=drag.mode==='move'?.5:drag.mode==='rotate'?15:.1;amount=drag.mode==='scale'?Math.max(.1,1+Math.round((amount-1)/step)*step):Math.round(amount/step)*step;}
  command('transform',drag.ids,{mode:drag.mode,axis:drag.axis,amount,uniform:drag.uniform,space:drag.space,pivot:drag.pivot},drag.base);draw();
 },true);
 viewport.addEventListener('pointerup',e=>{if(!drag||drag.pointer!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();const old=drag;drag=null;end();if(viewport.hasPointerCapture(old.pointer))viewport.releasePointerCapture(old.pointer);sync();},true);
 for(const event of ['pointercancel','lostpointercapture'])viewport.addEventListener(event,()=>{if(drag)abort();},true);
 window.addEventListener('keydown',e=>{
  const editing=e.target.matches('input,textarea,select,[contenteditable=true]'),inView=e.target.closest('#viewport,#objects-tree');if(editing&&!drag)return;
  if(e.key==='Escape'&&(drag||placing||tool&&inView)){e.preventDefault();e.stopImmediatePropagation();if(drag)abort();else{placing=false;tool='';objects.mode(false);sync();}return;}
  if(!inView)return;
  if((e.ctrlKey||e.metaKey)&&!e.altKey){const action={c:'copy-objects',v:'paste-objects',d:'duplicate-objects'}[e.key.toLowerCase()];if(action){e.preventDefault();e.stopImmediatePropagation();if(drag)abort();$(action).click();return;}if(e.key.toLowerCase()==='a'){e.preventDefault();objects.select(graph().entities.filter(n=>kindOf(n)==='primitive').map(n=>n.id));return;}if(drag&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopImmediatePropagation();abort();return;}}
  if(e.ctrlKey||e.metaKey||e.altKey)return;if(['w','e','r'].includes(e.key.toLowerCase())){e.preventDefault();setTool({w:'move',e:'rotate',r:'scale'}[e.key.toLowerCase()]);return;}
  if(['Delete','Backspace'].includes(e.key)&&objects.selection.length){e.preventDefault();e.stopImmediatePropagation();invoke('delete-selection');return;}
  if(tool&&e.target.closest('#viewport')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();let amount=Number($('transform-amount').value)*(e.shiftKey?10:1);if(['ArrowLeft','ArrowDown'].includes(e.key))amount=tool==='scale'?1/Math.max(.01,amount):-amount;adjust(amount);}
 },true);
 let size='';new ResizeObserver(()=>{const r=viewport.getBoundingClientRect(),next=r.width+':'+r.height;if(size&&size!==next&&drag)abort();size=next;draw();}).observe(viewport);
 return {sync,draw,cancel:abort};
}
