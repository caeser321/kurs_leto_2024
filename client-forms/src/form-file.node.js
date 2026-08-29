import fs from 'node:fs/promises';
import { validateFormDefinition } from './schema.js';

/**
 * Читает описание анкеты с диска (серверная версия).
 * В Android-приложении анкета попадает в бандл на этапе сборки,
 * поэтому чтение файла вынесено из общего модуля schema.js.
 */
export async function loadForm(formFile) {
  const form = JSON.parse(await fs.readFile(formFile, 'utf8'));
  return validateFormDefinition(form, formFile);
}
