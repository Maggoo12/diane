/*
 * goaltrigger.js — the explicit "add a goal to X" / "remind me to X" command.
 *
 * Deliberately NOT an LLM call. This is a plain phrase match so it's instant
 * and free and never adds latency to the capture path. Softer, narrated
 * intentions ("remember to reach out to Sam") are NOT matched here on
 * purpose — those are judgment calls, handled once a week by the debrief's
 * goal suggestions instead (see debrief.js).
 */

const PATTERNS = [
  /^(?:please\s+)?add (?:a |another )?goal(?:\s*(?:to|:|-)\s*|\s+)(.+)$/i,
  /^(?:please\s+)?remind me to\s+(.+)$/i,
  /^new goal\s*[:\-]\s*(.+)$/i,
  /^goal\s*[:\-]\s*(.+)$/i,
];

/**
 * @param {string} text  a captured entry's text
 * @returns {string|null} the goal text if this entry is an explicit goal
 *   command, otherwise null
 */
export function parseGoalTrigger(text) {
  const t = (text || '').trim();
  if (!t) return null;
  for (const re of PATTERNS) {
    const m = t.match(re);
    const goal = m?.[1]?.trim().replace(/[.!]+$/, '');
    if (goal && goal.length > 1) return goal;
  }
  return null;
}
