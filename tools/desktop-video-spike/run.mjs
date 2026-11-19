import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from './prepare.mjs';
import { analyze } from './analyze.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(root, 'release/desktop-video-spike');
const suite = process.argv[2] || 'quick';
if (!['quick', 'boundaries'].includes(suite)) throw new Error('Use quick or boundaries');
const binary = resolve(out, 'StarlightVideoPrototype.app/Contents/MacOS/StarlightVideoPrototype');
const evidence = JSON.parse(readFileSync(resolve(out, 'build-evidence.json'), 'utf8'));
for (const [path, expected] of Object.entries(evidence.inputs)) {
  if (hash(resolve(root, path)) !== expected) throw new Error(`Rebuild changed source: ${path}`);
}
if (hash(binary) !== evidence.executableSHA256) throw new Error('Binary no longer matches build evidence');
mkdirSync(resolve(out, 'runs'), { recursive: true });
const directory = resolve(out, 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-${suite}`);
mkdirSync(directory, { recursive: false });
writeFileSync(resolve(directory, 'run-context.json'), JSON.stringify({ suite, evidence,
  testInputs: Object.fromEntries(['run.mjs', 'analyze.mjs'].map(f =>
    [f, hash(resolve(root, 'tools/desktop-video-spike', f))])),
}, null, 2));
const child = spawn(binary, ['--suite', suite, '--output', directory], { stdio: 'inherit' });
let timedOut = false;
const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, suite === 'boundaries' ? 330_000 : 90_000);
const code = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (status, signal) => resolve({ status, signal }));
}).finally(() => clearTimeout(timer));
const runs = readdirSync(directory, { withFileTypes: true }).filter(f => f.isDirectory());
if (timedOut || code.status !== 0 || runs.length !== 1) throw new Error(`Invalid test exit: ${JSON.stringify(code)}`);
const run = resolve(directory, runs[0].name);
const rows = readFileSync(resolve(run, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const result = analyze(rows);
result.eventsSHA256 = hash(resolve(run, 'events.jsonl'));
writeFileSync(resolve(directory, 'analysis.json'), JSON.stringify(result, null, 2));
console.log(directory, JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
