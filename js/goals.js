/*
 * goals.js — a goals panel: add, tick off, delete, scoped to one week.
 * Used twice: "This week's goals" (current week) and "Next week's goals"
 * (weekAfter(current) — where accepted debrief suggestions land).
 */

import { addGoal, getGoals, toggleGoal, deleteGoal, weekOf } from './db.js';

function createPanel({ inputId, addBtnId, listId, emptyText, getWeek }) {
  const listEl = document.getElementById(listId);
  const inputEl = document.getElementById(inputId);
  const addBtnEl = document.getElementById(addBtnId);
  if (!listEl || !inputEl || !addBtnEl) return { render: async () => {} };

  async function submit() {
    const text = inputEl.value.trim();
    if (!text) return;
    await addGoal({ text, week: getWeek() });
    inputEl.value = '';
    render();
  }
  addBtnEl.addEventListener('click', submit);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  async function render() {
    const goals = await getGoals(getWeek());
    listEl.innerHTML = '';
    if (!goals.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = emptyText;
      listEl.appendChild(p);
      return;
    }
    for (const g of goals) listEl.appendChild(renderGoalRow(g, render));
  }

  render();
  return { render };
}

function renderGoalRow(g, onChange) {
  const row = document.createElement('label');
  row.className = 'goal' + (g.done ? ' is-done' : '');

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = g.done;
  cb.addEventListener('change', async () => {
    await toggleGoal(g.id);
    onChange();
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
    onChange();
  });

  row.append(cb, span, del);
  return row;
}

// --- this week's panel ------------------------------------------------
let currentPanel = null;
export function initGoals() {
  currentPanel = createPanel({
    inputId: 'goal-input',
    addBtnId: 'goal-add',
    listId: 'goals-list',
    emptyText: 'No goals set for this week yet.',
    getWeek: () => weekOf(),
  });
}
export async function renderGoals() {
  await currentPanel?.render();
}

// --- next week's panel -------------------------------------------------
let nextPanel = null;
/** @param {() => string} getNextWeek */
export function initNextWeekGoals(getNextWeek) {
  nextPanel = createPanel({
    inputId: 'goal-input-next',
    addBtnId: 'goal-add-next',
    listId: 'goals-list-next',
    emptyText: 'No goals set for next week yet.',
    getWeek: getNextWeek,
  });
}
export async function renderNextWeekGoals() {
  await nextPanel?.render();
}
