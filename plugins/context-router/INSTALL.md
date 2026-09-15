# Установка

## Состав

Пакет содержит `memory.js`, skill `local-context-memory` и Node.js hooks. Он хранит checkpoint, этапы и точную историю в локальной SQLite-базе. Код и skill работают из пакета. База, журналы и настройки остаются в одной существующей пользовательской папке `ctx-mgr-local-native` вне пакета; имя плагина не меняет её. Отдельные профили агентов не нужны.

Custom catalog и общие instructions — отдельные файлы поставки, не часть пакета. Их подключение описано ниже; сам пакет не зависит от репозитория разработки.

## Требования

Нужны Codex CLI с поддержкой плагинов, hooks, app-server и native TokenBudget, а также Node.js 24.5 или новее. Поддерживаются macOS, Linux и Windows; в Windows используется только Git Bash, без PowerShell. MCP и отдельный сервис не нужны.

## Первая установка

Найди фактическое имя в поле `name` нужного `marketplace.json`.
Личный marketplace из `~/.agents/plugins/marketplace.json` обнаруживается
автоматически: для него `marketplace add` не нужен, даже если его нет в списке.
Если другой источник ещё не подключён, добавь
предоставленный локальный путь или Git URL. Затем установи пакет:

```bash
codex plugin marketplace list --json
codex plugin marketplace add "<источник>"
codex plugin add "context-router@<marketplace>" --json
```

Для отдельно поставленных custom catalog и общих instructions используй
их актуальные файлы на целевой машине. В корневой части `config.toml`, до
таблиц, задай реальные абсолютные пути:

```toml
model_catalog_json = "<полный путь к codex-model-catalog.json>"
model_instructions_file = "<полный путь к new-model-instructions.md>"
```

Не подставляй путь другой машины, не создавай дубли ключей и не заменяй другие
настройки. В Windows используй пути с `/` либо корректные TOML literal strings.
Если эти компоненты не входят в выбранную поставку, их настройки не добавляются.

Для Context Router настрой отдельную таблицу TokenBudget. Замени прежний scalar этого же ключа таблицей; не оставляй дубликат `features.token_budget`. Не переписывай остальные features. Experimental Context Management и его модельную поддержку не включай и не меняй. Физические лимиты моделей и их TokenBudget defaults не требуют изменения: явные тексты ниже задают локальную схему.

```toml
[features.token_budget]
enabled = true
use_history_notes_extension = false
reminder_threshold_tokens = 6000
auto_compact_fallback_buffer_tokens = 12000
guidance_message = '''Use the Context Router skill local-context-memory. At each fresh window use its injected bootstrap, or call its bundled CLI context.bootstrap once for the owning thread if bootstrap is missing. Restore the effective user order, amendments, results and next action. When Task Notebook is explicitly selected, read its current locator and keep only that locator plus a short continuation state in the checkpoint. Use the configured executor for writes and pass the owning thread_id explicitly. Save at meaningful stages or user changes, not after every tool. Keep Goal, scope and workflow ownership unchanged.'''
reminder_message_template = '''{n_remaining} tokens remain. Finish the current safe step and save a concise Context Router checkpoint through the configured executor for the explicit owning thread_id. After the write succeeds, call new_context before continuing. If the requested result is already complete, finish normally. Report actual errors; do not treat an uncertain write as successful.'''
auto_compact_fallback_prompt = '''The context budget is exhausted. Stop expanding work. Use Context Router's bundled CLI through the configured executor to save the current continuation checkpoint for the explicit owning thread_id, or the selected Task Notebook locator and pending action. After a confirmed successful write, call new_context and resume from bootstrap. If the requested result is already complete, finish normally. Report actual write errors; do not substitute an unrequested whole-window summary.'''
```

Эти настройки читаются новым чатом. Перезапуск интерфейса не доказывает, что старый чат получил новые tools. После записи таблицы не заменяй её командой включения одиночного boolean flag.

Доверие настраивается через штатный `codex app-server` по stdio. Начни с:

```json
{"id":1,"method":"initialize","params":{"clientInfo":{"name":"plugin-install","version":"1"},"capabilities":{"experimentalApi":true}}}
{"method":"initialized"}
```

Запроси `hooks/list` с `cwds` для рабочего каталога. Для нужных hooks этого
плагина используй точные `key` и `currentHash`. Через `config/batchWrite`
передай `filePath` активного `config.toml`, `reloadUserConfig: false` и `edits`:
`keyPath` = `hooks.state.` + JSON-quoted `key` + `.trusted_hash`,
`value` = `currentHash`, `mergeStrategy` = `replace`.
Уже доверенные и managed hooks не переписывай; намеренно отключённые не включай.
Старый хеш или обход trust не заменяют доверие к текущему определению.

## Проверка после установки

После установки запусти каждый установленный хук с нужными входными данными
на целевой ОС. Убедись, что он выполняется без ошибок. На Windows используй
Git Bash. На этом проверка закончена.

Запросы к моделям, пробные задачи, переходы контекста и дополнительные
проверочные процедуры в проверку установки не входят.

## Обновление

При переходе с прежнего имени сначала штатно удали `context-management@context-management`. Старый marketplace удаляется только если он обслуживал исключительно этот плагин:

```bash
codex plugin remove context-management@context-management
codex plugin marketplace remove context-management
```

Затем подключи актуальный источник и установи `context-router@<marketplace>` командами первой установки. Обычное последующее обновление использует тот же `codex plugin add` из актуального источника. Отдельно поставленные catalog/instructions обновляются из выбранной поставки с сохранением их настроенных путей; одинаковые файлы не переписываются.

Сохрани существующую пользовательскую папку, SQLite, журналы, настройки и секреты на прежних местах и в прежнем виде. Миграция базы выполняется при первом обычном обращении к `memory.js`. Через app-server согласуй trust изменённых hook-определений. Затем выполни раздел проверки для обновлённых частей; полную проверку первой установки без запроса не повторяй. Новые инструкции и tools загружаются новым чатом.
