---
name: release
description: Release or install selected my-codex-harness components, including Codex and Cursor harness; ordinary edits do not trigger release.
---

# Release

Триггер: «выпустить» или «установить» эти компоненты.
Обычное редактирование release не запускает.

## 1. Область и источники

Определи явно заказанные компоненты и части release. Прочитай
`INSTALL_FOR_AGENTS.md`, затем выбранный
`install-instructions/<component>.md`. Сохрани чужой delta.

Общий release системного промпта включает Codex и Cursor; явно частичный
заказ только Codex или только Cursor не расширяй. Для Cursor выбранная
инструкция — `install-instructions/cursor-harness.md`; она ведёт в отдельный
checkout `cursor-codex-provider`, его `HARNESS.md` и `UPDATING.md`. Сам Cursor
не является Codex plugin; остальные плагины автоматически не устанавливай.

Analysis-only не меняет состояние. Полный релиз включает подготовку нужных
исходников/поставки, source commit, push, публикацию и локальную установку
выбранных компонентов на текущем хосте с проверками из инструкции. Остановка
после GitHub Release не завершает полный релиз. Уже выполненные части
переиспользуй. Публикуй локально подготовленные артефакты и устанавливай
эти же локальные файлы; обратное скачивание своего release не выполняй.
Явно заказанная только публикация или только установка
сохраняет эту границу.
Частичный запрос выполняет только его явно заказанную часть. Install-only
пропускает source preparation/build/bump/commit и переходит к установке
готовой выбранной поставки.

## 2. Версии и проверки

Для изменённых плагинов один раз запусти из корня репозитория
`node tools/update-plugin-cachebuster.mjs <имя-plugin> [...]` перед source commit.
Скрипт берёт timestamp UTC, сохраняет JSON в читаемом UTF-8 и проверяет,
что marketplace source указывает на `./plugins/<имя-plugin>` этого репозитория.
Неизменённые плагины не передавай. Внешний plugin-creator и Python не нужны.

Сделай одно повышение версии до исходного коммита. Не повторяй bump из
`INSTALL` после коммита.

Версия системного промпта определяется source commit. Придуманный номер версии
не добавляй.

Если Cursor входит в source release, выполни подготовку из его `UPDATING.md`
(исходники и пункты 1–3 поставки): дословно синхронизируй
`new-model-instructions-cursor.md` выбранной ревизии в
`prompts/model-instructions.md` до source commit/build. Rust/embedded prompt
изменён — production `cargo build --release --locked`; только patcher/docs —
переиспользуй сохранённый локальный binary с известным source/hash. Новый prompt
не обновляется одним Markdown copy. Cargo/tag version меняется один раз
только при source release; plugin cachebuster к Cursor не относится. Поставка:
macOS ARM64 binary, `cursor-patch.mjs`, `CURSOR-UPDATE.md`, `SHA256SUMS`, реальные
source/prompt revision и hashes; новые target/builders не добавляй.

Выполняй только проверки, прямо заказанные или required выбранной процедурой.
Сохрани их результат. Не придумывай count и дополнительные тесты.

## 3. Исходный коммит

После подготовки версии и перед коммитом выполни обязательный
[finalize-work](../finalize-work/SKILL.md) на полном сдаваемом результате.
Для Cursor включи контракт обоих репозиториев, source/runtime различия,
prompt-копию, patcher, release/installation документы и provenance поставки.
Тот же gate обязателен перед push и завершением release; переиспользуй CLEAN
только пока результат и основания проверки остаются неизменными.

`git add` выполняй только для exact requested paths и source commit. Чужой delta
не включай. Полный release разрешает push выбранных source commits; при частичном заказе
выполняй push только если он входит в него.

## 4. Публикация и установка

Для полного release или явно заказанной публикации Cursor выполни
оставшийся пункт 5 его
`UPDATING.md`: private release с assets/checksum на фактический source commit.
Push выполняется только в разрешённой части. Не повторяй bump/build/source
commit уже выполненных шагов. Install-only использует выпущенную совместимую
поставку и не запускает новый source release.

Для выбранных Codex plugins native install выполняй командой `codex plugin add <name>@<marketplace>` только
когда entry source указывает этот репозиторий и версия соответствует source
commit. Соблюдай профили из выбранного документа: Scope Focus — `spotty`,
`smarty`, `bossy`; Lunatron — `lunatik`, `luntik`, `lunatron_luna_xhigh`,
`lunatron_sol_low`, `lunatron_sol_medium`, `lunatron_sol_xhigh`. Scope Focus обновляет три
профиля и коммуникационные hooks по своей установочной инструкции. Fresh hook
trust нужен для компонентов, чьи выбранная инструкция и установленный пакет
действительно содержат hooks, включая Scope Focus и Lunatron. Trust не обходи.

После native install выполни только оставшиеся applicable setup/check шаги из
выбранного документа. Не повторяй cachebuster или native add, уже выполненные
release flow. При обычном update обнови весь runtime: native package,
packaged profiles и отдельные runtime-файлы.

Не запускай второй cachebuster или native add из выбранного документа: bump и
native install уже выполнены release flow.

Для полного release с Codex-промптом или его install выполни
`install-instructions/system-prompt.md` той же ревизии. Его исходник —
`new-model-instructions.md` в корне репозитория.

Для полного release Cursor или явно заказанного install выполни
`install-instructions/cursor-harness.md`
выбранной ревизии без повторных release шагов: доставь затронутые runtime-файлы
и restart adapter после замены binary. При изменении patcher/route или Cursor
пользователь полностью закрывает приложение перед apply. Только prompt/binary
update не требует повторного apply. Сохраняй auth/root key/route/endpoint,
LaunchAgent/туннель, чужие настройки и истории. Проверки — только из выбранной
инструкции; runtime не объявляется обновлённым до фактической установки.

## 5. Ошибки

Если выбран blind cycle, соблюдай именно его count и stage. Final делай после
полного результата. Не запускай автоматически многократный цикл по старой
истории.

При uncertain install сначала прочитай affected state. Не повторяй install
вслепую. Сообщи незавершённый этап и не объявляй release завершённым.

Не добавляй служебные файлы для отдельного релиза. Штатный cachebuster хранится
в `tools/update-plugin-cachebuster.mjs`; UI metadata и README не создавай.
