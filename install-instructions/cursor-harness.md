# Cursor harness

## Состав

Отдельный private [cursor-codex-provider](https://github.com/ARQAWA/cursor-codex-provider):
Rust adapter `kimi-codex-proxy`, Node.js patcher `cursor-patch.mjs` и
`CURSOR-UPDATE.md`. Source-контракт и release — его `HARNESS.md` / `UPDATING.md`.
Источник промпта — [`new-model-instructions-cursor.md`](../new-model-instructions-cursor.md),
дословная копия `prompts/model-instructions.md` встраивается в бинарник.
Плагины Scope Focus/Lunatron и системный промпт Codex отдельно подключаются;
`codex plugin add` этот компонент не устанавливает.

Выбранная поставка —
[v0.2.7](https://github.com/ARQAWA/cursor-codex-provider/releases/tag/v0.2.7),
macOS ARM64. Source commit разрешается по tag v0.2.7; prompt source revision
`27a07b798226b82e1d1f7d64c22b2ecb808b575c`. Новый binary version 0.2.7 собран production
`cargo build --release --locked` с этим embedded prompt; source разрешается
по tag v0.2.7. Промпт самодостаточен и не зависит от плагинов; их Goal/Notebook/cleanup
поступают отдельно. Финальные правила и Cursor mechanics сохранены дословно.
Rust-логика и Node patcher не изменены.
Публикация и установка используют одни локально подготовленные файлы
выбранной поставки:

| Asset | SHA-256 |
|---|---|
| `kimi-codex-proxy-macos-arm64` | `103de8e11ec5c05f908c63d9c11da174adeb9b1f6a5b93035d0b658c5fbf3107` |
| `cursor-patch.mjs` | `322cfd1b27e15a200e3eeeb19ea1cac824d9470f0db174bb9c372832dd19ed41` |
| `CURSOR-UPDATE.md` | `a813af84edd24388c2f8cfa24afe6ee9727ca688b010427ae16e9855325db4fb` |

`SHA256SUMS` сопровождает эти assets. Markdown copy не заменяет установку
нового binary с embedded prompt. Полный release включает установку на текущем Mac; частичный заказ только
публикации сохраняется. Runtime обновлён лишь после замены файлов, apply
затронутого патча и restart adapter, затем предусмотренных проверок.

## Требования

Поддерживаемая поставка — macOS Apple Silicon, Cursor с совместимыми seams
(исследована 3.23.12), Node.js с поддержкой `.mjs` и штатный `codesign`.
Нужен доступ к private release и существующая авторизация Codex ChatGPT
`~/.codex/auth.json` (либо реальный путь `--auth-json`). Не печатай секреты.
Постоянный каталог этого Mac:
`~/Library/Application Support/MyCodexHarness/CursorProvider/`.
Рядом нужен приватный `route-config.json` с правами 600: непустой `api_key`,
публичный HTTPS `base_url` с последним `/v1`, необязательный `provider_urls`.
На том же TLS origin/порту/prefix доступны HTTP inference и WSS reasoning bridge.
На иной машине определи реальные пути; Windows/Linux Cursor install не заявлен.

## Первая установка

1. Прочитай `HARNESS.md` и `UPDATING.md` выбранной ревизии Cursor-компонента.
   Полный release идёт от текущей локальной разработки: подготовь нужный
   binary в `dist/kimi-codex-proxy-macos-arm64`, source `cursor-patch.mjs`,
   `CURSOR-UPDATE.md` и `dist/SHA256SUMS`, затем source commit/push и
   публикация этих файлов. Для установки на этом же хосте используй эти же
   локальные файлы. Не скачивай свою поставку обратно с GitHub. Сверь SHA-256
   стандартным Node.js crypto с локальным checksum перед заменой runtime.
   Существующий binary переиспользуется только с известным source/hash и
   неизменёнными Rust/embedded prompt; иначе требуется заказанная production
   сборка. Install-only использует выбранную готовую совместимую поставку,
   без неявного source release. Недоступный обязательный input — blocker.
2. Установи бинарник как `kimi-codex-proxy` (с правом выполнения), patcher и
   `CURSOR-UPDATE.md` в постоянный каталог. Переиспользуй совместимые auth/route
   и действующий TLS endpoint. Если маршрут ещё не подготовлен, получи нужные
   endpoint/ключ и авторизацию на их настройку; не создавай туннель/VPS молча.
3. Перед `apply` попроси пользователя полностью закрыть Cursor (`Cmd+Q`).
   Выполни `node "$HOME/Library/Application Support/MyCodexHarness/CursorProvider/cursor-patch.mjs" apply`.
   Unknown/partial patch останавливает установку до записи; адаптация исходника
   требует отдельной работы, ручная правка bundle не заменяет её.
4. Используй существующий запуск adapter. На этом Mac это
   `local.mycodexharness.cursor-proxy`, RunAtLoad/KeepAlive, listener
   `127.0.0.1:18080`, existing ngrok TLS. После замены бинарника перезапусти
   только этот LaunchAgent: `launchctl kickstart -k "gui/$(id -u)/local.mycodexharness.cursor-proxy"`.
   На новом хосте без такого запуска используй binary с `--listen
   127.0.0.1:18080 --auth-json <реальный auth.json>` согласно его окружению;
   новый автозапуск/туннель не следует из переиспользования существующей схемы.
   После успешного apply пользователь открывает Cursor обычно.

## Проверка после установки

Сравни установленные binary/patcher/update text с выбранными assets и checksum,
прочитай пути запуска и route-поля без вывода root key: auth, endpoint, ключ,
параметры listener и чужие настройки сохранены. Если менялся patcher или Cursor,
выполни тот же Node command с `status`: оба bundle должны быть распознаны.
Старый наш runtime `cursor-patch.py` удаляй только после установки его Node-замены;
не трогай чужие файлы. Для миграции сохрани чужие hooks; если ещё существует
только наша старая beforeSubmitPrompt-регистрация/bridge, удаляй exact targets
по исходному Cursor-контракту. На текущем Mac старый hook уже удалён.
Это проверки установки; модельные прогоны и тесты сюда не входят.
Сообщи source/prompt revision, assets, пути, фактические результаты и блокеры.

## Обновление

Выполни `UPDATING.md` только для заказанных частей. Новая embedded prompt-копия
требует нового бинарника; только patcher не требует пересборки Rust. Обновляй
из выбранной полной совместимой поставки, сохраняя route key, auth, endpoint,
LaunchAgent, туннель, настройки и истории. Binary replacement требует restart
adapter; только prompt/binary update не требует повторного `apply` Cursor.
При смене patcher/маршрута или обновлении Cursor нужен закрытый Cursor и apply,
затем только затронутые проверки выше. Ротация ключа не выполняется автоматически.
Не повторяй выполненные release шаги. Незавершённый этап явно сообщи;
копирование Markdown само по себе не обновляет установленный prompt.
