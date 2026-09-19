import { describe, it, expect } from 'vitest';
import {
  computeStatus,
  leaveByTime,
  estimateWalkMs,
  deadlineOf,
  limitUntilFor,
  timestampForHHMM,
  extendSession,
  statusFor,
  WARN_BEFORE_MS,
} from '../src/parking/limits.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
// Фиксированный момент «сейчас»: 18.09.2026, 12:00 по местному времени.
const NOW = new Date(2026, 8, 18, 12, 0, 0, 0).getTime();

describe('timestampForHHMM', () => {
  it('«14:30» — это сегодня в 14:30', () => {
    const ts = timestampForHHMM('14:30', NOW);
    expect(new Date(ts).getHours()).toBe(14);
    expect(new Date(ts).getMinutes()).toBe(30);
    expect(ts).toBe(NOW + 2.5 * HOUR);
  });
  it('мусор вместо времени → null', () => {
    expect(timestampForHHMM('', NOW)).toBeNull();
    expect(timestampForHHMM('25:00', NOW)).toBeNull();
    expect(timestampForHHMM(null, NOW)).toBeNull();
  });
});

describe('limitUntilFor', () => {
  it('P-skive: сейчас + часы (дробные тоже)', () => {
    expect(limitUntilFor({ type: 'pskive', hours: 2, now: NOW })).toEqual({ until: NOW + 2 * HOUR, reason: null });
    expect(limitUntilFor({ type: 'pskive', hours: 0.5, now: NOW })).toEqual({ until: NOW + 30 * MIN, reason: null });
  });
  it('P-skive без часов — выбор не сделан', () => {
    expect(limitUntilFor({ type: 'pskive', now: NOW })).toEqual({ until: null, reason: 'invalid' });
  });
  it('Оплачено до: сегодня в указанное время', () => {
    expect(limitUntilFor({ type: 'paid_until', paidUntilHHMM: '15:00', now: NOW }))
      .toEqual({ until: NOW + 3 * HOUR, reason: null });
  });
  it('Оплачено до: время уже прошло → null и причина past', () => {
    expect(limitUntilFor({ type: 'paid_until', paidUntilHHMM: '09:00', now: NOW }))
      .toEqual({ until: null, reason: 'past' });
  });
  it('Без лимита: null, и это не ошибка', () => {
    expect(limitUntilFor({ type: 'none', now: NOW })).toEqual({ until: null, reason: null });
  });
});

describe('leaveByTime', () => {
  it('вычитает дорогу и запас из дедлайна', () => {
    expect(leaveByTime(100 * MIN, 20 * MIN, 5 * MIN)).toBe(75 * MIN);
  });
});

describe('deadlineOf', () => {
  it('старый формат: старт + длительность', () => {
    expect(deadlineOf({ startTime: 1000, durationMs: 500 })).toBe(1500);
  });
  it('новый формат: конец лимита', () => {
    expect(deadlineOf({ limitType: 'pskive', limitUntil: 1500 })).toBe(1500);
  });
  it('без лимита дедлайна нет', () => {
    expect(deadlineOf({ limitType: 'none', limitUntil: null })).toBeNull();
  });
});

describe('estimateWalkMs', () => {
  it('1 км при 5 км/ч с коэффициентом 1.3 ≈ 15.6 мин', () => {
    expect(Math.round(estimateWalkMs(1000, 5) / MIN * 10) / 10).toBe(15.6);
  });
  it('быстрее темп — меньше времени', () => {
    expect(estimateWalkMs(1000, 7)).toBeLessThan(estimateWalkMs(1000, 4));
  });
});

describe('computeStatus', () => {
  const base = { deadline: 120 * MIN, walkMs: 20 * MIN, bufferMs: 5 * MIN }; // выходить в 95 мин

  it('ok, пока до выхода больше 5 минут', () => {
    const s = computeStatus({ ...base, now: 60 * MIN });
    expect(s.level).toBe('ok');
    expect(s.timeUntilLeave).toBe(35 * MIN);
    expect(s.alarm).toBe(false);
    expect(s.late).toBe(false);
  });

  it('warn ровно за 5 минут до выхода', () => {
    const s = computeStatus({ ...base, now: 95 * MIN - WARN_BEFORE_MS });
    expect(s.level).toBe('warn');
  });

  it('danger + сигнал, когда пора выходить', () => {
    const s = computeStatus({ ...base, now: 95 * MIN });
    expect(s.level).toBe('danger');
    expect(s.alarm).toBe(true);
    expect(s.late).toBe(false);
  });

  it('late, когда дедлайн прошёл', () => {
    const s = computeStatus({ ...base, now: 121 * MIN });
    expect(s.level).toBe('danger');
    expect(s.late).toBe(true);
    expect(s.timeUntilDeadline).toBe(-1 * MIN);
  });

  it('без запаса и с нулевой дорогой выход = дедлайн', () => {
    const s = computeStatus({ now: 0, deadline: 10 * MIN, walkMs: 0, bufferMs: 0 });
    expect(s.leaveAt).toBe(10 * MIN);
  });
});

describe('extendSession', () => {
  const session = { id: 'a', limitType: 'pskive', limitUntil: NOW + 10 * MIN, bufferMs: 5 * MIN };

  it('+30 минут считаются от текущего конца лимита', () => {
    expect(extendSession(session, { addMs: 30 * MIN }).limitUntil).toBe(NOW + 40 * MIN);
  });

  it('продление «до HH:MM»', () => {
    const until = timestampForHHMM('15:00', NOW);
    expect(extendSession(session, { untilTs: until }).limitUntil).toBe(until);
  });

  it('без лимита считаем от «сейчас»', () => {
    const none = { limitType: 'none', limitUntil: null };
    expect(extendSession(none, { addMs: 15 * MIN, now: NOW }).limitUntil).toBe(NOW + 15 * MIN);
  });

  it('исходную сессию не меняет и остальные поля сохраняет', () => {
    const next = extendSession(session, { addMs: 30 * MIN });
    expect(session.limitUntil).toBe(NOW + 10 * MIN);
    expect(next.id).toBe('a');
    expect(next.bufferMs).toBe(5 * MIN);
  });
});

describe('statusFor', () => {
  it('без лимита статуса нет — значит, нет и тревоги', () => {
    const none = { limitType: 'none', limitUntil: null, bufferMs: 5 * MIN };
    expect(statusFor(none, { now: NOW, walkMs: 20 * MIN })).toBeNull();
  });

  it('с лимитом считает как computeStatus', () => {
    const session = { limitType: 'pskive', limitUntil: NOW + 120 * MIN, bufferMs: 5 * MIN };
    const s = statusFor(session, { now: NOW, walkMs: 20 * MIN });
    expect(s.level).toBe('ok');
    expect(s.timeUntilLeave).toBe(95 * MIN);
  });

  it('лимит вот-вот кончится → danger и тревога; после продления снова ok', () => {
    const session = { limitType: 'pskive', limitUntil: NOW + 1 * MIN, bufferMs: 5 * MIN };
    expect(statusFor(session, { now: NOW, walkMs: 2 * MIN }).alarm).toBe(true);
    const extended = extendSession(session, { addMs: 30 * MIN });
    expect(statusFor(extended, { now: NOW, walkMs: 2 * MIN }).level).toBe('ok');
  });
});
