# The Render panel

The **Render** tab shows frames produced by your code, live, while it runs. A still image is just a stream that happens to be one frame long, so the same panel handles both.

## Publishing a frame

Include the header and call one function:

```cuda
#include "tt_render.h"

unsigned char *pixels = /* width * height * 4 bytes, RGBA */;
tt_render_frame(pixels, width, height);
```

That is the whole API. Row 0 is the **top** of the image, channels are **R, G, B, A**, and the buffer lives in host memory — so copy your device buffer back with `cudaMemcpy` first.

The header is already on the include path (`/workspace/tt_render.h`), so plain `#include "tt_render.h"` works from any problem or playground file.

## Animating

Call it in a loop. There is no frame-rate API and no synchronisation to think about:

```cuda
for (int f = 0; f < FRAMES; f++) {
    myKernel<<<grid, block>>>(dPixels, ...);
    cudaMemcpy(hPixels, dPixels, bytes, cudaMemcpyDeviceToHost);
    tt_render_frame(hPixels, WIDTH, HEIGHT);
}
```

Render as fast as the card allows. If you outrun the browser, older frames are simply skipped — the panel always shows the most recent one, never a backlog.

## How it reaches the browser

```
your kernel
  -> cudaMemcpy back to host
    -> tt_render_frame() writes /tmp/render/frame.bin
      -> frame streamer in the container notices the new frame
        -> WebSocket /api/containers/:id/frames
          -> Three.js DataTexture on a full-panel quad
```

Two details make this reliable:

- **Atomic writes.** `tt_render_frame` writes a temp file and `rename()`s it into place, so a reader can only ever see a complete frame — never half of one mid-write.
- **A sequence number** in the frame header. The streamer ships a frame only when that number changes, which is what lets it drop stale frames instead of queueing them.

Frames travel as raw binary. An 800×600 frame is 1.9 MB of RGBA; sending that as a JSON array would be roughly 8 MB of text per frame, which would make animation impossible.

## Status line

The bar at the top of the panel shows the connection state, and once frames arrive, the resolution and measured frame rate. That rate is what the **browser** is displaying, which may be lower than what your kernel produces — dropped frames are normal and not an error.

## If nothing appears

- Check the **Terminal** tab first. A compile error means the program never ran.
- Confirm you actually called `tt_render_frame` — the panel says *waiting for the first frame* until you do.
- The buffer must be exactly `width * height * 4` bytes. A buffer sized for RGB (3 bytes) will be rejected as short.
- A single-frame program finishes in milliseconds. That is fine: the last frame stays on screen.
