// Парковочная сессия: форма записи, хранение в localStorage, ссылка «поделиться».
import { deadlineOf } from './limits.js';

const STORAGE_KEY = 'backontime.session.v2';
const LEGACY_KEY = 'backontime.session.v1'; // старый формат: startTime + durationMs
const SHARE_VERSION = 1; // версия формата ссылки: старые ссылки без `v` читаются как 0
const RESUME_GRACE_MS = 60 * 60 * 1000; // восстанавливаем сессию ещё час после дедлайна
const NO_LIMIT_RESUME_MS = 12 * 60 * 60 * 1000; // сессию без лимита — 12 часов после старта

/** Идентификатор записи: UUID, а где его нет — время старта в 36-ричной системе. */
export function newSessionId(now = Date.now()) {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* недоступно — берём время */ }
  return now.toString(36);
}

/**
 * Новая сессия (формат v2, см. docs/architecture.md §3).
 * limitType: 'pskive' | 'paid_until' | 'none'; limitUntil — timestamp или null.
 */
export function createSession({ point, limitType, limitUntil, paceKmh, bufferMs, now = Date.now() }) {
  return {
    id: newSessionId(now),
    point,
    startedAt: now,
    limitType,
    limitUntil: limitUntil ?? null,
    paceKmh,
    bufferMs,
    status: 'active',
  };
}

/** Старая сессия (v1) в новой форме: пресеты минут были тем же P-skive. */
export function migrateLegacySession(old) {
  if (!old || !old.point || typeof old.startTime !== 'number') return null;
  return {
    id: newSessionId(old.startTime),
    point: old.point,
    startedAt: old.startTime,
    limitType: 'pskive',
    limitUntil: old.startTime + old.durationMs,
    paceKmh: old.paceKmh,
    bufferMs: old.bufferMs,
    status: 'active',
  };
}

/** Парковка завершена: время окончания и статус 'ended'. */
export function recordEnded(session, now = Date.now()) {
  return { ...session, endedAt: now, status: 'ended' };
}

export function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

/** Читает v2; если остался только v1 — переносит его в новый формат и убирает старый ключ. */
export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return null;
    const migrated = migrateLegacySession(JSON.parse(legacyRaw));
    localStorage.removeItem(LEGACY_KEY);
    if (migrated) saveSession(migrated);
    return migrated;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_KEY);
}

/** Можно ли восстановить сохранённую сессию после перезагрузки страницы. */
export function isResumable(session, now = Date.now()) {
  if (!session || !session.point || session.status === 'ended') return false;
  const deadline = deadlineOf(session);
  if (deadline === null) return (session.startedAt ?? 0) > now - NO_LIMIT_RESUME_MS;
  return deadline > now - RESUME_GRACE_MS;
}

/**
 * Точка с координатами, уточнёнными тапом по карте.
 * Заметка, фото и прочие поля точки сохраняются.
 */
export function applyManualPoint(point, latlng) {
  return { ...point, lat: latlng.lat, lng: latlng.lng };
}

/** Разбор ссылки вида ?v=1&lat=..&lng=..&deadline=..&note=.. (deadline может отсутствовать). */
export function parseJoinParams(search) {
  const params = new URLSearchParams(search);
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  if (!lat || !lng) return null;
  return {
    version: Number(params.get('v')) || 0,
    lat,
    lng,
    deadline: Number(params.get('deadline')) || null,
    note: params.get('note') || '',
  };
}

export function buildShareUrl(session, href) {
  const url = new URL(href);
  url.search = '';
  url.searchParams.set('v', String(SHARE_VERSION));
  url.searchParams.set('lat', session.point.lat.toFixed(6));
  url.searchParams.set('lng', session.point.lng.toFixed(6));
  const deadline = deadlineOf(session);
  if (deadline !== null) url.searchParams.set('deadline', String(deadline));
  if (session.point.note) url.searchParams.set('note', session.point.note);
  return url.toString();
}
