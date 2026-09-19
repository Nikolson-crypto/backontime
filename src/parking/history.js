// История последних парковок: чистые функции над списком + хранение в localStorage.
// Фото не храним — в localStorage мало места, а картинки тяжёлые.

const STORAGE_KEY = 'backontime.history.v1';
export const HISTORY_MAX = 10;

/** Запись истории из сессии: место, время начала, тип лимита. */
export function entryFromSession(session) {
  return {
    id: session.id,
    lat: session.point.lat,
    lng: session.point.lng,
    note: session.point.note || '',
    startedAt: session.startedAt,
    limitType: session.limitType,
    limitUntil: session.limitUntil ?? null,
    endedAt: session.endedAt ?? null,
  };
}

/** Новая запись в начало списка; та же парковка (по id) обновляется, длина — не больше max. */
export function pushHistory(list, entry, max = HISTORY_MAX) {
  const others = (Array.isArray(list) ? list : []).filter((e) => e && e.id !== entry.id);
  return [entry, ...others].slice(0, max);
}

export function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveHistory(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* хранилище переполнено или недоступно — история не критична */ }
}

/** Запомнить парковку: и при старте, и при завершении (запись обновляется по id). */
export function rememberSession(session) {
  const list = pushHistory(loadHistory(), entryFromSession(session));
  saveHistory(list);
  return list;
}
