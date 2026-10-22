// Node: every client file, in the order a page loads them with <script> tags, on one shared object.
//   const M = require('mumr/client/index.js');   M.session.Session, M.body.Body, ...
// In the browser:
//   <script src="/mumr/util.js"></script> <script src="/mumr/link.js"></script> <script src="/mumr/align.js"></script>
//   <script src="/mumr/wire.js"></script> <script src="/mumr/session.js"></script> <script src="/mumr/presence.js"></script>
//   <script src="/mumr/body.js"></script> <script src="/mumr/worldfeed.js"></script> <script src="/mumr/life.js"></script>
// and then window.MUMR has them all.
const FILES = ['util', 'link', 'align', 'wire', 'session', 'presence', 'body', 'worldfeed', 'life'];
for (const f of FILES) require(`./${f}.js`);
module.exports = require('./ns.js');
module.exports.FILES = FILES;
