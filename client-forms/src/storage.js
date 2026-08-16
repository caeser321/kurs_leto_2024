import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

/**
 * Приводит имя к безопасному для файловой системы виду.
 * Кириллица транслитерируется: сетевые диски и SMB-шары
 * нередко портят не-ASCII имена файлов.
 */
export function slugify(text, maxLength = 48) {
  const slug = String(text)
    .toLowerCase()
    .split('')
    .map((char) => (TRANSLIT[char] !== undefined ? TRANSLIT[char] : char))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');

  return slug || 'anketa';
}

/** Человекочитаемый идентификатор документа: 20260816-143022-K3F9QA */
export function generateDocumentId(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без похожих друг на друга символов
  const bytes = crypto.randomBytes(6);
  const suffix = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');

  return `${stamp}-${suffix}`;
}

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
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return path.join(this.sharedDir, year, month);
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

    const baseName = `${documentId}__${slugify(clientName)}`;
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
