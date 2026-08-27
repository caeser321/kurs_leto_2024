/**
 * Шрифты с кириллицей для сборки PDF на устройстве.
 * TTF-файлы лежат рядом с приложением внутри APK и грузятся один раз:
 * встраивать их в JS-бандл в base64 было бы в полтора раза тяжелее.
 */

let cache = null;

export async function loadFontBytes() {
  if (cache) return cache;

  const [regular, bold] = await Promise.all([
    fetchFont('fonts/DejaVuSans.ttf'),
    fetchFont('fonts/DejaVuSans-Bold.ttf'),
  ]);

  cache = { regular, bold };
  return cache;
}

async function fetchFont(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Не удалось загрузить шрифт ${path}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
