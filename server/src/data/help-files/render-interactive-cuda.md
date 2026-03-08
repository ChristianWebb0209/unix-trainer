# Render: Interactive — CUDA simulation data to Three.js

This panel is for **raw simulation data** (e.g. particle positions), not pixels. Your CUDA code computes positions (or other data); you send that to the browser. Three.js renders them as a point cloud or geometry. **CUDA does the physics; the browser GPU does the rendering.**

## CUDA side: output positions

Instead of writing pixels, your kernel writes positions (e.g. `float x, y, z` per particle). The host copies the buffer and sends it to the client.

```cuda
// Example: N particles, 3 floats per particle (x, y, z)
__global__ void updateParticles(float* positions, int n, float t) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= n) return;

    float* p = positions + i * 3;
    // Simple motion: spiral or whatever you need
    p[0] = cosf(t + i * 0.01f) * 2.0f;
    p[1] = sinf(t + i * 0.01f) * 2.0f;
    p[2] = (float)i / n * 2.0f - 1.0f;
}

// Host: allocate, run in a loop, send to browser
float* d_positions;
cudaMalloc(&d_positions, N * 3 * sizeof(float));

for (float t = 0.0f; ; t += 0.016f) {
    updateParticles<<<grid, block>>>(d_positions, N, t);
    cudaMemcpy(h_positions, d_positions, N * 3 * sizeof(float), cudaMemcpyDeviceToHost);
    // send positions to client (e.g. WebSocket with { positions: [x,y,z, ...] })
}
```

## Browser side (Three.js)

The **Render: Interactive** panel expects messages with a `positions` array (flat list of x, y, z). It builds a `BufferGeometry` and a `PointsMaterial`:

- `geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))`
- Renders with `THREE.Points` so the browser GPU draws many points smoothly.

## Server → browser

- The panel connects to a WebSocket (e.g. `/api/containers/:id/viz`).
- Each message with `{ positions: [...] }` updates the point positions and the scene redraws.

## In the UI

- Add **Render: Interactive** from the **+** menu.
- Run your CUDA simulation that outputs positions; when the server forwards them to this WebSocket, you’ll see the point cloud update in real time.

## Summary

| Step | Where |
|------|--------|
| Kernel writes positions (e.g. float3) | CUDA |
| Copy to host, send to server | Your app |
| Server sends positions to browser | WebSocket |
| Three.js BufferGeometry + Points | Browser |
