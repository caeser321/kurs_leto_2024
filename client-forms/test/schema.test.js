import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSubmission, formatValue, buildClientName } from '../src/schema.js';
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
