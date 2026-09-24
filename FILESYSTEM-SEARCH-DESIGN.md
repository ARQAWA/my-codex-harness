# Filesystem Search — дизайн и история

Дизайн-файл плагина `filesystem-search`. Описывает только этот плагин и его
необходимые внешние контракты. Общие правила репозитория — в `AGENTS.md`.

## Концепция

Обязательная маршрутизация discovery: tgrep для обычного текста, direct read
или rg для strict-current, ast-grep для синтаксиса, Codebase Memory CLI для
связей. Skill — единственная точка маршрутизации; выбирается один достаточный
backend.

Единая root-дисциплина для всех scoped-инструментов:

- Root каждого wrapper обязан равняться `canon(process.cwd())` — каталогу
  запуска текущей сессии, а не git-корню; проекты без git — штатный случай.
- Denylist: `os.homedir()`, `<codex-home>`, корень ФС. Нарушение — exit `2`.
- Scope — только существующие root-relative пути; `.` — осознанный
  project-wide запрос.
- Root-правило живёт только в wrappers (`scripts/root-guard.cjs` — один
  источник правды для всех wrappers). PreToolUse payload не содержит `cwd`,
  поэтому hook root не проверяет.
- Guard hook (`hooks/fssearch-guard.cjs`, matcher `^shell$`) работает по
  executable-токенам без парсинга путей и гонит рискованные операции через
  wrappers: прямой `tgrep serve/index`, CBM `index_repository` / `allow-root` /
  install-команды / bare server, прямой `ast-grep`/`sg` кроме help/version —
  deny. Read-only вызовы (CBM `cli` без index, `config`, help/version) —
  allow без вывода.

Индексы не живут в проектах:

- tgrep: `<codex-home>/tgrep/index/<sha1(realRoot).slice(0,12)>` — чистый hex,
  Windows-safe по построению; привязка индекс→проект читается из `meta.json`.
- CBM: собственное центральное хранилище `~/.cache/codebase-memory-mcp/`
  (hardcoded в CLI; `.codebase-memory/` внутри проекта не создаётся без
  `--persistence`).
- ast-grep и rg stateless — индекса нет.

## Принятые решения

- Wrapper-only вход для ast-grep: каждый реальный вызов — потенциальный обход
  дерева, дешёвого read-only режима нет; поэтому hook блокирует прямой вызов
  целиком, а wrapper добавляет root-гарантию.
- Для CBM read-only CLI разрешён напрямую: без индексации эти вызовы не
  создают состояния и не обходят деревья. Тяжёлая операция — только
  `index_repository`, она закрыта wrapper `cbm-index.cjs` с фиксированным
  `--mode full`.
- Допустимые постоянные процессы — официальный `tgrep serve` и официальный
  CBM daemon (`--cbm-daemon-internal`, watcher по indexed-проектам,
  `auto_index=false` по умолчанию). Это штатный runtime инструментов, а не
  сторонние супервизоры.
- Общий `scripts/root-guard.cjs` для трёх wrappers: гарантирует идентичную
  дисциплину вместо копий.

## Отклонённые решения

- Парсинг путей/cwd в hook: payload без `cwd`; любой путь-парсинг в hook —
  дыры и ложные срабатывания. Root-правило остаётся в wrappers.
- Перемещение хранилища CBM в `<codex-home>`: расположение `~/.cache`
  hardcoded в CBM CLI, настройки `data_dir` нет. Централизация уже есть;
  достаточно root-дискиплины.
- Отключение или замена официального CBM daemon: «Runtime не перепроектируй».
- Полный запрет прямого `rg`/strict-current чтения: strict-current текст —
  заказанный маршрут вне индексов.

## История

- 2026-09: исходный wrapper tgrep с грамматикой опций, rg-роутингом и
  lifecycle; per-repo индекс `<root>/.tgrep`.
- 2026-09-24 (инцидент): агент проиндексировал `$HOME` (5 ГБ, ~15 часов CPU)
  и `~/.codex` через tgrep. Принято: центральный индекс
  `<codex-home>/tgrep/index/<hash>`, root = canonical session cwd + denylist,
  guard hook против прямого `tgrep serve/index`, удаление per-repo `.tgrep`.
- 2026-09-24: распространение той же дисциплины на все инструменты плагина.
  Факты исследования: CBM CLI принимает любой `--repo-path` (встроенно
  блокирует только home и корень тома), хранит графы центрально в
  `~/.cache/codebase-memory-mcp/`, порождает официальный daemon; ast-grep
  stateless и принимает любые пути. Принято: общий `root-guard.cjs`, wrappers
  `ast-grep-search.cjs` и `cbm-index.cjs`, allowlist-модель hook, честная
  фиксация CBM daemon в документации вместо прежнего «нет permanent watcher».
