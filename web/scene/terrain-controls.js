// SPDX-License-Identifier: Apache-2.0
import { layeredTerrain, newLayer } from './noise.js';
import { terrainBudget } from './generation.js';
export function terrainControls(getScene, edit) {
  const $=id=>document.getElementById(id); let shown='';
  $('enable-layers').addEventListener('click',()=>edit(scene=>{scene.version=scene.surface?4:2;scene.terrain=layeredTerrain(scene.terrain);if(scene.surface)scene.terrain.sculpt=[];}));
  $('terrain-resolution').addEventListener('change',()=>{const value=Number($('terrain-resolution').value);edit(scene=>{scene.terrain.resolution=value;});});
  $('add-layer').addEventListener('click',()=>{const kind=$('layer-kind').value;edit(scene=>{if(scene.terrain.layers.length<8)scene.terrain.layers.push(newLayer(kind));});});
  function sync() {
    const terrain=getScene().terrain, layered=terrain.generator==='layers-v1';
    $('enable-layers').hidden=layered;$('layer-editor').hidden=!layered;
    if(!layered) {shown='';return;}
    $('terrain-resolution').value=terrain.resolution;
    const budget=terrainBudget(terrain.resolution);
    $('terrain-budget').textContent=`${terrain.resolution} × ${terrain.resolution} cells · ${(budget.heightBytes/1048576).toFixed(1)} MiB height grid · about ${Math.ceil(budget.peakBytes/1048576)} MiB generation budget. Preview and stills currently use a 128 × 128 mesh.`;
    $('add-layer').disabled=terrain.layers.length>=8;
    const key=JSON.stringify(terrain.layers);if(key===shown)return;shown=key;
    const focus=document.activeElement?.id;
    $('terrain-layers').replaceChildren(...terrain.layers.map((layer,index)=>{
      const group=document.createElement('fieldset'),legend=document.createElement('legend');
      const names={fbm:'Rolling hills',ridge:'Ridges',warp:'Domain warp',terrace:'Terraces'};
      legend.textContent=`${index+1}. ${names[layer.kind]}`;group.append(legend);
      function input(label,key,type,min,max,step) {
        const wrap=document.createElement('label'),control=document.createElement('input');
        wrap.textContent=label;control.id=`layer-${index}-${key}`;control.type=type;
        control.setAttribute('aria-label',`${label}, layer ${index+1}`);
        if(type==='checkbox')control.checked=layer[key];else {control.value=layer[key];control.min=min;control.max=max;control.step=step;}
        control.addEventListener('change',()=>{
          if(!control.checkValidity() || (type!=='checkbox' && control.value==='')) {shown='';sync();return;}
          const value=type==='checkbox'?control.checked:Number(control.value);edit(scene=>{scene.terrain.layers[index][key]=value;});
        });wrap.append(control);group.append(wrap);
      }
      input('Enabled','enabled','checkbox');input('Strength','strength','number',0,1,.05);
      input(layer.kind==='terrace'?'Step height':'Frequency scale','scale','number',.25,8,.25);
      if(layer.kind!=='terrace')input('Octaves','octaves','number',1,8,1);
      const actions=document.createElement('div');actions.className='layer-actions';
      for(const [label,delta] of [['Move up',-1],['Move down',1],['Remove',0]]) {
        const button=document.createElement('button');button.textContent=label;button.id=`layer-${index}-${label.replace(' ','-')}`;
        button.setAttribute('aria-label',`${label}, layer ${index+1}`);
        button.disabled=delta ? index+delta<0 || index+delta>=terrain.layers.length : terrain.layers.length===1;
        button.addEventListener('click',()=>edit(scene=>{const list=scene.terrain.layers;if(!delta)list.splice(index,1);else [list[index],list[index+delta]]=[list[index+delta],list[index]];}));actions.append(button);
      }
      group.append(actions);return group;
    }));
    if(focus?.startsWith('layer-')) document.getElementById(focus)?.focus({preventScroll:true});
  }
  return {sync};
}
