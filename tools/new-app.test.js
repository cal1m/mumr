// tools/new-app.js and tools/run.js: a new app is a copy of the template with the name filled in, and it works.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { create, nextPacketType, kebab } = require('./new-app.js');
const { apps } = require('./run.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mumr-newapp-'));

test('names: PascalCase becomes the folder name; bad names are refused', () => {
  assert.strictEqual(kebab('MyApp'), 'my-app');
  assert.strictEqual(kebab('Cube2'), 'cube2');
  const dir = tmp();
  for (const bad of ['', '1abc', 'my app', 'a/b', undefined]) assert.throws(() => create(bad, { apps: dir }), /letters and digits/);
});

test('a new app: the template with the name filled in, the list line, no clash with an existing one', () => {
  const dir = tmp(), list = path.join(dir, 'APPS.md');
  const r = create('MyApp', { apps: dir, list, viewer: true });
  assert.strictEqual(r.id, 'my-app');
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'my-app', 'mumr.json'), 'utf8'));
  assert.strictEqual(json.title, 'MUMR my app');
  assert.ok(fs.readFileSync(path.join(dir, 'my-app', 'app.js'), 'utf8').includes("'mumr.my-app.anchor'"));
  for (const f of fs.readdirSync(path.join(dir, 'my-app'))) assert.ok(!/__id__|_template|MUMR template/.test(fs.readFileSync(path.join(dir, 'my-app', f), 'utf8')), `${f} still has a placeholder`);
  for (const f of ['view.html', 'view.js', 'logic.js', 'app.test.js', 'index.html']) assert.ok(fs.existsSync(path.join(dir, 'my-app', f)), f);
  assert.ok(fs.readFileSync(list, 'utf8').includes('**my-app**'));
  assert.throws(() => create('MyApp', { apps: dir }), /exists/);
});

test('the next packet type is the first one above 16 that no app uses', () => {
  const dir = tmp();
  assert.strictEqual(nextPacketType(dir), 16);
  fs.mkdirSync(path.join(dir, 'a')); fs.writeFileSync(path.join(dir, 'a', 'mumr.json'), JSON.stringify({ owned: { 16: 'x', 17: 'y' } }));
  assert.strictEqual(nextPacketType(dir), 18);
});

test('run.js lists the apps that have a mumr.json', () => {
  const list = apps();
  assert.ok(list.includes('cube') && list.includes('_template'));
});
