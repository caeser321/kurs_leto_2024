/**
 * Хранилище анкет на планшете.
 *
 * На устройстве файлы лежат в приватной памяти приложения (Directory.Data):
 * туда можно писать без запроса разрешений, и посторонние приложения
 * не видят персональные данные клиентов. Наружу документы отдаются
 * через системное меню «Поделиться».
 *
 * В обычном браузере (разработка и проверка вёрстки) те же данные
 * складываются в IndexedDB, поэтому приложение работает без Android.
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { documentBaseName, documentFolder } from '../../src/naming.js';

const ROOT = 'anketa';
const DIRECTORY = Directory.Data;

/** Кодирует байты в base64 порциями — большой PDF не должен переполнить стек. */
export function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sortAndFilter(items, search, limit) {
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const needle = String(search || '').trim().toLowerCase();
  const filtered = needle
    ? items.filter((item) =>
        `${item.clientName} ${item.documentId}`.toLowerCase().includes(needle),
      )
    : items;

  return { total: filtered.length, items: filtered.slice(0, limit) };
}

function toListItem(meta) {
  return {
    documentId: meta.documentId,
    createdAt: meta.createdAt,
    clientName: meta.clientName,
    formTitle: meta.formTitle,
    size: meta.size || 0,
  };
}

/** Хранилище на файловой системе планшета. */
class NativeStore {
  async save({ documentId, createdAt, clientName, formId, formTitle, pdfBytes, values }) {
    const folder = `${ROOT}/${documentFolder(new Date(createdAt))}`;
    const base = documentBaseName(documentId, clientName);

    await Filesystem.mkdir({ path: folder, directory: DIRECTORY, recursive: true }).catch(
      (error) => {
        // Каталог уже существует — это не ошибка.
        if (!/exist/i.test(String(error?.message))) throw error;
      },
    );

    const pdfPath = `${folder}/${base}.pdf`;
    await Filesystem.writeFile({
      path: pdfPath,
      directory: DIRECTORY,
      data: bytesToBase64(pdfBytes),
    });

    const meta = {
      documentId,
      createdAt,
      clientName,
      formId,
      formTitle,
      pdfFile: pdfPath,
      size: pdfBytes.length,
      values,
    };

    await Filesystem.writeFile({
      path: `${folder}/${base}.json`,
      directory: DIRECTORY,
      data: JSON.stringify(meta, null, 2),
      encoding: Encoding.UTF8,
    });

    return meta;
  }

  async list({ search = '', limit = 500 } = {}) {
    const items = [];

    for (const yearDir of await this.#readdir(ROOT)) {
      if (yearDir.type !== 'directory') continue;

      for (const monthDir of await this.#readdir(`${ROOT}/${yearDir.name}`)) {
        if (monthDir.type !== 'directory') continue;
        const folder = `${ROOT}/${yearDir.name}/${monthDir.name}`;

        for (const file of await this.#readdir(folder)) {
          if (!file.name.endsWith('.json')) continue;
          try {
            const { data } = await Filesystem.readFile({
              path: `${folder}/${file.name}`,
              directory: DIRECTORY,
              encoding: Encoding.UTF8,
            });
            const meta = JSON.parse(data);
            if (meta.documentId) items.push(toListItem(meta));
          } catch {
            // Повреждённая запись не должна ломать весь архив.
          }
        }
      }
    }

    return sortAndFilter(items, search, limit);
  }

  async #readdir(path) {
    try {
      const { files } = await Filesystem.readdir({ path, directory: DIRECTORY });
      return files;
    } catch {
      // Каталога ещё нет — архив пуст.
      return [];
    }
  }

  /** Находит пути документа по идентификатору. */
  async #locate(documentId) {
    for (const yearDir of await this.#readdir(ROOT)) {
      if (yearDir.type !== 'directory') continue;
      for (const monthDir of await this.#readdir(`${ROOT}/${yearDir.name}`)) {
        if (monthDir.type !== 'directory') continue;
        const folder = `${ROOT}/${yearDir.name}/${monthDir.name}`;
        for (const file of await this.#readdir(folder)) {
          if (file.name.startsWith(`${documentId}__`) && file.name.endsWith('.pdf')) {
            return { path: `${folder}/${file.name}`, name: file.name };
          }
        }
      }
    }
    return null;
  }

  async readPdf(documentId) {
    const found = await this.#locate(documentId);
    if (!found) return null;

    const { data } = await Filesystem.readFile({ path: found.path, directory: DIRECTORY });
    return base64ToBytes(data);
  }

  async share(documentId, clientName) {
    const found = await this.#locate(documentId);
    if (!found) throw new Error('Документ не найден');

    const { uri } = await Filesystem.getUri({ path: found.path, directory: DIRECTORY });
    await Share.share({
      title: `Анкета — ${clientName}`,
      text: `Анкета клиента ${clientName}, документ № ${documentId}`,
      files: [uri],
    });
  }

  /** Отдаёт наружу сразу все анкеты — выгрузка на почту или во внешнее хранилище. */
  async shareAll() {
    const uris = [];

    for (const yearDir of await this.#readdir(ROOT)) {
      if (yearDir.type !== 'directory') continue;
      for (const monthDir of await this.#readdir(`${ROOT}/${yearDir.name}`)) {
        if (monthDir.type !== 'directory') continue;
        const folder = `${ROOT}/${yearDir.name}/${monthDir.name}`;
        for (const file of await this.#readdir(folder)) {
          if (!file.name.endsWith('.pdf')) continue;
          const { uri } = await Filesystem.getUri({
            path: `${folder}/${file.name}`,
            directory: DIRECTORY,
          });
          uris.push(uri);
        }
      }
    }

    if (uris.length === 0) throw new Error('Сохранённых анкет нет');
    await Share.share({ title: 'Анкеты клиентов', files: uris });
    return uris.length;
  }
}

/** Запасное хранилище для запуска в обычном браузере. */
class BrowserStore {
  #db = null;

  async #open() {
    if (this.#db) return this.#db;

    this.#db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('anketa', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('documents', { keyPath: 'documentId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.#db;
  }

  async #transaction(mode, run) {
    const db = await this.#open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', mode);
      const request = run(tx.objectStore('documents'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async save({ documentId, createdAt, clientName, formId, formTitle, pdfBytes, values }) {
    const meta = {
      documentId,
      createdAt,
      clientName,
      formId,
      formTitle,
      size: pdfBytes.length,
      values,
    };
    await this.#transaction('readwrite', (store) => store.put({ ...meta, pdf: pdfBytes }));
    return meta;
  }

  async list({ search = '', limit = 500 } = {}) {
    const records = await this.#transaction('readonly', (store) => store.getAll());
    return sortAndFilter(records.map(toListItem), search, limit);
  }

  async readPdf(documentId) {
    const record = await this.#transaction('readonly', (store) => store.get(documentId));
    return record ? new Uint8Array(record.pdf) : null;
  }

  async share(documentId, clientName) {
    const bytes = await this.readPdf(documentId);
    if (!bytes) throw new Error('Документ не найден');

    // В браузере системного «Поделиться» нет — просто скачиваем файл.
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${documentBaseName(documentId, clientName)}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async shareAll() {
    const { items } = await this.list({});
    for (const item of items) await this.share(item.documentId, item.clientName);
    return items.length;
  }
}

export const store = Capacitor.isNativePlatform() ? new NativeStore() : new BrowserStore();
export const isNative = Capacitor.isNativePlatform();
