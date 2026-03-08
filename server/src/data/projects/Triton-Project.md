# ⚡ Triton Mini-Project: Build Your First GPU Softmax Kernel

In this project you will build a **GPU kernel using Triton** that computes the **softmax function** — one of the most important operations in modern machine learning.

You will do everything in **one Python file**.

No starter code.

By the end, you will:

• write a real GPU kernel  
• launch it from Python  
• compute softmax faster than a naive CPU version  

This project is designed to take **about one hour**.

The deeper goal is learning a powerful mental model:

> **GPU kernels operate on blocks of data simultaneously.**

Instead of writing Python loops, you instruct the GPU to process **large blocks in parallel**.

---

# What You Will Build

Your program will:

1. Generate random data
2. Send it to the GPU
3. Run a **Triton kernel**
4. Compute **softmax across rows**
5. Verify correctness against PyTorch

Softmax takes a vector like:


[2.0, 1.0, 0.1]


and converts it into probabilities:


[0.659, 0.242, 0.098]


All values become:


positive
sum = 1


Softmax is used everywhere in deep learning.

Transformers call it **billions of times during training**.

---

# Step 0 — Install Dependencies

Install Triton and PyTorch.

You can do something like:


pip install torch triton


Triton works best with NVIDIA GPUs.

---

# Step 1 — Create the File

Create a file:


softmax_triton.py


Everything in this project lives in this one file.

---

# Step 2 — Import Libraries

At the top import the libraries you'll need.

You will likely want things like:


import torch
import triton
import triton.language as tl


These three imports give you everything necessary to write GPU kernels.

---

# Step 3 — Generate Input Data

Inside `main()` create a matrix.

Softmax will operate **row-wise**.

Example idea:


rows = 1024
cols = 512


Create random data:


x = torch.randn(rows, cols, device="cuda")


The important detail:


device="cuda"


This puts the tensor **on the GPU**.

---

# Step 4 — Understand the Softmax Formula

Softmax is defined as:


softmax(x_i) = exp(x_i) / sum(exp(x))


But there is a numerical stability trick.

Subtract the maximum value first.


exp(x_i - max(x))


This prevents overflow.

---

# Step 5 — Write Your First Triton Kernel

Triton kernels are defined with a decorator.


@triton.jit


Example structure:


@triton.jit
def softmax_kernel(...)


This function will run **on the GPU**.

---

# Step 6 — Kernel Arguments

Your kernel should receive:

• pointer to input tensor  
• pointer to output tensor  
• number of columns  

Conceptually something like:


input_ptr
output_ptr
n_cols


Triton works with **memory pointers**, not Python arrays.

---

# Step 7 — Map Program IDs

CUDA uses threads.

Triton uses **program instances**.

Each instance will compute **one row of softmax**.

Get the program ID using:


row = tl.program_id(0)


That number identifies which row the kernel should process.

---

# Step 8 — Compute Memory Offsets

Each row starts at a specific position in memory.

Conceptually:


row_start = row * n_cols


You will load elements from that row.

Triton allows **vectorized loads**.

Use something like:


offsets = tl.arange(0, BLOCK_SIZE)


This represents a vector of indices.

---

# Step 9 — Load Data From GPU Memory

Use Triton's load operation.

Conceptual syntax:


values = tl.load(pointer + offsets)


This loads a **block of elements simultaneously**.

This is the key idea behind Triton.

The GPU processes **vectors instead of scalars**.

---

# Step 10 — Compute Softmax

Inside the kernel perform the operations:

1. compute max
2. subtract max
3. exponentiate
4. sum values
5. divide

Triton operations look like normal math:


tl.max(...)
tl.exp(...)
tl.sum(...)


These operate **across the loaded vector**.

---

# Step 11 — Write Results Back

After computing normalized values, write them to the output tensor.

Conceptually:


tl.store(output_ptr + offsets, result)


Each program instance writes one row.

---

# Step 12 — Choose Block Size

Triton kernels use compile-time constants.

Define something like:


BLOCK_SIZE = 512


The block size should usually match or exceed the number of columns.

---

# Step 13 — Launch the Kernel

Back in Python you launch the kernel.

Triton launch syntax looks unusual:


kernelgrid


The grid determines **how many program instances run**.

For row-wise softmax:


grid = (rows,)


That means:


1 kernel instance per row


---

# Step 14 — Allocate Output Tensor

Before launching the kernel, allocate the output.

Example idea:


y = torch.empty_like(x)


This tensor will receive the GPU results.

---

# Step 15 — Run the Kernel

Launch the kernel using the input and output pointers.

You will pass pointers like:


x_ptr = x
y_ptr = y


Then execute the kernel.

The GPU now performs **thousands of softmax computations simultaneously**.

---

# Step 16 — Verify Correctness

Now compute softmax using PyTorch.

Example idea:


torch.softmax(x, dim=1)


Compare your Triton output with PyTorch.

Use something like:


torch.allclose(...)


Floating point math isn't exact, so allow a small tolerance.

---

# Step 17 — Benchmark Performance

Measure execution time.

Python offers:


torch.cuda.synchronize()


and


time.time()


Compare:

• Triton kernel  
• PyTorch softmax  

Depending on GPU and tuning, Triton can be extremely fast.

---

# What You Just Learned

You implemented a **custom GPU kernel** for a real machine learning primitive.

Important concepts you used:

### GPU Program Instances


tl.program_id


determines which data a kernel processes.

---

### Vectorized Memory Operations


tl.load
tl.store


operate on **blocks of values at once**.

---

### GPU Parallelism

If your input had:


1024 rows


then **1024 GPU programs executed simultaneously**.

Each one computed softmax for a row.

---

# Try These Experiments

Change matrix size:


4096 x 1024


See how performance scales.

---

Increase block size.


BLOCK_SIZE = 1024


Observe performance differences.

---

Try computing **column softmax** instead.

That requires a different memory access pattern.

---

# Why Triton Exists

Writing high-performance CUDA kernels is difficult.

Triton was created at :contentReference[oaicite:0]{index=0} to make GPU programming **much easier**.

It lets Python developers write kernels that rival CUDA performance.

Many modern AI systems use Triton internally.

---

# Final Thought

A GPU isn't fast because of clock speed.

It's fast because it can perform **thousands of mathematical operations simultaneously**.

Softmax may look simple.

But when training massive neural networks, that simple function runs **trillions of times**.

By writing this Triton kernel, you stepped into the same world of GPU optimization that powers modern AI systems.

And it all started with one file.