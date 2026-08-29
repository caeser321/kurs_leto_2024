import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Общее пространство — каталог, в который складываются готовые PDF.
 * Это может быть локальная папка, сетевой диск (SMB/NFS) или каталог,
 * синхронизируемый Nextcloud / Яндекс.Диском / Google Drive.
 */
const sharedDir = path.resolve(process.env.SHARED_DIR || path.join(projectRoot, 'shared'));

/**
 * Шрифты с поддержкой кириллицы. Стандартные шрифты PDF (Helvetica и др.)
 * используют кодировку WinAnsi и не умеют печатать кириллицу, поэтому
 * TrueType-шрифт встраивается в документ.
 */
function resolveFont(bundledName, systemCandidates) {
  const bundled = path.join(projectRoot, 'fonts', bundledName);
  const candidates = [bundled, ...systemCandidates];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Не найден шрифт ${bundledName}. Положите файл в ${path.join(projectRoot, 'fonts')} ` +
      `или установите пакет шрифтов DejaVu.`,
  );
}

export const config = {
  projectRoot,
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  sharedDir,
  formFile: path.resolve(process.env.FORM_FILE || path.join(projectRoot, 'forms', 'anketa.json')),
  publicDir: path.join(projectRoot, 'public'),

  /** Максимальный размер тела запроса — подпись передаётся как PNG в base64. */
  maxBodySize: process.env.MAX_BODY_SIZE || '8mb',

  fonts: {
    regular: resolveFont('DejaVuSans.ttf', [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/dejavu/DejaVuSans.ttf',
      '/Library/Fonts/DejaVuSans.ttf',
      'C:\\Windows\\Fonts\\DejaVuSans.ttf',
    ]),
    bold: resolveFont('DejaVuSans-Bold.ttf', [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
      '/Library/Fonts/DejaVuSans-Bold.ttf',
      'C:\\Windows\\Fonts\\DejaVuSans-Bold.ttf',
    ]),
  },
};
