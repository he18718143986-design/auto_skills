#!/usr/bin/env node
import { listTestFiles, runTestFiles } from './test-runner-lib.mjs';

const coverage = process.argv.includes('--coverage');
const files = await listTestFiles({ mode: 'all' });
process.exit(runTestFiles(files, { coverage, label: 'test:all' }));
