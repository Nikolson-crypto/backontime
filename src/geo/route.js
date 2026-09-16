// Расстояние и пеший маршрут через OSRM. haversineMeters — чистая функция.

const OSRM_URL = 'https://router.project-osrm.org/route/v1/foot';
const FETCH_TIMEOUT_MS = 6000;

export function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Пеший маршрут OSRM: { durationSec, distanceM, coords: [[lat,lng],…] }. Бросает при ошибке/таймауте. */
export async function fetchWalkingRoute(from, to) {
  const url = `${OSRM_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    const route = data.routes && data.routes[0];
    if (!route) throw new Error('no route');
    return {
      durationSec: route.duration,
      distanceM: route.distance,
      coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    };
  } finally {
    clearTimeout(timeout);
  }
}
