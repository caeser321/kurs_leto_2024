/**
 * Экран архива: список анкет, сохранённых на планшете.
 * Каждую можно отправить наружу через системное меню «Поделиться»,
 * либо выгрузить все разом.
 */

import { store, isNative } from './device-store.js';

const rows = document.getElementById('rows');
const empty = document.getElementById('empty');
const search = document.getElementById('search');
const shareAll = document.getElementById('share-all');
const summary = document.getElementById('summary');

let debounceTimer = null;

search.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => load(search.value), 250);
});

shareAll.addEventListener('click', async () => {
  shareAll.disabled = true;
  try {
    await store.shareAll();
  } catch (error) {
    if (!/cancel/i.test(String(error?.message))) alert(error.message);
  } finally {
    shareAll.disabled = false;
  }
});

load('');

async function load(query) {
  try {
    const { total, items } = await store.list({ search: query });
    render(items, total);
  } catch (error) {
    console.error(error);
    rows.replaceChildren();
    empty.hidden = false;
    empty.textContent = 'Не удалось прочитать архив.';
  }
}

function render(items, total) {
  rows.replaceChildren();
  shareAll.disabled = total === 0;

  summary.textContent = total === 0 ? '' : `Всего анкет: ${total}`;

  if (items.length === 0) {
    empty.hidden = false;
    empty.textContent = search.value ? 'Ничего не найдено.' : 'Пока нет сохранённых анкет.';
    return;
  }

  empty.hidden = true;

  for (const item of items) {
    const row = document.createElement('tr');
    row.append(
      cell(item.clientName, { bold: true }),
      cell(item.documentId, { nowrap: true }),
      cell(formatDateTime(item.createdAt), { nowrap: true }),
      actionsCell(item),
    );
    rows.append(row);
  }
}

function cell(text, { bold = false, nowrap = false } = {}) {
  const td = document.createElement('td');
  if (nowrap) td.className = 'nowrap';

  if (bold) {
    const strong = document.createElement('strong');
    strong.textContent = text;
    td.append(strong);
  } else {
    td.textContent = text;
  }

  return td;
}

function actionsCell(item) {
  const td = document.createElement('td');
  td.className = 'nowrap';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button--ghost button--small';
  button.textContent = isNative ? 'Поделиться' : 'Скачать';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await store.share(item.documentId, item.clientName);
    } catch (error) {
      if (!/cancel/i.test(String(error?.message))) alert(error.message);
    } finally {
      button.disabled = false;
    }
  });

  td.append(button);
  return td;
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
