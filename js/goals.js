/*
 * goals.js — a goals panel: add, tick off, edit, delete, scoped to one week,
 * plus a "Complete all" bulk action. Used twice: "This week's goals" (current
 * week) and "Next week's goals" (weekAfter(current) — where accepted debrief
 * suggestions land). renderGoalRow is also reused by goalhistory.js for past
 * weeks, so all three places behave identically.
 */

import { addGoal, getGoals, toggleGoal, deleteGoal, updateGoalText, completeGoal, setGoalDone, weekOf } from './db.js';

function createPanel({ inputId, addBtnId, listId, emptyText, getWeek, completeAllId }) {
  const listEl = document.getElementById(listId);
  const inputEl = document.getElementById(inputId);
  const addBtnEl = document.getElementById(addBtnId);
  const completeAllBtn = completeAllId ? document.getElementById(completeAllId) : null;
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

  // "Complete all" ticks off every not-yet-done goal in this panel; a second
  // click ("Undo") restores exactly those goals — never one you'd already
  // ticked yourself, before or since. Lives only in memory for this session,
  // not persisted — reloading the page forgets it, same as any other undo.
  let lastBulkIds = null;

  completeAllBtn?.addEventListener('click', async () => {
    if (lastBulkIds) {
      for (const id of lastBulkIds) await setGoalDone(id, false);
      lastBulkIds = null;
    } else {
      const goals = await getGoals(getWeek());
      const undone = goals.filter((g) => !g.done);
      if (!undone.length) return;
      lastBulkIds = undone.map((g) => g.id);
      for (const g of undone) await completeGoal(g.id);
    }
    render();
  });

  function updateCompleteAllBtn(goals) {
    if (!completeAllBtn) return;
    if (!goals.length) {
      completeAllBtn.hidden = true;
      lastBulkIds = null;
      return;
    }
    completeAllBtn.hidden = false;
    completeAllBtn.classList.toggle('is-undo', !!lastBulkIds);
    completeAllBtn.textContent = lastBulkIds ? 'Undo' : 'Complete all';
    completeAllBtn.disabled = !lastBulkIds && !goals.some((g) => !g.done);
  }

  async function render() {
    const goals = await getGoals(getWeek());
    listEl.innerHTML = '';
    if (!goals.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = emptyText;
      listEl.appendChild(p);
    } else {
      for (const g of goals) listEl.appendChild(renderGoalRow(g, render));
    }
    updateCompleteAllBtn(goals);
  }

  render();
  return { render };
}

/** One goal row: checkbox, text (editable via ✎), delete. Shared by both
 *  panels here and by goalhistory.js's past-week blocks. */
export function renderGoalRow(g, onChange) {
  const row = document.createElement('div');
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

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'goal__edit';
  editBtn.textContent = '✎';
  editBtn.setAttribute('aria-label', 'Edit goal');
  editBtn.addEventListener('click', () => startEdit());

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'goal__delete';
  del.textContent = '×';
  del.setAttribute('aria-label', 'Delete goal');
  del.addEventListener('click', async () => {
    if (!confirm('Delete this goal?')) return;
    await deleteGoal(g.id);
    onChange();
  });

  const actions = document.createElement('div');
  actions.className = 'goal__actions';
  actions.append(editBtn, del);

  row.append(cb, span, actions);

  function startEdit() {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'goal__edit-input';
    input.value = g.text;

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'goal__edit-save';
    saveBtn.textContent = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'goal__edit-cancel';
    cancelBtn.textContent = 'Cancel';

    const editRow = document.createElement('div');
    editRow.className = 'goal__edit-actions';
    editRow.append(saveBtn, cancelBtn);

    span.replaceWith(input);
    actions.replaceWith(editRow);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    saveBtn.addEventListener('click', async () => {
      const val = input.value.trim();
      if (!val) return;
      await updateGoalText(g.id, val);
      onChange();
    });
    cancelBtn.addEventListener('click', () => {
      input.replaceWith(span);
      editRow.replaceWith(actions);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveBtn.click(); }
      if (e.key === 'Escape') cancelBtn.click();
    });
  }

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
    completeAllId: 'goal-complete-all',
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
    completeAllId: 'goal-complete-all-next',
  });
}
export async function renderNextWeekGoals() {
  await nextPanel?.render();
}
