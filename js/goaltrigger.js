/*
 * goaltrigger.js — explicit voice/text commands about goals: creating one
 * ("add a goal to X") and completing one ("goal X completed").
 *
 * Deliberately NOT an LLM call for either. Plain phrase matches, so they're
 * instant and free and never add latency to the capture path. Softer,
 * narrated intentions and completions ("remember to reach out to Sam",
 * "finally got round to the dermatologist") are NOT matched here on purpose
 * — those are judgment calls, handled once a week by the debrief's goal
 * suggestions and completion detection instead (see debrief.js).
 */

// Matches "add a goal to X" / "add another goal: X" / "add to goals X" /
// "add goal, X" / "add goal. X" — anything shaped like "add ... goal(s)"
// near the start, in whatever order and with whatever connector word or
// punctuation Whisper happens to transcribe between "goal" and the actual
// text. Deliberately loose here; stripLeadingConnector() below cleans up
// whatever's left, rather than requiring one exact connector shape (a
// stricter regex is what silently dropped several of Magnus's real
// transcriptions — "add to goals X", "add goal, X", "add goal. X").
const ADD_GOAL_RE = /^(?:please\s+)?add\s+(?:a\s+|another\s+|to\s+|this\s+|my\s+)*goals?\b\s*(.*)$/i;

// Other explicit creation shapes — these already extract cleanly, no
// leftover connector word to strip.
const OTHER_CREATE_PATTERNS = [
  /^(?:please\s+)?remind me to\s+(.+)$/i,
  /^new goal\s*[:\-]\s*(.+)$/i,
  /^goal\s*[:\-]\s*(.+)$/i,
];

// Checked before the create patterns — "goal: X completed" would otherwise
// also match "goal: X" above and create a garbled new goal instead of
// completing the existing one.
const COMPLETE_PATTERNS = [
  /^(?:mark\s+)?goal\s+(.+?)\s+(?:as\s+)?(?:completed|complete|done)\.?$/i,
  /^complete(?:d)?\s+(?:the\s+)?goal\s*[:\-]?\s*(.+)$/i,
  /^finish(?:ed)?\s+(?:the\s+)?goal\s*[:\-]?\s*(.+)$/i,
  /^goal\s*[:\-]\s*(.+?)\s+(?:completed|complete|done)\.?$/i,
];

// Strips whatever's sitting between "goal" and the actual goal text: leading
// punctuation ("Add goal, X" / "Add goal. X") and connector words ("of",
// "for", "to", "is", "that is (to)"). Loops so a compound like "is to run a
// marathon" reduces all the way down to "run a marathon", not just one pass.
function stripLeadingConnector(s) {
  let out = (s || '').replace(/^[\s,.:;!-]+/, '');
  let prev;
  do {
    prev = out;
    out = out
      .replace(/^(?:that\s+is\s+to|that\s+is|to|of|for|is)\s+/i, '')
      .replace(/^[\s,.:;!-]+/, '');
  } while (out !== prev && out.length);
  return out.trim();
}

function firstMatch(patterns, t) {
  for (const re of patterns) {
    const m = t.match(re);
    const phrase = m?.[1]?.trim().replace(/[.!]+$/, '');
    if (phrase && phrase.length > 1) return phrase;
  }
  return null;
}

/**
 * @param {string} text  a captured entry's text
 * @returns {string|null} the goal text if this entry is an explicit
 *   "add a goal" command, otherwise null
 */
export function parseGoalTrigger(text) {
  const t = (text || '').trim();
  if (!t) return null;

  const addMatch = t.match(ADD_GOAL_RE);
  if (addMatch) {
    const phrase = stripLeadingConnector(addMatch[1]).replace(/[.!]+$/, '').trim();
    return phrase && phrase.length > 1 ? phrase : null;
  }

  return firstMatch(OTHER_CREATE_PATTERNS, t);
}

/**
 * @param {string} text  a captured entry's text
 * @returns {string|null} the phrase describing which goal was completed, if
 *   this entry is an explicit "goal ... completed" command, otherwise null
 */
export function parseGoalCompletion(text) {
  const t = (text || '').trim();
  return t ? firstMatch(COMPLETE_PATTERNS, t) : null;
}

function normWords(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Find the goal a spoken completion phrase most likely refers to. Word-overlap
 * scoring, not exact text — deliberately conservative: returns null rather
 * than guess when nothing stands out clearly.
 *
 * Callers should pass every not-yet-done goal, not just this week's — a
 * spoken "complete goal X" has no natural way to say which week it was set
 * in, and an unfinished goal easily ages into a past week before you get
 * round to it.
 * @param {string} phrase
 * @param {{id, text}[]} goals
 * @returns {{id, text}|null}
 */
export function findMatchingGoal(phrase, goals) {
  const target = new Set(normWords(phrase));
  if (!target.size || !goals?.length) return null;

  let best = null;
  let bestScore = 0;
  let secondScore = 0;

  for (const g of goals) {
    const words = new Set(normWords(g.text));
    if (!words.size) continue;
    const overlap = [...target].filter((w) => words.has(w)).length;
    const score = overlap / Math.min(target.size, words.size);
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      best = g;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  // Require real confidence and no close runner-up, so an ambiguous phrase
  // does the safe thing (nothing) instead of completing the wrong goal.
  if (best && bestScore >= 0.5 && bestScore - secondScore >= 0.15) return best;
  return null;
}
