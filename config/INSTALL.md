# Каталог моделей и общие инструкции

## Состав

- `codex-model-catalog.json` задаёт модели и их возможности.
- `new-model-instructions.md` задаёт общие правила работы агента.

Codex читает только копии этих файлов из пользовательской папки `.codex`.
Исходные файлы этого каталога остаются source of truth и не подключаются
напрямую.

## Требования

Нужны Codex, папка `~/.codex` и право записи в неё. В Windows используй
только Git Bash.

## Первая установка

Скопируй оба файла в целевые копии:
Выполняй команды из каталога, где лежит этот INSTALL.md.

```bash
cp codex-model-catalog.json ~/.codex/codex-model-catalog.json
cp new-model-instructions.md ~/.codex/new-model-instructions.md
```

В корне `~/.codex/config.toml` укажи абсолютные пути именно к этим копиям:

```toml
model_catalog_json = "/Users/arkadijcukavin/.codex/codex-model-catalog.json"
model_instructions_file = "/Users/arkadijcukavin/.codex/new-model-instructions.md"
```

## Проверка после установки

Прочитай обе целевые копии и `~/.codex/config.toml`. Оба ключа должны
указывать на файлы в `~/.codex`, а не на файлы исходного репозитория.

## Обновление

Снова скопируй оба source-файла в те же целевые копии, сохрани остальные
настройки `config.toml` и повтори проверку после установки.
