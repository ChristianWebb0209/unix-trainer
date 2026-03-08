# LLM Problem Authoring Guide

This guide is for LLMs (and humans) that create or edit coding problems for **Tensor Trainer**. Follow it so that problems render correctly and are easy to validate.

---

## 1. Problem schema (JSON)

Each problem in a `problems` array must have at least:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | **Yes** | Unique ID (e.g. `unix_easy_001`, `bash_learn_002`). |
| `title` | string | **Yes** | Short display title. |
| `instructions` | string | **Yes** | Problem text. **Must use the resolver** (see below). |
| `solution` | string | No | Official solution text. **Must use the resolver** and **must demonstrate the solution with inline code**. Omit or `null` until you have one. |
| `difficulty` | string | **Yes** | One of: `learn`, `easy`, `medium`, `hard`. |
| `language` | string | **Yes** | One of: `c`, `cpp`, `rust`, `cuda`, `python`, `triton`, `pytorch`, `any`. |
| `starterCode` | string | No | Initial code in the editor. |
| `tests` | array | **Yes** | Array of test cases. **Must be comprehensive** (see Tests section). Each test can specify its own validation method (see §4.2). |
| `validation` | object | No | Optional **default** when a test does not specify a method: `{ "kind": "stdout_exact" }` or `{ "kind": "cuda_numeric" }`. If omitted, the default is `stdout_exact`. |

Example minimal object:

```json
{
  "id": "cuda_easy_001",
  "title": "Hello, CUDA World",
  "language": "cuda",
  "difficulty": "easy",
  "instructions": "Write a command that prints:\n\nHello, World!\n\n{hints: Use echo.}",
  "solution": null,
  "starterCode": "# Your command here\n",
  "tests": [
    { "input": "", "expected_stdout": "Hello, World!\n" }
  ]
}

PLEASE KEEP IN MIND:

The solutions must be verbose and targeted towards user learning. they should ALL include a code sample of a working solution (the ideal solution) and an in depth explanation.

Verify: in both the description and solution there are sections in between three backticks ``` to indicate a code bloc for explanation.
```

---

## 2. The resolver (instructions and solution)

Both `instructions` and `solution` are rendered by the **same resolver**. The UI shows instructions in the “Problem” tab and solution in the “Solution” tab. Inline code in either is shown in a read-only code block with syntax highlighting.

You **must** use the resolver so that:

- Code examples appear in proper code blocks (not plain paragraphs).
- Hints, emphasis, and input/output are styled correctly.

### 2.1 Inline code blocks (required for demonstrations)

Use **triple backticks** to wrap code. The content between backticks is rendered in a read-only CodeMirror block.

- In **instructions**: use code blocks to show example inputs/outputs, or a snippet that illustrates the *problem* (e.g. “your output should look like this”).
- In **solution**: use code blocks to show the actual solution code (or the key parts).

Syntax:

```
Some text here.

```bash
echo "Hello, World!"
```

More text.
```

Rules:

- Use exactly three backticks (```) at the start and end of the block.
- No language tag is required after the opening ``` (e.g. ``` or ```bash both work; the block is displayed as code).
- Always include at least one code block in **instructions** that demonstrates what you’re asking for (e.g. sample input/output or a one-line example).
- For **solution**, always include at least one code block that shows the solution (full or minimal working example).

### 2.2 Bold and italic

- **Bold**: wrap with `**text**`.
- *Italic*: wrap with `*text*`.

Example in instructions: “Count only **regular files**” or “*Optional*: handle empty input.”

### 2.3 Input / Output labels

Lines that start with `Input:` or `Output:` (case-insensitive) are rendered as labeled blocks. Put the content after the colon.

Example:

```
Input: A file named data.txt with one number per line.

Output: A single line with the sum of those numbers.
```

Use these in instructions to clarify test expectations, and in solution to show example runs.

### 2.4 Hints (collapsible)

Optional hints go in a special block so they appear under a “Show hint” toggle. Use this exact form:

```
{hints: Your hint text here. You can add multiple sentences.}
```

- The text inside the curly braces after `hints:` is shown when the user expands the hint.
- The entire `{hints: ...}` block is removed from the main body; only the hint text is shown in the details section.
- You can combine hints with code blocks and bold/italic in the rest of the instructions.

Example:

```
Print the current directory path.

{hints: Use the pwd command.}
```

### 2.5 Paragraphs

- Use blank lines to separate paragraphs.
- The resolver splits on double newlines and renders each part as a paragraph (with code blocks, Input/Output, or bold/italic as above).

---

## 3. Requirements for instructions and solution

1. **Instructions**
   - Must use the resolver (code blocks, bold/italic, Input/Output, and optionally hints).
   - Must include at least one **inline code block** that demonstrates the problem (e.g. expected output, sample command, or sample input/output).

2. **Solution**
   - If present, must use the resolver in the same way as instructions.
   - Must include at least one **inline code block** that demonstrates the solution (full or minimal working code).
   - If no official solution exists yet, leave `solution` omitted or `null`; the UI will show a placeholder.

---

## 4. Tests: be comprehensive

Tests are the only way to verify that a submission is correct. They must be **comprehensive** and **deterministic**.

### 4.1 What “comprehensive” means

- **Cover the spec**: Every requirement in the instructions should be checkable by at least one test.
- **Edge cases**: Include empty input, single element, large input, or boundary values where relevant.
- **Multiple tests**: Prefer several small, focused tests over one big test (easier to debug and clearer feedback).
- **Deterministic**: Same input must always produce the same expected output; no “run and hope” tests.

### 4.2 Validation method per test (part of the test object)

Validation is **per test**: each test object can specify which validation method to use. You can mix methods in the same problem (e.g. one test with exact stdout, another with numeric comparison). The resolver chooses the method in this order:

1. **On the test object:** `validation` or `kind` (e.g. `"validation": "cuda_numeric"` or `"kind": "stdout_exact"`).
2. **Prefix on test `id`:** format `kind::your_test_id`. The part before the first `::` is the validation kind.  
   Examples: `"id": "stdout_exact::tc1"`, `"id": "cuda_numeric::run"`.
3. **Problem-level default:** if the problem has `validation: { "kind": "cuda_numeric" }`, any test that did not specify a method uses that kind.
4. **Global default:** if nothing is set for a test and there is no problem default, the validator uses **`stdout_exact`**.

**Available kinds:** `stdout_exact`, `terminal_command`, `terminal_observation`, `cuda_numeric`. Match the kind to the test’s expectations (`expected_stdout` for stdout-based, `expected_values` for numeric).

### 4.3 Test case shape

Each element of `tests` is an object. Common fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Optional; unique ID for the test. Can use prefix `kind::id` to set validation method (see §4.2). |
| `validation` or `kind` | string | Optional; validation method for **this test only** (e.g. `"stdout_exact"`, `"cuda_numeric"`). |
| `input` | string | Stdin given to the program. Omit or `""` if no stdin. |
| `expected_stdout` | string | Exact stdout that must be produced. Use for exact-match validation. |
| `expected_stdout_regex` | string | Regex that stdout must match (alternative to exact match; check server support). |
| `canonical_command` | string | For **terminal_observation** only: run this shell command and check its stdout (user code is not run for this test). |
| `expected_values` | number[] | For numeric validation (e.g. GPU): parsed numbers from stdout compared in order. |
| `setup_files` | string[] | Optional; filenames to create (e.g. test files) before running. |

Always include at least one of: `expected_stdout` or `expected_stdout_regex` (or `expected_values` for numeric strategies).

### 4.4 Example test arrays

**Exact stdout (e.g. shell):**

```json
"tests": [
  { "id": "tc1", "input": "", "expected_stdout": "Hello, World!\n" },
  { "id": "tc2", "input": "foo\nbar\n", "expected_stdout": "bar\nfoo\n" }
]
```

**With setup files:**

```json
"tests": [
  { "setup_files": ["a.txt", "b.txt"], "expected_stdout": "2\n" },
  { "setup_files": [], "expected_stdout": "0\n" }
]
```

**Numeric (e.g. CUDA):**

```json
"tests": [
  { "input": "", "expected_values": [42, 100] }
]
```

**Per-test validation (prefix on `id`):**

```json
"tests": [
  { "id": "stdout_exact::tc1", "input": "", "expected_stdout": "Hello\n" },
  { "id": "cuda_numeric::run", "input": "", "expected_values": [64] }
]
```

**Per-test validation (`validation` or `kind` on each test):**

```json
"tests": [
  { "id": "tc1", "validation": "stdout_exact", "expected_stdout": "OK\n" },
  { "id": "tc2", "kind": "cuda_numeric", "expected_values": [1, 2, 3] }
]
```

---

## 5. File layout and seeding

- Problems live under `server/src/data/problems/` with **one JSON file per language** (no subdirectories), e.g.:
  - `awk.json`
  - `bash.json`
  - `unix.json`
  - `cuda.json`
  - `vulkan.json`
  - `sycl.json`
- Each file has a top-level key `"problems"` with an array of problem objects. All difficulties (learn, easy, medium, hard) for that language live in the same file.
- Language is inferred from the filename when not set on a problem; **always set `difficulty` and `language` explicitly** on each problem for clarity.
- After adding or changing problems (and adding a `solution` column to the DB if needed), run the problem seeder (or sync) so the database is updated.

---

## 6. Checklist before submitting a problem

- [ ] `id` is unique and matches naming (e.g. `{language}_{difficulty}_NNN`).
- [ ] `instructions` use the resolver and include at least one inline code block demonstrating the problem.
- [ ] `solution` (if present) uses the resolver and includes at least one inline code block demonstrating the solution.
- [ ] Hints (if any) use the `{hints: ...}` form.
- [ ] `tests` are comprehensive: multiple tests, edge cases, and deterministic.
- [ ] Each test has a clear pass condition (`expected_stdout`, `expected_stdout_regex`, or `expected_values` as appropriate).
- [ ] `starterCode` is a valid starting snippet for the given language.
- [ ] Each test’s validation method is clear: use a prefix on `id` (`kind::id`), or a `validation`/`kind` field on the test, or a problem-level `validation.kind` default; otherwise the default is `stdout_exact`.
