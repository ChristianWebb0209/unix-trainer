# Adding New Languages and Workspaces

This guide lists **every place** you must touch to add a new language or workspace so you can do it quickly and consistently. The goal is fast, dynamic creation with no missed spots.

---

## Quick reference: where to configure what

| What you're adding | Files to touch |
|--------------------|----------------|
| **New language** | 1. `problem-config.mjs` 2. `client/src/types/problem-config.d.ts` 3. `server/docker/lsp-proxy.js` (if LSP desired) 4. `client/src/services/lspFileUri.ts` (if LSP) 5. `server/src/data/problems/<lang>.json` 6. `server/src/config/execution.config.js` (optional: display/prefix) |
| **New workspace** | 1. `problem-config.mjs` 2. `client/src/types/problem-config.d.ts` 3. `server/docker/Dockerfile.<name>` + build 4. `server/src/services/container.service.js` (uses `problem-config` only; no change if workspace is in config) 5. `client/src/assets/technologies.json` |
| **New validation kind** (e.g. custom runner) | 1. `server/src/services/verification-types/<name>.verification.js` 2. `server/src/services/verification-types/index.verification.js` |

The **single source of truth** for language and workspace IDs is **`problem-config.mjs`**. Server and client both read from it (or from types derived from it). Start there, then follow the checklist below.

---

## 1. Problem schema (DB + JSON)

### Database (Supabase / migrations)

The `problems` table looks like this (see `docs/db-schema.md` and `server/scripts/sync-problems.js`):

| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar | Unique problem ID (e.g. `bash_learn_001`). |
| `title` | varchar | Display title. |
| `instructions` | text | Problem description (supports resolver: code blocks, hints, bold). |
| `difficulty` | varchar | One of: `learn`, `easy`, `medium`, `hard`. |
| `language` | varchar | One of the problem language IDs (e.g. `bash`, `cuda`). |
| `tests` | jsonb | Array of test objects (see below). |
| `starter_code` | text | Optional initial code. |
| `solution` | text | Optional solution text. |
| `validation` | jsonb | Optional default validation, e.g. `{ "kind": "stdout_exact" }`. |

You don’t create tables by hand for new languages; the **sync script** and **seeder** upsert from JSON.

### Problem JSON files

- **Location:** `server/src/data/problems/`
- **Convention:** One file per language: `bash.json`, `c.json`, `cuda.json`, etc. No subdirectories.
- **Structure:** Single top-level key `"problems"` with an array of problem objects.

Minimal problem object:

```json
{
  "id": "mylang_easy_001",
  "title": "Hello, World",
  "language": "mylang",
  "difficulty": "easy",
  "instructions": "Print Hello, World.\n\n{hints: Use the standard print.}",
  "tests": [
    { "id": "tc1", "input": "", "expected_stdout": "Hello, World\n" }
  ]
}
```

Full schema and resolver rules (instructions, solution, hints, test shapes, validation kinds) are in **`server/src/data/problems/LLM_PROBLEM_AUTHORING_GUIDE.md`**. After adding or editing JSON, run the problem sync or seeder so the DB is updated.

---

## 2. Adding a new language (step-by-step)

### 2.1 `problem-config.mjs` (root)

- **`PROBLEM_LANGUAGES`**  
  Add an entry: `id`, `label`, `workspace` (which workspace this language belongs to), `docs` (optional URL).

- **`C_LIKE_LANGUAGE_IDS`** or **`SHELL_LANGUAGE_IDS`**  
  Add the new `id` to the appropriate array (C-like vs shell) so the editor uses the right grammar and indentation.

- **`WORKSPACES`**  
  Add the language to the correct workspace’s `problemLanguages` array (e.g. `systems` or `gpu`).

- **`DEFAULT_STARTER_CODE`**  
  Add a key for the new language with a small valid snippet.

- **`getValidationCommand(languageId, codeBase64, inputBase64)`**  
  Add a `case` that builds the shell command to run in the container: write decoded code to a temp file, compile/interpret as needed, run with decoded stdin. This is what validation and “Run” use.

- **`CODE_EDITOR_THEME_SPECS`**  
  Only if you want a new theme key; otherwise reuse an existing `codeThemeKey` in the workspace.

### 2.2 `client/src/types/problem-config.d.ts`

- Extend the union types that list language IDs (e.g. `ProblemLanguage`, `PROBLEM_LANGUAGE_IDS`, and any `Record<>` that keys by language) so the new language is included. This keeps TypeScript in sync with `problem-config.mjs`.

### 2.3 LSP (IntelliSense) – optional

**`server/docker/lsp-proxy.js`**

- In `getLSP(lang)` add a `case` for the new language: which binary to run (e.g. `clangd`, `bash-language-server`), args, and `env` (e.g. PATH) if needed. If the new language should use an existing LSP (e.g. clangd for a C-like lang), reuse that case.

**`client/src/services/lspFileUri.ts`**

- Add the language to `LSP_SUPPORTED`.
- In `EXT_MAP` set the file extension the LSP expects (e.g. `.cu` for cuda).
- In `LSP_LANG_MAP` set the LSP language id (e.g. `cuda`, `cpp`, `shellscript`).

**Docker image**

- Ensure the image that runs this workspace has the LSP binary installed (e.g. in `server/docker/Dockerfile.systems` or `Dockerfile.gpu`). The proxy runs inside the container.

### 2.4 Problem data and sync

- Create **`server/src/data/problems/<lang>.json`** with a `"problems"` array (see schema above and the LLM guide).
- Run your usual sync/seeder so `problems` in the DB gets the new rows.

### 2.5 Server execution config (optional)

- **`server/src/config/execution.config.js`**  
  `ALLOWED_LANGUAGES` is derived from `problem-config` (plus a few extras). If your new language is in `PROBLEM_LANGUAGE_IDS` (and not `any`), it’s already allowed. You can add a display name and prefix in `LANGUAGE_CONFIG` and `LANGUAGE_BY_PREFIX` for consistency.

---

## 3. Adding a new workspace (step-by-step)

### 3.1 `problem-config.mjs`

- **`WORKSPACES`**  
  Add a new key (e.g. `myworkspace`) with: `id`, `label`, `defaultProblemLanguage`, `problemLanguages` (array of language IDs), `dockerImageName`, `dockerfileName`, `kind`, `allowLanguageSwitch`, `showRenderImageTab`, `showRenderVideoTab`, `showRenderInteractiveTab`, `showImagePanel`, `codeThemeKey`.

- **`CODE_EDITOR_THEME_SPECS`**  
  If the workspace uses a new theme, add an entry keyed by `codeThemeKey`.

- **`PROBLEM_LANGUAGES`**  
  For every language that belongs to this workspace, set `workspace: "myworkspace"`.

- **`DEFAULT_WORKSPACE`**  
  Change only if you want this workspace to be the default.

### 3.2 `client/src/types/problem-config.d.ts`

- Add the new workspace id to the relevant types (e.g. `SharedWorkspace`, `WORKSPACES`, `getWorkspaceIds()` return type).

### 3.3 Docker

- Add **`server/docker/Dockerfile.<name>`** (same name as in `dockerfileName` in config). Install runtimes and LSPs needed for this workspace’s languages.
- Copy **`server/docker/lsp-proxy.js`** into the image (it’s shared). Ensure any LSP binaries used in `lsp-proxy.js` for this workspace’s languages are installed in the image.
- Wire your build so the image name matches `dockerImageName` in `problem-config.mjs` (e.g. `myworkspace-workspace:latest`).

### 3.4 Client technologies (landing/editor)

- **`client/src/assets/technologies.json`**  
  Add an object with `id`, `title`, `description`, `languages` (array of language IDs), `workspace` (must match the new workspace id), and `icon` if you have one.

No change is required in **`server/src/services/container.service.js`** for a new workspace: it uses `getImageNameForWorkspace(workspace)` and `getDockerfileForWorkspace(workspace)` from `problem-config.mjs`, so adding the workspace to `WORKSPACES` is enough.

---

## 4. LSP configuration summary

LSP is wired in three places:

| Layer | File | What to set |
|-------|------|-------------|
| **Container (inside image)** | `server/docker/lsp-proxy.js` | `getLSP(lang)` → which binary, args, env (PATH etc.). |
| **Container (image build)** | `server/docker/Dockerfile.*` | Install the LSP binary (e.g. clangd, bash-language-server) and copy `lsp-proxy.js`. |
| **Client** | `client/src/services/lspFileUri.ts` | `LSP_SUPPORTED`, `EXT_MAP`, `LSP_LANG_MAP` for file URI and LSP language id. |

The server only forwards WebSocket ↔ stdio; it does not list languages. The client asks for an LSP connection with `?language=<id>`; the container runs `node /workspace/lsp-proxy.js <id>`, which spawns the right LSP. So any new language that should have IntelliSense needs the three rows above.

---

## 5. Validation

- **Default:** Problems use `stdout_exact` (run code with test input, compare stdout). The command is built by **`getValidationCommand`** in `problem-config.mjs`.
- **Custom validation kinds** (e.g. `cuda_numeric`): implement in `server/src/services/verification-types/<name>.verification.js` and register in `server/src/services/verification-types/index.verification.js`. Problems (or individual tests) can then set `validation.kind` or use the `kind::id` prefix on test `id`.

---

## 6. Checklist: new language

- [ ] `problem-config.mjs`: `PROBLEM_LANGUAGES`, `C_LIKE_LANGUAGE_IDS` or `SHELL_LANGUAGE_IDS`, workspace’s `problemLanguages`, `DEFAULT_STARTER_CODE`, `getValidationCommand`
- [ ] `client/src/types/problem-config.d.ts`: language id in union types
- [ ] (Optional) LSP: `server/docker/lsp-proxy.js` + Dockerfile LSP install + `client/src/services/lspFileUri.ts`
- [ ] `server/src/data/problems/<lang>.json` + run sync/seeder
- [ ] (Optional) `server/src/config/execution.config.js`: `LANGUAGE_CONFIG`, `LANGUAGE_BY_PREFIX`

---

## 7. Checklist: new workspace

- [ ] `problem-config.mjs`: `WORKSPACES`, `CODE_EDITOR_THEME_SPECS` (if new theme), `PROBLEM_LANGUAGES[].workspace` for its languages
- [ ] `client/src/types/problem-config.d.ts`: workspace id in types
- [ ] `server/docker/Dockerfile.<name>` + image build + `lsp-proxy.js` and LSPs in image
- [ ] `client/src/assets/technologies.json`: new entry with `workspace` id

Once this is done, the server (container service, validation, problem API) and client (editor, problem list, technologies) will treat the new language or workspace as first-class.
