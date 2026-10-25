// Run an app by name, or list the apps.
//   node tools/run.js                         the apps in apps/ and their titles
//   node tools/run.js cube                    headsets: https://<PC>:8443/
//   node tools/run.js cube --http             this PC only, port 8766 (two tabs: /?name=A&frame=0,0,0 and /?name=B&frame=1,0.5,40)
//   node tools/run.js cube 8770 --http --no-browser --log=none      everything after the name goes to engine/server/serve.py
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..'), APPS = path.join(ROOT, 'apps');
const apps = () => fs.readdirSync(APPS).filter((d) => fs.existsSync(path.join(APPS, d, 'mumr.json')));

function main(argv) {
  const [name, ...rest] = argv;
  if (!name) {
    for (const d of apps()) console.log(`${d.padEnd(20)} ${JSON.parse(fs.readFileSync(path.join(APPS, d, 'mumr.json'), 'utf8')).title || ''}`);
    return;
  }
  if (!apps().includes(name)) { console.error(`No app "${name}" in apps/. The apps: ${apps().join(', ')}`); process.exit(2); }
  if (rest.includes('--http') && !rest.some((a) => /^\d+$/.test(a))) rest.unshift('8766');
  const [cmd, pre] = process.platform === 'win32' ? ['py', ['-3']] : ['python3', []];
  const child = spawn(cmd, [...pre, path.join(ROOT, 'engine', 'server', 'serve.py'), path.join(APPS, name), ...rest], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code === null ? 1 : code));
  process.on('SIGINT', () => child.kill('SIGINT'));
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { apps };
