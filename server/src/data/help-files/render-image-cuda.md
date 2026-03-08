# Render: Image — CUDA pixel buffer to browser

This panel displays a **single image** from a CUDA kernel that writes an RGBA pixel buffer. The buffer is sent to the browser; Three.js turns it into a texture and draws it on a full-screen quad.

## CUDA side: fill a pixel buffer

Your kernel (or host code) fills an array of bytes in RGBA order, then that buffer is sent to the API. Example shape:

```cuda
// Host or kernel: output RGBA image
unsigned char pixels[width * height * 4];

// Example: simple gradient in a kernel
__global__ void fillImage(unsigned char* pixels, int width, int height) {
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;
    if (x >= width || y >= height) return;

    int idx = (y * width + x) * 4;
    float fx = (float)x / width;
    float fy = (float)y / height;

    pixels[idx + 0] = (unsigned char)(fx * 255);  // R
    pixels[idx + 1] = (unsigned char)(fy * 255);  // G
    pixels[idx + 2] = 180;                        // B
    pixels[idx + 3] = 255;                        // A
}
```

## Sending the buffer to the browser

- The **server** must receive the pixel buffer (e.g. via an API or WebSocket) and forward it to the client.
- The **Render: Image** panel accepts `pixels` (RGBA `Uint8Array`), `width`, and `height` and updates the Three.js texture.

## In the UI

- Open **Render: Image** from the **+** menu in the terminal area.
- Use the **Refresh** button (top right of the panel) after your code has written a new frame to re-fetch and display the latest image (when wired to your backend).

## Summary

| Step | Where |
|------|--------|
| Allocate `pixels[width*height*4]` | CUDA host |
| Run kernel to fill RGBA | Device |
| Send buffer + width, height to API | Your app / server |
| Panel shows texture on a quad | Browser (Three.js) |
