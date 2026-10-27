---
name: publish-ccli
description: "Опубликовать новую версию расширения arqawa.ccli (ARQAWA CCLI, codex-cli-vscode/) в Visual Studio Marketplace по прямой просьбе выпустить или опубликовать его."
---

# Публикация ARQAWA CCLI

Триггер: прямая просьба выпустить или опубликовать новую версию расширения
`arqawa.ccli`. Обычная правка `codex-cli-vscode/` публикацию не запускает.
Устройство расширения и общие правила описаны в разделе «Расширение ARQAWA CCLI»
файла [AGENTS.md](../../../AGENTS.md). Описания в Marketplace быть не должно: не
добавляй `description` в `package.json` и README в папку расширения.

## Токен

Токен лежит в связке ключей macOS (login keychain), куда его один раз кладёт
`vsce login arqawa`. В репозитории, файлах и чате его нет; не проси его в чат и
не записывай. Если токена нет или он истёк, остановись и попроси владельца
повторить шаги ниже. Токен живёт не дольше года.

1. Войти на `https://dev.azure.com` под той же учётной записью Microsoft, что у
   издателя `arqawa`; при первом входе создать организацию с предложенными
   значениями.
2. Справа вверху открыть User settings → Personal access tokens → New Token.
3. Name: `vsce`; Organization: `All accessible organizations`; Expiration: до
   года; Scopes: Custom defined → Show all scopes → Marketplace → Manage.
4. Create и скопировать токен.
5. В терминале Mac выполнить `npx --yes @vscode/vsce@latest login arqawa` и
   вставить токен по запросу.

## Публикация

Все команды запускай с актуальным `@vscode/vsce` через `npx --yes
@vscode/vsce@latest`: установленный глобально `vsce` 2.x не годится. Команды
работы в папке расширения выполняй из `codex-cli-vscode/`.

1. `npx --yes @vscode/vsce@latest verify-pat arqawa`. При ошибке остановись:
   токена нет, он истёк или у него нет права Marketplace → Manage.
2. Узнай последнюю опубликованную версию:
   `curl -fsS -X POST 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery' -H 'Content-Type: application/json' -H 'Accept: application/json;api-version=7.1-preview.1' -d '{"filters":[{"criteria":[{"filterType":7,"value":"arqawa.ccli"}]}],"flags":950}'`;
   версии лежат в `results[0].extensions[0].versions[].version`.
3. Подними `version` в `codex-cli-vscode/package.json` выше опубликованной
   (патч-версия, если не заказано другое): Marketplace не принимает повтор.
4. `npm install` в `codex-cli-vscode/`: он ставит встроенный npm в
   `node_modules/`, который попадает в VSIX.
5. Подъём версии меняет файлы репозитория, поэтому перед публикацией каждого
   выпуска пройди обязательный gate финализации
   ([finalize-work](../finalize-work/SKILL.md)). Если менялся `extension.js`,
   выполни ещё `node --check extension.js` (из `codex-cli-vscode/`) и один раз
   `node tests/run.mjs` (из корня репозитория).
6. `npx --yes @vscode/vsce@latest publish --target win32-x64 --skip-license`.
   Токен vsce берёт из связки ключей сам.
7. Повтори запрос из шага 2: новая версия появилась. Marketplace проверяет пакет
   несколько минут, до этого версия может не отображаться.

Commit и push результата выполняй только по отдельной просьбе.
