# Зачистка legacy

Инструкция выполняется только по отдельной просьбе пользователя о зачистке
legacy. Установка и обновление её не запускают. Перечень собран по всей истории
коммитов репозитория: здесь всё, что прежние версии поставки ставили на хост
пользователя и что текущая поставка больше не использует.

## Правила

- Работай в активном Codex home (`<CODEX_HOME>`, обычно `~/.codex`) и в
  перечисленных ниже местах. В Windows — только Git Bash.
- Сначала найди все цели и покажи пользователю один список: путь или ключ,
  что это, действие. Удаляй после его согласия на этот список.
- Удаляй только точные цели из списка. Принадлежность проверяй по признаку в
  таблице; без признака оставь объект и сообщи о нём.
- Плагины удаляй штатно: `codex plugin remove "<plugin>@<marketplace>"`.
  Hooks, MCP и ключи `config.toml` правь только у найденных записей, остальные
  настройки сохраняй. Trust и hooks других компонентов не трогай.
- Пользовательские данные — базы, архивы разговоров, журналы, notebook и
  отчёты — удаляются только при отдельном явном согласии на конкретный путь.
  Без него они остаются, и ты сообщаешь их путь и размер.
- Файл или блок удаляй целиком, без копий и заметок. Отсутствующую цель
  пропускай молча.
- Внешние инструменты filesystem-search — Codebase Memory (CBM), `ast-grep`,
  `tgrep` — могли быть установлены и отдельно от этого репозитория. Их
  MCP-записи, переменные окружения, блоки `AGENTS.md`, кэши, индексы и
  runtime показывай отдельной группой и удаляй только после ответа
  пользователя, что этот инструмент он отдельно не использует.
- Текущие компоненты не трогай: плагины `scope-focus` и `lunatron`, профили
  `spotty`, `smarty`, `bossy`, `enot`, `lunatik`, `lunatron_luna_high`,
  `lunatron_sol_low`, `lunatron_sol_medium`, `lunatron_sol_high`,
  `model_instructions_file` с его копией, `<CODEX_HOME>/scope-focus`,
  `<tmpdir>/scope-focus-tospec-*` текущего ToSpec, `PLUGIN_DATA/modes`
  и `PLUGIN_DATA/artifacts` Lunatron, `agents.max_concurrent_threads_per_session`.

## Удалённые плагины Codex

| Плагин | Что убрать | Признак принадлежности |
|---|---|---|
| `context-management` | плагин и marketplace `context-management`, если он обслуживал только его | имя плагина |
| `context-router` | плагин | имя плагина |
| `filesystem-search` | плагин | имя плагина |
| `lcm` | плагин | имя плагина |

После удаления плагина убери в `config.toml` записи `hooks.state.*`, ключи
которых указывают на этот плагин, и записи `[plugins."<plugin>@…"]`.
Из личного marketplace `~/.agents/plugins/marketplace.json` удали только
элементы `plugins[]` с `name` одного из этих четырёх плагинов, остальные
элементы сохрани. Marketplace `context-management` удаляй командой
`codex plugin marketplace remove context-management` и только если в нём нет
других плагинов; так же поступи с записью `[marketplaces.*]`, источник
которой — каталог одного из этих плагинов.
Оставшиеся копии в `<CODEX_HOME>/plugins/cache/<marketplace>/<plugin>/` удали
после штатного `remove`. Прежние копии вне Codex в `~/plugins/<plugin>`
удаляй только для этих четырёх плагинов.

Данные этих плагинов — пользовательские, по правилам выше:

| Путь | Данные |
|---|---|
| `<CODEX_HOME>/lcm/` (`archive.sqlite`) | архив оригиналов разговоров LCM |
| `~/.local/share/ctx-mgr-local-native/` или папка из прежних настроек `ctx-mgr-local-native` | SQLite, журналы и настройки Context Router |
| `~/.cache/codebase-memory-mcp/`, `${XDG_CACHE_HOME:-~/.cache}/tgrep-agent/`, `<CODEX_HOME>/tgrep/index/`, `<CODEX_HOME>/tools/filesystem-search/`, `<CODEX_HOME>/filesystem-search/` | индексы и инструменты filesystem-search |
| `<repo>/.codebase-memory/graph.db.zst` | экспорт CBM в известных пользователю репозиториях |

## Прежняя поставка через marketplace `personal`

Раньше `scope-focus` и `lunatron` ставились из личного marketplace
`personal` (`~/.agents/plugins/marketplace.json`, копии в `~/plugins`).
Текущая поставка — marketplace `my-codex-harness`. Выполняй строки ниже для
плагина, только если `codex plugin list` показывает его установленным и
включённым из `my-codex-harness`. Если текущая установка идёт из `personal`,
не трогай эти цели и сообщи пользователю.

| Цель | Действие |
|---|---|
| плагины `scope-focus@personal`, `lunatron@personal` | `codex plugin remove` |
| элементы `plugins[]` с `name` `scope-focus` или `lunatron` в `~/.agents/plugins/marketplace.json` | удалить только эти элементы |
| `~/plugins/scope-focus`, `~/plugins/lunatron` | удалить только по пути, подтверждённому пользователем |
| `<CODEX_HOME>/plugins/cache/personal/scope-focus/`, `…/personal/lunatron/` | удалить после `remove` |
| `<CODEX_HOME>/plugins/data/scope-focus-personal/` (прежний Task Notebook), `<CODEX_HOME>/plugins/data/lunatron-personal/` (`modes`, `tool-results`, `artifacts`) | данные пользователя по правилам выше |

Ключи `hooks.state` вида `scope-focus@personal:…` и `lunatron@personal:…`
удаляются по строке `hooks.state` в следующем разделе.

## Ключи и записи `config.toml`

| Запись | Откуда | Признак |
|---|---|---|
| `[mcp_servers.codebase-memory-mcp]`, `[mcp_servers.ast-grep]`, `[mcp_servers.tgrep]` | filesystem-search | команда `codebase-memory-mcp`, `ast-grep-server` или `runtime.py mcp` |
| `[mcp_servers.lunatron_context]` | ранний Lunatron MCP | команда `tools/context.cjs` |
| `[mcp_servers.notes]` | прежний CLI заметок | спроси пользователя, если команда не из этого harness |
| `model_catalog_json` | кастомный каталог моделей | путь к `codex-model-catalog.json` |
| `features.multi_agent_v2 = false` | прежний config-пакет | точное значение |
| `[features.token_budget]` (таблица с `guidance_message` про Context Router) и `features.context_management` | Context Router и LCM | текст про Context Router или LCM |
| `model_provider = "luna_fast_proxy"` и `[model_providers.luna_fast_proxy]` | Luna Fast proxy | `base_url = "http://127.0.0.1:18080/v1"`; верни прежний provider по выбору пользователя |
| `hooks.state.*` с ключами `scope-focus` или `lunatron`, которых нет среди текущих определений `hooks/list` (прежние `UserPromptSubmit` Scope Focus, `PreToolUse`, `PostToolUse` Lunatron) | прежние hooks плагинов | ключ указывает на плагин и отсутствует в `hooks/list`; текущие ключи сохрани |
| `mcp_optional_startup_grace_ms` | filesystem-search на Windows | значение `0`, добавленное для CBM |
| `shell_environment_policy.set` с переменными CBM, `tgrep` или `FILESYSTEM_SEARCH_*` | filesystem-search | имена переменных |

`sandbox_workspace_write.writable_roots` с `<CODEX_HOME>/scope-focus`
оставь: это текущий Notebook.

## Файлы в Codex home

| Путь | Откуда |
|---|---|
| `agents/properliler.toml`, `agents/explorer.toml` | прежние профили Scope Focus |
| `agents/luntik.toml`, `agents/lunatron_luna_xhigh.toml`, `agents/lunatron_sol_xhigh.toml` | прежние профили Lunatron |
| `codex-model-catalog.json` | кастомный каталог моделей |
| `skills/local-context-memory/` | прежняя ручная установка skill Context Management |

Профиль удаляй, только если файл совпадает с одной из packaged версий в
истории репозитория. Проверка для профиля `<name>` из пакета `<plugin>`:

```bash
for h in $(git log --format=%H -- "plugins/<plugin>/agents/<name>.toml"); do
  git show "$h:plugins/<plugin>/agents/<name>.toml" 2>/dev/null |
    cmp -s - "<CODEX_HOME>/agents/<name>.toml" && echo match && break
done
```

Без `match` оставь файл и сообщи о нём.

## Блоки в `<CODEX_HOME>/AGENTS.md`

Удали каждый блок вместе с маркерами, только если пара маркеров одна и
полная; при неполной или повторной паре остановись и сообщи конфликт.

| Маркеры | Откуда |
|---|---|
| `<!-- BEGIN FILESYSTEM_SEARCH_GLOBAL_ROUTING -->` … `<!-- END FILESYSTEM_SEARCH_GLOBAL_ROUTING -->` | filesystem-search |
| `<!-- BEGIN LUNATRON_GLOBAL_DELEGATION -->` … `<!-- END LUNATRON_GLOBAL_DELEGATION -->` | ранний Lunatron |
| `<!-- tgrep-agent:codex:instructions:begin -->` … `<!-- tgrep-agent:codex:instructions:end -->` | установщик `tgrep` |
| блок, заканчивающийся `<!-- codebase-memory-mcp:end -->` | установщик CBM; удаляй, только если начало блока однозначно |

Отдельный `SessionStart` hook `tgrep` в пользовательских hooks удали, если его
команда вызывает `tgrep`.

## Временные и рабочие данные прежних версий

| Путь | Откуда |
|---|---|
| `$(node -p "require('os').tmpdir()")/scope-focus/` | прежний Task Notebook и HTML-отчёты |
| `<tmpdir>/scope-focus-goal-memory*` | Goal Memory |
| `tool-results/` в каталогах данных Lunatron `<CODEX_HOME>/plugins/data/lunatron-*/` | прежние сохранённые результаты инструментов; данные пользователя |
| `~/.local/share/tgrep-agent/` | runtime `tgrep` |

Notebook, Goal Memory, отчёты и сохранённые результаты — данные пользователя
по правилам выше.

## Внешние компоненты

| Компонент | Что убрать | Условие |
|---|---|---|
| `scope-focus-kimi` в Kimi Code CLI | плагин через `/plugins` Kimi | Kimi установлен |
| Kimi Codex proxy `kimi-codex-proxy` | бинарник и его запуск: найди и покажи пользователю, удаляй только по указанному им пути; provider в конфиге Kimi Code с `base_url` `http://127.0.0.1:18080/v1` (типы `openai_responses` или `openai`, модель `gpt-6-luna-fast`) | Kimi Code использует этот provider; прежний provider выбирает пользователь. Тот же бинарник Cursor provider — в строке Cursor |
| Luna Fast proxy `openai-api-server-via-codex` | бинарник и его запуск: найди и покажи пользователю, удаляй только по указанному им пути | после возврата provider |
| Cursor provider (macOS) | `~/Library/Application Support/MyCodexHarness/CursorProvider/` (`kimi-codex-proxy`, `cursor-patch.mjs`, `route-config.json`, `CURSOR-UPDATE.md`, журналы ngrok), LaunchAgents `local.mycodexharness.cursor-proxy` и `local.mycodexharness.cursor-ngrok` (`launchctl bootout`, затем их plist в `~/Library/LaunchAgents/`), старый `cursor-patch.py`, если остался | только с согласия пользователя: зачистка выключает его маршрут Cursor |
| Патч bundle Cursor | восстановление штатного Cursor переустановкой или командой patcher, если она есть | только по отдельному согласию |
| Плагины Cursor | `~/.cursor/plugins/local/scope-focus`, `~/.cursor/plugins/local/lunatron`, `~/.cursor/lunatron`, их записи в hooks Cursor | Cursor установлен |
| Windows `rg.exe` в `~/bin` и строка `PATH` в `~/.bashrc` | — | не legacy: оставь |

## Проверка

После зачистки прочитай `config.toml`, `<CODEX_HOME>/AGENTS.md` и каталог
`agents`: удалённые цели отсутствуют, текущие компоненты на месте. Через
app-server `hooks/list` проверь, что hooks `scope-focus` и `lunatron` доверены
и включены. Сообщи удалённые цели, оставленные объекты с причиной и конфликты.
