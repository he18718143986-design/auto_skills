
INFRA (workspace / Python — mandatory when code-runner runs .py, pytest, or pip installs):
- pathBase MUST be "workspace", workingDir "." (task folder root).
- ALWAYS use python3; NEVER bare `python` or bare `pip`.
- Before the first pip install in the workflow, create a project-local venv: python3 -m venv .venv
- Install deps ONLY via: .venv/bin/python -m pip install ...  (e.g. .venv/bin/python -m pip install -r requirements.txt)
- Run scripts/tests ONLY via: .venv/bin/python <script.py>  or  .venv/bin/pytest ...
- VENV SETUP (split into 3 separate code-runner stages — do NOT chain venv+pip+import in one command when requirements.txt exists):
  1) stage_venv_create: `python3 -m venv .venv` (engine default 60s)
  2) stage_venv_pip_install: `.venv/bin/python -m pip install -r requirements.txt` — set toolConfig.timeout >= 600 when requirements include native/heavy packages (TA-Lib, scipy, ctpbee, pandas, akshare, …); engine floor is 300s without explicit timeout
  3) stage_venv_import_check: `.venv/bin/python -c "import <heavy deps>; print('Environment ready')"` (engine auto 90s for pandas/numpy cold import)
- After venv exists, test_run / smoke stages MAY chain pip + run in one command for short scripts only.
- FORBIDDEN: `pip install -r requirements.txt && python script.py` (pip/python interpreter mismatch on macOS/Linux).
- FORBIDDEN: `pip install` without `python3 -m venv .venv` when requirements.txt or third-party imports exist.
- FORBIDDEN: one stage chaining `python3 -m venv .venv && pip install && import check` when pip install may exceed 300s (split per VENV SETUP above).
- TIMEOUT: DO NOT set toolConfig.timeout on routine code-runner stages (npm init, npm test, tsc, pytest, venv create, import-only checks). The engine resolves timeouts: default 60s; npm/pip/yarn/pnpm install auto 300s; heavy pandas/numpy cold-import `-c` checks auto 90s. When stagent.sandbox.enabled, install commands auto-allow network. Use explicit timeout >300 only on stage_venv_pip_install (or equivalent) for heavy dependency sets.
