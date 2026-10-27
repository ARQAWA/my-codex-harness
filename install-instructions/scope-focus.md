# Установка Scope Focus

Границы заказа: [INSTALL_FOR_AGENTS.md](../INSTALL_FOR_AGENTS.md).

## Состав

Пакет `plugins/scope-focus` переносит в Codex пользовательский harness my-pi:
skills, профили агентов, hooks и два CLI.

Skills:

| Skill | Назначение |
|---|---|
| `codex-tools` | механика инструментов Codex: лимиты `exec`, code mode, `apply_patch`, жадный поиск `rg` волнами, CLI чтения `tools/read.cjs` |
| `todo` | todo-список root Main через CLI `tools/todo.cjs`: операции строками вроде `'done 1.2'` |
| `reviewer` | правила review уровней blind и high; читается при вызове `$blindreview`, `$highreview` или аудита, hook его не подаёт |
| `blindreview`, `highreview` | единственный штатный запуск review уровня blind или high текущей работы |
| `define-goal` | `$define-goal`: цель с цитатами, старт без «го» при отсутствии вопросов, проверки критериев перед завершением |

Профили агентов в `agents/`:

| Профиль | Модель | Роль |
|---|---|---|
| `spotty` | `gpt-6.1-terra / low` | review уровня blind |
| `bossy` | `gpt-6.1-terra / medium` | review уровня high и аудит |

Профили только для review: Main запускает их, только когда пользователь
просит review. Правил запуска других субагентов пакет не задаёт.

Пять hooks. `hooks/communication.cjs` подаёт правила: `SessionStart`
(startup, resume, clear, compact) — root Main получает `codex-tools` с путями
CLI чтения и todo CLI, `todo` и строку окружения с программами в
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

Финалы субагентов приходят Main сообщениями в режиме `multi_agent_v2`.
Scope Focus не меняет правила их запуска: действует штатная подсказка Codex,
которая запрещает запуск без явной просьбы пользователя или инструкций
AGENTS.md и skills. Собственного текста режима пакет не подаёт. Нативные
агенты включаются одной таблицей в `config.toml`:

```toml
[features.multi_agent_v2]
enabled = true
```

Ключ `multi_agent_mode_hint_text` из прежних версий удаляется при обновлении.

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

Скопируй два профиля `agents/*.toml` из установленного пакета в каталог
`agents` активного Codex home (обычно `~/.codex/agents`). Остальные профили
сохрани. Если профиль с тем же именем уже есть и отличается от файла пакета,
покажи владельцу разницу и заменяй только с его согласия.

Задай в `config.toml` таблицу `[features.multi_agent_v2]` из «Состава», сохранив
остальные ключи `[features]`. Ключ `multi_agent_mode_hint_text` удали, если он
есть. Строку `multi_agent_v2 = true` или `false` в `[features]` замени этой
таблицей; `false` меняй после показа строки владельцу и его согласия.

Через штатный Codex app-server `hooks/list` найди пять текущих определений
hooks Scope Focus этого пакета. После штатного review/trust запиши через
`config/batchWrite` их точные ключи в `hooks.state`, `enabled = true` и
`trusted_hash = currentHash` текущего определения. Совпадающие записи не
переписывай. Не обходи trust и не меняй hooks других компонентов. Если политика
среды запрещает hooks, не объявляй подачу правил готовой.

Если системный промпт входит в заказ, выполни [его инструкцию](system-prompt.md)
той же ревизии.

## Проверка после установки

На целевой ОС проверь: пакет установлен и включён; два профиля в
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
затем скопируй два профиля той же версии, задай таблицу
`[features.multi_agent_v2]` из «Состава» и удали ключ
`multi_agent_mode_hint_text`, если он есть, и примени процедуру trust для изменившихся определений
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
`enot.toml`, `properliler.toml`, `explorer.toml`, `smarty.toml`,
`code_writer.toml`, `shell_runner.toml` и `codebase_explorer.toml`, если они остались от
предыдущего пакета Scope Focus; все остальные профили сохрани. Остальные следы
прежних версий убирает [LEGACY-CLEANUP.md](../LEGACY-CLEANUP.md), который
`INSTALL_FOR_AGENTS.md` выполняет после установки. Новые правила действуют в
новой задаче Codex.
