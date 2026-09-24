# Установка

## Состав

Пакет содержит контракт Scope Focus (`SYSTEM.md`), bootstrap-skill,
Node.js хук `hooks/submit.cjs` с текстом `hooks/submit.txt`, skills
(`goal`, `task-notebook`, `blind-check-cycle`, `blind-double-check-cycle`,
`task-cleanup`, `html-brief`), профиль проверяющего `agents/spotty.md` и
команду `commands/focus.md`. Task Notebook и HTML-отчёты создаются только во
временной папке ОС. Пустых `jev-*`/`mixed-*` стабов из Codex-оригинала здесь
нет — портировать было нечего.

Системный контракт поставляется полем `systemPromptPath` и не требует
SessionStart-хука: Kimi отбрасывает вывод SessionStart-хуков, поэтому locator
Task Notebook доставляется текстом bootstrap-skill. Вывод
UserPromptSubmit-хука виден в TUI на каждый промпт — это ограничение хоста, а
не пакета.

## Требования

Нужны Kimi Code CLI 2.x с поддержкой плагинов, Node.js и модель
`muse-spark` для Spotty (medium effort указывается при вызове через `Agent`).
Поддерживаются macOS, Linux и Windows; в Windows используется только Git
Bash, без PowerShell.

## Первая установка

Установи пакет штатной командой Kimi Code CLI из каталога пакета:

```bash
kimi -p "/plugins install /путь/к/plugins/scope-focus-kimi" --model muse-spark
```

Или открой интерактивный менеджер командой `/plugins`, вкладка Custom,
укажи путь к каталогу пакета. После установки выполни `/reload` или начни
новую сессию — текущая сессия не обновится.

Проверь диагностику:

```bash
kimi -p "/plugins info scope-focus-kimi" --model muse-spark
```

Битых ссылок манифеста быть не должно.

Если системный промпт входит в заказанную установку или обновление, выполни
[его отдельную инструкцию](system-prompt.md) той же ревизии. Иначе его файл
и настройки не меняй.

## Проверка после установки

После установки проверь пакет напрямую на целевой ОС:

```bash
node plugins/scope-focus-kimi/tests/package.test.mjs
```

Затем убедись живьём, что хук выполняется без ошибок: его stdout — текст
`hooks/submit.txt`, exit 0 на строке и ContentPart[]-промпте, ненулевой exit
на пустом вводе. На Windows используй Git Bash. На этом проверка закончена.

Запросы к моделям, пробные задачи, переходы контекста и дополнительные
проверочные процедуры в проверку установки не входят.

## Обновление

Обновление из актуального источника — повторная установка той же командой
`/plugins install` с последующим `/reload`. Сохрани notebook во временной
папке, настройки и остальные плагины. Полную проверку первой установки без
запроса не повторяй; выполни раздел проверки для обновлённых частей.
