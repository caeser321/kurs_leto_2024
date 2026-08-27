import fs from 'node:fs/promises';
import path from 'node:path';
import { slugify, documentBaseName, documentFolder } from './naming.js';

// slugify и generateDocumentId живут в naming.js: их использует и
// Android-приложение, где нет модулей Node.
export { slugify, generateDocumentId } from './naming.js';

export class SubmissionStore {
  /** @param {string} sharedDir каталог общего пространства */
  constructor(sharedDir) {
    this.sharedDir = sharedDir;
  }

  async init() {
    await fs.mkdir(this.sharedDir, { recursive: true });
    return this;
  }

  /** Документы раскладываются по годам и месяцам, чтобы каталог не разрастался. */
  directoryFor(date) {
    return path.join(this.sharedDir, ...documentFolder(date).split('/'));
  }

  /**
   * Сохраняет PDF и сопровождающий JSON с данными анкеты.
   * Запись идёт через временный файл и rename, чтобы клиенты синхронизации
   * (Nextcloud, Диск) никогда не увидели наполовину записанный PDF.
   */
  async save({ documentId, createdAt, clientName, formId, formTitle, pdfBytes, values }) {
    const date = new Date(createdAt);
    const dir = this.directoryFor(date);
    await fs.mkdir(dir, { recursive: true });

    const baseName = documentBaseName(documentId, clientName);
    const pdfPath = path.join(dir, `${baseName}.pdf`);
    const metaPath = path.join(dir, `${baseName}.json`);

    const meta = {
      documentId,
      createdAt,
      clientName,
      formId,
      formTitle,
      pdfFile: path.relative(this.sharedDir, pdfPath),
      values,
    };

    await writeFileAtomic(pdfPath, Buffer.from(pdfBytes));
    await writeFileAtomic(metaPath, Buffer.from(`${JSON.stringify(meta, null, 2)}\n`, 'utf8'));

    return { ...meta, pdfPath, metaPath };
  }

  /**
   * Читает список сохранённых анкет, обходя каталог общего пространства.
   * Отдельной базы данных нет специально: архив остаётся читаемым,
   * даже если файлы попали в каталог из другой копии приложения.
   */
  async list({ limit = 200, search = '' } = {}) {
    const files = await collectJsonFiles(this.sharedDir);
    const items = [];

    for (const file of files) {
      try {
        const meta = JSON.parse(await fs.readFile(file, 'utf8'));
        if (!meta.documentId) continue;
        items.push({
          documentId: meta.documentId,
          createdAt: meta.createdAt,
          clientName: meta.clientName,
          formTitle: meta.formTitle,
          pdfFile: meta.pdfFile,
        });
      } catch {
        // Повреждённый или чужой JSON не должен ломать весь архив.
      }
    }

    items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? items.filter((item) =>
          `${item.clientName} ${item.documentId}`.toLowerCase().includes(needle),
        )
      : items;

    return { total: filtered.length, items: filtered.slice(0, limit) };
  }

  /** Находит сохранённый PDF по идентификатору документа. */
  async findPdf(documentId) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(documentId)) return null;

    const files = await collectJsonFiles(this.sharedDir);
    for (const file of files) {
      if (!path.basename(file).startsWith(`${documentId}__`)) continue;
      try {
        const meta = JSON.parse(await fs.readFile(file, 'utf8'));
        if (meta.documentId !== documentId) continue;

        const pdfPath = path.resolve(this.sharedDir, meta.pdfFile);
        // Защита от выхода за пределы общего пространства через поле pdfFile.
        if (!pdfPath.startsWith(path.resolve(this.sharedDir) + path.sep)) continue;

        return { meta, pdfPath };
      } catch {
        // см. list(): игнорируем нечитаемые записи
      }
    }
    return null;
  }
}

async function writeFileAtomic(target, buffer) {
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temp, buffer);
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

async function collectJsonFiles(root) {
  const found = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        found.push(full);
      }
    }
  }

  await walk(root);
  return found;
}
