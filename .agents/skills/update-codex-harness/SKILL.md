---
name: update-codex-harness
description: "Codex CLI и VS Code-патч заморожены. Check/Update допустимы только после прямой разморозки выбранного компонента владельцем."
---

# Check и Update Codex Harness

Codex-части заморожены до прямой разморозки владельцем; процедуры для них
ниже сохраняются как архивный baseline и не выполняются. Активно Cursor-направление.
Общий статус и границы установки: [INSTALL_FOR_AGENTS.md](../../../INSTALL_FOR_AGENTS.md).

Рабочая база — корень `my-codex-harness`, содержащий этот repo-local skill.
Форк CLI `ARQAWA/codex-harness` заморожен, находится во временном архиве,
не является активной частью проекта и исключён из любых работ. До явной
активации, извлечения и разморозки пользователем не читать и не искать его
checkout/архив, не выполнять CLI Check/Update, fetch, build, release, push
или install. Общий запрос на обновление harness не снимает заморозку.
После разморозки использовать фактический восстановленный checkout и его
`AGENTS.md`, `HARNESS.md`, `UPDATING.md`, не прежний путь по предположению.
Штатный CLI Codex App остаётся рабочим инструментом. Extension заморожен.

Extension: `../codex-vscode-harness`, private
`ARQAWA/codex-vscode-harness`, патч Marketplace `openai.chatgpt`.
Разрешай пути относительно рабочей базы, а не случайного cwd. Прочитай
`AGENTS.md`, если он есть, и `HARNESS.md` размороженного выбранного репозитория:
tracked HARNESS задаёт baseline/inventory/evidence.

## Check

Запрос проверить обновления разрешает чтение локального состояния и official
metadata активного выбранного компонента. Получи stable
Marketplace version и official download metadata `openai.chatgpt` отдельно
для `darwin-arm64` и `win32-x64`, исключая prerelease. Сравни с tracked upstream
baselines, а не custom package version. Версии сравнивай числовыми компонентами,
не строками. Недоступная metadata означает неизвестность, а не актуальность по кэшу.

Верни baseline → найденный stable, version/target, primary
source и результат «новее», «совпадает» или «недоступно/не подтверждено».
Check не делает fetch в рабочие remotes, не скачивает VSIX/бинарники, не меняет
source/settings и не запускает Update. Не добавляй polling/schedule/updater.

## Update

Выполняй только прямо заказанную актуализацию активного компонента. До mutation
прочитай полностью
[Extension UPDATING](../../../../codex-vscode-harness/UPDATING.md).
Следуй его текущему порядку и scope пользователя. Проверка совместимости с
доступным выбранным CLI не разрешает чтение или изменение замороженного форка.

Extension получает перенос узкого патча на exact official stable VSIX
с проверкой реальных якорей до mutation. Сверь app-server и реальное подключение CLI;
development-only setting не доказывает production integration.

Сохрани чужую dirty работу, active Codex home, settings/secrets/данные,
skills/plugins и приложения. Не stash/reset/clean автоматически. Конфликт,
неподтверждённая база или несовместимый интерфейс останавливает зависимую
mutation с конкретной причиной, без скрытого provider/Compact fallback.

Сборка, проверки, commit/push, release и установка выполняются лишь в объёме
текущего поручения и обязательных принятых процедур; skill не выдаёт эти
полномочия. Windows работает через Git Bash. Поставка — Windows 11 VDI x64
и macOS Apple Silicon ARM64. Extension Actions выключены; не включай
их при обычном update. Обновляй HARNESS/UPDATING
вместе с source inventory/evidence; assets публикуются в соответствующие private
Releases, не Git blobs. До сдачи/публикации соблюдай обязательные review gates
управляющего repo.
