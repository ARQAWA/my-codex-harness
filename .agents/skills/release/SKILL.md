---
name: release
description: Release or install the selected my-codex-harness components, commit the source version, and install it into Codex; ordinary edits do not trigger a release.
---

# Release

Триггер: «выпустить» или «установить» эти компоненты.
Обычное редактирование release не запускает.

## 1. Область и источники

Определи явно заказанные компоненты и части release. Прочитай
`INSTALL_FOR_AGENTS.md`, затем выбранный
`install-instructions/<component>.md`. Сохрани чужой delta.

Analysis-only не меняет состояние. Полный релиз выполняет весь порядок ниже.
Частичный запрос выполняет только его явно заказанную часть.

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

Выполняй только проверки, прямо заказанные или required выбранной процедурой.
Сохрани их результат. Не придумывай count и дополнительные тесты.

## 3. Исходный коммит

После подготовки версии и перед коммитом выполни обязательный
[finalize-work](../finalize-work/SKILL.md) на полном сдаваемом результате.
Тот же gate обязателен перед push и завершением release; переиспользуй CLEAN
только пока результат и основания проверки остаются неизменными.

`git add` выполняй только для exact requested paths и source commit. Чужой delta
не включай. Не делай push без запроса.

## 4. Установка

Native install выполняй командой `codex plugin add <name>@<marketplace>` только
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

Если системный промпт входит в запрос, выполни
`install-instructions/system-prompt.md` той же ревизии. Его исходник —
`new-model-instructions.md` в корне репозитория.

## 5. Ошибки

Если выбран blind cycle, соблюдай именно его count и stage. Final делай после
полного результата. Не запускай автоматически многократный цикл по старой
истории.

При uncertain install сначала прочитай affected state. Не повторяй install
вслепую. Сообщи незавершённый этап и не объявляй release завершённым.

Не добавляй служебные файлы для отдельного релиза. Штатный cachebuster хранится
в `tools/update-plugin-cachebuster.mjs`; UI metadata и README не создавай.
