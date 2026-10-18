// SPDX-License-Identifier: Apache-2.0
import { MAX_PROJECT_BYTES, importedTerrain } from './heightmaps.js';
import { renderState } from './document.js';
export function heightmapControls({getScene,getVersion,commit,request,generate,isReady}) {
  const $=id=>document.getElementById(id);let busy=false;
  const status=text=>{$('heightmap-status').textContent=text;};
  function sync() {
    $('import-heightmap').disabled=busy;$('export-heightmap').disabled=busy||!isReady();
    const t=getScene().terrain;
    $('heightmap-info').textContent=t.generator==='heightmap-v1'?`${t.resolution+1} × ${t.resolution+1} samples · base height ${t.minimum.toFixed(4)}…${t.maximum.toFixed(4)} · ${t.metersPerUnit} metres per scene unit (${(64*t.metersPerUnit).toFixed(2)} m across). Scale is descriptive; the render patch spans 64 scene units.`:'Import replaces the landform; Undo brings it back. Export includes a 16-bit PNG and its scale metadata.';
  }
  $('import-heightmap').addEventListener('click',()=>$('heightmap-file').click());
  $('heightmap-file').addEventListener('change',async()=>{
    const file=$('heightmap-file').files[0];$('heightmap-file').value='';if(!file||busy)return;
    const before=getVersion();busy=true;sync();status('Reading and validating heightmap…');
    try {
      if(file.size>MAX_PROJECT_BYTES)throw new Error('Heightmap exceeds 20 MiB.');
      const data=await file.arrayBuffer(),bytes=new Uint8Array(data),isPNG=bytes[0]===137;
      if(isPNG)for(const id of ['heightmap-minimum','heightmap-maximum','heightmap-metres'])if(!$(id).checkValidity()||$(id).value==='')throw new Error('Enter valid import scale values.');
      const resolution=isPNG&&data.byteLength>=24?new DataView(data).getUint32(16,false)-1:128;
      const scale={format:'lithosky-heightmap',version:1,resolution,minimum:Number($('heightmap-minimum').value),maximum:Number($('heightmap-maximum').value),metersPerUnit:Number($('heightmap-metres').value),elevation:1,rowOrder:'z-increasing'};
      const response=await request('/api/heightmap/import',{body:data,headers:{'X-Lithosky-Scale':JSON.stringify(scale)}}),imported=await response.json();
      if(before!==getVersion())throw new Error('The scene changed while importing. Try Import again.');
      commit(scene=>{scene.version=5;scene.terrain=importedTerrain(scene.terrain,imported.asset,imported.scale);});
      status('Heightmap imported. Undo restores the previous landform. Save scene includes the height samples.');
    } catch(error){status('Could not import: '+error.message);}finally{busy=false;sync();}
  });
  $('export-heightmap').addEventListener('click',async()=>{
    if(busy||!isReady())return;const before=getVersion(),scene=getScene();busy=true;sync();status('Preparing 16-bit height samples…');
    try {
      const result=await generate(renderState(scene)),response=await request('/api/heightmap/export',{body:result.raw,headers:{'X-Lithosky-Scale':JSON.stringify(result.scale)}}),blob=await response.blob();
      if(before!==getVersion())throw new Error('The scene changed during export. Export again.');
      downloadBlob(blob,'terrain.heightmap');status('Heightmap download requested: height.png and scale.json in a ZIP bundle.');
    }catch(error){status('Could not export: '+error.message);}finally{busy=false;sync();}
  });
  return {sync};
}
export function downloadBlob(blob,name) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
