// Сессия: хранение в localStorage, ссылка «поделиться», параметры join-ссылки.

const STORAGE_KEY = 'backontime.session.v1';
const RESUME_GRACE_MS = 60 * 60 * 1000; // восстанавливаем сессию ещё час после дедлайна

export function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Можно ли восстановить сохранённую сессию после перезагрузки страницы. */
export function isResumable(session, now = Date.now()) {
  return Boolean(session && session.point && session.startTime + session.durationMs > now - RESUME_GRACE_MS);
}

/**
 * Точка с координатами, уточнёнными тапом по карте.
 * Заметка, фото и прочие поля точки сохраняются.
 */
export function applyManualPoint(point, latlng) {
  return { ...point, lat: latlng.lat, lng: latlng.lng };
}

/** Разбор ссылки вида ?lat=..&lng=..&deadline=..&note=.. */
export function parseJoinParams(search) {
  const params = new URLSearchParams(search);
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  const deadline = Number(params.get('deadline'));
  if (!lat || !lng || !deadline) return null;
  return { lat, lng, deadline, note: params.get('note') || '' };
}

export function buildShareUrl(session, href) {
  const url = new URL(href);
  url.search = '';
  url.searchParams.set('lat', session.point.lat.toFixed(6));
  url.searchParams.set('lng', session.point.lng.toFixed(6));
  url.searchParams.set('deadline', String(session.startTime + session.durationMs));
  if (session.point.note) url.searchParams.set('note', session.point.note);
  return url.toString();
}
