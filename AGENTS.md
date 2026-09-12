# Рабочая база

Этот репозиторий — рабочая база текущих Scope Focus, Lunatron, Context
Management, каталога четырёх моделей и системного prompt.

Источники правды после импорта:

- `plugins/scope-focus`
- `plugins/lunatron`
- `plugins/context-management`
- `config/codex-model-catalog.json`
- `config/new-model-instructions.md`
- `config/codex-model-catalog-help.txt`

Runtime-копии `~/.codex/plugins/cache` и прежние `~/plugins` отдельны.
Текущий импорт их не меняет. Дальнейшая разработка идёт здесь, установка
выполняется отдельно.

## Baseline

- Scope Focus: `0.0.0+codex.20260911001024`
- Lunatron: `0.0.0+codex.20260911023755`
- Context Management: `0.1.0`

Prompt и каталог отдельных номеров версии не имеют. Snapshot фиксируется Git.

## Политика

Scope Focus задаёт always-on точный scope, глубокое понимание и минимальное
действие. Quality adjectives не расширяют scope.

Goal нужен только для формулирования и native goal. Goal Memory и blind review
опциональны при явном выборе. Goal Compiler и raw bundles — прежний дизайн;
в текущем составе goal skill этого нет.

Main владеет анализом, решениями, диагностикой и приёмкой. Один persistent
luntik готовит bounded информационные факты, один persistent lunatik исполняет
mechanical поручения. `properliler` из Scope Focus — fresh read-only reviewer.

В packaged profiles сейчас указаны:

- `lunatik`: `gpt-5.6-luna/medium`
- `luntik`: `gpt-5.6-luna/max`
- `properliler`: `gpt-5.6-terra/high`

Исторические значения не переносить.

Каталог содержит видимые `gpt-6-astra`, `gpt-5.5`, `gpt-5.6-sol`,
`gpt-5.6-terra`, `gpt-5.6-luna` и скрытые `gpt-reserve`,
`gpt-5.3-codex-spark`, `codex-auto-review`. Настройки читать из JSON. Старые
значения из истории не переносить.

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

## Что означает кастомный каталог моделей

- Основа — дефолтная запись каждой целевой модели из одного установленного
  источника каталога. Astra служит донором только механических возможностей
  взаимодействия с harness; полное клонирование записи Astra запрещено.
- Сохранять индивидуальные свойства модели: slug, имя/описание, базовый prompt
  и personality, список и default effort, весь fast/service-tier режим и его
  описания, лимиты context_window/max_context_window, модальности, модельные
  ограничения и API-доступность. Отсутствие ключа, null и пустое значение не
  считать взаимозаменяемыми.
- Из Astra переносить только явно выделенные harness-поля: протоколы
  shell/apply_patch/web-search, доступные синхронные/асинхронные инструменты,
  Node REPL и его review, tool_mode,
  multi_agent_version/multi_agent_reasoning_effort, управление
  бюджетом/усечением контекста, approvals, collaboration modes и прочие
  отдельные технические model_messages. Клиентский transport use_responses_lite
  относится к этому слою; перенос не доказывает серверную совместимость.
- Контекст разделять: физические лимиты модели сохраняются;
  truncation_policy, effective_context_window_percent и технические
  token_budget/compaction-инструкции берутся у Astra. Не увеличивать лимиты
  модели вслед за донором.
- Смешанные инструкции не копировать целиком: сохранять личный текст модели;
  заменять только явно определённые технические фрагменты о протоколах
  инструментов/контекста. Отдельный model_instructions_file не менять без
  прямого запроса.
- Перед переносом фиксировать явный список JSON-полей/фрагментов для
  копирования. Неизвестные или неоднозначные поля (например, непрозрачный
  comp_hash без подтверждённого смысла) сохранять у получателя до выяснения
  назначения; не выводить смысл только из имени и не копировать все оставшиеся
  поля по умолчанию.
- visibility и priority задаются отдельно по запросу владельца. Визуально
  скрытая модель остаётся записью каталога; скрытие не означает удаление или
  запрет служебного использования.
- Для текущего проекта получатели: gpt-5.5, gpt-5.6-sol, gpt-5.6-terra,
  gpt-5.6-luna. Порядок видимых: gpt-6-astra, gpt-5.5, gpt-5.6-sol,
  gpt-5.6-terra, gpt-5.6-luna. Остальные модели скрыты. Это целевое состояние
  проекта, не утверждение о выполненной установке.
- Кроссплатформенность macOS/Linux/Windows обязательна: обычный JSON и штатные
  пути/механизмы хоста; не переносить абсолютные пути одной ОС в другую.
  В Windows команды установки документируются только для Git Bash.
