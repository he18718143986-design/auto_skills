
TEST INFRASTRUCTURE BEFORE test_run (M39.1 — HARD when Jest/TS verification is in the plan):

SCOPE — this block applies when ANY of:
  (a) a stage id matches /^stage_test_run_/ with tool "code-runner" and command matching jest / npm test / npx jest / vitest; OR
  (b) ≥1 stage_impl_* uses writeOutputToFile ending in .ts / .tsx / .jsx AND the workflow includes Jest-style verification.

ORDER (HARD): In stages[] array order, configuration impl stages MUST appear BEFORE the first qualifying test_run stage:
  1) stage_impl_<semantic>_jest_config (recommended id: stage_impl_jest_config) with writeOutputToFile set to jest.config.js (or .ts / .cjs / .mjs) under the directory where tests will execute.
  2) Expo / React Native / jest-expo stacks (expo, react-native, jest-expo, App.tsx, npx expo in userInput or stages): ALSO stage_impl_<semantic>_babel_config (recommended: stage_impl_babel_config) with writeOutputToFile: babel.config.js (babel-preset-expo or equivalent) in the SAME directory.
  3) Non-Expo TypeScript projects: at least ONE of jest.config.*, babel.config.*, or tsconfig.json in that directory before the first test_run; prefer jest.config.* + tsconfig.json when tests import .ts sources.

STAGE SHAPE (RECOMMENDED):
  - tool: llm-text; toolConfig.writeOutputToFile = exact relative path; writePathBase: "workspace"
  - systemPrompt MUST request ONLY the config file body (valid JS/JSON, no markdown code fences wrapping the file)
  - Follow Rule 20-D-SCAFFOLD when config is global: exposeAssumptions OR input.sources from stage_decide_architecture_overview decisionRecord
  - stage id SHOULD contain jest / babel / test_config so the engine can detect infrastructure (see PlanCompletenessGate).

PATH / workingDir (HARD):
  - Place jest.config.* and babel.config.* in the SAME directory as the first stage_test_run_* will use (parse "cd <dir> &&" from the test command, or co-locate with package.json / App.tsx / mobile/ root).
  - Monorepo: each package with its own stage_test_run_* (e.g. apps/mobile, packages/client) needs its own jest/babel config stages immediately BEFORE that package's test_run — not only at repository root.

FORBIDDEN (generation blocked — plan_incomplete: missing-test-infrastructure):
  - Only feature impl stages + a final stage_test_run_* with no prior jest/babel/tsconfig writeOutputToFile stages.
  - Batching ALL stage_test_run_* before ANY jest/babel config impl (horizontal test-first plans without configs).
  - jest.config.js at repo root while stage_test_run uses "cd apps/mobile && npm test" without mobile/jest.config.js.

NOTE: Satisfying this block fixes PLAN STRUCTURE only. Config file correctness is still validated at test_run time (M38.1 preflight) after those impl stages execute and write to disk.
