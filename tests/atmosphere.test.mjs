// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {earthModel,transmittance,integrate,rayleighPhase,miePhase,buildAtmosphere,lookupTrans,sample2D,directionUV,SKY_OFFSET,SW,SH,LUT_BYTES} from '../web/atmosphere/model.js';
import {atmosphereDefaults,solarPosition,sunDirection,leapYear} from '../web/atmosphere/solar.js';
import {legacyScene as defaultScene,renderState,parseScene,serializeScene} from '../web/scene/document.js';
import {geometryKey,renderKey} from '../web/scene/generation.js';
import {frameUniforms} from '../web/scene/terrain.js';
const near=(a,b,e)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b} (tolerance ${e})`),fast={yieldControl:async()=>{}};
test('published atmospheric reference: analytic vertical extinction and single scattering',()=>{
 // Bruneton 2017 reference/functions_test.cc: arbitrary atmosphere, 123 W/m²/nm.
 // Numeric expected values evaluated from its closed-form reference expressions.
 const m={...earthModel(),radius:1000,top:1500,rayleigh:[.001,.001,.001],mie:.0015,extinction:.002,ozone:[0,0,0],rayleighHeight:60,mieHeight:30};
 near(transmittance(0,1,m)[0],.8869332312001434,4e-6);
 const up=integrate(0,[0,1,0],[0,1,0],m,(h,mu)=>transmittance(h,mu,m,1024),512);
 near(up.radiance[0]*123,20.758050555846616,.001);
 const noAerosols={...m,mie:0,extinction:0},depth=.001*60*(1-Math.exp(-500/60));
 const down=integrate(500,[0,-1,0],[0,1,0],noAerosols,(h,mu)=>transmittance(h,mu,noAerosols,1024),512);
 near(down.radiance[0]*123,123*.5*(1-Math.exp(-2*depth))*rayleighPhase(-1),.0001);
});
test('normalized phase functions and atmosphere boundary/vacuum invariants',()=>{
 for(const fn of [rayleighPhase,miePhase]){let sum=0;const count=20000;for(let i=0;i<count;i++)sum+=fn(-1+(i+.5)*2/count)*4*Math.PI/count;near(sum,1,2e-6);}
 const m=earthModel();assert.deepEqual(transmittance(0,-.1,m),[0,0,0]);assert.deepEqual(transmittance(60,1,m),[1,1,1]);
 const vacuum={...m,rayleigh:[0,0,0],mie:0,extinction:0,ozone:[0,0,0]},v=integrate(1,[0,1,0],[0,1,0],vacuum,()=>[1,1,1]);assert.deepEqual(v,{radiance:[0,0,0],transmittance:[1,1,1]});
});
test('Earth LUTs agree with dense reference transport at zenith, horizon and altitude',async()=>{
 const a=atmosphereDefaults(),m=earthModel(a),sun=sunDirection(a),{data}=await buildAtmosphere(a,8,sun,fast);
 assert.equal(data.byteLength,LUT_BYTES);assert.equal(LUT_BYTES,393216);assert.ok(data.every(v=>Number.isFinite(v)&&v>=0));
 for(const [h,mu]of [[0,1],[0,.1],[0,0],[2,.5],[10,-.02],[60,1]]){const ref=transmittance(h,mu,m,4096),sample=lookupTrans(data,h,mu,m);sample.forEach((v,i)=>near(v,ref[i],.0002));}
 for(const d of [[0,1,0],[0,0,-1],[1,.1,0].map((v,_,x)=>v/Math.hypot(...x))]){const ref=integrate(.8,d,sun,m,(h,mu)=>transmittance(h,mu,m,1024),512).radiance,sample=sample2D(data,SKY_OFFSET,SW,SH,...directionUV(d));sample.forEach((v,i)=>near(v,ref[i],.0001));}
 const seamA=sample2D(data,SKY_OFFSET,SW,SH,0,.7),seamB=sample2D(data,SKY_OFFSET,SW,SH,1,.7);seamA.forEach((v,i)=>near(v,seamB[i],1e-7));
});
test('ozone and aerosols attenuate sunlight; distance transport has identity and finite night output',()=>{
 const m=earthModel(),sun=[0,1,0],d=[1,0,0],clear=earthModel({aerosols:0,ozone:0});
 transmittance(0,1,m).forEach((v,i)=>assert.ok(v<transmittance(0,1,clear)[i]));
 assert.deepEqual(integrate(1,d,sun,m,()=>[1,1,1],64,0),{radiance:[0,0,0],transmittance:[1,1,1]});
 const a=integrate(1,d,sun,m,(h,mu)=>transmittance(h,mu,m),64,1),b=integrate(1,d,sun,m,(h,mu)=>transmittance(h,mu,m),64,10);a.transmittance.forEach((v,i)=>assert.ok(v>b.transmittance[i]));
 const night=integrate(1,[0,1,0],[0,-1,0],m,(h,mu)=>transmittance(h,mu,m));assert.ok(night.radiance.every(v=>v===0));
});
test('NOAA solar approximation matches published NREL example within 0.3 degrees',()=>{
 // NREL/TP-560-34302 table A5.1: 2003-10-17 19:30:30 UTC.
 const p=solarPosition({latitude:39.742476,longitude:-105.1786,year:2003,day:290,utcMinutes:1170.5});near(p.elevation,90-50.11162,.3);near(p.azimuth,194.34024,.3);
 for(const latitude of [-90,0,90])for(const day of [1,172,355]){const p=solarPosition({latitude,longitude:180,year:2024,day,utcMinutes:0});assert.ok(Number.isFinite(p.elevation)&&Number.isFinite(p.azimuth));}
 assert.equal(leapYear(2000),true);assert.equal(leapYear(2100),false);
 const base=atmosphereDefaults();for(const [az,want]of [[0,[0,0,-1]],[90,[1,0,0]],[180,[0,0,1]],[270,[-1,0,0]]])sunDirection({...base,sunElevation:0,sunAzimuth:az}).forEach((v,i)=>near(v,want[i],1e-12));
});
test('atmosphere edits persist and invalidate light without regenerating terrain',()=>{
 const schema=JSON.parse(readFileSync(new URL('../internal/scene/schema.json',import.meta.url))),scene={...defaultScene(),version:6,atmosphere:atmosphereDefaults()},before=structuredClone(renderState(scene));
 assert.deepEqual(parseScene(serializeScene(scene,schema),schema),scene);scene.atmosphere.sunAzimuth=90;
 const after=renderState(scene);assert.equal(geometryKey(before),geometryKey(after));assert.notEqual(renderKey(before),renderKey(after));
 const light=frameUniforms(after,16/9).slice(16,19);sunDirection(scene.atmosphere).forEach((v,i)=>near(light[i],v,1e-7));
});
test('atmosphere preparation yields and responds to cancellation before upload',async()=>{
 const a=atmosphereDefaults(),abort=new AbortController();let yields=0;
 await assert.rejects(buildAtmosphere(a,8,sunDirection(a),{signal:abort.signal,yieldControl:async()=>{yields++;abort.abort();}}),{name:'AbortError'});assert.equal(yields,1);
});
