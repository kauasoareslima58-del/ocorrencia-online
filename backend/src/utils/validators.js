import { httpError } from '../middleware/error-handler.js';

export function cleanText(value, maxLength) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (text.length > maxLength) {
    throw httpError(400, `O texto deve ter no máximo ${maxLength} caracteres.`);
  }
  return text;
}

export function optionalText(value, maxLength) {
  const text = String(value ?? '').trim();
  if (text.length > maxLength) {
    throw httpError(400, `O texto deve ter no máximo ${maxLength} caracteres.`);
  }
  return text || null;
}

export function isStrongPassword(password) {
  return typeof password === 'string'
    && password.length >= 8
    && password.length <= 72
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

export function isValidEmail(email) {
  return typeof email === 'string'
    && email.length <= 180
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidRegistration(registration) {
  return typeof registration === 'string' && /^[A-Z0-9.-]{3,30}$/.test(registration);
}

export function uniquePositiveIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}
