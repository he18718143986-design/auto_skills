
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
- REQUIREMENTS VERSION (HARD): requirements.txt MUST NOT invent major versions. Known PyPI ceilings: **ctpbee** current line is 1.7.x only — use `ctpbee` or `ctpbee>=1.7.3,<2`; FORBIDDEN `ctpbee>=8` or any 8.x. When unsure, list package name only (no version pin). Engine auto-fixes/clamps known hallucinations at write + before pip install.
- THIRD-PARTY API SYMBOLS (HARD): Do NOT invent class/function names for PyPI packages. DecisionRecord 技术选型 MUST state **package@version + verified entry symbol** (e.g. ctpbee 1.7.x → `from ctpbee import CtpBee`; FORBIDDEN `MdApi`, `create_md_api`). venv import_check MUST use verified symbols, not only `import numpy`.
- FLAT LAYOUT (HARD): When impl `.py` files sit at workspace root and tests live under `tests/`, plan MUST include `conftest.py` at root (`sys.path.insert` project root) OR document PYTHONPATH=.; engine may auto-inject conftest.
