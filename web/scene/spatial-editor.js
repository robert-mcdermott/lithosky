// SPDX-License-Identifier: Apache-2.0
import {entityScene,entityState,kindOf,entityCommand,assertUnlocked,validateEntities} from './entities.js';
import {transformDefaults,worldMatrix,multiply,inverse,decompose,compose,translated,about,axisRotation,unit,boundsFor} from './spatial.js';
import {primitiveDefaults,SHAPES} from './primitives.js';
import {fieldHeight} from './sculpt-view.js';
const id=()=> 'entity-'+crypto.randomUUID().replaceAll('-','');
export function authorScene(scene){const graph=entityScene(scene);graph.version=12;for(const n of graph.entities)if(kindOf(n)==='group')n.components.transform??=transformDefaults();return graph;}
export function descendants(scene,id){const ids=new Set([id]);for(let i=0;i<8;i++)for(const n of scene.entities)if(ids.has(n.parent))ids.add(n.id);return scene.entities.filter(n=>ids.has(n.id));}
export function selectionRoots(scene,ids){const set=new Set(ids),map=new Map(scene.entities.map(n=>[n.id,n]));return [...set].map(id=>map.get(id)).filter(n=>n&&!function(){let p=map.get(n.parent);while(p){if(set.has(p.id))return true;p=map.get(p.parent);}return false;}());}
export function transformable(scene,n){return !!n&&descendants(scene,n.id).every(e=>['primitive','group'].includes(kindOf(e)));}
function requireTransform(scene,n){if(!transformable(scene,n))throw Error('Transform handles support primitives and groups containing only primitives. Other scene components use their existing controls.');const locked=descendants(scene,n.id).find(e=>entityState(scene,e.id).locked);if(locked)throw Error(locked.name+' is locked. Unlock it before transforming.');}
function setWorld(scene,n,m){n.components.transform=decompose(multiply(inverse(worldMatrix(scene,n.parent)),m));}
export function selectionPivot(scene,ids){const roots=selectionRoots(scene,ids);if(roots.length===1&&roots[0].components.transform)return worldMatrix(scene,roots[0].id).slice(12,15);const points=[];for(const n of roots){if(kindOf(n)==='primitive'){const b=boundsFor(worldMatrix(scene,n.id),n.components.primitive.shape);points.push(b.min,b.max);}else points.push(worldMatrix(scene,n.id).slice(12,15));}return [0,1,2].map(i=>points.length?(Math.min(...points.map(p=>p[i]))+Math.max(...points.map(p=>p[i])))/2:0);}
export function selectionAxis(scene,ids,axis,space){const n=selectionRoots(scene,ids).at(-1);if(space==='local'&&n){const m=worldMatrix(scene,n.id);return unit(m.slice(axis*4,axis*4+3));}return [0,1,2].map(i=>i===axis?1:0);}
function selectedBounds(scene,n){const bounds=descendants(scene,n.id).filter(e=>kindOf(e)==='primitive').map(e=>boundsFor(worldMatrix(scene,e.id),e.components.primitive.shape));if(!bounds.length)throw Error('Add a primitive to this group first.');return {min:[0,1,2].map(i=>Math.min(...bounds.map(b=>b.min[i]))),max:[0,1,2].map(i=>Math.max(...bounds.map(b=>b.max[i])))};}
export function copySelection(scene,ids){
 const graph=entityScene(scene),roots=selectionRoots(graph,ids);if(!roots.length)throw Error('Select objects to copy.');const keep=new Set(roots.flatMap(n=>descendants(graph,n.id).map(n=>n.id)));
 if(graph.entities.some(n=>keep.has(n.id)&&!['primitive','group','light'].includes(kindOf(n))))throw Error('Copy supports primitives, area lights and groups without core scene components.');
 const nodes=structuredClone(graph.entities.filter(n=>keep.has(n.id)));for(const n of nodes)if(roots.some(r=>r.id===n.id)){if(n.components.transform)n.components.transform=decompose(worldMatrix(graph,n.id));n.parent='';}
 return {nodes,roots:roots.map(n=>n.id)};
}
function paste(graph,payload){
 if(!payload?.nodes?.length||payload.nodes.length>64||!Array.isArray(payload.roots))throw Error('The object clipboard is empty.');const remap=new Map(payload.nodes.map(n=>[n.id,id()])),nodes=structuredClone(payload.nodes);
 for(const n of nodes){const old=n.id;n.id=remap.get(old);n.parent=remap.get(n.parent)??'';n.name=[...n.name].slice(0,35).join('')+' copy';if(kindOf(n)==='group')n.components.transform??=transformDefaults();}
 graph.entities.push(...nodes);const roots=payload.roots.map(old=>remap.get(old));
 // Offset copied geometry, without introducing unsupported transforms on lights.
 for(const root of roots){const n=graph.entities.find(n=>n.id===root);if(transformable(graph,n)){setWorld(graph,n,multiply(translated([1,0,1]),worldMatrix(graph,n.id)));}else for(const e of descendants(graph,root)){if(kindOf(e)==='light'){e.components.areaLight.x+=1;e.components.areaLight.z+=1;}else if(kindOf(e)==='primitive')setWorld(graph,e,multiply(translated([1,0,1]),worldMatrix(graph,e.id)));}}
 return roots;
}
// Every mutation is validated and published by History as one atomic transaction.
export function spatialCommand(scene,command,ids=[],value={}){
 const before=entityScene(scene),graph=authorScene(scene),roots=selectionRoots(graph,ids);let selection=[...ids];
 if(command==='add'){
  if(!SHAPES.includes(value.shape))throw Error('Choose a primitive.');const t=transformDefaults();t.scale=value.shape==='cone'?[2,3,2]:[2,2,2];t.position=[...value.position];t.position[1]+=t.scale[1]/2;
  const n={id:id(),name:value.shape[0].toUpperCase()+value.shape.slice(1),parent:'',visible:true,locked:false,components:{primitive:primitiveDefaults(value.shape),transform:t}};graph.entities.push(n);selection=[n.id];
 }else if(command==='paste')selection=paste(graph,value);
 else if(command==='duplicate-selection'){for(const n of roots)if(entityState(graph,n.id).locked)throw Error(n.name+' is locked.');selection=paste(graph,copySelection(graph,ids));}
 else if(command==='group-selection'){
  if(!roots.length)throw Error('Select primitives to group.');for(const n of roots)requireTransform(graph,n);const t=transformDefaults();t.position=selectionPivot(graph,ids);const group={id:id(),name:'Object group',parent:'',visible:true,locked:false,components:{group:{},transform:t}},matrices=roots.map(n=>worldMatrix(graph,n.id));graph.entities.push(group);roots.forEach((n,i)=>{n.parent=group.id;setWorld(graph,n,matrices[i]);});selection=[group.id];
 }else if(command==='delete-selection'){
  const nodes=graph.entities.filter(n=>ids.includes(n.id));if(!nodes.length)throw Error('Select objects first.');for(const n of nodes)if(!['primitive','group','light'].includes(kindOf(n)))throw Error('Core scene components can be hidden, not deleted.');for(const n of nodes.slice().reverse())entityCommand(graph,'delete',n.id);selection=[];
 }else if(command==='batch'){
  for(const selected of ids)entityCommand(graph,value.command,selected,value.value);
 }else{
  if(!roots.length)throw Error('Select an object first.');for(const n of roots)requireTransform(graph,n);
  if(command==='set-transform'){if(roots.length!==1)throw Error('Numeric pose edits require one object.');roots[0].components.transform=structuredClone(value);}
  else if(command==='transform'){
   const pivot=value.pivot??selectionPivot(graph,ids),axis=selectionAxis(graph,ids,value.axis??0,value.space??'world');let delta;
   if(value.mode==='move')delta=translated(axis.map(x=>x*value.amount));
   else if(value.mode==='rotate')delta=about(pivot,axisRotation(axis,value.amount));
   else if(value.mode==='scale'){
    if(!(value.amount>0))throw Error('Scale must be positive.');
    if(roots.length===1&&kindOf(roots[0])==='primitive'&&!value.uniform){const t=roots[0].components.transform;t.scale[value.axis]*=value.amount;}
    else delta=about(pivot,compose({...transformDefaults(),scale:[value.amount,value.amount,value.amount]}));
   }else throw Error('Choose Move, Rotate or Scale.');
   if(delta){const matrices=roots.map(n=>multiply(delta,worldMatrix(graph,n.id)));roots.forEach((n,i)=>setWorld(graph,n,matrices[i]));}
  }else if(command==='align'){
   if(roots.length<2)throw Error('Select at least two objects to align.');const axis=value.axis,reference=selectionPivot(graph,[ids.at(-1)])[axis],matrices=roots.map(n=>{const shift=[0,0,0];shift[axis]=reference-selectionPivot(graph,[n.id])[axis];return multiply(translated(shift),worldMatrix(graph,n.id));});roots.forEach((n,i)=>setWorld(graph,n,matrices[i]));
  }else if(command==='drop'){
   if(!value.field||value.terrainVisible===false)throw Error('Show and generate terrain before placing objects on it.');const matrices=roots.map(n=>{const b=selectedBounds(graph,n);if([b.min[0],b.min[2],b.max[0],b.max[2]].some(x=>Math.abs(x)>32))throw Error('Move the object over the finite terrain first.');let height=-Infinity;for(let x=0;x<=4;x++)for(let z=0;z<=4;z++)height=Math.max(height,fieldHeight(value.field,b.min[0]+(b.max[0]-b.min[0])*x/4,b.min[2]+(b.max[2]-b.min[2])*z/4));return multiply(translated([0,height-b.min[1],0]),worldMatrix(graph,n.id));});roots.forEach((n,i)=>setWorld(graph,n,matrices[i]));
  }else throw Error('Unknown object command.');
 }
 assertUnlocked(before,graph);validateEntities(graph);for(const key of Object.keys(scene))delete scene[key];Object.assign(scene,graph);return selection;
}
