# Зачистка legacy

Выполняется после каждой установки или обновления по `INSTALL_FOR_AGENTS.md` и
по отдельной просьбе владельца. Явный запрет владельца её отменяет. Перечень
собран по истории репозитория: здесь всё, что прежние версии ставили на хост и
что текущая поставка больше не использует.

## Правила

- Работай в активном Codex home (`<CODEX_HOME>`, обычно `~/.codex`). В Windows —
  только Git Bash.
- Заказ установки или зачистки — согласие на удаление целей этого harness:
  удаляй их без отдельного вопроса, проверив признак принадлежности из таблиц.
  Без признака оставь объект и сообщи о нём. Отсутствующую цель пропускай молча.
- Плагины удаляй штатно: `codex plugin remove "<plugin>@<marketplace>"`, затем
  их записи `[plugins."<plugin>@…"]` и устаревшие `hooks.state.*` в `config.toml`
  и копии в `<CODEX_HOME>/plugins/cache/<marketplace>/<plugin>/`.
- Пользовательские данные — базы, архивы разговоров, журналы, notebook, отчёты —
  удаляй только после явного согласия на конкретный путь. Собери такие цели в
  один список с путём, размером и действием и задай один вопрос; до ответа их
  не трогай. Без согласия сообщи путь и размер.
- Внешние инструменты filesystem-search — Codebase Memory (CBM), `ast-grep`,
  `tgrep` — общие программы владельца. Сами программы вне каталогов
  Codex home (пакеты npm, `uvx`, бинарники в `PATH`) не удаляй. Удаляй только записи
  harness о них, перечисленные в таблицах ниже, а каталоги, кэши, индексы и runtime
  из таблицы данных пользователя — по правилу согласия.
- Объекты, чьё происхождение на хосте не проверить, добавь в тот же список
  согласия, что и данные пользователя, и удаляй после ответа. Это настройки,
  которые владелец мог выбрать и сам (`agents.max_concurrent_threads_per_session`,
  `[agents] enabled`, `features.token_budget` и `features.context_management`
  со значением `false`, `mcp_optional_startup_grace_ms = 0`, переменные в `shell_environment_policy.set`, настройка CBM `auto_index = true`),
  записи `[mcp_servers.*]` внешних инструментов filesystem-search
  и следы установщиков `tgrep` и CBM: блоки в `AGENTS.md` и hook `tgrep`.
- Файл или блок удаляй целиком, без копий и заметок. Чужие hooks, trust,
  настройки, секреты и профили сохраняй.
- Не трогай текущие компоненты: плагин `scope-focus` установленной версии,
  профили `spotty` и `bossy`, `model_instructions_file` с его копией,
  `model_verbosity`, таблицу `[features.multi_agent_v2]`, текущие ключи
  `hooks.state` Scope Focus и `<CODEX_HOME>/scope-focus-todo/` с todo-списками.
- Охрана активной установки из `personal` действует на все таблицы ниже. Если
  `codex plugin list` показывает `scope-focus` установленным и включённым из
  `personal`, а не из `my-codex-harness`, не удаляй ничего относящегося к этой
  установке: сам плагин, элементы `plugins[]` в
  `~/.agents/plugins/marketplace.json`, записи `[marketplaces.*]` и
  `[plugins."scope-focus@personal"]`, кэш `plugins/cache/personal/scope-focus/`,
  `plugins/data/scope-focus-personal/`, ключи `hooks.state` `scope-focus@personal:…`
  и `~/plugins/scope-focus`. Сообщи владельцу и переходи к остальным целям.
  Записи `[marketplaces.*]` других плагинов сохраняй, пока они обслуживают эту
  установку.
- Зачистка касается только того, что ставили версии этого репозитория. Всё
  остальное — чужие плагины, MCP-серверы, hooks, настройки и инструменты
  владельца — не legacy: не удаляй, не оценивай и не упоминай как лишнее.

## Плагины и marketplace

| Цель | Действие |
|---|---|
| плагины `context-management`, `context-router`, `filesystem-search`, `lcm` | `codex plugin remove`; marketplace `context-management` убрать через `codex plugin marketplace remove`, только если в нём нет других плагинов |
| плагин `lunatron@my-codex-harness` | `codex plugin remove` |
| плагины `scope-focus@personal`, `lunatron@personal` | `codex plugin remove` |
| элементы `plugins[]` с этими именами в `~/.agents/plugins/marketplace.json` | удалить только эти элементы |
| `~/plugins/<plugin>` для этих плагинов | удалить только по пути, подтверждённому владельцем |
| записи `[marketplaces.*]`, источник которых — каталог удалённого плагина | удалить запись |
| `<CODEX_HOME>/plugins/cache/reviewer-comparison/` | копия отменённого сравнения ревьюеров; удалить |

`context-management`, `context-router`, `filesystem-search`, `lcm` и `lunatron`
не входят в текущую поставку и удаляются из marketplace `my-codex-harness`,
`personal` и `context-management`; плагин с таким именем из другого marketplace
не трогай. Их записи
`[marketplaces.*]` удаляй только после удаления самого плагина.

## Профили в `<CODEX_HOME>/agents`

Устаревшие профили Scope Focus: `smarty`, `enot`, `properliler`, `explorer`,
`code_writer`, `shell_runner`, `codebase_explorer`.
Устаревшие профили Lunatron: `lunatik`, `luntik`, `lunatron_luna_high`,
`lunatron_luna_xhigh`, `lunatron_sol_low`, `lunatron_sol_medium`,
`lunatron_sol_high`, `lunatron_sol_xhigh`.

Профиль удаляй, только если файл совпадает с одной из packaged версий в истории
репозитория. Проверка для профиля `<name>` из пакета `<plugin>`:

```bash
for h in $(git log --format=%H -- "plugins/<plugin>/agents/<name>.toml"); do
  git show "$h:plugins/<plugin>/agents/<name>.toml" 2>/dev/null |
    cmp -s - "<CODEX_HOME>/agents/<name>.toml" && echo match && break
done
```

Без `match` оставь файл и сообщи о нём.

## Ключи и записи `config.toml`

| Запись | Признак |
|---|---|
| `[mcp_servers.codebase-memory-mcp]`, `[mcp_servers.ast-grep]`, `[mcp_servers.tgrep]` | команда `codebase-memory-mcp`, `ast-grep-server` или `runtime.py mcp`; запись мог добавить и сам владелец; после согласия по правилу согласия выше удаляй её целиком вместе с timeout; если в `env` есть секрет, оставь запись и сообщи владельцу |
| `[mcp_servers.lunatron_context]` | команда `tools/context.cjs` |
| `model_catalog_json` | удаляй, только если значение указывает на `codex-model-catalog.json` этого harness; другое значение сохрани и сообщи владельцу |
| `codex-model-catalog.json` | файл, на который указывал удалённый `model_catalog_json`: в Codex home или по исторически настроенному пути вне его |
| `features.multi_agent_v2 = false` | точное значение; заменяется таблицей из инструкции установки |
| `multi_agent_mode_hint_text` в `[features.multi_agent_v2]` | прежняя подсказка активного делегирования; удали ключ, `enabled = true` сохрани |
| `[features.token_budget]` | ключи `guidance_message`, `reminder_message_template`, `auto_compact_fallback_prompt` с текстом про Context Router, Context Management, `local-context-memory`, `ctx-mgr-local-native` или `new_context`, и вместе с ними `enabled = true`, `use_history_notes_extension = false`, `reminder_threshold_tokens = 6000`, `auto_compact_fallback_buffer_tokens = 12000`; если в таблице нет других ключей, удали её целиком, иначе только эти ключи |
| `features.token_budget = false` и `features.context_management = false` | точные значения прежней установки LCM; после согласия по правилу согласия выше |
| `[agents] enabled = true` | точное значение прежней установки harness; текущий ключ — `[features.multi_agent_v2]`; после согласия по правилу согласия выше |
| `agents.max_concurrent_threads_per_session` | значения `2`, `4`, `5`, `16` или `44`, которые задавали прежние версии; после согласия по правилу согласия выше, другое значение сохрани |
| `model_provider = "luna_fast_proxy"` и `[model_providers.luna_fast_proxy]` | `base_url = "http://127.0.0.1:18080/v1"`; прежний provider выбирает владелец |
| `hooks.state.*` с ключами `<плагин>@<marketplace>`, где плагин — `scope-focus`, `lunatron`, `filesystem-search`, `lcm`, `context-router` или `context-management`, а marketplace — `my-codex-harness`, `personal` или `context-management`, которых нет среди текущих определений `hooks/list`, в том числе прежний `SubagentStop` | ключ указывает на плагин и отсутствует в `hooks/list`; текущие ключи и ключи под охраной `personal` сохрани |
| `mcp_optional_startup_grace_ms` | значение `0`, добавленное для CBM; после согласия по правилу согласия выше |
| `shell_environment_policy.set` с переменными CBM, `tgrep` или `FILESYSTEM_SEARCH_*` | имена переменных; после согласия по правилу согласия выше |
| путь `<CODEX_HOME>/scope-focus` в `sandbox_workspace_write.writable_roots` | убрать элемент вместе с удалением данных Notebook |

## Файлы и каталоги

| Путь | Откуда |
|---|---|
| `<CODEX_HOME>/plugins/cache/my-codex-harness/scope-focus/<версия>/` кроме версии из `codex plugin list --json` | прежние копии пакета |
| `<CODEX_HOME>/plugins/data/scope-focus-my-codex-harness/` | удалить, если каталог пуст; иначе данные пользователя |
| `<CODEX_HOME>/code-review-plugin/` | прежний пустой каталог; удалить, если пуст |
| `<CODEX_HOME>/skills/local-context-memory/` | прежняя ручная установка skill Context Management |
| `<CODEX_HOME>/scope-focus-todo/agents-*/` | отметки субагентов прежних версий; текущий пакет их не пишет |

Прежние файлы внутри самого пакета удаляются обновлением пакета. Это
`tools/decisions.cjs`, `tools/session-history.cjs`, `hooks/run.cjs`,
`hooks/running.cjs`, `hooks/subagents.cjs`, hook `SubagentStop` и каталоги
`cursor/`, `prompts/`; skills `restore-session`, `restore-todo`, `goal`,
`goal-memory`, `tospec`, `task-notebook`, `cleanup-task`, `cleanup-notebook`,
`html-brief`, `subagents`, `subagent-brief`, `working-standards`,
`setup-scope-focus`, Gold Standard, Clear Communication, Main Workflow, все
review-циклы (`light`, `blind`, `high`, `blind-check`, `blind-double-check`,
`double-light`, `mixed-blind-check`, `astro`), `lightreview`, `approval` и
прежние профили. Отдельной зачистки они не требуют: проверь, что в runtime-копии
их нет, а `hooks.json` содержит четыре текущих hook.

## Блоки в `<CODEX_HOME>/AGENTS.md`

Удали каждый блок вместе с маркерами, только если пара маркеров одна и полная;
при неполной или повторной паре остановись и сообщи конфликт.

| Маркеры | Откуда |
|---|---|
| `<!-- BEGIN FILESYSTEM_SEARCH_GLOBAL_ROUTING -->` … `<!-- END FILESYSTEM_SEARCH_GLOBAL_ROUTING -->` | filesystem-search |
| `<!-- BEGIN LUNATRON_GLOBAL_DELEGATION -->` … `<!-- END LUNATRON_GLOBAL_DELEGATION -->` | ранний Lunatron |
| `<!-- tgrep-agent:codex:instructions:begin -->` … `<!-- tgrep-agent:codex:instructions:end -->` | установщик `tgrep`; после согласия по правилу согласия выше |
| блок, заканчивающийся `<!-- codebase-memory-mcp:end -->` | установщик CBM; после согласия по правилу согласия выше и только если начало блока однозначно |

Отдельный `SessionStart` hook `tgrep` в пользовательских hooks ставил установщик
`tgrep`, а не harness: удали его, только если его команда вызывает `tgrep`, и после
согласия по правилу согласия выше.

## Данные пользователя

Удаляются только по правилу согласия выше:

| Путь | Данные |
|---|---|
| `<CODEX_HOME>/lcm/` (`archive.sqlite`) | архив оригиналов разговоров LCM |
| `~/.local/share/ctx-mgr-local-native/` или папка из прежних настроек | SQLite, журналы и настройки Context Router |
| `~/.cache/codebase-memory-mcp/`, `${XDG_CACHE_HOME:-~/.cache}/tgrep-agent/`, `<CODEX_HOME>/tgrep/index/`, `<CODEX_HOME>/tools/filesystem-search/`, `<CODEX_HOME>/filesystem-search/` | индексы и инструменты filesystem-search |
| `<repo>/.codebase-memory/graph.db.zst` | экспорт CBM |
| `<CODEX_HOME>/plugins/data/lunatron-*/`, `<CODEX_HOME>/plugins/data/scope-focus-personal/` | `modes`, `tool-results`, `artifacts` Lunatron и Notebook |
| `<CODEX_HOME>/scope-focus/`, `$(node -p "require('os').tmpdir()")/scope-focus/` | Task Notebook, корзина и HTML-отчёты |
| `<CODEX_HOME>/scope-focus-decisions/` | сохранённые решения сессий |
| `<tmpdir>/scope-focus-tospec-*`, `<tmpdir>/scope-focus-goal-memory*` | рабочие папки ToSpec и Goal Memory |
| `<tmpdir>/scope-focus-recorder-*`, `<tmpdir>/scope-focus-history-*` | копии историй разговоров прежних версий |
| `~/.local/share/tgrep-agent/` | runtime `tgrep`; внешний инструмент |

## Внешние компоненты

| Компонент | Что убрать | Условие |
|---|---|---|
| `scope-focus-kimi` в Kimi Code CLI | плагин через `/plugins` Kimi | Kimi установлен |
| Kimi Codex proxy `kimi-codex-proxy` | бинарник и его запуск по указанному владельцем пути; provider в конфиге Kimi Code с `base_url` `http://127.0.0.1:18080/v1` (типы `openai_responses` или `openai`, модель `gpt-6-luna-fast`) | Kimi Code использует этот provider; прежний provider выбирает владелец |
| Luna Fast proxy `openai-api-server-via-codex` | бинарник и его запуск по указанному владельцем пути | после возврата provider |
| Context Management service (macOS) | `launchctl disable gui/$(id -u)/local.ctx-mgr-native` и `launchctl bootout gui/$(id -u)/local.ctx-mgr-native`, затем его plist в `~/Library/LaunchAgents/`; только точный сервис, без `pkill` | сервис прежнего Context Management; SQLite, база и журналы остаются данными пользователя |
| Cursor provider (macOS) | `~/Library/Application Support/MyCodexHarness/CursorProvider/` кроме приватного `route-config.json` с ключом `api_key`, который оставь, LaunchAgents `local.mycodexharness.cursor-proxy` и `local.mycodexharness.cursor-ngrok` (`launchctl bootout`, затем plist в `~/Library/LaunchAgents/`), старый `cursor-patch.py` | только с согласия владельца: выключает его маршрут Cursor |
| Патч bundle Cursor | восстановление штатного Cursor переустановкой или командой patcher | только по отдельному согласию |
| Плагины Cursor | `~/.cursor/plugins/local/scope-focus`, `~/.cursor/plugins/local/lunatron`, `~/.cursor/lunatron`, их записи в hooks Cursor | Cursor установлен |
| Настройка CBM `auto_index = true` | `codebase-memory-mcp config get auto_index` показывает `true`; прежние установки включали её командой `config set auto_index true` | после согласия по правилу согласия выше верни значение, которое укажет владелец |
| Windows `rg.exe` в `~/bin` и строка `PATH` в `~/.bashrc` | — | не legacy: оставь |

## Проверка

После зачистки прочитай `config.toml`, `<CODEX_HOME>/AGENTS.md` и каталог
`agents`: удалённые цели отсутствуют, текущие компоненты на месте. Через
app-server `hooks/list` проверь, что четыре hooks `scope-focus` доверены и
включены, а в кэше плагинов осталась одна версия `scope-focus`.
Сообщи удалённые цели, оставленные объекты с причиной и конфликты.
