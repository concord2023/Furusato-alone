// 計算の特性テスト (ゴールデンテスト)。
// golden-calc.json は税率テーブル切り出し「前」の現行コードから採取した出力。
// 切り出し後も全ケースが完全一致することを保証する。
// 実行: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCalc, canonical } from './helpers/load-calc.mjs';
import { buildCases } from './helpers/fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, 'golden-calc.json'), 'utf8'));

test('計算結果がゴールデンと完全一致する', () => {
  const calc = loadCalc({ withTables: true });
  const cases = buildCases(calc);
  for (const [name, expected] of Object.entries(golden)) {
    assert.ok(name in cases, `ケース ${name} がフィクスチャに無い`);
    assert.equal(canonical(cases[name]), expected, `ケース ${name} の計算結果が変わっている`);
  }
});
