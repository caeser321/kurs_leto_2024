/**
 * Сборка веб-части приложения в каталог www/, который Capacitor
 * упаковывает внутрь APK.
 *
 * Всё, что нужно приложению, попадает в APK: разметка, стили, шрифты
 * с кириллицей и JS-бандл вместе с pdf-lib. После установки приложение
 * не обращается в сеть — анкета заполняется и превращается в PDF
 * прямо на планшете.
 */

import esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(appRoot, '..');
const www = path.join(appRoot, 'www');

const watch = process.argv.includes('--watch');

await fs.rm(www, { recursive: true, force: true });
await fs.mkdir(path.join(www, 'js'), { recursive: true });
await fs.mkdir(path.join(www, 'css'), { recursive: true });
await fs.mkdir(path.join(www, 'fonts'), { recursive: true });

// Разметка, стили и иконка.
await fs.copyFile(path.join(appRoot, 'html/index.html'), path.join(www, 'index.html'));
await fs.copyFile(path.join(appRoot, 'html/archive.html'), path.join(www, 'archive.html'));
await fs.copyFile(
  path.join(projectRoot, 'public/css/style.css'),
  path.join(www, 'css/style.css'),
);
await fs.copyFile(
  path.join(projectRoot, 'public/favicon.svg'),
  path.join(www, 'favicon.svg'),
);

// Шрифты с кириллицей: PDF собирается на устройстве, значит и шрифты нужны там.
for (const font of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']) {
  await fs.copyFile(path.join(projectRoot, 'fonts', font), path.join(www, 'fonts', font));
}

const options = {
  entryPoints: [path.join(appRoot, 'src/main.js'), path.join(appRoot, 'src/archive.js')],
  outdir: path.join(www, 'js'),
  bundle: true,
  format: 'esm',
  splitting: true,
  minify: !watch,
  sourcemap: watch,
  target: ['es2020'],
  loader: { '.json': 'json' },
  logLevel: 'info',
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log('Слежу за изменениями. Ctrl+C — выход.');
} else {
  await esbuild.build(options);

  const bundle = await fs.readFile(path.join(www, 'js/main.js'));
  console.log(`www/ собран, бандл ${(bundle.length / 1024).toFixed(0)} КБ`);
}
