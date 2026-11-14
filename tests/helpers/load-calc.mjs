// app.js の計算部分 (UIより前の定義群) を Node の vm で読み込むテスト用ハーネス。
// ブラウザ専用APIは最小のスタブで置き換える。計算関数はDOMに触れないため、
// これで現行の計算結果をそのまま再現できる。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadCalc({ withTables = false } = {}) {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.console = console;
  sandbox.localStorage = {
    _m: new Map(),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); },
    removeItem(k) { this._m.delete(k); }
  };
  sandbox.document = {
    getElementById() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement() { return { style: {} }; }
  };
  sandbox.navigator = { userAgent: 'node-test', onLine: true };
  sandbox.indexedDB = { open() { return {}; } };
  vm.createContext(sandbox);

  if (withTables) {
    const tables = readFileSync(join(root, 'tax-tables.js'), 'utf8');
    vm.runInContext(tables, sandbox, { filename: 'tax-tables.js' });
  }

  const src = readFileSync(join(root, 'app.js'), 'utf8');
  const cut = src.indexOf('\nfunction showMessage(');
  if (cut < 0) throw new Error('app.js の計算部分の終端 (showMessage) が見つからない');
  const slice = src.slice(0, cut);
  const exportsCode = `
;globalThis.__calc = {
  salaryDeduction, basicDeduction, dependentIncomeLimit, dependentBreakdown,
  dependentDeduction, residentDependentDeduction, residentBasicDeduction,
  residentSalaryDeduction, lifeDeduction, calcLife, earthquakeDeduction,
  incomeTaxRate, forecastSalaryBonus, forecast,
  __setManual(year, obj) { state.manual[String(year)] = obj; },
  __setDocuments(docs) { state.documents = docs; },
  __reset() { state.manual = {}; state.documents = []; }
};`;
  vm.runInContext(slice + exportsCode, sandbox, { filename: 'app.js' });
  return sandbox.__calc;
}

// 決定的な比較用にキーをソートして文字列化する (undefined は JSON 仕様どおり落ちる)
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'undefined';
}
