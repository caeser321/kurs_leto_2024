import fs from 'node:fs/promises';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Загружает описание анкеты и проверяет, что оно корректно. */
export async function loadForm(formFile) {
  const raw = await fs.readFile(formFile, 'utf8');
  const form = JSON.parse(raw);

  if (!form.title) throw new Error(`Анкета ${formFile}: не задан title`);
  if (!Array.isArray(form.sections) || form.sections.length === 0) {
    throw new Error(`Анкета ${formFile}: не заданы секции (sections)`);
  }

  const seen = new Set();
  for (const field of iterateFields(form)) {
    if (!field.name) throw new Error(`Анкета ${formFile}: у поля отсутствует name`);
    if (seen.has(field.name)) {
      throw new Error(`Анкета ${formFile}: поле "${field.name}" объявлено более одного раза`);
    }
    seen.add(field.name);
    if ((field.type === 'select' || field.type === 'radio') && !Array.isArray(field.options)) {
      throw new Error(`Анкета ${formFile}: у поля "${field.name}" типа ${field.type} нет options`);
    }
  }

  return form;
}

/** Перебирает все поля анкеты по всем секциям. */
export function* iterateFields(form) {
  for (const section of form.sections) {
    for (const field of section.fields || []) yield field;
  }
}

/**
 * Проверяет присланные клиентом значения по описанию анкеты.
 * Возвращает нормализованные значения и список ошибок по полям.
 */
export function validateSubmission(form, input) {
  const errors = {};
  const values = {};
  const source = input && typeof input === 'object' ? input : {};

  for (const field of iterateFields(form)) {
    const raw = source[field.name];

    if (field.type === 'checkbox') {
      const checked = raw === true || raw === 'true' || raw === 'on' || raw === 1;
      values[field.name] = checked;
      if (field.required && !checked) {
        errors[field.name] = 'Необходимо отметить этот пункт';
      }
      continue;
    }

    const value = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim();
    values[field.name] = value;

    if (!value) {
      if (field.required) errors[field.name] = 'Обязательное поле';
      continue;
    }

    const error = validateValue(field, value);
    if (error) errors[field.name] = error;
  }

  return { valid: Object.keys(errors).length === 0, errors, values };
}

function validateValue(field, value) {
  if (field.maxLength && value.length > field.maxLength) {
    return `Не длиннее ${field.maxLength} символов`;
  }

  if (field.type === 'date') {
    if (!DATE_RE.test(value)) return 'Дата в формате ГГГГ-ММ-ДД';
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return 'Некорректная дата';
    // Date автоматически «переносит» несуществующие даты (31.02 → 03.03),
    // поэтому сверяем результат разбора с исходной строкой.
    if (parsed.toISOString().slice(0, 10) !== value) return 'Такой даты не существует';
  }

  if ((field.type === 'select' || field.type === 'radio') && !field.options.includes(value)) {
    return 'Выберите значение из списка';
  }

  if (field.pattern && !new RegExp(field.pattern).test(value)) {
    return field.hint || 'Значение указано в неверном формате';
  }

  return null;
}

/** Приводит значение поля к виду, пригодному для печати в PDF и в архиве. */
export function formatValue(field, value) {
  if (field.type === 'checkbox') return value ? 'Да' : 'Нет';
  if (field.type === 'date' && DATE_RE.test(String(value || ''))) {
    const [year, month, day] = String(value).split('-');
    return `${day}.${month}.${year}`;
  }
  return value === '' || value == null ? '—' : String(value);
}

/**
 * Собирает читаемое имя клиента из полей анкеты — используется в имени файла
 * и в списке архива. Опирается на типовые названия полей, а если их нет,
 * берёт первое заполненное текстовое поле.
 */
export function buildClientName(form, values) {
  const parts = ['lastName', 'firstName', 'middleName']
    .map((name) => values[name])
    .filter((value) => typeof value === 'string' && value.trim() !== '');

  if (parts.length > 0) return parts.join(' ');

  if (typeof values.fullName === 'string' && values.fullName.trim()) return values.fullName.trim();

  for (const field of iterateFields(form)) {
    const value = values[field.name];
    if ((field.type === 'text' || field.type === 'textarea') && typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return 'Без имени';
}
