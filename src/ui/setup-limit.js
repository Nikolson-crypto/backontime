// Блок 02 экрана настройки: какой лимит у парковки — P-skive, «оплачено до» или без лимита.
import { t } from '../i18n/index.js';
import { limitUntilFor } from '../parking/limits.js';

const el = (id) => document.getElementById(id);

// Тип лимита → панель с его настройками.
const PANELS = {
  pskive: 'limit-panel-pskive',
  paid_until: 'limit-panel-paid',
  none: 'limit-panel-none',
};

let limitType = 'pskive';
let hours = null; // выбранные часы P-skive (дробные для «своё, мин»)
let notify = () => {};

/** Текущий выбор: { type, until, reason }. reason: 'past' | 'invalid' | null. */
export function readLimit(now = Date.now()) {
  const paidUntilHHMM = el('paid-until').value;
  return { type: limitType, ...limitUntilFor({ type: limitType, hours, paidUntilHHMM, now }) };
}

function markSelected(container, btn) {
  [...container.children].forEach((c) => c.classList.toggle('selected', c === btn));
}

function showPanel() {
  Object.entries(PANELS).forEach(([type, id]) => el(id).classList.toggle('hidden', type !== limitType));
}

/** Пересчитать выбор, показать ошибку «время уже прошло» и сообщить экрану настройки. */
function changed() {
  const limit = readLimit();
  el('limit-error').textContent = limit.reason === 'past' ? t('setup.limit.pastError') : '';
  notify(limit);
}

/** Задать тип и часы снаружи (например, из join-ссылки). */
export function setLimit({ type, minutes }) {
  limitType = type;
  markSelected(el('limit-type'), el('limit-type').querySelector(`[data-type="${type}"]`));
  showPanel();
  if (minutes > 0) {
    hours = minutes / 60;
    el('custom-minutes').value = minutes;
    markSelected(el('duration-presets'), null);
  }
  changed();
}

/** Навесить обработчики; onChange({ type, until, reason }) — при любом изменении выбора. */
export function initLimitPanel({ onChange }) {
  notify = onChange || (() => {});
  const types = el('limit-type');
  const presets = el('duration-presets');
  const customInput = el('custom-minutes');

  types.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    limitType = btn.dataset.type;
    markSelected(types, btn);
    showPanel();
    changed();
  });

  presets.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    hours = Number(btn.dataset.hours);
    customInput.value = '';
    markSelected(presets, btn);
    changed();
  });

  customInput.addEventListener('input', () => {
    const minutes = Number(customInput.value);
    hours = minutes > 0 ? minutes / 60 : null;
    if (minutes > 0) markSelected(presets, null);
    changed();
  });

  el('paid-until').addEventListener('input', changed);
  showPanel();
}
