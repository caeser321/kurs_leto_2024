/**
 * Имена файлов и идентификаторы документов.
 * Модуль работает и в Node, и в браузере планшета, поэтому опирается
 * только на Web Crypto API, доступный в обоих окружениях.
 */

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
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(6));
  const suffix = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');

  return `${stamp}-${suffix}`;
}

/** Базовое имя файлов документа — без расширения. */
export function documentBaseName(documentId, clientName) {
  return `${documentId}__${slugify(clientName)}`;
}

/** Подкаталог вида 2026/08 — чтобы каталог не разрастался в один список. */
export function documentFolder(date) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}
