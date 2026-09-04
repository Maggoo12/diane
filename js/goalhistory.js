/*
 * goalhistory.js — past weeks' goals, read from db but not editable-by-week
 * scoping the way goals.js is. Same row (tick/edit/delete) via goals.js's
 * shared renderGoalRow, grouped by week and collapsed by default so it
 * doesn't crowd the current week — plus a per-week "Complete all" / Undo,
 * for the common case: an old goal you actually did but never told Diane.
 */

import { getAllGoals, completeGoal, setGoalDone, weekOf, weekAfter } from './db.js';
import { renderGoalRow } from './goals.js';

let containerEl = null;

// week -> array of goal ids the last "Complete all" click for that week
// touched, so a follow-up "Undo" restores exactly those. In memory only,
// same lifetime as the goals panels' bulk state.
const bulkByWeek = new Map();

export function initGoalHistory() {
  containerEl = document.getElementById('goal-history');
  render();
}

export async function render() {
  if (!containerEl) return;

  // Rebuilding the <details> elements below would otherwise collapse
  // whichever weeks the user had open — remember them first.
  const openWeeks = new Set(
    [...containerEl.querySelectorAll('details[open]')].map((d) => d.dataset.week)
  );

  const all = await getAllGoals();
  const currentWeek = weekOf();
  const nextWeek = weekAfter(currentWeek);

  const byWeek = new Map();
  for (const g of all) {
    // Current week has its own card; next week has its own ("Next week's
    // goals") — this list is strictly the weeks before now.
    if (g.weekOf === currentWeek || g.weekOf === nextWeek) continue;
    if (g.weekOf > currentWeek) continue; // any other future week — shouldn't happen yet, but don't mislabel it "past"
    if (!byWeek.has(g.weekOf)) byWeek.set(g.weekOf, []);
    byWeek.get(g.weekOf).push(g);
  }
  const weeks = [...byWeek.keys()].sort((a, b) => b.localeCompare(a)); // newest first

  containerEl.innerHTML = '';
  if (!weeks.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No past weeks yet.';
    containerEl.appendChild(p);
    return;
  }

  for (const week of weeks) {
    const goals = byWeek.get(week).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const done = goals.filter((g) => g.done).length;

    const details = document.createElement('details');
    details.className = 'week-history';
    details.dataset.week = week;
    if (openWeeks.has(week)) details.open = true;

    const summary = document.createElement('summary');
    summary.textContent = `Week of ${fmtWeek(week)} — ${done}/${goals.length} done`;
    details.appendChild(summary);

    const bulkRow = document.createElement('div');
    bulkRow.className = 'card__subactions';
    const bulkBtn = document.createElement('button');
    bulkBtn.type = 'button';
    bulkBtn.className = 'goal-bulk-btn';
    bulkRow.appendChild(bulkBtn);
    details.appendChild(bulkRow);

    function updateBulkBtn() {
      const ids = bulkByWeek.get(week);
      bulkBtn.classList.toggle('is-undo', !!ids);
      bulkBtn.textContent = ids ? 'Undo' : 'Complete all';
      bulkBtn.disabled = !ids && !goals.some((g) => !g.done);
    }
    updateBulkBtn();

    bulkBtn.addEventListener('click', async () => {
      const ids = bulkByWeek.get(week);
      if (ids) {
        for (const id of ids) await setGoalDone(id, false);
        bulkByWeek.delete(week);
      } else {
        const undone = goals.filter((g) => !g.done);
        if (!undone.length) return;
        bulkByWeek.set(week, undone.map((g) => g.id));
        for (const g of undone) await completeGoal(g.id);
      }
      render();
    });

    const list = document.createElement('div');
    list.className = 'goals-list';
    for (const g of goals) list.appendChild(renderGoalRow(g, render));
    details.appendChild(list);

    containerEl.appendChild(details);
  }
}

function fmtWeek(week) {
  return new Date(`${week}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
