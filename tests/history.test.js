import { describe, it, expect } from 'vitest';
import { pushHistory, entryFromSession, HISTORY_MAX } from '../src/parking/history.js';

const MIN = 60 * 1000;

const entry = (id, startedAt = 0) => ({ id, lat: 55.6761, lng: 12.5683, note: '', startedAt, limitType: 'pskive', limitUntil: startedAt + 60 * MIN, endedAt: null });

describe('pushHistory', () => {
  it('новые записи сверху', () => {
    const list = pushHistory(pushHistory([], entry('a')), entry('b'));
    expect(list.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('не длиннее десяти записей', () => {
    let list = [];
    for (let i = 0; i < 14; i += 1) list = pushHistory(list, entry('p' + i));
    expect(list).toHaveLength(HISTORY_MAX);
    expect(list[0].id).toBe('p13');
    expect(list.at(-1).id).toBe('p4');
  });

  it('свой предел длины', () => {
    let list = [];
    for (let i = 0; i < 5; i += 1) list = pushHistory(list, entry('p' + i), 3);
    expect(list.map((e) => e.id)).toEqual(['p4', 'p3', 'p2']);
  });

  it('дубли по id не копятся', () => {
    const list = pushHistory(pushHistory([], entry('a')), entry('a'));
    expect(list).toHaveLength(1);
  });

  it('при завершении запись обновляется, а не добавляется', () => {
    const started = entry('a', 100 * MIN);
    let list = pushHistory(pushHistory([], started), entry('b', 200 * MIN));
    list = pushHistory(list, { ...started, endedAt: 130 * MIN });
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('a');
    expect(list[0].endedAt).toBe(130 * MIN);
    expect(list[1].id).toBe('b');
  });

  it('пустое или испорченное хранилище не мешает', () => {
    expect(pushHistory(null, entry('a'))).toHaveLength(1);
    expect(pushHistory([null], entry('a'))).toHaveLength(1);
  });
});

describe('entryFromSession', () => {
  const session = {
    id: 'a',
    point: { lat: 55.6761, lng: 12.5683, note: 'у почты', photo: 'data:image/jpeg;base64,xxx' },
    startedAt: 100 * MIN,
    limitType: 'paid_until',
    limitUntil: 160 * MIN,
    paceKmh: 5,
    bufferMs: 5 * MIN,
    status: 'active',
  };

  it('берёт место, время и тип лимита — без фото', () => {
    const e = entryFromSession(session);
    expect(e).toEqual({
      id: 'a',
      lat: 55.6761,
      lng: 12.5683,
      note: 'у почты',
      startedAt: 100 * MIN,
      limitType: 'paid_until',
      limitUntil: 160 * MIN,
      endedAt: null,
    });
    expect(e.photo).toBeUndefined();
  });

  it('у завершённой парковки есть endedAt', () => {
    expect(entryFromSession({ ...session, endedAt: 130 * MIN }).endedAt).toBe(130 * MIN);
  });
});
