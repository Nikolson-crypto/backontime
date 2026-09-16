import { describe, it, expect } from 'vitest';
import { bearingDeg, cardinalIndex, arrowRotation } from '../src/geo/bearing.js';
import { haversineMeters } from '../src/geo/route.js';

const cph = { lat: 55.6761, lng: 12.5683 }; // Копенгаген, Ратушная площадь

describe('bearingDeg', () => {
  it('на север ≈ 0°', () => {
    expect(Math.round(bearingDeg(cph, { lat: 55.69, lng: 12.5683 }))).toBe(0);
  });
  it('на восток ≈ 90°', () => {
    expect(Math.round(bearingDeg(cph, { lat: 55.6761, lng: 12.60 }))).toBe(90);
  });
  it('на юг ≈ 180°, на запад ≈ 270°', () => {
    expect(Math.round(bearingDeg(cph, { lat: 55.66, lng: 12.5683 }))).toBe(180);
    expect(Math.round(bearingDeg(cph, { lat: 55.6761, lng: 12.53 }))).toBe(270);
  });
});

describe('cardinalIndex', () => {
  it('0°→С(0), 45°→СВ(1), 350°→С(0), 200°→ЮЗ? нет: 200/45=4.4→Ю(4)', () => {
    expect(cardinalIndex(0)).toBe(0);
    expect(cardinalIndex(45)).toBe(1);
    expect(cardinalIndex(350)).toBe(0);
    expect(cardinalIndex(200)).toBe(4);
  });
});

describe('arrowRotation', () => {
  it('без курса устройства — как есть', () => {
    expect(arrowRotation(120, null)).toBe(120);
  });
  it('с курсом — относительно него', () => {
    expect(arrowRotation(120, 100)).toBe(20);
    expect(arrowRotation(10, 100)).toBe(270);
  });
});

describe('haversineMeters', () => {
  it('одна точка → 0', () => {
    expect(haversineMeters(cph, cph)).toBe(0);
  });
  it('Копенгаген → Мальмё ≈ 27–29 км', () => {
    const km = haversineMeters(cph, { lat: 55.6050, lng: 13.0038 }) / 1000;
    expect(km).toBeGreaterThan(27);
    expect(km).toBeLessThan(29);
  });
});
