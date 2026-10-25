// Make a new app from apps/_template.
//   node tools/new-app.js MyApp [--viewer]
// Makes apps/my-app/ (a copy of the template with the name filled in) and adds a line to APPS.md. --viewer adds the PC view page
// (view.html, view.js from tools/viewer/): a watcher of the world, for a PC next to the headsets.
// Prints the packet type to use if the app gets a body of its own (the next one that no app's mumr.json `owned` uses).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..'), APPS = path.join(ROOT, 'apps'), TEMPLATE = path.join(APPS, '_template');
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const words = (name) => { const w = kebab(name).replace(/-/g, ' '); return w[0].toUpperCase() + w.slice(1); };

function nextPacketType(apps = APPS) {
  const used = new Set([2, 4]);                                         // (the engine's)
  for (const d of fs.readdirSync(apps)) {
    const f = path.join(apps, d, 'mumr.json');
    if (fs.existsSync(f)) for (const t of Object.keys(JSON.parse(fs.readFileSync(f, 'utf8')).owned || {})) used.add(Number(t));
  }
  let t = 16;
  while (used.has(t)) t++;
  return t;
}

function create(name, opts = {}) {
  const apps = opts.apps || APPS, template = opts.template || TEMPLATE;
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name || '')) throw new Error('The name is letters and digits, starting with a letter: MyApp');
  const id = kebab(name), title = words(name), dir = path.join(apps, id);
  if (fs.existsSync(dir)) throw new Error(`apps/${id} exists`);
  fs.mkdirSync(dir);
  const fill = (text) => text.replace(/MUMR template/g, `MUMR ${title.toLowerCase()}`).replace(/__id__/g, id).replace(/_template/g, id);
  for (const f of fs.readdirSync(template)) fs.writeFileSync(path.join(dir, f), fill(fs.readFileSync(path.join(template, f), 'utf8')));
  if (opts.viewer) {
    const v = path.join(__dirname, 'viewer');
    for (const f of fs.readdirSync(v)) fs.writeFileSync(path.join(dir, f), fill(fs.readFileSync(path.join(v, f), 'utf8')).replace(/__Title__/g, title));
  }
  if (opts.list) {
    const f = opts.list;
    fs.appendFileSync(f, `${fs.existsSync(f) ? '' : '# The apps\n\n'}- **${id}**: ${title}. \`node tools/run.js ${id}\`\n`);
  }
  return { id, title, dir };
}

function main(argv) {
  const viewer = argv.includes('--viewer'), name = argv.find((a) => !a.startsWith('--'));
  let r;
  try { r = create(name, { viewer, list: path.join(ROOT, 'APPS.md') }); } catch (e) { console.error(e.message); process.exit(2); }
  console.log(`Made apps/${r.id}.`);
  console.log(`  run it:   node tools/run.js ${r.id} --http      (two tabs: /?name=A&frame=0,0,0 and /?name=B&frame=1,0.5,40)`);
  console.log(`  test it:  node --test "apps/${r.id}/*.test.js"`);
  if (viewer) console.log(`  PC view:  /view.html`);
  console.log(`  a body of its own: packet type ${nextPacketType()} (mumr.json "owned", docs/HOWTO-NEW-APP.md section 3)`);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { create, nextPacketType, kebab };
