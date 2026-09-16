// Обёртка над геолокацией браузера.

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

/** Ключ перевода для ошибки геолокации (см. geo.error.* в переводах). */
export function geoErrorKey(err) {
  if (err && err.message === 'unsupported') return 'geo.error.unsupported';
  switch (err && err.code) {
    case 1: return 'geo.error.denied';
    case 2: return 'geo.error.unavailable';
    case 3: return 'geo.error.timeout';
    default: return 'geo.error.unknown';
  }
}

export function watchPosition(onPos, onErr) {
  return navigator.geolocation.watchPosition(onPos, onErr, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 20000,
  });
}
