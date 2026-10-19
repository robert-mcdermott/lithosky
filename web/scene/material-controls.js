// SPDX-License-Identifier: Apache-2.0
import { geologyDefaults } from '../material/geology.js';
import { updateSceneVersion } from './document.js';
import { materialDefaults } from './materials.js';
export function materialControls(getScene,edit) {
  const $=id=>document.getElementById(id);
  $('enable-materials').addEventListener('click',()=>edit(scene=>{
    scene.surface=materialDefaults();updateSceneVersion(scene);
    if(scene.terrain.generator==='layers-v1')scene.terrain.sculpt??=[];
  }));
  $('enable-geology').addEventListener('click',()=>edit(scene=>{scene.surface??=materialDefaults();scene.surface.geology=geologyDefaults();updateSceneVersion(scene);}));
  $('disable-geology').addEventListener('click',()=>edit(scene=>{delete scene.surface.geology;delete scene.surface.paint;updateSceneVersion(scene);}));
  const geologyKeys=['scale','strata','fractures','bump','roughness'];
  for(const key of geologyKeys)$('geology-'+key).addEventListener('change',()=>{
    const input=$('geology-'+key);if(input.value===''||!input.checkValidity()){sync();return;}
    const value=Number(input.value);edit(scene=>{scene.surface.geology[key]=value;});
  });
  $('material-preset').addEventListener('change',()=>{const preset=$('material-preset').value;edit(scene=>{scene.surface.preset=preset;});});
  const keys=['snowHeight','sandHeight','rockSlope','blend','detail','detailScale'];
  for(const key of keys) $('material-'+key).addEventListener('change',()=>{
    const input=$('material-'+key);if(input.value===''||!input.checkValidity()){sync();return;}
    const value=Number(input.value);edit(scene=>{scene.surface[key]=value;});
  });
  function sync() {
    const m=getScene().surface;$('enable-materials').hidden=!!m;$('material-editor').hidden=!m;
    $('legacy-detail-frequency').hidden=!!m?.geology;
    $('enable-geology').hidden=!!m?.geology;$('geology-editor').hidden=!m?.geology;
    if(m?.geology)for(const key of geologyKeys)$('geology-'+key).value=m.geology[key];
    if(!m)return;
    $('material-preset').value=m.preset;
    for(const key of keys)$('material-'+key).value=m[key];
    $('material-rules').hidden=m.preset!=='rules';
  }
  return {sync};
}
