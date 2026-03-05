## Problem Validation Brainstorm

This document captures ideas and a future implementation strategy for a flexible, extensible validation system that will support many different problem types (shell/terminal, AWK, Unix, CUDA numeric, CUDA visual, and future types).

## important reminder

The most important thing to remember when implementing this is that we have a config file in the root of the project, and any information that will be changing as we add / remove languages or workspaces should be stored there. that is to say, we should try to avoid mentioning specific languages in either client or server code (the exception to this will be within the validation services themselves, where we handle each language, but even here, be sure to pull info from the config file when applicable). On the other hand, we may end up removing stuff from that config file and putting it into these verification services, like the getValidationCommand function. for these changes, you will need to make changes in both client and server to make it work fully.

Also, currently, it doesnt show in terminal when the user validates code. for building these validation services, explaining to user is a core principle. it should show all the test cases and how the user's code fared, then tell the result also. this will look slighlty different depnding on the validation service, but for temrinal it will say in the terminal container what is happening and each test case.

remember, for simplicity, i like the current schema of problems having their test cases. since the test case is just an object, when we dynamically add new types of problems to test, we can just have different types of tests, and each validation service will resolve these types.

also, keep in mind, validation right now is fairly buggy, you will need to go through a lot of the problems and see how their test cases work, and make sure you build the validation services to spec so they work with the problems.

---

### 1. Core Principles

- **Decouple execution from validation**
  - Execution: "Given the user's solution, how do we run it under controlled conditions N times?"
  - Validation: "Given what happened (stdout, files, images, metrics), how do we decide pass/fail?"
  - The same execution harness can be used by multiple validation strategies.

- **Server is the source of truth for correctness**
  - Client never decides whether a solution is correct.
  - Client *triggers* validation and displays results (tags, confetti, navigation), but correctness comes from the server.

- **Validation is pluggable per problem type**
  - Each problem defines a `validation.kind` and kind-specific options.
  - Server has a registry of validator implementations keyed by `kind`.
  - Easy to add new validation strategies later (e.g., GPU visual, performance constraints, invariants).

- **Use containers only as execution sandboxes**
  - `ContainerService` is responsible for running commands inside the right container.
  - Validation logic is purely in a `ValidationService` (or equivalent) which calls `ContainerService` as needed.
  - this means that we validate by accessing the user's container (depending on verification type, we may call to the webgpu viewer, or expand this in the future) and modify it to use test cases. the verification will receieve from client the code, and will verify, then get back to client on the result.

---

### 2. Schema Direction for Problems

We keep the current schema (id, language, difficulty, instructions, starterCode, tests) but *add* an explicit `validation` block.

Conceptual TS-like sketch:

```ts
type StdoutTest = {
  id: string;
  input?: string;
  expected_stdout: string;
  allow_trailing_whitespace?: boolean;
  normalize_newlines?: boolean;
};

type NumericTest = {
  id: string;
  input?: string;
  expected_values: number[];
  tolerance?: number; // e.g. 1e-5
};

type VisualTest = {
  id: string;
  // Either reference a stored image or a hash / encoded reference
  expectedImagePath?: string;
  expectedHash?: string;
  tolerance?: number;
};

type ValidationStrategy =
  | { kind: "stdout_exact"; tests: StdoutTest[] }
  | { kind: "terminal_command"; tests: StdoutTest[]; canonicalCommand?: string }
  | { kind: "cuda_numeric"; tests: NumericTest[] }
  | { kind: "cuda_visual"; tests: VisualTest[] }
  | { kind: "custom"; handler: string /* server-side plugin id */ };

type ProblemDefinition = {
  id: string;
  language: "bash" | "awk" | "unix" | "cuda" | "any" | string;
  difficulty: "learn" | "easy" | "medium" | "hard";
  instructions: string;
  starterCode: string;
  validation: ValidationStrategy;
};
```

We don't have to retrofit all existing JSON immediately, but this is the direction for new or migrated problems.

---

### 3. Terminal / Shell Problems

#### 3.1 Execution Harness

For shell-style problems (Unix / Bash / AWK / etc.), we want a canonical way to run multiple test cases:

- For each test:
  - Create a clean temp directory under `/tmp/unix-trainer/<problemId>/<testId>/`.
  - Optionally create `setup_files` (already present in some JSON).
  - For stdin-driven problems:
    - Write test input to `/tmp/input.txt`.
    - Run a canonical command, e.g.:
      - Script style: `sh /tmp/run.sh < /tmp/input.txt`
      - One-liner style: `sh -lc "<user_command>" < /tmp/input.txt`.
  - Capture stdout, stderr, exit code.

This harness is owned by the **server** via `ContainerService.run(...)`, not by the client.

#### 3.2 Validation Strategy for Terminal Problems

Two main flows:

1. **Run Code button (canonical)**  
   - Client -> `POST /api/validate/:problemId` (or completion endpoint) with solution code.
   - Server:
     - Looks up problem & `validation.kind`.
     - For `kind: "stdout_exact"` | `"terminal_command"`:
       - Uses the execution harness to run all tests.
       - Compares stdout vs `expected_stdout` (with configurable normalization).
     - Returns `{ passed: boolean, tests: [...], summary: string }`.
   - Client:
     - If passed and it's the first completion:
       - Triggers confetti + hints.
     - Updates completion state and tags using existing `/api/completions` flow.

2. **User just types commands in the terminal**  
   - Hard to validate reliably from arbitrary PTY usage, especially with multiple test cases and mutable filesystem.
   - Recommended compromise:
     - Each problem defines a **canonical harness command** (e.g. `./run_tests.sh` or `bash /tmp/run.sh`).
     - Run Code always uses this harness.
     - Instructions tell users they can run the same harness manually in the terminal.
     - The **validation result** still comes from the server, not from sniffing PTY output.

We *can* add a `"terminal_observation"` strategy later that inspects PTY output to mark some simpler problems as done, but the primary path should be the harness-driven validator.

---

### 4. AWK-Specific Notes

Current behavior (after fixes):

- Interactive "Run Code" for AWK:
  - Hidden `/exec` call writes `/tmp/run.awk`.
  - Visible PTY command is `printf '\n' | awk -f /tmp/run.awk`:
    - Gives one empty input record so common patterns run once.
    - Exits cleanly without requiring Ctrl+C.
    - Only shows a clean AWK command (no base64 noise).

- Validation (multi-test):
  - For each test:
    - `/tmp/exec.awk` = script from code.
    - `/tmp/exec_input.txt` = base64-decoded test input.
    - Command: `awk -f /tmp/exec.awk /tmp/exec_input.txt`.
  - Stdout is compared to expected.

This is a good template for other languages: use inline commands for PTY UX, use `/tmp` files and `/exec` for robust server-side validation.

---

### 5. CUDA / GPU Problems

#### 5.1 Numeric CUDA Problems

Examples: reductions, stencil operations, mat-vec, etc.

- Validation kind: `"cuda_numeric"`.
- Tests:
  - Define input configuration (often encoded in the starter code + minimal test metadata).
  - Expected outputs: numbers printed on stdout or stored in a buffer.
  - Tolerance for floating point comparisons.

Validation flow:

- Server builds & runs the CUDA program inside the CUDA workspace container:
  - Potentially uses `nvcc` in the container (or pre-built harness).
  - For each test, runs the binary and captures stdout.
- Parses stdout into numeric values and compares to expected within tolerance.

#### 5.2 Visual CUDA Problems

Examples: shaders, procedural images, WebGPU / CUDA visual output.

- Validation kind: `"cuda_visual"`.
- Tests:
  - Expected reference image or buffer (path or hash).
  - Tolerance for pixel differences.

Validation flow:

- Server runs the user program to generate an image or frame buffer.
- Compares against a reference image (pixel-by-pixel, with tolerance).
- Returns aggregate metrics: max error, pass/fail, possibly a textual summary.

Client may or may not show the image; it can rely on a textual summary for correctness.

---

### 6. VerificationService Design & Module Layout (Server)

We want validation to be both centralized (one place the client talks to) and **modular** (per-type implementations in their own files). The goal is to **avoid cramming all verification logic into a single giant file** and make it easy to add new problem types.

#### 6.1 Top-level VerificationService (`verification.service.js`)

Create a dedicated service in `server/src/services/verification.service.js` that is the single entrypoint for "validate this problem/solution".

Rough structure:

```ts
// server/src/services/verification.service.js
import { validators } from "./verification-types/index.verification.js";

export class VerificationService {
  constructor(containerService, problemRepo) {
    this.containerService = containerService;
    this.problemRepo = problemRepo;
  }

  /**
   * Validates a user's solution for a given problem.
   * - Looks up the problem + validation strategy
   * - Delegates to the appropriate verification-type module
   * - Normalizes the response for the client
   */
  async validate({ problemId, solutionCode, userId, containerId }) {
    const problem = await this.problemRepo.get(problemId);
    const strategy = problem.validation;

    if (!strategy || !strategy.kind) {
      throw new Error(`Problem ${problemId} does not declare a validation.kind`);
    }

    const validator = validators[strategy.kind];
    if (!validator) {
      throw new Error(`Unknown validation kind: ${strategy.kind}`);
    }

    return await validator({
      problem,
      solutionCode,
      strategy,
      containerService: this.containerService,
      containerId,
      userId,
    });
  }
}
```

The `VerificationService` is the only thing your Express routes talk to. It knows how to:

- Load problem metadata.
- Pick the right validator based on `validation.kind`.
- Pass down shared dependencies (`ContainerService`, `problemRepo`, etc.).
- Normalize results so the client always sees a consistent shape:

```ts
type ValidationResult = {
  passed: boolean;
  tests: Array<{ id: string; passed: boolean; stdout?: string; stderr?: string; message?: string }>;
  summary: string;
};
```

#### 6.2 Verification types folder (`verification-types/`)

Under `server/src/services`, add a folder:

```text
server/src/services/
  verification.service.js
  verification-types/
    terminal.verification.js
    image.verification.js
    db.verification.js        // future SQL / DB problems
    cuda-numeric.verification.js
    cuda-visual.verification.js
    index.verification.js     // registry
```

Each `*.verification.js` module is responsible for **one family of validation kinds**. For example:

- `terminal.verification.js` might handle:
  - `"stdout_exact"`
  - `"terminal_command"`
  - `"terminal_observation"` (future)
- `image.verification.js` might handle:
  - `"cuda_visual"`
  - future `"webgpu_visual"`, `"shader_visual"`, etc.
- `db.verification.js` will handle:
  - `"sql_query"`
  - `"migration"`, etc., in the future.

Every verification module exports a common interface:

```ts
// server/src/services/verification-types/terminal.verification.js

export const TERMINAL_VALIDATORS = {
  stdout_exact: validateStdoutExact,
  terminal_command: validateTerminalCommand,
  // terminal_observation: validateTerminalObservation, // later
};

/**
 * @param ctx {{
 *   problem,
 *   solutionCode,
 *   strategy,
 *   containerService,
 *   containerId?: string,
 *   userId?: string,
 * }}
 * @returns {Promise<ValidationResult>}
 */
async function validateStdoutExact(ctx) { /* ... */ }

async function validateTerminalCommand(ctx) { /* ... */ }
```

The `index.verification.js` file aggregates all validators into a single map the `VerificationService` can use:

```ts
// server/src/services/verification-types/index.verification.js
import { TERMINAL_VALIDATORS } from "./terminal.verification.js";
import { IMAGE_VALIDATORS } from "./image.verification.js";
import { DB_VALIDATORS } from "./db.verification.js";
import { CUDA_NUMERIC_VALIDATORS } from "./cuda-numeric.verification.js";

export const validators = {
  ...TERMINAL_VALIDATORS,
  ...IMAGE_VALIDATORS,
  ...DB_VALIDATORS,
  ...CUDA_NUMERIC_VALIDATORS,
};
```

This keeps the **routing logic** very simple:  
`VerificationService.validate` just does `validators[strategy.kind](ctx)`.

#### 6.3 Responsibilities per module

- **`verification.service.js`**
  - Public API for routes (`POST /api/validate/:problemId`).
  - Problem lookup + basic validation of configuration.
  - Error handling, logging, and potentially metrics/timing.
  - No test-specific logic.

- **`verification-types/*.verification.js` files**
  - Know how to interpret their subset of `ValidationStrategy`.
  - Build the right shell commands / harness inside containers.
  - Compare outputs (stdout, images, DB rows, etc.) to expectations.
  - Return `ValidationResult` objects only.

- **Routes (e.g., `validation.routes.js` or inside `problem.routes.js`)**
  - Thin mapping from HTTP to `VerificationService`.
  - Example route:

    ```ts
    router.post("/problems/:problemId/validate", async (req, res) => {
      const { problemId } = req.params;
      const { solutionCode, containerId } = req.body;
      try {
        const result = await verificationService.validate({ problemId, solutionCode, userId: req.user?.id, containerId });
        res.json(result);
      } catch (err) {
        console.error("[Validation] Error:", err);
        res.status(500).json({ error: "Validation failed" });
      }
    });
    ```

This layout matches your intuition: **one orchestrator** plus **separate, focused verification-type modules**.

---

### 7. Client Responsibilities

The client should:

- Trigger validation:
  - On Run Code press: `POST /api/validate/:problemId` (passing solution code, language, workspace, containerId, etc.).
- Display:
  - Progress state: "Validating…", "All tests passed", or error messages.
  - Confetti & completion tags when all tests pass (and it’s the first completion).
  - Completion coloring in the sidebar.
  - Next-problem navigation hints and keyboard shortcuts (e.g., Ctrl+Enter to move to next problem).
- Persist:
  - Completion snapshots via existing `/api/completions` endpoint (server decides when to mark completed).

The client does **not**:

- Reimplement the multi-test logic.
- Try to infer correctness from raw PTY output (except for very simple, optional quality-of-life cases in the future).

---

### 8. Future Extensions / Ideas

- **Performance-aware validation**
  - Validators can run the solution multiple times and measure execution time / memory.
  - Problem definition could include performance thresholds (e.g., `maxMillis`, `maxMemory`).

- **Property-based / invariant testing**
  - Instead of fixed input/output pairs, define invariants that must hold across many randomized tests.
  - The validator generates inputs and checks the invariant.

- **Partial credit / grading**
  - Expose more granular feedback: which tests passed/failed, point values, etc.
  - Could be used for a future "graded track" or practice tests with scores.

- **Terminal observation-based completion**
  - For some problems, we might tag them as `"terminal_observation"` and inspect PTY output for certain patterns (e.g., exact expected output after a specific canonical command), but we should treat this as an *extra* on top of the harness-based validation.

---

### 9. Implementation Strategy (Phased)

**Phase 1 – Design + Stubs**
- [ ] Decide on the exact `validation` shape to store in problem JSON.
- [ ] Add TS types (shared config) that describe `ValidationStrategy`.
- [ ] Add a `VerificationService` skeleton in `server/src/services/verification.service.js` that:
  - Loads problems from a repo.
  - Delegates to a `validators` registry.
  - Normalizes `ValidationResult` for the client.
- [ ] Add `server/src/services/verification-types/` folder with stub modules:
  - `terminal.verification.js`
  - `image.verification.js`
  - `db.verification.js` (even if just a TODO for now)
  - `cuda-numeric.verification.js`
  - `cuda-visual.verification.js`
- [ ] Add `server/src/services/verification-types/index.verification.js` that aggregates and exports a single `validators` map.
- [ ] Add a `/api/validate/:problemId` route that:
  - Reads problem.
  - Calls `ValidationService.validate`.
  - Returns a structured validation result.

**Phase 2 – Migrate existing problems to `"stdout_exact"`**
- [ ] For AWK, Bash, Unix "learn/easy/medium" problems:
  - Represent existing `tests` as `StdoutTest[]`.
  - Implement `validateStdoutExact`, using the helper code we already have in `container.service.js` as a starting point.
- [ ] Wire `Editor.tsx` Run Code button to call `/api/validate/:problemId` instead of doing local validation logic.

**Phase 3 – Terminal harness (`"terminal_command"`)**
- [ ] For shell problems that rely on filesystem setup or multiple commands:
  - Define a canonical test runner command (e.g., `./run_tests.sh`).
  - Implement `validateTerminalCommand` in `terminal.verification.js` that:
    - Prepares the script/harness inside the container.
    - Runs the canonical command for each test case.
    - Compares stdout.
- [ ] Update problem JSON with `"validation": { "kind": "terminal_command", ... }` where appropriate.

**Phase 4 – CUDA numeric + visual**
- [ ] Implement `validateCudaNumeric` in `cuda-numeric.verification.js`:
  - Compile and run CUDA programs inside CUDA workspace.
  - Parse stdout into numbers and compare to expected with tolerance.
- [ ] Implement `validateCudaVisual` in `cuda-visual.verification.js`:
  - Generate and store reference images for tests.
  - Run user programs, collect outputs, and compare images with tolerance.

**Phase 5 – Optional terminal observation strategy**
- [ ] Explore a light `"terminal_observation"` strategy for very simple problems where just typing the right command once in the PTY can mark completion.
- [ ] Ensure this remains secondary to the main harness-based validators.

---

We can refine and update this document as we iterate on the actual implementation.

