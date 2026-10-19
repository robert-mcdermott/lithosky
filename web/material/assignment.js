// SPDX-License-Identifier: Apache-2.0
import {entityScene,entityState,kindOf} from '../scene/entities.js';
import {descendants} from '../scene/spatial-editor.js';
import {hexColor,linearColor} from './objects.js';
export function materialAssignment({getScene,objects,command}){
 const $=id=>document.getElementById(id);
 function chosen(){const graph=entityScene(getScene()),ids=new Set(objects.selection.flatMap(id=>descendants(graph,id).filter(n=>kindOf(n)==='primitive').map(n=>n.id)));return {graph,nodes:graph.entities.filter(n=>ids.has(n.id))};}
 function apply(value){command('material',{ids:objects.selection,...value});sync();}
 $('object-material-preset').addEventListener('change',()=>apply({preset:$('object-material-preset').value}));
 $('object-material-color').addEventListener('change',()=>apply({color:linearColor($('object-material-color').value)}));
 for(const key of ['roughness','scale','detail'])$('object-material-'+key).addEventListener('change',()=>{const el=$('object-material-'+key);if(el.value!==''&&el.checkValidity())apply({[key]:Number(el.value)});else sync();});
 function sync(){const {graph,nodes}=chosen(),first=nodes[0]?.components.primitive;$('object-material-editor').hidden=!first;if(!first)return;const locked=nodes.some(n=>entityState(graph,n.id).locked);for(const input of $('object-material-editor').querySelectorAll('input,select'))input.disabled=locked;
  $('object-material-preset').value=first.finish?.preset??'solid';$('object-material-color').value=hexColor(first.color);$('object-material-roughness').value=first.roughness;$('object-material-scale').value=first.finish?.scale??1;$('object-material-detail').value=first.finish?.detail??.35;
  $('object-material-note').textContent=locked?'Unlock every selected primitive before assigning materials.':nodes.length>1?'Editing assigns the chosen value to all '+nodes.length+' primitives. Other properties remain unchanged.':'Color is an sRGB tint; rendering uses linear reflectance. Procedural finishes use world-space features. Render to inspect bump detail.';
 }
 return {sync};
}
