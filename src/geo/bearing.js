// Азимут от точки к точке и стороны света. Чистые функции.

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** Азимут 0–360° от `from` к `to` (0 = север, 90 = восток). */
export function bearingDeg(from, to) {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Индекс стороны света 0..7 (С, СВ, В, ЮВ, Ю, ЮЗ, З, СЗ). */
export function cardinalIndex(deg) {
  return Math.round(deg / 45) % 8;
}

/** Поворот стрелки: если известен курс устройства — относительно него, иначе от севера. */
export function arrowRotation(bearing, deviceHeading) {
  return deviceHeading !== null && deviceHeading !== undefined
    ? (bearing - deviceHeading + 360) % 360
    : bearing;
}
