// Scenario 02: The Toll at Greyford. About 45 minutes, 2 to 5 players: mostly talking, a little searching, and a fight only if the
// party cheats or threatens. Its point for the trial runs: a creature that is not a monster (the ferryman remembers who was kind to
// him, through the same memory as Vhorr's), and a second creature that hunts whoever lied. Original content.
const MOSS = 'moss', COIL = 'coil';
module.exports = {
  id: 's02_greyford_toll',
  title: 'The Toll at Greyford',
  blurb: 'A misty river, a ferryman who wants something you will miss, and what lives under the water. About 45 minutes.',
  minutes: 45,
  players: [2, 5],
  room: { w: 4, d: 3 },
  hintAfter: 50,
  heroVars: { lied: 0 },
  vars: { 'lied': false, 'paid': false, 'fought': false, 'offers': 0, 'sign.read': false },
  creatures: [
    { id: MOSS, name: 'Old Moss', kind: 'spirit', voice: 'moss', hp: 99, def: 30, at: [3.6, 0.6], yaw: Math.PI, size: 0.8, mood: 'talk', flee: 0,
      attack: { name: 'pole', bonus: 0, dmg: '1' } },
    { id: COIL, name: 'the Mire Coil', kind: 'serpent', voice: 'narrator', hp: 10, hpPerHero: 5, def: 12, at: [2.4, 2.2], yaw: -Math.PI / 2, size: 1.6, mood: 'asleep',
      attack: { name: 'bite', bonus: 4, dmg: '1d8' }, flee: 0.4, speed: 0.4,
      lines: { hurt: ['The Coil hisses, and the river boils around it.'], flee: ['The Coil sinks back into the black water, trailing a dark cloud.'] } },
  ],
  items: [
    { id: 'horse', name: 'wooden horse', kind: 'toy', at: [0.5, 2.5] },
    { id: 'oar', name: 'broken oar', kind: 'thing', at: [0.8, 2.4] },
  ],
  start: 'bank',
  nodes: {
    bank: {
      act: 'The near bank', scene: 'bank',
      say: [
        'The road to the north ends at the Greyford. The ford itself drowned years ago; now there is only a wide, slow river, and mist.',
        'On the bank: an old toll box nailed to a post, a cart lying on its side in the reeds, and a wooden sign.',
        'Somewhere out in the mist, a pole knocks against wood. Someone is out there, on the water.',
      ],
      go: 'shore',
    },
    shore: {
      hints: ['You could read the sign, search the cart, call for the ferry, or try to wade across.'],
      choices: [
        { label: 'read the sign', hear: ['sign', 'read', 'words', 'board'], once: true, set: { 'sign.read': true },
          say: ['Carved deep, and old: Pay the ferryman what you will miss, not what you will spend. And beneath, newer, scratched with a knife: Do not lie to him.'],
          again: ['What you will miss, not what you will spend. And: do not lie to him.'] },
        { label: 'search the cart', hear: ['cart', 'search', 'reeds', 'look around', 'wagon'], once: true,
          check: { stat: 'wits', dc: 10, label: 'search the cart',
            pass: { say: ['Under the cart, in the mud, {hero} finds a broken oar, and a child\'s wooden horse, worn smooth by small hands.'], show: ['horse', 'oar'] },
            fail: { say: ['Mud, reeds, and a broken wheel. {hero} gets wet to the knees for nothing.'] } },
          again: ['The cart has nothing else to give.'] },
        { label: 'call for the ferry', hear: ['call', 'ferry', 'ferryman', 'hello', 'boat', 'shout', 'over here', 'wave'], go: 'ferry' },
        { label: 'wade across', hear: ['wade', 'swim', 'cross ourselves', 'walk across', 'ford'], confirm: true, go: 'wade' },
      ],
    },
    wade: {
      say: ['You step into the river. It is colder than anything you have felt, and it pulls.'],
      check: { who: 'group', stat: 'might', dc: 12, label: 'wade the river',
        pass: { say: ['Waist-deep, then chest-deep, you push on. Then the water ahead of you rises up in a long, black, gleaming back.'], set: { 'fought': true }, mood: { [COIL]: 'fight' }, go: 'coil_fight' },
        fail: { say: ['The river takes your feet and rolls you back to the bank, bruised and gasping.'], hurt: { who: 'all', dmg: '1d4' }, go: 'shore' } },
    },
    ferry: {
      act: 'The ferry',
      say: [
        'A flat boat slides out of the mist. The ferryman is tall and bent and green, as if he grew on a riverbank and walked off it.',
        { v: 'moss', t: 'Old Moss, that is me. Crossing, is it? There is a toll. Something you will miss.' },
      ],
      go: 'toll',
    },
    toll: {
      hints: [{ v: 'moss', t: 'Something you will miss. Not coins. Coins are the river\'s already.' }],
      choices: [
        { label: 'pay with coins', quiet: true, hear: ['coin', 'gold', 'silver', 'money', 'pay', 'purse'], add: { 'offers': 1 },
          say: [{ v: 'moss', t: 'Coins! The bottom of my river is paved with coins. Try again.' }], go: 'weigh' },
        { label: 'give the wooden horse', hear: ['horse', 'toy', 'wooden horse'], when: 'has("horse")', add: { 'offers': 1 }, respect: { [MOSS]: 3 }, hide: ['horse'],
          say: [{ v: 'moss', t: 'Oh. Oh, I know this one. A little girl lost it, the year the ford drowned. Someone will miss this. Yes.' }], go: 'weigh' },
        { label: 'sing him a song', hear: ['sing', 'song', 'music', 'tune', 'hum'], once: true, add: { 'offers': 1 },
          check: { stat: 'heart', dc: 12, label: 'a song that moves him',
            pass: { say: ['{hero} sings, and the mist itself seems to lean in.', { v: 'moss', t: 'I shall miss that, when it ends. That will do.' }], respect: { [MOSS]: 3 }, go: 'weigh' },
            fail: { say: [{ v: 'moss', t: 'Hm. My frogs sing better.' }], respect: { [MOSS]: 1 }, go: 'weigh' } } },
        { label: 'give him a weapon', hear: ['sword', 'bow', 'knife', 'staff', 'weapon', 'blade'], once: true, add: { 'offers': 1 }, respect: { [MOSS]: 2 },
          say: [{ v: 'moss', t: 'A fighter without a blade. You will miss that, true. I will give it back on the far side, if you do not lie to me.' }], go: 'weigh' },
        { label: 'tell him a memory', hear: ['memory', 'remember', 'story', 'tell you about'], once: true, add: { 'offers': 1 }, respect: { [MOSS]: 2 },
          say: [{ v: 'moss', t: 'A memory, given away. Yes, you will miss it a little. Good.' }], go: 'weigh' },
        { label: 'lie that you paid already', quiet: true, hear: ['already paid', 'we paid', 'paid you', 'friend of', 'free', 'owe us', 'lord sent'], set: { 'lied': true }, me: { lied: 1 }, threat: { [COIL]: 5 },
          say: [{ v: 'moss', t: 'Did you, now.' }, 'Old Moss smiles, and says nothing else. Somewhere under the water, something long turns over.'], go: 'weigh' },
        { label: 'threaten him', quiet: true, hear: ['threaten', 'or else', 'take the boat', 'force', 'make you'], set: { 'lied': true }, me: { lied: 1 }, threat: { [COIL]: 5 },
          say: [{ v: 'moss', t: 'Take it then.' }, 'He steps off the boat onto the water, and the mist folds over him. The boat is yours. So is the river.'], go: 'crossing' },
      ],
    },
    weigh: {
      go: [
        { when: 'sum("moss.respect") >= 3', go: 'paid' },
        { when: 'offers >= 4', go: 'moss_tired' },
        { go: 'toll' },
      ],
    },
    moss_tired: {
      say: [{ v: 'moss', t: 'You do not understand tolls, do you. Fine. Get in. But the river will want its own.' }],
      go: 'crossing',
    },
    paid: {
      enter: { set: { 'paid': true } },
      say: [{ v: 'moss', t: 'Toll paid. Step in, step in. Mind the middle; something sleeps there.' }],
      go: 'crossing',
    },
    crossing: {
      act: 'The crossing', scene: 'river',
      say: ['The boat slides into the mist. The bank behind you disappears. In the middle of the river, the water goes very still.'],
      go: [{ when: 'lied || !paid', go: 'coil_rises' }, { go: 'moss_sings' }],
    },
    moss_sings: {
      say: [
        'Something long and black rises beside the boat, and an eye the size of a plate looks at each of you, one by one.',
        { v: 'moss', t: 'Hush, now. These paid. These did not lie.' },
        'Old Moss hums, low. The black shape sinks again, slowly, without a ripple.',
      ],
      go: 'far_bank',
    },
    coil_rises: {
      say: ['The water bursts. A serpent of black mud and river weed rises over the boat, and it goes straight for the one the river remembers.'],
      enter: { set: { 'fought': true }, mood: { [COIL]: 'fight' } },
      go: 'coil_fight',
    },
    coil_fight: {
      fight: { foes: [COIL], win: 'far_bank', fled: 'far_bank', lose: 'washed_up', escape: 'shore' },
      choices: [
        { label: 'give the river something', quiet: true, hear: ['throw', 'give', 'offer', 'sorry', 'apologise', 'apologize'], when: '!paid',
          say: ['{hero} throws something precious into the water, with a word of sorry. The Coil stops, mid-strike, and sinks away.'], set: { 'paid': true }, mood: { [COIL]: 'gone' }, go: 'far_bank' },
      ],
    },
    washed_up: {
      say: ['You wake on the far bank, soaked and battered, in a heap like driftwood. The river has spat you out. It did not want you after all.'],
      enter: { heal: true },
      go: 'far_bank',
    },
    far_bank: {
      act: 'The far bank', scene: 'far',
      say: [
        'The far bank is solid under your feet. The mist thins; the road north goes on.',
        { v: 'moss', t: 'Safe travels. Come back this way, and I will remember you.', when: 'paid && !lied' },
        { v: 'moss', t: 'And you. I will remember you too.', when: 'lied' },
      ],
      go: [{ when: 'fought', go: 'end_blood' }, { go: 'end_paid' }],
    },
    end_paid: { act: 'The end', say: ['You paid the toll, and the river let you pass.'], end: { title: 'Paid in full' } },
    end_blood: { act: 'The end', say: ['You crossed. The river let you, in the end, but it took its toll in bruises.'], end: { title: 'Paid in blood' } },
  },
};
