// The MUMR namespace. In the browser every client file attaches to globalThis.MUMR; in Node each file does
// `module.exports = require('./ns.js')`, so they all share this one object (engine/client/index.js loads them all).
module.exports = {};
