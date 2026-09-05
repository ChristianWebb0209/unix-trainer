# CUDA in this workspace

## What you get

Your container is built from `nvidia/cuda:12.4.0-base-ubuntu22.04` with `nvcc`, the CUDA runtime headers, `g++`, and `clangd` for editor intelligence. The host GPU is passed through, so kernels really execute — `nvidia-smi` works inside the terminal and reports the actual card.

## How Run compiles your code

```
nvcc -arch=sm_61 -I/workspace /tmp/main.cu -o /tmp/a.out && /tmp/a.out
```

- `-arch=sm_61` targets Pascal (GTX 10-series), the reference machine's GPU. Compiling for the exact architecture skips the JIT step at launch.
- `-I/workspace` is what makes `#include "tt_render.h"` resolve.

You can run the same command yourself in the **Terminal** tab against any file — the terminal is a real shell in the same container.

## Things worth knowing on this hardware

**Double precision is slow.** Consumer Pascal cards run FP64 at 1/32 the FP32 rate. Deep fractal zooms need `double` for accuracy, but anything that fits in `float` will be dramatically faster.

**Watch out for silent kernel failures.** A kernel launch does not return an error code. If nothing happens, check explicitly:

```cuda
myKernel<<<grid, block>>>(args);
cudaError_t err = cudaGetLastError();
if (err != cudaSuccess) printf("launch failed: %s\n", cudaGetErrorString(err));
```

**Kernel launches are asynchronous.** `cudaMemcpy` synchronises for you, which is why the render loop does not need an explicit `cudaDeviceSynchronize()`. If you time a kernel without copying anything back, add one or you will measure the launch, not the work.

**Threads run in warps of 32.** They execute in lockstep, so a branch that sends some threads one way and some the other makes the warp run *both* paths. In an escape-time fractal, that is why the solid interior — where every pixel runs the full iteration count — dominates the cost.

## Container lifetime

One container per browser session, reused across runs, destroyed after 15 minutes idle. Files you save in the playground are injected at `/workspace/files` when it starts.
