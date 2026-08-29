import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSubmission,
  formatValue,
  buildClientName,
  validateFormDefinition,
  isFieldVisible,
} from '../src/schema.js';
import { loadForm } from '../src/form-file.node.js';
import { config } from '../src/config.js';

const form = {
  id: 'test',
  title: 'Тест',
  sections: [
    {
      title: 'Секция',
      fields: [
        { name: 'lastName', label: 'Фамилия', type: 'text', required: true, maxLength: 10 },
        { name: 'firstName', label: 'Имя', type: 'text', required: true },
        { name: 'birthDate', label: 'Дата', type: 'date', required: true },
        { name: 'phone', label: 'Телефон', type: 'tel', required: false, pattern: '^\\d{3}$' },
        { name: 'service', label: 'Услуга', type: 'select', required: true, options: ['А', 'Б'] },
        { name: 'consent', label: 'Согласие', type: 'checkbox', required: true },
        { name: 'news', label: 'Рассылка', type: 'checkbox', required: false },
      ],
    },
  ],
};

const validInput = {
  lastName: 'Иванов',
  firstName: 'Пётр',
  birthDate: '1990-05-17',
  phone: '123',
  service: 'А',
  consent: true,
};

test('принимает корректно заполненную анкету', () => {
  const result = validateSubmission(form, validInput);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
  assert.equal(result.values.lastName, 'Иванов');
  assert.equal(result.values.news, false);
});

test('обрезает пробелы по краям значений', () => {
  const result = validateSubmission(form, { ...validInput, lastName: '  Иванов  ' });
  assert.equal(result.values.lastName, 'Иванов');
});

test('требует заполнения обязательных полей', () => {
  const result = validateSubmission(form, { ...validInput, lastName: '   ' });
  assert.equal(result.valid, false);
  assert.equal(result.errors.lastName, 'Обязательное поле');
});

test('требует отметки обязательного согласия', () => {
  const result = validateSubmission(form, { ...validInput, consent: false });
  assert.equal(result.valid, false);
  assert.match(result.errors.consent, /отметить/);
});

test('необязательное согласие можно не отмечать', () => {
  const result = validateSubmission(form, validInput);
  assert.equal(result.valid, true);
  assert.equal(result.errors.news, undefined);
});

test('проверяет ограничение длины', () => {
  const result = validateSubmission(form, { ...validInput, lastName: 'ОченьДлиннаяФамилия' });
  assert.equal(result.valid, false);
  assert.match(result.errors.lastName, /Не длиннее 10/);
});

test('отклоняет несуществующую дату', () => {
  const result = validateSubmission(form, { ...validInput, birthDate: '2024-02-31' });
  assert.equal(result.valid, false);
  assert.match(result.errors.birthDate, /не существует/);
});

test('отклоняет дату в неверном формате', () => {
  const result = validateSubmission(form, { ...validInput, birthDate: '17.05.1990' });
  assert.equal(result.valid, false);
  assert.match(result.errors.birthDate, /ГГГГ-ММ-ДД/);
});

test('отклоняет значение вне списка select', () => {
  const result = validateSubmission(form, { ...validInput, service: 'В' });
  assert.equal(result.valid, false);
  assert.match(result.errors.service, /из списка/);
});

test('проверяет значение по регулярному выражению', () => {
  const result = validateSubmission(form, { ...validInput, phone: 'abc' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.phone);
});

test('пустое необязательное поле не проверяется по шаблону', () => {
  const result = validateSubmission(form, { ...validInput, phone: '' });
  assert.equal(result.valid, true);
});

test('игнорирует поля, которых нет в анкете', () => {
  const result = validateSubmission(form, { ...validInput, hacker: 'значение' });
  assert.equal(result.valid, true);
  assert.equal(result.values.hacker, undefined);
});

test('выдерживает отсутствие тела запроса', () => {
  const result = validateSubmission(form, undefined);
  assert.equal(result.valid, false);
  assert.equal(result.errors.lastName, 'Обязательное поле');
});

test('форматирует значения для печати', () => {
  assert.equal(formatValue({ type: 'checkbox' }, true), 'Да');
  assert.equal(formatValue({ type: 'checkbox' }, false), 'Нет');
  assert.equal(formatValue({ type: 'date' }, '1990-05-17'), '17.05.1990');
  assert.equal(formatValue({ type: 'text' }, ''), '—');
  assert.equal(formatValue({ type: 'text' }, 'Текст'), 'Текст');
});

test('собирает ФИО клиента', () => {
  assert.equal(
    buildClientName(form, { lastName: 'Иванов', firstName: 'Пётр', middleName: 'Сергеевич' }),
    'Иванов Пётр Сергеевич',
  );
  assert.equal(buildClientName(form, { lastName: 'Иванов', firstName: 'Пётр' }), 'Иванов Пётр');
  assert.equal(buildClientName(form, {}), 'Без имени');
});

test('штатная анкета загружается и проходит проверку структуры', async () => {
  const anketa = await loadForm(config.formFile);
  assert.ok(anketa.title);
  assert.ok(anketa.sections.length > 0);
});

test('дублирующиеся имена полей отклоняются при загрузке', async () => {
  const { writeFile, mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');

  const dir = await mkdtemp(path.join(tmpdir(), 'form-'));
  const file = path.join(dir, 'broken.json');
  await writeFile(
    file,
    JSON.stringify({
      title: 'Тест',
      sections: [
        { title: 'A', fields: [{ name: 'a', label: 'A', type: 'text' }] },
        { title: 'B', fields: [{ name: 'a', label: 'A2', type: 'text' }] },
      ],
    }),
  );

  await assert.rejects(() => loadForm(file), /более одного раза/);
});

// --- Множественный выбор ---

const multiForm = {
  id: 'multi',
  title: 'Тест',
  sections: [
    {
      title: 'Секция',
      fields: [
        {
          name: 'source',
          label: 'Откуда узнали',
          type: 'multiselect',
          required: false,
          options: ['Instagram', 'Telegram', 'Рекомендация'],
        },
        {
          name: 'music',
          label: 'Музыка',
          type: 'multiselect',
          required: true,
          options: ['Jazz', 'Техно'],
        },
      ],
    },
  ],
};

test('множественный выбор принимает несколько вариантов', () => {
  const result = validateSubmission(multiForm, {
    source: ['Instagram', 'Рекомендация'],
    music: ['Jazz'],
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.values.source, ['Instagram', 'Рекомендация']);
});

test('множественный выбор без ответа — пустой список', () => {
  const result = validateSubmission(multiForm, { music: ['Jazz'] });
  assert.deepEqual(result.values.source, []);
});

test('обязательный множественный выбор требует хотя бы один вариант', () => {
  const result = validateSubmission(multiForm, { music: [] });
  assert.equal(result.valid, false);
  assert.match(result.errors.music, /хотя бы один/);
});

test('множественный выбор отклоняет вариант не из списка', () => {
  const result = validateSubmission(multiForm, { music: ['Jazz', 'Шансон'] });
  assert.equal(result.valid, false);
  assert.match(result.errors.music, /из списка/);
});

test('одиночное значение приводится к списку', () => {
  const result = validateSubmission(multiForm, { music: 'Jazz' });
  assert.equal(result.valid, true);
  assert.deepEqual(result.values.music, ['Jazz']);
});

test('форматирует множественный выбор для печати', () => {
  const field = { type: 'multiselect' };
  assert.equal(formatValue(field, ['Лимон', 'Сахар']), 'Лимон, Сахар');
  assert.equal(formatValue(field, []), '—');
});

// --- Поля, зависящие от других ответов ---

const conditionalForm = {
  id: 'cond',
  title: 'Тест',
  sections: [
    {
      title: 'Секция',
      fields: [
        { name: 'allergy', label: 'Аллергия?', type: 'radio', required: true, options: ['Да', 'Нет'] },
        {
          name: 'allergyDetails',
          label: 'На что',
          type: 'textarea',
          required: true,
          showIf: { field: 'allergy', equals: 'Да' },
        },
        {
          name: 'drink',
          label: 'Напиток',
          type: 'radio',
          required: false,
          options: ['Чай зелёный', 'Какао', 'Ничего'],
        },
        {
          name: 'additions',
          label: 'Добавки',
          type: 'multiselect',
          required: false,
          options: ['Лимон', 'Сахар'],
          showIf: { field: 'drink', notIn: ['Какао', 'Ничего'] },
        },
      ],
    },
  ],
};

test('описание обязательно, когда ответили «Да»', () => {
  const result = validateSubmission(conditionalForm, { allergy: 'Да' });
  assert.equal(result.valid, false);
  assert.equal(result.errors.allergyDetails, 'Обязательное поле');
});

test('описание не требуется, когда ответили «Нет»', () => {
  const result = validateSubmission(conditionalForm, { allergy: 'Нет' });
  assert.equal(result.valid, true);
  assert.equal(result.errors.allergyDetails, undefined);
});

test('ответ на скрытое поле стирается', () => {
  // Гость написал описание, потом передумал и выбрал «Нет».
  const result = validateSubmission(conditionalForm, {
    allergy: 'Нет',
    allergyDetails: 'Мёд',
  });
  assert.equal(result.valid, true);
  assert.equal(result.values.allergyDetails, '', 'скрытый ответ не должен попадать в документ');
});

test('добавки доступны только к чаю', () => {
  const withTea = validateSubmission(conditionalForm, {
    allergy: 'Нет',
    drink: 'Чай зелёный',
    additions: ['Лимон'],
  });
  assert.deepEqual(withTea.values.additions, ['Лимон']);

  for (const drink of ['Какао', 'Ничего', '']) {
    const result = validateSubmission(conditionalForm, {
      allergy: 'Нет',
      drink,
      additions: ['Лимон'],
    });
    assert.deepEqual(result.values.additions, [], `добавки не должны сохраняться при «${drink}»`);
  }
});

test('условие показа считается по правилам showIf', () => {
  const details = conditionalForm.sections[0].fields[1];
  assert.equal(isFieldVisible(details, { allergy: 'Да' }), true);
  assert.equal(isFieldVisible(details, { allergy: 'Нет' }), false);
  assert.equal(isFieldVisible(details, {}), false);

  const additions = conditionalForm.sections[0].fields[3];
  assert.equal(isFieldVisible(additions, { drink: 'Чай зелёный' }), true);
  assert.equal(isFieldVisible(additions, { drink: 'Какао' }), false);
  assert.equal(isFieldVisible(additions, { drink: '' }), false);
});

// --- Информационные блоки ---

test('блоки notice не требуют ответа и не попадают в значения', () => {
  const withNotice = {
    id: 'n',
    title: 'Тест',
    sections: [
      {
        title: 'Секция',
        fields: [
          { name: 'info', type: 'notice', label: 'Противопоказания', text: 'Длинный текст' },
          { name: 'ok', label: 'Согласен', type: 'checkbox', required: true },
        ],
      },
    ],
  };

  const result = validateSubmission(withNotice, { ok: true });
  assert.equal(result.valid, true);
  assert.equal('info' in result.values, false);
});

// --- Проверки описания анкеты ---

test('множественный выбор без options отклоняется', () => {
  assert.throws(
    () =>
      validateFormDefinition({
        title: 'Т',
        sections: [{ title: 'A', fields: [{ name: 'a', label: 'A', type: 'multiselect' }] }],
      }),
    /нет options/,
  );
});

test('showIf на несуществующее поле отклоняется', () => {
  assert.throws(
    () =>
      validateFormDefinition({
        title: 'Т',
        sections: [
          {
            title: 'A',
            fields: [{ name: 'a', label: 'A', type: 'text', showIf: { field: 'нет', equals: 'Да' } }],
          },
        ],
      }),
    /несуществующего поля/,
  );
});

test('showIf на поле ниже по анкете отклоняется', () => {
  assert.throws(
    () =>
      validateFormDefinition({
        title: 'Т',
        sections: [
          {
            title: 'A',
            fields: [
              { name: 'a', label: 'A', type: 'text', showIf: { field: 'b', equals: 'Да' } },
              { name: 'b', label: 'B', type: 'radio', options: ['Да', 'Нет'] },
            ],
          },
        ],
      }),
    /объявлено ниже/,
  );
});

test('штатная анкета проходит проверку описания', async () => {
  const anketa = await loadForm(config.formFile);
  assert.doesNotThrow(() => validateFormDefinition(anketa, 'anketa.json'));
});
