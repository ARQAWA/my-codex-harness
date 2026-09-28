# План filesystem-search по платформам

**Основание:** [spec.md](spec.md), принятый контракт сохранения macOS/Linux и
отдельной установки native Windows 11.

## Реализация

### Плагин

Сохранить один plugin `filesystem-search`, текущие marketplace identity,
interface и `hooks.json`. В skill зафиксировать четыре назначения: известный
точный путь читается напрямую; текст/имена ищутся прежним `tgrep` на macOS/Linux
и прямым `rg -n`/`rg --files` на Windows; кодовые связи идут через внешний CBM
MCP; синтаксис — через внешний ast-grep MCP. Различать результат прямого поиска
и графа/AST, а свежие, отрицательные и полные выводы сверять с исходниками и
границами поиска.

Существующий context hook выбирает только текст маршрута через
`process.platform === 'win32'`. Оба существующих события продолжают вызывать
его через Node из `PLUGIN_ROOT`, timeout остаётся 7. Hook пишет только stdout и
не запускает поиск, сервер или индекс. В manifest меняются только description
поля, а после финального изменения payload применяется один штатный
cachebuster bump.

### Инструкции установки

`install-instructions/filesystem-search.md` остаётся действующей установкой
macOS/Linux, без изменения MCP-состава и поведения. Новая
`install-instructions/filesystem-search-windows.md` задаёт только Windows
установку и migration, а `INSTALL_FOR_AGENTS.md` выбирает документ по ОС.

Windows guide требует установить активные Codex binary/config и доступные
возможности его CLI/app-server до регистрации серверов. CBM и ast-grep
обрабатываются независимо: существующую запись проверяют и при необходимости
исправляют только для соответствующего сервера; отсутствующую добавляют только
его командой регистрации из spec. Уже существующий сервер повторно не
регистрируют. Используются CBM через `uvx` и ast-grep по закреплённому commit с
`ast-grep-cli`. CBM `auto_index` включается в конфигурации самого сервера;
обычный поиск не требует отдельного index-вызова, а явный `index_repository`
получает `persistence: false`. Startup grace/timeout из VDI отмечаются как
локальное наблюдение, не общий рецепт. Текущие hook hashes берутся из
`hooks/list` и доверяются через `config/batchWrite`.

Миграция удаляет старую Windows `tgrep` запись только при подтверждённом
владельце. Глобальный managed-блок удаляется из активного `AGENTS.md` только
при единственной полной паре границ; остальные настройки, кэши и данные
сохраняются.

### Проектные документы и приёмка

`AGENTS.md`, дизайн и эта пара spec/plan должны описывать две действующие
ветки и отмечать заменённый единый Windows-контракт как исторический. В
`tests/repository_consistency.test.mjs` проверить оба маршрута, manifest и
marketplace identity, hook registrations, Windows guide и entrypoint,
`auto_index`/`index_repository`/`persistence: false`, дизайн-маршруты и
отсутствие активного глобального managed-блока в AGENTS.

Исходниковая проверка запускает только существующий
`node tests/repository_consistency.test.mjs`. Целевая Windows-проверка
выполняется отдельно на установленном host: в одной новой Codex-задаче нужны
реальные `rg -n`, `rg --files`, CBM `search_graph` плюс `trace_path` или
ограниченный query, ast-grep `find_code`, оба context hook и проверка, что
проектный граф не создан. Поскольку такого Windows host у исполнителя нет,
план не объявляет Windows runtime проверенным и требует передать пользователю
точный prompt для выполнения на целевой установке.

## История решения

Ранний план предполагал один маршрут tgrep/CBM/ast-grep и одинаковую
инструкцию для всех ОС. Он заменён после сообщения, что macOS/Linux текущий
плагин уже полностью устраивает, а отказ наблюдался на native Windows. В новом
решении меняется только Windows-ветка и её установка; действующий Mac/Linux
маршрут и marketplace-идентичность сохраняются.
