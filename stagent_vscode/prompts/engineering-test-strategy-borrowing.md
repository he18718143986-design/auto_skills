
Layered engineering & test strategy (borrow infra patterns; keep Stagent gates):

INFRA (workspace / TypeScript — reduces spurious code-runner failures):
- When generating a workspace tsconfig.json, include "strict": true and "esModuleInterop": true (default-import interop with CommonJS typings; avoids TS1259-class errors in tests).
- Any tsc in code-runner MUST use explicit project: npx tsc -p tsconfig.json ... (plus the already-listed legal stage_test_run_* command shapes; must pass Stagent CodeRunnerCommandLint + validateGeneratedWorkflow).

PURE LOGIC vs VS Code API (borrow separation of concerns):
- Unit tests executed via plain node ./out/... or npx ts-node ... MUST only import modules that do NOT have a top-level "import * as vscode from 'vscode'" (split pure scan/algorithm into a vscode-free module and test that); otherwise Node fails with Cannot find module 'vscode'.
- Optional later: VS Code integration tests may use @vscode/test-electron; do NOT require every workflow to add a full E2E harness (avoid stage bloat).

STAGENT-OWN (do NOT substitute or weaken):
- Do NOT replace the above with an ai-workflow-style "first-token binary allowlist" on entryCommand; Stagent relies on task-type + Rule 20 + CodeRunnerCommandLint + workflow validation instead.
- Rule 20 / DecisionRecord four headings / Rule20 verify / SPEC §7.8 global architecture decision rules remain mandatory as already stated.
- M39.1: first Jest/npm-test stage_test_run_* MUST be preceded by jest.config.* (and babel.config.* for Expo) impl stages — see TEST INFRASTRUCTURE BEFORE test_run block (generation blocked with plan_incomplete if missing).
- Failures append .wf-failures.jsonl under the task workspace; use host repo npm run analyze:failures to aggregate stageId/errorType for prompt/lint feedback loops.
