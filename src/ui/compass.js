// Компас: стрелка на точку встречи, курс устройства, если он доступен.
import { t } from '../i18n/index.js';
import { bearingDeg, cardinalIndex, arrowRotation } from '../geo/bearing.js';

const el = (id) => document.getElementById(id);
let deviceHeading = null;

function handleOrientation(e) {
  if (typeof e.webkitCompassHeading === 'number') {
    deviceHeading = e.webkitCompassHeading;
  } else if (e.absolute && e.alpha !== null) {
    deviceHeading = (360 - e.alpha) % 360;
  }
}

function needsPermission() {
  return typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
}

function enableCompass() {
  const btn = el('btn-enable-compass');
  if (needsPermission()) {
    DeviceOrientationEvent.requestPermission()
      .then((state) => {
        if (state === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation);
          btn.classList.add('hidden');
        }
      })
      .catch(() => {});
  } else if ('DeviceOrientationEvent' in window) {
    window.addEventListener('deviceorientationabsolute', handleOrientation);
    window.addEventListener('deviceorientation', handleOrientation);
    btn.classList.add('hidden');
  }
}

function generateTicks() {
  const ticks = el('compass-ticks');
  if (!ticks || ticks.childElementCount) return;
  const cx = 150, cy = 150, rOuter = 122;
  const svgNS = 'http://www.w3.org/2000/svg';
  for (let deg = 0; deg < 360; deg += 15) {
    const major = deg % 90 === 0;
    const len = major ? 14 : 8;
    const rad = ((deg - 90) * Math.PI) / 180;
    const r1 = rOuter - len;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', cx + r1 * Math.cos(rad)); line.setAttribute('y1', cy + r1 * Math.sin(rad));
    line.setAttribute('x2', cx + rOuter * Math.cos(rad)); line.setAttribute('y2', cy + rOuter * Math.sin(rad));
    line.setAttribute('class', 'tick' + (major ? ' major' : ''));
    ticks.appendChild(line);
  }
}

export function initCompass() {
  el('compass').classList.remove('hidden');
  generateTicks();
  el('btn-enable-compass').addEventListener('click', enableCompass);
  if (needsPermission()) {
    el('btn-enable-compass').classList.remove('hidden');
  } else {
    enableCompass();
  }
}

export function updateCompass(from, to) {
  if (!from || !to) return;
  const brg = bearingDeg(from, to);
  el('compass-arrow').style.transform = `rotate(${arrowRotation(brg, deviceHeading)}deg)`;
  el('compass-deg').textContent = t('tracking.compass.bearing', {
    deg: Math.round(brg),
    dir: t('compass.dirs')[cardinalIndex(brg)],
    suffix: deviceHeading !== null ? '' : t('tracking.compass.fromNorth'),
  });
}
