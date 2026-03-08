# Render: Video — Real-time CUDA frame stream

This panel shows a **continuous stream of frames** from your CUDA program. Each frame is an RGBA pixel buffer; the server sends frames (e.g. via WebSocket) and the browser updates the texture every time a new frame arrives.

## CUDA side: produce frames in a loop

Your program runs a loop: for each frame, run the kernel to fill the pixel buffer, then send that buffer to the client.

```cuda
// Allocate once
unsigned char* d_pixels;
cudaMalloc(&d_pixels, width * height * 4);

for (int frame = 0; frame < numFrames; frame++) {
    // Update simulation / kernel
    myKernel<<<grid, block>>>(d_pixels, width, height, frame);

    // Copy back to host
    unsigned char pixels[width * height * 4];
    cudaMemcpy(pixels, d_pixels, width * height * 4, cudaMemcpyDeviceToHost);

    // Send to browser (your server bridges this, e.g. WebSocket "frame" event)
    // sendFrame(pixels, width, height);
}

cudaFree(d_pixels);
```

## Server → browser

- The **Render: Video** panel connects to a WebSocket (e.g. `/api/containers/:id/frames`).
- When the server sends a message with `{ pixels, width, height }`, the panel updates the Three.js texture and redraws.
- So: CUDA writes a frame → server pushes it over the WebSocket → browser sets `texture.image.data = pixels`, `texture.needsUpdate = true`, and the next render shows the new frame.

## In the UI

- Add **Render: Video** from the **+** menu.
- Start your CUDA program that streams frames; once the server is wired to push each frame to this WebSocket, you’ll see real-time visualization.

## Summary

| Step | Where |
|------|--------|
| Loop: run kernel → fill pixel buffer | CUDA host |
| Send each frame to server | Your app |
| Server sends frame to browser over WebSocket | Server |
| Panel updates texture per frame | Browser (Three.js) |
