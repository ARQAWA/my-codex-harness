# Установка Scope Focus

Границы заказа: [INSTALL_FOR_AGENTS.md](../INSTALL_FOR_AGENTS.md).

## Состав

Пакет `plugins/scope-focus` содержит правила работы, skills и профили агентов.

Skills:

| Skill | Назначение |
|---|---|
| `gold-standard` | рабочие принципы: точный scope, кратчайший путь, проверка чтением |
| `codex-tools` | механика инструментов Codex: лимиты `exec`, code mode, `apply_patch`, CLI чтения `tools/read.cjs` |
| `main-workflow` | шаг согласования, классы работы micro/small/large (ответ или файл-отчёт без правок проекта и настроек без review по классу), todo-список через CLI `tools/todo.cjs`, native Goal |
| `subagents`, `subagent-brief` | роли агентов и брифы `code_writer` и `shell_runner` |
| `clear-communication` | русский язык, формат ответов и вопросов; частоту обновлений задаёт системный промпт |
| `light-review-cycle`, `blind-review-cycle`, `high-review-cycle` | слепой review на цитатах со Spotty, Smarty и Bossy |
| `define-goal` | `$define-goal`: цель с цитатами, старт без «го» при отсутствии вопросов, review перед завершением |
| `restore-session` | `$restore-session`: восстановить решения из полной сохранённой истории, затем вызвать сборку todo |
| `restore-todo` | `$restore-todo`: Main сопоставляет историю, решения и выполненную работу и восстанавливает оставшиеся задачи |

Профили агентов в `agents/`:

| Профиль | Модель | Роль |
|---|---|---|
| `code_writer` | `gpt-6-luna / medium` | пишет код и конфигурацию по брифу Main |
| `shell_runner` | `gpt-6-luna / medium` | запускает тесты, сборки и программы по брифу Main |
| `spotty` | `gpt-6.1-sol / low` | review небольшой работы |
| `smarty` | `gpt-6.1-sol / medium` | review большой работы |
| `bossy` | `gpt-6.1-sol / high` | review по выбору владельца и аудит |

Четыре hooks. Два подают правила через `hooks/communication.cjs`: `SessionStart`
(startup, resume, clear, compact) — root Main получает Gold Standard,
`codex-tools` с путём CLI чтения, `main-workflow`, `subagents` и
`clear-communication`; `SubagentStart` — субагент получает только
`codex-tools` с путём CLI чтения; root Main получает ещё пути todo, decisions и history CLI и сохранённые решения. У `SessionStart` и `UserPromptSubmit` `additionalContextLimit = 65536`, у `SubagentStart` 32768.
`communication.cjs` читает источники и реестр из установленного пакета и Codex home, ничего не записывает.
Подача не гарантирует следование модели.

Собственный todo-список root Main ведёт CLI `tools/todo.cjs`: агент вызывает его
через shell, а CLI по `CODEX_THREAD_ID` пишет список сессии в файл
`<CODEX_HOME>/scope-focus-todo/todo-<id сессии>.json` (обычно `~/.codex`). Два
hooks читают этот файл через `hooks/todo.cjs`: `UserPromptSubmit` подаёт список
с открытыми пунктами или напоминание создать его, `Stop` один раз за ход
возвращает модель к работе, пока есть пункты `pending` или `in_progress`; пункт
`blocked` ход не держит. События субагентов `todo.cjs` пропускает.

Перед подачей нового сообщения `UserPromptSubmit` обновляет решения через
`tools/decisions.cjs`. Один recorder на `gpt-6.1-sol / low`, без фильтра,
вызывает штатный `codex exec` с отключёнными hooks и plugins, во временном
каталоге и в read-only sandbox. Используются действующие вход и конфигурация
Codex, настройки не переписываются. Реестр лежит в
`<CODEX_HOME>/scope-focus-decisions/decisions-<id сессии>.json`;
`tools/decisions.cjs show` выводит его в читаемом виде с цитатами и источниками.
При ошибке recorder сообщение блокируется; `Stop` модель не вызывает.

`tools/session-history.cjs` читает исходные rollout из `sessions` и
`archived_sessions`, включая сообщения до compaction. `$restore-session`
сначала пересобирает решения и подаёт их в контекст Main, затем вызывает
`$restore-todo`: Main читает всю
историю постранично и восстанавливает только оставшуюся согласованную работу.
Чтение идёт по неизменяемому снимку исходной истории на момент запуска,
чтобы новые записи самого восстановления не расширяли его вход.
Снимок и его источник указаны в реестре; прогресс прерванного replay сохраняется
отдельно от действующих решений.
Восстановление не запускает эту работу. Чужая сессия выбирается явно и не
перезаписывает память текущей. Отсутствующая исходная история не заменяется
пересказами и не объявляется восстановленной.

Системный промпт — отдельный компонент: [system-prompt.md](system-prompt.md).

## Требования

Нужны Codex CLI с поддержкой плагинов и hooks и Node.js. Поддерживаются macOS,
Linux и Windows; в Windows используется только Git Bash, без PowerShell.
Hooks должны быть разрешены и доверены по текущим определениям.
Для recorder нужен доступ к `gpt-6.1-sol` через текущую конфигурацию Codex;
отдельный Anthropic и его ключ не нужны. Сжатые rollout `.jsonl.zst` требуют
Node.js с `zlib.zstdDecompressSync`.

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

Скопируй пять профилей `agents/*.toml` из установленного пакета в каталог
`agents` активного Codex home (обычно `~/.codex/agents`). Остальные профили
сохрани.

Через штатный Codex app-server `hooks/list` найди четыре текущих определения
hooks Scope Focus этого пакета. После штатного review/trust запиши через
`config/batchWrite` их точные ключи в `hooks.state`, `enabled = true` и
`trusted_hash = currentHash` текущего определения. Совпадающие записи не
переписывай. Не обходи trust и не меняй hooks других компонентов. Если политика
среды запрещает hooks, не объявляй подачу правил готовой.

Если системный промпт входит в заказ, выполни [его инструкцию](system-prompt.md)
той же ревизии.

## Проверка после установки

На целевой ОС проверь: пакет установлен и включён; пять профилей в
`<CODEX_HOME>/agents` совпадают с файлами пакета; в пакете есть
`hooks/communication.cjs`, `hooks/todo.cjs`, `tools/read.cjs`, `tools/todo.cjs`,
`tools/decisions.cjs`, `tools/session-history.cjs`, `prompts/decision-recorder.md`
и `SKILL.md` всех skills из состава; по `hooks/list` все четыре hooks включены, доверены и
ссылаются на установленный пакет. На Windows используй Git Bash. Запросы к моделям и
пробные задачи в проверку не входят.

## Обновление

Выполни ту же команду `codex plugin add "scope-focus@<marketplace>" --json`,
затем скопируй пять профилей той же версии и примени процедуру trust для
изменившихся определений hooks. Сохрани остальные профили, hooks, настройки и
данные. Если файлы уже совпадают, повторная запись не нужна. Выполни только
проверки из «Проверка после установки», которых коснулись изменённые файлы,
hooks или зависимости; доказательства неизменённых частей переиспользуй, полную
первую установку и пробные задачи не повторяй.

После установки удали из `<CODEX_HOME>/agents` только устаревшие активные
`enot.toml`, `properliler.toml` и `explorer.toml`, если они остались от
предыдущего пакета Scope Focus; все остальные профили сохрани. Остальные следы прежних версий
обновление не трогает: их убирает только
[LEGACY-CLEANUP.md](../LEGACY-CLEANUP.md) по отдельной просьбе. Новые правила
действуют в новой задаче Codex.
