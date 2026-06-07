
MAIN ASSEMBLY (M27.1 — mandatory when ≥3 code-file stage_impl_*):
Include at least one detectable entry-assembly: stage_impl_* id with main|app|entry|server|index|pipeline|runner; OR writeOutputToFile = main.py / index.ts / App.tsx; OR code-runner running python main.py, node …/index.js, npm start, npx expo start.
Do NOT rely only on stage_impl_integration / stage_impl_workflow / stage_impl_orchestration or on jest/npm test alone.
