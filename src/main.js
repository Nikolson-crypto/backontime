// Точка входа: язык, переводы, восстановление сессии или join-ссылка.
import './style.css';
import { initLocale, applyTranslations, t } from './i18n/index.js';
import { loadSession, isResumable, parseJoinParams } from './parking/session.js';
import { requestNotificationPermission } from './alerts/local.js';
import { initSetupScreen, applyJoinParams } from './ui/setup.js';
import { startTracking } from './ui/tracking.js';

function setGpsStatus(ok) {
  const label = document.getElementById('gps-label');
  if (!label) return;
  label.textContent = ok ? t('gps.ok') : t('gps.bad');
  document.getElementById('gps-indicator').classList.toggle('gps-bad', !ok);
}

initLocale();
applyTranslations();
document.title = t('app.name');
requestNotificationPermission();

initSetupScreen({
  onStart: (session) => startTracking(session, { onGpsStatus: setGpsStatus }),
  onGpsStatus: setGpsStatus,
});

const saved = loadSession();
if (isResumable(saved)) {
  startTracking(saved, { onGpsStatus: setGpsStatus });
} else {
  const join = parseJoinParams(window.location.search);
  if (join) applyJoinParams(join);
}
