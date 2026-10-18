// SPDX-License-Identifier: Apache-2.0
import { terrainPoint, cross, normalize } from '../scene/terrain.js';
export const GRID = 128, EXTENT = 32, CELL = 64 / GRID, MAX_STEPS = GRID * 2 + 2;
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const sub = (a, b) => a.map((v, i) => v - b[i]);

// Three aligned vec4s per vertex: position, smooth normal, linear reflectance.
// Preview and final share heights, triangle diagonals, normals and palette rules.
export function createHeightfield(state) {
  const vertices = new Float32Array((GRID + 1) ** 2 * 12);
  let low = Infinity, high = -Infinity;
  for (let z = 0; z <= GRID; z++) for (let x = 0; x <= GRID; x++) {
    const p = terrainPoint(x * CELL - EXTENT, z * CELL - EXTENT, { ...state, waterEnabled: false });
    const i = (z * (GRID + 1) + x) * 12;
    vertices.set(p.slice(0, 3), i); vertices.set(p.slice(3, 6), i + 4); vertices.set(p.slice(6, 9), i + 8);
    low = Math.min(low, vertices[i + 1]); high = Math.max(high, vertices[i + 1]);
  }
  const field={ vertices, low, high };field.hierarchy=buildHierarchy(field);return field;
}
export function cellTriangles(field, x, z) {
  const vertex = (x, z) => Array.from(field.vertices.slice((z * (GRID + 1) + x) * 12, (z * (GRID + 1) + x) * 12 + 3));
  const a = vertex(x,z), b = vertex(x,z+1), c = vertex(x+1,z), d = vertex(x+1,z+1);
  return [[a,b,c],[c,b,d]];
}
export function intersectTriangle(origin, direction, a, b, c, limit = 1e6) {
  const e1 = sub(b,a), e2 = sub(c,a), p = cross(direction,e2), det = dot(e1,p);
  if (Math.abs(det) < 1e-8) return null;
  const v = sub(origin,a), u = dot(v,p) / det;
  const q = cross(v,e1), w = dot(direction,q) / det;
  const t = dot(e2,q) / det;
  if (u < -1e-5 || w < -1e-5 || u+w > 1.00001 || t < .001 || t > limit) return null;
  return { t, normal: normalize(cross(e1,e2)) };
}
export function intersectLinear(field, origin, direction, limit = 1e6, region = null, stats = null) {
  let near = .001, far = limit;
  const lo = region?.lo ?? [-EXTENT,field.low-.001,-EXTENT], hi = region?.hi ?? [EXTENT,field.high+.001,EXTENT];
  const minX=region?.x ?? 0,minZ=region?.z ?? 0,maxX=minX+(region?BLOCK:GRID),maxZ=minZ+(region?BLOCK:GRID);
  for (let axis=0; axis<3; axis++) {
    if (Math.abs(direction[axis]) < 1e-8) { if (origin[axis]<lo[axis] || origin[axis]>hi[axis]) return null; }
    else {
      const a=(lo[axis]-origin[axis])/direction[axis], b=(hi[axis]-origin[axis])/direction[axis];
      near=Math.max(near,Math.min(a,b)); far=Math.min(far,Math.max(a,b));
    }
  }
  if (far<near) return null;
  let x=Math.max(minX,Math.min(maxX-1,Math.floor((origin[0]+direction[0]*near+EXTENT)/CELL)));
  let z=Math.max(minZ,Math.min(maxZ-1,Math.floor((origin[2]+direction[2]*near+EXTENT)/CELL)));
  const sx=direction[0]>=0?1:-1, sz=direction[2]>=0?1:-1;
  const dx=Math.abs(direction[0])<1e-8?1e30:CELL/Math.abs(direction[0]);
  const dz=Math.abs(direction[2])<1e-8?1e30:CELL/Math.abs(direction[2]);
  let tx=dx===1e30?1e30:((x+(sx>0?1:0))*CELL-EXTENT-origin[0])/direction[0];
  let tz=dz===1e30?1e30:((z+(sz>0?1:0))*CELL-EXTENT-origin[2])/direction[2];
  for (let step=0; step<(maxX-minX+maxZ-minZ+2); step++) {
    if(stats)stats.cells=(stats.cells??0)+1;
    const end=Math.min(tx,tz,far), hits=cellTriangles(field,x,z).map(t=>intersectTriangle(origin,direction,...t,end+1e-4)).filter(h=>h && h.t>=near-1e-4).sort((a,b)=>a.t-b.t);
    if (hits.length) return { ...hits[0], steps: step+1 };
    if (end>=far) return null;
    const moveX=tx<=tz, moveZ=tz<=tx;
    if (moveX) { x+=sx; tx+=dx; }
    if (moveZ) { z+=sz; tz+=dz; }
    if (x<minX || x>=maxX || z<minZ || z>=maxZ) return null;
  }
  return null;
}

// Dielectric split used by the shader. Total internal reflection returns one.
export function fresnel(cosine, eta) {
  const c=Math.max(0,Math.min(1,cosine));
  if (eta*eta*(1-c*c)>=1) return 1;
  const r0=((1-eta)/(1+eta))**2;
  return r0+(1-r0)*(1-c)**5;
}
export function displayChannel(linear) {
  if (!Number.isFinite(linear) || linear<0) throw new Error('Invalid radiance');
  const mapped=linear/(1+linear);
  return mapped<=.0031308 ? 12.92*mapped : 1.055*mapped**(1/2.4)-.055;
}

// Two-level uniform hierarchy: each of 16² blocks encloses all vertices of
// 8² cells, including shared edges. Bounds use the actual rounded render mesh.
export const BLOCK=8, BLOCK_GRID=GRID/BLOCK, BLOCK_CELL=CELL*BLOCK;
export function buildHierarchy(field) {
  const bounds=new Float32Array(BLOCK_GRID**2*2);
  for(let bz=0;bz<BLOCK_GRID;bz++)for(let bx=0;bx<BLOCK_GRID;bx++) {
    let low=Infinity,high=-Infinity;
    for(let z=bz*BLOCK;z<=bz*BLOCK+BLOCK;z++)for(let x=bx*BLOCK;x<=bx*BLOCK+BLOCK;x++) {
      const h=field.vertices[(z*(GRID+1)+x)*12+1];low=Math.min(low,h);high=Math.max(high,h);
    }
    bounds.set([low,high],(bz*BLOCK_GRID+bx)*2);
  }
  return bounds;
}
export function intersectHeightfield(field,origin,direction,limit=1e6,stats=null) {
  const bounds=field.hierarchy??buildHierarchy(field);
  let near=.001,far=limit;
  const lo=[-EXTENT,field.low-.001,-EXTENT],hi=[EXTENT,field.high+.001,EXTENT];
  for(let axis=0;axis<3;axis++) {
    if(Math.abs(direction[axis])<1e-8){if(origin[axis]<lo[axis]||origin[axis]>hi[axis])return null;}
    else {const a=(lo[axis]-origin[axis])/direction[axis],b=(hi[axis]-origin[axis])/direction[axis];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}
  }
  if(far<near)return null;
  let x=Math.max(0,Math.min(BLOCK_GRID-1,Math.floor((origin[0]+direction[0]*near+EXTENT)/BLOCK_CELL)));
  let z=Math.max(0,Math.min(BLOCK_GRID-1,Math.floor((origin[2]+direction[2]*near+EXTENT)/BLOCK_CELL)));
  const sx=direction[0]>=0?1:-1,sz=direction[2]>=0?1:-1;
  const dx=Math.abs(direction[0])<1e-8?1e30:BLOCK_CELL/Math.abs(direction[0]),dz=Math.abs(direction[2])<1e-8?1e30:BLOCK_CELL/Math.abs(direction[2]);
  let tx=dx===1e30?1e30:((x+(sx>0?1:0))*BLOCK_CELL-EXTENT-origin[0])/direction[0];
  let tz=dz===1e30?1e30:((z+(sz>0?1:0))*BLOCK_CELL-EXTENT-origin[2])/direction[2];
  for(let step=0;step<BLOCK_GRID*2+2;step++) {
    if(stats)stats.blocks=(stats.blocks??0)+1;
    const i=(z*BLOCK_GRID+x)*2,end=Math.min(tx,tz,far),y0=origin[1]+direction[1]*near,y1=origin[1]+direction[1]*end;
    if(Math.max(y0,y1)>=bounds[i]-.001&&Math.min(y0,y1)<=bounds[i+1]+.001) {
      const region={x:x*BLOCK,z:z*BLOCK,lo:[x*BLOCK_CELL-EXTENT,bounds[i]-.001,z*BLOCK_CELL-EXTENT],hi:[(x+1)*BLOCK_CELL-EXTENT,bounds[i+1]+.001,(z+1)*BLOCK_CELL-EXTENT]};
      const hit=intersectLinear(field,origin,direction,Math.min(limit,end+1e-4),region,stats);if(hit)return hit;
    }
    if(end>=far)return null;
    const moveX=tx<=tz,moveZ=tz<=tx;
    if(moveX){x+=sx;tx+=dx;}if(moveZ){z+=sz;tz+=dz;}
    if(x<0||x>=BLOCK_GRID||z<0||z>=BLOCK_GRID)return null;
    near=end;
  }
  return null;
}
