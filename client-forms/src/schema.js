const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Поля без ответа: показывают текст на экране и печатаются в PDF. */
const STATIC_TYPES = new Set(['notice']);

/** Поля, ответ на которые — список выбранных вариантов. */
const MULTI_TYPES = new Set(['multiselect']);

export function isStaticField(field) {
  return STATIC_TYPES.has(field.type);
}

/**
 * Проверяет, что описание анкеты пригодно к использованию.
 * Вызывается и на сервере при чтении файла, и при сборке приложения,
 * поэтому не обращается к файловой системе.
 *
 * @param {object} form разобранное описание анкеты
 * @param {string} source откуда оно взято — попадёт в текст ошибки
 */
export function validateFormDefinition(form, source = 'анкета') {
  if (!form?.title) throw new Error(`Анкета ${source}: не задан title`);
  if (!Array.isArray(form.sections) || form.sections.length === 0) {
    throw new Error(`Анкета ${source}: не заданы секции (sections)`);
  }

  const seen = new Set();
  for (const field of iterateFields(form)) {
    if (!field.name) throw new Error(`Анкета ${source}: у поля отсутствует name`);
    if (seen.has(field.name)) {
      throw new Error(`Анкета ${source}: поле "${field.name}" объявлено более одного раза`);
    }
    seen.add(field.name);

    const needsOptions = field.type === 'select' || field.type === 'radio' || MULTI_TYPES.has(field.type);
    if (needsOptions && !Array.isArray(field.options)) {
      throw new Error(`Анкета ${source}: у поля "${field.name}" типа ${field.type} нет options`);
    }

    if (field.type === 'notice' && !field.text && !field.label) {
      throw new Error(`Анкета ${source}: у блока "${field.name}" нет текста (text)`);
    }
  }

  // Условия показа проверяем отдельно: поле, от которого зависит показ,
  // должно быть объявлено раньше зависимого — иначе условие не сработает.
  const declared = [];
  for (const field of iterateFields(form)) {
    if (field.showIf) {
      const target = field.showIf.field;
      if (!target) {
        throw new Error(`Анкета ${source}: в showIf поля "${field.name}" не указано field`);
      }
      if (!seen.has(target)) {
        throw new Error(
          `Анкета ${source}: поле "${field.name}" зависит от несуществующего поля "${target}"`,
        );
      }
      if (!declared.includes(target)) {
        throw new Error(
          `Анкета ${source}: поле "${field.name}" зависит от поля "${target}", ` +
            'которое объявлено ниже — переставьте его выше',
        );
      }
    }
    declared.push(field.name);
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
 * Нужно ли показывать поле при текущих ответах.
 *
 * Поддерживаются три условия:
 *   "showIf": { "field": "allergy", "equals": "Да" }
 *   "showIf": { "field": "drink", "in": ["Чай зелёный", "Какао"] }
 *   "showIf": { "field": "drink", "notIn": ["Какао", "Ничего"] }
 *
 * Для notIn пустой ответ считается «ещё не выбрано», и поле скрыто:
 * добавки к напитку не нужны, пока напиток не выбран.
 */
export function isFieldVisible(field, values) {
  const rule = field.showIf;
  if (!rule) return true;

  const actual = values?.[rule.field];

  if (rule.equals !== undefined) return actual === rule.equals;
  if (Array.isArray(rule.in)) return rule.in.includes(actual);
  if (Array.isArray(rule.notIn)) {
    if (actual === undefined || actual === null || actual === '') return false;
    return !rule.notIn.includes(actual);
  }

  return true;
}

/** Значение поля, когда ответа нет. */
function emptyValue(field) {
  if (field.type === 'checkbox') return false;
  if (MULTI_TYPES.has(field.type)) return [];
  return '';
}

function normalizeValue(field, raw) {
  if (field.type === 'checkbox') {
    return raw === true || raw === 'true' || raw === 'on' || raw === 1;
  }

  if (MULTI_TYPES.has(field.type)) {
    const list = Array.isArray(raw) ? raw : raw == null || raw === '' ? [] : [raw];
    return list
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim();
}

/**
 * Проверяет присланные ответы по описанию анкеты.
 * Возвращает нормализованные значения и список ошибок по полям.
 */
export function validateSubmission(form, input) {
  const errors = {};
  const values = {};
  const source = input && typeof input === 'object' ? input : {};

  // Шаг 1: приводим ответы к нужному виду — от них зависят условия показа.
  for (const field of iterateFields(form)) {
    if (isStaticField(field)) continue;
    values[field.name] = normalizeValue(field, source[field.name]);
  }

  // Шаг 2: проверяем только то, что гость реально видел на экране.
  for (const field of iterateFields(form)) {
    if (isStaticField(field)) continue;

    if (!isFieldVisible(field, values)) {
      // Скрытое поле не требует ответа и не попадает в документ,
      // даже если значение осталось от предыдущего выбора.
      values[field.name] = emptyValue(field);
      continue;
    }

    const error = validateField(field, values[field.name]);
    if (error) errors[field.name] = error;
  }

  return { valid: Object.keys(errors).length === 0, errors, values };
}

function validateField(field, value) {
  if (field.type === 'checkbox') {
    if (field.required && !value) return 'Необходимо отметить этот пункт';
    return null;
  }

  if (MULTI_TYPES.has(field.type)) {
    if (value.length === 0) return field.required ? 'Выберите хотя бы один вариант' : null;
    if (value.some((item) => !field.options.includes(item))) return 'Выберите значение из списка';
    return null;
  }

  if (!value) return field.required ? 'Обязательное поле' : null;

  return validateValue(field, value);
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

/** Приводит ответ к виду, пригодному для печати в PDF и в архиве. */
export function formatValue(field, value) {
  if (field.type === 'checkbox') return value ? 'Да' : 'Нет';

  if (MULTI_TYPES.has(field.type)) {
    return Array.isArray(value) && value.length > 0 ? value.join(', ') : '—';
  }

  if (field.type === 'date' && DATE_RE.test(String(value || ''))) {
    const [year, month, day] = String(value).split('-');
    return `${day}.${month}.${year}`;
  }

  return value === '' || value == null ? '—' : String(value);
}

/**
 * Собирает читаемое имя гостя из полей анкеты — используется в имени файла
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
