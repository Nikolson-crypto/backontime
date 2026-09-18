import { describe, it, expect } from 'vitest';
import { parseJoinParams, buildShareUrl, isResumable, applyManualPoint } from '../src/parking/session.js';
import { detectLocale, t, setLocale } from '../src/i18n/index.js';
import { fmtDuration, formatDistance } from '../src/ui/format.js';

const MIN = 60 * 1000;

describe('join-ссылка', () => {
  const session = { point: { lat: 55.6761, lng: 12.5683, note: 'красная скамейка' }, startTime: 1000 * MIN, durationMs: 60 * MIN };

  it('buildShareUrl → parseJoinParams — круг замыкается', () => {
    const url = buildShareUrl(session, 'https://example.org/backontime/?foo=bar');
    const join = parseJoinParams(new URL(url).search);
    expect(join.lat).toBeCloseTo(55.6761, 5);
    expect(join.lng).toBeCloseTo(12.5683, 5);
    expect(join.deadline).toBe(1060 * MIN);
    expect(join.note).toBe('красная скамейка');
    expect(url).not.toContain('foo');
  });

  it('без координат → null', () => {
    expect(parseJoinParams('?note=x')).toBeNull();
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
