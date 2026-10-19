// SPDX-License-Identifier: Apache-2.0
// Original closed unit solids: radius/half extent .5, Y is the vertical axis.
import {point,inverse,unit,boundsFor} from './spatial.js';
export const SHAPES=['box','sphere','cylinder','cone'];
export const primitiveDefaults=shape=>({shape,color:shape==='sphere'?[.16,.32,.35]:shape==='cone'?[.48,.28,.12]:[.52,.48,.39],roughness:.65});
const normal=(inv,n)=>unit([0,1,2].map(i=>inv[i*4]*n[0]+inv[i*4+1]*n[1]+inv[i*4+2]*n[2]));
function roots(a,b,c){if(Math.abs(a)<1e-12)return Math.abs(b)<1e-12?[]:[-c/b];const d=b*b-4*a*c;if(d<0)return [];const q=-.5*(b+(b<0?-1:1)*Math.sqrt(d));return q===0?[-b/(2*a)]:[q/a,c/q];}
export function intersectPrimitive(object,origin,direction,limit=1e6){
 const inv=object.inverse??inverse(object.matrix),o=point(inv,origin),d=point(inv,direction,0),shape=object.shape;let best=limit,n=null;
 const accept=(t,v)=>{if(t>.001&&t<best&&Number.isFinite(t)){best=t;n=v;}};
 if(shape==='box'){
  let near=-Infinity,far=Infinity,nn=null,fn=null;
  for(let i=0;i<3;i++){if(Math.abs(d[i])<1e-12){if(Math.abs(o[i])>.5)return null;continue;}let a=(-.5-o[i])/d[i],b=(.5-o[i])/d[i],an=[0,0,0],bn=[0,0,0];an[i]=-1;bn[i]=1;if(a>b){[a,b]=[b,a];[an,bn]=[bn,an];}if(a>near){near=a;nn=an;}if(b<far){far=b;fn=bn;}}
  if(near<=far){accept(near,nn);accept(far,fn);}
 }else if(shape==='sphere'){
  const a=d.reduce((s,x)=>s+x*x,0),shift=-o.reduce((s,x,i)=>s+x*d[i],0)/a,v=o.map((x,i)=>x+d[i]*shift);
  for(const root of roots(a,2*v.reduce((s,x,i)=>s+x*d[i],0),v.reduce((s,x)=>s+x*x,0)-.25))accept(root+shift,v.map((x,i)=>x+d[i]*root));
 }else{
  const shift=-o.reduce((s,x,i)=>s+x*d[i],0)/d.reduce((s,x)=>s+x*x,0),v=o.map((x,i)=>x+d[i]*shift),cone=shape==='cone',k=cone?.25:0,q=.5-v[1],a=d[0]**2+d[2]**2-k*d[1]**2,b=2*(v[0]*d[0]+v[2]*d[2]+k*q*d[1]),c=v[0]**2+v[2]**2-(cone?k*q*q:.25);
  for(const root of roots(a,b,c)){const t=root+shift,p=v.map((x,i)=>x+d[i]*root);if(p[1]>=-.5&&p[1]<=.5)accept(t,cone&&Math.hypot(p[0],p[2])<1e-5&&Math.abs(p[1]-.5)<1e-5?[0,1,0]:[p[0],cone?.25*(.5-p[1]):0,p[2]]);}
  if(cone&&Math.abs(d[1])>1e-12){const t=(.5-o[1])/d[1],x=o[0]+d[0]*t,z=o[2]+d[2]*t;if(x*x+z*z<1e-10)accept(t,[0,1,0]);}
  if(Math.abs(d[1])>1e-12)for(const y of cone?[-.5]:[-.5,.5]){const t=(y-o[1])/d[1],x=o[0]+d[0]*t,z=o[2]+d[2]*t;if(x*x+z*z<=.25+1e-10)accept(t,[0,Math.sign(y),0]);}
 }
 if(n&&shape==='box'){const p=o.map((x,i)=>x+d[i]*best),axis=[0,1,2].find(i=>Math.abs(Math.abs(p[i])-.5)<1e-5);if(axis!==undefined){n=[0,0,0];n[axis]=Math.sign(p[axis]);}}
 return n?{t:best,normal:normal(inv,Math.hypot(...n)<1e-12?[0,1,0]:n),id:object.id}:null;
}
export const primitiveBounds=object=>boundsFor(object.matrix,object.shape);
export function primitiveUniforms(objects=[]){if(objects.length>32)throw Error('Primitive GPU budget exceeded.');const data=new Float32Array(Math.max(1,objects.length)*24);for(const [i,o]of objects.entries())data.set([...(o.inverse??inverse(o.matrix)),...o.color,SHAPES.indexOf(o.shape),o.roughness,0,0,0],i*24);return data;}
const library=new Map();
function localMesh(shape){
 if(library.has(shape))return library.get(shape);const vertices=[],tri=(a,b,c,na,nb=na,nc=na)=>{if(Math.hypot(...cross3(b.map((v,i)=>v-a[i]),c.map((v,i)=>v-a[i])))<1e-9)return;for(const [p,n]of [[a,na],[b,nb],[c,nc]])vertices.push(...p,...n);};
 const radial=(angle,y,r=.5)=>[Math.cos(angle)*r,y,Math.sin(angle)*r],segments=24;
 if(shape==='box')for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const n=[0,0,0];n[axis]=sign;const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>{const p=[0,0,0];p[axis]=sign*.5;p[(axis+1)%3]=u*.5;p[(axis+2)%3]=v*.5;return p;});tri(corners[0],corners[1],corners[2],n);tri(corners[0],corners[2],corners[3],n);}
 else if(shape==='sphere')for(let y=0;y<12;y++)for(let x=0;x<segments;x++){const at=(u,v)=>{const phi=u/segments*Math.PI*2,theta=v/12*Math.PI;return [.5*Math.sin(theta)*Math.cos(phi),.5*Math.cos(theta),.5*Math.sin(theta)*Math.sin(phi)];},a=at(x,y),b=at(x+1,y),c=at(x+1,y+1),d=at(x,y+1);tri(a,b,c,unit(a),unit(b),unit(c));tri(a,c,d,unit(a),unit(c),unit(d));}
 else for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2,p=radial(a,-.5),q=radial(b,-.5),top=[0,.5,0],na=unit([Math.cos(a),shape==='cone'?.5:0,Math.sin(a)]),nb=unit([Math.cos(b),shape==='cone'?.5:0,Math.sin(b)]);tri([0,-.5,0],q,p,[0,-1,0]);if(shape==='cone')tri(p,q,top,na,nb,unit(na.map((v,j)=>v+nb[j])));else{const r=radial(a,.5),s=radial(b,.5);tri(p,q,s,na,nb,nb);tri(p,s,r,na,nb,na);tri(top,r,s,[0,1,0]);}}
 library.set(shape,vertices);return vertices;
}
const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function primitiveMesh(objects=[]){
 const out=new Float32Array(objects.reduce((n,o)=>n+localMesh(o.shape).length/6*9,0));let j=0;
 for(const object of objects){const mesh=localMesh(object.shape),m=object.matrix,n=object.inverse??inverse(m),color=object.color;
  for(let i=0;i<mesh.length;i+=6,j+=9){const x=mesh[i],y=mesh[i+1],z=mesh[i+2],a=mesh[i+3],b=mesh[i+4],c=mesh[i+5],nx=n[0]*a+n[1]*b+n[2]*c,ny=n[4]*a+n[5]*b+n[6]*c,nz=n[8]*a+n[9]*b+n[10]*c,length=Math.hypot(nx,ny,nz)||1;
   out[j]=m[0]*x+m[4]*y+m[8]*z+m[12];out[j+1]=m[1]*x+m[5]*y+m[9]*z+m[13];out[j+2]=m[2]*x+m[6]*y+m[10]*z+m[14];out[j+3]=nx/length;out[j+4]=ny/length;out[j+5]=nz/length;out[j+6]=color[0];out[j+7]=color[1];out[j+8]=color[2];
  }
 }return out;
}
export function combinePreview(terrain,objects){if(!objects?.length)return terrain;const mesh=primitiveMesh(objects),out=new Float32Array(terrain.length+mesh.length);out.set(terrain);out.set(mesh,terrain.length);return out;}

export function primitiveBudget(objects=[]){const vertices=objects.reduce((n,o)=>n+localMesh(o.shape).length/6,0);return {count:objects.length,triangles:vertices/3,previewBytes:vertices*36,analyticBytes:Math.max(1,objects.length)*96};}
