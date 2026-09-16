// Переводы. Язык берём из localStorage, иначе из языка телефона; по умолчанию английский.
// Датский пока = английский (заполняется в эпике E5).
import ru from './ru.json';
import en from './en.json';
import da from './da.json';

const LOCALE_KEY = 'backontime.locale.v1';
const DICTS = { ru, en, da };
let current = 'en';

export function detectLocale(navigatorLanguage, stored) {
  if (stored && DICTS[stored]) return stored;
  const lang = String(navigatorLanguage || '').slice(0, 2).toLowerCase();
  return DICTS[lang] ? lang : 'en';
}

export function initLocale() {
  let stored = null;
  try { stored = localStorage.getItem(LOCALE_KEY); } catch { /* приватный режим */ }
  current = detectLocale(typeof navigator !== 'undefined' ? navigator.language : '', stored);
  if (typeof document !== 'undefined') document.documentElement.lang = current;
  return current;
}

export function setLocale(locale) {
  if (!DICTS[locale]) return;
  current = locale;
  try { localStorage.setItem(LOCALE_KEY, locale); } catch { /* ignore */ }
}

export function getLocale() {
  return current;
}

/** t('setup.point.marked', { accuracy: 12 }) → строка с подставленными {параметрами}. */
export function t(key, params = {}) {
  const dict = DICTS[current] || en;
  let value = dict[key] ?? en[key] ?? key;
  if (Array.isArray(value)) return value;
  for (const [k, v] of Object.entries(params)) value = value.split(`{${k}}`).join(String(v));
  return value;
}

/** Проставить переводы в разметку: data-i18n="key" (текст), data-i18n-placeholder, data-i18n-alt, data-i18n-title. */
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-alt]').forEach((node) => { node.alt = t(node.dataset.i18nAlt); });
  root.querySelectorAll('[data-i18n-title]').forEach((node) => { node.title = t(node.dataset.i18nTitle); });
  root.querySelectorAll('[data-cardinal]').forEach((node) => { node.textContent = t('compass.dirs')[Number(node.dataset.cardinal)]; });
  root.querySelectorAll('#pace-select option').forEach((o) => { o.textContent = t('setup.settings.paceUnit', { kmh: o.value }); });
  root.querySelectorAll('#buffer-select option').forEach((o) => {
    o.textContent = o.value === '0' ? t('setup.settings.bufferNone') : t('setup.settings.bufferMin', { min: o.value });
  });
}
