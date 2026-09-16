# Архитектура Backontime

_Версия 1 — 15.09.2026, этап 0 (документы). Обновлять после каждого эпика._

## 1. Что есть сейчас

Статический PWA без сборки, три файла.

| Блок | Где | Что делает | Судьба |
|---|---|---|---|
| Отметка точки | `app.js` getCurrentPosition, markedPoint | GPS-координаты, заметка, фото (downscaleImage) | переиспользуем как «где машина» (E1) |
| Лимит времени | пресеты, customMinutes, buffer, pace | дедлайн = сейчас + N мин; выход = дедлайн − ходьба − запас | переиспользуем как P-skive/«оплачено до» (E2) |
| Маршрут | fetchWalkingRoute (OSRM), haversine ×1.3 фолбэк | время ходьбы до точки, обновление каждые 25 с / 25 м | переиспользуем |
| Статусы и сигнал | ok/warn/danger, fireAlarmOnce, Web Audio, vibrate, Notification | сигнал «пора выходить» пока страница открыта | переиспользуем; фон — через push (E3/E4) |
| Компас | deviceorientation, bearingDeg | стрелка на точку | переиспользуем |
| Карта | Leaflet, слои CARTO / Esri, locate | карта с точкой, маршрутом, пользователем | переиспользуем; + слой зон (E6) |
| Ссылка | parseJoinParams / applyJoinParams | URL с координатами и дедлайном | переиспользуем |
| Хранение | localStorage `backontime.session.v1` | восстановление сессии | остаётся для офлайна; + Supabase |
| Тексты | захардкожены по-русски в HTML/JS | — | вынести в переводы DA/EN (E0/E5) |

Ограничения: iOS не выполняет JS в фоне → сигнал при закрытом приложении невозможен
без push-сервера; OSRM демо-сервер с лимитами; тестов нет; `app.js` ≈ 600 строк одним файлом.

## 2. Целевая структура (после E0)

```
src/
  main.js            точка входа, роутинг экранов
  i18n/              da.json, en.json, t()
  geo/               position.js (GPS), route.js (OSRM + фолбэк), bearing.js
  parking/           session.js (модель парковки), limits.js (расчёт выхода), rules.js (правила зоны)
  alerts/            local.js (звук/вибрация/Notification), push.js (подписка Web Push)
  map/               map.js, layers.js, zones.js
  storage/           local.js, supabase.js
  ui/                setup.js, tracking.js, onboarding.js
sw.js                service worker: офлайн-оболочка, приём push
tests/               Vitest: limits, status, bearing, rules
supabase/            миграции, edge-функция расписания push
```

Правило: один файл < 500 строк; чистые функции расчёта отделены от DOM, чтобы их тестировать.

## 3. Схема данных (набросок, уточняется в E2/E3/E6)

- **parking_session**: id, device_id, lat, lng, note, photo (локально), started_at, limit_type
  (`pskive` | `paid_until` | `none`), limit_until, walk_minutes, buffer_minutes, leave_at,
  zone_id?, status, ended_at.
- **device**: id (анонимный), push_subscription, locale, created_at.
- **zone**: id, city, name, color, polygon (GeoJSON), rules[], source_url, source_date, fetched_at.
- **rule**: zone_id, days, from, to, tariff_dkk_h, pskive_limit_min, note.

Сопоставление источников: зоны Копенгагена — Open Data DK `kbh_p_zoner` (CC0); правила
тарифов — borger.dk / Københavns Kommune, вносятся вручную с датой и ссылкой.

## 4. Потоки

1. **Парковка**: отметить → (зона определяется по полигону) → лимит → расчёт `leave_at` →
   локальный таймер + запись в Supabase → edge-функция планирует push на `leave_at − напоминание`.
2. **Напоминание при закрытом приложении**: Supabase cron → Web Push → service worker показывает
   уведомление → тап открывает экран отслеживания с маршрутом.
3. **Обновление зон**: еженедельный скрипт тянет Open Data DK, сравнивает, пишет новую версию
   и присылает уведомление разработчику при изменениях.

## 5. Решения

См. `docs/adr/`: 001 PWA vs нативное, 002 Supabase, 003 модель правил.
Открытые вопросы: аналитика (Plausible vs self-hosted PostHog) — решить в E3;
подписки (MobilePay vs Stripe) — решить перед E8.
