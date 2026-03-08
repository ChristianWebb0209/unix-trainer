# Render Panels Overview

In the **Kernel Lab** workspace you can add three kinds of visualization panels from the **+** menu in the terminal area. Each panel displays output from your CUDA (or C++) code in a different way.

## The three panels

1. **Render: Image** — Display a single image from a pixel buffer. Your kernel fills an RGBA array; the buffer is sent to the browser and shown as a texture on a full-screen quad. Use this for screenshots, single-frame renders, or any “one image” output.

2. **Render: Video** — Real-time frame stream. CUDA produces frames continuously (e.g. a simulation or animation). Each frame is sent over a WebSocket; the browser updates a texture every frame. Use this for live visualization.

3. **Render: Interactive** — Raw simulation data (e.g. particle positions). Instead of sending pixels, you send position data. The browser uses Three.js to render points or geometry. CUDA does the physics; the GPU in the browser does the rendering.

## Workflow

- Add a panel from the **+** menu: **Render: Image**, **Render: Video**, or **Render: Interactive**.
- Run your code (e.g. a CUDA kernel that writes to a buffer or stream).
- The server bridges your container output to the browser; the corresponding panel displays the result.

See the other help docs for CUDA code examples for each panel type.
