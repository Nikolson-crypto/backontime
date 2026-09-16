// Карта Leaflet: точка встречи, метка пользователя, маршрут, кнопка «где я».
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { t } from '../i18n/index.js';
import { savedLayerKey, setBaseLayer, addLayerSwitcher } from './layers.js';

// После сборки Leaflet не находит свои картинки маркера сам — задаём пути явно.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

let map = null;
let baseLayer = null;
let userMarker = null;
let routeLine = null;

export function initMap(point, { onLocate }) {
  map = L.map('map', { zoomControl: true, attributionControl: true }).setView([point.lat, point.lng], 16);
  map.attributionControl.setPrefix('');

  const startKey = savedLayerKey();
  baseLayer = setBaseLayer(map, startKey, null);
  addLayerSwitcher(map, startKey, (key) => { baseLayer = setBaseLayer(map, key, baseLayer); });

  const LocateBtn = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-locate');
      const btn = L.DomUtil.create('a', '', container);
      btn.href = '#';
      btn.title = t('map.locate');
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', t('map.locateAria'));
      btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'
        + '<circle cx="12" cy="12" r="4.5"/>'
        + '<line x1="12" y1="1.5" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22.5"/>'
        + '<line x1="1.5" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22.5" y2="12"/></svg>';
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(btn, 'click', L.DomEvent.stop);
      L.DomEvent.on(btn, 'click', onLocate);
      return container;
    },
  });
  map.addControl(new LocateBtn());

  L.marker([point.lat, point.lng], { title: t('map.meetingPoint') }).addTo(map).bindPopup(t('map.meetingPoint'));
  return map;
}

export function updateUserMarker(pos) {
  if (!map || !pos) return;
  if (!userMarker) {
    userMarker = L.circleMarker([pos.lat, pos.lng], {
      radius: 8, color: '#ffffff', weight: 3, fillColor: '#3d8bff', fillOpacity: 1,
    }).addTo(map);
  } else {
    userMarker.setLatLng([pos.lat, pos.lng]);
  }
}

export function drawRoute(coords) {
  if (!map) return;
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline(coords, { color: '#2f6fe0', weight: 5, opacity: 0.85 }).addTo(map);
}

export function centerOn(pos, minZoom = 16) {
  if (map) map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), minZoom));
}

export function setLocating(on) {
  const btn = document.querySelector('.leaflet-locate a');
  if (btn) btn.classList.toggle('locating', on);
}
