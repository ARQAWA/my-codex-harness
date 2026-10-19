# Установка Scope Focus

Границы заказа: [INSTALL_FOR_AGENTS.md](../INSTALL_FOR_AGENTS.md).

## Состав

Пакет `plugins/scope-focus` переносит в Codex рабочий процесс my-omp-harness:
skills, профили агентов, hooks и два CLI.

Skills:

| Skill | Назначение |
|---|---|
| `codex-tools` | механика инструментов Codex: лимиты `exec`, code mode, `apply_patch`, жадный поиск `rg` волнами, CLI чтения `tools/read.cjs` |
| `todo` | todo-список root Main через CLI `tools/todo.cjs`: операции строками вроде `'done 1.2'`, как инструмент `todo` в omp |
| `subagents` | review, `code_writer`, `shell_runner`, `codebase_explorer` и `custom` через `spawn_agent`, как инструменты omp |
| `approval` | шаг согласования и классы работы micro/small/large; hook его не подаёт, вызывается явно `$approval` |
| `lightreview`, `blindreview`, `highreview` | явный запуск review уровня light, blind или high текущей работы, как команды omp |
| `define-goal` | `$define-goal`: цель с цитатами, старт без «го» при отсутствии вопросов, review перед завершением |

Профили агентов в `agents/`:

| Профиль | Модель | Роль |
|---|---|---|
| `spotty` | `gpt-6-sol / medium` | review уровня light |
| `smarty` | `gpt-6.1-sol / low` | review уровня blind |
| `bossy` | `gpt-6.1-sol / medium` | review уровня high и аудит |
| `code_writer` | `gpt-6-luna / medium` | пишет код по брифу |
| `shell_runner` | `gpt-6-luna / medium` | запускает программы по брифу |
| `codebase_explorer` | модель и reasoning Main | поиск по коду только на чтение |

Пять hooks. `hooks/communication.cjs` подаёт правила: `SessionStart`
(startup, resume, clear, compact) — root Main получает `codex-tools` с путями
CLI чтения и todo CLI, `todo`, `subagents` и строку окружения с программами в
`PATH` и правилом путей; при resume и compact ещё открытый todo-список.
`SubagentStart` — субагент получает только `codex-tools` с путём CLI чтения.
У `SessionStart` и `UserPromptSubmit` `additionalContextLimit = 65536`, у
`SubagentStart` 32768. `communication.cjs` читает инструкции из установленного
пакета. Подача не гарантирует следование модели.

Работающих субагентов сессии отмечают файлы в
`<CODEX_HOME>/scope-focus-todo/agents-<id сессии>/`: при `SubagentStart` его
пишет `communication.cjs`, при `SubagentStop` убирает `hooks/subagents.cjs`. Пока такой субагент
работает, `Stop` не даёт Main закончить ход и велит ждать финал через
`wait_agent`. Субагент, чей rollout уже закончил ход, или запись старше часа
ход не держат. Новый процесс сессии (`SessionStart` startup, resume и clear)
сбрасывает отметки: субагенты оборванного процесса Main не держат.

Собственный todo-список root Main ведёт CLI `tools/todo.cjs`: агент вызывает его
через shell, а CLI по `CODEX_THREAD_ID` пишет список сессии в файл
`<CODEX_HOME>/scope-focus-todo/todo-<id сессии>.json` (обычно `~/.codex`).
После каждого изменения CLI печатает текущий пункт и открытый список. Hooks
читают этот файл через `hooks/todo.cjs`: `UserPromptSubmit` подаёт список
с открытыми пунктами или напоминание создать его, `Stop` после проверки
субагентов один раз за ход возвращает модель к работе, пока есть пункты
`pending` или `in_progress`; пункт `blocked` ход не держит. События субагентов
`todo.cjs` пропускает.

Отсутствующий todo означает новый список, а ошибка чтения или повреждённое
состояние не подменяются пустым списком и не перезаписываются.
Todo CLI и hooks работают с сохранённым списком, без запросов к модели и
чтения истории разговора.

Финалы субагентов приходят Main сообщениями в режиме `multi_agent_v2`, как в
omp. Штатный режим v2 запрещает запускать субагентов без прямой просьбы
пользователя; в omp Main запускает их сам. Поэтому установка задаёт в
`config.toml` таблицу `[features.multi_agent_v2]` с текстом режима, который
Codex подаёт вместо штатного запрета:

```toml
[features.multi_agent_v2]
enabled = true
multi_agent_mode_hint_text = "Proactive multi-agent delegation is active: launch subagents by the subagents skill without waiting for an explicit user request, such as code_writer whenever its brief is shorter than the code, shell_runner for long or noisy runs, codebase_explorer for broad searches across several areas, and review for checks. User requests override this hint."
```

Системный промпт — отдельный компонент: [system-prompt.md](system-prompt.md).

## Требования

Нужны Codex CLI с поддержкой плагинов, hooks и `multi_agent_v2` и Node.js.
Поддерживаются macOS, Linux и Windows; в Windows используется только Git Bash,
без PowerShell. Hooks должны быть разрешены и доверены по текущим определениям.

## Первая установка

Найди фактическое имя в поле `name` нужного `marketplace.json`.
Личный marketplace из `~/.agents/plugins/marketplace.json` обнаруживается
автоматически: для него `marketplace add` не нужен, даже если его нет в списке.
Если другой источник ещё не подключён, добавь предоставленный локальный путь
или Git URL. Затем установи пакет:

```bash
codex plugin marketplace list --json
codex plugin marketplace add "<источник>"
codex plugin add "scope-focus@<marketplace>" --json
```

Скопируй шесть профилей `agents/*.toml` из установленного пакета в каталог
`agents` активного Codex home (обычно `~/.codex/agents`). Остальные профили
сохрани. Если профиль с тем же именем уже есть и отличается от файла пакета,
покажи владельцу разницу и заменяй только с его согласия.

Задай в `config.toml` таблицу `[features.multi_agent_v2]` из «Состава», сохранив
остальные ключи `[features]`. Строку `multi_agent_v2 = true` или `false` в
`[features]` замени этой таблицей; `false` меняй после показа строки владельцу
и его согласия.

Через штатный Codex app-server `hooks/list` найди пять текущих определений
hooks Scope Focus этого пакета. После штатного review/trust запиши через
`config/batchWrite` их точные ключи в `hooks.state`, `enabled = true` и
`trusted_hash = currentHash` текущего определения. Совпадающие записи не
переписывай. Не обходи trust и не меняй hooks других компонентов. Если политика
среды запрещает hooks, не объявляй подачу правил готовой.

Если системный промпт входит в заказ, выполни [его инструкцию](system-prompt.md)
той же ревизии.

## Проверка после установки

На целевой ОС проверь: пакет установлен и включён; шесть профилей в
`<CODEX_HOME>/agents` совпадают с файлами пакета; в `config.toml`
таблица `[features.multi_agent_v2]` совпадает с «Составом»; в пакете есть `hooks/communication.cjs`,
`hooks/subagents.cjs`, `hooks/running.cjs`, `hooks/todo.cjs`, `tools/read.cjs`,
`tools/todo.cjs` и `SKILL.md` всех skills из состава; по `hooks/list` все пять
hooks включены, доверены и ссылаются на установленный пакет. На Windows
используй Git Bash. Запросы к моделям и пробные задачи в проверку не входят.
Состав активного установленного пакета совпадает с выбранной ревизией; в нём
нет лишних исполняемых файлов и skills.

## Обновление

Выполни ту же команду `codex plugin add "scope-focus@<marketplace>" --json`,
затем скопируй шесть профилей той же версии, задай таблицу
`[features.multi_agent_v2]` из «Состава», и примени процедуру trust для изменившихся определений
hooks. Отличающийся профиль или другое значение ключа заменяй после показа
разницы и согласия владельца. Сохрани остальные профили, hooks, настройки и
данные. Файлы и skills, которых нет в выбранной ревизии пакета, не должны
оставаться активными после обновления; проверь состав runtime-копии.
Пользовательские данные вне пакета не удаляй. Если файлы уже совпадают,
повторная запись не нужна. Выполни только
проверки из «Проверка после установки», которых коснулись изменённые файлы,
hooks или зависимости; доказательства неизменённых частей переиспользуй, полную
первую установку и пробные задачи не повторяй.

После установки удали из `<CODEX_HOME>/agents` только устаревшие активные
`enot.toml`, `properliler.toml` и `explorer.toml`, если они остались от
предыдущего пакета Scope Focus; все остальные профили сохрани. Остальные следы прежних версий
обновление не трогает: их убирает только
[LEGACY-CLEANUP.md](../LEGACY-CLEANUP.md) по отдельной просьбе. Новые правила
действуют в новой задаче Codex.
