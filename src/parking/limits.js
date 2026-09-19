// Чистые расчёты времени: когда кончается лимит, когда выходить и в каком мы статусе.
// Никакого DOM — этот модуль покрыт тестами.

export const WARN_BEFORE_MS = 5 * 60 * 1000;
export const PATH_INEFFICIENCY_FACTOR = 1.3; // прямая линия × 1.3 ≈ реальная дорога

const MS_PER_MINUTE = 60 * 1000;

/** «14:30» сегодня → timestamp; неверный формат → null. */
export function timestampForHHMM(hhmm, now = Date.now()) {
  const parts = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!parts) return null;
  const hours = Number(parts[1]);
  const minutes = Number(parts[2]);
  if (hours > 23 || minutes > 59) return null;
  const date = new Date(now);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

/**
 * Момент окончания лимита по выбору на экране настройки.
 * Возвращает { until, reason }: until — timestamp или null;
 * reason — 'past' (время уже прошло), 'invalid' (ничего не выбрано) или null.
 * Для типа 'none' лимита нет, и это не ошибка: { until: null, reason: null }.
 */
export function limitUntilFor({ type, hours, paidUntilHHMM, now = Date.now() }) {
  if (type === 'none') return { until: null, reason: null };
  if (type === 'pskive') {
    const h = Number(hours);
    if (!(h > 0)) return { until: null, reason: 'invalid' };
    return { until: now + Math.round(h * 60) * MS_PER_MINUTE, reason: null };
  }
  if (type === 'paid_until') {
    const until = timestampForHHMM(paidUntilHHMM, now);
    if (until === null) return { until: null, reason: 'invalid' };
    if (until <= now) return { until: null, reason: 'past' };
    return { until, reason: null };
  }
  return { until: null, reason: 'invalid' };
}

/** Дедлайн сессии: конец лимита. Старый формат (v1) — старт + длительность. */
export function deadlineOf(session) {
  if (!session) return null;
  if (session.limitType) return session.limitUntil ?? null;
  return session.startTime + session.durationMs;
}

/** Момент, когда надо выйти: дедлайн минус дорога минус запас. */
export function leaveByTime(deadline, walkMs, bufferMs) {
  return deadline - walkMs - bufferMs;
}

/**
 * Оценка времени пешком, когда маршрут недоступен:
 * расстояние по прямой × коэффициент, по заданному темпу.
 */
export function estimateWalkMs(distanceM, paceKmh) {
  const speedMs = (paceKmh * 1000) / 3600;
  return ((distanceM * PATH_INEFFICIENCY_FACTOR) / speedMs) * 1000;
}

/**
 * Статус на момент `now`.
 * level: 'ok' | 'warn' | 'danger'; late: дедлайн уже прошёл.
 */
export function computeStatus({ now, deadline, walkMs, bufferMs }) {
  const leaveAt = leaveByTime(deadline, walkMs, bufferMs);
  const timeUntilLeave = leaveAt - now;
  const timeUntilDeadline = deadline - now;
  let level = 'ok';
  if (timeUntilDeadline <= 0 || timeUntilLeave <= 0) level = 'danger';
  else if (timeUntilLeave <= WARN_BEFORE_MS) level = 'warn';
  return {
    level,
    late: timeUntilDeadline <= 0,
    leaveAt,
    timeUntilLeave,
    timeUntilDeadline,
    alarm: level === 'danger',
  };
}
