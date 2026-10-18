// SPDX-License-Identifier: Apache-2.0
import { MAX_DABS, MAX_STROKES, extendStroke } from './sculpt.js';
import { fieldHeight, pickTerrain, projectPoint } from './sculpt-view.js';
export function sculptControls({viewport,getState,getField,isReady,commit,prepareView}) {
  const $=id=>document.getElementById(id),overlay=$('sculpt-overlay');
  let cursor=[0,0],stroke=null,pointer=null,request=0;
  const mode=()=>$('sculpt-tool').value;
  const available=()=>['layers-v1','heightmap-v1'].includes(getState().generator)&&isReady();
  const status=text=>{$('sculpt-status').textContent=text;};
  function cancel(message) {
    stroke=null;const id=pointer;pointer=null;
    if(id!==null&&viewport.hasPointerCapture(id))viewport.releasePointerCapture(id);
    if(message)status(message);draw();
  }
  function draw() {
    if(request)return;
    request=requestAnimationFrame(()=>{
      request=0;overlay.hidden=mode()==='orbit'||!available()||!$('render-image').hidden;
      if(overlay.hidden)return;
      const rect=viewport.getBoundingClientRect(),scale=Math.min(devicePixelRatio||1,1.5);
      overlay.width=Math.max(1,Math.round(rect.width*scale));overlay.height=Math.max(1,Math.round(rect.height*scale));
      const ctx=overlay.getContext('2d');ctx.scale(scale,scale);
      const state=getState(),field=getField(),aspect=rect.width/rect.height,radius=Number($('sculpt-radius').value);
      function screen(x,z) {return projectPoint(state,aspect,[x,fieldHeight(field,x,z)+.04,z]);}
      ctx.strokeStyle='#e4f4c5';ctx.lineWidth=2;ctx.shadowColor='#15221c';ctx.shadowBlur=3;ctx.beginPath();let first=true;
      for(let i=0;i<=48;i++) {
        const angle=i/48*Math.PI*2,x=Math.max(-32,Math.min(32,cursor[0]+Math.cos(angle)*radius)),z=Math.max(-32,Math.min(32,cursor[1]+Math.sin(angle)*radius)),p=screen(x,z);
        if(!p){first=true;continue;}const [px,py]=[p[0]*rect.width,p[1]*rect.height];if(first)ctx.moveTo(px,py);else ctx.lineTo(px,py);first=false;
      }ctx.stroke();
      ctx.fillStyle='#e4f4c5';for(const [x,z] of stroke?.points??[cursor]) {const p=screen(x,z);if(p){ctx.beginPath();ctx.arc(p[0]*rect.width,p[1]*rect.height,3,0,Math.PI*2);ctx.fill();}}
    });
  }
  function sync() {
    const state=getState(),layered=['layers-v1','heightmap-v1'].includes(state.generator),count=state.sculpt?.length??0;
    if(!layered)$('sculpt-tool').value='orbit';
    $('sculpt-editor').hidden=!layered;
    $('sculpt-tool').disabled=!layered;
    $('interaction-hint').textContent=mode()==='orbit'?'Drag to orbit · Scroll to explore':'Drag to sculpt · Escape cancels';
    for(const id of ['sculpt-radius','sculpt-strength'])$(id+'-value').textContent=Number($(id).value).toFixed(2);
    $('sculpt-count').textContent=`${count} / ${MAX_STROKES} strokes`;
    $('clear-sculpt').disabled=!count;
    $('apply-sculpt').disabled=!available()||mode()==='orbit'||count>=MAX_STROKES;
    for(const id of ['sculpt-radius','sculpt-strength','sculpt-x','sculpt-z'])$(id).disabled=!layered;
    $('sculpt-x').value=cursor[0].toFixed(2);$('sculpt-z').value=cursor[1].toFixed(2);
    viewport.setAttribute('aria-label',mode()==='orbit'?'Interactive terrain preview. Drag to orbit, scroll to zoom. Arrow keys orbit, plus and minus zoom.':'Sculpt terrain. Drag to draw a stroke. Arrow keys move the brush. Space or Enter applies it. Escape cancels a stroke.');
    viewport.classList.toggle('sculpting',mode()!=='orbit');
    if(!layered)status('Build with layers to sculpt a new landform.');
    else if(count>=MAX_STROKES)status('Stroke limit reached. Undo or clear sculpting to continue.');
    else if(['Build with layers to sculpt a new landform.','Stroke limit reached. Undo or clear sculpting to continue.'].includes($('sculpt-status').textContent))status('Choose a brush, then drag on terrain or use Apply brush.');
    draw();
  }
  function newStroke() {
    if(!available()||mode()==='orbit')return null;
    if((getState().sculpt?.length??0)>=MAX_STROKES){status('Stroke limit reached. Undo or clear sculpting to continue.');return null;}
    prepareView();
    const state=getState(),height=Math.max(-64,Math.min(64,fieldHeight(getField(),...cursor)/state.elevation));
    return {tool:mode(),radius:Number($('sculpt-radius').value),strength:Number($('sculpt-strength').value),height,points:[]};
  }
  function apply(staged) {
    if(!staged?.points.length)return;
    try {commit(scene=>{scene.version=scene.atmosphere?6:scene.terrain.generator==='heightmap-v1'?5:scene.surface?4:3;scene.terrain.sculpt??=[];scene.terrain.sculpt.push(staged);});status('Stroke applied. Undo restores the preceding terrain.');}
    catch(error){status('Could not apply stroke: '+error.message);}
    sync();
  }
  function hit(event) {
    const bounds=viewport.getBoundingClientRect(),p=pickTerrain(getField(),getState(),bounds.width/bounds.height,(event.clientX-bounds.left)/bounds.width,(event.clientY-bounds.top)/bounds.height);
    if(p)cursor=[Math.max(-32,Math.min(32,p[0])),Math.max(-32,Math.min(32,p[2]))];return p;
  }
  const consume=e=>{e.preventDefault();e.stopImmediatePropagation();};
  viewport.addEventListener('pointerdown',e=>{
    if(mode()==='orbit'||e.button!==0)return;consume(e);
    if(pointer!==null)return;viewport.focus();
    if(!available()||!hit(e))return;
    stroke=newStroke();if(!stroke)return;
    extendStroke(stroke,cursor);pointer=e.pointerId;viewport.setPointerCapture(pointer);status('Drawing stroke… Release to apply; Escape cancels.');sync();
  },true);
  viewport.addEventListener('pointermove',e=>{
    if(mode()==='orbit')return;consume(e);
    if(!available()||(pointer!==null&&e.pointerId!==pointer)||!hit(e))return;
    if(stroke){extendStroke(stroke,cursor);if(stroke.points.length===MAX_DABS)status('Stroke limit reached. Release to apply, then start another stroke.');}
    sync();
  },true);
  viewport.addEventListener('pointerup',e=>{
    if(mode()==='orbit')return;consume(e);if(pointer!==e.pointerId)return;
    const staged=stroke;cancel();apply(staged);
  },true);
  for(const event of ['pointercancel','lostpointercapture'])viewport.addEventListener(event,e=>{if(pointer===e.pointerId){consume(e);cancel('Stroke canceled.');}},true);
  viewport.addEventListener('keydown',e=>{
    if(mode()==='orbit'||e.ctrlKey||e.metaKey||e.altKey)return;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home',' ','Enter','Escape'].includes(e.key))return;
    consume(e);
    if(e.key==='Escape'){cancel('Stroke canceled.');return;}
    if(!available()||pointer!==null)return;
    if(e.key===' '||e.key==='Enter'){if(!e.repeat){const dab=newStroke();if(dab){extendStroke(dab,cursor);apply(dab);}}return;}
    const amount=e.shiftKey?2:.5;
    if(e.key==='Home')cursor=[0,0];
    else {const axis=['ArrowLeft','ArrowRight'].includes(e.key)?0:1;cursor[axis]=Math.max(-32,Math.min(32,cursor[axis]+(['ArrowLeft','ArrowUp'].includes(e.key)?-amount:amount)));}
    sync();status(`Brush at X ${cursor[0].toFixed(2)}, Z ${cursor[1].toFixed(2)}. Space applies ${mode()}.`);
  },true);
  $('sculpt-tool').addEventListener('change',()=>{cancel();if(mode()!=='orbit')prepareView();sync();status(mode()==='orbit'?'Drag to orbit the landscape.':'Drag on terrain, or move the brush with arrow keys and press Space. Flatten uses the starting height.');});
  for(const id of ['sculpt-radius','sculpt-strength'])$(id).addEventListener('input',()=>{cancel();sync();});
  for(const [id,axis] of [['sculpt-x',0],['sculpt-z',1]])$(id).addEventListener('change',()=>{cancel();if($(id).value!==''&&$(id).checkValidity())cursor[axis]=Number($(id).value);sync();});
  $('apply-sculpt').addEventListener('click',()=>{const dab=newStroke();if(dab){extendStroke(dab,cursor);apply(dab);}});
  $('clear-sculpt').addEventListener('click',()=>{cancel();commit(scene=>{scene.terrain.sculpt=[];});status('Sculpting cleared. Undo restores it.');});
  window.addEventListener('blur',()=>{if(stroke)cancel('Stroke canceled.');});
  new ResizeObserver(draw).observe(viewport);
  return {sync,draw,cancel};
}
