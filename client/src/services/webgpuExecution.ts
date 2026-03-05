/**
 * WebGPU execution service.
 * -------------------------
 * Renders to a canvas using WebGPU. We treat the user's code as WGSL source
 * that must define `vsMain` and `fsMain` entry points. If compilation fails,
 * we fall back to a simple built‑in shader.
 */

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
  let shaderModule =
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

