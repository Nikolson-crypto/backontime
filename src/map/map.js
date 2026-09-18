// Карта Leaflet: место машины, метка пользователя, маршрут, кнопка «где я».
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { t } from '../i18n/index.js';
import { savedLayerKey, setBaseLayer, addLayerSwitcher } from './layers.js';

// Силуэт машины (вид сбоку) — заливка задаётся в CSS через currentColor.
const CAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M5.3 10.4l1.5-3.6A2.2 2.2 0 018.9 5.4h6.2c.9 0 1.7.5 2.1 1.4l1.5 3.6'
  + 'c.8.3 1.3 1 1.3 1.9v3.4c0 .5-.4.9-.9.9h-.8v.7c0 .6-.5 1.1-1.1 1.1h-.5'
  + 'c-.6 0-1.1-.5-1.1-1.1v-.7H8.4v.7c0 .6-.5 1.1-1.1 1.1h-.5c-.6 0-1.1-.5-1.1-1.1v-.7h-.8'
  + 'c-.5 0-.9-.4-.9-.9v-3.4c0-.9.5-1.6 1.3-1.9zm1.9-.3h9.6l-1.1-2.7a.7.7 0 00-.6-.4H8.9'
  + 'a.7.7 0 00-.6.4zM7.6 14a1.1 1.1 0 100-2.2 1.1 1.1 0 000 2.2zm8.8 0a1.1 1.1 0 100-2.2 1.1 1.1 0 000 2.2z"/>'
  + '</svg>';

/** Иконка места парковки: белый круг с тенью и силуэтом машины внутри. */
export function carIcon() {
  return L.divIcon({
    className: 'car-marker',
    html: CAR_SVG,
    iconSize: [40, 40],
    iconAnchor: [20, 40], // якорь — центр-низ
    popupAnchor: [0, -38],
  });
}

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

  L.marker([point.lat, point.lng], { icon: carIcon(), title: t('map.meetingPoint') })
    .addTo(map)
    .bindPopup(t('map.meetingPoint'));
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
