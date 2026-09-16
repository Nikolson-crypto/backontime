// Чистые расчёты времени: когда выходить и в каком мы статусе.
// Никакого DOM — этот модуль покрыт тестами.

export const WARN_BEFORE_MS = 5 * 60 * 1000;
export const PATH_INEFFICIENCY_FACTOR = 1.3; // прямая линия × 1.3 ≈ реальная дорога

/** Дедлайн сессии: старт + длительность. */
export function deadlineOf(session) {
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
