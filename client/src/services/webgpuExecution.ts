/**
 * WebGPU execution service.
 * -------------------------
 * Renders to a canvas using WebGPU. We treat the user's code as WGSL source
 * that must define `vsMain` and `fsMain` entry points. If compilation fails,
 * we fall back to a simple built‑in shader.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- WebGPU API types not in DOM lib */

export async function runWebGpuProgram(canvas: HTMLCanvasElement, userShaderSource: string): Promise<void> {
  const nav: any = navigator as any;
  if (!nav.gpu) {
    console.error("[WebGPU] navigator.gpu is not available in this browser.");
    return;
  }

  const adapter = await nav.gpu.requestAdapter();
  if (!adapter) {
    console.error("[WebGPU] Failed to acquire GPU adapter.");
    return;
  }

  const device: any = await adapter.requestDevice();
  const context: any = canvas.getContext("webgpu");
  if (!context) {
    console.error("[WebGPU] Failed to get 'webgpu' canvas context.");
    return;
  }

  const format = nav.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: "opaque",
  });

  const fallbackShaderCode = `
@vertex
fn vsMain(@builtin(vertex_index) VertexIndex : u32)
    -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  return vec4<f32>(pos[VertexIndex], 0.0, 1.0);
}

@fragment
fn fsMain() -> @location(0) vec4<f32> {
  return vec4<f32>(0.04, 0.12, 0.26, 1.0);
}
`;

  async function createShaderModule(code: string): Promise<any | null> {
    const module = device.createShaderModule({ code });
    if (typeof module.getCompilationInfo === "function") {
      const info = await module.getCompilationInfo();
      const hasError = info.messages?.some((m: any) => m.type === "error");
      if (hasError) {
        console.error("[WebGPU] Shader compilation failed:", info.messages);
        return null;
      }
    }
    return module;
  }

  const trimmed = userShaderSource.trim();
  const shaderModule =
    (trimmed && (await createShaderModule(trimmed))) ||
    (await createShaderModule(fallbackShaderCode));

  if (!shaderModule) {
    console.error("[WebGPU] Unable to compile either user or fallback shader.");
    return;
  }

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: "vsMain",
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fsMain",
      targets: [{ format }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const commandEncoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();
  const renderPass = commandEncoder.beginRenderPass({
    colorAttachments: [
      {
        view: textureView,
        clearValue: { r: 0.02, g: 0.02, b: 0.05, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });

  renderPass.setPipeline(pipeline);
  renderPass.draw(3, 1, 0, 0);
  renderPass.end();

  const commandBuffer = commandEncoder.finish();
  device.queue.submit([commandBuffer]);
}

/**
 * Runs the user's WGSL shader and reads the center pixel (for numeric validation).
 * Returns [r, g, b] in 0–1 range, or null if unavailable.
 */
export async function runWebGpuAndSampleCenterPixel(
  canvas: HTMLCanvasElement,
  userShaderSource: string
): Promise<[number, number, number] | null> {
  const nav: any = navigator as any;
  if (!nav.gpu) return null;

  const adapter = await nav.gpu.requestAdapter();
  if (!adapter) return null;

  const device: any = await adapter.requestDevice();
  const context: any = canvas.getContext("webgpu");
  if (!context) return null;

  const format = nav.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

  const fallbackShaderCode = `
@vertex fn vsMain(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 3>(vec2<f32>(-1.,-1.), vec2<f32>(3.,-1.), vec2<f32>(-1.,3.));
  return vec4<f32>(pos[i], 0.0, 1.0);
}
@fragment fn fsMain() -> @location(0) vec4<f32> {
  return vec4<f32>(0.04, 0.12, 0.26, 1.0);
}
`;

  async function createShaderModule(code: string): Promise<any | null> {
    const module = device.createShaderModule({ code });
    if (typeof module.getCompilationInfo === "function") {
      const info = await module.getCompilationInfo();
      if (info.messages?.some((m: any) => m.type === "error")) return null;
    }
    return module;
  }

  const trimmed = userShaderSource.trim();
  const shaderModule =
    (trimmed && (await createShaderModule(trimmed))) || (await createShaderModule(fallbackShaderCode));
  if (!shaderModule) return null;

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shaderModule, entryPoint: "vsMain" },
    fragment: { module: shaderModule, entryPoint: "fsMain", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });

  const commandEncoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();
  const renderPass = commandEncoder.beginRenderPass({
    colorAttachments: [{
      view: textureView,
      clearValue: { r: 0.02, g: 0.02, b: 0.05, a: 1 },
      loadOp: "clear",
      storeOp: "store",
    }],
  });
  renderPass.setPipeline(pipeline);
  renderPass.draw(3, 1, 0, 0);
  renderPass.end();

  const w = canvas.width;
  const h = canvas.height;
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);

  const bytesPerRow = 256;
  const readbackBuffer = device.createBuffer({
    size: bytesPerRow,
    usage: 0x0080, // GPUBufferUsage.MAP_READ | COPY_DST
  });

  commandEncoder.copyTextureToBuffer(
    { texture: context.getCurrentTexture(), origin: [cx, cy, 0] },
    { buffer: readbackBuffer, bytesPerRow, rowsPerImage: 1 },
    { width: 1, height: 1, depthOrArrayLayers: 1 }
  );
  device.queue.submit([commandEncoder.finish()]);

  await readbackBuffer.mapAsync(1); // GPUMapMode.READ
  const mapped = new Uint8Array(readbackBuffer.getMappedRange());
  readbackBuffer.unmap();
  // Canvas format is often bgra8unorm: bytes are B,G,R,A. Return [R,G,B] 0–1.
  const r = mapped[2] / 255;
  const g = mapped[1] / 255;
  const b = mapped[0] / 255;
  return [r, g, b];
}

