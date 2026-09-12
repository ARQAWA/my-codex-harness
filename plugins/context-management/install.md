# Context Management

Плагин хранит контекст в локальной SQLite через CLI на Node.js. Он не запускает
MCP и не держит фоновый сервер.

## Требования

Нужен Node.js 24.5 или новее с встроенным `node:sqlite`. Нужен Codex CLI с
командами `codex plugin marketplace add` и `codex plugin add`. Текущий
harness должен поддерживать `functions.new_context`,
`functions.get_context_remaining`, `features.token_budget` и rollout format.
Обычная установка upstream Codex без этого harness не обещает полный цикл
сброса окна.

Примеры ниже для macOS/Linux и POSIX shell. В Windows используйте Git Bash и
эквивалентные абсолютные пути профиля пользователя.

## Файлы пакета и регистрация

В корне репозитория находятся ровно шесть файлов пакета:

```text
my-codex-harness/
├── .agents/plugins/marketplace.json
└── plugins/context-management/
    ├── .codex-plugin/plugin.json
    ├── memory.js
    ├── skills/local-context-memory/SKILL.md
    ├── skills/setup-context-management/SKILL.md
    └── install.md
```

В пакете нет Node.js, npm-зависимостей, базы, лога или пользовательских
настроек.

Перед регистрацией проверьте существующие marketplace:

```sh
codex plugin marketplace list
```

Только если запись `context-management` указывает на старую копию, удалите её
командой `codex plugin marketplace remove context-management`. Не трогайте
другие marketplace. Затем выполните общие команды из текущего корня
`my-codex-harness`.

В POSIX shell:

```sh
cd /ABS/path/my-codex-harness
codex plugin marketplace add "$PWD"
codex plugin add context-management@context-management
```

Команда `marketplace add` регистрирует источник, а `plugin add` устанавливает
плагин в кэш и делает его skills доступными. Эти команды не устанавливают
runtime и не меняют `config.toml`; автоматическая настройка не выполняется.

### Установка агентом

Если пользователь просит установить или настроить плагин через Plugin Creator,
агент сначала читает `plugins/context-management/skills/setup-context-management/SKILL.md`, затем полностью
читает связанный `plugins/context-management/install.md`. После регистрации запросите
`$context-management:setup-context-management`. Native skill discovery и
`defaultPrompt` направляют агента; голая команда `codex plugin add` или кнопка UI
не гарантируют автоматическое чтение и запуск. Встроенный Plugin Creator этим не
изменяется. Для видимости нового skill может потребоваться новый turn или task.
После изменения `config.toml` перезапустите Codex и откройте новую задачу.

## Runtime

Для **новой установки** создайте каталог runtime и скопируйте CLI и skill:

```sh
REPO_ROOT="/ABS/path/my-codex-harness"
RUNTIME_DIR="$HOME/.local/share/ctx-mgr-local-native"
CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
mkdir -p "$RUNTIME_DIR"
cp -- "$REPO_ROOT/plugins/context-management/memory.js" "$RUNTIME_DIR/memory.js"
mkdir -p "$CODEX_DIR/skills/local-context-memory"
cp -- "$REPO_ROOT/plugins/context-management/skills/local-context-memory/SKILL.md" \
  "$CODEX_DIR/skills/local-context-memory/SKILL.md"
```

В Windows эти Bash-команды выполняйте в Git Bash. Перед записью путей в
`settings.json` и TOML преобразуйте POSIX-пути Git Bash в абсолютные Windows-пути
через `cygpath -am`. Для `node_path` используйте:

```sh
cygpath -am "$(command -v node)"
```

Остальные `settings_path`, `db_path`, `skill_path`, `cli_path`, `log_path` и
`codex_home` должны указывать на созданные каталоги и файлы в формате `C:/...`;
для `CODEX_HOME` используйте фактический заданный каталог. Для существующей
установки сохраняйте её реальные settings и пути, не заменяйте их defaults.

Если задан `CODEX_HOME`, используйте этот абсолютный каталог вместо
`~/.codex` в config, skill и всех полях settings. Сохраняйте свои custom paths.

Для **существующей установки** сначала выполните раздел «Обновление старой
установки». Сохраните её settings и данные, затем копируйте CLI и skill именно
в пути `settings.cli_path` и `settings.skill_path`. Не запускайте блок новой
установки вслепую.

Только для новой установки создайте `settings.json` с абсолютными путями. В POSIX значение `node_path`
должно совпадать с выводом `command -v node`.

```json
{
  "settings_path": "/ABS/path/.local/share/ctx-mgr-local-native/settings.json",
  "db_path": "/ABS/path/.local/share/ctx-mgr-local-native/memory.sqlite3",
  "codex_home": "/ABS/path/.codex",
  "max_output_bytes": 65536,
  "skill_path": "/ABS/path/.codex/skills/local-context-memory/SKILL.md",
  "node_path": "/ABS/path/bin/node",
  "cli_path": "/ABS/path/.local/share/ctx-mgr-local-native/memory.js",
  "log_path": "/ABS/path/.local/share/ctx-mgr-local-native/memory.events.jsonl"
}
```

Сохраните JSON в UTF-8 без BOM. Все восемь полей и их значения
нужны; абсолютные пути должны соответствовать этому компьютеру.

`/ABS/path` — машинный путь. Это не секрет и не переменная runtime. Не
переиспользуйте `$HOME` для другой цели. Если установка уже есть, сохраните её
`settings.json`, базу, checkpoint и лог. Скопируйте CLI и skill в пути
`settings.cli_path` и `settings.skill_path`; миграция данных не нужна.
Переменная `CODEX_HOME` учитывается CLI.

## config.toml

В существующем `/ABS/path/.codex/config.toml` измените таблицу
`[features.token_budget]`; если её нет, добавьте ровно одну. Не создавайте
дубликат. Сохраните
эти значения, заменив машинные пути в `guidance_message` на свои абсолютные:

```toml
[features.token_budget]
enabled = true
use_history_notes_extension = false
guidance_message = "Use local-context-memory skill at /ABS/path/.codex/skills/local-context-memory/SKILL.md. Local memory commands: /ABS/path/bin/node /ABS/path/.local/share/ctx-mgr-local-native/memory.js call OP --settings /ABS/path/.local/share/ctx-mgr-local-native/settings.json, args JSON on stdin; identity CODEX_THREAD_ID. At task start and each fresh window, context.bootstrap then read checkpoint and referenced history. Save goal, constraints, decisions, evidence and next step in /root/notes/checkpoint.md after meaningful progress. Before native functions.new_context write checkpoint and require successful revision receipt. CLI never resets context. Use native functions.get_context_remaining for budget."
reminder_message_template = "{n_remaining} tokens remain. Finish the current safe action, checkpoint through the local CLI, confirm successful revision, then use native functions.new_context before starting a large stage."
auto_compact_fallback_prompt = "The working window is exhausted. Use a shell CLI call to save the current checkpoint; after its successful revision receipt call native functions.new_context. Do not claim a save or completion after a write error. A native forced reset may still happen if no budget remains."
auto_compact_fallback_buffer_tokens = 12000
reminder_threshold_tokens = 6000
```

Используйте фактические `node_path`, `cli_path`, `settings_path` и `skill_path`.
Команда в `guidance_message` должна соответствовать вашей оболочке. Пути с
пробелами заключайте в двойные кавычки; внутренние кавычки в TOML basic string
экранируйте как `\"`.
Сохраните все остальные настройки и секреты. Таблицу `[mcp_servers.notes]`
не добавляйте.

## Обновление старой установки

Перед заменой старого CLI удалите только `[mcp_servers.notes]`, если её команда
указывает на этот memory CLI. Остановите его автозапуск и точные процессы MCP;
другие MCP не трогайте. На macOS:

```sh
launchctl disable gui/$(id -u)/local.ctx-mgr-native
launchctl bootout gui/$(id -u)/local.ctx-mgr-native
```

Если сервис загружен, выполните `bootout`, проверьте ошибки и остановитесь,
если сервер ещё работает. Только после этого заменяйте CLI. Старую базу и
данные сохраните. Не используйте `pkill` или другой широкий
шаблон. Старые чаты могут продолжить использовать сохранённые абсолютные пути.
Старые объявленные notes tools могут оставаться до обновления harness; они не
перенаправляются автоматически.

Попросите старого агента:

> Перечитай установленный `SKILL.md`. Используй прямой CLI по абсолютным
> `cli_path` и `settings_path`, без MCP notes и без фонового сервера.

## Активация

Перед активацией существующей установки возьмите фактические `node_path`,
`cli_path` и `settings_path` из сохранённого `settings.json`; не подставляйте
пути новой установки. Для новой установки замените placeholders реальными
абсолютными путями. Пути с пробелами заключайте в двойные кавычки.

Для текущего реального `CODEX_THREAD_ID` выполните одну команду:

```sh
printf '%s' '{}' | "/ABS/path/bin/node" \
  "/ABS/path/.local/share/ctx-mgr-local-native/memory.js" call context.bootstrap \
  --thread-id "$CODEX_THREAD_ID" \
  --settings "/ABS/path/.local/share/ctx-mgr-local-native/settings.json"
```

`ready` означает полную доступную границу. `catching_up` означает, что следующие
последовательные bootstrap или history calls продолжат импорт. `partial` означает
физический незавершённый хвост; его нельзя считать полной историей.
Используйте только настоящий `CODEX_THREAD_ID`, не придумывайте id.

Checkpoint хранится в виртуальном SQLite пути `/root/notes/checkpoint.md`; ссылки
на историю читаются через `history.read_item`. Перед native reset дождитесь
успешной записи с `revision`. CLI сам окна не сбрасывает и не работает как
непрерывный процесс.
