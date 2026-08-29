import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateInput, formatPhoneInput } from '../public/js/masks.js';

test('дата: точки подставляются по мере ввода', () => {
  assert.equal(formatDateInput('1'), '1');
  assert.equal(formatDateInput('17'), '17');
  assert.equal(formatDateInput('170'), '17.0');
  assert.equal(formatDateInput('1705'), '17.05');
  assert.equal(formatDateInput('17051'), '17.05.1');
  assert.equal(formatDateInput('17051990'), '17.05.1990');
});

test('дата: разделитель не остаётся в конце строки', () => {
  // Иначе стереть точку невозможно: маска сразу вернёт её обратно.
  for (const input of ['17', '1705']) {
    assert.ok(!formatDateInput(input).endsWith('.'), `«${input}» → ${formatDateInput(input)}`);
  }
});

test('дата: лишние символы и длина отбрасываются', () => {
  assert.equal(formatDateInput('17.05.1990'), '17.05.1990');
  assert.equal(formatDateInput('17abc05def1990'), '17.05.1990');
  assert.equal(formatDateInput('170519901234'), '17.05.1990');
  assert.equal(formatDateInput(''), '');
});

test('телефон: российский номер получает скобки и дефисы', () => {
  assert.equal(formatPhoneInput('+7'), '+7');
  assert.equal(formatPhoneInput('+79'), '+7 (9');
  assert.equal(formatPhoneInput('+7900'), '+7 (900)');
  assert.equal(formatPhoneInput('+79001'), '+7 (900) 1');
  assert.equal(formatPhoneInput('+79001234567'), '+7 (900) 123-45-67');
});

test('телефон: восьмёрку в начале приводим к +7', () => {
  assert.equal(formatPhoneInput('89001234567'), '+7 (900) 123-45-67');
});

test('телефон: уже отформатированный номер не портится', () => {
  const formatted = '+7 (900) 123-45-67';
  assert.equal(formatPhoneInput(formatted), formatted);
});

test('телефон: лишние цифры сверх номера отбрасываются', () => {
  assert.equal(formatPhoneInput('+790012345678888'), '+7 (900) 123-45-67');
});

test('телефон: чужой код страны не переделывается под российский формат', () => {
  // Гость из другой страны стирает +7 и вводит свой код — мешать нельзя.
  assert.equal(formatPhoneInput('+380671234567'), '+380671234567');
  assert.equal(formatPhoneInput('+1 555 0100'), '+15550100');
});

test('телефон: пустое поле остаётся пустым', () => {
  assert.equal(formatPhoneInput(''), '');
  assert.equal(formatPhoneInput('+'), '+');
});

test('телефон: номер без кода считается российским', () => {
  // Гость стёр всё и набрал номер сразу с девятки.
  assert.equal(formatPhoneInput('9001234567'), '+7 (900) 123-45-67');
  assert.equal(formatPhoneInput('900'), '+7 (900)');
});

test('телефон: «плюс» защищает международный код от переделки', () => {
  assert.equal(formatPhoneInput('+3'), '+3');
  assert.equal(formatPhoneInput('+38'), '+38');
  assert.equal(formatPhoneInput('+380'), '+380');
});
