// Форматирование времени и расстояний с учётом языка.
import { t } from '../i18n/index.js';

export function fmtDuration(ms) {
  const sign = ms < 0 ? '-' : '';
  ms = Math.abs(ms);
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return sign + t('fmt.hm', { h, m });
  if (m > 0) return sign + t('fmt.ms', { m, s });
  return sign + t('fmt.s', { s });
}

export function fmtClock(ts) {
  return new Date(ts).toLocaleTimeString(t('fmt.locale'), { hour: '2-digit', minute: '2-digit' });
}

export function formatDistance(m) {
  if (m >= 1000) return t('fmt.km', { km: (m / 1000).toFixed(2) });
  return t('fmt.m', { m: Math.round(m) });
}
