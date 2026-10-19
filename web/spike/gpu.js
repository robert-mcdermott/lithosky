// SPDX-License-Identifier: Apache-2.0
// One persistent WebGPU device and a small WGSL include step.

const SHADER_ROOT = new URL('./wgsl/', import.meta.url);
const INCLUDE_LINE = /^#include "([^"]+)"$/;
const sources = new Map();

export async function createDevice() {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not available in this browser.');
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    throw new Error('No WebGPU adapter was found.');
  }
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: adapter.limits.maxBufferSize,
    },
  });
  device.addEventListener('uncapturederror', event => {
    console.error('WebGPU error:', event.error.message);
  });
  return { adapter, device };
}

async function fetchSource(path) {
  if (!sources.has(path)) {
    sources.set(path, fetch(new URL(path, SHADER_ROOT)).then(response => {
      if (!response.ok) {
        throw new Error(`Could not load shader ${path} (${response.status}).`);
      }
      return response.text();
    }));
  }
  return sources.get(path);
}

// Expands `#include "path"` lines depth-first, including each file once.
async function expand(path, included) {
  if (included.has(path)) {
    return '';
  }
  included.add(path);
  const lines = (await fetchSource(path)).split('\n');
  const output = [];
  for (const line of lines) {
    const match = INCLUDE_LINE.exec(line.trim());
    if (match) {
      output.push(await expand(match[1], included));
    } else {
      output.push(line);
    }
  }
  return output.join('\n');
}

export async function shaderModule(device, path) {
  const code = await expand(path, new Set());
  const module = device.createShaderModule({ label: path, code });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter(message => message.type === 'error');
  if (errors.length > 0) {
    const lines = code.split('\n');
    const report = errors.map(error => {
      const source = lines[error.lineNum - 1]?.trim() ?? '';
      return `${path}:${error.lineNum}:${error.linePos} ${error.message}\n    ${source}`;
    });
    throw new Error(`WGSL compile failed\n${report.join('\n')}`);
  }
  return module;
}

export async function computePipeline(device, path, entryPoint) {
  const module = await shaderModule(device, path);
  return device.createComputePipelineAsync({
    label: `${path}#${entryPoint}`,
    layout: 'auto',
    compute: { module, entryPoint },
  });
}

export function uniformBuffer(device, label, size) {
  return device.createBuffer({ label, size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
}

export function storageBuffer(device, label, size, extraUsage = 0) {
  const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | extraUsage;
  return device.createBuffer({ label, size, usage });
}

export function storageTexture(device, label, size, format, options = {}) {
  return device.createTexture({
    label,
    size,
    format,
    dimension: options.dimension ?? '2d',
    mipLevelCount: options.mipLevelCount ?? 1,
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
}

// `resources[i]` binds to @binding(i). Null slots are bindings the entry point does not use,
// which an automatic layout leaves out.
export function bindGroup(device, pipeline, resources, label) {
  const entries = [];
  resources.forEach((resource, binding) => {
    if (resource === null) {
      return;
    }
    const isBuffer = resource instanceof GPUBuffer;
    entries.push({ binding, resource: isBuffer ? { buffer: resource } : resource });
  });
  return device.createBindGroup({ label, layout: pipeline.getBindGroupLayout(0), entries });
}

export function dispatch2d(pass, pipeline, group, width, height, tile = 8) {
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, group);
  pass.dispatchWorkgroups(Math.ceil(width / tile), Math.ceil(height / tile));
}
