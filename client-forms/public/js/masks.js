/**
 * Маски ввода для даты и телефона.
 *
 * Разделители дописываются только между цифрами и никогда не остаются
 * в конце строки. Иначе получается ловушка: гость стирает точку, маска
 * тут же возвращает её обратно, и удалить символ не выходит.
 */

/** Дата: 17051990 → 17.05.1990 */
export function formatDateInput(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

/**
 * Телефон: 9001234567 → +7 (900) 123-45-67
 *
 * Российский код подставляется сам, но не навязывается: если гость
 * сотрёт его и наберёт другой (например +380), номер останется как введён —
 * чужие форматы нумерации мы не знаем и ломать их не должны.
 */
export function formatPhoneInput(raw) {
  const text = String(raw ?? '').trim();
  const digits = text.replace(/\D/g, '');

  if (digits === '') return text.startsWith('+') ? '+' : '';

  // Набранный «+» означает, что гость вводит международный код: такой номер
  // не трогаем. Российским считаем номер с кодом 7 или 8 и номер, набранный
  // вообще без кода — привычка набирать сразу с девятки.
  if (text.startsWith('+') && !digits.startsWith('7')) {
    return `+${digits.slice(0, 15)}`;
  }

  const withoutCode =
    digits.startsWith('7') || digits.startsWith('8') ? digits.slice(1, 11) : digits.slice(0, 10);

  let out = '+7';
  if (withoutCode.length > 0) out += ` (${withoutCode.slice(0, 3)}`;
  if (withoutCode.length >= 3) out += ')';
  if (withoutCode.length > 3) out += ` ${withoutCode.slice(3, 6)}`;
  if (withoutCode.length > 6) out += `-${withoutCode.slice(6, 8)}`;
  if (withoutCode.length > 8) out += `-${withoutCode.slice(8, 10)}`;

  return out;
}

function countDigits(text) {
  return (text.match(/\d/g) || []).length;
}

/** Сколько цифр стоит левее курсора. */
function digitsBefore(text, position) {
  return countDigits(text.slice(0, position));
}

/** Позиция курсора сразу после n-й цифры. */
function positionAfterDigits(text, count) {
  if (count <= 0) return 0;

  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (/\d/.test(text[i])) {
      seen += 1;
      if (seen === count) return i + 1;
    }
  }
  return text.length;
}

/**
 * Вешает маску на поле ввода.
 *
 * Курсор восстанавливается по числу цифр слева от него, а не по индексу
 * символа: иначе при правке в середине строки он прыгает через разделители.
 *
 * @param {HTMLInputElement} input
 * @param {(raw: string) => string} format
 * @param {{prefill?: string}} options prefill — что подставить при первом касании
 */
export function attachMask(input, format, options = {}) {
  const apply = () => {
    const before = input.value;
    const caret = input.selectionStart ?? before.length;
    const typedDigits = digitsBefore(before, caret);

    const formatted = format(before);
    if (formatted === before) return;

    input.value = formatted;

    // Маска может дописать цифры, которых гость не набирал, — например код
    // страны у номера, введённого сразу с девятки. Их нужно учесть, иначе
    // курсор встанет внутрь префикса и следующая цифра уедет не туда.
    const addedDigits = countDigits(formatted) - countDigits(before);
    const target = typedDigits + Math.max(0, addedDigits);

    // Поле может быть вне фокуса (значение подставили программно).
    if (document.activeElement === input) {
      const position = positionAfterDigits(formatted, target);
      input.setSelectionRange(position, position);
    }
  };

  input.addEventListener('input', apply);

  if (options.prefill) {
    input.addEventListener('focus', () => {
      if (input.value === '') {
        input.value = options.prefill;
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });

    // Если гость только заглянул в поле и ничего не ввёл, подставленный код
    // нужно убрать: иначе необязательное поле провалит проверку формата.
    input.addEventListener('blur', () => {
      if (input.value.replace(/\D/g, '').length <= 1) input.value = '';
    });
  }
}
