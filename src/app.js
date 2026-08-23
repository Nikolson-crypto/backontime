'use strict';

const STORAGE_KEY = 'backontime.session.v1';
const ROUTE_REFRESH_MS = 25000;
const ROUTE_REFRESH_DISTANCE_M = 25;
const OSRM_URL = 'https://router.project-osrm.org/route/v1/foot';
const PATH_INEFFICIENCY_FACTOR = 1.3; // straight-line fallback correction

const el = (id) => document.getElementById(id);

const screens = {
  setup: el('screen-setup'),
  tracking: el('screen-tracking'),
};

// ---------- Setup screen state ----------
let markedPoint = null; // {lat, lng}
let selectedMinutes = null;

const durationPresets = el('duration-presets');
const customMinutesInput = el('custom-minutes');
const paceSelect = el('pace-select');
const bufferSelect = el('buffer-select');
const btnMarkPoint = el('btn-mark-point');
const pointStatus = el('point-status');
const btnStart = el('btn-start');
const setupError = el('setup-error');
const pointDetails = el('point-details');
const pointNoteInput = el('point-note');
const pointPhotoInput = el('point-photo');
const pointPhotoPreview = el('point-photo-preview');
const joinBanner = el('join-banner');

pointNoteInput.addEventListener('input', () => {
  if (markedPoint) markedPoint.note = pointNoteInput.value.trim();
});

pointPhotoInput.addEventListener('change', async () => {
  const file = pointPhotoInput.files[0];
  if (!file || !markedPoint) return;
  try {
    const dataUrl = await downscaleImage(file, 480, 0.6);
    markedPoint.photo = dataUrl;
    pointPhotoPreview.src = dataUrl;
    pointPhotoPreview.classList.remove('hidden');
  } catch { /* image processing failed, ignore */ }
});

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
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Join a shared meeting point via URL ----------
function parseJoinParams() {
  const params = new URLSearchParams(window.location.search);
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  const deadline = Number(params.get('deadline'));
  if (!lat || !lng || !deadline) return null;
  return {
    lat, lng, deadline,
    note: params.get('note') || '',
  };
}

function applyJoinParams(join) {
  markedPoint = { lat: join.lat, lng: join.lng, note: join.note };
  pointStatus.textContent = 'Точка получена по ссылке';
  pointDetails.classList.remove('hidden');
  pointNoteInput.value = join.note;
  btnMarkPoint.textContent = '📍 Отметить заново';
  const minutesLeft = Math.max(1, Math.round((join.deadline - Date.now()) / 60000));
  customMinutesInput.value = minutesLeft;
  selectedMinutes = minutesLeft;
  joinBanner.textContent = `Точка встречи получена по ссылке. Осталось времени: ~${minutesLeft} мин.`;
  joinBanner.classList.remove('hidden');
  updateStartButton();
}

durationPresets.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  selectedMinutes = Number(btn.dataset.min);
  customMinutesInput.value = '';
  [...durationPresets.children].forEach((c) => c.classList.toggle('selected', c === btn));
  updateStartButton();
});

customMinutesInput.addEventListener('input', () => {
  const v = Number(customMinutesInput.value);
  if (v > 0) {
    selectedMinutes = v;
    [...durationPresets.children].forEach((c) => c.classList.remove('selected'));
  } else {
    selectedMinutes = null;
  }
  updateStartButton();
});

btnMarkPoint.addEventListener('click', async () => {
  setupError.textContent = '';
  btnMarkPoint.disabled = true;
  btnMarkPoint.textContent = 'Определяем местоположение…';
  try {
    const pos = await getCurrentPosition();
    markedPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude, note: pointNoteInput.value.trim() };
    pointStatus.textContent = `Точка отмечена (точность ~${Math.round(pos.coords.accuracy)} м)`;
    btnMarkPoint.textContent = '📍 Отметить заново';
    pointDetails.classList.remove('hidden');
  } catch (err) {
    setupError.textContent = 'Не удалось получить геолокацию: ' + describeGeoError(err);
    btnMarkPoint.textContent = '📍 Отметить здесь';
  } finally {
    btnMarkPoint.disabled = false;
    updateStartButton();
  }
});

function updateStartButton() {
  btnStart.disabled = !(markedPoint && selectedMinutes > 0);
}

btnStart.addEventListener('click', () => {
  const session = {
    point: markedPoint,
    startTime: Date.now(),
    durationMs: selectedMinutes * 60 * 1000,
    paceKmh: Number(paceSelect.value),
    bufferMs: Number(bufferSelect.value) * 60 * 1000,
  };
  saveSession(session);
  startTracking(session);
});

// ---------- Persistence ----------
function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}
function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------- Geolocation helpers ----------
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

function describeGeoError(err) {
  if (err && err.message === 'unsupported') return 'браузер не поддерживает геолокацию';
  switch (err && err.code) {
    case 1: return 'доступ к геолокации запрещён';
    case 2: return 'местоположение недоступно';
    case 3: return 'истекло время ожидания';
    default: return 'неизвестная ошибка';
  }
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function fetchWalkingRoute(from, to) {
  const url = `${OSRM_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    const route = data.routes && data.routes[0];
    if (!route) throw new Error('no route');
    return {
      durationSec: route.duration,
      distanceM: route.distance,
      coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Tracking screen ----------
const statusBanner = el('status-banner');
const statusTitle = el('status-title');
const statusDetail = el('status-detail');
const statDistance = el('stat-distance');
const statWalkTime = el('stat-walk-time');
const statLeaveIn = el('stat-leave-in');
const statDeadline = el('stat-deadline');
const btnStop = el('btn-stop');
const btnShare = el('btn-share');
const shareStatus = el('share-status');
const pointNoteCard = el('point-note-card');
const pointNoteText = el('point-note-text');
const pointPhotoView = el('point-photo-view');
const compassWidget = el('compass');
const compassArrow = el('compass-arrow');
const compassDeg = el('compass-deg');
const btnEnableCompass = el('btn-enable-compass');

let map, meetMarker, userMarker, routeLine;
let watchId = null;
let tickInterval = null;
let wakeLock = null;
let session = null;
let currentPos = null;
let cachedWalkMs = null;
let lastRouteFetchAt = 0;
let lastRouteFetchPos = null;
let alarmFired = false;
let alarmInterval = null;
let audioCtx = null;
let deviceHeading = null;

function bearingDeg(from, to) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function cardinal(deg) {
  const dirs = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
  return dirs[Math.round(deg / 45) % 8];
}

function handleOrientation(e) {
  if (typeof e.webkitCompassHeading === 'number') {
    deviceHeading = e.webkitCompassHeading;
  } else if (e.absolute && e.alpha !== null) {
    deviceHeading = (360 - e.alpha) % 360;
  }
}

function enableCompass() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then((state) => {
        if (state === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation);
          btnEnableCompass.classList.add('hidden');
        }
      })
      .catch(() => {});
  } else if ('DeviceOrientationEvent' in window) {
    window.addEventListener('deviceorientationabsolute', handleOrientation);
    window.addEventListener('deviceorientation', handleOrientation);
    btnEnableCompass.classList.add('hidden');
  }
}

function initCompass() {
  compassWidget.classList.remove('hidden');
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    btnEnableCompass.classList.remove('hidden');
  } else {
    enableCompass();
  }
}

function updateCompass() {
  if (!currentPos || !session) return;
  const brg = bearingDeg(currentPos, session.point);
  const rotation = deviceHeading !== null ? (brg - deviceHeading + 360) % 360 : brg;
  compassArrow.style.transform = `rotate(${rotation}deg)`;
  const suffix = deviceHeading !== null ? '' : ' (от севера, включите компас для точности)';
  compassDeg.textContent = `${Math.round(brg)}° ${cardinal(brg)}${suffix}`;
}

btnEnableCompass.addEventListener('click', enableCompass);

function initMap(point) {
  map = L.map('map', { zoomControl: true, attributionControl: false }).setView([point.lat, point.lng], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  meetMarker = L.marker([point.lat, point.lng], { title: 'Точка встречи' }).addTo(map);
  meetMarker.bindPopup('Точка встречи');
}

function startTracking(s) {
  session = s;
  screens.setup.classList.add('hidden');
  screens.tracking.classList.remove('hidden');

  initMap(session.point);
  requestWakeLock();
  initCompass();

  if (session.point.note || session.point.photo) {
    pointNoteText.textContent = session.point.note || '';
    if (session.point.photo) {
      pointPhotoView.src = session.point.photo;
      pointPhotoView.classList.remove('hidden');
    }
    pointNoteCard.classList.remove('hidden');
  }

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      currentPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      updateUserMarker();
      maybeRefreshRoute();
    },
    (err) => {
      statusDetail.textContent = 'Ошибка геолокации: ' + describeGeoError(err);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );

  tickInterval = setInterval(tick, 1000);
  tick();
}

function updateUserMarker() {
  if (!currentPos) return;
  if (!userMarker) {
    userMarker = L.circleMarker([currentPos.lat, currentPos.lng], {
      radius: 8, color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.9,
    }).addTo(map);
  } else {
    userMarker.setLatLng([currentPos.lat, currentPos.lng]);
  }
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
    const distM = haversineMeters(currentPos, session.point);
    const speedMs = (session.paceKmh * 1000) / 3600;
    cachedWalkMs = (distM * PATH_INEFFICIENCY_FACTOR) / speedMs * 1000;
    drawRoute([[currentPos.lat, currentPos.lng], [session.point.lat, session.point.lng]]);
  }
}

function drawRoute(coords) {
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline(coords, { color: '#38bdf8', weight: 4, opacity: 0.8 }).addTo(map);
}

function fmtDuration(ms) {
  const sign = ms < 0 ? '-' : '';
  ms = Math.abs(ms);
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${sign}${h}ч ${m}м`;
  if (m > 0) return `${sign}${m}м ${s}с`;
  return `${sign}${s}с`;
}

function fmtClock(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function tick() {
  if (!session) return;
  const now = Date.now();
  const deadline = session.startTime + session.durationMs;
  statDeadline.textContent = fmtClock(deadline);

  if (cachedWalkMs === null) {
    statDistance.textContent = 'ищем…';
    statWalkTime.textContent = 'ищем…';
    statLeaveIn.textContent = '—';
    statusTitle.textContent = 'Определяем местоположение…';
    statusDetail.textContent = '';
    return;
  }

  const distM = currentPos ? haversineMeters(currentPos, session.point) : null;
  statDistance.textContent = distM !== null ? formatDistance(distM) : '—';
  statWalkTime.textContent = fmtDuration(cachedWalkMs);
  updateCompass();

  const leaveByTime = deadline - cachedWalkMs - session.bufferMs;
  const timeUntilLeave = leaveByTime - now;
  const timeUntilDeadline = deadline - now;

  statLeaveIn.textContent = timeUntilLeave > 0 ? fmtDuration(timeUntilLeave) : 'уже пора';

  if (timeUntilDeadline <= 0) {
    setStatus('danger', 'Вы опаздываете!', `Встреча была в ${fmtClock(deadline)} · идти ещё ${fmtDuration(cachedWalkMs)}`);
    fireAlarmOnce();
  } else if (timeUntilLeave <= 0) {
    setStatus('danger', 'Пора идти назад!', `Успеете к ${fmtClock(deadline)}, если выйдете прямо сейчас`);
    fireAlarmOnce();
  } else if (timeUntilLeave <= 5 * 60 * 1000) {
    setStatus('warn', 'Скоро пора выходить', `Через ${fmtDuration(timeUntilLeave)}`);
  } else {
    setStatus('ok', 'Гуляйте спокойно', `Выходить через ${fmtDuration(timeUntilLeave)}`);
  }
}

function formatDistance(m) {
  if (m >= 1000) return (m / 1000).toFixed(2) + ' км';
  return Math.round(m) + ' м';
}

function setStatus(level, title, detail) {
  statusBanner.className = 'status-banner status-' + level;
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

// ---------- Alarm (sound + vibration + notification) ----------
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    osc.type = 'square';
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  } catch { /* audio unavailable */ }
}

function fireAlarmOnce() {
  if (alarmFired) return;
  alarmFired = true;
  if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
  beep();
  if (alarmInterval) clearInterval(alarmInterval);
  alarmInterval = setInterval(() => {
    if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
    beep();
  }, 15000);
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Пора возвращаться!', { body: 'Вы можете опоздать к точке встречи.' });
  }
}

if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch { /* wake lock not available / denied */ }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session) requestWakeLock();
});

function buildShareUrl() {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('lat', session.point.lat.toFixed(6));
  url.searchParams.set('lng', session.point.lng.toFixed(6));
  url.searchParams.set('deadline', String(session.startTime + session.durationMs));
  if (session.point.note) url.searchParams.set('note', session.point.note);
  return url.toString();
}

btnShare.addEventListener('click', async () => {
  const url = buildShareUrl();
  shareStatus.textContent = '';
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Точка встречи', text: 'Общий таймер возврата к точке встречи', url });
      return;
    } catch {
      // user cancelled or share failed, fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    shareStatus.textContent = 'Ссылка скопирована в буфер обмена';
  } catch {
    shareStatus.textContent = url;
  }
});

btnStop.addEventListener('click', () => {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (tickInterval) clearInterval(tickInterval);
  if (alarmInterval) clearInterval(alarmInterval);
  if (wakeLock) wakeLock.release().catch(() => {});
  clearSession();
  window.location.reload();
});

// ---------- Resume an in-progress session on reload, or apply a shared join link ----------
(function initSession() {
  const saved = loadSession();
  if (saved && saved.point && saved.startTime + saved.durationMs > Date.now() - 60 * 60 * 1000) {
    startTracking(saved);
    return;
  }
  const join = parseJoinParams();
  if (join) applyJoinParams(join);
})();
