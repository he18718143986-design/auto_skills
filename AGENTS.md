# AGENTS.md

## Cursor Cloud specific instructions

### Monorepo layout

This repository has **no root `package.json`**. Install dependencies in each runnable package separately:

| Package | Path | Role |
|---------|------|------|
| **autoAI** | `autoAI/` | Electron desktop app (multi-AI chat + Stagent UI) |
| **Stagent VS Code extension** | `stagent_vscode/` | VS Code/Cursor workflow extension |
| **Skills / docs** | `skills-main-lastest/`, `stagent_docs/` | Markdown only — no install or build |

### Dependency refresh (VM startup)

See the Cloud Agent update script (runs `npm install` in `autoAI/`, `npm ci` in `stagent_vscode/`).

### autoAI (primary runnable app)

Standard commands are in `autoAI/README.md` and `autoAI/package.json`:

- **Dev:** `npm run dev` (runs `build:core` via `predev`, then `electron-vite dev`)
- **Unit tests:** `npm test` (Vitest; 192 tests)
- **E2E:** `npm run test:e2e` (build + Playwright + Electron; uses in-process mock AI servers — no real API keys)
- **Lint:** `npm run lint` (warnings only on current HEAD)

**Cloud VM / headless notes:**

- Use **`xvfb-run -a`** for GUI dev or E2E when no display is available:  
  `cd autoAI && xvfb-run -a npm run dev`
- autoAI enforces **single-instance** lock; stop a running dev/Electron process before launching another (Playwright E2E or a second `npm run dev` will quit if one is already running).
- The local OpenAI-compatible **Adapter** starts with the main process on **`http://127.0.0.1:8787`** (`/health`, `/v1/models`). Disable with `AUTOAI_ADAPTER_ENABLE=0`.
- Playwright E2E launches the **production build** at `out/main/index.js` (not the Vite dev server).

### stagent_vscode

Standard commands are in `stagent_vscode/package.json` and CI workflows under `stagent_vscode/.github/workflows/`:

- **Full verify (CI):** `npm run verify:all`
- **Tests:** `npm test` (= `test:unit` + `test:integration`; uses in-process VS Code API stub — no real VS Code required)
- **Lint:** `npm run lint` (6 `no-require-imports` errors in webview runtime on current HEAD; many unused-var warnings)
- **Compile + webview:** `npm run compile`

**Known caveat on current HEAD:** `src/webview/runtime/instanceScopedReset.ts` is listed in `tsconfig.json` `exclude` (`src/webview/runtime/**`), so it is not emitted to `out/`. One integration test (`webview-instance-resume.test.ts`) fails with `MODULE_NOT_FOUND` until that exclude is fixed or the file is built another way. **1171/1172** tests pass otherwise.

Manual extension debugging (F5) is documented in `stagent_vscode/scripts/compile-for-vscode.sh` and `.vscode/launch.json` — not needed for `npm test`.

### Node.js version

CI uses **Node 20**; Cloud VMs may ship **Node 22** — both work for install, test, and dev on current HEAD.
