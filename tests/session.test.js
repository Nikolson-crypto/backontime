import { describe, it, expect } from 'vitest';
import {
  parseJoinParams,
  buildShareUrl,
  isResumable,
  applyManualPoint,
  createSession,
  migrateLegacySession,
  loadSession,
} from '../src/parking/session.js';
import { detectLocale, t, setLocale } from '../src/i18n/index.js';
import { fmtDuration, formatDistance } from '../src/ui/format.js';

const MIN = 60 * 1000;

/** Подмена localStorage: тесты идут в node, браузерного хранилища здесь нет. */
function useFakeStorage(initial = {}) {
  const data = { ...initial };
  globalThis.localStorage = {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
  return data;
}

describe('createSession', () => {
  it('собирает сессию нового формата', () => {
    const s = createSession({
      point: { lat: 55.6761, lng: 12.5683 },
      limitType: 'pskive',
      limitUntil: 1000 * MIN,
      paceKmh: 5,
      bufferMs: 5 * MIN,
      now: 940 * MIN,
    });
    expect(s.id).toBeTruthy();
    expect(s.startedAt).toBe(940 * MIN);
    expect(s.limitType).toBe('pskive');
    expect(s.limitUntil).toBe(1000 * MIN);
    expect(s.status).toBe('active');
  });

  it('без лимита limitUntil = null', () => {
    const s = createSession({ point: {}, limitType: 'none', limitUntil: null, paceKmh: 5, bufferMs: 0, now: 1 });
    expect(s.limitUntil).toBeNull();
  });
});

describe('переход со старого формата (v1 → v2)', () => {
  const legacy = {
    point: { lat: 55.6761, lng: 12.5683, note: 'серый паркинг' },
    startTime: 1000 * MIN,
    durationMs: 60 * MIN,
    paceKmh: 6,
    bufferMs: 10 * MIN,
  };

  it('старая сессия становится P-skive с тем же концом лимита', () => {
    const s = migrateLegacySession(legacy);
    expect(s.limitType).toBe('pskive');
    expect(s.limitUntil).toBe(1060 * MIN);
    expect(s.startedAt).toBe(1000 * MIN);
    expect(s.point.note).toBe('серый паркинг');
    expect(s.paceKmh).toBe(6);
    expect(s.bufferMs).toBe(10 * MIN);
    expect(s.status).toBe('active');
  });

  it('мусор вместо сессии → null (приложение не падает)', () => {
    expect(migrateLegacySession(null)).toBeNull();
    expect(migrateLegacySession({})).toBeNull();
  });

  it('loadSession читает старый ключ, сохраняет новый и удаляет старый', () => {
    const data = useFakeStorage({ 'backontime.session.v1': JSON.stringify(legacy) });
    const s = loadSession();
    expect(s.limitUntil).toBe(1060 * MIN);
    expect(data['backontime.session.v1']).toBeUndefined();
    expect(JSON.parse(data['backontime.session.v2']).limitType).toBe('pskive');
  });

  it('loadSession предпочитает новый ключ', () => {
    useFakeStorage({
      'backontime.session.v1': JSON.stringify(legacy),
      'backontime.session.v2': JSON.stringify({ limitType: 'none', limitUntil: null, point: {} }),
    });
    expect(loadSession().limitType).toBe('none');
  });

  it('пустое хранилище → null', () => {
    useFakeStorage();
    expect(loadSession()).toBeNull();
  });
});

describe('join-ссылка', () => {
  const session = { point: { lat: 55.6761, lng: 12.5683, note: 'красная скамейка' }, startTime: 1000 * MIN, durationMs: 60 * MIN };

  it('buildShareUrl → parseJoinParams — круг замыкается, версия формата v=1', () => {
    const url = buildShareUrl(session, 'https://example.org/backontime/?foo=bar');
    expect(url).toContain('v=1');
    const join = parseJoinParams(new URL(url).search);
    expect(join.version).toBe(1);
    expect(join.lat).toBeCloseTo(55.6761, 5);
    expect(join.lng).toBeCloseTo(12.5683, 5);
    expect(join.deadline).toBe(1060 * MIN);
    expect(join.note).toBe('красная скамейка');
    expect(url).not.toContain('foo');
  });

  it('старая ссылка без v продолжает работать', () => {
    const join = parseJoinParams('?lat=55.676100&lng=12.568300&deadline=' + 1060 * MIN + '&note=%D1%85');
    expect(join.version).toBe(0);
    expect(join.lat).toBeCloseTo(55.6761, 5);
    expect(join.lng).toBeCloseTo(12.5683, 5);
    expect(join.deadline).toBe(1060 * MIN);
    expect(join.note).toBe('х');
  });

  it('без координат → null', () => {
    expect(parseJoinParams('?v=1&note=x')).toBeNull();
  });

  it('сессия нового формата: ссылка строится по limitUntil', () => {
    const url = buildShareUrl(
      { point: { lat: 55.6761, lng: 12.5683 }, limitType: 'paid_until', limitUntil: 1060 * MIN },
      'https://example.org/backontime/',
    );
    expect(parseJoinParams(new URL(url).search).deadline).toBe(1060 * MIN);
  });

  it('сессия без лимита: в ссылке нет времени, место всё равно передаётся', () => {
    const url = buildShareUrl(
      { point: { lat: 55.6761, lng: 12.5683 }, limitType: 'none', limitUntil: null },
      'https://example.org/backontime/',
    );
    expect(url).not.toContain('deadline');
    const join = parseJoinParams(new URL(url).search);
    expect(join.deadline).toBeNull();
    expect(join.lat).toBeCloseTo(55.6761, 5);
  });
});

describe('isResumable', () => {
  const s = { point: {}, startTime: 0, durationMs: 60 * MIN };
  it('да — пока не прошёл час после дедлайна', () => {
    expect(isResumable(s, 100 * MIN)).toBe(true);
  });
  it('нет — через час после дедлайна', () => {
    expect(isResumable(s, 121 * MIN)).toBe(false);
  });
  it('нет — без сессии', () => {
    expect(isResumable(null)).toBe(false);
  });

  const v2 = { point: {}, limitType: 'pskive', limitUntil: 60 * MIN, startedAt: 0, status: 'active' };
  it('новый формат: считаем от конца лимита', () => {
    expect(isResumable(v2, 100 * MIN)).toBe(true);
    expect(isResumable(v2, 121 * MIN)).toBe(false);
  });
  it('завершённую парковку не восстанавливаем', () => {
    expect(isResumable({ ...v2, status: 'ended' }, 100 * MIN)).toBe(false);
  });
  it('без лимита: 12 часов от старта', () => {
    const none = { point: {}, limitType: 'none', limitUntil: null, startedAt: 0, status: 'active' };
    expect(isResumable(none, 11 * 60 * MIN)).toBe(true);
    expect(isResumable(none, 13 * 60 * MIN)).toBe(false);
  });
});

describe('applyManualPoint', () => {
  const point = { lat: 55.6761, lng: 12.5683, note: 'серый паркинг, 2 этаж', photo: 'data:image/jpeg;base64,xxx' };

  it('берёт координаты тапа и сохраняет заметку и фото', () => {
    const moved = applyManualPoint(point, { lat: 55.6768, lng: 12.5691 });
    expect(moved.lat).toBeCloseTo(55.6768, 6);
    expect(moved.lng).toBeCloseTo(12.5691, 6);
    expect(moved.note).toBe(point.note);
    expect(moved.photo).toBe(point.photo);
  });

  it('не меняет исходную точку', () => {
    applyManualPoint(point, { lat: 0.1, lng: 0.2 });
    expect(point.lat).toBeCloseTo(55.6761, 6);
    expect(point.lng).toBeCloseTo(12.5683, 6);
  });
});

describe('i18n', () => {
  it('detectLocale: сохранённый > язык телефона > en', () => {
    expect(detectLocale('da-DK', null)).toBe('da');
    expect(detectLocale('ru-RU', null)).toBe('ru');
    expect(detectLocale('fr-FR', null)).toBe('en');
    expect(detectLocale('fr-FR', 'ru')).toBe('ru');
  });
  it('подстановка параметров и форматы', () => {
    setLocale('ru');
    expect(t('setup.point.marked', { accuracy: 12 })).toBe('Машина отмечена (точность ~12 м)');
    expect(fmtDuration(65 * MIN)).toBe('1ч 5м');
    expect(fmtDuration(-90 * 1000)).toBe('-1м 30с');
    expect(formatDistance(1234)).toBe('1.23 км');
    setLocale('en');
    expect(fmtDuration(65 * MIN)).toBe('1h 5m');
    expect(formatDistance(42)).toBe('42 m');
  });
  it('неизвестный ключ возвращает сам ключ', () => {
    expect(t('nope.key')).toBe('nope.key');
  });
});
