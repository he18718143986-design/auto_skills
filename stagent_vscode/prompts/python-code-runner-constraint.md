
INFRA (workspace / Python — mandatory when code-runner runs .py, pytest, or pip installs):
- pathBase MUST be "workspace", workingDir "." (task folder root).
- ALWAYS use python3; NEVER bare `python` or bare `pip`.
- Before the first pip install in the workflow, create a project-local venv: python3 -m venv .venv
- Install deps ONLY via: .venv/bin/python -m pip install ...  (e.g. .venv/bin/python -m pip install -r requirements.txt)
- Run scripts/tests ONLY via: .venv/bin/python <script.py>  or  .venv/bin/pytest ...
- Prefer ONE chained code-runner command per verification stage, e.g.:
  python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt && .venv/bin/python mock_pipeline.py
- FORBIDDEN: `pip install -r requirements.txt && python script.py` (pip/python interpreter mismatch on macOS/Linux).
- FORBIDDEN: `pip install` without `python3 -m venv .venv` when requirements.txt or third-party imports exist.
- TIMEOUT: DO NOT set toolConfig.timeout on routine code-runner stages (npm init, npm test, tsc, pytest). The engine resolves timeouts: default 60s; npm/pip/yarn/pnpm install auto 300s; heavy pandas/numpy cold-import `-c` checks auto 90s. When stagent.sandbox.enabled, install commands auto-allow network.
- COLD-START (recommended): venv+pip install chained commands SHOULD END with a warm-import of heavy deps, e.g.: `... && .venv/bin/python -m pip install -r requirements.txt && .venv/bin/python -c "import pandas, numpy, openpyxl"` — only set toolConfig.timeout if you need >300s for an unusually large install.
