// 整合性テスト: 「存在しないファイルを参照して壊れる」事故の再発防止。
// 実行: node --test
// (依存パッケージ不要。Node 18+ の標準機能だけを使う)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlFiles = readdirSync(root).filter((f) => f.endsWith('.html'));
const jsFiles = readdirSync(root).filter((f) => f.endsWith('.js'));

const isLocalStaticRef = (v) =>
  v && !/^(https?:|#|data:|mailto:|javascript:)/.test(v) && !v.startsWith('/') && !/['+]/.test(v);

test('HTMLのsrc/hrefが指すファイルがすべて存在する', () => {
  const missing = [];
  for (const f of htmlFiles) {
    const html = readFileSync(join(root, f), 'utf8');
    for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const v = m[1].split(/[?#]/)[0].replace(/^\.\//, '');
      if (isLocalStaticRef(v) && !existsSync(join(root, v))) missing.push(`${f} -> ${v}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('Service Workerのキャッシュ対象がすべて存在する', () => {
  const sw = readFileSync(join(root, 'service-worker.js'), 'utf8');
  const missing = [];
  for (const name of ['STATIC_ASSETS', 'NETWORK_FIRST']) {
    const block = sw.match(new RegExp(`${name}=\\[([^\\]]*)\\]`));
    assert.ok(block, `${name} の定義が見つからない`);
    for (const m of block[1].matchAll(/'([^']+)'/g)) {
      const v = m[1].replace(/^\.\//, '');
      if (v && !existsSync(join(root, v))) missing.push(`${name}: ${v}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('HTMLが使う Furusato* グローバルがどこかのJSで定義されている', () => {
  const defined = new Set();
  for (const f of jsFiles) {
    const js = readFileSync(join(root, f), 'utf8');
    for (const m of js.matchAll(/window\.(Furusato\w+)\s*=/g)) defined.add(m[1]);
  }
  const missing = [];
  for (const f of htmlFiles) {
    const html = readFileSync(join(root, f), 'utf8');
    for (const m of html.matchAll(/(Furusato[A-Z]\w*)/g)) {
      if (!defined.has(m[1])) missing.push(`${f} -> ${m[1]}`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('manifest.jsonが正しく、start_urlとアイコンが存在する', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const start = manifest.start_url.replace(/^\.\//, '');
  assert.ok(existsSync(join(root, start)), `start_url ${start} が無い`);
  for (const icon of manifest.icons || []) {
    const src = icon.src.replace(/^\.\//, '');
    assert.ok(existsSync(join(root, src)), `icon ${src} が無い`);
  }
});
