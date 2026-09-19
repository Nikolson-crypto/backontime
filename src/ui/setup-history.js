// Карточка «Последние парковки» на экране настройки: тап по строке — отметить там же.
import { t } from '../i18n/index.js';
import { loadHistory } from '../parking/history.js';

const el = (id) => document.getElementById(id);

// Тип лимита → ключ перевода для подписи строки.
const LIMIT_KEYS = {
  pskive: 'setup.limit.pskive',
  paid_until: 'setup.limit.paid',
  none: 'setup.limit.none',
};

/** «19.09, 12:30» — дата и время начала парковки на языке интерфейса. */
function formatStarted(startedAt) {
  return new Date(startedAt).toLocaleString(t('fmt.locale'), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildRow(entry, onPick) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'history-row';

  const note = document.createElement('span');
  note.className = 'history-note';
  note.textContent = entry.note || t('setup.history.noNote');

  const meta = document.createElement('span');
  meta.className = 'history-meta';
  meta.textContent = `${formatStarted(entry.startedAt)} · ${t(LIMIT_KEYS[entry.limitType] || 'setup.limit.none')}`;

  row.append(note, meta);
  row.addEventListener('click', () => onPick(entry));
  return row;
}

/** Показать историю; пустая история — карточки нет. onPick(entry) — выбрали строку. */
export function initHistory({ onPick }) {
  const card = el('history-card');
  const list = loadHistory();
  if (!card) return;
  if (!list.length) {
    card.classList.add('hidden');
    return;
  }
  const box = el('history-list');
  box.replaceChildren(...list.map((entry) => buildRow(entry, onPick)));
  card.classList.remove('hidden');
}
