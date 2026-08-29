/**
 * Построение формы анкеты по её описанию и работа с ошибками полей.
 *
 * Модуль не знает, куда уйдут данные: в веб-версии их принимает сервер,
 * в Android-приложении PDF собирается прямо на планшете. Поэтому здесь
 * только разметка, сбор ответов, показ полей по условию и подсветка ошибок.
 */

import { isStaticField, isFieldVisible, iterateFields } from '../../src/schema.js';
import { attachMask, formatDateInput, formatPhoneInput } from './masks.js';

/** Поля, которым тесно в половине строки. */
const WIDE_TYPES = new Set([
  'textarea',
  'checkbox',
  'radio',
  'multiselect',
  'checklist',
  'notice',
]);

/** Строит разметку всех секций анкеты внутри container. */
export function buildForm(container, schema) {
  const fragment = document.createDocumentFragment();

  for (const section of schema.sections) {
    const wrapper = document.createElement('section');
    wrapper.className = 'section';

    const heading = document.createElement('h2');
    heading.className = 'section__title';
    heading.textContent = section.title;
    wrapper.append(heading);

    if (section.note) {
      const note = document.createElement('p');
      note.className = 'section__note';
      note.textContent = section.note;
      wrapper.append(note);
    }

    const grid = document.createElement('div');
    grid.className = 'fields';
    for (const field of section.fields || []) {
      grid.append(renderField(container, schema, field));
    }
    wrapper.append(grid);

    fragment.append(wrapper);
  }

  container.append(fragment);

  // Поля с условием показа переключаются при любом изменении ответов.
  container.addEventListener('change', () => refreshVisibility(container, schema));
  container.addEventListener('input', () => refreshVisibility(container, schema));
  refreshVisibility(container, schema);
}

function renderField(container, schema, field) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  wrapper.dataset.field = field.name;
  if (WIDE_TYPES.has(field.type) || field.wide) wrapper.classList.add('field--wide');

  if (field.type === 'notice') {
    wrapper.classList.add('notice');
    if (field.label) {
      const title = document.createElement('p');
      title.className = 'notice__title';
      title.textContent = field.label;
      wrapper.append(title);
    }
    const text = document.createElement('p');
    text.className = 'notice__text';
    text.textContent = field.text || '';
    wrapper.append(text);
    return wrapper;
  }

  if (field.type === 'checklist') {
    wrapper.classList.add('checklist');
    wrapper.append(renderChecklist(field));

    const error = document.createElement('p');
    error.className = 'field__error';
    error.dataset.errorFor = field.name;
    error.hidden = true;
    wrapper.append(error);
    return wrapper;
  }

  if (field.type !== 'checkbox') wrapper.append(renderLabel(field));
  wrapper.append(renderControl(container, field));

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

/**
 * Отмечаемый список — замена «обвести ручкой» на бумаге.
 * Гость касается пункта, и тот подсвечивается; ничего отмечать не обязан.
 */
function renderChecklist(field) {
  const block = document.createElement('div');

  const title = document.createElement('p');
  title.className = 'checklist__title';
  title.textContent = field.label;
  block.append(title);

  const note = document.createElement('p');
  note.className = 'checklist__note';
  note.textContent = field.note || 'Отметьте пункты, которые есть у вас';
  block.append(note);

  const list = document.createElement('div');
  list.className = 'checklist__items';

  for (const option of field.options) {
    const item = document.createElement('label');
    item.className = 'checklist__item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = field.name;
    input.value = option;

    const text = document.createElement('span');
    text.textContent = option;

    // Класс переключаем вручную, а не через :has() в CSS:
    // на планшетах со старым WebView этот селектор может не работать.
    input.addEventListener('change', () => {
      item.classList.toggle('checklist__item--marked', input.checked);
    });

    item.append(input, text);
    list.append(item);
  }

  block.append(list);
  return block;
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

function renderControl(container, field) {
  const id = `field-${field.name}`;
  const forget = () => clearFieldError(container, field.name);

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
    input.addEventListener('change', forget);
    return label;
  }

  if (field.type === 'radio' || field.type === 'multiselect') {
    // Множественный выбор отличается от одиночного только типом флажка:
    // разметка и поведение одинаковые.
    const multiple = field.type === 'multiselect';
    const group = document.createElement('div');
    group.className = 'choices';
    group.setAttribute('role', multiple ? 'group' : 'radiogroup');

    field.options.forEach((option, index) => {
      const label = document.createElement('label');
      label.className = 'choice';

      const input = document.createElement('input');
      input.type = multiple ? 'checkbox' : 'radio';
      input.name = field.name;
      input.value = option;
      if (index === 0) input.id = id;

      const text = document.createElement('span');
      text.textContent = option;

      label.append(input, text);
      input.addEventListener('change', forget);
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

    select.addEventListener('change', forget);
    return select;
  }

  const input = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
  input.id = id;
  input.name = field.name;

  if (field.type === 'textarea') {
    input.rows = field.rows || 3;
  } else if (field.type === 'date') {
    // Системный календарь Android открывается на сегодняшней дате и листается
    // по месяцу — искать в нём год рождения мучительно. Поэтому обычное поле
    // с маской: дату можно просто набрать.
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 10;
    input.placeholder = field.placeholder || 'дд.мм.гггг';
    attachMask(input, formatDateInput);
  } else if (field.type === 'tel') {
    input.type = 'tel';
    input.inputMode = 'tel';
    input.placeholder = field.placeholder || '+7 (___) ___-__-__';
    attachMask(input, formatPhoneInput, { prefill: '+7' });
  } else {
    input.type = field.type || 'text';
  }

  if (field.maxLength && field.type !== 'date') input.maxLength = field.maxLength;
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.autocomplete) input.autocomplete = field.autocomplete;

  input.addEventListener('input', forget);
  return input;
}

/** Собирает ответы на все поля анкеты в объект. */
export function collectValues(formElement, schema) {
  const values = {};
  const data = new FormData(formElement);

  for (const field of iterateFields(schema)) {
    if (isStaticField(field)) continue;

    if (field.type === 'checkbox') {
      values[field.name] = formElement.elements[field.name]?.checked === true;
    } else if (field.type === 'multiselect' || field.type === 'checklist') {
      values[field.name] = data.getAll(field.name).map(String);
    } else {
      values[field.name] = (data.get(field.name) || '').toString();
    }
  }

  return values;
}

/**
 * Показывает и прячет поля с условием showIf.
 * У скрытого поля снимается подсветка ошибки: гость его не видит,
 * значит и «исправлять» ему нечего.
 */
export function refreshVisibility(container, schema) {
  const formElement = container.closest('form');
  if (!formElement) return;

  const values = collectValues(formElement, schema);

  for (const field of iterateFields(schema)) {
    if (!field.showIf) continue;

    const wrapper = container.querySelector(`[data-field="${CSS.escape(field.name)}"]`);
    if (!wrapper) continue;

    const visible = isFieldVisible(field, values);
    if (wrapper.hidden === !visible) continue;

    wrapper.hidden = !visible;
    if (!visible) {
      wrapper.classList.remove('field--invalid');
      const errorNode = wrapper.querySelector(`[data-error-for="${CSS.escape(field.name)}"]`);
      if (errorNode) hideError(errorNode);
    }
  }
}

export function showError(node, message) {
  node.textContent = message;
  node.hidden = false;
}

export function hideError(node) {
  node.hidden = true;
  node.textContent = '';
}

export function clearFieldError(container, name) {
  const wrapper = container.querySelector(`[data-field="${CSS.escape(name)}"]`);
  if (!wrapper) return;
  wrapper.classList.remove('field--invalid');
  const errorNode = wrapper.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
  if (errorNode) hideError(errorNode);
}

export function clearAllErrors(container) {
  for (const wrapper of container.querySelectorAll('.field--invalid')) {
    wrapper.classList.remove('field--invalid');
  }
  for (const node of container.querySelectorAll('.field__error')) hideError(node);
}

/**
 * Подсвечивает поля с ошибками и возвращает первое из них,
 * чтобы вызывающий код мог прокрутить страницу к проблеме.
 */
export function applyFieldErrors(container, errors) {
  let firstInvalid = null;

  for (const [name, message] of Object.entries(errors)) {
    if (name.startsWith('__')) continue;

    const wrapper = container.querySelector(`[data-field="${CSS.escape(name)}"]`);
    if (!wrapper) continue;

    wrapper.classList.add('field--invalid');
    const errorNode = wrapper.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
    if (errorNode) showError(errorNode, message);
    firstInvalid = firstInvalid || wrapper;
  }

  return firstInvalid;
}
