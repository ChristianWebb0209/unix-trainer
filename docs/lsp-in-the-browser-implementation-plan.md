# LSP in the Browser – Implementation Plan

## IntelliSense: LSP only (static completions removed)

**Current approach:**

- **Static completion files and the editor-completions API have been removed.** Completions, hover, diagnostics, and go-to-definition are provided **only** by the Language Server Protocol (LSP).
- The editor uses **`@codemirror/lsp-client`** and connects to an LSP running inside the user’s container via a WebSocket bridge. When the container is ready and the LSP has started, the user gets full IntelliSense (semantic completions, hover, diagnostics, go-to-definition).
- **There is no fallback list:** if the container isn’t ready or LSP isn’t connected yet, the user simply waits a moment for the LSP to load. No static keyword/builtin list is shown in the meantime.

**What LSP provides:**

- **Semantic** completions (variables in scope, function signatures from real parsing).
- **Hover** docs (from the language server).
- **Go to definition** (e.g. Ctrl+Click).
- **Diagnostics** (squiggles, errors/warnings).
- **Context-aware** completions (e.g. after `str.` show string methods).

---

## Architecture (implemented)

```
Browser
  CodeMirror
    └── LSP client (@codemirror/lsp-client)
          ↓ WebSocket  ws://host/api/containers/:id/lsp?language=…
  Node backend
    LSP WebSocket handler (stdio ↔ WebSocket via docker exec)
          ↓ docker exec -i … node /workspace/lsp-proxy.js <language>
  Container
    LSP process (bash-language-server / clangd / rust-analyzer)
```

- One **LSP per (container, language)**. The backend runs `lsp-proxy.js` inside the container via `docker exec` and bridges the exec stdio stream to the browser WebSocket.
- Docker images (systems / gpu) include the LSPs and `lsp-proxy.js`; the backend does not run LSPs on the host.

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
     - Don’t add the LSP plugin; the user has no IntelliSense until a container is ready and LSP connects (they may see a short load delay).

4. **Sync document with LSP:**
   - The lsp-client plugin syncs the document (didOpen/didChange) when bound to the editor; the virtual file URI is `file:///workspace/main.<ext>` and the language ID matches the LSP server.

**Deliverable:** In the editor, when a container is running and LSP is connected, you get LSP-driven completions, hover, diagnostics, and go-to-definition; when not, there is no completion fallback—users wait for LSP to load.

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

**Deliverable:** Switching language or container correctly connects/disconnects LSP; when LSP is unavailable, no completions are shown until it connects.

---

### Phase 4: Polish and robustness

- **Reconnect:** If the WebSocket drops, optionally reconnect and re-open the document.
- **Timeouts:** If LSP doesn’t respond in N seconds, don’t block the editor; optionally show “LSP connecting…” or “LSP unavailable”.
- **Errors:** If LSP crashes or returns errors, don’t break the editor; optionally show a “LSP unavailable” hint.
- **Docs:** Document which languages have LSP and how to add new ones (install in container + wire in backend + client).

---

## Summary

| Piece                 | Purpose |
|-----------------------|--------|
| **LSP in container**  | Only source of IntelliSense (completions, hover, go-to-definition, diagnostics). No static completion files. |
| **WebSocket bridge**  | Backend bridges browser ↔ container LSP stdio via `docker exec` and `lsp-proxy.js`. |

**Status:** Phases 1–3 are implemented (LSP proxy in containers, backend WebSocket, client `@codemirror/lsp-client` and lifecycle). Phase 4 (reconnect, timeouts, “LSP unavailable” hints) can be added as polish.
