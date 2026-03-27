# Руководство по работе со звуками (Audio Guide)

Все аудиофайлы должны находиться в директории: `frontend/public/audio/`
Рекомендуемый формат: **MP3** (для совместимости) или **OGG**.

## Список звуков

| ID (в коде) | Имя файла | Тип | Действие | Рекомендуемая громкость |
| :--- | :--- | :--- | :--- | :--- |
| `click` | `click.mp3` | SFX | Обычный клик по кнопкам, переключателям | 1.0 (полная) |
| `success` | `success.mp3` | SFX | Успешная оплата, завершение сессии | 0.8 |
| `ambient_main` | `ambient_main.mp3` | Ambient | Фоновая музыка в профиле и на главном экране | 0.3 (тихо) |
| `ambient_reflect` | `ambient_reflect.mp3` | Ambient | Музыка во время сессии рефлексии (медитативная) | 0.4 |

## Технические требования

1. **Ambient (Фон)**: файлы должны поддерживать бесшовное зацикливание (Gapless Loop).
2. **SFX (Эффекты)**: должны быть максимально короткими (менее 1 сек) для исключения задержек.
3. **Битрейт**: для экономии трафика рекомендуется использовать 128kbps.

## Как добавить новый звук

1. Положить файл в `frontend/public/audio/new_sound.mp3`.
2. Добавить ID в `useAudio.ts` в тип `SoundId`:
   ```typescript
   type SoundId = 'click' | 'success' | ... | 'new_sound';
   ```
3. Добавить путь в объект `sounds` внутри `useEffect`:
   ```typescript
   const sounds: Record<SoundId, string> = {
       ...,
       new_sound: '/audio/new_sound.mp3'
   };
   ```
4. Вызвать в компоненте:
   ```typescript
   const { play } = useAudio();
   ...
   play('new_sound');
   ```
