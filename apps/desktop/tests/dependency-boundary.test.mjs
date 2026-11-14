import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

test('desktop TypeScript graph never imports mobile native modules, even through types', () => {
  const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const configPath = resolve(desktop, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, desktop);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const files = program.getSourceFiles().map(file => file.fileName.replaceAll('\\', '/'));
  assert(!files.some(file => /\/src\/utils\/storage\.ts$/.test(file)),
    'Desktop must not traverse the MMKV-backed mobile storage implementation');
  assert(!files.some(file => /\/node_modules\/react-native(?:-|\/)/.test(file)),
    'Desktop must build with only its own dependencies installed');
});
