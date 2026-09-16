// Локальный сигнал: звук (Web Audio), вибрация, уведомление при открытой странице.
// Push при закрытом приложении — эпик E3/E4 (src/alerts/push.js).
import { t } from '../i18n/index.js';

let audioCtx = null;
let alarmInterval = null;
let alarmFired = false;

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
  } catch { /* звук недоступен */ }
}

/** Один раз запустить тревогу; повторяет сигнал каждые 15 с, пока не заглушат. Возвращает true, если сработала впервые. */
export function fireAlarmOnce() {
  if (alarmFired) return false;
  alarmFired = true;
  if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
  beep();
  if (alarmInterval) clearInterval(alarmInterval);
  alarmInterval = setInterval(() => {
    if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
    beep();
  }, 15000);
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(t('alarm.title'), { body: t('alarm.body') });
  }
  return true;
}

export function silenceAlarm() {
  if (alarmInterval) { clearInterval(alarmInterval); alarmInterval = null; }
  if (navigator.vibrate) navigator.vibrate(0);
}

export function stopAlarm() {
  silenceAlarm();
  alarmFired = false;
}

export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
