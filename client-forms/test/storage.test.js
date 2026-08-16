import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { SubmissionStore, slugify, generateDocumentId } from '../src/storage.js';

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shared-'));
  return new SubmissionStore(dir).init();
}

const samplePdf = Buffer.from('%PDF-1.7\n% тестовый файл\n');

test('транслитерирует кириллицу в имя файла', () => {
  assert.equal(slugify('Иванов Пётр Сергеевич'), 'ivanov-petr-sergeevich');
  assert.equal(slugify('Щукин Юрий'), 'schukin-yuriy');
  assert.equal(slugify('  ***  '), 'anketa');
  assert.equal(slugify(''), 'anketa');
});

test('ограничивает длину имени файла', () => {
  const slug = slugify('А'.repeat(200));
  assert.ok(slug.length <= 48, `длина ${slug.length}`);
});

test('идентификатор документа содержит дату и случайный суффикс', () => {
  const id = generateDocumentId(new Date('2026-08-16T14:30:22'));
  assert.match(id, /^20260816-\d{6}-[A-Z2-9]{6}$/);

  const ids = new Set(Array.from({ length: 200 }, () => generateDocumentId()));
  assert.equal(ids.size, 200, 'идентификаторы должны быть уникальными');
});

test('сохраняет PDF и метаданные в общее пространство', async () => {
  const store = await makeStore();
  const createdAt = new Date('2026-08-16T14:30:22').toISOString();

  const saved = await store.save({
    documentId: '20260816-143022-ABC123',
    createdAt,
    clientName: 'Иванов Пётр',
    formId: 'anketa',
    formTitle: 'Анкета клиента',
    pdfBytes: samplePdf,
    values: { lastName: 'Иванов' },
  });

  const onDisk = await fs.readFile(saved.pdfPath);
  assert.deepEqual(onDisk, samplePdf);

  const meta = JSON.parse(await fs.readFile(saved.metaPath, 'utf8'));
  assert.equal(meta.documentId, '20260816-143022-ABC123');
  assert.equal(meta.clientName, 'Иванов Пётр');
  assert.deepEqual(meta.values, { lastName: 'Иванов' });

  // Раскладка по годам и месяцам.
  assert.equal(path.relative(store.sharedDir, path.dirname(saved.pdfPath)), path.join('2026', '08'));
});

test('не оставляет временных файлов после записи', async () => {
  const store = await makeStore();
  await store.save({
    documentId: generateDocumentId(),
    createdAt: new Date().toISOString(),
    clientName: 'Тест',
    formId: 'anketa',
    formTitle: 'Анкета',
    pdfBytes: samplePdf,
    values: {},
  });

  const entries = await fs.readdir(store.directoryFor(new Date()));
  assert.equal(entries.filter((name) => name.endsWith('.tmp')).length, 0);
});

test('архив возвращает записи от новых к старым', async () => {
  const store = await makeStore();

  for (const [index, name] of ['Первый', 'Второй', 'Третий'].entries()) {
    await store.save({
      documentId: `2026081${index}-120000-AAAAAA`,
      createdAt: new Date(Date.UTC(2026, 7, 10 + index, 12)).toISOString(),
      clientName: name,
      formId: 'anketa',
      formTitle: 'Анкета',
      pdfBytes: samplePdf,
      values: {},
    });
  }

  const { total, items } = await store.list();
  assert.equal(total, 3);
  assert.deepEqual(
    items.map((item) => item.clientName),
    ['Третий', 'Второй', 'Первый'],
  );
});

test('архив ищет по имени клиента и номеру документа', async () => {
  const store = await makeStore();
  await store.save({
    documentId: '20260816-143022-ZZZ999',
    createdAt: new Date().toISOString(),
    clientName: 'Иванов Пётр',
    formId: 'anketa',
    formTitle: 'Анкета',
    pdfBytes: samplePdf,
    values: {},
  });
  await store.save({
    documentId: '20260816-143023-YYY888',
    createdAt: new Date().toISOString(),
    clientName: 'Петров Иван',
    formId: 'anketa',
    formTitle: 'Анкета',
    pdfBytes: samplePdf,
    values: {},
  });

  assert.equal((await store.list({ search: 'иванов' })).total, 1);
  assert.equal((await store.list({ search: 'ZZZ999' })).total, 1);
  assert.equal((await store.list({ search: 'нет такого' })).total, 0);
});

test('повреждённый JSON не ломает архив', async () => {
  const store = await makeStore();
  await store.save({
    documentId: '20260816-143022-GOOD11',
    createdAt: new Date().toISOString(),
    clientName: 'Хороший',
    formId: 'anketa',
    formTitle: 'Анкета',
    pdfBytes: samplePdf,
    values: {},
  });

  await fs.writeFile(path.join(store.sharedDir, 'broken.json'), '{ это не json');

  const { total, items } = await store.list();
  assert.equal(total, 1);
  assert.equal(items[0].clientName, 'Хороший');
});

test('находит PDF по идентификатору документа', async () => {
  const store = await makeStore();
  const saved = await store.save({
    documentId: '20260816-143022-FIND01',
    createdAt: new Date().toISOString(),
    clientName: 'Иванов Пётр',
    formId: 'anketa',
    formTitle: 'Анкета',
    pdfBytes: samplePdf,
    values: {},
  });

  const found = await store.findPdf('20260816-143022-FIND01');
  assert.ok(found);
  assert.equal(found.pdfPath, saved.pdfPath);

  assert.equal(await store.findPdf('20260816-143022-NOPE99'), null);
});

test('не выдаёт файлы за пределами общего пространства', async () => {
  const store = await makeStore();
  const dir = store.directoryFor(new Date());
  await fs.mkdir(dir, { recursive: true });

  // Запись, в которой путь к файлу пытается вывести за пределы каталога.
  await fs.writeFile(
    path.join(dir, '20260816-143022-EVIL01__evil.json'),
    JSON.stringify({
      documentId: '20260816-143022-EVIL01',
      createdAt: new Date().toISOString(),
      clientName: 'Злоумышленник',
      pdfFile: '../../../../etc/passwd',
    }),
  );

  assert.equal(await store.findPdf('20260816-143022-EVIL01'), null);
});

test('отклоняет идентификаторы с обходом каталогов', async () => {
  const store = await makeStore();
  assert.equal(await store.findPdf('../../etc/passwd'), null);
  assert.equal(await store.findPdf('..'), null);
});
