import { describe, it, expect } from 'vitest';
import { computeStatus, leaveByTime, estimateWalkMs, deadlineOf, WARN_BEFORE_MS } from '../src/parking/limits.js';

const MIN = 60 * 1000;

describe('leaveByTime', () => {
  it('вычитает дорогу и запас из дедлайна', () => {
    expect(leaveByTime(100 * MIN, 20 * MIN, 5 * MIN)).toBe(75 * MIN);
  });
});

describe('deadlineOf', () => {
  it('старт + длительность', () => {
    expect(deadlineOf({ startTime: 1000, durationMs: 500 })).toBe(1500);
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
