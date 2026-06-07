
EXCEL / sample-data alignment (MANDATORY when workflow uses create_sample.py + Excel + stage_test_run_*):
1) Pick ONE canonical relative path for the sample/working Excel file (default: input.xlsx). Record it in the decision record and reuse everywhere — do NOT mix sample_input.xlsx / input.xlsx / data/input.xlsx across stages.
2) stage_impl_prototype_create_sample (create_sample.py) MUST write exactly that path (e.g. wb.save("input.xlsx")).
3) config template (config.yaml / config.yaml.template) input.file MUST be the same path; monitor.py / main entry MUST read via config (no hard-coded alternate filename).
4) Canonical Excel header columns (English identifiers, one set for whole project): ASIN, SKU, TargetPrice, Stock — unless decision record explicitly defines aliases; then create_sample, config columns.*, reader.py, monitor.py, and EVERY stage_test_run_* command MUST use the same names/mapping.
5) FORBIDDEN: create_sample with Chinese headers (目标价/库存) while monitor.py validates TargetPrice/Stock; FORBIDDEN: reader_check code-runner hard-codes sample_input.xlsx while integration runs monitor against input.xlsx.
6) stage_test_run_prototype_create_sample_run must run create_sample.py; subsequent stage_test_run_* that read Excel MUST reference the same file path as step 1 (e.g. load_excel('input.xlsx', ...) or monitor with config pointing to input.xlsx).
7) Integration stage_test_run_* MUST run the real entry script (monitor.py/main.py) with mode:mock (or cp config template with mode: mock + matching input.file) — not a one-off python -c that uses different paths/columns than the integration command.
8) In workflow JSON, add a short stage description or constant comment listing FIXTURE_EXCEL=input.xlsx and FIXTURE_COLUMNS=ASIN,SKU,TargetPrice,Stock so all impl/test stages stay aligned.
