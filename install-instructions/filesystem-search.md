# Установка

## Состав

Пакет содержит `filesystem-search` skill, Node.js wrappers (tgrep, ast-grep,
CBM index/search), Node CLI watcher CBM, guard hook и три справочных файла. Внешние инструменты
устанавливаются отдельно. npm-зависимостей и custom agents нет.

Все scoped-операции идут через wrappers от корня текущего проекта (cwd
сессии); другой root отклоняется с exit `2`. CBM используется только через
`codebase-memory-mcp cli ...`; его индексация — только через wrapper.
Постоянные процессы — официальный `tgrep serve` и один packaged Node watcher
CBM на canonical root. CBM запускается только как one-shot CLI; MCP нет.
Обёртки сами готовят индексы и поддерживают их в фоне.

## Требования

Нужны Codex с PreToolUse `cwd` и `updatedInput.command`, Node.js >= 22.13
со встроенным `node:sqlite`, Git, `tgrep`, `ast-grep`,
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
search/files/status/serve`, complete hidden coverage и полей readiness, JSON-массив `ast-grep`, one-shot
CBM CLI с identity/index/graph operations и `rg --engine auto`.

## Первая установка

Сначала определи ОС, архитектуру, активный Codex home и реальные пути команд.
Выбери фактическое имя подключённого marketplace и установи пакет штатной
операцией Codex CLI; для проверенного CLI это `codex plugin add
"filesystem-search@<marketplace>"`. Перед запуском сверь синтаксис по
`codex plugin --help`.

Existing marketplace переиспользуй. Не создавай второй источник или global
skill. Эта инструкция не выполняет bump, commit или push.

После `codex plugin add` установи или синхронизируй в
`<active-codex-home>/AGENTS.md` управляемый глобальный блок
`FILESYSTEM_SEARCH_GLOBAL_ROUTING` из канонического текста ниже. При update
пересинхронизируй этот блок всегда, даже если runtime и tooling не изменились.

Настрой доверие к hooks через штатный Codex app-server. Получи определения
через `hooks/list` и запиши нужный trust через `config/batchWrite` в
`hooks.state`: используй точный ключ hook и его `currentHash` как
`trusted_hash`. Меняй только hooks устанавливаемого плагина; уже доверенные
не переписывай. При смене `currentHash` обнови `trusted_hash` по тому же
точному ключу. В том же batch запиши `enabled = true` по точному ключу hook.
Не обходи trust. Сверь точное имя shell-инструмента в `hooks.json` matcher
через `hooks/list`; при необходимости поправь matcher перед trust.
Алгоритм синхронизации: одна полная пара markers — замени только managed
region; если markers нет, преобразуй старый точный unmarked body, иначе вставь
блок перед `<!-- codebase-memory-mcp:start -->`, а без этого anchor допиши его в
конец файла. Partial или duplicate markers — остановись с конфликтом. Запись
делай атомарно; сохрани encoding, newline style и весь текст вне managed region.
Глобальный `AGENTS.md` здесь — целевой файл установленного блока,
не источник дополнительных шагов установки. Канонический блок:

```markdown
<!-- BEGIN FILESYSTEM_SEARCH_GLOBAL_ROUTING -->
# Mandatory filesystem discovery routing

Before any command or tool call whose purpose is to discover files, symbols,
text, callers, dependencies, impact, or source context, load the
`filesystem-search` skill and follow its routing. This gate is mandatory and
comes before `rg`, `grep`, `find`, globs, AST scripts, or Codebase Memory CLI.
Read an already known exact path directly when discovery is not needed.
<!-- END FILESYSTEM_SEARCH_GLOBAL_ROUTING -->
```

Проверь, что в целевом файле ровно одна marker pair, body совпадает с
каноническим текстом, а внешний текст не изменился. Вступление глобальной
инструкции в силу проверь после общей перезагрузки task ниже.

Найди старый CBM по фактическим command/config и принадлежность каждого
объекта. До новой Codex session, установки tooling и functional check удали
целиком устаревший `[mcp_servers.codebase-memory-mcp]`, только его CBM
handlers, запускающие `hook-augment`, ставшие пустыми чисто-CBM группы,
duplicate standalone skill и принадлежащие ему obsolete files, а также
устаревший блок `<!-- codebase-memory-mcp:start -->`…`<!-- codebase-memory-mcp:end -->`
в `<active-codex-home>/AGENTS.md` вне managed routing-блока. Не оставляй
`enabled = false`, disabled copies, backup-каталоги или другой заменённый
мусор. Чужие handlers и группы сохрани. Неизвестная принадлежность или
использование блокирует удаление только соответствующего объекта; остальная
миграция продолжается. Примени удаление и затем, до первого запуска нового
CBM CLI, адресно заверши подтверждённый мешающий старый CBM process. До общей
перезагрузки task ниже новый CBM CLI не запускай. Не создавай MCP или отдельные host hooks/watchers сверх packaged runtime.
Не делай mass kill, reset графов, CBM install/uninstall scripts.
Штатное удаление approval не требует.

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

После настройки environment открой новую Codex task или session. Только в ней
проверь глобальную инструкцию, фактический PATH и запускай новый CBM CLI либо
другие PATH-зависимые functional checks. Эта единая перезагрузка обязательна и
для первой установки, и для обновления затронутого tooling.

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

Для функциональной проверки создай один временный каталог ОС с `probe.py` и
работай из него. Для этих прямых Node-проб передай `FSSEARCH_SESSION_ROOT`
равным canonical temporary root. В обычной задаче переменную задаёт только
trusted PreToolUse hook из cwd сессии:

```python
def probe_leaf():
    return "FILESYSTEM_SEARCH_PROBE"

def probe_caller():
    return probe_leaf()
```

Проверь только эти операции:

- Packaged wrapper находит `FILESYSTEM_SEARCH_PROBE`, в `files` mode возвращает
  `probe.py`, а отсутствующий шаблон даёт native exit 1. Первый вызов ждёт
  готовый индекс и watcher. Проверь hidden/ignored файл и положительный glob
  через индекс (`--stats`: via server), затем повторный запрос с тем же PID.
  Индекс probe должен появиться в `<active-codex-home>/tgrep/index/`, а не в
  `<temporary-root>/.tgrep`.
- Вызов каждого wrapper (tgrep, ast-grep, CBM index/search) с root, равным домашнему
  каталогу или другой папке вне cwd, даёт exit `2` с сообщением про project
  root.
- Guard hook выполняется без ошибок; из агента блокируются `tgrep serve
  <root>`, `codebase-memory-mcp cli index_repository ...` и прямой вызов
  `ast-grep` со scope и прямой CBM поиск. Отдельный packaged wrapper получает
  `FSSEARCH_SESSION_ROOT` из hook; смена shell cwd не разрешает другой root.
- Scoped `ast-grep-search.cjs --pattern 'probe_leaf()' --lang python --json -- .`
  находит вызов `probe_leaf()` и даёт один JSON-массив.
- Scoped `rg` находит известный текст с `--no-config --engine auto`.
- Выполни `cbm-search.cjs <temporary-root> query_graph` с bounded запросом
  `CALLS: probe_caller -> probe_leaf`. Первый поиск сам создаёт индекс;
  повторный использует тот же демон. Явное обновление — `cbm-index.cjs`.
  Текстовый поиск graph query не заменяет. CBM graph появляется в центральном
  хранилище `~/.cache/codebase-memory-mcp/`, а не внутри временного root.

После проверки заверши только tgrep-процесс созданного временного root.
Удали этот temporary root: это останавливает его CBM watcher без удаления графа.
Дождись остановки, затем удали только его CBM project через
`codebase-memory-mcp cli delete_project --project <name>`.
Рабочие проекты, существующие индексы и процессы не трогай. Сообщи выбранные
версии, пути, существенные exit-коды и результат. Не создавай отчёты,
benchmarks или искусственные отказы. При ошибке сообщи команду и диагностику.

## Обновление

Перед использованием новой CBM-обёртки адресно заверши подтверждённый старый packaged CBM watcher затронутого root. Следующий вызов запустит новую версию. Индекс и lock вручную не удаляй: старый демон ждёт EOF и несовместим с новым клиентом.

Повтори штатную add/update операцию из раздела «Первая установка» для того же
источника. Не создавай второй marketplace. Сохраняй release contract; этот
файл не делает bump, commit или push.

Повтори автономный порядок первой установки: определи последние стабильные
совместимые releases, переиспользуй совместимое, поставь отсутствующее,
обнови или перенастрой устаревшее и подготовь выбранные CLI. До установки
tooling и functional check удали подтверждённый старый CBM
layer, включая целиком `[mcp_servers.codebase-memory-mcp]`, только его
`hook-augment` handlers, пустые чисто-CBM группы, duplicate standalone skill и
его obsolete files, а также устаревший блок
`<!-- codebase-memory-mcp:start -->`…`<!-- codebase-memory-mcp:end -->` в
`<active-codex-home>/AGENTS.md` вне managed routing-блока. Не оставляй disabled copies или backup-копии. При конфликте
выбери newest previous compatible stable release с объяснением. После удаления
и до первого запуска нового CBM CLI адресно заверши подтверждённый мешающий
старый CBM process. Установи или обнови tooling, настрой итоговый
`shell_environment_policy.set`, затем открой новую Codex task по порядку первой
установки. Только после неё активируй CLI и выполни затронутые проверки. После
успешной functional проверки удали заменённые executable/runtime и
подтверждённо ненужные
производные графы. Нужные совместимые графы и user data вне удаляемых объектов
сохрани без изменений. Если удаляемый объект содержит единственную нужную
копию secret или data, блокируй удаление только этого объекта и сообщай точный
конфликт; остальная миграция продолжается. Не перемещай, не дублируй и не
меняй location, format или value secrets; общие каталоги и пакеты целиком не
удаляй. Неизвестная принадлежность блокирует только соответствующее удаление.

При обновлении корпуса tgrep обёртка сама подтверждает старый PID, завершает
его и один раз перестраивает сохранённый центральный индекс с новой политикой.
`serve.lock` не удалять. Нужные графы CBM сохраняются.

Повтори только проверки затронутых частей. Если изменился лишь этот repo-level документ,
а runtime и tooling не изменились, достаточно проверить обновлённую копию;
функциональные операции повторять не нужно. В конце сообщи фактические
изменения и оставшиеся blockers.
