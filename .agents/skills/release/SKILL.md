---
name: release
description: Release or install the selected my-codex-harness components, commit the source version, install it into Codex, and commit portable archives when requested; ordinary edits do not trigger a release.
---

# Release

Триггер: «выпустить», «установить» или «упаковать релиз этих компонентов».
Обычное редактирование release не запускает.

## 1. Область и источники

Определи явно заказанные компоненты и части release. Прочитай `AGENTS.md` и
соответствующий `INSTALL`. Сохрани чужой delta.

Analysis-only не меняет состояние. Полный релиз выполняет весь порядок ниже.
Частичный запрос выполняет только его явно заказанную часть.

## 2. Версии и проверки

Для изменяемых плагинов обнови manifest version существующим
`update_plugin_cachebuster.py` из plugin-creator. Согласуй marketplace source с
папкой plugin этого репозитория через текущий plugin-creator. Перед действием
прочитай актуальный installed skill plugin-creator.

Сделай одно повышение версии до исходного коммита. Не повторяй bump из
`INSTALL` после коммита.

Prompt и catalog snapshot определяется source commit. Придуманный номер версии
не добавляй.

Выполняй только проверки, прямо заказанные или required выбранной процедурой.
Сохрани их результат. Не придумывай count и дополнительные тесты.

## 3. Исходный коммит

`git add` выполняй только для exact requested paths и source commit. Чужой delta
не включай. Не делай push без запроса.

## 4. Установка

Native install выполняй командой `codex plugin add <name>@<marketplace>` только
когда entry source указывает этот репозиторий и версия соответствует source
commit. Соблюдай профили из `INSTALL` и fresh hook trust: Scope Focus —
`properliler`, Lunatron — `lunatik` и `luntik`. Trust не обходи.

После установки или обновления выполни запуск хуков по разделу проверки
`INSTALL`. При обычном update обнови весь runtime: native package,
packaged profiles и отдельные runtime-файлы.

Не запускай второй cachebuster из `INSTALL`: bump уже сделан. Остальной
`INSTALL` обязателен.

Для prompt и catalog следуй `config/codex-model-catalog-help.txt`: скопируй
оба файла, укажи точные config keys `model_catalog_json` и
`model_instructions_file` с абсолютными локальными путями, сохрани другие
настройки и перезапусти Codex. Затем начни новую задачу.

## 5. Переносимые архивы

Для полного release создай в `releases/` переносимый ZIP каждого выбранного
plugin с именем `<plugin>-portable-<manifest-version>.zip`. Включи всё shipped
дерево, включая `.codex-plugin`, skills, agents, `INSTALL` и имеющиеся tests.
Исключи только `.git`, OS junk и runtime data.

Для выпуска config создай `harness-config-<source-short-commit>.zip` с catalog,
prompt и help. Инструкцию из config адаптируй внутри config ZIP только если
структура архива не содержит `config`; проще архивировать `config/` целиком без
изменения.

Сверь содержимое архивов с committed source и установленными пакетами и
профилями, где применимо. ZIP создавай после установки. Source commit ради
архива не меняй.

## 6. Архивный коммит и ошибки

Сделай отдельный коммит только для exact новых archive paths.

Если выбран blind cycle, соблюдай именно его count и stage. Final делай после
полного результата. Не запускай автоматически многократный цикл по старой
истории.

Не удаляй старые архивы без явного cleanup запроса.

При uncertain install сначала прочитай affected state. Не повторяй install
вслепую. Сообщи незавершённый этап и не объявляй release завершённым.

Не добавляй скрипты, UI metadata, README или другие файлы.
