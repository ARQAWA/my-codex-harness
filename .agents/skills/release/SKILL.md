---
name: release
description: Release or install selected Codex components of my-codex-harness; ordinary edits do not trigger release.
---

# Release

Codex-части заморожены до прямой разморозки владельцем; процедуры для них
ниже сохраняются как архивный baseline и не выполняются.
Общий статус и границы установки: [INSTALL_FOR_AGENTS.md](../../../INSTALL_FOR_AGENTS.md).

Триггер: «выпустить» или «установить» эти компоненты.
Обычное редактирование release не запускает.

## 1. Область и источники

Определи явно заказанные компоненты и части release. Прочитай
`INSTALL_FOR_AGENTS.md`, затем выбранный
`install-instructions/<component>.md`. Сохрани чужой delta.

Форк Codex CLI заморожен, временно архивирован и исключён из любых работ до
явной активации, извлечения и разморозки пользователем. Общий release harness
не включает его и не разрешает чтение/поиск архива, build, push или install
форка. Штатный Codex CLI из App для активных компонентов остаётся доступен.

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

Выполняй только проверки, прямо заказанные или required выбранной процедурой.
Сохрани их результат. Не придумывай count и дополнительные тесты.

## 3. Исходный коммит

После подготовки версии и перед коммитом выполни обязательный
[finalize-work](../finalize-work/SKILL.md) на полном сдаваемом результате.
Тот же gate обязателен перед push и завершением release; переиспользуй CLEAN
только пока результат и основания проверки остаются неизменными.

`git add` выполняй только для exact requested paths и source commit. Чужой delta
не включай. Полный release разрешает push выбранных source commits; при частичном заказе
выполняй push только если он входит в него.

## 4. Публикация и установка

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

## 5. Ошибки

Если выбран blind cycle, соблюдай именно его count и stage. Final делай после
полного результата. Не запускай автоматически многократный цикл по старой
истории.

При uncertain install сначала прочитай affected state. Не повторяй install
вслепую. Сообщи незавершённый этап и не объявляй release завершённым.

Не добавляй служебные файлы для отдельного релиза. Штатный cachebuster хранится
в `tools/update-plugin-cachebuster.mjs`; UI metadata и README не создавай.
