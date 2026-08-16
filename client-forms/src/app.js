import express from 'express';
import { loadForm, validateSubmission, buildClientName } from './schema.js';
import { renderSubmissionPdf } from './pdf.js';
import { SubmissionStore, generateDocumentId } from './storage.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_SIGNATURE_BYTES = 4 * 1024 * 1024;

/** Разбирает подпись, присланную как data URL из <canvas>.toDataURL('image/png'). */
export function parseSignature(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl === '') {
    return { error: 'Подпись не поставлена' };
  }

  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) return { error: 'Подпись должна быть изображением PNG' };

  let buffer;
  try {
    buffer = Buffer.from(match[1], 'base64');
  } catch {
    return { error: 'Не удалось прочитать подпись' };
  }

  if (buffer.length > MAX_SIGNATURE_BYTES) return { error: 'Изображение подписи слишком большое' };
  if (!buffer.subarray(0, 8).equals(PNG_MAGIC)) return { error: 'Повреждённое изображение подписи' };

  return { buffer };
}

export async function createApp(config) {
  const form = await loadForm(config.formFile);
  const store = await new SubmissionStore(config.sharedDir).init();

  const app = express();
  app.set('store', store);
  app.set('form', form);
  app.use(express.json({ limit: config.maxBodySize }));

  app.get('/api/form', (req, res) => {
    res.json(form);
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', sharedDir: config.sharedDir, formId: form.id });
  });

  app.post('/api/submissions', async (req, res, next) => {
    try {
      const { valid, errors, values } = validateSubmission(form, req.body?.values);
      const signature = parseSignature(req.body?.signature);

      const signatureRequired = form.signature?.required !== false;
      if (signature.error && (signatureRequired || req.body?.signature)) {
        errors.__signature = signature.error;
      }

      if (!valid || errors.__signature) {
        return res.status(400).json({ error: 'Проверьте заполнение анкеты', errors });
      }

      const createdAt = new Date().toISOString();
      const documentId = generateDocumentId(new Date(createdAt));
      const clientName = buildClientName(form, values);

      const pdfBytes = await renderSubmissionPdf({
        form,
        values,
        signaturePng: signature.buffer,
        meta: { documentId, createdAt, clientName },
        fontPaths: config.fonts,
      });

      const saved = await store.save({
        documentId,
        createdAt,
        clientName,
        formId: form.id,
        formTitle: form.title,
        pdfBytes,
        values,
      });

      res.status(201).json({
        documentId,
        createdAt,
        clientName,
        pdfFile: saved.pdfFile,
        pdfUrl: `/api/submissions/${documentId}/pdf`,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/submissions', async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const result = await store.list({ limit, search: String(req.query.search || '') });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/submissions/:id/pdf', async (req, res, next) => {
    try {
      const found = await store.findPdf(req.params.id);
      if (!found) return res.status(404).json({ error: 'Документ не найден' });

      // download=1 — скачать файл, иначе показать в браузере.
      const disposition = req.query.download ? 'attachment' : 'inline';
      res.type('application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename="${found.meta.documentId}.pdf"; ` +
          `filename*=UTF-8''${encodeURIComponent(`${found.meta.clientName}.pdf`)}`,
      );
      res.sendFile(found.pdfPath);
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(config.publicDir, { extensions: ['html'] }));

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    console.error('Ошибка обработки запроса:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  return app;
}
