# Установка LCM

## Состав

Один плагин содержит архив доступных оригиналов основного чата, связанные
LCM-сводки, hooks `PreCompact` и `SessionStart(compact)`, а также CLI-команды
`search` и `expand`. Codex сначала делает штатный пересказ, затем основной чат
получает ограниченную подборку из LCM. Нативные субагенты используют штатный
compaction без собственного LCM-цикла; при форке им может достаться уже видимая
основному чату LCM-заметка. Отдельных MCP, сервиса и изменений Codex нет.

## Требования

Нужны Codex CLI с plugins и этими hooks, Node.js 22.13+ и исполняемый
`codex` для отдельной суммаризации. Плагин берёт его путь из `LCM_CODEX_BIN`,
если переменная задана; иначе на macOS использует встроенный CLI Codex App,
когда он существует, или команду `codex` из `PATH`. Поддерживаются macOS, Linux и Windows;
в Windows работай только через Git Bash. Отдельные вызовы модели для сводок
расходуют обращения к Codex.

Для штатного compaction у Main и субагентов в активном
`<active-codex-home>/config.toml` выключи `token_budget` и
`context_management`, если он включает этот режим. Сохрани остальные ключи:

```toml
[features]
token_budget = false
context_management = false
```

Если раздел `[features]` уже есть, измени только эти ключи в нём. Установка
плагина сама эти настройки не меняет. Архив расположен в
`${CODEX_HOME:-~/.codex}/lcm/archive.sqlite`; при обновлении сохраняй его.

## Первая установка

Определи активный Codex home и имя в поле `name` выбранного
`marketplace.json`. Личный marketplace из
`~/.agents/plugins/marketplace.json` Codex обнаруживает автоматически.
Другой предоставленный локальный путь или Git URL добавь, только если
источник ещё не подключён:

```bash
codex plugin marketplace list --json
codex plugin marketplace add "<предоставленный локальный путь или Git URL>"
codex plugin add "lcm@<marketplace>" --json
```

Для личного или уже подключённого marketplace пропусти `marketplace add`.
В Windows выполняй команды в Git Bash. Если `codex` отсутствует в `PATH` на
этом macOS-хосте, используй
`/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`.

Через штатный Codex app-server получи `hooks/list`. Для точных ключей hooks
плагина `lcm` запиши через `config/batchWrite` их `currentHash` как
`hooks.state.<точный ключ>.trusted_hash`, если определение ещё не доверено;
установи `enabled = true` для обоих hooks. Чужие hooks и настройки сохрани.
Не обходи штатную проверку доверия.

Поиск и раскрытие сохранённых записей запускай из установленного пакета:

```bash
node <путь-к-установленному-lcm>/bin/lcm.cjs search "<запрос>"
node <путь-к-установленному-lcm>/bin/lcm.cjs expand "<id>"
```

`expand` для `sum_` возвращает текст сводки и идентификаторы её непосредственных
дочерних сводок или исходных записей; повторяй команду для перехода по дереву.
Для `msg_` она возвращает исходную запись, доступную hook из транскрипта.
Если hook пропущен, недоверен или завершился ошибкой, Codex может выполнить
штатный compaction без новой записи в LCM. При нехватке времени доступные
оригиналы могут сохраниться, но часть сводок останется неготовой. Пробел
архива нельзя считать сохранённой памятью.

## Проверка после установки

На целевой ОС проверь, что установлен один пакет `lcm`, Node.js и `codex`
доступны hook-процессу, оба hook определения в `hooks/list` доверены и включены,
а эффективные `features.token_budget` и `features.context_management` выключены.
Проверь, что CLI `search` и `expand` доступны из установленного пакета и читают
тот же архив, что hooks. На Windows используй Git Bash. Если архив ещё пуст,
отсутствие результатов поиска нормально; оно не доказывает работу восстановления
после compaction.

## Обновление

Для Git marketplace обнови его снимок, затем переустанови плагин из того же
источника. Для локального marketplace пропусти `upgrade`:

```bash
codex plugin marketplace upgrade <marketplace>
codex plugin add "lcm@<marketplace>" --json
```

Сохрани архив, остальные пользовательские данные, hooks и настройки. Убедись,
что обычный compaction по-прежнему включён. Через `hooks/list` сверь новые
`currentHash`; обнови `trusted_hash` через `config/batchWrite` только у
изменившихся недоверенных hooks `lcm` и включи оба. Повтори проверки только
затронутых частей на целевой ОС.
