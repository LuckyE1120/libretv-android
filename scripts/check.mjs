import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
assert.equal(config.identifier, 'io.github.luckye1120.libretv');
assert.equal(config.app.withGlobalTauri, true, 'The upstream HTTP bridge needs the global Tauri API');
assert.ok(existsSync('LICENSE'));
let checked = 0;
for (const name of readdirSync('public').filter(x => x.endsWith('.html'))) {
  const file = resolve('public', name);
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g)) {
    const url = match[1].split(/[?#]/)[0];
    if (!url || /^(?:[a-z]+:|\/\/|#)/i.test(url)) continue;
    const asset = url.startsWith('/') ? resolve('public', `.${url}`) : resolve(dirname(file), url);
    assert.ok(existsSync(asset), `${name}: missing ${url}`);
    checked++;
  }
}
for (const name of readdirSync('public/js').filter(x => x.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', `public/js/${name}`], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${name}: ${result.stderr}`);
}
console.log(`Checked Android identity, Tauri bridge, JS syntax and ${checked} local frontend assets.`);
