// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cameraDefaults,enableCamera,cameraFrame,cameraRay,lensUniforms,imageDimensions,previewDimensions,FRAMES,percentRegion,pixelRegion} from '../web/camera/model.js';
import {defaultScene,legacyScene,renderState,validateScene,serializeScene,parseScene,updateSceneVersion} from '../web/scene/document.js';
import {projectPoint} from '../web/scene/sculpt-view.js';
import {renderKey,geometryKey} from '../web/scene/generation.js';
import {History} from '../web/scene/history.js';
import {validateCompositions} from '../web/scene/studies.js';
import {validateRenderOptions,renderTiles} from '../web/render/tracer.js';
import {atmosphereDefaults} from '../web/atmosphere/solar.js';
import {buildAtmosphere,SW,SH,SKY_OFFSET} from '../web/atmosphere/model.js';
const schema=JSON.parse(fs.readFileSync(new URL('../internal/scene/schema.json',import.meta.url))),near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} vs ${b}`),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
test('original compositions validate and match portable site scenes',()=>{
 const catalog=validateCompositions(JSON.parse(fs.readFileSync(new URL('../web/scenes/compositions.json',import.meta.url))),schema);
 for(const study of catalog)assert.deepEqual(study.scene,JSON.parse(fs.readFileSync(new URL('../docs/site/assets/'+study.id+'-composition.lithosky',import.meta.url))));
});
test('canceling a camera gesture restores its start and the previous redo branch',()=>{
 const h=new History(defaultScene(),s=>validateScene(s,schema));h.edit(s=>s.camera.yaw=1);h.undo();const before=h.value;
 h.begin();h.edit(s=>s.camera.lens.targetX=4);h.edit(s=>s.camera.lens.targetY=5);assert.equal(h.cancel(),true);assert.deepEqual(h.value,before);assert.equal(h.canRedo,true);h.redo();assert.equal(h.value.camera.yaw,1);
 h.begin();h.edit(s=>s.camera.lens.roll=10);h.edit(s=>s.camera.lens.roll=20);h.end();h.undo();assert.equal(h.value.camera.lens.roll,0);h.redo();assert.equal(h.value.camera.lens.roll,20);
 const bounded=new History(defaultScene(),s=>validateScene(s,schema),100,5000);for(let i=0;i<12;i++)bounded.edit(s=>s.camera.yaw=i/10);for(let i=0;i<3;i++)bounded.undo();bounded.begin();bounded.edit(s=>s.camera.yaw=-1);assert.ok(bounded.snapshotBytes<=5000);bounded.cancel();assert.ok(bounded.snapshotBytes<=5000);
});
test('camera upgrade preserves the old pinhole projection and is one undoable edit',()=>{
 const old=legacyScene(),history=new History(old,s=>validateScene(s,schema)),state=renderState(old),before=cameraFrame(state,16/9);history.edit(enableCamera);assert.equal(history.value.version,10);
 const after=cameraFrame(renderState(history.value),16/9);assert.deepEqual(before,after);assert.equal(history.value.camera.lens.dof,false);history.undo();assert.deepEqual(history.value,old);history.redo();assert.equal(history.value.camera.lens.focalLength,21.09375);
 const round=parseScene(serializeScene(history.value,schema),schema);assert.deepEqual(round,history.value);
});
test('thin lens rays meet the same focus plane point and preserve normalized directions',()=>{
 const state=renderState(defaultScene());state.lens={...state.lens,focalLength:120,fNumber:1.2,metresPerUnit:1,focusDistance:9,dof:true,roll:32};const f=cameraFrame(state,3/2),eye=Array.from(f.slice(0,3)),forward=Array.from(f.slice(12,15));
 for(const [u,v]of [[.5,.5],[.1,.8],[.9,.2]]){let expected;for(const [a,b]of [[0,0],[.2,.3],[.9,.8]]){const ray=cameraRay(state,3/2,u,v,a,b);near(Math.hypot(...ray.direction),1);const distance=(9-dot(ray.origin.map((x,i)=>x-eye[i]),forward))/dot(ray.direction,forward),point=ray.origin.map((x,i)=>x+ray.direction[i]*distance);if(expected)point.forEach((x,i)=>near(x,expected[i],2e-6));else expected=point;}}
 const radius=lensUniforms(state)[2];near(radius,.05);const large=lensUniforms({...state,lens:{...state.lens,metresPerUnit:100}});near(large[2],radius/100);near(large[1],.09);
});
test('rolled and translated camera projection agrees with central picking rays for every frame',()=>{
 const s=renderState(defaultScene());s.lens={...s.lens,targetX:12,targetY:4,targetZ:-9,roll:-37,focalLength:55};
 for(const aspect of Object.values(FRAMES))for(const [u,v]of [[.1,.9],[.5,.5],[.85,.2]]){const ray=cameraRay(s,aspect,u,v),p=ray.origin.map((x,i)=>x+ray.direction[i]*20),uv=projectPoint(s,aspect,p);near(uv[0],u);near(uv[1],v);}
});
test('output sizes and crops stay within a 2048 long edge and include portrait and square frames',()=>{
 for(const frame of Object.keys(FRAMES))for(const size of [640,960,1280,1600,2048]){const dimensions=imageDimensions(size,frame);assert.equal(Math.max(dimensions.width,dimensions.height),size);validateRenderOptions({...dimensions,samples:8});const p=previewDimensions({lens:{frame}});assert.equal(Math.max(p.width,p.height),320);validateRenderOptions({...p,samples:16,preview:true});}
 assert.deepEqual(imageDimensions(2048,'2:3'),{width:1365,height:2048});assert.deepEqual(imageDimensions(2048,'16:9'),{width:2048,height:1152});
 for(const options of [{width:2049,height:2049,samples:8},{width:4096,height:2304,samples:8},{width:2048,height:1152,samples:512}])assert.throws(()=>validateRenderOptions(options));
 assert.deepEqual(percentRegion(2048,1152,{x:25,y:25,width:50,height:50}),{x:512,y:288,width:1024,height:576});
 for(const r of [{x:-1,y:0,width:10,height:10},{x:10,y:0,width:95,height:10},{x:0,y:0,width:0,height:10},{x:NaN,y:0,width:10,height:10}])assert.throws(()=>percentRegion(2048,1152,r));assert.throws(()=>pixelRegion(640,360,{x:0,y:0,width:640.5,height:360}));
 const r={x:37,y:21,width:173,height:95},coverage=new Uint8Array(r.width*r.height);for(const [x,y,w,h]of renderTiles(r.width,r.height))for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)coverage[j*r.width+i]++;assert.ok(coverage.every(x=>x===1));
});
test('lens changes invalidate render state without regenerating terrain',()=>{
 const s=renderState(defaultScene());for(const [k,v]of [['frame','2:3'],['focalLength',85],['focusDistance',30],['fNumber',1.4],['targetX',3],['roll',12],['dof',true]]){const next=structuredClone(s);next.lens[k]=v;assert.equal(geometryKey(s),geometryKey(next));assert.notEqual(renderKey(s),renderKey(next));}
});
test('v10 validates independently optional renderer features and rejects malformed lenses',()=>{
 const s=defaultScene();assert.equal(s.version,10);for(const [key,value]of [['frame','4:5'],['focalLength',0],['fNumber',.1],['focusDistance',0],['metresPerUnit',0],['roll',181],['targetY',Infinity],['model','remote']]){const invalid=structuredClone(s);invalid.camera.lens[key]=value;assert.throws(()=>validateScene(invalid,schema));}
 for(const key of Object.keys(s.camera.lens)){const invalid=structuredClone(s);delete invalid.camera.lens[key];assert.throws(()=>validateScene(invalid,schema));}
 delete s.surface;delete s.atmosphere;delete s.lighting.transport;delete s.water.optics;updateSceneVersion(s);assert.equal(s.version,10);validateScene(s,schema);delete s.camera.lens;updateSceneVersion(s);assert.equal(s.version,1);validateScene(s,schema);
});
test('optional spherical ground adds reflected light only on planet-intersecting sky rays',async()=>{
 const a=atmosphereDefaults(38),fast={yieldControl:async()=>{}},plain=await buildAtmosphere(a,8,[0,.6,.8],fast),closed=await buildAtmosphere({...a,groundAlbedo:.12},8,[0,.6,.8],fast);let changed=0;
 for(let y=0;y<SH;y++)for(let x=0;x<SW;x++)for(let k=0;k<3;k++){const i=(SKY_OFFSET+y*SW+x)*4+k;assert.ok(Number.isFinite(closed.data[i])&&closed.data[i]>=plain.data[i]);if(y>=SH/2)assert.equal(closed.data[i],plain.data[i]);if(closed.data[i]>plain.data[i])changed++;}assert.ok(changed>100);
 const off=await buildAtmosphere({...a,groundAlbedo:0},8,[0,.6,.8],fast);assert.deepEqual(off.data,plain.data);
});
