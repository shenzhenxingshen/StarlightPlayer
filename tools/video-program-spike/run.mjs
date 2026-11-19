import { existsSync, mkdirSync, readFileSync, cpSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { analyzeDirectory } from './analyze.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const get = (key, fallback) => {
  const index = process.argv.indexOf(key);
  return index < 0 ? fallback : process.argv[index + 1];
};
const sim = args => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' }).trim();
const requestedDevice = get('--device', undefined);
const booted = Object.entries(JSON.parse(sim(['list', 'devices', 'available', '--json'])).devices)
  .filter(([runtime]) => runtime.includes('.iOS-')).flatMap(([, devices]) => devices)
  .filter(device => device.state === 'Booted');
const device = requestedDevice ?? (booted.length === 1 ? booted[0].udid : undefined);
if (!device) throw new Error('Boot an iOS Simulator; if several are booted, supply --device <UDID>');
const suite = get('--suite', 'quick');
const mode = get('--mode', 'composition');
const tap = get('--tap', 'on');
const lead = get('--lead', '0.35');
if (!['quick', 'boundaries', 'continuity', 'full'].includes(suite)) throw new Error('Invalid suite');
if (!['composition', 'original'].includes(mode)) throw new Error('Invalid mode');
if (mode === 'original' && suite !== 'quick') throw new Error('Original control supports --suite quick only');
if (!['on', 'off'].includes(tap)) throw new Error('Invalid tap mode');
if (!Number.isFinite(Number(lead)) || Number(lead) < 0.1 || Number(lead) > 2) throw new Error('Lead must be 0.1–2 seconds');
const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${mode}-${suite}-${tap}`;
const bundleID = 'org.starlight.video-program-spike';
const out = resolve(root, 'release/video-program-spike');
const destination = resolve(out, 'runs', id);
mkdirSync(destination, { recursive: true });
sim(['install', device, resolve(out, 'VideoProgramSpike.app')]);
const container = sim(['get_app_container', device, bundleID, 'data']);
const evidence = resolve(container, 'Documents', id);
const build = JSON.parse(readFileSync(resolve(out, 'build-evidence.json')));
writeFileSync(resolve(destination, 'run-context.json'), JSON.stringify({
  runID: id, device, suite, mode, tap, lead, build, startedAt: new Date().toISOString(),
}, null, 2));
console.log(sim(['launch', '--terminate-running-process', device, bundleID,
  '--suite', suite, '--mode', mode, '--run-id', id, '--tap', tap, '--lead', lead]));
console.log(`RUN_ID=${id}\nEVIDENCE=${destination}`);
const started = Date.now();
const timeout = suite === 'full' ? 3900000 : suite === 'boundaries' || suite === 'continuity' ? 420000 : 120000;
let lastScenario = '';
let lastAnnouncement = 0;
try {
  while (Date.now() - started < timeout) {
    const logPath = resolve(evidence, 'events.jsonl');
    if (existsSync(logPath) && Date.now() - lastAnnouncement > 15000) {
      const lines = readFileSync(logPath, 'utf8').trim().split('\n');
      // The last append may be incomplete while the app is writing.
      const tail = lines.slice(-4).map(line => { try { return JSON.parse(line); } catch { return {}; } });
      const scenario = tail.reverse().find(row => row.scenario)?.scenario;
      if (scenario && scenario !== lastScenario) {
        console.log(`Playing ${scenario}, elapsed ${Math.round((Date.now() - started) / 1000)}s`);
        lastScenario = scenario;
      }
      lastAnnouncement = Date.now();
    }
    const completed = resolve(evidence, 'complete.json');
    if (existsSync(completed)) {
      cpSync(evidence, destination, { recursive: true });
      const result = JSON.parse(readFileSync(completed));
      console.log(JSON.stringify(result, null, 2));
      sim(['io', device, 'screenshot', resolve(destination, 'completed.png')]);
      if (!result.success || !analyzeDirectory(destination).passed) process.exitCode = 1;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!existsSync(resolve(destination, 'complete.json'))) throw new Error('Timed out: retained partial evidence');
} finally {
  if (existsSync(evidence)) cpSync(evidence, destination, { recursive: true });
}
