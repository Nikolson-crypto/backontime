// Слои карты: Схема (CARTO) и Спутник (Esri + подписи). Выбор запоминается.
import L from 'leaflet';
import { t } from '../i18n/index.js';

const MAP_LAYER_KEY = 'backontime.map.layer.v1';

const esriRef = (service) => L.tileLayer(
  `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/${service}/MapServer/tile/{z}/{y}/{x}`,
  { maxZoom: 19, crossOrigin: true },
);

export const BASE_LAYERS = {
  scheme: {
    labelKey: 'map.scheme',
    make: () => L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20, subdomains: 'abcd', crossOrigin: true,
      attribution: '© OpenStreetMap · © CARTO',
    }),
  },
  satellite: {
    labelKey: 'map.satellite',
    // Снимки Esri + подписи улиц и названий сверху.
    make: () => L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, crossOrigin: true, attribution: t('map.satelliteAttribution'),
      }),
      esriRef('World_Transportation'),
      esriRef('World_Boundaries_and_Places'),
    ]),
  },
};

export function savedLayerKey() {
  let saved = null;
  try { saved = localStorage.getItem(MAP_LAYER_KEY); } catch { /* ignore */ }
  return BASE_LAYERS[saved] ? saved : 'scheme';
}

/** Ставит базовый слой на карту, возвращает его (чтобы потом снять). */
export function setBaseLayer(map, key, previous) {
  const cfg = BASE_LAYERS[key] || BASE_LAYERS.scheme;
  if (previous) map.removeLayer(previous);
  const layer = cfg.make().addTo(map);
  try { localStorage.setItem(MAP_LAYER_KEY, BASE_LAYERS[key] ? key : 'scheme'); } catch { /* ignore */ }
  return layer;
}

export function addLayerSwitcher(map, activeKey, onChange) {
  const control = L.control({ position: 'topright' });
  control.onAdd = () => {
    const box = L.DomUtil.create('div', 'layer-switch');
    Object.entries(BASE_LAYERS).forEach(([key, cfg]) => {
      const b = L.DomUtil.create('button', 'layer-btn' + (key === activeKey ? ' active' : ''), box);
      b.type = 'button';
      b.textContent = t(cfg.labelKey);
      b.dataset.key = key;
      L.DomEvent.on(b, 'click', (e) => {
        L.DomEvent.stop(e);
        onChange(key);
        box.querySelectorAll('.layer-btn').forEach((x) => x.classList.toggle('active', x.dataset.key === key));
      });
    });
    L.DomEvent.disableClickPropagation(box);
    return box;
  };
  control.addTo(map);
}
