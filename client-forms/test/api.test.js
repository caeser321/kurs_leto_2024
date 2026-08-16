import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp, parseSignature } from '../src/app.js';
import { config } from '../src/config.js';

/** Прозрачный PNG 1×1 — минимально допустимая «подпись» для проверок API. */
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const validValues = {
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
  comment: 'Прошу связаться со мной в будний день после 18:00.',
  consentPersonalData: true,
  consentMarketing: false,
};

/** Поднимает приложение на случайном порту поверх временного общего пространства. */
async function startServer() {
  const sharedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-shared-'));
  const app = await createApp({ ...config, sharedDir });

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  return {
    sharedDir,
    url: (pathname) => `http://127.0.0.1:${port}${pathname}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await fs.rm(sharedDir, { recursive: true, force: true });
    },
  };
}

function post(server, body) {
  return fetch(server.url('/api/submissions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('разбор подписи', async (t) => {
  await t.test('принимает корректный PNG', () => {
    const result = parseSignature(PNG_1PX);
    assert.ok(result.buffer);
    assert.equal(result.error, undefined);
  });

  await t.test('отклоняет пустое значение', () => {
    assert.match(parseSignature('').error, /не поставлена/);
    assert.match(parseSignature(null).error, /не поставлена/);
  });

  await t.test('отклоняет не-PNG форматы', () => {
    assert.match(parseSignature('data:image/jpeg;base64,/9j/4AA').error, /PNG/);
    assert.match(parseSignature('javascript:alert(1)').error, /PNG/);
  });

  await t.test('отклоняет PNG с испорченной сигнатурой', () => {
    const fake = `data:image/png;base64,${Buffer.from('это не png').toString('base64')}`;
    assert.match(parseSignature(fake).error, /Повреждённое/);
  });
});

test('отдаёт описание анкеты', async () => {
  const server = await startServer();
  try {
    const response = await fetch(server.url('/api/form'));
    assert.equal(response.status, 200);

    const form = await response.json();
    assert.ok(form.title);
    assert.ok(Array.isArray(form.sections));
  } finally {
    await server.close();
  }
});

test('сохраняет заполненную анкету в PDF', async () => {
  const server = await startServer();
  try {
    const response = await post(server, { values: validValues, signature: PNG_1PX });
    assert.equal(response.status, 201);

    const result = await response.json();
    assert.match(result.documentId, /^\d{8}-\d{6}-[A-Z2-9]{6}$/);
    assert.equal(result.clientName, 'Иванов Пётр Сергеевич');

    // Файл действительно лежит в общем пространстве и является PDF.
    const pdfPath = path.join(server.sharedDir, result.pdfFile);
    const bytes = await fs.readFile(pdfPath);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(bytes.length > 5000, `PDF подозрительно мал: ${bytes.length} байт`);
  } finally {
    await server.close();
  }
});

test('отклоняет анкету без обязательных полей', async () => {
  const server = await startServer();
  try {
    const response = await post(server, {
      values: { ...validValues, lastName: '', phone: '' },
      signature: PNG_1PX,
    });

    assert.equal(response.status, 400);
    const result = await response.json();
    assert.equal(result.errors.lastName, 'Обязательное поле');
    assert.equal(result.errors.phone, 'Обязательное поле');

    const { total } = await (await fetch(server.url('/api/submissions'))).json();
    assert.equal(total, 0, 'некорректная анкета не должна сохраняться');
  } finally {
    await server.close();
  }
});

test('отклоняет анкету без подписи', async () => {
  const server = await startServer();
  try {
    const response = await post(server, { values: validValues, signature: '' });
    assert.equal(response.status, 400);

    const result = await response.json();
    assert.match(result.errors.__signature, /не поставлена/);
  } finally {
    await server.close();
  }
});

test('отклоняет анкету без согласия на обработку данных', async () => {
  const server = await startServer();
  try {
    const response = await post(server, {
      values: { ...validValues, consentPersonalData: false },
      signature: PNG_1PX,
    });

    assert.equal(response.status, 400);
    const result = await response.json();
    assert.ok(result.errors.consentPersonalData);
  } finally {
    await server.close();
  }
});

test('сохранённая анкета появляется в архиве и скачивается', async () => {
  const server = await startServer();
  try {
    const created = await (await post(server, { values: validValues, signature: PNG_1PX })).json();

    const listResponse = await fetch(server.url('/api/submissions'));
    const { total, items } = await listResponse.json();
    assert.equal(total, 1);
    assert.equal(items[0].documentId, created.documentId);
    assert.equal(items[0].clientName, 'Иванов Пётр Сергеевич');

    const pdfResponse = await fetch(server.url(created.pdfUrl));
    assert.equal(pdfResponse.status, 200);
    assert.equal(pdfResponse.headers.get('content-type'), 'application/pdf');

    const bytes = Buffer.from(await pdfResponse.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');

    const download = await fetch(server.url(`${created.pdfUrl}?download=1`));
    assert.match(download.headers.get('content-disposition'), /^attachment/);
  } finally {
    await server.close();
  }
});

test('запрос несуществующего документа возвращает 404', async () => {
  const server = await startServer();
  try {
    const response = await fetch(server.url('/api/submissions/20260101-000000-NOPE01/pdf'));
    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test('отдаёт страницу анкеты', async () => {
  const server = await startServer();
  try {
    const response = await fetch(server.url('/'));
    assert.equal(response.status, 200);
    assert.match(await response.text(), /signature-canvas/);
  } finally {
    await server.close();
  }
});
