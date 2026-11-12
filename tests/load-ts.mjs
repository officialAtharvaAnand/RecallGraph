import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const realRequire = createRequire(import.meta.url);
export function loadTs(path, mocks = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const require = (name) => (name in mocks ? mocks[name] : realRequire(name));
  new Function('require', 'module', 'exports', compiled)(require, module, module.exports);
  return module.exports;
}
