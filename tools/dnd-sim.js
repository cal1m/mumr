// The DnD app's scenarios without people: lint each one, then let pretend players play it many times and count the endings, the nodes
// never reached and the runs that got stuck. With --show, one run is printed as the narrator would say it.
//   node tools/dnd-sim.js [scenario id | all] [--runs=200] [--players=3] [--seed=1] [--show]
const D = require('../apps/dnd/lib/all.js');

const args = process.argv.slice(2), flag = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}`)); return a ? (a.includes('=') ? a.split('=')[1] : true) : d; };
const which = args.find((a) => !a.startsWith('--')) || 'all';
const runs = +flag('runs', 200), players = +flag('players', 3), seed0 = +flag('seed', 1);
const list = which === 'all' ? Object.values(D.scenarios) : [D.scenarios[which]].filter(Boolean);
if (!list.length) { console.error(`no scenario ${which}; there are: ${Object.keys(D.scenarios).join(', ')}`); process.exit(2); }

let bad = 0;
for (const sc of list) {
  const { errors, warnings } = D.lint.lint(sc);
  console.log(`\n== ${sc.title} (${sc.id})`);
  for (const e of errors) console.log(`  ERROR    ${e}`);
  for (const w of warnings) console.log(`  warning  ${w}`);
  if (errors.length) { bad++; continue; }
  if (flag('show', false)) {
    D.sim.play(sc, { seed: seed0, count: players, onLine: (l) => console.log(`  ${l.v === 'narrator' ? '' : `[${l.v}] `}${l.t}`), onNote: (t) => console.log(`      (${t})`) });
    continue;
  }
  const endings = {}, seen = new Set();
  let stuck = 0, steps = 0, lines = 0;
  for (let k = 0; k < runs; k++) {
    const r = D.sim.play(sc, { seed: seed0 + k, count: players });
    if (r.stuck) stuck++;
    endings[r.ending || 'none'] = (endings[r.ending || 'none'] || 0) + 1;
    for (const n of r.nodes) seen.add(n);
    steps += r.steps; lines += r.lines.length;
  }
  console.log(`  ${runs} runs with ${players} players: ${Object.entries(endings).map(([e, n]) => `${e} ${n}`).join(', ')}; stuck ${stuck}`);
  console.log(`  on average ${Math.round(steps / runs)} turns of talk and ${Math.round(lines / runs)} narrator lines a run`);
  const never = Object.keys(sc.nodes).filter((n) => !seen.has(n));
  if (never.length) console.log(`  never reached: ${never.join(', ')}`);
  const noEnd = Object.entries(sc.nodes).filter(([id, n]) => n.end && !endings[id]).map(([id]) => id);
  if (noEnd.length) console.log(`  endings never reached: ${noEnd.join(', ')}`);
  if (stuck) bad++;
}
process.exit(bad ? 1 : 0);
