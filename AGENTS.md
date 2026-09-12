# Рабочая база

Этот репозиторий — рабочая база текущих Scope Focus, Lunatron, каталога
четырёх моделей и системного prompt.

Источники правды после импорта:

- `plugins/scope-focus`
- `plugins/lunatron`
- `config/codex-model-catalog.json`
- `config/new-model-instructions.md`
- `config/codex-model-catalog-help.txt`

Runtime-копии `~/.codex/plugins/cache` и прежние `~/plugins` отдельны.
Текущий импорт их не меняет. Дальнейшая разработка идёт здесь, установка
выполняется отдельно.

## Baseline

- Scope Focus: `0.0.0+codex.20260911001024`
- Lunatron: `0.0.0+codex.20260911023755`

Prompt и каталог отдельных номеров версии не имеют. Snapshot фиксируется Git.

## Политика

Scope Focus задаёт always-on точный scope, глубокое понимание и минимальное
действие. Quality adjectives не расширяют scope.

Goal нужен только для формулирования и native goal. Goal Memory и blind review
опциональны при явном выборе. Goal Compiler и raw bundles — прежний дизайн;
в текущем составе goal skill этого нет.

Main владеет анализом, решениями, диагностикой и приёмкой. Один persistent
lunatik исполняет mechanical поручения. `properliler` из Scope Focus — fresh
read-only reviewer.

В packaged profiles сейчас указаны:

- `lunatik`: `gpt-5.6-luna/high`
- `properliler`: `gpt-5.6-terra/high`

Исторические `medium/low` не применять.

Каталог содержит `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`,
`gpt-5.6-luna`. Настройки читать из JSON. Старые значения из истории не
переносить.

Общая execution policy работает без Goal. Не добавлять router, state, toggle
или enforcement вместо prompt.

Обычная проверка — чтение и логика. Эмпирические проверки выполнять только по
прямому запросу или конкретно принятой процедуре.

Сохранять пользовательские изменения. В migration без запроса не менять
location, format или value секретов.

Tritron и Lunatron не смешивать в runtime. Tritron не входит в этот snapshot.

Новая версия, установка, архивы и cleanup не следуют из обычного редактирования.
Порядок release описан в `.agents/skills/release/SKILL.md`.

## История

Исходная задача: `codex://threads/01a05da5-dee5-7123-89ba-d91eca52159f`.
Справка о причинах: `/Users/arkadijcukavin/Downloads/harness_sources/focus-scope-sopilot-approved-design-chronology.md`.
Эти источники исторические и не являются current authority; chronology не
содержит всех поздних изменений.

Главные отменённые идеи: Goal как единственное место policy, worker как
самостоятельный designer или auditor, исторические модели, имена и номера
версий.

Не переносить прежние многократные review или cleanup одного релиза в каждый
будущий запуск.
