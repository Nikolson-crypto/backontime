// Экран отслеживания: GPS, маршрут, отсчёт, статус, сигнал, компас, ссылка.
import { t } from '../i18n/index.js';
import { getCurrentPosition, watchPosition, geoErrorKey } from '../geo/position.js';
import { fetchWalkingRoute, haversineMeters } from '../geo/route.js';
import { statusFor, deadlineOf, estimateWalkMs, extendSession, timestampForHHMM } from '../parking/limits.js';
import { clearSession, saveSession, recordEnded, buildShareUrl } from '../parking/session.js';
import { rememberSession } from '../parking/history.js';
import { fireAlarmOnce, silenceAlarm, stopAlarm } from '../alerts/local.js';
import { initMap, updateUserMarker, drawRoute, centerOn, setLocating } from '../map/map.js';
import { initCompass, updateCompass } from './compass.js';
import { fmtDuration, fmtClock, formatDistance } from './format.js';

const ROUTE_REFRESH_MS = 25000;
const ROUTE_REFRESH_DISTANCE_M = 25;

const el = (id) => document.getElementById(id);

let session = null;
let currentPos = null;
let cachedWalkMs = null;
let lastRouteFetchAt = 0;
let lastRouteFetchPos = null;
let watchId = null;
let tickInterval = null;
let wakeLock = null;
let setGpsStatus = () => {};

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* недоступно или отклонено */ }
}

function onPosition(pos) {
  currentPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  setGpsStatus(true);
  updateUserMarker(currentPos);
  maybeRefreshRoute();
}

async function maybeRefreshRoute() {
  if (!currentPos) return;
  const now = Date.now();
  const movedEnough = !lastRouteFetchPos || haversineMeters(lastRouteFetchPos, currentPos) >= ROUTE_REFRESH_DISTANCE_M;
  const timeElapsed = now - lastRouteFetchAt >= ROUTE_REFRESH_MS;
  if (!movedEnough && !timeElapsed && cachedWalkMs !== null) return;

  lastRouteFetchAt = now;
  lastRouteFetchPos = currentPos;
  try {
    const route = await fetchWalkingRoute(currentPos, session.point);
    cachedWalkMs = route.durationSec * 1000;
    drawRoute(route.coords);
  } catch {
    // OSRM недоступен — оцениваем по прямой
    cachedWalkMs = estimateWalkMs(haversineMeters(currentPos, session.point), session.paceKmh);
    drawRoute([[currentPos.lat, currentPos.lng], [session.point.lat, session.point.lng]]);
  }
}

function locateMe() {
  if (currentPos) { centerOn(currentPos); return; }
  setLocating(true);
  getCurrentPosition()
    .then((pos) => { onPosition(pos); centerOn(currentPos); })
    .catch(() => setGpsStatus(false))
    .finally(() => setLocating(false));
}

function setStatus(level, title, detail) {
  el('status-banner').className = 'status-banner status-' + level;
  el('screen-tracking').dataset.status = level;
  el('status-title').textContent = title;
  el('status-detail').textContent = detail;
}

function tick() {
  if (!session) return;
  const deadline = deadlineOf(session);
  el('stat-deadline').textContent = deadline === null ? t('tracking.noLimit') : fmtClock(deadline);

  if (cachedWalkMs === null) {
    el('ring-distance').textContent = t('tracking.searching');
    el('stat-walk-time').textContent = t('tracking.searching');
    el('stat-leave-in').textContent = '—';
    setStatus('ok', t('tracking.status.searching'), '');
    return;
  }

  el('ring-distance').textContent = currentPos ? formatDistance(haversineMeters(currentPos, session.point)) : '—';
  el('stat-walk-time').textContent = fmtDuration(cachedWalkMs);
  updateCompass(currentPos, session.point);

  const s = statusFor(session, { now: Date.now(), walkMs: cachedWalkMs });
  if (!s) {
    // Лимита нет: показываем только дорогу до машины, без статусов и тревоги.
    el('stat-leave-in').textContent = '—';
    setStatus('ok', t('tracking.status.none.title'), t('tracking.status.none.detail', { time: fmtDuration(cachedWalkMs) }));
    return;
  }

  el('stat-leave-in').textContent = s.timeUntilLeave > 0 ? fmtDuration(s.timeUntilLeave) : t('tracking.leaveNow');

  if (s.late) {
    setStatus('danger', t('tracking.status.late.title'), t('tracking.status.late.detail', { clock: fmtClock(deadline), time: fmtDuration(cachedWalkMs) }));
  } else if (s.level === 'danger') {
    setStatus('danger', t('tracking.status.leave.title'), t('tracking.status.leave.detail', { clock: fmtClock(deadline) }));
  } else if (s.level === 'warn') {
    setStatus('warn', t('tracking.status.warn.title'), t('tracking.status.warn.detail', { time: fmtDuration(s.timeUntilLeave) }));
  } else {
    setStatus('ok', t('tracking.status.ok.title'), t('tracking.status.ok.detail', { time: fmtDuration(s.timeUntilLeave) }));
  }
  if (s.alarm && fireAlarmOnce()) el('btn-silence').classList.remove('hidden');
}

async function share() {
  const url = buildShareUrl(session, window.location.href);
  const status = el('share-status');
  status.textContent = '';
  if (navigator.share) {
    try {
      await navigator.share({ title: t('tracking.share.title'), text: t('tracking.share.text'), url });
      return;
    } catch { /* отменили — копируем в буфер */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    status.textContent = t('tracking.share.copied');
  } catch {
    status.textContent = url;
  }
}

/** Продлить лимит: заплатили ещё или перевернули P-skive. */
function applyExtend(patch) {
  session = extendSession(session, patch);
  saveSession(session);
  stopAlarm(); // лимит сдвинулся — тревога может сработать заново
  el('btn-silence').classList.add('hidden');
  el('extend-sheet').classList.add('hidden');
  el('extend-error').textContent = '';
  tick();
}

/** Кнопка «Продлить» и её меню-лист. */
function initExtend() {
  const sheet = el('extend-sheet');
  const paidRow = el('extend-paid');

  el('btn-extend').addEventListener('click', () => {
    sheet.classList.toggle('hidden');
    paidRow.classList.toggle('hidden', session.limitType !== 'paid_until');
  });

  el('extend-presets').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (btn) applyExtend({ addMs: Number(btn.dataset.add) * 60 * 1000 });
  });

  el('btn-extend-apply').addEventListener('click', () => {
    const now = Date.now();
    const untilTs = timestampForHHMM(el('extend-until').value, now);
    if (untilTs === null) return;
    if (untilTs <= now) {
      el('extend-error').textContent = t('tracking.extend.pastError');
      return;
    }
    applyExtend({ untilTs });
  });
}

function stop() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (tickInterval) clearInterval(tickInterval);
  silenceAlarm();
  if (wakeLock) wakeLock.release().catch(() => {});
  session = recordEnded(session);
  rememberSession(session); // обновляем запись истории по id: теперь с endedAt
  clearSession();
  window.location.reload();
}

export function startTracking(s, { onGpsStatus }) {
  session = s;
  setGpsStatus = onGpsStatus;
  el('screen-setup').classList.add('hidden');
  el('screen-tracking').classList.remove('hidden');

  initMap(session.point, { onLocate: locateMe });
  requestWakeLock();
  initCompass();

  if (session.point.note || session.point.photo) {
    el('point-note-text').textContent = session.point.note || '';
    if (session.point.photo) {
      el('point-photo-view').src = session.point.photo;
      el('point-photo-view').classList.remove('hidden');
    }
    el('point-note-card').classList.remove('hidden');
  }

  // Без лимита продлевать нечего — прячем кнопку.
  el('btn-extend').classList.toggle('hidden', session.limitType === 'none');
  initExtend();

  el('btn-silence').addEventListener('click', () => { silenceAlarm(); el('btn-silence').classList.add('hidden'); });
  el('btn-share').addEventListener('click', share);
  el('btn-stop').addEventListener('click', stop);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && session) requestWakeLock();
  });

  watchId = watchPosition(onPosition, (err) => {
    setGpsStatus(false);
    el('status-detail').textContent = t('tracking.geoError', { reason: t(geoErrorKey(err)) });
  });

  tickInterval = setInterval(tick, 1000);
  tick();
}
