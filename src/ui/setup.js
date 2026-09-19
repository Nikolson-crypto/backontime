// Экран настройки: отметить машину, выбрать лимит, темп, запас → сессия.
import { t } from '../i18n/index.js';
import { getCurrentPosition, geoErrorKey } from '../geo/position.js';
import { saveSession, createSession, applyManualPoint } from '../parking/session.js';
import { rememberSession } from '../parking/history.js';
import { showSetupMap } from './setup-map.js';
import { initLimitPanel, readLimit, setLimit } from './setup-limit.js';
import { initHistory } from './setup-history.js';

const el = (id) => document.getElementById(id);

let markedPoint = null; // {lat, lng, note?, photo?}
let limit = { type: 'pskive', until: null, reason: 'invalid' };

function downscaleImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Кнопка старта: активна, когда есть машина и понятный лимит; подпись зависит от типа. */
function updateStartButton() {
  const limitReady = limit.type === 'none' || limit.until !== null;
  el('btn-start').disabled = !(markedPoint && limitReady);
  el('btn-start').textContent = limit.type === 'none' ? t('setup.startNoLimit') : t('setup.start');
}

/** Тап по карте: место машины уточнено вручную. */
function onManualMove(latlng) {
  markedPoint = applyManualPoint(markedPoint, latlng);
  el('point-status').textContent = t('setup.point.adjusted');
  updateStartButton();
}

/** Тап по строке истории: ставим машину туда же, где она стояла в прошлый раз. */
function pickFromHistory(entry) {
  markedPoint = { lat: entry.lat, lng: entry.lng, note: entry.note || '' };
  el('point-status').textContent = t('setup.point.fromHistory');
  el('point-details').classList.remove('hidden');
  el('point-note').value = markedPoint.note;
  el('btn-mark-point').textContent = t('setup.point.remark');
  showSetupMap(markedPoint, onManualMove);
  updateStartButton();
}

/** Предзаполнить экран точкой из join-ссылки. */
export function applyJoinParams(join) {
  markedPoint = { lat: join.lat, lng: join.lng, note: join.note };
  el('point-status').textContent = t('setup.point.fromLink');
  el('point-details').classList.remove('hidden');
  el('point-note').value = join.note;
  el('btn-mark-point').textContent = t('setup.point.remark');
  const banner = el('join-banner');
  if (join.deadline) {
    // В ссылке есть время — предлагаем тот же остаток как P-skive.
    const minutesLeft = Math.max(1, Math.round((join.deadline - Date.now()) / 60000));
    setLimit({ type: 'pskive', minutes: minutesLeft });
    banner.textContent = t('setup.join.banner', { minutes: minutesLeft });
  } else {
    setLimit({ type: 'none' });
    banner.textContent = t('setup.join.bannerNoLimit');
  }
  banner.classList.remove('hidden');
  showSetupMap(markedPoint, onManualMove);
  updateStartButton();
}

/** Навесить обработчики; onStart(session) вызывается по кнопке «Начать». */
export function initSetupScreen({ onStart, onGpsStatus }) {
  const noteInput = el('point-note');
  const photoInput = el('point-photo');
  const preview = el('point-photo-preview');
  const btnMark = el('btn-mark-point');

  initLimitPanel({
    onChange: (next) => {
      limit = next;
      updateStartButton();
    },
  });
  initHistory({ onPick: pickFromHistory });

  noteInput.addEventListener('input', () => {
    if (markedPoint) markedPoint.note = noteInput.value.trim();
  });

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    if (!file || !markedPoint) return;
    try {
      markedPoint.photo = await downscaleImage(file, 480, 0.6);
      preview.src = markedPoint.photo;
      preview.classList.remove('hidden');
    } catch { /* не удалось обработать фото — пропускаем */ }
  });

  btnMark.addEventListener('click', async () => {
    el('setup-error').textContent = '';
    btnMark.disabled = true;
    btnMark.textContent = t('setup.point.locating');
    try {
      const pos = await getCurrentPosition();
      markedPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude, note: noteInput.value.trim() };
      el('point-status').textContent = t('setup.point.marked', { accuracy: Math.round(pos.coords.accuracy) });
      btnMark.textContent = t('setup.point.remark');
      el('point-details').classList.remove('hidden');
      showSetupMap(markedPoint, onManualMove);
      onGpsStatus(true);
    } catch (err) {
      el('setup-error').textContent = t('setup.error.geo', { reason: t(geoErrorKey(err)) });
      btnMark.textContent = t('setup.point.mark');
      onGpsStatus(false);
    } finally {
      btnMark.disabled = false;
      updateStartButton();
    }
  });

  el('btn-start').addEventListener('click', () => {
    const now = Date.now();
    // Пересчитываем лимит на момент нажатия: «оплачено до» и P-skive считаются от «сейчас».
    const chosen = readLimit(now);
    if (chosen.type !== 'none' && chosen.until === null) return;
    const session = createSession({
      point: markedPoint,
      limitType: chosen.type,
      limitUntil: chosen.until,
      paceKmh: Number(el('pace-select').value),
      bufferMs: Number(el('buffer-select').value) * 60 * 1000,
      now,
    });
    saveSession(session);
    rememberSession(session); // в истории видно и незавершённые парковки
    onStart(session);
  });
}
