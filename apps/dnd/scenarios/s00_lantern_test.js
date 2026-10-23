// Scenario 00: The Lantern Test. A 15-20 minute tutorial for the first trial run: every thing the game does, once, with a talking
// lantern that explains it. Speaking aloud, a question with a fixed answer, a check (the stuck door), a fight (a straw dummy), a
// choice that everyone has to agree to, and items. Original content.
module.exports = {
  id: 's00_lantern_test',
  title: 'The Lantern Test',
  blurb: 'A short tutorial: talk, test, fight and choose, with a lantern that explains how.',
  minutes: 20,
  players: [1, 5],
  room: { w: 4, d: 3 },
  hintAfter: 45,
  vars: { 'door.open': false, 'pip.asked': 0 },
  creatures: [
    { id: 'drill', name: 'the Drillmaster', kind: 'construct', voice: 'narrator', hp: 6, hpPerHero: 3, def: 10, at: [3.2, 1.5], yaw: Math.PI, size: 0.8,
      attack: { name: 'wooden fist', bonus: 2, dmg: '1d4' }, flee: 0, speed: 0.4,
      lines: { hurt: ['Straw flies everywhere.', 'The Drillmaster creaks, and keeps coming.'] } },
  ],
  items: [
    { id: 'potion', name: 'red potion', kind: 'potion', heal: '2d4+2', at: [1.0, 2.6] },
    { id: 'letter', name: 'sealed letter', kind: 'letter', at: [1.4, 2.6] },
  ],
  start: 'intro',
  nodes: {
    intro: {
      act: 'The Lantern Test', scene: 'lodge',
      say: [
        'You stand in the testing hall of the Wayfarers\' Lodge. Dust, old banners, and a brass lantern hanging from a hook.',
        { v: 'pip', t: 'Ah! Fresh faces. I am Pip, and I am the lantern. I will be your guide today.' },
        { v: 'pip', t: 'Here is the first rule. There is nothing to press. You speak out loud, to me or to each other, and the world listens.' },
        { v: 'pip', t: 'Go on, try it. Say hello to me.' },
      ],
      hints: [{ v: 'pip', t: 'Just say: hello, Pip. Loud and clear.' }],
      choices: [
        { label: 'greet Pip', hear: ['hello', 'hi', 'hey', 'greetings', 'good evening', 'good morning', 'nice to meet'], say: [{ v: 'pip', t: 'Hello, {hero}! See? I heard you. Now, the tests.' }], go: 'door' },
      ],
    },
    door: {
      say: [
        { v: 'pip', t: 'Test one. That door at the end of the hall is stuck. Get it open.' },
        { v: 'pip', t: 'When you try something hard, the world rolls the dice for you. You will never hear the numbers. You will only hear what happens.' },
      ],
      hints: [{ v: 'pip', t: 'You could push the door. Or look around it for another way. You may also ask me questions.' }],
      choices: [
        { label: 'push the door', hear: ['push', 'force', 'shoulder', 'kick', 'open the door', 'pull'],
          check: { stat: 'might', dc: 11, label: 'force the door',
            pass: { say: ['{hero} throws a shoulder into the door. It groans, and swings open.'], set: { 'door.open': true }, go: 'hall' },
            fail: { say: ['{hero} pushes until their shoulder aches. The door does not move an inch.', { v: 'pip', t: 'That is a fail. It happens. Try again, or try something else.' }] } } },
        { label: 'look for another way', hear: ['look', 'search', 'examine', 'another way', 'latch', 'lock', 'inspect', 'check the door'],
          check: { stat: 'wits', dc: 10, label: 'spot the latch',
            pass: { say: ['{hero} finds a latch hidden behind a brass plate. A click, and the door swings open.'], set: { 'door.open': true }, go: 'hall' },
            fail: { say: ['{hero} sees wood, iron, and dust. Nothing helpful.'] } } },
        { label: 'ask Pip', quiet: true, hear: ['pip', 'question', 'what do we do', 'how', 'help', 'why'], add: { 'pip.asked': 1 },
          say: [{ v: 'pip', t: 'Questions are always allowed. The answers are true, and they never cost you anything. The door, by the way, has a latch somewhere.' }] },
      ],
    },
    hall: {
      scene: 'yard',
      say: [
        'Beyond the door is a sandy yard. In the middle stands a dummy of straw and iron bands.',
        'It turns its head toward you, with a creak.',
        { v: 'pip', t: 'Test two. A fight! When it is your turn, I will call your name. Say what you do: attack, defend, or help a friend.' },
        { v: 'pip', t: 'Menders can heal, Wardens can guard a friend, Kindlers can ward everyone. Just say it.' },
      ],
      fight: { foes: ['drill'], win: 'after_fight', lose: 'after_lose', fled: 'after_fight' },
    },
    after_lose: {
      say: [
        'Everything goes dark. Then, a smell of oil and straw.',
        { v: 'pip', t: 'Up you get. Everyone falls the first time. The dummy has gone back to its corner.' },
      ],
      enter: { heal: true },
      go: 'after_fight',
    },
    after_fight: {
      scene: 'yard',
      enter: { show: ['potion', 'letter'] },
      say: [
        { v: 'pip', t: 'Well done! Test three, the last one. On the bench there is a red potion, and a sealed letter.' },
        { v: 'pip', t: 'You may keep one, and only one. Decide together. When someone says what you take, I will ask if all of you agree.' },
      ],
      hints: [{ v: 'pip', t: 'The potion, or the letter? Somebody say it, and the others say yes or no.' }],
      choices: [
        { label: 'take the potion', hear: ['potion', 'red', 'drink', 'the healing'], confirm: true, give: 'potion', hide: ['letter'], go: 'end_potion' },
        { label: 'take the letter', hear: ['letter', 'seal', 'envelope', 'read it'], confirm: true, give: 'letter', hide: ['potion'], go: 'end_letter' },
      ],
    },
    end_potion: {
      act: 'The end',
      say: [
        { v: 'pip', t: 'The potion. Practical! You will be glad of it one day.' },
        { v: 'pip', t: 'You have passed the Lantern Test, all of you. The Lodge has work for people like you.' },
      ],
      end: { title: 'Passed, with a potion' },
    },
    end_letter: {
      act: 'The end',
      say: [
        '{hero} breaks the seal. The letter is short.',
        'The bell of the old chapel has stopped ringing. Come quickly. Something under the chapel is waking.',
        { v: 'pip', t: 'Ah. That one is a real job. You have passed the Lantern Test, and it seems your first quest has found you.' },
      ],
      end: { title: 'Passed, with a letter' },
    },
  },
};
