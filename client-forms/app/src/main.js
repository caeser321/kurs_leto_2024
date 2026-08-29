/**
 * Экран заполнения анкеты в Android-приложении.
 *
 * В отличие от веб-версии здесь нет сервера: анкета проверяется,
 * PDF собирается и сохраняется прямо на планшете. Поэтому приложение
 * работает без интернета.
 */

import { SignaturePad } from '../../public/js/signature-pad.js';
import {
  buildForm,
  collectValues,
  applyFieldErrors,
  clearAllErrors,
  showError,
  hideError,
} from '../../public/js/form-ui.js';
import { validateSubmission, buildClientName } from '../../src/schema.js';
import { renderSubmissionPdf } from '../../src/pdf.js';
import { generateDocumentId } from '../../src/naming.js';
import form from '../../forms/anketa.json';
import { loadFontBytes } from './fonts.js';
import { store, base64ToBytes } from './device-store.js';

const elements = {
  form: document.getElementById('form'),
  sections: document.getElementById('sections'),
  loading: document.getElementById('loading'),
  title: document.getElementById('title'),
  org: document.getElementById('org'),
  submit: document.getElementById('submit'),
  formError: document.getElementById('form-error'),
  signatureTitle: document.getElementById('signature-title'),
  signatureStatement: document.getElementById('signature-statement'),
  signatureError: document.getElementById('signature-error'),
  signatureHint: document.getElementById('signature-hint'),
  signaturePlaceholder: document.getElementById('signature-placeholder'),
  canvas: document.getElementById('signature-canvas'),
  undo: document.getElementById('undo'),
  clear: document.getElementById('clear'),
  success: document.getElementById('success'),
  successId: document.getElementById('success-id'),
  successShare: document.getElementById('success-share'),
  successNew: document.getElementById('success-new'),
};

let pad = null;
let lastSaved = null;

init();

function init() {
  document.title = form.title;
  elements.title.textContent = form.title;
  elements.org.textContent = form.organization || '';

  if (form.signature?.label) elements.signatureTitle.textContent = form.signature.label;
  if (form.signature?.statement) {
    elements.signatureStatement.textContent = form.signature.statement;
  }

  buildForm(elements.sections, form);

  pad = new SignaturePad(elements.canvas, {
    onChange: (instance) => {
      elements.signaturePlaceholder.hidden = !instance.isEmpty();
      if (!instance.isEmpty()) hideError(elements.signatureError);
    },
    onPenDetected: () => {
      elements.signatureHint.textContent =
        'Стилус распознан: нажим задаёт толщину линии, случайные касания ладонью игнорируются.';
    },
  });

  // onChange срабатывает в конце штриха, а подсказку нужно убрать сразу,
  // как только перо коснулось поля.
  elements.canvas.addEventListener('pointerdown', () => {
    elements.signaturePlaceholder.hidden = true;
  });

  elements.undo.addEventListener('click', () => pad.undo());
  elements.clear.addEventListener('click', () => pad.clear());
  elements.form.addEventListener('submit', onSubmit);
  elements.successNew.addEventListener('click', startNewForm);
  elements.successShare.addEventListener('click', shareLast);

  // Шрифты подтягиваются заранее, чтобы сохранение шло без заметной паузы.
  loadFontBytes().catch((error) => console.error('Шрифты не загрузились:', error));

  elements.loading.hidden = true;
  elements.form.hidden = false;
}

async function onSubmit(event) {
  event.preventDefault();
  resetErrors();

  // Дальше используются именно проверенные значения: в них дата приведена
  // к единому виду, а ответы на скрытые вопросы очищены. Исходные значения
  // из формы для документа не годятся.
  const { valid, errors, values } = validateSubmission(
    form,
    collectValues(elements.form, form),
  );

  const signature = pad.toDataURL();
  const signatureRequired = form.signature?.required !== false;
  if (!signature && signatureRequired) errors.__signature = 'Поставьте подпись';

  if (!valid || errors.__signature) {
    let firstInvalid = applyFieldErrors(elements.sections, errors);
    if (errors.__signature) {
      showError(elements.signatureError, errors.__signature);
      firstInvalid = firstInvalid || elements.canvas;
    }
    showError(elements.formError, 'Проверьте заполнение анкеты');
    firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  elements.submit.disabled = true;
  elements.submit.textContent = 'Сохранение…';

  try {
    const createdAt = new Date().toISOString();
    const documentId = generateDocumentId(new Date(createdAt));
    const clientName = buildClientName(form, values);

    const pdfBytes = await renderSubmissionPdf({
      form,
      values,
      signaturePng: signature ? base64ToBytes(signature.split(',')[1]) : null,
      meta: { documentId, createdAt, clientName },
      fontBytes: await loadFontBytes(),
    });

    await store.save({
      documentId,
      createdAt,
      clientName,
      formId: form.id,
      formTitle: form.title,
      pdfBytes,
      values,
    });

    lastSaved = { documentId, clientName };
    showSuccess();
  } catch (error) {
    console.error(error);
    showError(elements.formError, `Не удалось сохранить анкету: ${error.message}`);
  } finally {
    elements.submit.disabled = false;
    elements.submit.textContent = 'Сохранить анкету';
  }
}

function showSuccess() {
  elements.form.hidden = true;
  elements.success.hidden = false;
  elements.successId.textContent = lastSaved.documentId;
  window.scrollTo({ top: 0 });
}

async function shareLast() {
  if (!lastSaved) return;
  try {
    await store.share(lastSaved.documentId, lastSaved.clientName);
  } catch (error) {
    // Пользователь мог просто закрыть системное меню — это не ошибка.
    if (!/cancel/i.test(String(error?.message))) {
      console.error(error);
      alert(`Не удалось отправить файл: ${error.message}`);
    }
  }
}

function startNewForm() {
  elements.form.reset();
  pad.clear();
  resetErrors();
  lastSaved = null;
  elements.success.hidden = true;
  elements.form.hidden = false;
  window.scrollTo({ top: 0 });
}

function resetErrors() {
  hideError(elements.formError);
  hideError(elements.signatureError);
  clearAllErrors(elements.sections);
}
