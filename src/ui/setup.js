// Экран настройки: отметить точку, выбрать время, темп, запас → сессия.
import { t } from '../i18n/index.js';
import { getCurrentPosition, geoErrorKey } from '../geo/position.js';
import { saveSession, createSession, applyManualPoint } from '../parking/session.js';
import { limitUntilFor } from '../parking/limits.js';
import { showSetupMap } from './setup-map.js';

const el = (id) => document.getElementById(id);

let markedPoint = null; // {lat, lng, note?, photo?}
let selectedMinutes = null;

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

function updateStartButton() {
  el('btn-start').disabled = !(markedPoint && selectedMinutes > 0);
}

function selectPreset(btn) {
  const presets = el('duration-presets');
  [...presets.children].forEach((c) => c.classList.toggle('selected', c === btn));
}

/** Тап по карте: место машины уточнено вручную. */
function onManualMove(latlng) {
  markedPoint = applyManualPoint(markedPoint, latlng);
  el('point-status').textContent = t('setup.point.adjusted');
  updateStartButton();
}

/** Предзаполнить экран точкой из join-ссылки. */
export function applyJoinParams(join) {
  markedPoint = { lat: join.lat, lng: join.lng, note: join.note };
  el('point-status').textContent = t('setup.point.fromLink');
  el('point-details').classList.remove('hidden');
  el('point-note').value = join.note;
  el('btn-mark-point').textContent = t('setup.point.remark');
  const minutesLeft = Math.max(1, Math.round((join.deadline - Date.now()) / 60000));
  el('custom-minutes').value = minutesLeft;
  selectedMinutes = minutesLeft;
  const banner = el('join-banner');
  banner.textContent = t('setup.join.banner', { minutes: minutesLeft });
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
  const customInput = el('custom-minutes');
  const presets = el('duration-presets');

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

  presets.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    selectedMinutes = Number(btn.dataset.min);
    customInput.value = '';
    selectPreset(btn);
    updateStartButton();
  });

  customInput.addEventListener('input', () => {
    const v = Number(customInput.value);
    selectedMinutes = v > 0 ? v : null;
    if (v > 0) selectPreset(null);
    updateStartButton();
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
    // Пресеты минут — это P-skive с дробным числом часов.
    const limit = limitUntilFor({ type: 'pskive', hours: selectedMinutes / 60, now });
    const session = createSession({
      point: markedPoint,
      limitType: 'pskive',
      limitUntil: limit.until,
      paceKmh: Number(el('pace-select').value),
      bufferMs: Number(el('buffer-select').value) * 60 * 1000,
      now,
    });
    saveSession(session);
    onStart(session);
  });
}
