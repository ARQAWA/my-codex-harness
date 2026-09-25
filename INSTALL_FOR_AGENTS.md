# Инструкции установки для агентов

Это единая точка входа для установки и обновления компонентов репозитория.
Используй точную выбранную ревизию и инструкции только заказанных компонентов.
Источники действий установки — этот документ, выбранная инструкция и её явно
указанные зависимости. Репозиторный `AGENTS.md` описывает разработку, находится
вне процедуры установки и не является источником её дополнительных шагов.
Уже подготовленные совместимые зависимости переиспользуй. Остальные компоненты
автоматически не устанавливай.

| Компонент | Инструкция |
|---|---|
| `scope-focus` | [`install-instructions/scope-focus.md`](install-instructions/scope-focus.md) |
| `lunatron` | [`install-instructions/lunatron.md`](install-instructions/lunatron.md) |
| `filesystem-search` | [`install-instructions/filesystem-search.md`](install-instructions/filesystem-search.md) |
| `openai-api-server-via-codex` | [`install-instructions/openai-api-server-via-codex.md`](install-instructions/openai-api-server-via-codex.md) |
| Системный промпт | [`install-instructions/system-prompt.md`](install-instructions/system-prompt.md) |

Системный промпт — отдельный компонент, подключаемый через
`model_instructions_file`. Каталог моделей и версию субагентов определяет
штатный Codex. Прямой `codex plugin add` сам по себе не выполняет инструкции
репозитория.

После выбранного документа сообщи установленную ревизию, пути компонентов,
изменения tooling/config, проверки и оставшиеся блокеры.
