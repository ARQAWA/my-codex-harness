---
name: update-codex-harness
description: "Проверить stable обновления или по явному поручению актуализировать приватные Codex CLI и VS Code VSIX-патч из соседних репозиториев. Не устанавливает пакеты автоматически."
---

# Check и Update Codex Harness

Рабочая база — корень `my-codex-harness`, содержащий этот repo-local skill.
CLI: соседний `../codex-harness`, private `ARQAWA/codex-harness`, upstream
`openai/codex`. Extension: `../codex-vscode-harness`, private
`ARQAWA/codex-vscode-harness`, патч Marketplace `openai.chatgpt`.
Разрешай пути относительно рабочей базы, а не случайного cwd. Прочитай AGENTS
и HARNESS обоих repo: tracked HARNESS задаёт baseline/inventory/evidence.

## Check

Запрос проверить обновления разрешает чтение локального состояния и official
metadata. Получи последний stable release `openai/codex` из GitHub, исключая
draft/prerelease, его точный tag и разрешённый полный commit. Получи stable
Marketplace version и official download metadata `openai.chatgpt` отдельно
для `darwin-arm64` и `win32-x64`, исключая prerelease. Сравни с tracked upstream
baselines, а не custom package version. Версии сравнивай числовыми компонентами,
не строками; CLI и Extension независимы. Недоступная metadata или неподтверждённый
tag/commit означает неизвестность, а не актуальность по кэшу.

Верни baseline → найденный stable, tag/commit либо version/target, primary
source и результат «новее», «совпадает» или «недоступно/не подтверждено».
Check не делает fetch в рабочие remotes, не скачивает VSIX/бинарники, не меняет
source/settings и не запускает Update. Не добавляй polling/schedule/updater.

## Update

Выполняй только прямо заказанную актуализацию. До mutation прочитай полностью
[CLI UPDATING](../../../../codex-harness/UPDATING.md) и
[Extension UPDATING](../../../../codex-vscode-harness/UPDATING.md).
Следуй их текущему порядку и scope пользователя. При переносе одного компонента
второй контракт нужен для совместимости и не разрешает обновить второй repo.

CLI получает merge закреплённого stable tag без rebase/переписывания опубликованной
истории. Extension получает перенос узкого патча на exact official stable VSIX
с проверкой реальных якорей до mutation. Сохрани контрактные области по CLI
UPDATING/current inventory: native LCM, отдельная SQLite/миграции, fork/resume,
единый контекст, request purposes и HTTP/WS tier policy, portable runtime closure.
Не дублируй дизайн LCM здесь. Сверь app-server и реальное подключение CLI;
development-only setting не доказывает production integration.

Сохрани чужую dirty работу, active Codex home, settings/secrets/данные,
skills/plugins и приложения. Не stash/reset/clean автоматически. Конфликт,
неподтверждённая база или несовместимый интерфейс останавливает зависимую
mutation с конкретной причиной, без скрытого provider/Compact fallback.

Сборка, проверки, commit/push, release и установка выполняются лишь в объёме
текущего поручения и обязательных принятых процедур; skill не выдаёт эти
полномочия. Windows работает через Git Bash. Поставка — Windows 11 VDI x64
и macOS Apple Silicon ARM64. Extension Actions выключены; CLI производится полностью локально на Mac
по действующему UPDATING, включая Windows x64/MSVC cross build. Actions не
исполняют нашу сборку; imported workflows остаются выключенными. Не включай
их при обычном update. Обновляй HARNESS/UPDATING
вместе с source inventory/evidence; assets публикуются в соответствующие private
Releases, не Git blobs. До сдачи/публикации соблюдай обязательные review gates
управляющего repo.
