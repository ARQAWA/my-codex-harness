# Модели reviewer и сложных форков Lunatron

**Статус:** согласовано

## Сценарии

Для сложной задачи Lunatron Main выбирает форк по таблице:

| Модель и effort Main | Сложный форк |
| --- | --- |
| Sol `low` | Sol `low` |
| Sol `medium` | Sol `medium` |
| Sol `high` и выше | Sol `high` |
| Astra `low` | Sol `low` |
| Astra `medium` | Sol `medium` |
| Astra `high` и выше | Sol `high` |
| Luna, любой effort | Та же модель Luna с `xhigh` |

Для простых задач Lunatron используется роль Lunatik на модели Luna с effort `medium`.
Для Main Sol сохраняется точная модель Sol; для Astra выбирается `gpt-6-sol`.

## Требования

- Reviewer Smarty использует Sol `medium`.
- Каждый сложный форк Luna использует ту же модель Luna с уровнем `xhigh`.
- Для Main на Sol или Astra сложный форк использует тот же effort, если он ниже `high`; при `high` и выше — `high`.
- Для простых задач Lunatron используется роль Lunatik на модели Luna с effort `medium`.

## Критерии готовности

- Для Smarty задан Sol `medium`.
- Сложные форки используют модели и effort из таблицы.
- Простые задачи Lunatron выполняет роль Lunatik на модели Luna с effort `medium`.
