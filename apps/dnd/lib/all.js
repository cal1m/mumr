// Node: the whole app's logic and its scenarios in one require (the browser loads the files with <script> tags in the same order).
require('./expr.js'); require('./rules.js'); require('./intent.js'); require('./creature.js'); require('./lines.js'); require('./voice.js');
require('./director.js'); require('./game.js'); require('./lint.js'); require('./sim.js');
require('../scenarios/index.js');
module.exports = require('./ns.js');
