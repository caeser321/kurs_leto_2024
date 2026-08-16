import fs from 'node:fs/promises';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { formatValue } from './schema.js';

const A4 = { width: 595.28, height: 841.89 };

const MARGIN = { top: 52, bottom: 56, left: 52, right: 52 };
const CONTENT_WIDTH = A4.width - MARGIN.left - MARGIN.right;
const LABEL_WIDTH = Math.round(CONTENT_WIDTH * 0.36);
const VALUE_X = MARGIN.left + LABEL_WIDTH + 12;
const VALUE_WIDTH = CONTENT_WIDTH - LABEL_WIDTH - 12;

const COLOR = {
  text: rgb(0.11, 0.12, 0.15),
  muted: rgb(0.42, 0.45, 0.5),
  accent: rgb(0.13, 0.35, 0.62),
  rule: rgb(0.85, 0.87, 0.9),
  signatureBox: rgb(0.72, 0.75, 0.8),
};

let fontCache = null;

async function readFonts(fontPaths) {
  if (!fontCache) {
    const [regular, bold] = await Promise.all([
      fs.readFile(fontPaths.regular),
      fs.readFile(fontPaths.bold),
    ]);
    fontCache = { regular, bold };
  }
  return fontCache;
}

/** Убирает управляющие символы, которые ломают отрисовку строки в PDF. */
function sanitize(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Разбивает текст на строки, помещающиеся в заданную ширину.
 * Слова, которые сами по себе шире строки (длинные номера, ссылки),
 * разрываются посимвольно.
 */
export function wrapText(text, font, size, maxWidth) {
  const lines = [];

  for (const paragraph of sanitize(text).split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
        current = '';
      }

      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }

      // Слово не помещается целиком — режем по символам.
      let chunk = '';
      for (const char of word) {
        if (font.widthOfTextAtSize(chunk + char, size) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      current = chunk;
    }

    if (current) lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}

/** Простой поточный макет: пишет сверху вниз и сам добавляет страницы. */
class Layout {
  constructor(doc, fonts) {
    this.doc = doc;
    this.fonts = fonts;
    this.pages = [];
    this.page = null;
    this.y = 0;
    this.addPage();
  }

  addPage() {
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.pages.push(this.page);
    this.y = A4.height - MARGIN.top;
    return this.page;
  }

  /** Гарантирует, что на текущей странице осталось не меньше height свободного места. */
  ensure(height) {
    if (this.y - height < MARGIN.bottom) this.addPage();
  }

  moveDown(amount) {
    this.y -= amount;
  }

  drawLines(lines, { x, size, font, color, lineHeight }) {
    for (const line of lines) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      if (line !== '') {
        this.page.drawText(line, { x, y: this.y, size, font, color });
      }
    }
  }

  /** Пишет абзац с переносом по ширине и возвращает занятую высоту. */
  paragraph(text, { x = MARGIN.left, width = CONTENT_WIDTH, size = 10, bold = false, color = COLOR.text, lineHeight } = {}) {
    const font = bold ? this.fonts.bold : this.fonts.regular;
    const step = lineHeight || size * 1.35;
    const lines = wrapText(text, font, size, width);
    this.drawLines(lines, { x, size, font, color, lineHeight: step });
  }

  rule(color = COLOR.rule) {
    this.ensure(8);
    this.y -= 6;
    this.page.drawLine({
      start: { x: MARGIN.left, y: this.y },
      end: { x: A4.width - MARGIN.right, y: this.y },
      thickness: 0.75,
      color,
    });
  }
}

function drawHeader(layout, { form, meta }) {
  const { page } = layout;

  if (form.organization) {
    layout.paragraph(form.organization, { size: 9.5, color: COLOR.muted });
    layout.moveDown(2);
  }

  layout.paragraph(form.title, { size: 19, bold: true, color: COLOR.text });
  layout.moveDown(6);

  const subtitle = `Документ № ${meta.documentId}    •    Заполнено: ${formatDateTime(meta.createdAt)}`;
  layout.paragraph(subtitle, { size: 9, color: COLOR.muted });
  layout.moveDown(4);

  layout.ensure(6);
  layout.y -= 4;
  page.drawLine({
    start: { x: MARGIN.left, y: layout.y },
    end: { x: A4.width - MARGIN.right, y: layout.y },
    thickness: 2,
    color: COLOR.accent,
  });
  layout.moveDown(16);
}

function drawSection(layout, section) {
  // Заголовок секции не должен «отрываться» от первого поля.
  layout.ensure(58);
  layout.moveDown(6);
  layout.paragraph(section.title, { size: 12.5, bold: true, color: COLOR.accent });
  layout.moveDown(8);
}

function drawField(layout, field, values) {
  const value = formatValue(field, values[field.name]);

  const labelLines = wrapText(field.label, layout.fonts.regular, 9.5, LABEL_WIDTH);
  const valueLines = wrapText(value, layout.fonts.bold, 10.5, VALUE_WIDTH);

  const labelHeight = labelLines.length * 13;
  const valueHeight = valueLines.length * 14;
  const rowHeight = Math.max(labelHeight, valueHeight) + 10;

  layout.ensure(rowHeight);
  const top = layout.y;

  labelLines.forEach((line, index) => {
    layout.page.drawText(line, {
      x: MARGIN.left,
      y: top - 10 - index * 13,
      size: 9.5,
      font: layout.fonts.regular,
      color: COLOR.muted,
    });
  });

  valueLines.forEach((line, index) => {
    layout.page.drawText(line, {
      x: VALUE_X,
      y: top - 10 - index * 14,
      size: 10.5,
      font: layout.fonts.bold,
      color: COLOR.text,
    });
  });

  layout.y = top - rowHeight;
  layout.page.drawLine({
    start: { x: MARGIN.left, y: layout.y + 2 },
    end: { x: A4.width - MARGIN.right, y: layout.y + 2 },
    thickness: 0.5,
    color: COLOR.rule,
  });
}

/**
 * Согласия печатаются во всю ширину страницы с отметкой [X] или [  ].
 * Текст согласия — юридически значимая часть документа, поэтому он
 * приводится полностью, а не сокращается до колонки со значением.
 */
function drawConsent(layout, field, values) {
  const checked = values[field.name] === true;
  const mark = checked ? '[X]' : '[  ]';

  const markWidth = layout.fonts.bold.widthOfTextAtSize('[X]', 10) + 10;
  const textX = MARGIN.left + markWidth;
  const textWidth = CONTENT_WIDTH - markWidth;

  const lines = wrapText(field.label, layout.fonts.regular, 9.5, textWidth);
  const rowHeight = lines.length * 13 + 10;

  layout.ensure(rowHeight);
  const top = layout.y;

  layout.page.drawText(mark, {
    x: MARGIN.left,
    y: top - 10,
    size: 10,
    font: layout.fonts.bold,
    color: checked ? COLOR.text : COLOR.muted,
  });

  lines.forEach((line, index) => {
    layout.page.drawText(line, {
      x: textX,
      y: top - 10 - index * 13,
      size: 9.5,
      font: layout.fonts.regular,
      color: COLOR.text,
    });
  });

  layout.y = top - rowHeight;
  layout.page.drawLine({
    start: { x: MARGIN.left, y: layout.y + 2 },
    end: { x: A4.width - MARGIN.right, y: layout.y + 2 },
    thickness: 0.5,
    color: COLOR.rule,
  });
}

async function drawSignature(layout, { doc, form, meta, signaturePng }) {
  const settings = form.signature || {};
  const blockHeight = 190;

  layout.ensure(blockHeight);
  layout.moveDown(14);
  layout.paragraph(settings.label || 'Подпись клиента', { size: 12.5, bold: true, color: COLOR.accent });
  layout.moveDown(6);

  if (settings.statement) {
    layout.paragraph(settings.statement, { size: 9.5, color: COLOR.muted });
    layout.moveDown(10);
  }

  const boxWidth = 260;
  const boxHeight = 96;
  layout.ensure(boxHeight + 46);

  const boxTop = layout.y;
  const boxBottom = boxTop - boxHeight;

  if (signaturePng) {
    const image = await doc.embedPng(signaturePng);
    const scale = Math.min((boxWidth - 24) / image.width, (boxHeight - 18) / image.height, 1);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;

    layout.page.drawImage(image, {
      x: MARGIN.left + (boxWidth - drawWidth) / 2,
      y: boxBottom + (boxHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }

  // Линия подписи.
  layout.page.drawLine({
    start: { x: MARGIN.left, y: boxBottom },
    end: { x: MARGIN.left + boxWidth, y: boxBottom },
    thickness: 0.75,
    color: COLOR.signatureBox,
  });

  layout.page.drawText('подпись', {
    x: MARGIN.left,
    y: boxBottom - 12,
    size: 8,
    font: layout.fonts.regular,
    color: COLOR.muted,
  });

  // Правая колонка: расшифровка подписи и дата.
  const rightX = MARGIN.left + boxWidth + 40;
  const rightWidth = A4.width - MARGIN.right - rightX;

  const nameLines = wrapText(meta.clientName, layout.fonts.bold, 10.5, rightWidth);
  nameLines.forEach((line, index) => {
    layout.page.drawText(line, {
      x: rightX,
      y: boxBottom + 16 - index * 13,
      size: 10.5,
      font: layout.fonts.bold,
      color: COLOR.text,
    });
  });

  layout.page.drawLine({
    start: { x: rightX, y: boxBottom },
    end: { x: A4.width - MARGIN.right, y: boxBottom },
    thickness: 0.75,
    color: COLOR.signatureBox,
  });

  layout.page.drawText('расшифровка подписи', {
    x: rightX,
    y: boxBottom - 12,
    size: 8,
    font: layout.fonts.regular,
    color: COLOR.muted,
  });

  layout.y = boxBottom - 30;
  layout.paragraph(`Дата подписания: ${formatDateTime(meta.createdAt)}`, { size: 9.5, color: COLOR.muted });
}

function drawFooters(layout, meta) {
  const total = layout.pages.length;
  layout.pages.forEach((page, index) => {
    const left = `Документ № ${meta.documentId}`;
    const right = `Страница ${index + 1} из ${total}`;

    page.drawLine({
      start: { x: MARGIN.left, y: MARGIN.bottom - 14 },
      end: { x: A4.width - MARGIN.right, y: MARGIN.bottom - 14 },
      thickness: 0.5,
      color: COLOR.rule,
    });

    page.drawText(left, {
      x: MARGIN.left,
      y: MARGIN.bottom - 26,
      size: 8,
      font: layout.fonts.regular,
      color: COLOR.muted,
    });

    const rightWidth = layout.fonts.regular.widthOfTextAtSize(right, 8);
    page.drawText(right, {
      x: A4.width - MARGIN.right - rightWidth,
      y: MARGIN.bottom - 26,
      size: 8,
      font: layout.fonts.regular,
      color: COLOR.muted,
    });
  });
}

function formatDateTime(iso) {
  const date = new Date(iso);
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Собирает PDF анкеты: данные полей + подпись клиента.
 * @returns {Promise<Uint8Array>} содержимое PDF-файла
 */
export async function renderSubmissionPdf({ form, values, signaturePng, meta, fontPaths }) {
  const fontFiles = await readFonts(fontPaths);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const fonts = {
    regular: await doc.embedFont(fontFiles.regular, { subset: true }),
    bold: await doc.embedFont(fontFiles.bold, { subset: true }),
  };

  doc.setTitle(`${form.title} — ${meta.clientName}`);
  doc.setSubject(form.title);
  doc.setProducer('client-forms');
  doc.setCreator('client-forms');
  doc.setCreationDate(new Date(meta.createdAt));

  const layout = new Layout(doc, fonts);
  drawHeader(layout, { form, meta });

  for (const section of form.sections) {
    drawSection(layout, section);
    for (const field of section.fields || []) {
      if (field.type === 'checkbox') {
        drawConsent(layout, field, values);
      } else {
        drawField(layout, field, values);
      }
    }
  }

  await drawSignature(layout, { doc, form, meta, signaturePng });
  drawFooters(layout, meta);

  return doc.save();
}
