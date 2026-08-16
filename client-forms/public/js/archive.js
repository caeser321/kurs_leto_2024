const rows = document.getElementById('rows');
const empty = document.getElementById('empty');
const search = document.getElementById('search');

let debounceTimer = null;

search.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => load(search.value), 250);
});

load('');

async function load(query) {
  try {
    const response = await fetch(`/api/submissions?search=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { items } = await response.json();
    render(items);
  } catch (error) {
    console.error(error);
    rows.replaceChildren();
    empty.hidden = false;
    empty.textContent = 'Не удалось загрузить архив.';
  }
}

function render(items) {
  rows.replaceChildren();

  if (items.length === 0) {
    empty.hidden = false;
    empty.textContent = search.value
      ? 'Ничего не найдено.'
      : 'Пока нет сохранённых анкет.';
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

  const open = document.createElement('a');
  open.className = 'link';
  open.href = `/api/submissions/${encodeURIComponent(item.documentId)}/pdf`;
  open.target = '_blank';
  open.rel = 'noopener';
  open.textContent = 'Открыть';

  const download = document.createElement('a');
  download.className = 'link';
  download.href = `/api/submissions/${encodeURIComponent(item.documentId)}/pdf?download=1`;
  download.textContent = 'Скачать';
  download.style.marginLeft = '14px';

  td.append(open, download);
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
