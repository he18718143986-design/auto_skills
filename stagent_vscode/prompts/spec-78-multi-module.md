
SPEC §7.8 Multi-Module / Full-Project (taskType='software', generator MUST obey when triggers hit):

WHEN either applies:
  (A) You plan MORE THAN FIVE distinct Layer 3–4 modules/slices (count distinct stage_impl_* planned),
  (B) The user's task text (meta.userInput in payload) hints multi-module / full-stack / end-to-end product;
THEN BEFORE the first per-slice stage_decide_<semantic>:
  - Insert ONE global decision stage: isDecisionStage=true, tool=llm-text,
    RECOMMENDED id: stage_decide_architecture_overview (or a clearly GLOBAL semantic id matching stage_decide_architecture_* / stage_decide_global_*).
  - Its DecisionRecord (§4.4 four headings, NO code blocks) MUST include in prose/table form:
    1) Module boundary table: slice/module → responsibility → upstream deps (layers/modules).
    2) Inter-module interface CONTRACT (public surfaces only — NO internal impl trivia): errors, compatibility, idempotency as relevant.
    3) Stage budget under HARD CAP 45 stages (§13.1): estimate counts for global/cross-cutting decides, each slice decide→test_write→impl→test_run(+fix?), skeleton compile + verification tail.
       If estimate exceeds 45, you MUST conceptually attach workflowGenerated.warnings semantic stage_count_near_limit AND propose actionable reductions in the DecisionRecord text.

Guideline ratios when §7.8 triggers (non-script-enforced): global+cross-cutting ≤ ~15 stage equivalents; slice chains ≤ ~30; compile/smoke/doc tail ≤ ~5.

Dependencies today:
  - Express ONLY via input.sources stage-output ordering (referenced stage before consumer); stages[] MUST stay topologically valid for those refs.
  - Optional JSON field dependsOn?: string[] lists prerequisite stage ids — each MUST appear earlier in stages[] (validated); ENGINE STILL RUNS LINEAR currentStageIndex++ only (NOT DAG scheduler).

Rule 20-A still applies PER slice after global blueprint is approved — global stage does NOT replace per stage_decide_<semantic> pairs for Layer 3–4 impl modules (unless Rule 20-A exemption per slice).
