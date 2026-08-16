import { SignaturePad } from './signature-pad.js';

const elements = {
  form: document.getElementById('form'),
  sections: document.getElementById('sections'),
  loading: document.getElementById('loading'),
  title: document.getElementById('title'),
  org: document.getElementById('org'),
  submit: document.getElementById('submit'),
  formError: document.getElementById('form-error'),
  signatureTitle: document.getElementById('signature-title'),
  signatureStatement: document.getElementById('signature-statement'),
  signatureError: document.getElementById('signature-error'),
  signatureHint: document.getElementById('signature-hint'),
  signaturePlaceholder: document.getElementById('signature-placeholder'),
  canvas: document.getElementById('signature-canvas'),
  undo: document.getElementById('undo'),
  clear: document.getElementById('clear'),
  success: document.getElementById('success'),
  successId: document.getElementById('success-id'),
  successOpen: document.getElementById('success-open'),
  successDownload: document.getElementById('success-download'),
  successNew: document.getElementById('success-new'),
};

/** Поля, которым тесно в половине строки. */
const WIDE_TYPES = new Set(['textarea', 'checkbox', 'radio']);

let form = null;
let pad = null;

init();

async function init() {
  try {
    const response = await fetch('/api/form');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    form = await response.json();
  } catch (error) {
    elements.loading.textContent = 'Не удалось загрузить анкету. Обновите страницу.';
    console.error(error);
    return;
  }

  document.title = form.title;
  elements.title.textContent = form.title;
  elements.org.textContent = form.organization || '';

  if (form.signature?.label) elements.signatureTitle.textContent = form.signature.label;
  if (form.signature?.statement) {
    elements.signatureStatement.textContent = form.signature.statement;
  }

  renderSections(form);

  pad = new SignaturePad(elements.canvas, {
    onChange: (instance) => {
      elements.signaturePlaceholder.hidden = !instance.isEmpty();
      if (!instance.isEmpty()) hideError(elements.signatureError);
    },
    onPenDetected: () => {
      elements.signatureHint.textContent =
        'Стилус распознан: нажим задаёт толщину линии, случайные касания ладонью игнорируются.';
    },
  });

  // onChange срабатывает в конце штриха, а подсказку нужно убрать сразу,
  // как только перо коснулось поля.
  elements.canvas.addEventListener('pointerdown', () => {
    elements.signaturePlaceholder.hidden = true;
  });

  elements.undo.addEventListener('click', () => pad.undo());
  elements.clear.addEventListener('click', () => pad.clear());
  elements.form.addEventListener('submit', onSubmit);
  elements.successNew.addEventListener('click', startNewForm);

  elements.loading.hidden = true;
  elements.form.hidden = false;
}

function renderSections(schema) {
  const fragment = document.createDocumentFragment();

  for (const section of schema.sections) {
    const wrapper = document.createElement('section');
    wrapper.className = 'section';

    const heading = document.createElement('h2');
    heading.className = 'section__title';
    heading.textContent = section.title;
    wrapper.append(heading);

    const grid = document.createElement('div');
    grid.className = 'fields';
    for (const field of section.fields || []) {
      grid.append(renderField(field));
    }
    wrapper.append(grid);

    fragment.append(wrapper);
  }

  elements.sections.append(fragment);
}

function renderField(field) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  wrapper.dataset.field = field.name;
  if (WIDE_TYPES.has(field.type) || field.wide) wrapper.classList.add('field--wide');

  if (field.type !== 'checkbox') {
    wrapper.append(renderLabel(field));
  }

  wrapper.append(renderControl(field));

  if (field.hint) {
    const hint = document.createElement('p');
    hint.className = 'field__hint';
    hint.textContent = field.hint;
    wrapper.append(hint);
  }

  const error = document.createElement('p');
  error.className = 'field__error';
  error.dataset.errorFor = field.name;
  error.hidden = true;
  wrapper.append(error);

  return wrapper;
}

function renderLabel(field) {
  const label = document.createElement('label');
  label.className = 'field__label';
  label.setAttribute('for', `field-${field.name}`);
  label.textContent = field.label;

  if (field.required) {
    const mark = document.createElement('span');
    mark.className = 'field__required';
    mark.textContent = '*';
    mark.title = 'Обязательное поле';
    label.append(mark);
  }

  return label;
}

function renderControl(field) {
  const id = `field-${field.name}`;

  if (field.type === 'checkbox') {
    const label = document.createElement('label');
    label.className = 'choice choice--block';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.name = field.name;

    const text = document.createElement('span');
    text.textContent = field.label;
    if (field.required) {
      const mark = document.createElement('span');
      mark.className = 'field__required';
      mark.textContent = '*';
      text.append(mark);
    }

    label.append(input, text);
    input.addEventListener('change', () => clearFieldError(field.name));
    return label;
  }

  if (field.type === 'radio') {
    const group = document.createElement('div');
    group.className = 'choices';
    group.setAttribute('role', 'radiogroup');

    field.options.forEach((option, index) => {
      const label = document.createElement('label');
      label.className = 'choice';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = field.name;
      input.value = option;
      if (index === 0) input.id = id;

      const text = document.createElement('span');
      text.textContent = option;

      label.append(input, text);
      input.addEventListener('change', () => clearFieldError(field.name));
      group.append(label);
    });

    return group;
  }

  if (field.type === 'select') {
    const select = document.createElement('select');
    select.id = id;
    select.name = field.name;

    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '— выберите —';
    select.append(empty);

    for (const option of field.options) {
      const item = document.createElement('option');
      item.value = option;
      item.textContent = option;
      select.append(item);
    }

    select.addEventListener('change', () => clearFieldError(field.name));
    return select;
  }

  const input = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
  input.id = id;
  input.name = field.name;

  if (field.type === 'textarea') {
    input.rows = field.rows || 3;
  } else {
    input.type = field.type || 'text';
  }

  if (field.maxLength) input.maxLength = field.maxLength;
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.autocomplete) input.autocomplete = field.autocomplete;
  if (field.type === 'tel') input.inputMode = 'tel';

  input.addEventListener('input', () => clearFieldError(field.name));
  return input;
}

/** Собирает значения всех полей анкеты в объект для отправки на сервер. */
function collectValues() {
  const values = {};
  const data = new FormData(elements.form);

  for (const section of form.sections) {
    for (const field of section.fields || []) {
      if (field.type === 'checkbox') {
        values[field.name] = elements.form.elements[field.name]?.checked === true;
      } else {
        values[field.name] = (data.get(field.name) || '').toString();
      }
    }
  }

  return values;
}

async function onSubmit(event) {
  event.preventDefault();
  clearAllErrors();

  const signature = pad.toDataURL();
  if (!signature && form.signature?.required !== false) {
    showError(elements.signatureError, 'Поставьте подпись');
    elements.canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  elements.submit.disabled = true;
  elements.submit.textContent = 'Сохранение…';

  try {
    const response = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: collectValues(), signature }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      applyServerErrors(result);
      return;
    }

    showSuccess(result);
  } catch (error) {
    console.error(error);
    showError(elements.formError, 'Не удалось связаться с сервером. Проверьте подключение к сети.');
  } finally {
    elements.submit.disabled = false;
    elements.submit.textContent = 'Отправить и сохранить PDF';
  }
}

function applyServerErrors(result) {
  const errors = result.errors || {};
  let firstInvalid = null;

  for (const [name, message] of Object.entries(errors)) {
    if (name === '__signature') {
      showError(elements.signatureError, message);
      firstInvalid = firstInvalid || elements.canvas;
      continue;
    }

    const wrapper = elements.sections.querySelector(`[data-field="${CSS.escape(name)}"]`);
    if (!wrapper) continue;

    wrapper.classList.add('field--invalid');
    const errorNode = wrapper.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
    if (errorNode) showError(errorNode, message);
    firstInvalid = firstInvalid || wrapper;
  }

  showError(elements.formError, result.error || 'Проверьте заполнение анкеты');
  firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showSuccess(result) {
  elements.form.hidden = true;
  elements.success.hidden = false;
  elements.successId.textContent = result.documentId;
  elements.successOpen.href = result.pdfUrl;
  elements.successDownload.href = `${result.pdfUrl}?download=1`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startNewForm() {
  elements.form.reset();
  pad.clear();
  clearAllErrors();
  elements.success.hidden = true;
  elements.form.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showError(node, message) {
  node.textContent = message;
  node.hidden = false;
}

function hideError(node) {
  node.hidden = true;
  node.textContent = '';
}

function clearFieldError(name) {
  const wrapper = elements.sections.querySelector(`[data-field="${CSS.escape(name)}"]`);
  if (!wrapper) return;
  wrapper.classList.remove('field--invalid');
  const errorNode = wrapper.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
  if (errorNode) hideError(errorNode);
}

function clearAllErrors() {
  hideError(elements.formError);
  hideError(elements.signatureError);
  for (const wrapper of elements.sections.querySelectorAll('.field--invalid')) {
    wrapper.classList.remove('field--invalid');
  }
  for (const node of elements.sections.querySelectorAll('.field__error')) {
    hideError(node);
  }
}
