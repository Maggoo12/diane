/*
 * goalhistory.js — past weeks' goals, read from db but not editable-by-week
 * scoping the way goals.js is. Same tick/delete behaviour, just grouped by
 * week and collapsed by default so it doesn't crowd the current week.
 */

import { getAllGoals, toggleGoal, deleteGoal, weekOf, weekAfter } from './db.js';

let containerEl = null;

export function initGoalHistory() {
  containerEl = document.getElementById('goal-history');
  render();
}

export async function render() {
  if (!containerEl) return;
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
    const summary = document.createElement('summary');
    summary.textContent = `Week of ${fmtWeek(week)} — ${done}/${goals.length} done`;
    details.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'goals-list';
    for (const g of goals) list.appendChild(renderGoal(g));
    details.appendChild(list);

    containerEl.appendChild(details);
  }
}

function fmtWeek(week) {
  return new Date(`${week}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderGoal(g) {
  const row = document.createElement('label');
  row.className = 'goal' + (g.done ? ' is-done' : '');

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = g.done;
  cb.addEventListener('change', async () => {
    await toggleGoal(g.id);
    render();
  });

  const span = document.createElement('span');
  span.className = 'goal__text';
  span.textContent = g.text;

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'goal__delete';
  del.textContent = '×';
  del.setAttribute('aria-label', 'Delete goal');
  del.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!confirm('Delete this goal?')) return;
    await deleteGoal(g.id);
    render();
  });

  row.append(cb, span, del);
  return row;
}
