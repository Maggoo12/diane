/*
 * goals.js — the week's goals: add, tick off, delete.
 * Always scoped to the current week (see db.weekOf).
 */

import { addGoal, getGoals, toggleGoal, deleteGoal, weekOf } from './db.js';

let listEl, inputEl, addBtnEl;

export function initGoals() {
  listEl = document.getElementById('goals-list');
  inputEl = document.getElementById('goal-input');
  addBtnEl = document.getElementById('goal-add');

  addBtnEl.addEventListener('click', submit);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  renderGoals();
}

async function submit() {
  const text = inputEl.value.trim();
  if (!text) return;
  await addGoal({ text });
  inputEl.value = '';
  renderGoals();
}

export async function renderGoals() {
  if (!listEl) return;
  const goals = await getGoals(weekOf());
  listEl.innerHTML = '';

  if (!goals.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No goals set for this week yet.';
    listEl.appendChild(p);
    return;
  }

  for (const g of goals) listEl.appendChild(renderGoal(g));
}

function renderGoal(g) {
  const row = document.createElement('label');
  row.className = 'goal' + (g.done ? ' is-done' : '');

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = g.done;
  cb.addEventListener('change', async () => {
    await toggleGoal(g.id);
    renderGoals();
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
    renderGoals();
  });

  row.append(cb, span, del);
  return row;
}
