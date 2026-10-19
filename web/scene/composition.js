// SPDX-License-Identifier: Apache-2.0
import {authorScene,descendants} from './spatial-editor.js';
import {sceneView,kindOf,assertUnlocked,validateEntities} from './entities.js';
import {materialDefaults} from './materials.js';
import {geologyDefaults} from '../material/geology.js';
import {validatePaint} from '../material/masks.js';
export function compositionScene(scene){const graph=authorScene(scene);graph.version=13;graph.bookmarks??=[];return graph;}
export function validateComposition(scene){const seen=new Set(scene.entities.map(n=>n.id));for(const b of scene.bookmarks){if(!/^[a-z][a-z0-9-]{0,47}$/.test(b.id)||seen.has(b.id)||!b.name.replaceAll('\u0085','').trim())throw Error('Camera bookmarks need unique IDs and nonblank names.');seen.add(b.id);}validatePaint(sceneView(scene).surface);}
export const finishDefaults=preset=>({preset,scale:1,detail:.35});
export function compositionCommand(scene,command,value={}){
 const before=structuredClone(scene),graph=compositionScene(scene),camera=graph.entities.find(n=>kindOf(n)==='camera'),land=graph.entities.find(n=>kindOf(n)==='terrain');let result;
 if(command==='bookmark-add'){if(graph.bookmarks.length>=8)throw Error('At most eight camera bookmarks are supported.');const id='shot-'+crypto.randomUUID().replaceAll('-','');graph.bookmarks.push({id,name:value.name.trim(),camera:structuredClone(value.camera)});result=id;}
 else if(command.startsWith('bookmark-')){const shot=graph.bookmarks.find(b=>b.id===value.id);if(!shot)throw Error('Choose a camera bookmark first.');if(command==='bookmark-use')camera.components.camera=structuredClone(shot.camera);else if(command==='bookmark-update'){shot.camera=structuredClone(value.camera);shot.name=value.name.trim();}else if(command==='bookmark-delete')graph.bookmarks=graph.bookmarks.filter(b=>b!==shot);else throw Error('Unknown camera command.');}
 else if(command==='use-view')camera.components.camera=structuredClone(value.camera);
 else if(command==='material'){
  const chosen=new Set(value.ids.flatMap(id=>descendants(graph,id).filter(n=>kindOf(n)==='primitive').map(n=>n.id)));if(!chosen.size)throw Error('Select primitives or a primitive group to assign a material.');
  for(const n of graph.entities.filter(n=>chosen.has(n.id))){const p=n.components.primitive;if(value.preset!==undefined){p.finish=finishDefaults(value.preset);p.color=[1,1,1];p.roughness=value.preset==='snow'?.9:value.preset==='solid'?.45:.7;}
   if(value.color)p.color=[...value.color];if(value.roughness!==undefined)p.roughness=value.roughness;
   if(value.scale!==undefined||value.detail!==undefined){p.finish??=finishDefaults('solid');for(const k of ['scale','detail'])if(value[k]!==undefined)p.finish[k]=value[k];}}
 }
 else if(command==='paint'||command==='paint-clear'){const c=land.components;c.surface??=materialDefaults();c.surface.geology??=geologyDefaults();if(command==='paint-clear')delete c.surface.paint;else{c.surface.paint??=[];c.surface.paint.push(structuredClone(value.stroke));}}
 else throw Error('Unknown composition command.');
 assertUnlocked(before,graph);validateEntities(graph);for(const k of Object.keys(scene))delete scene[k];Object.assign(scene,graph);return result??true;
}
