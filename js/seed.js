/*
 * seed.js — a synthetic ~3 weeks of journal entries + goals.
 *
 * Purpose: something realistic to point the weekly debrief at while we build
 * and tune it, before there's 3 weeks of real entries. Dev-only — triggered
 * from the "Load sample data" button in the Week view's settings.
 *
 * The corpus has a few deliberate threads so we can see whether the summary
 * picks them up:
 *   - a mole the writer keeps meaning to get checked and never books
 *   - a work presentation: stress before, relief after
 *   - an on-again/off-again running habit
 *   - a rough patch with a partner, resolved by one good conversation
 *   - poor sleep tracking the stressful week
 */

import { importEntry, addGoal, weekOf } from './db.js';

// daysAgo / hh / mm / source / text
const ENTRIES = [
  // ---- ~3 weeks ago -------------------------------------------------------
  [20, 7, 40, 'voice', "Slept badly again. Keep waking around 4 and my brain just starts listing things. Coffee is not going to fix this but here we are."],
  [20, 13, 5, 'text', "Noticed a mole on my left shoulder in the mirror this morning that I don't remember being that dark. Probably nothing. Should get it looked at."],
  [20, 21, 30, 'voice', "Good run after work, 5k, felt light for once. First time in maybe two weeks I actually wanted to go."],
  [19, 8, 15, 'text', "Standup ran 40 minutes again. If we just wrote three sentences in the channel we'd all have our mornings back."],
  [19, 19, 50, 'voice', "Dinner with Sam. Hadn't realised how much I needed to just laugh about nothing for two hours."],
  [18, 12, 0, 'text', "Booked nothing. Meant to call the dermatologist and the day just evaporated. Tomorrow."],
  [17, 22, 10, 'voice', "Second run this week. Slower but I did it. Legs are complaining."],
  [16, 9, 5, 'text', "The Q3 presentation landed on me. Three weeks out. I can already feel how this goes if I don't start now."],
  [16, 23, 40, 'voice', "Up too late reading. Worth it though, the Ishiguro is getting under my skin. That quiet dread he does so well."],

  // ---- ~2 weeks ago -----------------------------------------------------
  [14, 7, 20, 'text', "New week. Trying to be deliberate: prep the presentation in daylight, no all-nighter this time. Run three times. Call Dad, it's been too long."],
  [14, 18, 30, 'voice', "Half a day on slides and I have four I actually like. That's fine. That's progress."],
  [13, 13, 15, 'text', "Tense evening with Alex yesterday. Something about me being 'somewhere else' lately. Not wrong, honestly. The work stuff is eating me."],
  [13, 21, 0, 'voice', "Didn't run. Told myself I would and then didn't. Annoyed about it more than the run deserves."],
  [12, 8, 45, 'text', "Still haven't booked the dermatologist. It's turning into a bit that isn't funny. Putting it at the top of tomorrow."],
  [12, 20, 15, 'voice', "Long walk with Alex after dinner and we actually talked. Properly. I'd been so far in my own head I forgot they're in this too. Better tonight."],
  [11, 7, 50, 'text', "Ran before work! 4k in the cold and dark and I feel like I could take on the day."],
  [11, 16, 30, 'voice', "Presentation run-through with Priya. She poked holes in the middle section, which is exactly what I needed. Rework tonight and tomorrow."],
  [10, 12, 30, 'text', "Called Dad. He's fine, garden's a disaster, the usual. Twenty minutes and I feel lighter. Why do I let that lapse."],
  [10, 23, 20, 'voice', "Late again on the slides but not stupid late. The story hangs together now. One more pass."],
  [9, 9, 0, 'text', "Second run this week done. Two out of three. I'll take two."],
  [8, 19, 45, 'voice', "Finished the Ishiguro on the train home. Sat with it for a stop past mine. Don't want to start anything else for a day or two."],

  // ---- last week -------------------------------------------------------
  [7, 7, 30, 'text', "Presentation day. Weirdly calm. Slept okay for the first time in ages."],
  [7, 15, 10, 'voice', "It went well. Genuinely well. The middle section Priya flagged got a nod from the director. Relief is a physical thing, I can feel my shoulders coming down."],
  [7, 22, 0, 'text', "Celebrated with too much pasta and an early night. No notes."],
  [6, 10, 20, 'voice', "Slow Saturday. Coffee on the step in actual sunlight. The mole thing crossed my mind again — writing it here so I stop pretending I'll remember."],
  [6, 17, 0, 'text', "Hike with Alex and Sam up to the ridge. Wind nearly took us off the top but the view was worth the whole week."],
  [5, 11, 0, 'voice', "Sunday reset. Laundry, groceries, a vague plan for the week. Feels good to have a head that isn't full of slides."],
  [4, 8, 10, 'text', "Back to it. Goals for the week: actually book the dermatologist, two gym sessions, plan the trip with Alex, inbox to zero by Friday."],
  [4, 13, 40, 'voice', "Inbox is a swamp after last week. An hour in and I've barely made a dent. Kept going anyway."],
  [3, 7, 45, 'text', "Gym before work, first session of the week. Legs day, regretting it already, in a good way."],
  [3, 20, 30, 'voice', "Alex found a place for the trip — a little cabin two hours north, wood stove, no wifi. Booked it for the long weekend. Something to point at."],
  [2, 9, 15, 'text', "Inbox actually approaching zero. Ruthless with the archive button today. It's oddly satisfying."],
  [2, 18, 0, 'voice', "Skipped the second gym session. Work ran long and I chose the sofa. Not thrilled but not going to spiral about it."],
  [1, 8, 30, 'text', "Good sleep three nights running now. Wild what not carrying a deadline does for a brain."],
  [1, 19, 20, 'voice', "Quiet evening. Started a new book, nothing's grabbed me yet. That's okay, it's early."],
  [0, 9, 0, 'text', "Midweek-ish. Trip's booked, inbox is basically clear, one gym session in. Still have not called the dermatologist. It's becoming genuinely absurd."],
];

// week offset (daysAgo used to pick the week) / text / done
const GOALS = [
  [16, 'Book the dermatologist about the mole', false],
  [16, 'Run three times', true],
  [16, 'Finish the Ishiguro novel', false],

  [11, 'Prep the Q3 presentation in daylight — no all-nighter', true],
  [11, 'Run three times', false],
  [11, 'Call Dad', true],

  [3, 'Actually book that dermatologist appointment', false],
  [3, 'Two gym sessions', false],
  [3, 'Plan the weekend trip with Alex', true],
  [3, 'Inbox to zero by Friday', false],
];

function isoDaysAgo(daysAgo, hh, mm) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

/**
 * Load the sample corpus. Returns a count summary. Safe to call more than
 * once, but it will add duplicates — meant to be run against a cleared DB.
 */
export async function seedDatabase() {
  for (const [daysAgo, hh, mm, source, text] of ENTRIES) {
    await importEntry({ text, source, createdAt: isoDaysAgo(daysAgo, hh, mm) });
  }
  for (let i = 0; i < GOALS.length; i++) {
    const [daysAgo, text, done] = GOALS[i];
    const week = weekOf(new Date(Date.now() - daysAgo * 86400000));
    // i minutes apart so getGoals()'s createdAt sort is stable and ordered.
    await addGoal({ text, week, done, createdAt: isoDaysAgo(daysAgo, 7, i) });
  }
  return { entries: ENTRIES.length, goals: GOALS.length };
}
