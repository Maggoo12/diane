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

const CREATE_PATTERNS = [
  /^(?:please\s+)?add (?:a |another )?goal(?:\s*(?:to|:|-)\s*|\s+)(.+)$/i,
  /^(?:please\s+)?remind me to\s+(.+)$/i,
  /^new goal\s*[:\-]\s*(.+)$/i,
  /^goal\s*[:\-]\s*(.+)$/i,
];

// Checked before CREATE_PATTERNS — "goal: X completed" would otherwise also
// match the last create pattern above and create a garbled new goal instead
// of completing the existing one.
const COMPLETE_PATTERNS = [
  /^(?:mark\s+)?goal\s+(.+?)\s+(?:as\s+)?(?:completed|complete|done)\.?$/i,
  /^complete(?:d)?\s+(?:the\s+)?goal\s*[:\-]?\s*(.+)$/i,
  /^finish(?:ed)?\s+(?:the\s+)?goal\s*[:\-]?\s*(.+)$/i,
  /^goal\s*[:\-]\s*(.+?)\s+(?:completed|complete|done)\.?$/i,
];

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
  return t ? firstMatch(CREATE_PATTERNS, t) : null;
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
