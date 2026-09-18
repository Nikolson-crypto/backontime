// Небольшая карта на экране настройки: уточнить место машины тапом по карте.
import L from 'leaflet';
import { savedLayerKey, setBaseLayer } from '../map/layers.js';
import { carIcon } from '../map/map.js';

const CONTAINER_ID = 'setup-map';
const ZOOM = 18; // крупно: уточняем метры, а не километры

let map = null;
let marker = null;
let handleMove = () => {};

/**
 * Показать карту с машиной в точке point; тап по карте двигает иконку
 * и вызывает onMove(latlng). Карта создаётся при первом вызове —
 * пока точка не отмечена, тайлы не грузятся.
 */
export function showSetupMap(point, onMove) {
  const container = document.getElementById(CONTAINER_ID);
  if (!container || !point) return null;
  handleMove = onMove || (() => {});
  container.classList.remove('hidden');

  if (!map) {
    map = L.map(container, { zoomControl: true, attributionControl: true })
      .setView([point.lat, point.lng], ZOOM);
    map.attributionControl.setPrefix('');
    setBaseLayer(map, savedLayerKey(), null);
    marker = L.marker([point.lat, point.lng], { icon: carIcon() }).addTo(map);
    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      handleMove(e.latlng);
    });
  } else {
    marker.setLatLng([point.lat, point.lng]);
    map.setView([point.lat, point.lng], Math.max(map.getZoom(), ZOOM));
  }

  // Контейнер только что показали — Leaflet пересчитывает размеры уже после отрисовки.
  setTimeout(() => map && map.invalidateSize(), 0);
  return map;
}
