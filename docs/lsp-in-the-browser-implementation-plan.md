# LSP in the Browser – Implementation Plan

## Static completions vs LSP (why we have both)

**What we have now (static completion files):**

- **CodeMirror** does not provide completion *content* by itself. It only provides the UI (popup, keyboard handling) and helpers like `completeFromList(list)`.
- **Our completion files** (e.g. `server/src/data/completions/awk_completions.json`) are the *source* of that list: keywords, builtins, variables. We fetch them via `GET /api/editor-completions/:language` and pass them to `completeFromList()`.
- So: **our JSON + API = the completions**. CodeMirror just displays them. No language server involved.

**What LSP would add:**

- **Semantic** completions (variables in scope, function signatures from real parsing).
- **Hover** docs (from the language server).
- **Go to definition** (e.g. Ctrl+Click).
- **Diagnostics** (squiggles, errors/warnings).
- Completions can be **context-aware** (e.g. after `str.` show string methods).

**Can we do both?**

Yes. Use **LSP when the WebSocket to the container’s LSP is connected**, and **keep static completions as fallback** when:

- The container isn’t ready yet.
- LSP isn’t running for that language.
- The user hasn’t started a run (no container).

So: LSP = “real” IntelliSense when available; static completions = instant, no-container-required list (keywords/builtins/variables). They complement each other.

---

## Architecture (target)

```
Browser
  CodeMirror
    ├── Static completions (current): fetchEditorCompletions → completeFromList  [always]
    └── LSP client (@codemirror/lsp-client)
          ↓ WebSocket
  Node (your backend or same Docker container)
    LSP WebSocket proxy (stdio ↔ WebSocket)
          ↓ stdio
  Language server process (bashls / clangd / rust-analyzer)
```

- One **LSP per language** (or one multi-language setup) inside the **same user container** you already use for runs.
- Backend (or a small proxy in the container) exposes a **WebSocket endpoint** that the browser connects to; the proxy talks to the LSP over stdio.

---

## Implementation Plan

### Phase 1: LSP WebSocket proxy (server / container)

**Goal:** Run an LSP in the container and expose it over WebSocket so the browser can talk to it.

1. **Choose LSP servers per language** (examples):
   - **Bash / Unix:** [bash-language-server](https://github.com/bash-lsp/bash-language-server)
   - **C / C++:** [clangd](https://clangd.llvm.org/)
   - **Rust:** [rust-analyzer](https://rust-analyzer.github.io/)
   - **CUDA:** clangd with CUDA headers (or custom config)
   - **Awk:** optional (e.g. generic or skip LSP and keep static only)

2. **Add LSP + WebSocket proxy to the container** (e.g. Dockerfile.systems / Dockerfile.gpu):
   - Install the LSP binaries (e.g. `bash-language-server`, `clangd`, `rust-analyzer`).
   - Add a small **Node (or Python) proxy** that:
     - Listens on a WebSocket (e.g. `ws://container:port/lsp`).
     - Spawns the right LSP process (stdio).
     - Forwards: Browser ↔ WebSocket ↔ stdio ↔ LSP.

3. **Expose WebSocket to the browser:**
   - Either the proxy runs **inside** the container and you already have a way to reach the container (e.g. you already proxy terminal WebSockets). Add another path like `ws://host/api/containers/:id/lsp` that proxies to the container’s LSP WebSocket.
   - Or run the proxy on your **Node backend** and have the backend start/attach to the user’s container and bridge WebSocket ↔ LSP stdio (more work, but one less thing in the container).

**Deliverable:** Browser can open a WebSocket to a URL that speaks LSP JSON-RPC with one language server (start with one language, e.g. bash).

---

### Phase 2: Browser LSP client (CodeMirror)

**Goal:** CodeMirror uses `@codemirror/lsp-client` and gets completions, hover, diagnostics, go-to-definition over that WebSocket.

1. **Add dependency:** `@codemirror/lsp-client`.

2. **Implement a WebSocket `Transport`:**
   - Create a small module (e.g. `client/src/services/lspTransport.ts`) that:
     - Takes a WebSocket URL (e.g. from your API: container-specific LSP endpoint).
     - Returns a `Promise<Transport>` that `@codemirror/lsp-client` expects (`send`, `subscribe`, `unsubscribe`), using the pattern from the [npm example](https://www.npmjs.com/package/@codemirror/lsp-client).

3. **Integrate in CodeEditorPane (or a wrapper):**
   - When the user has a **container and a language that has LSP**:
     - Resolve the LSP WebSocket URL for that container + language.
     - `await simpleWebSocketTransport(url)`.
     - Create `LSPClient` and connect the transport.
     - Add `client.plugin("file:///workspace/main.<ext>")` (or a virtual path the LSP expects) to CodeMirror’s extensions.
   - When the user **doesn’t** have a container or LSP isn’t available:
     - Don’t add the LSP plugin; keep only static completions (current behavior).

4. **Sync document with LSP:**
   - On `onChange`, send `textDocument/didChange` (the lsp-client usually handles this when you use its plugin with the same document). Ensure the virtual file URI and language match what the LSP server expects.

5. **Keep static completions as fallback:**
   - When LSP is active, you can either:
     - Rely on LSP for completions only and remove `autocompletion({ override: [completeFromList(...)] })` for that session, or
     - Merge both: use LSP as primary and add static completions as an extra source so that even if LSP is slow or misses something, keywords/builtins still show. (Simplest: keep current static completion extension always; LSP will add its own completion source.)

**Deliverable:** In the editor, when a container is running and LSP is connected, you get LSP-driven completions, hover, diagnostics, and go-to-definition; when not, you still get static completions only.

---

### Phase 3: Multi-language and lifecycle

**Goal:** Support multiple languages and clean lifecycle (connect when container is ready, disconnect when container is torn down).

1. **Map language → LSP server and port/path:**
   - e.g. `bash` → bash-language-server, `c`/`cpp` → clangd, `rust` → rust-analyzer.
   - Store in config (e.g. `problem-config.mjs` or server config) so the backend knows which LSP to start for which language.

2. **Container lifecycle:**
   - When a container is created for a run (or for “editor only”), start the appropriate LSP process in the container (or attach to an existing one).
   - Expose one WebSocket URL per (container, language) or a single URL that the backend routes to the right LSP.

3. **Editor lifecycle:**
   - When `language` or `containerId` changes, disconnect previous LSP (if any), connect new WebSocket if the new language has LSP and container is ready.
   - On container destroy, close WebSocket and don’t add LSP plugin until next container.

4. **Optional: “LSP only when running” vs “LSP when container is ready”:**
   - You can start the container (and LSP) when the user opens the editor, or only when they click Run. Trade-off: faster IntelliSense vs. fewer idle containers.

**Deliverable:** Switching language or container correctly connects/disconnects LSP; static completions still work when LSP is unavailable.

---

### Phase 4: Polish and robustness

- **Reconnect:** If the WebSocket drops, optionally reconnect and re-open the document.
- **Timeouts:** If LSP doesn’t respond in N seconds, fall back to static-only (no blocking).
- **Errors:** If LSP crashes or returns errors, don’t break the editor; keep static completions and optionally show a “LSP unavailable” hint.
- **Docs:** Document which languages have LSP and how to add new ones (install in container + wire in backend + client).

---

## Summary

| Piece              | Purpose |
|--------------------|--------|
| **Completion JSON + API** | Static list (keywords, builtins, variables); works with no container; CodeMirror shows them via `completeFromList`. |
| **LSP in container**      | Real IntelliSense (semantic completions, hover, go-to-definition, diagnostics). |
| **Both together**         | LSP when connected; static completions as fallback and for languages without LSP. |

**Suggested order:** Implement Phase 1 (proxy + one LSP, e.g. bash) and Phase 2 (client + Transport + plugin in CodeEditorPane) first. Then add more languages and lifecycle (Phase 3) and finally polish (Phase 4).
