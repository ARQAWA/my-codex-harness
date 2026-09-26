# Установка filesystem-search

## Состав

Плагин содержит skill с правилами поиска. Код и связи ищет штатный MCP
Codebase Memory (CBM), текст и файлы — MCP `tgrep`, синтаксис — MCP
`ast-grep`. Три сервера и их исполняемые файлы устанавливаются отдельно.
У плагина нет собственных поисковых процессов, обёрток и hooks.

## Требования

Нужен Codex с поддержкой MCP и установленный marketplace этого репозитория.
Для [интеграции `tgrep`](https://github.com/microsoft/tgrep/blob/main/scripts/agent/README.md)
нужны Linux или macOS, Python 3.11+, Git и исполняемый `tgrep` либо Cargo
для его сборки. Её MCP на Windows официально не поддерживается; полный
набор из трёх серверов там не обещается. Для CBM нужен его
[официальный пакет](https://github.com/DeusData/codebase-memory-mcp), для
[`ast-grep` MCP](https://github.com/ast-grep/ast-grep-mcp) — `uvx` и
[`ast-grep`](https://ast-grep.github.io/guide/quick-start/). В Windows
работай только через Git Bash.

Постоянные индексы должны находиться в кэше пользователя: CBM использует
`${CBM_CACHE_DIR:-~/.cache/codebase-memory-mcp}`, `tgrep` —
`${XDG_CACHE_HOME:-~/.cache}/tgrep-agent/<key>/index`. Не направляй
`CBM_CACHE_DIR` или `XDG_CACHE_HOME` в репозиторий либо рабочую папку агента.
У CBM `persistence` — параметр отдельного вызова MCP `index_repository`, а
не глобальная настройка. При явном вызове передай `persistence: false`.
Не выполняй `config set persistence`. Автоиндексация использует значение
`false` по умолчанию схемы MCP. Включи её штатной настройкой
`codebase-memory-mcp config set auto_index true`, чтобы CBM строил граф при
подключении MCP. Автоиндексируемые вызовы сохраняют `persistence: false`.
Проверь фактические значения в среде Codex; если они ведут за пределы
пользовательского кэша, сначала исправь именно эту настройку.
Проектная установка `tgrep` создаёт `<repo>/.tgrep-agent/` и здесь не подходит.
`ast-grep` MCP постоянный поисковый индекс не создаёт.

## Первая установка

Определи активный Codex home, фактические пути исполняемых файлов и имя
подключённого marketplace (`codex plugin marketplace list`). Установи плагин
из него; синтаксис текущего CLI сверь через `codex plugin --help`:

```bash
codex plugin add "filesystem-search@<marketplace>"
```

Установи CBM, `ast-grep`, `uvx` по их официальным инструкциям. Для CBM и
`ast-grep` подходит, например, официальный npm-вариант:

```bash
npm install -g codebase-memory-mcp @ast-grep/cli
codebase-memory-mcp config set auto_index true
codex mcp add codebase-memory-mcp -- codebase-memory-mcp
codex mcp add ast-grep -- uvx --from git+https://github.com/ast-grep/ast-grep-mcp ast-grep-server
```

`uvx` должен быть установлен отдельно. Команды серверов должны быть доступны
самому Codex; если нет, используй их проверенные абсолютные пути в двух
`codex mcp add`. Если запись с тем же именем уже есть, исправь только её
в активном `config.toml` вместо создания дубля. Не задавай `cwd` корнем
плагина. CBM выбирает проект и обновляет граф по своим штатным правилам.

Возьми [официальный checkout `tgrep`](https://github.com/microsoft/tgrep)
вне рабочего проекта и из `scripts/agent` выполни:

```bash
python3 install.py install --agent codex --scope user
```

Если `tgrep` не доступен через `PATH`, добавь
`--binary /абсолютный/путь/к/tgrep`.

Установщик сам создаёт пользовательский MCP `tgrep`, `SessionStart` hook и
свой раздел в пользовательском `AGENTS.md`. Не заменяй его на `tgrep serve .`.
Сохрани штатный раздел и hook `tgrep`.

Из активного `<active-codex-home>/AGENTS.md` удали **только** прежний блок
от `<!-- BEGIN FILESYSTEM_SEARCH_GLOBAL_ROUTING -->` до
`<!-- END FILESYSTEM_SEARCH_GLOBAL_ROUTING -->` включительно. Если маркеры
неполные или повторяются, останови это удаление и сообщи конфликт.
Весь другой текст, в том числе раздел `tgrep`, сохрани. Этот блок больше
не добавляется: его текст находится в `description` skill.

Уже существующий `<repo>/.codebase-memory/graph.db.zst` CBM может обновлять
при индексации и без нового `persistence: true`. Для каждого известного
затронутого репозитория проверь точный путь и принадлежность экспорта CBM,
затем удали **только** этот файл. Остальное в `.codebase-memory/` сохрани.
Без перечня проектов не обещай очистить неизвестные репозитории.

После настройки перезапусти Codex, чтобы он загрузил новые MCP и skill.
После индексации проверь в известном затронутом репозитории, что старый
`.codebase-memory/graph.db.zst` не появился снова. Не ищи экспорты в других,
неизвестных репозиториях.

## Проверка после установки

На целевой ОС проверь `codex mcp list`: видны `tgrep`,
`codebase-memory-mcp` и `ast-grep`. Для `tgrep` выполни из его checkout:

```bash
python3 install.py doctor --agent codex --scope user
```

Проверь настройку CBM командой `codebase-memory-mcp config get auto_index`;
она должна вернуть `true`.

В новой задаче Codex проверь вызов каждого MCP:
поиск текста и файла через `tgrep`, кода и связей через CBM, синтаксиса
через `ast-grep`. Убедись, что индексы созданы в пользовательских каталогах
выше, а в проверенном проекте не появились `.tgrep-agent/` и новый
`.codebase-memory/graph.db.zst`. Штатные файлы настроек `tgrep` в
пользовательском home не являются индексом. Проверь отсутствие старого
блока `filesystem-search` в активном `AGENTS.md`; раздел `tgrep` допустим.
Доверие к штатному `SessionStart` hook `tgrep` проверь через `/hooks`.
Сбой сервера или иной фактический путь индекса сообщи с диагностикой.

## Обновление

Для Git marketplace обнови снимок и повтори установку из того же источника;
для локального — используй обновлённый исходный каталог. Новый marketplace
не добавляй:

```bash
codex plugin marketplace upgrade <marketplace>
codex plugin add "filesystem-search@<marketplace>"
```

Для локального marketplace пропусти `upgrade`, повтори только `add`.
Обнови поставщиков по их официальным процедурам.
Перед перезапуском Codex включи автоиндексацию CBM командой
`codebase-memory-mcp config set auto_index true` и проверь её командой
`codebase-memory-mcp config get auto_index`; значение должно быть `true`.
Для `tgrep` повтори `install --agent codex --scope user` из актуального
официального checkout командой
`python3 install.py install --agent codex --scope user`: установщик сохраняет
свои параметры, если новые не заданы. Если `tgrep` не доступен через `PATH`,
добавь `--binary /абсолютный/путь/к/tgrep`. Сохрани штатные параметры CBM и
остальные пользовательские настройки и секреты. Повтори точечное удаление
прежнего блока `FILESYSTEM_SEARCH_GLOBAL_ROUTING`, если он остался; чужие разделы
не меняй. Для известного затронутого репозитория повтори точечную проверку
и удаление только прежнего `.codebase-memory/graph.db.zst`, если он ещё есть.
После индексации проверь, что файл не появился снова. Не проверяй неизвестные
репозитории.
Убедись, что Codex больше не загружает прежние hooks и wrappers плагина.
Перезапусти Codex и повтори только проверки затронутых частей.
