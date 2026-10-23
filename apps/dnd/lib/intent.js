// What a player said, to what the scenario knows. Players speak (later through speech recognition on the PC; in trial runs typed by
// them or by the game master); a choice of the scenario lists phrases it listens for (`hear`). A phrase matches when all its words
// are in what was said, in that order, each as the start of a word ("attack" hears "attacking"); a phrase preceded by a no-word
// ("don't attack", "never attack") does not count. The best match is the one with the most matched words; a tie goes to the first.
// No language model (decision 5 of the design): what is not listened for is the players talking among themselves.
//   norm(text) -> [words]
//   match(text, options) -> { option, phrase, score } | null       options: [{ hear: ['phrase', ...], ... }]
(function (D) {
  const NOT = new Set(['not', "don't", 'dont', 'never', 'no', "won't", 'wont', 'stop', "shouldn't", 'shouldnt', "mustn't"]);
  const FILLER = new Set(['the', 'a', 'an', 'to', 'of', 'we', 'i', 'let', "let's", 'lets', 'us', 'please', 'will', 'should', 'can', 'just', 'it']);

  const norm = (text) => String(text || '').toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
  // what a phrase needs: its words without the fillers (a phrase that is all fillers keeps them)
  const need = (phrase) => { const w = norm(phrase); const k = w.filter((x) => !FILLER.has(x)); return k.length ? k : w; };
  const starts = (word, want) => word === want || (want.length >= 3 && word.startsWith(want)) || (want.length >= 4 && want.endsWith('e') && word.startsWith(want.slice(0, -1)));

  // where the phrase's words are found in order (the index of each), or null
  function find(words, want) {
    const at = [];
    let i = 0;
    for (const w of want) {
      while (i < words.length && !starts(words[i], w)) i++;
      if (i >= words.length) return null;
      at.push(i++);
    }
    return at;
  }
  function negated(words, first) {
    for (let k = Math.max(0, first - 2); k < first; k++) if (NOT.has(words[k])) return true;
    return false;
  }

  function match(text, options) {
    const words = norm(text);
    if (!words.length) return null;
    let best = null;
    for (const option of options || []) {
      for (const phrase of option.hear || []) {
        const want = need(phrase), at = find(words, want);
        if (!at || negated(words, at[0])) continue;
        const score = want.length + want.join('').length / 100;
        if (!best || score > best.score) best = { option, phrase, score };
      }
    }
    return best;
  }

  const YES = ['yes', 'yeah', 'yep', 'aye', 'agreed', 'agree', 'do it', 'sure', 'okay', 'ok', 'go'];
  const NO = ['no', 'nope', 'wait', 'stop', 'not yet', 'hold on', 'cancel'];
  // a yes or a no (for a choice that asks everyone first): 'yes' | 'no' | null
  function yesNo(text) {
    const w = norm(text);
    if (w.some((x) => NOT.has(x)) || match(text, [{ hear: NO }])) return 'no';          // ("I don't agree" is a no)
    return match(text, [{ hear: YES }]) ? 'yes' : null;
  }

  D.intent = { norm, match, yesNo };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.DND = globalThis.DND || {}));
