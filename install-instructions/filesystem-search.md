# Установка

## Состав

Пакет содержит `filesystem-search` skill, Node.js wrapper и три справочных
файла. Внешние инструменты устанавливаются отдельно. npm-зависимостей,
hooks и custom agents нет.

CBM используется только через `codebase-memory-mcp cli ...`. Единственный
допустимый постоянный поисковый процесс — официальный `tgrep serve`, который
wrapper запускает лениво для конкретного репозитория.

## Требования

Нужны Codex с поддержкой плагинов, Node.js, `tgrep`, `ast-grep`,
`codebase-memory-mcp` и `rg` с PCRE2. Windows — только Git Bash и native
Windows executable. PowerShell и WSL не используются.

Установка и обновление автономно настраивают tooling и мигрируют прежний
поисковый слой: ставят отсутствующее, обновляют или перенастраивают старое,
удаляют заменяемые CBM MCP/session hooks и активируют выбранные CLI.
Выбирай последние стабильные совместимые официальные releases без
prerelease/nightly и без закреплённых номеров. Совместимое переиспользуй;
устаревшее обнови либо размести отдельно и переключи Codex. При несовместимом
newest выбери новейший предыдущий совместимый stable release и объясни причину.
Runtime не перепроектируй.

Совместимость означает сохранение packaged-контрактов: `tgrep
search/files/status/serve` и полей readiness, JSON-массив `ast-grep`, one-shot
CBM CLI с identity/index/graph operations и `rg --engine auto`.

## Первая установка

Сначала определи ОС, архитектуру, активный Codex home и реальные пути команд.
Выбери фактическое имя подключённого marketplace и установи пакет штатной
операцией Codex CLI; для проверенного CLI это `codex plugin add
"filesystem-search@<marketplace>"`. Перед запуском сверь синтаксис по
`codex plugin --help`.

Existing marketplace переиспользуй. Не создавай второй источник или global
skill. Соблюдай repository release contract; этот файл сам не делает bump,
commit или push.

Найди старый CBM по фактическим command/config и принадлежность каждого
объекта. До новой Codex session, установки tooling и functional check удали
целиком устаревший `[mcp_servers.codebase-memory-mcp]`, только его CBM
handlers, запускающие `hook-augment`, ставшие пустыми чисто-CBM группы,
duplicate standalone skill и принадлежащие ему obsolete files. Не оставляй
`enabled = false`, disabled copies, backup-каталоги или другой заменённый
мусор. Чужие handlers и группы сохрани. Неизвестная принадлежность или
использование блокирует удаление только соответствующего объекта; остальная
миграция продолжается. Примени удаление и затем, до первого запуска нового
CBM CLI, адресно заверши подтверждённый мешающий старый CBM process. Начни
новую Codex session после этого. Не создавай новый MCP, hooks или watcher, не
делай mass kill, reset графов, CBM install/uninstall scripts. Штатное удаление
approval не требует.

Выбирай assets только из официальных release-источников:

- https://github.com/microsoft/tgrep/releases
- https://github.com/ast-grep/ast-grep/releases
- https://github.com/DeusData/codebase-memory-mcp/releases
- https://github.com/BurntSushi/ripgrep/releases
- https://nodejs.org/en/download

Скачай native archive для ОС, архитектуры и системной библиотеки хоста.
Проверь опубликованный checksum/digest, распакуй во временный каталог и
сохрани executable, runtime-файлы и лицензии. Не запускай install scripts,
встроенные install/update-команды CBM или интеграционные установщики. Если
готовой совместимой сборки нет, сообщи ограничение.

Подходящие команды переиспользуй. Отсутствующие или несовместимые версии
размещай отдельно в
`<active-codex-home>/tools/filesystem-search/<tool>/<version>/`. Сохраняй secrets и user data вне удаляемых объектов без изменений. Нужные
совместимые графы сохраняй; подтверждённо ненужные производные графы удаляй
только после проверки. Если удаляемый объект содержит единственную нужную
копию secret или data, блокируй удаление только этого объекта и сообщай точный
конфликт; остальная миграция продолжается. Не перемещай, не дублируй и не
меняй location, format или value secrets. Старые executable/runtime удаляй
только после успешной установки актуального tooling и согласованной functional
проверки, если подтверждено, что они больше не используются. Общие каталоги и
пакеты целиком не удаляй. В конце сообщи фактические изменения.

Автономно выставь приоритет выбранных executable штатным Codex environment
mechanism через `shell_environment_policy.set`, если это нужно. Сохрани
остальные PATH и настройки, используй абсолютные пути и native-разделитель.
Не меняй system PATH, shell profiles, managed restrictions или другие apps.
Не записывай `$PATH` или `~`; в Windows не создавай одновременно `PATH` и
`Path`. Не перезаписывай чужие binaries.

После успешной установки актуального tooling и согласованной functional
проверки удали старые executable/runtime, если подтверждено, что они больше не
используются. Удали только подтверждённо ненужные производные графы; нужные
совместимые графы и user data вне удаляемых объектов сохрани без изменений.
Заверши или убери только адресно подтверждённые остатки процесса. Если
удаляемый объект содержит единственную нужную копию secret или data, блокируй
удаление только этого объекта и сообщай точный конфликт; остальная миграция
продолжается. Не перемещай, не дублируй и не меняй location, format или value
secrets. Общие каталоги и пакеты целиком не удаляй. Недостаток прав или managed
denial останавливает только соответствующее удаление.

## Проверка после установки

Проверяй установленную копию и фактическое окружение Codex. Через Node с
`spawnSync` и `shell:false` проверь запуск и версии четырёх инструментов.
Для `rg` проверь `--pcre2-version`. Выполни:

```bash
codebase-memory-mcp cli list_projects --detail identity --format json
```

Пустой список допустим.

Для функциональной проверки создай один временный каталог ОС с `probe.py`:

```python
def probe_leaf():
    return "FILESYSTEM_SEARCH_PROBE"

def probe_caller():
    return probe_leaf()
```

Проверь только эти операции:

- Packaged wrapper находит `FILESYSTEM_SEARCH_PROBE`, в `files` mode возвращает
  `probe.py`, а отсутствующий шаблон даёт native exit 1. Начальный exit 75
  допускает status-only fallback, но нужен последующий успешный обычный tgrep
  поиск; постоянный уход в rg не считается исправным indexed backend.
- Scoped `ast-grep --lang python --json` находит вызов `probe_leaf()` и даёт
  один JSON-массив.
- Scoped `rg` находит известный текст с `--no-config --engine auto`.
- Выполни ровно один `index_repository --repo-path <temporary-root> --mode
  full`, получи usable project identity и один bounded graph query с
  `CALLS: probe_caller -> probe_leaf`. Текстовый поиск graph query не заменяет.

После проверки заверши только tgrep-процесс созданного временного root,
удали только его CBM project штатной CLI-командой и временный каталог.
Рабочие проекты, существующие индексы и процессы не трогай. Сообщи выбранные
версии, пути, существенные exit-коды и результат. Не создавай отчёты,
benchmarks или искусственные отказы. При ошибке сообщи команду и диагностику.

## Обновление

Повтори штатную add/update операцию из раздела «Первая установка» для того же
источника. Не создавай второй marketplace. Сохраняй release contract; этот
файл не делает bump, commit или push.

Повтори автономный порядок первой установки: определи последние стабильные
совместимые releases, переиспользуй совместимое, поставь отсутствующее,
обнови или перенастрой устаревшее и активируй выбранные CLI. До новой Codex
session, установки tooling и functional check удали подтверждённый старый CBM
layer, включая целиком `[mcp_servers.codebase-memory-mcp]`, только его
`hook-augment` handlers, пустые чисто-CBM группы, duplicate standalone skill и
его obsolete files. Не оставляй disabled copies или backup-копии. При конфликте
выбери newest previous compatible stable release с объяснением. После удаления
и до первого запуска нового CBM CLI адресно заверши подтверждённый мешающий
старый CBM process, затем начни новую Codex session. После успешной functional
проверки удали заменённые executable/runtime и подтверждённо ненужные
производные графы. Нужные совместимые графы и user data вне удаляемых объектов
сохрани без изменений. Если удаляемый объект содержит единственную нужную
копию secret или data, блокируй удаление только этого объекта и сообщай точный
конфликт; остальная миграция продолжается. Не перемещай, не дублируй и не
меняй location, format или value secrets; общие каталоги и пакеты целиком не
удаляй. Неизвестная принадлежность блокирует только соответствующее удаление.

Повтори только проверки затронутых частей. Если изменился лишь этот repo-level документ,
а runtime и tooling не изменились, достаточно проверить обновлённую копию;
функциональные операции повторять не нужно. В конце сообщи фактические
изменения и оставшиеся blockers.
