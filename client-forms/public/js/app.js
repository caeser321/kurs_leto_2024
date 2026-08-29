import { SignaturePad } from './signature-pad.js';
import {
  buildForm,
  collectValues,
  applyFieldErrors,
  clearAllErrors,
  showError,
  hideError,
} from './form-ui.js';

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
  successOpen: document.getElementById('success-open'),
  successDownload: document.getElementById('success-download'),
  successNew: document.getElementById('success-new'),
};

let form = null;
let pad = null;

init();

async function init() {
  try {
    const response = await fetch('/api/form');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    form = await response.json();
  } catch (error) {
    elements.loading.textContent = 'Не удалось загрузить анкету. Обновите страницу.';
    console.error(error);
    return;
  }

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

  elements.loading.hidden = true;
  elements.form.hidden = false;
}

async function onSubmit(event) {
  event.preventDefault();
  resetErrors();

  const signature = pad.toDataURL();
  if (!signature && form.signature?.required !== false) {
    showError(elements.signatureError, 'Поставьте подпись');
    elements.canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  elements.submit.disabled = true;
  elements.submit.textContent = 'Сохранение…';

  try {
    const response = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: collectValues(elements.form, form), signature }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      applyServerErrors(result);
      return;
    }

    showSuccess(result);
  } catch (error) {
    console.error(error);
    showError(elements.formError, 'Не удалось связаться с сервером. Проверьте подключение к сети.');
  } finally {
    elements.submit.disabled = false;
    elements.submit.textContent = 'Отправить и сохранить PDF';
  }
}

function applyServerErrors(result) {
  const errors = result.errors || {};
  let firstInvalid = applyFieldErrors(elements.sections, errors);

  if (errors.__signature) {
    showError(elements.signatureError, errors.__signature);
    firstInvalid = firstInvalid || elements.canvas;
  }

  showError(elements.formError, result.error || 'Проверьте заполнение анкеты');
  firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showSuccess(result) {
  elements.form.hidden = true;
  elements.success.hidden = false;
  elements.successId.textContent = result.documentId;
  elements.successOpen.href = result.pdfUrl;
  elements.successDownload.href = `${result.pdfUrl}?download=1`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startNewForm() {
  elements.form.reset();
  pad.clear();
  resetErrors();
  elements.success.hidden = true;
  elements.form.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetErrors() {
  hideError(elements.formError);
  hideError(elements.signatureError);
  clearAllErrors(elements.sections);
}
