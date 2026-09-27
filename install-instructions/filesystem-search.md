# Установка filesystem-search

## Состав

Плагин содержит skill с правилами поиска и context hook. Код и связи ищет
штатный MCP Codebase Memory (CBM), текст и файлы — MCP `tgrep`, синтаксис —
MCP `ast-grep`. Три сервера и их исполняемые файлы устанавливаются отдельно.
Hook передаёт краткое правило MCP-поиска основному агенту при запуске,
возобновлении и сжатии контекста, а субагентам — при создании. Он не ищет,
не индексирует, не запускает процессы и не блокирует инструменты.

## Требования

Нужен Codex с поддержкой MCP и Node.js для hook плагина.
Для [MCP runtime `tgrep`](https://github.com/microsoft/tgrep/blob/main/scripts/agent/README.md)
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
Если задаёшь свой `CBM_CACHE_DIR`, используй один и тот же абсолютный путь
для команд настройки CBM и среды его MCP-процесса; по умолчанию оставь кэш
пользователя.
У CBM `persistence` — параметр отдельного вызова MCP `index_repository`, а
не глобальная настройка. При явном вызове передай `persistence: false`.
Не выполняй `config set persistence`. Автоиндексация использует значение
`false` по умолчанию схемы MCP. Включи её штатной настройкой
`codebase-memory-mcp config set auto_index true`, чтобы CBM строил граф при
подключении MCP. Автоиндексируемые вызовы сохраняют `persistence: false`.
Проверь фактические значения в среде Codex; если они ведут за пределы
пользовательского кэша, сначала исправь именно эту настройку.
Проектная установка `tgrep` создаёт `<repo>/.tgrep-agent/` и здесь не подходит.
Штатный установщик `tgrep` добавляет собственный hook и блок в `AGENTS.md`,
поэтому здесь используется только его официальный MCP runtime.
`ast-grep` MCP постоянный поисковый индекс не создаёт.

## Первая установка

Определи активный Codex home, фактические пути исполняемых файлов и имя
marketplace в поле `name` его `marketplace.json`. Личный marketplace из
`~/.agents/plugins/marketplace.json` Codex обнаруживает автоматически; добавлять
его не нужно. Для другого источника сначала проверь
`codex plugin marketplace list --json` и, если его там ещё нет, подключи
предоставленный пользователем локальный путь или Git URL. Затем установи
плагин из marketplace; синтаксис текущего CLI сверь через `codex plugin --help`:

```bash
codex plugin marketplace list --json
codex plugin marketplace add "<предоставленный локальный путь или Git URL>"
codex plugin add "filesystem-search@<marketplace>"
```

Пропусти `marketplace add`, если источник уже подключён или это личный
marketplace по пути `~/.agents/plugins/marketplace.json`.

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
Если сервер `ast-grep` запускается, но не находит исполняемый `ast-grep` в
среде Codex, задай в активной MCP-записи
`mcp_servers.ast-grep.env.AST_GREP_PATH` с проверенным абсолютным путём к
`ast-grep`.

Возьми [официальный checkout `tgrep`](https://github.com/microsoft/tgrep)
вне рабочего проекта. Скопируй его `scripts/agent/runtime.py` в постоянный
каталог пользователя вне репозитория, например
`~/.local/share/tgrep-agent/codex/runtime.py`. Рядом создай `config.json`:

```json
{
  "root": null,
  "binary": "/абсолютный/путь/к/tgrep",
  "cache_dir": "/абсолютный/путь/к/пользовательскому/.cache/tgrep-agent",
  "index_flags": []
}
```

Подставь реальные пути пользователя. При `root: null` runtime определяет
корень по рабочей папке своего MCP-процесса; это не гарантирует корень
текущего проекта Codex. Зарегистрируй только MCP:

```bash
codex mcp add tgrep -- python3 /абсолютный/путь/к/runtime.py mcp --config /абсолютный/путь/к/config.json
```

При существующей записи `tgrep` обнови только её, не создавая дубля. Если
ранее был установлен отдельный `SessionStart` hook `tgrep`, определи его
принадлежность по событию и команде `tgrep`; удаляй лишь это определение,
а при сомнении остановись. Остальные hooks сохрани. Из пользовательского
`AGENTS.md` удаляй лишь единственную полную
пару `<!-- tgrep-agent:codex:instructions:begin -->` и
`<!-- tgrep-agent:codex:instructions:end -->` вместе с текстом между ними.
При неполных или повторяющихся маркерах останови удаление и сообщи конфликт.
Остальной текст сохрани. Не запускай `install.py install`: он вернёт оба блока.
Первый индексированный MCP-запрос сам запускает штатный сервис и индекс.

Из активного `<active-codex-home>/AGENTS.md` удали **только** прежний блок
от `<!-- BEGIN FILESYSTEM_SEARCH_GLOBAL_ROUTING -->` до
`<!-- END FILESYSTEM_SEARCH_GLOBAL_ROUTING -->` включительно. Если маркеры
неполные или повторяются, останови это удаление и сообщи конфликт.
Весь другой текст сохрани. Этот блок больше
не добавляется: его текст находится в `description` skill.

Уже существующий `<repo>/.codebase-memory/graph.db.zst` CBM может обновлять
при индексации и без нового `persistence: true`. Для каждого известного
затронутого репозитория проверь точный путь и принадлежность экспорта CBM,
затем удали **только** этот файл. Остальное в `.codebase-memory/` сохрани.
Без перечня проектов не обещай очистить неизвестные репозитории.

После настройки перезапусти Codex, чтобы он загрузил новые MCP и skill.
Через штатный Codex app-server получи hook-определения командой `hooks/list`.
Для точных ключей hooks плагина `filesystem-search` возьми возвращённый
`currentHash` и через `config/batchWrite` запиши его в
`hooks.state.<точный ключ>.trusted_hash`; там же установи для этих ключей
`enabled = true`. Сохрани все остальные настройки. В результате `hooks/list`
должен показывать оба hook плагина доверенными и включёнными, без отдельного
hook `tgrep`.
После индексации проверь в известном затронутом репозитории, что старый
`.codebase-memory/graph.db.zst` не появился снова. Не ищи экспорты в других,
неизвестных репозиториях.

## Проверка после установки

На целевой ОС проверь `codex mcp list`: видны `tgrep`,
`codebase-memory-mcp` и `ast-grep`. `install.py doctor` здесь не применяй:
он проверяет также hook и блок `AGENTS.md`, которые в выбранной MCP-only
установке намеренно отсутствуют.

Проверь настройку CBM командой `codebase-memory-mcp config get auto_index`;
она должна вернуть `true`.

Для проверки открой новую локальную задачу Codex из корня выбранного проекта;
если проект находится внутри Git-репозитория, можно открыть её из любой его
папки — `tgrep` определит корень репозитория. Проверь вызов каждого MCP:
поиск текста и файла через `tgrep`, кода и связей через CBM, синтаксиса
через `ast-grep`. Сравни `root`, возвращённый индексированным MCP-поиском
`tgrep`, с корнем проверяемого проекта; при несовпадении сообщи его и не
считай установку готовой для этого проекта. Убедись, что индексы созданы
в пользовательских каталогах выше, а в проверенном проекте не появились
`.tgrep-agent/` и новый
`.codebase-memory/graph.db.zst`. Штатные файлы настроек `tgrep` в
пользовательском home не являются индексом. Проверь отсутствие старых
блоков `filesystem-search` и `tgrep` в активном `AGENTS.md`.

Если `tgrep` возвращает другой `root`, исправь корень задачи: в Codex CLI
запусти её с `-C, --cd <DIR>` для корня проекта, а в Codex Desktop открой
именно этот проект как рабочую папку задачи. Перезапусти Codex и MCP,
создай новую задачу и снова сравни возвращённый `root`. Не задавай постоянный
`root` в общем пользовательском `config.json` `tgrep`: это направит задачи
других проектов в один и тот же корень. Если `root` всё ещё не совпадает,
сообщи несовместимость для этой машины или проекта и не объявляй проверку
успешной.

Через Codex app-server `hooks/list` проверь, что отдельного hook `tgrep` нет,
а hooks плагина `filesystem-search` (`SessionStart`,
`SubagentStart`) доверены, включены и реально выполняются в новой задаче и
при запуске субагента; Node.js должен быть доступен их процессу.
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
Для `tgrep` обнови официальный `runtime.py` в пользовательском каталоге и
исполняемый `tgrep` по процедуре их поставщика, сохрани `config.json` и
MCP-запись с её абсолютными путями. Не запускай `install.py install` или
`doctor`: они требуют отдельный hook и блок `AGENTS.md`. Сохрани параметры CBM и
заданный при необходимости `AST_GREP_PATH` в MCP-записи ast-grep, а также
остальные пользовательские настройки и секреты. Повтори точечное удаление
прежнего блока `FILESYSTEM_SEARCH_GLOBAL_ROUTING` и старого управляемого блока
`tgrep`, если они остались; чужие разделы не меняй. Для известного затронутого
репозитория повтори точечную проверку
и удаление только прежнего `.codebase-memory/graph.db.zst`, если он ещё есть.
После индексации проверь, что файл не появился снова. Не проверяй неизвестные
репозитории.
Перезапусти Codex. Через штатный Codex app-server вызови `hooks/list`, возьми
актуальные `currentHash` и `trustStatus` для hooks плагина `filesystem-search`.
Через `config/batchWrite` установи `enabled = true` для обоих hooks. Обнови
`hooks.state.<точный ключ>.trusted_hash` значением `currentHash` только для
hook, который не помечен как доверенный. Сохрани остальные настройки.
Убедись по результату `hooks/list`, что hooks `SessionStart` и
`SubagentStart` доверены и включены, прежние search guard hooks плагина не
загружаются и отдельного hook `tgrep` нет.
Повтори только проверки затронутых частей.
