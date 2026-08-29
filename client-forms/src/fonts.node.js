import fs from 'node:fs/promises';

let cache = null;

/**
 * Читает шрифты с диска для серверной сборки PDF.
 * В Android-приложении шрифты приходят не отсюда, а из ресурсов APK,
 * поэтому загрузка вынесена из общего модуля pdf.js.
 *
 * @param {{regular: string, bold: string}} fontPaths пути к TTF-файлам
 * @returns {Promise<{regular: Uint8Array, bold: Uint8Array}>}
 */
export async function loadFontBytes(fontPaths) {
  if (!cache) {
    const [regular, bold] = await Promise.all([
      fs.readFile(fontPaths.regular),
      fs.readFile(fontPaths.bold),
    ]);
    cache = { regular, bold };
  }
  return cache;
}
