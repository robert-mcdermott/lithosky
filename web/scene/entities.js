// SPDX-License-Identifier: Apache-2.0
// V11 owns component data once. Legacy control views are temporary adapters.
export const MAX_ENTITIES=64,MAX_DEPTH=8;
const VIEW=Symbol('entity-control-view');
export const kindOf=node=>Object.hasOwn(node.components,'terrain')?'terrain':Object.hasOwn(node.components,'areaLight')?'light':Object.keys(node.components)[0];
export const legacyVersion=s=>s.camera.lens?10:s.water.optics?9:s.lighting.transport?8:s.surface?.geology?7:s.atmosphere?6:s.terrain.generator==='heightmap-v1'?5:s.surface?4:s.terrain.generator==='layers-v1'?(s.terrain.sculpt?3:2):1;
const same=(a,b)=>JSON.stringify(a,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)===JSON.stringify(b,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const node=(id,name,components,parent='')=>({id,name,parent,visible:true,locked:false,components});
export function entityScene(scene) {
 if(scene.version===11)return structuredClone(scene);
 const {format,title,terrain,camera,water,lighting,surface,atmosphere}=structuredClone(scene),environment={lighting},land={terrain};
 if(surface)land.surface=surface;if(atmosphere)environment.atmosphere=atmosphere;
 const lights=lighting.transport?.lights??[];if(lighting.transport)delete lighting.transport.lights;
 return {format,version:11,title,entities:[node('terrain-main','Terrain',land),node('water-main','Water',{water}),node('environment-main','Sun & sky',{environment}),node('camera-main','Camera',{camera}),...lights.map(({name,...areaLight},i)=>node('light-'+(i+1),name,{areaLight}))]};
}
export function sceneView(scene) {
 if(scene.version!==11)return scene;
 const land=scene.entities.find(n=>kindOf(n)==='terrain').components,water=scene.entities.find(n=>kindOf(n)==='water').components.water,camera=scene.entities.find(n=>kindOf(n)==='camera').components.camera,env=scene.entities.find(n=>kindOf(n)==='environment').components.environment;
 const view={format:scene.format,version:1,title:scene.title,terrain:land.terrain,camera,water,lighting:{...env.lighting}};
 if(land.surface)view.surface=land.surface;if(env.atmosphere)view.atmosphere=env.atmosphere;
 const bindings=new Map();if(env.lighting.transport)view.lighting.transport={...env.lighting.transport,lights:scene.entities.filter(n=>kindOf(n)==='light').map(n=>{const l={name:n.name,...n.components.areaLight};bindings.set(l,n.id);return l;})};
 view.version=legacyVersion(view);Object.defineProperty(view,VIEW,{value:bindings});return view;
}
export function entityState(scene,id) {
 const nodes=scene.entities??entityScene(scene).entities,map=new Map(nodes.map(n=>[n.id,n]));let n=map.get(id),visible=true,locked=false;
 for(let depth=0;n&&depth<=MAX_DEPTH;depth++){visible&&=n.visible;locked||=n.locked;n=map.get(n.parent);}
 return {visible,locked};
}
export function validateEntities(scene) {
 const nodes=scene.entities,map=new Map();if(nodes.length>MAX_ENTITIES)throw Error('Too many scene entities.');
 for(const n of nodes){if(!/^[a-z][a-z0-9-]{0,47}$/.test(n.id)||map.has(n.id))throw Error('Invalid or duplicate entity ID.');if(!n.name.replaceAll('\u0085','').trim())throw Error('Entity names cannot be blank.');map.set(n.id,n);}
 for(const kind of ['terrain','water','camera','environment'])if(nodes.filter(n=>kindOf(n)===kind).length!==1)throw Error('A scene requires exactly one '+kind+' entity.');
 if(nodes.filter(n=>kindOf(n)==='light').length>4)throw Error('At most four area lights are supported.');
 const env=nodes.find(n=>kindOf(n)==='environment').components.environment;if(nodes.some(n=>kindOf(n)==='light')&&!env.lighting.transport)throw Error('Area lights require studio lighting.');
 for(const n of nodes){const seen=new Set([n.id]);let parent=n.parent,depth=0;while(parent){const p=map.get(parent);if(!p||kindOf(p)!=='group'||seen.has(parent))throw Error('Invalid or cyclic entity parent.');if(++depth>MAX_DEPTH)throw Error('Group nesting exceeds eight levels.');seen.add(parent);parent=p.parent;}if(kindOf(n)==='camera'&&(!n.visible||n.parent))throw Error('The active camera must remain visible and outside groups.');}
}
export function assertUnlocked(before,after) {
 if(before.version!==11)return;
 const previous=new Map(before.entities.map(n=>[n.id,n])),next=new Map(after.entities.map(n=>[n.id,n]));
 const parents=(map,n)=>{const path=[];for(let depth=0;n?.parent&&depth<=MAX_DEPTH;depth++){path.push(n.parent);n=map.get(n.parent);}return path;};
 for(const n of before.entities){if(!entityState(before,n.id).locked)continue;const other=next.get(n.id);if(!other)throw Error(n.name+' is locked. Unlock it before editing.');
  const ownUnlock=n.locked&&!entityState(before,n.parent).locked&&same({...n,locked:false},other);
  if((!ownUnlock&&!same(n,other))||!same(parents(previous,n),parents(next,other)))throw Error(n.name+' is locked. Unlock it before editing.');
 }
}
const newID=()=> 'entity-'+crypto.randomUUID().replaceAll('-','');
export function editScene(scene,change) {
 if(scene.version!==11){change(scene);return;}
 const before=structuredClone(scene),view=sceneView(scene);change(view);
 scene.title=view.title;
 const land=scene.entities.find(n=>kindOf(n)==='terrain');land.components={terrain:view.terrain};if(view.surface)land.components.surface=view.surface;
 scene.entities.find(n=>kindOf(n)==='water').components.water=view.water;scene.entities.find(n=>kindOf(n)==='camera').components.camera=view.camera;
 const environment={lighting:{...view.lighting}};if(view.atmosphere)environment.atmosphere=view.atmosphere;
 const lights=view.lighting.transport?.lights??[],existing=new Map(scene.entities.filter(n=>kindOf(n)==='light').map(n=>[n.id,n]));
 if(view.lighting.transport){const {lights:_,...transport}=view.lighting.transport;environment.lighting.transport=transport;}
 scene.entities.find(n=>kindOf(n)==='environment').components.environment=environment;
 const ordered=[];for(const light of lights){const id=view[VIEW].get(light)??newID(),{name,...areaLight}=light;let n=existing.get(id);if(n){n.name=name;n.components.areaLight=areaLight;}else n=node(id,name,{areaLight});ordered.push(n);}
 let index=0;scene.entities=scene.entities.flatMap(n=>kindOf(n)==='light'?(ordered[index]?[ordered[index++]]:[]):[n]).concat(ordered.slice(index));
 assertUnlocked(before,scene);
}
// Commands mutate a transaction candidate; the caller validates before publish.
export function entityCommand(scene,command,id,value,newId=newID()) {
 const graph=entityScene(scene),before=structuredClone(graph),n=graph.entities.find(n=>n.id===id);
 if(command==='add-group'){if(graph.entities.length>=MAX_ENTITIES)throw Error('Entity limit reached.');graph.entities.push(node(newId,'New group',{group:{}}));}
 else {
  if(!n)throw Error('Choose an object first.');const kind=kindOf(n);
  if(command==='rename'){n.name=value.trim();if(!n.name)throw Error('Enter an object name.');}
  else if(command==='visible'){if(kind==='camera')throw Error('The active camera is always used.');n.visible=value;}
  else if(command==='locked')n.locked=value;
  else if(command==='parent'){if(kind==='camera')throw Error('The active camera cannot be grouped.');if(entityState(before,value).locked)throw Error('Unlock the destination group first.');n.parent=value;}
  else if(command==='delete'){if(!['group','light'].includes(kind))throw Error('Hide core scene objects instead of deleting them.');for(const child of graph.entities)if(child.parent===id)child.parent=n.parent;graph.entities=graph.entities.filter(e=>e.id!==id);}
  else if(command==='duplicate'){if(kind!=='light')throw Error('Only area lights can be duplicated in this slice.');const copy=structuredClone(n);copy.id=newId;copy.name=(n.name+' copy').slice(0,40);graph.entities.push(copy);if(entityState(before,id).locked)throw Error(n.name+' is locked.');}
  else throw Error('Unknown scene command.');
 }
 assertUnlocked(before,graph);validateEntities(graph);for(const key of Object.keys(scene))delete scene[key];Object.assign(scene,graph);return command==='add-group'||command==='duplicate'?newId:id;
}
