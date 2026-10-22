// The cube's host module (client/host.js runs it on the PC): the same cube as the headsets simulate, held by the host while nobody
// touches it, so it stays where it was left when everybody has gone.
const C = require('./cube.js');

module.exports = {
  session: { game: C.GAME, player: C.PLAYER, actions: C.ACTIONS, press: C.press },
  setup({ M, session, space, room }) {
    const cube = new C.Cube();
    const body = new M.body.Body(session, { token: 'cube', type: 'cube', adapter: C.adapter(cube, space) });
    return { bodies: [body], step: (dt, t, hands) => { cube.room = room.local(); cube.step(dt, t, hands); } };
  },
};
