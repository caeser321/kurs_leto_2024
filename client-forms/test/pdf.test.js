import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PDFDocument, PDFDict } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { renderSubmissionPdf, wrapText } from '../src/pdf.js';
import { loadForm } from '../src/schema.js';
import { config } from '../src/config.js';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const baseValues = {
  lastName: 'Иванов',
  firstName: 'Пётр',
  middleName: 'Сергеевич',
  birthDate: '1990-05-17',
  gender: 'Мужской',
  phone: '+7 (900) 123-45-67',
  email: 'ivanov@example.com',
  address: 'г. Москва, ул. Ленина, д. 1',
  docType: 'Паспорт РФ',
  docNumber: '4510 123456',
  docIssuedBy: 'ОВД района Люблино города Москвы',
  docIssueDate: '2010-06-01',
  service: 'Первичная консультация',
  source: 'Поиск в интернете',
  comment: 'Прошу связаться со мной в будний день.',
  consentPersonalData: true,
  consentMarketing: false,
};

async function render(values = baseValues) {
  const form = await loadForm(config.formFile);
  return renderSubmissionPdf({
    form,
    values,
    signaturePng: PNG_1PX,
    meta: {
      documentId: '20260816-143022-ABC123',
      createdAt: '2026-08-16T14:30:22.000Z',
      clientName: 'Иванов Пётр Сергеевич',
    },
    fontPaths: config.fonts,
  });
}

async function loadTestFont() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  return doc.embedFont(await fs.readFile(config.fonts.regular));
}

test('переносит текст по ширине', async () => {
  const font = await loadTestFont();
  const lines = wrapText('Короткий текст', font, 10, 500);
  assert.equal(lines.length, 1);

  const long = wrapText('слово '.repeat(80).trim(), font, 10, 200);
  assert.ok(long.length > 1);
  for (const line of long) {
    assert.ok(font.widthOfTextAtSize(line, 10) <= 200, `строка шире колонки: ${line}`);
  }
});

test('разрывает слова, которые длиннее строки', async () => {
  const font = await loadTestFont();
  const lines = wrapText('А'.repeat(300), font, 10, 100);
  assert.ok(lines.length > 1);
  for (const line of lines) {
    assert.ok(font.widthOfTextAtSize(line, 10) <= 100);
  }
});

test('сохраняет разбиение на абзацы', async () => {
  const font = await loadTestFont();
  const lines = wrapText('Первый\nВторой', font, 10, 500);
  assert.deepEqual(lines, ['Первый', 'Второй']);
});

test('убирает управляющие символы', async () => {
  const font = await loadTestFont();
  const lines = wrapText('Текст\u0007 с\u0000 мусором', font, 10, 500);
  assert.deepEqual(lines, ['Текст с мусором']);
});

test('пустой текст даёт одну пустую строку', async () => {
  const font = await loadTestFont();
  assert.deepEqual(wrapText('', font, 10, 500), ['']);
});

test('создаёт корректный PDF с кириллицей', async () => {
  const bytes = await render();

  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');

  const doc = await PDFDocument.load(bytes);
  // Штатная анкета занимает две страницы: данные и блок подписи.
  assert.equal(doc.getPageCount(), 2);
  assert.match(doc.getTitle(), /Иванов Пётр Сергеевич/);

  const [page] = doc.getPages();
  assert.ok(Math.abs(page.getWidth() - 595.28) < 1);
  assert.ok(Math.abs(page.getHeight() - 841.89) < 1);

  // Шрифт с кириллицей должен быть встроен в файл, иначе документ
  // не откроется одинаково на чужом компьютере. Кириллица требует
  // составного шрифта (Type0/CIDFontType2) со встроенной программой шрифта.
  const keys = new Set();
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    for (const key of object.keys()) keys.add(`${key.asString()}=${object.get(key)}`);
  }

  assert.ok([...keys].some((entry) => entry.startsWith('/FontFile2=')), 'шрифт не встроен');
  assert.ok([...keys].includes('/Subtype=/Type0'), 'ожидался составной шрифт Type0');
  assert.ok([...keys].some((entry) => entry.includes('DejaVuSans')), 'ожидался шрифт DejaVu');
});

test('длинная анкета переносится на несколько страниц', async () => {
  const bytes = await render({
    ...baseValues,
    comment: 'Очень подробное описание обращения клиента. '.repeat(60),
  });

  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 3, `ожидалось больше страниц, получено ${doc.getPageCount()}`);
});

test('анкета без подписи всё равно формируется', async () => {
  const form = await loadForm(config.formFile);
  const bytes = await renderSubmissionPdf({
    form,
    values: baseValues,
    signaturePng: null,
    meta: {
      documentId: '20260816-143022-NOSIGN',
      createdAt: '2026-08-16T14:30:22.000Z',
      clientName: 'Иванов Пётр Сергеевич',
    },
    fontPaths: config.fonts,
  });

  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 1);
});

test('незаполненные необязательные поля не ломают документ', async () => {
  const bytes = await render({ ...baseValues, email: '', address: '', comment: '' });
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 1);
});
