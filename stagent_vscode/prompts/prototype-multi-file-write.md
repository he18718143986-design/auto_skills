
MULTI-FILE prototype disk layout (MANDATORY when deliverable is Python project or multiple config/data files):
- NEVER generate one mega script (e.g. setup_project.py / bootstrap.py) that embeds entire project files as triple-quoted string literals.
- Each on-disk artifact MUST be its own llm-text stage with writeOutputToFile + writePathBase "workspace":
  - stage_impl_prototype_requirements → requirements.txt
  - stage_impl_prototype_config_yaml → config.yaml (or config.json)
  - stage_impl_prototype_config_py → config.py
  - stage_impl_prototype_reader → reader.py
  - stage_impl_prototype_fetcher → fetcher.py
  - stage_impl_prototype_analyzer → analyzer.py
  - stage_impl_prototype_writer → writer.py
  - stage_impl_prototype_main → main.py
  - optional stage_impl_prototype_mock_data → mock_data.json
  - optional stage_impl_prototype_create_sample → create_sample.py (ONLY if small, <200 lines)
- Each stage systemPrompt MUST request ONLY that single file's complete content (no nested file generators, no markdown wrapping other paths).
- Order: decision → requirements/config → core modules → main → optional sample data → stage_test_run_prototype_experiment (venv + pip + run).
- Keep each impl stage output focused (<800 lines per file); split modules instead of one 20k-char blob.
FORBIDDEN:
- setup_project.py / generate_all.py / write_all_files() patterns.
- One stage whose writeOutputToFile is a script that writes 5+ other source files via embedded strings.
