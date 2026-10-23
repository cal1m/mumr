// Every scenario the host knows (Node only: the pages see the list in the world event). Add a new one here.
const D = require('../lib/ns.js');
D.scenarios = {};
for (const s of [require('./s00_lantern_test.js'), require('./s01_ember_hollow.js'), require('./s02_greyford_toll.js')]) D.scenarios[s.id] = s;
module.exports = D;
