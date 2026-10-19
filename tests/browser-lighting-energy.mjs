// SPDX-License-Identifier: Apache-2.0
async page=>await page.evaluate(async()=>{
 const {atmosphereDefaults}=await import('/atmosphere/solar.js');
 const {createTracer}=await import('/render/tracer.js'),{defaults}=await import('/scene/terrain.js'),{transportDefaults,areaLightDefaults}=await import('/lighting/model.js');
 const cases=[['off',{intensity:0}],['down',{pitch:-90}],['back',{pitch:90}],['moved',{pitch:-90,x:12}],['small',{pitch:-90,width:2,height:2}],['brighter',{pitch:-90,intensity:4}],['physical-off',{intensity:0}]],records=[];
 for(const [name,changes] of cases) {
  const t={...transportDefaults(),sun:0,sky:0,bounces:2,lights:[{...areaLightDefaults(),...changes}]};
  const tracer=await createTracer({...defaults,waterEnabled:false,transport:t,...(name==='physical-off'?{atmosphere:atmosphereDefaults()}:{} )},{width:640,height:360,samples:8});let image;
  try{await tracer.run(new AbortController().signal,s=>image=s);}finally{tracer.dispose();}
  let sum=0,left=0,right=0;for(let i=0;i<image.rgba.length;i+=4){const value=(image.rgba[i]+image.rgba[i+1]+image.rgba[i+2])/3;sum+=value;if((i/4)%640<320)left+=value;else right+=value;}
  records.push({name,mean:sum/(640*360),left,right});
 }
 const get=n=>records.find(r=>r.name===n);if(get('physical-off').mean!==0||get('off').mean!==0||get('back').mean!==0||get('down').mean<=1||get('brighter').mean<=get('down').mean||get('small').mean>=get('down').mean||Math.abs(get('moved').left/get('moved').right-get('down').left/get('down').right)<.05)throw Error(JSON.stringify(records));
 return records;
})
