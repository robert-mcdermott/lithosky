// SPDX-License-Identifier: Apache-2.0
const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec3 color;
uniform vec4 eye, rightVector, upVector, forwardVector;
out vec3 vNormal, vColor;
out float vDistance;
void main() {
  vec3 delta = position - eye.xyz;
  float depth = dot(delta, forwardVector.xyz);
  gl_Position = vec4(dot(delta, rightVector.xyz)/(0.48*eye.w), dot(delta, upVector.xyz)/0.48, 150.1/149.9*depth - 30.0/149.9, depth);
  vNormal = normal; vColor = color; vDistance = length(delta);
}`;
const fragment = `#version 300 es
precision highp float;
in vec3 vNormal, vColor;
in float vDistance;
uniform vec4 light, fog;
out vec4 outputColor;
void main() {
  float diffuse = max(0.0, dot(normalize(vNormal), light.xyz));
  vec3 lit = vColor * (0.32 + diffuse * 0.85);
  float haze = 1.0 - exp(-vDistance*vDistance*0.00042);
  outputColor = vec4(mix(lit, fog.xyz, haze), 1.0);
}`;

export function createWebGL(canvas, onLost) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
  if (!gl) throw new Error('WebGL 2 is unavailable');
  const shaders = [], program = gl.createProgram();
  let disposed = false;
  const lost = event => { event.preventDefault(); if (!disposed) onLost('WebGL context lost. Retry graphics to restore the preview.'); };
  canvas.addEventListener('webglcontextlost', lost);
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type); shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    shaders.forEach(shader => gl.deleteShader(shader)); shaders.length = 0;
    const buffer = gl.createBuffer(), vao = gl.createVertexArray();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12); }
    const uniforms = ['eye', 'rightVector', 'upVector', 'forwardVector', 'light', 'fog'].map(name => gl.getUniformLocation(program, name));
    let count = 0;
    return {
      canvas,
      details: `WebGL 2 · preview only · max texture ${gl.getParameter(gl.MAX_TEXTURE_SIZE)} px`,
      setMesh(mesh) { gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW); count = mesh.length / 9; },
      draw(values) {
        if (disposed || gl.isContextLost()) return;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(values[20], values[21], values[22], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST); gl.useProgram(program); gl.bindVertexArray(vao);
        uniforms.forEach((location, i) => gl.uniform4fv(location, values.subarray(i * 4, i * 4 + 4)));
        gl.drawArrays(gl.TRIANGLES, 0, count);
      },
      dispose() { disposed = true; canvas.removeEventListener('webglcontextlost', lost); gl.deleteBuffer(buffer); gl.deleteVertexArray(vao); gl.deleteProgram(program); gl.getExtension('WEBGL_lose_context')?.loseContext(); },
    };
  } catch (error) { disposed = true; canvas.removeEventListener('webglcontextlost', lost); shaders.forEach(s => gl.deleteShader(s)); gl.deleteProgram(program); gl.getExtension('WEBGL_lose_context')?.loseContext(); throw error; }
}
