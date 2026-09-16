# Архитектура Backontime

_Версия 2 — 16.09.2026, после E0 (фундамент). Обновлять после каждого эпика._

## 1. Что есть сейчас

PWA на Vite, ES-модули, Vitest. Раздел ниже описывает блоки как они были в старом `app.js`
и куда они переехали (E0 сделан: структура из §2 реализована).

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
без push-сервера (E3/E4); OSRM демо-сервер с лимитами.

## 2. Структура кода

Сделано в E0 (✓) и запланировано (→ эпик):

```
src/
  main.js            ✓ точка входа: язык, переводы, восстановление сессии / join-ссылка
  i18n/              ✓ ru.json, en.json, da.json (= en до E5), index.js: t(), applyTranslations()
  geo/               ✓ position.js (GPS), route.js (OSRM + haversine), bearing.js
  parking/           ✓ limits.js (deadline, leaveBy, computeStatus — чистые), session.js (localStorage, share/join URL)
                     → rules.js (правила зоны, E6)
  alerts/            ✓ local.js (звук/вибрация/Notification)   → push.js (Web Push, E3/E4)
  map/               ✓ map.js, layers.js                        → zones.js (E6)
  ui/                ✓ setup.js, tracking.js, compass.js, format.js   → onboarding.js (E5)
  storage/           → supabase.js (E3)
public/              ✓ manifest.json, icon.svg
sw.js                → service worker (E3)
tests/               ✓ limits, geo, session+i18n (25 тестов)
supabase/            → миграции, edge-функция расписания push (E3)
.github/workflows/   ✓ ci.yml (тесты на PR), deploy.yml (Pages из main)
```

Экраны получают колбэки (`onStart`, `onGpsStatus`) из `main.js`, а не импортируют друг друга.
Все тексты — через `t('ключ', {параметры})`; в HTML — атрибуты `data-i18n*`.

Правило: один файл < 500 строк (сейчас самый большой — `ui/tracking.js`, 170 строк); чистые функции расчёта отделены от DOM и покрыты тестами.

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
