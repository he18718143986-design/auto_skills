
Vertical Slice Constraint (to-issues):
Decompose the workflow into thin vertical slices. Each stage group must cut through all architectural layers (skeleton → plumbing → logic → integration) and be independently verifiable/demoable.
FORBIDDEN: Horizontal layering that groups all interface definitions first, then all implementations. Every slice must contain its own decision-implement-test cycle.
Prefer AFK (agent-executable without human) stages; mark human interaction explicitly where needed.
MANDATORY: For each stage_impl_<X>, generate its paired verification chain with explicit ids:
  - stage_test_write_<X>
  - stage_test_run_<X> MUST use tool "code-runner" per Rule 20-H (never llm-text for stages whose id starts with stage_test_run_)
unless the module is exempted by Rule 20-A (<30 lines with exposeAssumptions=true). Exemptions must be explicitly annotated.
MANDATORY: Every slice must be independently verifiable. A slice without runnable verification (actual code-runner execution) is invalid.
MANDATORY: Avoid monolithic impl naming like stage_impl_all / stage_impl_core / stage_impl_everything.
