# OpenAI API Server via Codex

## Состав

Vendor-копия [hotchpotch/openai-api-server-via-codex](https://github.com/hotchpotch/openai-api-server-via-codex), upstream commit `f248d96312702b08bd511e610603ecd5023c8efb`, с Go-исходниками, тестами и готовыми сборками. В `internal/app/backend.go` запросы модели `gpt-6-luna` всегда получают исходящий `service_tier = "priority"`; остальные модели сохраняют обычную обработку tier.

## Требования

Нужен Codex с существующей авторизацией ChatGPT и соответствующий бинарник из `components/openai-api-server-via-codex/bin/`. Для пересборки нужен Go 1.23 или новее.

Сборки:

| ОС | Архитектура | Бинарник |
|---|---|---|
| macOS | ARM64 | `bin/darwin-arm64/openai-api-server-via-codex` |
| Linux | x86-64 | `bin/linux-amd64/openai-api-server-via-codex` |
| Windows | x86-64 | `bin/windows-amd64/openai-api-server-via-codex.exe` |

## Первая установка

Выберите сборку для своей ОС. Используйте локальный `~/.codex/auth.json`, уже созданный Codex. Не копируйте файл авторизации или секреты в репозиторий.

Запустите сервер вручную из корня репозитория. Он слушает `127.0.0.1:18080`, использует модель по умолчанию `gpt-6-luna` и upstream `https://chatgpt.com/backend-api/codex`:

```sh
OPENAI_VIA_CODEX_DEFAULT_MODEL=gpt-6-luna ./components/openai-api-server-via-codex/bin/darwin-arm64/openai-api-server-via-codex
```

Для Linux укажите `bin/linux-amd64/...`. В Git Bash на Windows:

```sh
OPENAI_VIA_CODEX_DEFAULT_MODEL=gpt-6-luna ./components/openai-api-server-via-codex/bin/windows-amd64/openai-api-server-via-codex.exe
```

В пользовательском `~/.codex/config.toml` задайте отдельный provider:

```toml
model_provider = "luna_fast_proxy"

[model_providers.luna_fast_proxy]
base_url = "http://127.0.0.1:18080/v1"
wire_api = "responses"
requires_openai_auth = false
```

При выборе этого provider задайте основную модель `gpt-6-luna`. Сохраните текущее значение reasoning. Не включайте глобальный Fast. Авторизацию ChatGPT выполняет прокси через существующий `auth.json`.

Чтобы вернуться к прежней конфигурации, восстановите прежний `model_provider` и настройки модели. Сервер остановите `Ctrl+C` в его терминале.

## Проверка после установки

Проверка бинарника командой `--version` подтверждает только запуск бинарника. Запуск сервера и сообщение о прослушивании адреса подтверждают только старт локального сервера. Они не подтверждают исходящий tier.

Для проверки исходящего запроса нужно отдельно наблюдать payload, принятый тестовым backend: у точной модели `gpt-6-luna` должно быть `service_tier: "priority"`. Не используйте для такой проверки платный запрос без отдельного разрешения. Совместимость всей связки с Codex App не подтверждена интеграционным запуском.

## Обновление

Остановите работающий сервер через `Ctrl+C`, замените бинарник соответствующей платформы на новую сборку и запустите его прежней командой. Чтобы отказаться от прокси, верните прежний `model_provider` в `~/.codex/config.toml` и остановите сервер.

Пересборка из `components/openai-api-server-via-codex` на Go 1.23 или новее:

```sh
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -trimpath -buildvcs=false -ldflags '-X=main.version=f248d963-luna-fast' -o bin/darwin-arm64/openai-api-server-via-codex ./cmd/openai-api-server-via-codex
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -buildvcs=false -ldflags '-X=main.version=f248d963-luna-fast' -o bin/linux-amd64/openai-api-server-via-codex ./cmd/openai-api-server-via-codex
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -buildvcs=false -ldflags '-X=main.version=f248d963-luna-fast' -o bin/windows-amd64/openai-api-server-via-codex.exe ./cmd/openai-api-server-via-codex
```
