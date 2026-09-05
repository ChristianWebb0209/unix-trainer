# 🌌 CUDA Mini-Project: Build a GPU Fractal Renderer (One File, One Hour)

You are about to build a **GPU-accelerated fractal renderer** in a **single CUDA file**.

When you're finished, your program will generate a beautiful image of the **Mandelbrot fractal** using **thousands of GPU threads running in parallel**.

No starter code.  
One file.  
You write everything.

The entire project exists to teach one critical GPU concept:

> **Mapping computation to threads.**

Once you understand that mapping, CUDA suddenly makes sense.

---

# What You Will Build

Your program will:

1. Launch **tens of thousands of GPU threads**
2. Each thread computes **one pixel**
3. The GPU calculates the Mandelbrot set
4. The program writes an image file

Final output: a **high-resolution fractal image generated entirely by the GPU**.

This looks something like:


██████████▒▒▒▒▒▒▒▒▒▒
██████▒▒▒░░░░░░░▒▒▒▒
███▒▒░░░░░░░░░░░░░░▒


Except much prettier.

Fractals are ideal GPU projects because **every pixel can be computed independently**.

That means:


1 thread = 1 pixel


A GPU loves problems like this.

---

# Step 0 — Create the File

Create a file called:


fractal.cu


Compile with:


nvcc fractal.cu -o fractal


---

# Step 1 — Basic Includes

At the top of your file add the standard libraries you need.

You will likely need things like:


#include <iostream>
#include <fstream>
#include <cmath>


We will output the image using the **PPM format**, because it's the simplest image format imaginable.

A PPM file is basically:


header
then raw RGB values


---

# Step 2 — Decide Your Image Size

Inside `main()` define the image resolution.

Example idea:


const int width = 1200;
const int height = 800;


Also define the maximum number of Mandelbrot iterations.


const int maxIter = 1000;


Higher values produce more detailed fractals.

---

# Step 3 — Allocate Memory For the Image

You need a place to store pixel values.

Each pixel will store **RGB values**.

Simplest approach:


unsigned char* image;


Allocate memory large enough for:


width * height * 3


Why `3`?

Because each pixel has:


R G B


---

# Step 4 — Allocate GPU Memory

Now the important CUDA part begins.

You need a GPU copy of the image.

You will use CUDA memory functions like:


cudaMalloc(...)
cudaMemcpy(...)
cudaFree(...)


Workflow:

1. Allocate memory on GPU
2. Run kernel
3. Copy result back to CPU

---

# Step 5 — Write Your CUDA Kernel

Now write your first CUDA kernel.

CUDA kernels begin with:


global


Example structure:


global void renderFractal(...)


This function runs on the GPU.

Thousands of threads will execute it **simultaneously**.

---

# Step 6 — Compute Thread Index

Inside your kernel you must determine:

> Which pixel does this thread own?

CUDA gives you built-in variables:


threadIdx.x
blockIdx.x
blockDim.x


Typical pattern:


int idx = blockIdx.x * blockDim.x + threadIdx.x;


This converts **block/thread coordinates into a global index**.

Now convert that index into `(x,y)` coordinates.

Conceptually:


x = idx % width
y = idx / width


If the thread index exceeds total pixels, simply return.

---

# Step 7 — Map Pixels To Complex Plane

Fractals live in the **complex number plane**.

Each pixel corresponds to a complex number:


c = real + imaginary*i


Map pixel coordinates to something like:


real ∈ [-2.0 , 1.0]
imag ∈ [-1.5 , 1.5]


You can compute this using simple linear scaling.

---

# Step 8 — Mandelbrot Iteration

Now comes the fractal magic.

The Mandelbrot rule is:


z = z² + c


Start with:


z = 0


Then iterate.

In components:


zx = zxzx - zyzy + cx
zy = 2zxzy + cy


Each iteration checks:


zxzx + zyzy > 4


If that happens, the point **escapes the set**.

Count how many iterations it takes.

---

# Step 9 — Convert Iterations To Color

Now translate the iteration count into a color.

Simple idea:


color = iteration % 256


Write RGB values into the image array.

Conceptually:


image[pixelIndex + 0] = red
image[pixelIndex + 1] = green
image[pixelIndex + 2] = blue


Each thread writes exactly **one pixel**.

No race conditions.

This is the beauty of **data parallelism**.

---

# Step 10 — Launch the Kernel

Back in `main()` you launch the GPU kernel.

CUDA uses this syntax:


kernel<<<numBlocks, blockSize>>>(...)


Choose something like:


blockSize = 256


Then compute number of blocks needed.

Conceptually:


numBlocks = (totalPixels + blockSize - 1) / blockSize


This ensures every pixel gets a thread.

---

# Step 11 — Copy Image Back To CPU

Once the kernel finishes:


cudaMemcpy(...)


Copy GPU memory back to your CPU image array.

---

# Step 12 — Show the Image

Include the render header at the top of your file:


#include "tt_render.h"


Then, once the pixels are back on the host, publish them:


tt_render_frame(pixels, width, height);


One catch: the panel expects **RGBA**, four bytes per pixel, not the three you may have allocated for PPM. Either allocate `width * height * 4` from the start, or copy into a 4-byte buffer before publishing.

Open the **Render** tab and your fractal appears there.

---

# Step 13 — Run It

Compile:


nvcc -arch=sm_61 -I/workspace fractal.cu -o fractal


Run:


./fractal


The image shows up in the Render tab the moment the program publishes it.

---

# Step 14 — Make It Move

You have a still image. Turn it into an animation by wrapping steps 5–12 in a loop and shrinking the coordinate range a little each pass:


for (int frame = 0; frame < 240; frame++) {
    // launch kernel with the current window
    // copy pixels back
    // tt_render_frame(pixels, width, height);
    // shrink the window slightly
}


Publish every frame. The panel always displays the newest one, so you can render as fast as the card manages and never worry about pacing.

---

# What Just Happened (The Important Lesson)

Your GPU probably launched something like:


960,000 threads


Each thread computed **one pixel**.

This is the key mental model for CUDA:


thread ↔ data element


Instead of writing loops, you assign work to **massive numbers of threads**.

The GPU hardware schedules them automatically.

---

# Make It Look Even Cooler

Try modifying:


maxIter


Or change color formulas.

Try weird mappings like:


sin(iteration)


Fractals are mathematically infinite playgrounds.

---

# Optional Challenge

Zoom into the fractal.

Change the coordinate ranges from:


[-2 , 1]


to a tiny window like:


[-0.75 , -0.70]


Suddenly entirely new structures appear.

The Mandelbrot set contains **infinite complexity**.

You could spend a lifetime exploring it.

---

# Final Thought

Your CPU might have **8 cores**.

Your GPU probably has **thousands of compute cores**.

When a problem can be split into tiny independent tasks—like computing pixels—GPUs become astonishingly powerful.

The Mandelbrot set is just mathematics.

But it's also a perfect demonstration of a deeper truth:

> The universe rewards problems that can be broken into many small pieces.

That principle powers:

- scientific simulations
- machine learning
- rendering
- physics engines
- climate models

And now you've used it yourself.