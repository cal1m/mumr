// Scenario 01: The Ember Hollow. The one-shot of documents/scenario_01_ember_hollow.md, made playable: about 2 h 10 min, 2 to 5
// players, a 4 x 3 m floor. Original content.
//
// One change to the draft (to be confirmed): the draft says both "the bell is gone and the dragon is awake" and "if nobody is loud,
// Vhorr stays asleep and the party may take the bell". Here the thief (a frightened boy, Tam) dropped the bell in the cellar as he
// fled; Vhorr is stirring but not yet awake (`vhorr.stir`), and wakes at 2 or at any loud act.
//
// The four endings come from the variables, as in the draft:
//   end_sleep  the bell rings, Vhorr sleeps     bargain with enough respect, or a clean escape with the village's trust (>= 2)
//   end_hunt   the bell stolen, Vhorr hunts     an escape with the bell but without the village's trust
//   end_slain  Vhorr dead                       the fight won; the hero who did most harm is named
//   end_flies  Vhorr flies off with the bell    the chase lost, the bargain refused, or the party beaten
const V = 'vhorr';
module.exports = {
  id: 's01_ember_hollow',
  title: 'The Ember Hollow',
  blurb: 'A stopped bell, a ruined chapel, and the dragon Vhorr waking in the cellar below. About two hours.',
  minutes: 130,
  players: [2, 5],
  room: { w: 4, d: 3 },
  hintAfter: 60,
  vars: { 'vhorr.awake': false, 'vhorr.stir': 0, 'village.trust': 2, 'cellar.lit': false, 'clue.prints': false, 'clue.diary': false, 'clue.ghost': false,
    'path': '', 'bargain.offers': 0 },
  heroVars: { dealt: 0 },
  creatures: [
    { id: V, name: 'Vhorr', kind: 'dragon', voice: 'vhorr', hp: 8, hpPerHero: 8, def: 14, at: [3.0, 1.5], yaw: Math.PI, size: 2, mood: 'asleep',
      attack: { name: 'claws', bonus: 5, dmg: '1d10+1' }, breath: { name: 'fire', dmg: '2d8', dc: 13, stat: 'grace', every: 3, len: 4, angle: 60 },
      flee: 0.2, speed: 0.5, reach: 1.4,
      lines: {
        hurt: [{ v: V, t: 'You will regret that, {hero}.' }, { v: V, t: 'Little sting. I have had worse from bees.' }, { v: V, t: 'I will remember your face, {hero}.' }],
        flee: [{ v: V, t: 'Enough! This hall is not worth my blood.' }],
      } },
  ],
  items: [
    { id: 'lantern', name: 'lantern', kind: 'light', at: [0.6, 0.5] },
    { id: 'bell', name: 'Ashen Bell', kind: 'relic', at: [2.2, 1.6] },
    { id: 'potion', name: 'healing draught', kind: 'potion', heal: '2d4+2', at: [0.4, 2.6] },
  ],
  start: 'start',
  nodes: {
    // ---------------------------------------------------------------- Act 1: the chapel (about 30 min)
    start: {
      act: 'Act 1: The chapel', scene: 'chapel',
      say: [
        'The village of Hollowmere has not heard its bell since the last winter.',
        'Tonight it hired you, for a purse of silver and a hot meal, to climb to the ruined chapel and bring back the Ashen Bell.',
        'The old ones say the bell keeps something asleep under the chapel. Nobody young believes them.',
        'Now you stand in the nave. The roof is half gone; rain drips through it. The air smells of wet stone, and of smoke.',
      ],
      go: 'nave',
    },
    nave: {
      say: [
        'A bell rope hangs from the tower, with nothing at its end.',
        'Wet footprints cross the floor, toward the altar.',
        'On a pillar, someone has drawn a sign in chalk.',
        'Somewhere to your left, cold air breathes up from a stairway into the dark.',
      ],
      go: 'chapel',
    },
    chapel: {
      hints: [
        'The chapel is quiet. You could look at the rope, the footprints, or the chalk sign. There is a desk by the altar, and the stairs down.',
        'If you call out, someone might answer.',
      ],
      choices: [
        { label: 'look at the rope', hear: ['rope', 'bell rope', 'tower'], once: true,
          say: ['{hero} lifts the end of the rope. It was not worn through. It was cut, cleanly, with a knife, and not long ago.'],
          again: ['The rope still hangs there, cut clean.'] },
        { label: 'follow the footprints', hear: ['footprints', 'prints', 'tracks', 'follow', 'footsteps', 'wet'], once: true,
          check: { stat: 'wits', dc: 11, label: 'read the footprints',
            pass: { say: ['Small feet, bare, running. A child, or a slight young man. They go to the altar, and then down the cellar stairs. None come back up.'], set: { 'clue.prints': true } },
            fail: { say: ['Wet stone, wet dust, and a muddle of prints. Whoever made them was in a hurry. That is all {hero} can tell.'] } },
          again: ['The prints are drying already.'] },
        { label: 'look at the chalk sign', hear: ['chalk', 'sign', 'mark', 'symbol', 'drawing', 'pillar'], once: true,
          say: ['A circle, with one line through it. {hero} knows it from old stories: the sign of the bell-keepers. It means: it sleeps. Do not wake it.'],
          again: ['The circle and its line. It sleeps. Do not wake it.'] },
        { label: 'read the desk by the altar', hear: ['desk', 'altar', 'diary', 'book', 'journal', 'read'], once: true, show: ['lantern'],
          say: [
            'On the desk lies the priest\'s diary, and next to it an unlit lantern.',
            'The last page reads: Rang the Ashen Bell at dusk, as every day. Vhorr sleeps. Young Tam asked about it again. He thinks the bell is silver. I fear for that boy.',
          ], set: { 'clue.diary': true },
          again: ['The diary says what it said: the bell keeps Vhorr asleep, and young Tam wanted it.'] },
        { label: 'call out', hear: ['call', 'hello', 'anyone', 'who is there', 'ghost', 'spirit', 'show yourself', 'priest'], go: 'ghost' },
        { label: 'light the lantern', hear: ['light the lantern', 'light it', 'lantern', 'torch', 'light'], when: 'has("lantern") && !cellar.lit', set: { 'cellar.lit': true },
          say: ['{hero} lights the lantern. Warm light fills the nave, and the shadows draw back to the corners.'] },
        { label: 'go down the stairs', hear: ['stairs', 'cellar', 'go down', 'descend', 'downstairs', 'below', 'down'], go: 'stairs' },
      ],
    },
    ghost: {
      say: [
        'The candles on the altar flicker, all at once. Between them stands an old woman, grey, and see-through as smoke.',
        { v: 'ghost', t: 'I am Sister Wenna. I kept the bell for forty years. Why have you come to my chapel? Speak true.' },
      ],
      hints: [{ v: 'ghost', t: 'Well? Why are you here?' }],
      choices: [
        { label: 'tell the truth', hear: ['bell', 'village', 'hired', 'bring back', 'the truth', 'help', 'sent us', 'hollowmere'], add: { 'village.trust': 1 }, set: { 'clue.ghost': true }, show: ['lantern'],
          say: [
            { v: 'ghost', t: 'The truth. Good. Then hear mine.' },
            { v: 'ghost', t: 'A boy took the bell. Frightened, not wicked. He dropped it below, when the great one opened an eye.' },
            { v: 'ghost', t: 'Take the lantern from my desk. Light it before you go down. In the dark, he hears everything.' },
            'She is gone. The lantern on the desk is the only thing that does not flicker.',
          ], go: 'chapel' },
        { label: 'lie to her', hear: ['treasure', 'gold', 'money', 'loot', 'adventure', 'nothing', 'just looking', 'passing', 'none of your business', 'shelter'], add: { 'village.trust': -1 },
          say: [
            { v: 'ghost', t: 'Liar. The last one who lied to me went down those stairs too.' },
            'Her face hardens, and she is gone. The cold stays a while after her.',
          ], go: 'chapel' },
        { label: 'ask about the bell', quiet: true, hear: ['where is the bell', 'who took', 'what happened', 'tell us'],
          say: [{ v: 'ghost', t: 'Ask me nothing, until you tell me why you are here.' }] },
      ],
    },
    stairs: {
      say: [
        'The stairs end at an iron-bound door. It is ajar. From below comes warm air, and a sound like a forge bellows: in, and out, very slowly.',
      ],
      hints: ['You could open the door and go down, or go back up into the chapel.'],
      choices: [
        { label: 'go through the door', hear: ['open', 'go down', 'go in', 'enter', 'through', 'door', 'descend', 'continue', 'onward'],
          go: [{ when: 'cellar.lit', go: 'descend_lit' }, { go: 'descend_dark' }] },
        { label: 'go back up', hear: ['back', 'up', 'chapel', 'return', 'leave'], go: 'chapel' },
        { label: 'light the lantern', quiet: true, hear: ['light the lantern', 'light it', 'lantern', 'light'], when: 'has("lantern") && !cellar.lit', set: { 'cellar.lit': true },
          say: ['{hero} lights the lantern. The stairwell glows.'] },
      ],
    },
    descend_lit: {
      act: 'Act 2: The cellar', scene: 'cellar',
      say: [
        'Lantern light spills into a long stone hall. Coins, thousands of them, lie in drifts against the walls.',
        'And on the biggest drift sleeps a dragon. Red as a dying coal, as long as a hay cart. Its chest rises, and falls.',
        'This is Vhorr.',
      ],
      go: 'cellar',
    },
    descend_dark: {
      act: 'Act 2: The cellar', scene: 'cellar',
      say: [
        'You go down into the dark. Your boots find coins: they slide and clink.',
        'Something enormous breathes, right in front of you. A cold draught comes down the stairs behind you, and the door bangs shut.',
      ],
      check: { who: 'luck', dc: 11, label: 'Vhorr wakes?',
        pass: { say: ['The breathing goes on, slow and deep. Whatever it is, it is still asleep. Your eyes slowly find the shape: a dragon, red as a dying coal, curled on a hill of coins. Vhorr.'], add: { 'vhorr.stir': 1 }, go: 'cellar' },
        fail: { say: ['The breathing stops.'], go: 'wake' } },
    },
    cellar: {
      hints: [
        'Vhorr sleeps. You could search the hall, try to take something quietly, or speak to the dragon. Or leave.',
      ],
      choices: [
        { label: 'search the hall', hear: ['search', 'look', 'where is the bell', 'look around', 'find', 'bell'], once: true, show: ['bell', 'potion'],
          say: [
            'The Ashen Bell lies on its side in the coins, grey and plain, a hand\'s reach from the dragon\'s foreclaw.',
            'Near the door, a small bag has been dropped. A boy\'s bag: inside, a healing draught.',
          ],
          again: ['The bell lies by the dragon\'s claw. Vhorr\'s nostrils flare as he breathes.'] },
        { label: 'take the bell quietly', hear: ['take the bell', 'grab the bell', 'sneak', 'quietly', 'tiptoe', 'pick up', 'steal', 'creep'], when: '!has("bell")',
          check: { stat: 'grace', dc: 13, label: 'take the bell silently',
            pass: { say: ['{hero} slides the bell out from under the claw. Not a sound. Vhorr sleeps on.'], give: 'bell', set: { 'path': 'steal' }, go: 'quiet_have' },
            fail: { say: ['A coin slides. Then a hundred more, chiming. Vhorr\'s eye opens, a slit of orange fire.'], add: { 'vhorr.stir': 2 }, set: { 'path': 'steal' }, me: { loud: 1 }, threat: { [V]: 1 },
              go: [{ when: 'vhorr.stir >= 2', go: 'wake' }] } } },
        { label: 'speak to the dragon', hear: ['talk', 'speak', 'hello', 'greet', 'wake him', 'excuse me', 'mighty', 'great one', 'lord', 'dragon'], respect: { [V]: 1 },
          say: ['{hero} clears their throat, and speaks to the sleeping dragon.'], go: 'wake' },
        { label: 'make a noise', quiet: true, hear: ['shout', 'yell', 'scream', 'hey', 'smash', 'break', 'kick', 'crate', 'bang'], threat: { [V]: 1 },
          say: ['The noise rings off the walls.'], go: 'wake' },
        { label: 'attack while it sleeps', hear: ['attack', 'kill', 'stab', 'strike', 'fire', 'shoot', 'charge'], confirm: true, set: { 'path': 'fight' },
          say: ['{hero} strikes first, at the sleeping dragon.'], go: 'fight' },
        { label: 'leave', quiet: true, hear: ['leave', 'go back', 'retreat', 'upstairs', 'get out'], go: 'chapel' },
      ],
    },
    quiet_have: {
      say: ['You have the bell. Vhorr has not moved. The door, and the stairs, are behind you.'],
      hints: ['You could creep out with the bell, or wake the dragon after all.'],
      choices: [
        { label: 'creep out with the bell', hear: ['leave', 'go', 'creep out', 'sneak out', 'back up', 'stairs', 'out', 'run', 'away'],
          check: { who: 'group', stat: 'grace', dc: 11, label: 'everyone creeps out',
            pass: { say: ['One by one you climb the stairs, over the coins, past the claw, the bell held close. Behind you, the breathing does not change.'], go: 'escaped' },
            fail: { say: ['Someone\'s boot finds a coin, and it rings like a little bell. Behind you, an enormous weight shifts.'], set: { 'vhorr.awake': true }, go: 'chase' } } },
        { label: 'wake the dragon', quiet: true, hear: ['wake', 'talk', 'speak', 'hello'], go: 'wake' },
      ],
    },
    // ---------------------------------------------------------------- Vhorr wakes; Act 3: the choice (about 40 min)
    wake: {
      enter: { set: { 'vhorr.awake': true }, mood: { [V]: 'talk' } },
      say: [
        'Vhorr lifts his head. Coins pour off his neck like water. He turns, slowly, to look at {hero}.',
        { v: V, t: 'You again, {top:vhorr.threat}. I remember the taste of your steel.', when: 'top("vhorr.threat") >= 5' },
        { v: V, t: 'Who dares to wake me? You. I can smell your nerve.', when: 'top("vhorr.threat") >= 1 && top("vhorr.threat") < 5' },
        { v: V, t: 'Polite thieves. That is new.', when: 'top("vhorr.threat") < 1 && top("vhorr.respect") >= 1' },
        { v: V, t: 'Little things, in my hall. Speak, before I decide what you are.', when: 'top("vhorr.threat") < 1 && top("vhorr.respect") < 1' },
      ],
      go: 'choice',
    },
    choice: {
      act: 'Act 3: The choice',
      hints: [
        { v: V, t: 'Well? I am awake now. That is your doing.' },
        'Vhorr waits. You could try to take the bell and run, you could bargain with him, or you could fight.',
      ],
      choices: [
        { label: 'take the bell and run', hear: ['take the bell', 'grab the bell', 'run', 'snatch', 'steal', 'grab it'], confirm: true, set: { 'path': 'steal' },
          check: { stat: 'grace', dc: 14, label: 'snatch the bell',
            pass: { say: ['{hero} dives, grabs the bell, and rolls clear of the claw!'], give: 'bell', go: 'chase' },
            fail: { say: ['{hero} dives for the bell, and a claw slams down on it first.', { v: V, t: 'No.' }], threat: { [V]: 2 }, go: 'fight' } } },
        { label: 'bargain with him', hear: ['bargain', 'deal', 'trade', 'offer', 'need the bell', 'please', 'we ask', 'give it back', 'talk', 'parley', 'negotiate'], set: { 'path': 'bargain' }, go: 'bargain_open' },
        { label: 'fight', hear: ['attack', 'fight', 'for the village', 'kill', 'charge', 'strike'], confirm: true, set: { 'path': 'fight' }, go: 'fight' },
        { label: 'ask who took the bell', quiet: true, hear: ['who took', 'the boy', 'tam', 'thief'], once: true,
          say: [{ v: V, t: 'A boy. He smelled of fear and candle wax. He dropped it when I opened one eye. Then he ran, and I let him. He was too thin to eat.' }] },
        { label: 'ask why he sleeps', quiet: true, hear: ['why', 'sleep', 'what does the bell'], once: true,
          say: [{ v: V, t: 'The bell sings me to sleep, every dusk, for a hundred years. I did not ask for it. But I have come to like the dreams.' }] },
      ],
    },
    bargain_open: {
      say: [
        { v: V, t: 'A bargain. Hm. You want the bell, to put me back to sleep. And what do I get?' },
        { v: V, t: 'Give me something worth a hundred years. A memory. A name. A promise. I will know if it is cheap.' },
      ],
      go: 'bargain',
    },
    bargain: {
      hints: [{ v: V, t: 'A memory, a name, or a promise. I am waiting.' }],
      choices: [
        { label: 'give him a memory', hear: ['memory', 'remember', 'story', 'tell you', 'when i was'], once: true, add: { 'bargain.offers': 1 }, respect: { [V]: 1 },
          check: { stat: 'heart', dc: 12, label: 'a memory that moves him',
            pass: { say: ['{hero} tells it, and the cellar is very quiet.', { v: V, t: 'Yes. I will dream of that.' }], respect: { [V]: 2 }, go: 'weigh' },
            fail: { say: [{ v: V, t: 'Hm. A small memory, from a small life.' }], go: 'weigh' } } },
        { label: 'give him a name', hear: ['name', 'my name', 'true name', 'call me'], once: true, add: { 'bargain.offers': 1 }, respect: { [V]: 2 },
          say: [{ v: V, t: 'A name freely given is a leash, {hero}. Bold. I will keep it safe. Or not.' }], go: 'weigh' },
        { label: 'make him a promise', hear: ['promise', 'swear', 'vow', 'oath', 'word', 'never come back', 'ring it every', 'leave you'], once: true, add: { 'bargain.offers': 1 }, respect: { [V]: 1 },
          say: [{ v: V, t: 'A promise. Mortals break them like twigs. But the bell-keepers kept theirs for a hundred years.' }], go: 'weigh' },
        { label: 'offer gold', quiet: true, hear: ['gold', 'coin', 'silver', 'money', 'pay', 'treasure'], once: true, add: { 'bargain.offers': 1 },
          say: [{ v: V, t: 'You offer coins. To me. In this hall.' }, 'Vhorr laughs, and it is like a kiln door opening.'], go: 'weigh' },
        { label: 'threaten him', quiet: true, hear: ['or else', 'threaten', 'we will kill', 'die', 'make you'], threat: { [V]: 3 }, set: { 'path': 'fight' },
          say: [{ v: V, t: 'Then let us see what you are made of.' }], go: 'fight' },
      ],
    },
    weigh: {
      go: [
        { when: 'top("vhorr.respect") >= 3', go: 'bargain_won' },
        { when: 'bargain.offers >= 3', go: 'bargain_refused' },
        { go: 'bargain_more' },
      ],
    },
    bargain_more: { say: [{ v: V, t: 'Not yet enough. What else?' }], go: 'bargain' },
    bargain_won: {
      say: [
        { v: V, t: 'Enough. Take it. Ring it at dusk, every dusk, and I will dream.' },
        'Vhorr pushes the bell toward you with one claw, curls up on his coins, and closes his eyes.',
      ],
      enter: { mood: { [V]: 'asleep' } },
      go: 'end_sleep',
    },
    bargain_refused: {
      say: [
        { v: V, t: 'Cheap things. All of them. No. I have slept long enough.' },
        'He takes the bell in his jaws, like a dog takes a bone.',
      ],
      go: 'end_flies',
    },
    fight: {
      act: 'Act 3: The fight',
      say: ['Vhorr rises to his full height. Heat rolls off him like off a forge.'],
      fight: { foes: [V], win: 'end_slain', fled: 'end_flies', lose: 'beaten', escape: [{ when: 'has("bell")', go: 'chase' }, { go: 'end_hunt' }] },
      choices: [
        { label: 'ask for mercy', quiet: true, hear: ['mercy', 'stop', 'enough', 'surrender', 'parley', 'we yield', 'talk'], when: 'hp("vhorr") < 0.6',
          say: [{ v: V, t: 'Now you want to talk. Good. So do I.' }], respect: { [V]: 1 }, set: { 'path': 'bargain' }, go: 'bargain_open' },
      ],
    },
    beaten: {
      say: [
        'You wake on the chapel steps, in the rain, every bone aching. Somebody has carried you up here, carefully, the way a cat carries a kitten.',
        'Above the chapel, against the clouds, great wings beat once, twice.',
      ],
      enter: { heal: true },
      go: 'end_flies',
    },
    chase: {
      act: 'Act 3: The chase',
      say: ['Vhorr roars, and the coins jump. You run for the stairs with the bell, and the heat follows you up.'],
      check: { who: 'group', stat: 'grace', dc: 12, label: 'outrun Vhorr',
        pass: { say: ['You burst out of the chapel into the night rain, and the stairway behind you fills with smoke and fury. He does not follow into the open. Not yet.'], go: 'escaped' },
        fail: { say: ['A claw catches the bell and tears it away. Vhorr fills the stairwell, and then the chapel wall simply is not there any more.'], hide: ['bell'], go: 'end_flies' } },
    },
    escaped: {
      go: [{ when: 'village.trust >= 2', go: 'end_sleep' }, { go: 'end_hunt' }],
    },
    // ---------------------------------------------------------------- Act 4: the ending (about 20 min)
    end_sleep: {
      act: 'Act 4: The ending',
      say: [
        'At dusk the next day, the whole of Hollowmere climbs to the chapel. The rope is mended. The Ashen Bell is hung.',
        'Sister Wenna\'s chalk sign is on the pillar still. The village trusted you, and so they listen when you tell them how the bell must be rung.',
        'It rings out over the valley, low and grey and sweet. Far below, Vhorr sighs, and dreams.',
        'Young Tam rings it, the next evening, and every evening after.',
      ],
      end: { title: 'The bell rings, the dragon sleeps' },
    },
    end_hunt: {
      act: 'Act 4: The ending',
      say: [
        'You bring the bell back to Hollowmere. But the village does not trust you, and it does not listen.',
        'They hang the bell in the inn\'s yard, not in the chapel. They ring it at noon, not at dusk, to show it off.',
        'Three nights later the bells of the valley ring again: every bell, all at once, from the wrong direction.',
        'Vhorr is awake, and he is looking for whoever took his dreams.',
      ],
      end: { title: 'The bell stolen, Vhorr hunts' },
    },
    end_slain: {
      act: 'Act 4: The ending',
      say: [
        'Vhorr falls among his coins, and the hall goes cold for the first time in a hundred years.',
        'You carry the Ashen Bell back to Hollowmere. There is no more need to ring it. The village throws a feast anyway.',
        'At the feast they read one name aloud, and they cheer it the loudest: {top:dealt}.',
        'Only Sister Wenna, if you could see her, would look sad.',
      ],
      end: { title: 'Vhorr is slain' },
    },
    end_flies: {
      act: 'Act 4: The ending',
      say: [
        'Vhorr bursts out of the hill into the night, the Ashen Bell in his claws, and climbs into the clouds.',
        'For a long time there is only rain. Then, very far to the north, a bell rings once, from somewhere high in the mountains.',
        'Whatever happens next, it will not happen in Hollowmere.',
      ],
      end: { title: 'Vhorr flies away with the bell' },
    },
  },
};
